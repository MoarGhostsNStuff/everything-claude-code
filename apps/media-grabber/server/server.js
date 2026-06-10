'use strict';

/* Grab backend — premium media downloader API.
 *
 * Architecture (job-based, so the client gets live progress like paid apps):
 *   GET  /api/health              → { ok, ytdlp, ffmpeg }
 *   GET  /api/info?url=           → preview: { title, thumbnail, duration, uploader, isDirect, qualities }
 *   POST /api/jobs                → { id }         (body: { url, kind, quality, afmt, subs })
 *   GET  /api/jobs/:id/events     → SSE stream of { status, percent, speed, eta, stage, title, error }
 *   GET  /api/jobs/:id/file       → streams the finished file, then cleans up
 *   DELETE /api/jobs/:id          → cancel + clean up
 *
 * Direct media links are fetched by the server itself (uniform progress, no
 * CORS). Streaming-site links go through yt-dlp + ffmpeg. Both share the same
 * job/SSE plumbing, so the whole pipeline is verifiable via direct links even
 * where yt-dlp can't run.
 *
 * Also serves the PWA client same-origin.
 */

const express = require('express');
const cors = require('cors');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS || 15 * 60 * 1000);
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS || 30 * 60 * 1000);
const MAX_ACTIVE_JOBS = Number(process.env.MAX_ACTIVE_JOBS || 4);
const MAX_BYTES = Number(process.env.MAX_BYTES || 0); // 0 = unlimited
// Loopback is blocked by default (SSRF). Tests/dev may opt in.
const ALLOW_LOOPBACK = process.env.GRAB_ALLOW_LOOPBACK === '1';

// Optional CORS allowlist (comma-separated origins). Default: open (personal use).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const app = express();
app.use(cors(ALLOWED_ORIGINS.length
  ? { origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)) }
  : {}));
app.use(express.json({ limit: '16kb' }));

const CLIENT_DIR = path.join(__dirname, '..', 'client');
const DIRECT_EXT = /\.(mp4|m4v|mov|webm|mkv|m4a|mp3|aac|ogg|opus|wav|flac|m3u8)(\?|#|$)/i;
const VALID_QUALITY = new Set(['best', '2160', '1440', '1080', '720', '480', '360']);
const VALID_AFMT = new Set(['m4a', 'mp3', 'opus', 'flac']);

/* -------------------------------- guards -------------------------------- */

function validateUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return { error: 'Invalid URL.' }; }
  if (!/^https?:$/.test(u.protocol)) return { error: 'Only http(s) URLs are allowed.' };
  const host = u.hostname.toLowerCase();
  if (!ALLOW_LOOPBACK) {
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) {
      return { error: 'Host not allowed.' };
    }
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return { error: 'Private hosts are not allowed.' };
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return { error: 'Private hosts are not allowed.' };
    if (/^(fc|fd)[0-9a-f]{2}:/i.test(host)) return { error: 'Private hosts are not allowed.' };
  }
  return { url: u.href, isDirect: DIRECT_EXT.test(u.href) };
}

function safeName(name) {
  return String(name || 'download').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'download';
}

function contentTypeFor(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return {
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
    m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg',
    wav: 'audio/wav', flac: 'audio/flac',
  }[ext] || 'application/octet-stream';
}

function which(bin, args, cb) {
  execFile(bin, args, { timeout: 6000 }, (err, stdout) => cb(err ? null : String(stdout).trim()));
}

// Fetch that follows redirects manually, re-validating every hop so a public
// URL can't 30x-redirect us into a private/metadata address (SSRF defense).
async function safeFetch(startUrl, { maxRedirects = 5 } = {}) {
  let url = startUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const v = validateUrl(url);
    if (v.error) throw new Error(v.error);
    const res = await fetch(url, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url).href;
      if (res.body) res.body.cancel().catch(() => {});
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects.');
}

/* -------------------------------- job store -------------------------------- */

const jobs = new Map();

function newJob(fields) {
  const id = crypto.randomBytes(9).toString('base64url');
  const job = {
    id, status: 'starting', percent: 0, speed: null, eta: null, stage: 'preparing',
    title: null, file: null, size: 0, error: null, createdAt: Date.now(),
    proc: null, listeners: new Set(), dir: null, ...fields,
  };
  jobs.set(id, job);
  return job;
}

function emit(job, patch) {
  Object.assign(job, patch);
  const payload = JSON.stringify({
    status: job.status, percent: job.percent, speed: job.speed, eta: job.eta,
    stage: job.stage, title: job.title, size: job.size, error: job.error,
  });
  for (const res of job.listeners) {
    try { res.write(`data: ${payload}\n\n`); } catch { /* client gone */ }
  }
}

function activeCount() {
  let n = 0;
  for (const j of jobs.values()) if (j.status === 'starting' || j.status === 'running') n++;
  return n;
}

