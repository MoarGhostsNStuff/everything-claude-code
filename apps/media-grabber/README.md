# Grab — Media Downloader (iOS PWA)

Paste a link, get the file onto your iPhone:

- **Audio** → saved to **Files** (via the iOS share sheet → *Save to Files*)
- **Video** → saved to **Photos** *and* **Files** (share sheet → *Save Video* / *Save to Files*)

It's a **Progressive Web App** — no App Store, no developer account. Add it to
your Home Screen once and it behaves like a native app.

It works on two levels:

1. **Direct media links** (`.mp4`, `.mov`, `.m4a`, `.mp3`, `.webm`, `.m3u8`, …)
   are downloaded **entirely on-device** in Safari. No server needed.
2. **Streaming sites** (YouTube, TikTok, Instagram, …) need extraction, which
   browsers can't do alone. For those, the app calls an optional **backend**
   that runs [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) + `ffmpeg` and streams
   the finished file back. You point the app at your backend once in Settings.

---

## How saving works on iOS

A web app can't write straight into Photos or Files, but the **Web Share API**
can hand a file to the native **share sheet**, which has *Save Video* (Photos)
and *Save to Files* built in. Grab downloads the bytes, wraps them in a `File`,
and calls `navigator.share({ files: [...] })`. That's the streamlined,
permission-free path — one tap to the exact destinations you asked for.

```
URL ─▶ download bytes ─▶ File ─▶ share sheet ─▶ Save Video / Save to Files
```

---

## Quick start

### Option A — direct links only (zero backend)

Host the `client/` folder as static files (GitHub Pages, Netlify, Cloudflare
Pages, or even `npx serve client`). Open it in Safari on your iPhone → **Share**
→ **Add to Home Screen**. Done. Leave the Backend URL blank in Settings.

> Must be served over **HTTPS** (or `localhost`) — the share sheet and service
> worker require a secure context.

### Option B — full power (YouTube etc.) with the backend

The backend also serves the client, so everything is same-origin.

**Deploy with Docker / Render / Fly:**

```bash
# from apps/media-grabber/
docker build -f server/Dockerfile -t grab .
docker run -p 8080:8080 grab
# open http://localhost:8080
```

Or push to **Render** — the included `server/render.yaml` builds the Dockerfile
and gives you an `https://…onrender.com` URL.

**Run locally (Node), if yt-dlp + ffmpeg are already installed:**

```bash
cd server
npm install
npm start            # http://localhost:8080
```

Then in the app: open **⚙︎ Settings**, set **Backend URL** to your server's
`https://` address, tap **Test**, then **Done**.

---

## Using it

1. Copy a link (Share → Copy, or copy the address).
2. Open Grab, tap **Paste**.
3. Pick **Auto**, **Video**, or **Audio**.
4. Tap **Download**, then **Save** → choose *Save Video* (Photos) or
   *Save to Files*.

**Share-sheet shortcut:** because the PWA registers a `share_target`, once it's
on your Home Screen you can sometimes share a URL straight into it. You can also
deep-link: `https://your-host/?url=https://example.com/video.mp4` auto-starts the
download.

---

## Project layout

```
apps/media-grabber/
├── client/                 # the PWA (static, deployable on its own)
│   ├── index.html
│   ├── app.js              # download + share-sheet logic
│   ├── styles.css
│   ├── manifest.webmanifest
│   ├── sw.js               # offline app shell
│   └── icons/              # generated PNG icons
├── server/                 # optional yt-dlp/ffmpeg backend (also serves client)
│   ├── server.js
│   ├── package.json
│   ├── Dockerfile
│   └── render.yaml
└── scripts/
    └── gen-icons.js        # dependency-free PNG icon generator
```

Regenerate icons with `node scripts/gen-icons.js`.

---

## Endpoints (backend)

| Route                         | Purpose                                          |
|-------------------------------|--------------------------------------------------|
| `GET /api/health`             | Liveness + yt-dlp version                        |
| `GET /api/info?url=`          | Title / whether the link is a direct file        |
| `GET /api/proxy?url=`         | Stream a direct link through the server (CORS)    |
| `GET /api/grab?url=&kind=&afmt=` | Run yt-dlp, stream the finished file           |

`kind` is `video` or `audio`; `afmt` is `m4a` \| `mp3` \| `opus`.

---

## Notes & limits

- **Memory:** the client buffers the file before invoking the share sheet, so
  very large videos depend on the device's available memory. Fine for typical
  clips; multi-GB movies may struggle on older phones.
- **Private/loopback hosts** are rejected by the backend to avoid SSRF.
- **Legal:** only download content you own or are permitted to. Downloading from
  some sites violates their Terms of Service — that's on you to respect.
