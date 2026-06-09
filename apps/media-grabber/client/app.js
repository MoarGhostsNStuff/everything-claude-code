'use strict';

/* ------------------------------------------------------------------ *
 * Grab — on-device media downloader PWA
 *
 * Flow:
 *   1. Direct media links (.mp4/.mp3/.m4a/.webm/.m3u8 …) are fetched
 *      straight from the browser. If CORS blocks the fetch and a
 *      backend is configured, we retry through the backend proxy.
 *   2. Streaming-site links (YouTube, TikTok, …) require the backend,
 *      which runs yt-dlp + ffmpeg and streams the finished file back.
 *   3. The bytes become a File and are handed to the iOS share sheet
 *      via the Web Share API:
 *        - video  → "Save Video" (Photos) and "Save to Files"
 *        - audio  → "Save to Files"
 *      If file-sharing is unavailable we fall back to a download link.
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

const els = {
  form: $('grabForm'),
  url: $('url'),
  pasteBtn: $('pasteBtn'),
  grabBtn: $('grabBtn'),
  status: $('status'),
  bar: document.querySelector('.bar'),
  barFill: $('barFill'),
  statusText: $('statusText'),
  cancelBtn: $('cancelBtn'),
  result: $('result'),
  resultIcon: $('resultIcon'),
  resultName: $('resultName'),
  resultHint: $('resultHint'),
  saveBtn: $('saveBtn'),
  fallbackLink: $('fallbackLink'),
  error: $('error'),
  // settings
  settingsBtn: $('settingsBtn'),
  settings: $('settings'),
  backendUrl: $('backendUrl'),
  audioFormat: $('audioFormat'),
  testBackend: $('testBackend'),
  settingsMsg: $('settingsMsg'),
};

const DIRECT_EXT = /\.(mp4|m4v|mov|webm|mkv|m4a|mp3|aac|ogg|opus|wav|flac|m3u8)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|m3u8)(\?|#|$)/i;

const config = {
  get backendUrl() { return (localStorage.getItem('backendUrl') || '').replace(/\/+$/, ''); },
  set backendUrl(v) { localStorage.setItem('backendUrl', v || ''); },
  get audioFormat() { return localStorage.getItem('audioFormat') || 'm4a'; },
  set audioFormat(v) { localStorage.setItem('audioFormat', v || 'm4a'); },
};

let currentAbort = null;
let lastFile = null;

/* ---------------------------------- UI helpers ---------------------------------- */

function showError(msg) {
  els.error.textContent = msg;
  els.error.hidden = false;
}
function clearError() { els.error.hidden = true; els.error.textContent = ''; }

function setBusy(busy) {
  els.grabBtn.disabled = busy;
  els.status.hidden = !busy;
  els.cancelBtn.hidden = !busy;
  if (busy) { els.result.hidden = true; clearError(); }
}

function setProgress(received, total, label) {
  if (total && total > 0) {
    els.bar.classList.remove('indeterminate');
    const pct = Math.min(100, Math.round((received / total) * 100));
    els.barFill.style.width = pct + '%';
    els.statusText.textContent = `${label} · ${fmtBytes(received)} / ${fmtBytes(total)} (${pct}%)`;
  } else {
    els.bar.classList.add('indeterminate');
    els.statusText.textContent = received ? `${label} · ${fmtBytes(received)}` : label;
  }
}

function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
}

/* ---------------------------------- planning ---------------------------------- */

function plan(rawUrl, mode) {
  let url;
  try { url = new URL(rawUrl.trim()); } catch { throw new Error('That is not a valid URL.'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) links are supported.');

  const isDirect = DIRECT_EXT.test(url.pathname) || DIRECT_EXT.test(url.href);
  const looksVideo = VIDEO_EXT.test(url.href);
  // For direct links we trust the extension; mode "auto" picks video if it looks like video.
  const kind = mode === 'auto' ? (looksVideo || !isDirect ? 'video' : 'audio') : mode;
  return { url: url.href, isDirect, kind };
}

/* ---------------------------------- download paths ---------------------------------- */

async function readStreamToFile(response, filename, mime, label) {
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  setProgress(0, total, label);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    setProgress(received, total, label);
  }
  const blob = new Blob(chunks, { type: mime });
  return new File([blob], filename, { type: mime });
}

