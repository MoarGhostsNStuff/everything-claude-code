# Grab backend: Node + yt-dlp + ffmpeg, serving the PWA client too.
FROM node:20-slim

# ffmpeg (for merging/extracting) and yt-dlp (latest release binary).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl python3 \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install server deps.
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# App code (server + client).
COPY server ./server
COPY client ./client

ENV PORT=8080
EXPOSE 8080
WORKDIR /app/server
CMD ["node", "server.js"]
