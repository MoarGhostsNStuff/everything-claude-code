# App+Web Media Grabber (iOS PWA)

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
Files* built in. The app downloads the bytes, wraps them in a `File`, and calls
`navigator.share({ files: [...] })`.

```
link → preview → download (server) → transfer to phone → share sheet → Save Video / Save to Files
```

---

## Get it on your phone

### One-click, full power (recommended)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/MoarGhostsNStuff/everything-claude-code)

One button gives you the **whole app — web UI *and* the yt-dlp backend** (full
YouTube/TikTok/etc.) — at a single HTTPS URL. The root `render.yaml` blueprint
tells Render exactly what to build, so there's nothing to configure.

1. Click the button → sign in to Render (free) → **Apply** the blueprint.
2. When it's live, open the `https://…onrender.com` URL on your iPhone in Safari.
3. **Share → Add to Home Screen.** That icon is your app.
4. First launch only: ⚙︎ Settings → **Backend URL** = that same `onrender.com`
   address → **Test** → **Done**. (It's both the app *and* its backend.)

> Free Render instances sleep when idle — the first request after a nap takes
> ~30s to wake. A paid instance stays warm.

Manual alternative (no blueprint): Render → **New → Web Service →** this repo,
Root Directory `apps/media-grabber`, Dockerfile `server/Dockerfile`, Health Check
`/api/health`.

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

## Can "full mode" be a download-only app (no server)?

Short answer: **no — full mode needs the tiny backend, and that's unavoidable.**

"Full mode" means extracting YouTube/TikTok/etc., which is what `yt-dlp` + `ffmpeg`
do. Those are native programs; they **cannot run inside an iPhone web app**, and a
browser can't fetch from those sites directly (CORS + signed, throttled streams).
So *something* has to run them — that's the backend.

The ways to "install" an app on iOS don't remove that requirement:

- **Add to Home Screen (this app):** real app icon, full-screen, offline shell —
  but it's still web tech, so it can't bundle `yt-dlp`. It calls the backend.
- **TestFlight / a native build:** needs an Apple Developer account ($99/yr), Xcode,
  and review — *and the native app would still call a server for extraction.* More
  work, same backend, not simpler.

So the simplest "full app on your Home Screen" is exactly the one-click above:
deploy the backend once (Render), Add to Home Screen, done. The backend stays
yours and tiny; the icon on your phone is the whole experience. The only true
**no-server** option is the GitHub Pages client, which handles **direct media
links** on-device.

---

## Using it

1. Copy a link.
2. Open the app, tap **Paste**, choose **Auto / Video / Audio**, tap **Continue**.
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
