'use strict';

/* ------------------------------------------------------------------ *
 * Grab — media downloader PWA (client)
 *
 * Two engines:
 *   • Backend configured → everything runs through the job API, which
 *     gives a preview (title/thumbnail), quality selection and live
 *     server-side progress (%, speed, ETA) over SSE. Works for direct
 *     links AND streaming sites (YouTube, …).
 *   • No backend → direct media links download fully on-device.
 *
 * Saving on iOS: the bytes become a File handed to the share sheet via
 * navigator.share — "Save Video" (Photos) for video, "Save to Files"
 * for audio. Fallback: a download link.
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const els = {};
[
  'grabForm', 'url', 'pasteBtn', 'grabBtn',
  'preview', 'thumb', 'previewTitle', 'previewMeta', 'qualityWrap', 'qualityRow',
  'audioFmtWrap', 'audioFmtRow', 'downloadBtn',
  'status', 'barFill', 'statusText', 'statusSub', 'cancelBtn',
  'result', 'resultIcon', 'resultName', 'resultHint', 'saveBtn', 'fallbackLink', 'againBtn',
  'error', 'historyWrap', 'historyList', 'clearHistory',
  'settingsBtn', 'settings', 'backendUrl', 'backendBadge', 'embedSubs',
  'testBackend', 'settingsMsg',
].forEach((id) => { els[id] = $(id); });
els.bar = document.querySelector('.bar');

const DIRECT_EXT = /\.(mp4|m4v|mov|webm|mkv|m4a|mp3|aac|ogg|opus|wav|flac|m3u8)(\?|#|$)/i;
const AUDIO_EXT = /\.(m4a|mp3|aac|ogg|opus|wav|flac)(\?|#|$)/i;
const AUDIO_FORMATS = ['m4a', 'mp3', 'opus', 'flac'];

const config = {
  get backendUrl() { return (localStorage.getItem('backendUrl') || '').replace(/\/+$/, ''); },
  set backendUrl(v) { localStorage.setItem('backendUrl', v || ''); },
  get embedSubs() { return localStorage.getItem('embedSubs') === '1'; },
  set embedSubs(v) { localStorage.setItem('embedSubs', v ? '1' : '0'); },
};

const state = {
  abort: null,        // AbortController for fetch transfers
  es: null,           // EventSource for job progress
  jobId: null,        // active backend job id
  info: null,         // /api/info result
  target: null,       // { url, isDirect, kind }
  selectedQuality: 'best',
  selectedAfmt: 'm4a',
  lastFile: null,
};

/* ------------------------------- helpers ------------------------------- */

function showError(msg) { els.error.textContent = msg; els.error.hidden = false; }
function clearError() { els.error.hidden = true; els.error.textContent = ''; }
function hide(...sections) { sections.forEach((s) => { s.hidden = true; }); }
function show(section) { section.hidden = false; }