function cleanupJob(job) {
  if (job.proc && !job.proc.killed) { try { job.proc.kill('SIGKILL'); } catch { /* noop */ } }
  if (job.dir) fs.rm(job.dir, { recursive: true, force: true }, () => {});
  for (const res of job.listeners) { try { res.end(); } catch { /* noop */ } }
  job.listeners.clear();
}

// Periodic sweep of stale jobs.
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) { cleanupJob(job); jobs.delete(id); }
  }
}, 60 * 1000).unref();

/* -------------------------------- workers -------------------------------- */

async function runDirectJob(job) {
  emit(job, { status: 'running', stage: 'downloading' });
  job.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grab-'));
  const name = safeName(decodeURIComponent(path.basename(new URL(job.url).pathname)) || 'download');
  const dest = path.join(job.dir, name);

  const upstream = await safeFetch(job.url);
  if (!upstream.ok || !upstream.body) throw new Error('Upstream returned HTTP ' + upstream.status);
  const total = Number(upstream.headers.get('content-length')) || 0;
  if (MAX_BYTES && total > MAX_BYTES) throw new Error('File exceeds server size limit.');

  emit(job, { title: name });
  const out = fs.createWriteStream(dest);
  const reader = upstream.body.getReader();
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (job.status === 'cancelled') { out.destroy(); throw new Error('cancelled'); }
    received += value.length;
    if (MAX_BYTES && received > MAX_BYTES) { out.destroy(); throw new Error('File exceeds server size limit.'); }
    if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
    if (total) emit(job, { percent: Math.min(99, Math.round((received / total) * 100)) });
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  finishJob(job, dest);
}

function buildYtdlpArgs(job, outTmpl) {
  const args = ['--no-playlist', '--no-warnings', '--restrict-filenames', '--newline',
    '--progress-template', 'PG|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.status)s',
    '-o', outTmpl, '--embed-metadata'];
  if (job.kind === 'audio') {
    args.push('-x', '--audio-format', job.afmt || 'm4a', '--audio-quality', '0', '--embed-thumbnail');
  } else {
    const q = job.quality && job.quality !== 'best' ? `[height<=${job.quality}]` : '';
    args.push('-f', `bv*${q}+ba/b${q}`, '--merge-output-format', 'mp4');
    if (job.subs) args.push('--embed-subs', '--sub-langs', 'en.*');
  }
  args.push('--', job.url);
  return args;
}

function runYtdlpJob(job) {
  emit(job, { status: 'running', stage: 'fetching' });
  job.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grab-'));
  const outTmpl = path.join(job.dir, '%(title).80B.%(ext)s');
  const proc = spawn(YTDLP, buildYtdlpArgs(job, outTmpl), { stdio: ['ignore', 'pipe', 'pipe'] });
  job.proc = proc;

  let stderr = '';
  let buf = '';
  const onLine = (line) => {
    if (line.startsWith('PG|')) {
      const [, pct, speed, eta, st] = line.split('|');
      emit(job, {
        percent: Math.max(0, Math.min(99, parseFloat(pct) || job.percent)),
        speed: (speed || '').trim() || null,
        eta: (eta || '').trim() || null,
        stage: st === 'finished' ? 'merging' : 'fetching',
      });
    }
  };
  proc.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i).trim()); buf = buf.slice(i + 1); }
  });
  proc.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 8192) stderr = stderr.slice(-8192); });

  const timer = setTimeout(() => proc.kill('SIGKILL'), JOB_TIMEOUT_MS);
  proc.on('error', (e) => { clearTimeout(timer); failJob(job, 'yt-dlp not available: ' + e.message); });
  proc.on('close', (code) => {
    clearTimeout(timer);
    if (job.status === 'cancelled') return;
    if (code !== 0) {
      const msg = stderr.split('\n').map((s) => s.trim()).filter(Boolean).pop() || ('yt-dlp exited ' + code);
      return failJob(job, msg.replace(/^ERROR:\s*/, ''));
    }
    let files = [];
    try { files = fs.readdirSync(job.dir).filter((f) => fs.statSync(path.join(job.dir, f)).isFile()); } catch { /* noop */ }
    if (!files.length) return failJob(job, 'No output produced.');
    finishJob(job, path.join(job.dir, files[0]));
  });
}

function finishJob(job, file) {
  try {
    const stat = fs.statSync(file);
    emit(job, { status: 'ready', stage: 'ready', percent: 100, file, size: stat.size,
      title: job.title || path.basename(file) });
  } catch (e) {
    failJob(job, 'Output missing: ' + e.message);
  }
}

function failJob(job, message) {
  if (job.status === 'ready') return;
  emit(job, { status: 'error', stage: 'error', error: String(message).slice(0, 300) });
  if (job.dir) fs.rm(job.dir, { recursive: true, force: true }, () => {});
}

