'use strict';

/* Grab backend — resolves streaming-site links with yt-dlp + ffmpeg and
 * proxies CORS-blocked direct links. Also serves the PWA client so the
 * whole thing runs same-origin (no CORS config needed).
 *
 * Endpoints:
 *   GET /api/health           → { ok, ytdlp }
 *   GET /api/info?url=        → { title, isDirect, duration }
 *   GET /api/proxy?url=       → streams a direct media URL through the server
 *   GET /api/grab?url=&kind=&afmt=  → runs yt-dlp, streams the finished file
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
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS || 10 * 60 * 1000);
const MAX_PROXY_BYTES = Number(process.env.MAX_PROXY_BYTES || 0); // 0 = unlimited

const app = express();
app.use(cors()); // allow the PWA to be hosted elsewhere (e.g. GitHub Pages)

const CLIENT_DIR = path.join(__dirname, '..', 'client');

/* ------------------------------- helpers ------------------------------- */

function badUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return 'Invalid URL.'; }
  if (!/^https?:$/.test(u.protocol)) return 'Only http(s) URLs are allowed.';
  // Block obvious SSRF targets (loopback / link-local / private ranges by hostname).
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local')) return 'Host not allowed.';
  if (/^(127\.|10\.|192\.168\.|169\.254\.|::1$|fc|fd)/.test(host)) return 'Private hosts are not allowed.';
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'Private hosts are not allowed.';
  return null;
}

const DIRECT_EXT = /\.(mp4|m4v|mov|webm|mkv|m4a|mp3|aac|ogg|opus|wav|flac|m3u8)(\?|#|$)/i;

function safeName(name) {
  return (name || 'download').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
}

function contentTypeFor(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const map = {
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
    m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg',
    wav: 'audio/wav', flac: 'audio/flac',
  };
  return map[ext] || 'application/octet-stream';
}

function rmrf(dir) { fs.rm(dir, { recursive: true, force: true }, () => {}); }

/* ------------------------------- /api/health ------------------------------- */

app.get('/api/health', (_req, res) => {
  execFile(YTDLP, ['--version'], { timeout: 5000 }, (err, stdout) => {
    res.json({ ok: !err, ytdlp: err ? null : String(stdout).trim() });
  });
});

/* ------------------------------- /api/info ------------------------------- */

app.get('/api/info', (req, res) => {
  const url = req.query.url;
  const bad = badUrl(url);
  if (bad) return res.status(400).json({ error: bad });

  if (DIRECT_EXT.test(url)) {
    return res.json({ isDirect: true, title: decodeURIComponent(path.basename(new URL(url).pathname)) });
  }
  execFile(YTDLP, ['-J', '--no-warnings', '--', url], { timeout: 30000, maxBuffer: 32 * 1024 * 1024 },
    (err, stdout) => {
      if (err) return res.status(502).json({ error: 'Could not read that link.' });
      try {
        const meta = JSON.parse(stdout);
        res.json({ isDirect: false, title: meta.title || 'video', duration: meta.duration || null });
      } catch {
        res.status(502).json({ error: 'Unexpected metadata from source.' });
      }
    });
});

/* ------------------------------- /api/proxy ------------------------------- */
/* Streams a direct media URL through the server to bypass browser CORS. */

app.get('/api/proxy', async (req, res) => {
  const url = req.query.url;
  const bad = badUrl(url);
  if (bad) return res.status(400).json({ error: bad });

  try {
    const upstream = await fetch(url, { redirect: 'follow' });
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: 'Upstream returned HTTP ' + upstream.status });
    }
    const len = Number(upstream.headers.get('content-length')) || 0;
    if (MAX_PROXY_BYTES && len > MAX_PROXY_BYTES) {
      return res.status(413).json({ error: 'File exceeds server size limit.' });
    }
    const name = safeName(decodeURIComponent(path.basename(new URL(url).pathname)) || 'download');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || contentTypeFor(name));
    if (len) res.setHeader('Content-Length', len);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);

    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise((r) => res.once('drain', r));
      }
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(502).json({ error: 'Proxy failed: ' + (e.message || e) });
    else res.destroy();
  }
});

/* ------------------------------- /api/grab ------------------------------- */
/* Runs yt-dlp into a temp dir, then streams the produced file and cleans up. */

app.get('/api/grab', (req, res) => {
  const url = req.query.url;
  const kind = req.query.kind === 'audio' ? 'audio' : 'video';
  const afmt = ['m4a', 'mp3', 'opus'].includes(req.query.afmt) ? req.query.afmt : 'm4a';
  const bad = badUrl(url);
  if (bad) return res.status(400).json({ error: bad });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grab-'));
  const outTmpl = path.join(dir, '%(title).80B.%(ext)s');

  const args = [
    '--no-playlist', '--no-warnings', '--restrict-filenames',
    '-o', outTmpl,
  ];
  if (kind === 'audio') {
    args.push('-x', '--audio-format', afmt, '--audio-quality', '0');
  } else {
    args.push('-f', 'bv*+ba/b', '--merge-output-format', 'mp4');
  }
  args.push('--', url);

  const child = spawn(YTDLP, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 8192) stderr = stderr.slice(-8192); });

  const killTimer = setTimeout(() => child.kill('SIGKILL'), JOB_TIMEOUT_MS);
  let aborted = false;
  req.on('close', () => { if (!res.writableEnded) { aborted = true; child.kill('SIGKILL'); } });

  child.on('error', (e) => {
    clearTimeout(killTimer); rmrf(dir);
    if (!res.headersSent) res.status(500).json({ error: 'yt-dlp not available: ' + e.message });
  });

  child.on('close', (code) => {
    clearTimeout(killTimer);
    if (aborted) { rmrf(dir); return; }
    if (code !== 0) {
      rmrf(dir);
      const msg = stderr.split('\n').filter(Boolean).pop() || ('yt-dlp exited ' + code);
      if (!res.headersSent) res.status(502).json({ error: msg });
      return;
    }
    let files;
    try { files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile()); }
    catch { files = []; }
    if (!files.length) { rmrf(dir); return res.status(502).json({ error: 'No output produced.' }); }

    const file = path.join(dir, files[0]);
    const stat = fs.statSync(file);
    res.setHeader('Content-Type', contentTypeFor(file));
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName(files[0])}"`);

    const stream = fs.createReadStream(file);
    stream.pipe(res);
    const done = () => rmrf(dir);
    stream.on('close', done);
    stream.on('error', () => { if (!res.headersSent) res.status(500).end(); rmrf(dir); });
  });
});

/* ------------------------------- static client ------------------------------- */

app.use(express.static(CLIENT_DIR, { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIR, 'index.html')));

app.listen(PORT, () => {
  console.log(`Grab backend + client on http://localhost:${PORT}`);
});

module.exports = app;