function fmtBytes(n) {
  if (!n || n < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
}
function fmtDuration(s) {
  if (!s && s !== 0) return '';
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function parseUrl(raw) {
  let u;
  try { u = new URL(raw.trim()); } catch { throw new Error('That is not a valid URL.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) links are supported.');
  return u;
}

function pickKind(mode, url) {
  if (mode === 'audio' || mode === 'video') return mode;
  if (AUDIO_EXT.test(url)) return 'audio';
  return 'video'; // auto default: sites & video files → video
}

function setProgress(received, total, label, sub) {
  if (total && total > 0) {
    els.bar.classList.remove('indeterminate');
    const pct = Math.min(100, Math.round((received / total) * 100));
    els.barFill.style.width = pct + '%';
    els.statusText.textContent = `${label} · ${pct}%`;
    els.statusSub.textContent = sub != null ? sub : `${fmtBytes(received)} / ${fmtBytes(total)}`;
  } else {
    els.bar.classList.add('indeterminate');
    els.statusText.textContent = label;
    els.statusSub.textContent = sub || '';
  }
}

function resetTransient() {
  if (state.es) { state.es.close(); state.es = null; }
  if (state.abort) { state.abort.abort(); state.abort = null; }
  if (state.jobId && config.backendUrl) {
    // Best-effort cancel so the server frees the slot and temp files.
    fetch(`${config.backendUrl}/api/jobs/${state.jobId}`, { method: 'DELETE', keepalive: true }).catch(() => {});
  }
  state.jobId = null;
}

/* ------------------------------- step 1: continue ------------------------------- */

async function onContinue(e) {
  e.preventDefault();
  clearError();
  resetTransient();
  hide(els.preview, els.result, els.status);

  let u;
  try { u = parseUrl(els.url.value); } catch (err) { showError(err.message); return; }
  const mode = (document.querySelector('input[name="mode"]:checked') || {}).value || 'auto';
  const isDirect = DIRECT_EXT.test(u.href);
  state.target = { url: u.href, isDirect, kind: pickKind(mode, u.href) };

  if (config.backendUrl) {
    await fetchPreview(mode);
  } else if (isDirect) {
    await downloadOnDevice(state.target);
  } else {
    showError('This link needs extraction (YouTube etc.). Add a Backend URL in ⚙︎ Settings to enable it.');
  }
}

async function fetchPreview(mode) {
  show(els.status);
  setProgress(0, 0, 'Reading link…', '');
  state.abort = new AbortController();
  try {
    const res = await fetch(`${config.backendUrl}/api/info?url=${encodeURIComponent(state.target.url)}`,
      { signal: state.abort.signal });
    const info = await res.json();
    if (!res.ok) throw new Error(info.error || ('HTTP ' + res.status));
    state.info = info;
    state.target.kind = mode === 'auto' ? (info.kind || state.target.kind) : mode;
    renderPreview(info);
  } catch (err) {
    if (err.name === 'AbortError') return;
    showError(err.message || String(err));
  } finally {
    state.abort = null;
    hide(els.status);
  }
}

function renderPreview(info) {
  els.previewTitle.textContent = info.title || 'Media';
  const bits = [];
  if (info.uploader) bits.push(info.uploader);
  if (info.duration) bits.push(fmtDuration(info.duration));
  els.previewMeta.textContent = bits.join(' · ');

  if (info.thumbnail) {
    els.thumb.src = info.thumbnail;
    els.thumb.hidden = false;
    els.thumb.onerror = () => { els.thumb.hidden = true; };
  } else {
    els.thumb.hidden = true;
  }

  // Quality chips (video only).
  const isVideo = state.target.kind === 'video';
  els.qualityWrap.hidden = !isVideo;
  els.audioFmtWrap.hidden = isVideo;

  if (isVideo) {
    const opts = (info.qualities && info.qualities.length ? info.qualities : ['best']);
    state.selectedQuality = 'best';
    buildChips(els.qualityRow, opts.map((q) => ({ value: q, label: q === 'best' ? 'Best' : q + 'p' })),
      'best', (v) => { state.selectedQuality = v; });
  } else {
    state.selectedAfmt = 'm4a';
    buildChips(els.audioFmtRow, AUDIO_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() })),
      'm4a', (v) => { state.selectedAfmt = v; });
  }
  show(els.preview);
}

function buildChips(container, items, selected, onPick) {
  container.innerHTML = '';
  items.forEach((it) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (it.value === selected ? ' on' : '');
    b.textContent = it.label;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', it.value === selected ? 'true' : 'false');
    b.addEventListener('click', () => {
      [...container.children].forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-checked', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-checked', 'true');
      onPick(it.value);
    });
    container.appendChild(b);
  });
}

/* ------------------------------- step 2a: backend job ------------------------------- */