function startJob(job) {
  const worker = job.isDirect ? runDirectJob(job) : Promise.resolve().then(() => runYtdlpJob(job));
  Promise.resolve(worker).catch((e) => {
    if (job.status === 'cancelled') return;
    failJob(job, e && e.message === 'cancelled' ? 'Cancelled.' : (e && e.message) || String(e));
  });
}

/* -------------------------------- routes -------------------------------- */

app.get('/api/health', (_req, res) => {
  which(YTDLP, ['--version'], (ytdlp) => {
    which(FFMPEG, ['-version'], (ff) => {
      res.json({ ok: !!ytdlp, ytdlp, ffmpeg: ff ? ff.split('\n')[0] : null });
    });
  });
});

app.get('/api/info', (req, res) => {
  const v = validateUrl(req.query.url);
  if (v.error) return res.status(400).json({ error: v.error });

  if (v.isDirect) {
    const name = decodeURIComponent(path.basename(new URL(v.url).pathname)) || 'download';
    const isAudio = /\.(m4a|mp3|aac|ogg|opus|wav|flac)(\?|#|$)/i.test(v.url);
    return res.json({ isDirect: true, title: name, kind: isAudio ? 'audio' : 'video',
      thumbnail: null, duration: null, uploader: null, qualities: ['best'] });
  }
  execFile(YTDLP, ['-J', '--no-warnings', '--no-playlist', '--', v.url],
    { timeout: 45000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) return res.status(502).json({ error: 'Could not read that link.' });
      try {
        const m = JSON.parse(stdout);
        const heights = [...new Set((m.formats || []).map((f) => f.height).filter(Boolean))].sort((a, b) => b - a);
        const qualities = ['best', ...heights.filter((h) => VALID_QUALITY.has(String(h))).map(String)];
        res.json({
          isDirect: false, title: m.title || 'video', kind: 'video',
          thumbnail: m.thumbnail || null, duration: m.duration || null,
          uploader: m.uploader || m.channel || null,
          qualities: [...new Set(qualities)],
        });
      } catch { res.status(502).json({ error: 'Unexpected metadata from source.' }); }
    });
});

app.post('/api/jobs', (req, res) => {
  const { url, kind, quality, afmt, subs } = req.body || {};
  const v = validateUrl(url);
  if (v.error) return res.status(400).json({ error: v.error });
  if (activeCount() >= MAX_ACTIVE_JOBS) return res.status(429).json({ error: 'Server busy — try again shortly.' });

  const job = newJob({
    url: v.url, isDirect: v.isDirect,
    kind: kind === 'audio' ? 'audio' : 'video',
    quality: VALID_QUALITY.has(String(quality)) ? String(quality) : 'best',
    afmt: VALID_AFMT.has(afmt) ? afmt : 'm4a',
    subs: !!subs,
  });
  startJob(job);
  res.status(201).json({ id: job.id });
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Unknown job.' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  // Send current state immediately, then subscribe.
  res.write(`data: ${JSON.stringify({
    status: job.status, percent: job.percent, speed: job.speed, eta: job.eta,
    stage: job.stage, title: job.title, size: job.size, error: job.error,
  })}\n\n`);
  if (job.status === 'ready' || job.status === 'error') return res.end();
  job.listeners.add(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* noop */ } }, 15000);
  req.on('close', () => { clearInterval(ping); job.listeners.delete(res); });
});

app.get('/api/jobs/:id/file', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Unknown job.' });
  if (job.status !== 'ready' || !job.file) return res.status(409).json({ error: 'Not ready.' });

  let stat;
  try { stat = fs.statSync(job.file); }
  catch { cleanupJob(job); jobs.delete(job.id); return res.status(410).json({ error: 'File expired.' }); }
  res.setHeader('Content-Type', contentTypeFor(job.file));
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName(path.basename(job.file))}"`);
  const stream = fs.createReadStream(job.file);
  stream.pipe(res);
  const done = () => { cleanupJob(job); jobs.delete(job.id); };
  stream.on('error', () => { if (!res.headersSent) res.status(500).end(); done(); });
  res.on('close', () => { if (res.writableEnded) done(); });
});

app.delete('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Unknown job.' });
  job.status = 'cancelled';
  cleanupJob(job);
  jobs.delete(job.id);
  res.json({ ok: true });
});

/* -------------------------------- static client -------------------------------- */

app.use(express.static(CLIENT_DIR, { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIR, 'index.html')));

if (require.main === module) {
  // Bind 0.0.0.0 so the container is reachable on PaaS routers (Render, Fly, …).
  app.listen(PORT, '0.0.0.0', () => console.log(`App+Web Media Grabber on http://0.0.0.0:${PORT}`));
}

module.exports = { app, _internal: { validateUrl, safeName, buildYtdlpArgs, contentTypeFor } };
