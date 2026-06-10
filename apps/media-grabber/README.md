# Grab — Media Downloader (iOS PWA)

Paste a link, get the media onto your iPhone:

- **Audio** → saved to **Files** (share sheet → *Save to Files*)
- **Video** → saved to **Photos** *and* **Files** (share sheet → *Save Video* / *Save to Files*)

A **Progressive Web App** — no App Store, no developer account. Add it to your
Home Screen once and it behaves like a native app.

## What makes it good

Built to match what paid downloaders (4K Video Downloader, SnapDownloader, …) do:

- **Preview before you commit** — title, thumbnail, duration and uploader.
- **Quality & format selection** — pick video resolution (Best / 1080 / 720 / …)
  or audio format (M4A / MP3 / Opus / FLAC).
- **Live progress** — real server-side **percentage, speed and ETA** over SSE,
  then a second bar for the transfer to your phone.
- **Rich files** — audio is tagged with **metadata and embedded cover art**;
  video can **embed subtitles**.
- **History** — recent grabs, one tap to re-run.
- **Two engines** — direct links download on-device with no server; streaming
  sites (YouTube, TikTok, …) use a yt-dlp backend.

## How saving works on iOS

A web app can't write straight into Photos/Files, but the **Web Share API** hands
a file to the native **share sheet**, which has *Save Video* (Photos) and *Save to
Files* built in. Grab downloads the bytes, wraps them in a `File`, and calls
`navigator.share({ files: [...] })`.

```
link → preview → download (server) → transfer to phone → share sheet → Save Video / Save to Files
```

---

## Get it on your phone

### Recommended: one URL, full power — deploy the backend (Render)

The backend **also serves the client**, so a single HTTPS URL gives you the whole
app *including* YouTube/streaming support.

On [Render](https://render.com) (free tier works): **New → Web Service →** connect
this repo, then set:

- **Root Directory:** `apps/media-grabber`
- **Runtime:** Docker · **Dockerfile Path:** `server/Dockerfile`
- **Health Check Path:** `/api/health`

Create it, then:

1. Open the `https://…onrender.com` URL it gives you, on your iPhone in Safari.
2. **Share → Add to Home Screen.**
3. Open ⚙︎ Settings once and set **Backend URL** to that same `onrender.com`
   address (it's also where the app is served from), tap **Test**, **Done**.

> Free Render instances sleep when idle — the first request after a nap takes
> ~30s to wake. Paid instances stay warm.

Prefer Docker? From `apps/media-grabber/`:

```bash
docker build -f server/Dockerfile -t grab .
docker run -p 8080:8080 grab   # http://localhost:8080
```

### Client-only: GitHub Pages (direct links, on-device)

Merging this repo's PR to `main` runs `.github/workflows/pages-grab.yml`, which
publishes the client to **GitHub Pages**:

```
https://moarghostsnstuff.github.io/everything-claude-code/
```

Add that to your Home Screen for instant **direct-link** downloads with no
backend. For streaming sites, set the Render Backend URL in ⚙︎ Settings.

---

## Using it

1. Copy a link.
2. Open Grab, tap **Paste**, choose **Auto / Video / Audio**, tap **Continue**.
3. Review the preview, pick a quality/format, tap **Download**.
4. Tap **Save to my phone** → *Save Video* (Photos) or *Save to Files*.

**Deep link / share target:** `…/?url=https://example.com/video.mp4` auto-starts a
download, and the installed app registers as a share target for links.

---

## Project layout

```
apps/media-grabber/
├── client/                 # the PWA (static, deployable on its own)
│   ├── index.html
│   ├── app.js              # preview, jobs, SSE progress, share-to-save
│   ├── styles.css
│   ├── manifest.webmanifest
│   ├── sw.js               # offline app shell
│   └── icons/              # generated PNG icons
├── server/                 # yt-dlp/ffmpeg backend (also serves the client)
│   ├── server.js
│   ├── server.test.js      # node --test
│   ├── package.json
│   ├── Dockerfile          # node + ffmpeg + atomicparsley + yt-dlp
│   └── render.yaml
└── scripts/gen-icons.js    # dependency-free PNG icon generator
```

Run the backend tests with `cd server && npm test`. Regenerate icons with
`node scripts/gen-icons.js`.

---

## API (backend)

| Route                        | Purpose                                                   |
|------------------------------|-----------------------------------------------------------|
| `GET /api/health`            | Liveness + yt-dlp / ffmpeg versions                       |
| `GET /api/info?url=`         | Preview: title, thumbnail, duration, uploader, qualities  |
| `POST /api/jobs`             | Start a download → `{ id }` (body: url, kind, quality, …) |
| `GET /api/jobs/:id/events`   | SSE stream: status, percent, speed, eta, stage            |
| `GET /api/jobs/:id/file`     | Stream the finished file, then clean up                   |
| `DELETE /api/jobs/:id`       | Cancel + clean up                                         |

Env: `PORT`, `YTDLP_PATH`, `FFMPEG_PATH`, `MAX_ACTIVE_JOBS`, `MAX_BYTES`,
`JOB_TIMEOUT_MS`, `ALLOWED_ORIGINS` (CORS allowlist), `GRAB_ALLOW_LOOPBACK` (tests).

---

## Security & limits

- **SSRF defense:** private/loopback/link-local hosts are rejected, and redirects
  are followed manually and re-validated at every hop (blocks 30x → metadata IP).
- **Command safety:** the URL is always passed after `--`; quality/format/kind are
  allowlisted, so no option injection into yt-dlp.
- **DoS guards:** capped concurrent jobs, JSON body limit, per-job timeout and a
  TTL sweep that deletes stale temp files.
- **Memory:** the client buffers a file before invoking the share sheet, so very
  large videos depend on device memory (fine for typical clips).
- **Legal:** download only content you own or are permitted to. Some sites'
  Terms of Service prohibit downloading — that's on you to respect.