async function startBackendJob() {
  hide(els.preview, els.result);
  clearError();
  show(els.status);
  setProgress(0, 0, 'Starting…', '');

  const body = {
    url: state.target.url, kind: state.target.kind,
    quality: state.selectedQuality, afmt: state.selectedAfmt, subs: config.embedSubs,
  };
  let id;
  try {
    const res = await fetch(`${config.backendUrl}/api/jobs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
    id = j.id;
  } catch (err) {
    hide(els.status); showError(err.message || String(err)); return;
  }
  state.jobId = id;
  subscribeJob(id);
}

function subscribeJob(id) {
  const es = new EventSource(`${config.backendUrl}/api/jobs/${id}/events`);
  state.es = es;
  const stageLabel = { preparing: 'Preparing', fetching: 'Fetching from source', downloading: 'Downloading',
    merging: 'Processing', ready: 'Ready', error: 'Error' };

  es.onmessage = (ev) => {
    let s; try { s = JSON.parse(ev.data); } catch { return; }
    if (s.status === 'error') {
      es.close(); state.es = null; hide(els.status);
      showError(s.error || 'Download failed on the server.');
      return;
    }
    if (s.status === 'ready') {
      es.close(); state.es = null;
      transferReadyFile(id, s);
      return;
    }
    const label = stageLabel[s.stage] || 'Working';
    const sub = [s.speed, s.eta ? 'ETA ' + s.eta : null].filter(Boolean).join(' · ');
    setProgress(s.percent || 0, 100, label, sub || (s.title || ''));
  };
  es.onerror = () => {
    // EventSource auto-reconnects; only surface if the job is gone.
    if (es.readyState === EventSource.CLOSED) {
      state.es = null; hide(els.status);
      showError('Lost connection to the server.');
    }
  };
}

async function transferReadyFile(id, s) {
  setProgress(0, 0, 'Saving to phone…', '');
  state.abort = new AbortController();
  try {
    const res = await fetch(`${config.backendUrl}/api/jobs/${id}/file`, { signal: state.abort.signal });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || ('HTTP ' + res.status)); }
    const file = await streamToFile(res, s.title || 'download', state.target.kind, 'Saving to phone');
    state.jobId = null;
    presentResult(file, state.target.kind);
  } catch (err) {
    if (err.name === 'AbortError') return;
    hide(els.status); showError(err.message || String(err));
  } finally {
    state.abort = null;
  }
}

/* ------------------------------- step 2b: on-device ------------------------------- */

async function downloadOnDevice(target) {
  hide(els.preview, els.result); clearError(); show(els.status);
  setProgress(0, 0, 'Connecting…', '');
  state.abort = new AbortController();
  const guessName = decodeURIComponent(new URL(target.url).pathname.split('/').pop() || 'download');
  try {
    const res = await fetch(target.url, { signal: state.abort.signal, mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const file = await streamToFile(res, guessName, target.kind, 'Downloading');
    presentResult(file, target.kind);
  } catch (err) {
    if (err.name === 'AbortError') return;
    hide(els.status);
    showError(config.backendUrl
      ? (err.message || String(err))
      : 'This host blocks direct browser downloads (CORS). Add a Backend URL in ⚙︎ Settings to fetch it server-side.');
  } finally {
    state.abort = null;
  }
}

/* ------------------------------- shared transfer + save ------------------------------- */

async function streamToFile(response, fallbackName, kind, label) {
  const total = Number(response.headers.get('content-length')) || 0;
  const mime = response.headers.get('content-type') || mimeFor(fallbackName, kind);
  const name = filenameFromHeaders(response, ensureExt(fallbackName, mime, kind));
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  setProgress(0, total, label, '');
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); received += value.length;
    setProgress(received, total, label, '');
  }
  return new File([new Blob(chunks, { type: mime })], safeName(name), { type: mime });
}

function filenameFromHeaders(response, fallback) {
  const cd = response.headers.get('content-disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  return fallback;
}
function safeName(n) { return String(n).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 140) || 'download'; }
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
  const ext = mime.includes('mpeg') ? 'mp3' : mime.startsWith('audio') ? 'm4a'
    : mime.includes('webm') ? 'webm' : mime.includes('quicktime') ? 'mov' : 'mp4';
  return `${name}.${ext}`;
}

function presentResult(file, kind) {
  hide(els.status);
  state.lastFile = file;
  const isVideo = file.type.startsWith('video') || (!file.type.startsWith('audio') && kind === 'video');
  els.resultIcon.textContent = isVideo ? '🎞️' : '🎵';
  els.resultName.textContent = file.name;
  els.resultHint.textContent = isVideo
    ? `${fmtBytes(file.size)} · Save Video → Photos, or Save to Files`
    : `${fmtBytes(file.size)} · Save to Files`;

  if (els.fallbackLink.dataset.url) URL.revokeObjectURL(els.fallbackLink.dataset.url);
  const objUrl = URL.createObjectURL(file);
  els.fallbackLink.href = objUrl;
  els.fallbackLink.download = file.name;
  els.fallbackLink.dataset.url = objUrl;

  const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  els.saveBtn.hidden = !canShareFiles;
  els.fallbackLink.hidden = canShareFiles;

  addHistory(state.target.url, file.name, isVideo ? 'video' : 'audio');
  show(els.result);
}

async function saveViaShare() {
  if (!state.lastFile) return;
  try {
    await navigator.share({ files: [state.lastFile], title: state.lastFile.name });
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    showError('Could not open the share sheet — use “Download instead”.');
    els.fallbackLink.hidden = false;
  }
}

/* ------------------------------- history ------------------------------- */

function loadHistory() { try { return JSON.parse(localStorage.getItem('history') || '[]'); } catch { return []; } }
function addHistory(url, name, kind) {
  let h = loadHistory().filter((x) => x.url !== url);
  h.unshift({ url, name, kind, at: Date.now() });
  h = h.slice(0, 12);
  localStorage.setItem('history', JSON.stringify(h));
  renderHistory();
}
function renderHistory() {
  const h = loadHistory();
  els.historyWrap.hidden = h.length === 0;
  els.historyList.innerHTML = '';
  h.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `<span class="hi-icon">${item.kind === 'audio' ? '🎵' : '🎞️'}</span>
      <span class="hi-name"></span>`;
    li.querySelector('.hi-name').textContent = item.name;
    li.addEventListener('click', () => { els.url.value = item.url; els.grabForm.requestSubmit(); });
    els.historyList.appendChild(li);
  });
}

/* ------------------------------- events ------------------------------- */

els.grabForm.addEventListener('submit', onContinue);
els.downloadBtn.addEventListener('click', startBackendJob);
els.saveBtn.addEventListener('click', saveViaShare);
els.againBtn.addEventListener('click', () => {
  hide(els.result); els.url.value = ''; els.url.focus();
});
els.cancelBtn.addEventListener('click', () => { resetTransient(); hide(els.status); els.statusText.textContent = 'Cancelled.'; });
els.clearHistory.addEventListener('click', () => { localStorage.removeItem('history'); renderHistory(); });

els.pasteBtn.addEventListener('click', async () => {
  try { const t = await navigator.clipboard.readText(); if (t) els.url.value = t.trim(); }
  catch { els.url.focus(); }
});

(function handleIncomingUrl() {
  const p = new URLSearchParams(location.search);
  const shared = p.get('url') || p.get('text') || p.get('share');
  if (shared) {
    const m = /(https?:\/\/[^\s]+)/.exec(shared);
    if (m) { els.url.value = m[1]; requestAnimationFrame(() => els.grabForm.requestSubmit()); }
  }
})();

/* ------------------------------- settings ------------------------------- */

els.settingsBtn.addEventListener('click', () => {
  els.backendUrl.value = config.backendUrl;
  els.embedSubs.checked = config.embedSubs;
  els.settingsMsg.textContent = '';
  els.settings.showModal();
});
els.settings.addEventListener('close', () => {
  if (els.settings.returnValue === 'save') {
    config.backendUrl = els.backendUrl.value.trim();
    config.embedSubs = els.embedSubs.checked;
    updateBackendBadge();
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
      ? `✓ Connected · yt-dlp ${j.ytdlp}${j.ffmpeg ? ' · ffmpeg ✓' : ' · ⚠ ffmpeg missing'}`
      : '✗ Reachable but yt-dlp is not installed.';
  } catch { els.settingsMsg.textContent = '✗ Could not reach backend.'; }
});
function updateBackendBadge() {
  els.backendBadge.textContent = config.backendUrl ? '· configured ✓' : '';
}

/* ------------------------------- boot ------------------------------- */

renderHistory();
updateBackendBadge();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