function filenameFromHeaders(response, fallback) {
  const cd = response.headers.get('content-disposition') || '';
  const m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
  if (m) { try { return decodeURIComponent(m[1].replace(/"/g, '')); } catch { return m[1]; } }
  return fallback;
}

async function grabDirect(target, signal) {
  const guessName = decodeURIComponent(new URL(target.url).pathname.split('/').pop() || 'download');
  // 1) Try a straight browser fetch (works for same-origin / CORS-enabled hosts).
  try {
    const res = await fetch(target.url, { signal, mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const mime = res.headers.get('content-type') || mimeFor(guessName, target.kind);
    return await readStreamToFile(res, ensureExt(guessName, mime, target.kind), mime, 'Downloading');
  } catch (err) {
    if (signal.aborted) throw err;
    // 2) CORS or network failure → retry via backend proxy if available.
    if (config.backendUrl) return grabViaBackend(target, signal, '/api/proxy');
    throw new Error(
      'This host blocks direct browser downloads (CORS). Add a Backend URL in ⚙︎ Settings to fetch it server-side.'
    );
  }
}

async function grabViaBackend(target, signal, path) {
  if (!config.backendUrl) {
    throw new Error('A Backend URL is required for this link. Open ⚙︎ Settings to add one.');
  }
  const qs = new URLSearchParams({ url: target.url });
  if (path === '/api/grab') { qs.set('kind', target.kind); qs.set('afmt', config.audioFormat); }
  const res = await fetch(`${config.backendUrl}${path}?${qs.toString()}`, { signal });
  if (!res.ok) {
    let detail = 'HTTP ' + res.status;
    try { const j = await res.json(); if (j && j.error) detail = j.error; } catch { /* ignore */ }
    throw new Error('Backend error: ' + detail);
  }
  const mime = res.headers.get('content-type') || mimeFor('media', target.kind);
  const name = filenameFromHeaders(res, ensureExt('media', mime, target.kind));
  return await readStreamToFile(res, name, mime, path === '/api/grab' ? 'Fetching from site' : 'Downloading');
}

function mimeFor(name, kind) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = {
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
    m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg',
    wav: 'audio/wav', flac: 'audio/flac',
  };
  return map[ext] || (kind === 'audio' ? 'audio/mp4' : 'video/mp4');
}

function ensureExt(name, mime, kind) {
  if (/\.[a-z0-9]{2,4}$/i.test(name)) return name;
  const ext = mime.includes('mpeg') ? 'mp3'
    : mime.includes('audio') ? 'm4a'
    : mime.includes('webm') ? 'webm'
    : 'mp4';
  return `${name}.${ext}`;
}

/* ---------------------------------- saving (share sheet) ---------------------------------- */

function presentResult(file, kind) {
  lastFile = file;
  const isVideo = file.type.startsWith('video') || (!file.type.startsWith('audio') && kind === 'video');
  els.resultIcon.textContent = isVideo ? '🎞️' : '🎵';
  els.resultName.textContent = file.name;
  els.resultHint.textContent = isVideo
    ? `${fmtBytes(file.size)} · Save Video → Photos, or Save to Files`
    : `${fmtBytes(file.size)} · Save to Files`;

  // Fallback download link (used if Web Share with files is unavailable).
  if (els.fallbackLink.dataset.url) URL.revokeObjectURL(els.fallbackLink.dataset.url);
  const objUrl = URL.createObjectURL(file);
  els.fallbackLink.href = objUrl;
  els.fallbackLink.download = file.name;
  els.fallbackLink.dataset.url = objUrl;

  const canShareFiles =
    typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  els.saveBtn.hidden = !canShareFiles;
  els.fallbackLink.hidden = canShareFiles;

  els.result.hidden = false;
}

async function saveViaShare() {
  if (!lastFile) return;
  try {
    await navigator.share({ files: [lastFile], title: lastFile.name });
  } catch (err) {
    if (err && err.name === 'AbortError') return; // user dismissed the sheet
    showError('Could not open the share sheet. Use “Download instead”.');
    els.fallbackLink.hidden = false;
  }
}

/* ---------------------------------- main submit ---------------------------------- */

async function onSubmit(e) {
  e.preventDefault();
  const mode = (document.querySelector('input[name="mode"]:checked') || {}).value || 'auto';
  let target;
  try { target = plan(els.url.value, mode); }
  catch (err) { showError(err.message); return; }

  currentAbort = new AbortController();
  setBusy(true);
  setProgress(0, 0, target.isDirect ? 'Connecting…' : 'Asking backend…');

  try {
    const file = target.isDirect
      ? await grabDirect(target, currentAbort.signal)
      : await grabViaBackend(target, currentAbort.signal, '/api/grab');

    if (!file.size) throw new Error('Downloaded 0 bytes — the source may be unavailable.');
    setBusy(false);
    presentResult(file, target.kind);
  } catch (err) {
    setBusy(false);
    if (err && err.name === 'AbortError') { els.statusText.textContent = 'Cancelled.'; return; }
    showError(err.message || String(err));
  } finally {
    currentAbort = null;
  }
}

/* ---------------------------------- events ---------------------------------- */

els.form.addEventListener('submit', onSubmit);
els.saveBtn.addEventListener('click', saveViaShare);
els.cancelBtn.addEventListener('click', () => currentAbort && currentAbort.abort());

els.pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) els.url.value = text.trim();
  } catch {
    els.url.focus();
  }
});

// Share-target / ?url= deep link: prefill and auto-run.
(function handleIncomingUrl() {
  const params = new URLSearchParams(location.search);
  const shared = params.get('url') || params.get('text') || params.get('share');
  if (shared) {
    const match = /(https?:\/\/[^\s]+)/.exec(shared);
    if (match) {
      els.url.value = match[1];
      requestAnimationFrame(() => els.form.requestSubmit());
    }
  }
})();

/* ---------------------------------- settings ---------------------------------- */

els.settingsBtn.addEventListener('click', () => {
  els.backendUrl.value = config.backendUrl;
  els.audioFormat.value = config.audioFormat;
  els.settingsMsg.textContent = '';
  els.settings.showModal();
});

els.settings.addEventListener('close', () => {
  if (els.settings.returnValue === 'save') {
    config.backendUrl = els.backendUrl.value.trim();
    config.audioFormat = els.audioFormat.value;
  }
});

els.testBackend.addEventListener('click', async () => {
  const base = els.backendUrl.value.trim().replace(/\/+$/, '');
  if (!base) { els.settingsMsg.textContent = 'Enter a URL first.'; return; }
  els.settingsMsg.textContent = 'Testing…';
  try {
    const res = await fetch(base + '/api/health', { mode: 'cors' });
    const j = await res.json();
    els.settingsMsg.textContent = j.ok
      ? `✓ Connected. yt-dlp: ${j.ytdlp || 'unknown'}`
      : '✗ Reachable but not healthy.';
  } catch {
    els.settingsMsg.textContent = '✗ Could not reach backend.';
  }
});

/* ---------------------------------- service worker ---------------------------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell is optional */ });
  });
}
