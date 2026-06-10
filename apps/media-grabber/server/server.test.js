'use strict';

/* Tests for the Grab backend.
 *   node --test server.test.js
 * Unit-tests the pure guards/builders, then drives a full job lifecycle
 * (create → SSE → file → cleanup) against a local upstream. yt-dlp itself
 * isn't exercised (no network/binary needed) but shares this same plumbing. */

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

// Loopback must be allowed so the integration test can fetch its own upstream.
process.env.GRAB_ALLOW_LOOPBACK = '1';
const { app, _internal } = require('./server');
const { validateUrl, safeName, buildYtdlpArgs, contentTypeFor } = _internal;

/* ------------------------------- unit ------------------------------- */

test('validateUrl rejects non-http and bad input', () => {
  assert.equal(validateUrl('not a url').error !== undefined, true);
  assert.equal(validateUrl('ftp://x/y').error !== undefined, true);
  assert.equal(validateUrl('').error !== undefined, true);
});

test('validateUrl flags direct media extensions', () => {
  assert.equal(validateUrl('https://h.test/a/b.mp4').isDirect, true);
  assert.equal(validateUrl('https://h.test/a/b.m4a?x=1').isDirect, true);
  assert.equal(validateUrl('https://youtube.com/watch?v=x').isDirect, false);
});

test('validateUrl blocks private hosts when loopback disallowed', () => {
  const saved = process.env.GRAB_ALLOW_LOOPBACK;
  // Re-require with a fresh module registry to pick up the env flag off.
  delete process.env.GRAB_ALLOW_LOOPBACK;
  delete require.cache[require.resolve('./server')];
  const fresh = require('./server')._internal;
  assert.ok(fresh.validateUrl('http://127.0.0.1/x').error);
  assert.ok(fresh.validateUrl('http://localhost/x').error);
  assert.ok(fresh.validateUrl('http://10.0.0.5/x').error);
  assert.ok(fresh.validateUrl('http://192.168.1.1/x').error);
  assert.ok(fresh.validateUrl('http://169.254.1.1/x').error);
  assert.ok(fresh.validateUrl('http://172.16.0.1/x').error);
  assert.ok(!fresh.validateUrl('https://example.com/x').error);
  process.env.GRAB_ALLOW_LOOPBACK = saved;
  delete require.cache[require.resolve('./server')];
});

test('safeName strips unsafe characters and truncates', () => {
  assert.equal(safeName('a/b\\c:d*?.mp4'), 'a_b_c_d_.mp4');
  assert.equal(safeName(''), 'download');
  assert.equal(safeName('x'.repeat(300)).length <= 120, true);
});

test('contentTypeFor maps extensions', () => {
  assert.equal(contentTypeFor('a.mp4'), 'video/mp4');
  assert.equal(contentTypeFor('a.m4a'), 'audio/mp4');
  assert.equal(contentTypeFor('a.mp3'), 'audio/mpeg');
  assert.equal(contentTypeFor('a.unknown'), 'application/octet-stream');
});

test('buildYtdlpArgs: audio embeds metadata + thumbnail, url passed safely after --', () => {
  const args = buildYtdlpArgs({ kind: 'audio', afmt: 'mp3', url: 'https://h.test/v' }, '/tmp/o.%(ext)s');
  assert.ok(args.includes('-x'));
  assert.equal(args[args.indexOf('--audio-format') + 1], 'mp3');
  assert.ok(args.includes('--embed-thumbnail'));
  assert.ok(args.includes('--embed-metadata'));
  assert.equal(args[args.length - 2], '--');           // separator guards against option injection
  assert.equal(args[args.length - 1], 'https://h.test/v');
});

test('buildYtdlpArgs: video quality maps to a height filter', () => {
  const best = buildYtdlpArgs({ kind: 'video', quality: 'best' }, '/tmp/o.%(ext)s');
  assert.ok(best.some((a) => a === 'bv*+ba/b'));
  const hd = buildYtdlpArgs({ kind: 'video', quality: '720' }, '/tmp/o.%(ext)s');
  assert.ok(hd.some((a) => a.includes('height<=720')));
  assert.ok(hd.includes('--merge-output-format'));
  const subs = buildYtdlpArgs({ kind: 'video', quality: 'best', subs: true }, '/tmp/o.%(ext)s');
  assert.ok(subs.includes('--embed-subs'));
});

/* ------------------------------- integration ------------------------------- */

test('full job lifecycle: create → ready → file → cleanup', async (t) => {
  // Local upstream serving a fake media file.
  const payload = Buffer.alloc(131072, 7);
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': payload.length });
    res.end(payload);
  });
  await new Promise((r) => upstream.listen(0, r));
  const upPort = upstream.address().port;

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const mediaUrl = `http://127.0.0.1:${upPort}/clip.mp4`;

  t.after(() => { server.close(); upstream.close(); });

  // info
  const info = await (await fetch(`${base}/api/info?url=${encodeURIComponent(mediaUrl)}`)).json();
  assert.equal(info.isDirect, true);
  assert.equal(info.kind, 'video');

  // create job
  const created = await fetch(`${base}/api/jobs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: mediaUrl, kind: 'video' }),
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.ok(id);

  // poll until ready via the file endpoint (job completes near-instantly)
  let fileRes;
  for (let i = 0; i < 50; i++) {
    fileRes = await fetch(`${base}/api/jobs/${id}/file`);
    if (fileRes.status === 200) break;
    await new Promise((r) => setTimeout(r, 50));
    fileRes.body?.cancel?.();
  }
  assert.equal(fileRes.status, 200);
  const buf = Buffer.from(await fileRes.arrayBuffer());
  assert.equal(buf.length, payload.length);

  // consumed → cleaned up → 404
  const after = await fetch(`${base}/api/jobs/${id}/file`);
  assert.equal(after.status, 404);
});

test('POST /api/jobs rejects invalid url', async (t) => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/jobs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'ftp://nope' }),
  });
  assert.equal(res.status, 400);
});
