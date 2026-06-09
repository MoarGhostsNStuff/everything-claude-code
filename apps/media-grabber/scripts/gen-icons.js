#!/usr/bin/env node
'use strict';

/* Dependency-free PNG icon generator for the Grab PWA.
 * Draws a rounded-square gradient tile with a white "download" arrow and
 * encodes it as a real PNG using Node's built-in zlib. No canvas, no deps. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'client', 'icons');

// ---- CRC32 (for PNG chunks) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// ---- pixel buffer helpers ----
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function drawIcon(size, { maskable = false } = {}) {
  const px = new Uint8Array(size * size * 4);
  const pad = maskable ? size * 0.12 : 0;           // safe zone for maskable
  const r = (size - pad * 2) * 0.22;                // corner radius
  const top = [124, 92, 255];                        // #7c5cff
  const bot = [79, 70, 229];                          // #4f46e5

  const set = (x, y, rgb, a = 255) => {
    const i = (y * size + x) * 4;
    px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = a;
  };
  const blendWhite = (x, y, a) => {
    const i = (y * size + x) * 4;
    px[i] = lerp(px[i], 255, a); px[i + 1] = lerp(px[i + 1], 255, a);
    px[i + 2] = lerp(px[i + 2], 255, a); px[i + 3] = 255;
  };

  const inRounded = (x, y) => {
    const lo = pad, hi = size - pad;
    if (x < lo || x > hi || y < lo || y > hi) return false;
    const cx = Math.min(Math.max(x, lo + r), hi - r);
    const cy = Math.min(Math.max(y, lo + r), hi - r);
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };

  // Background gradient inside the rounded tile.
  for (let y = 0; y < size; y++) {
    const t = (y - pad) / (size - pad * 2);
    const rgb = [lerp(top[0], bot[0], t), lerp(top[1], bot[1], t), lerp(top[2], bot[2], t)];
    for (let x = 0; x < size; x++) {
      if (inRounded(x, y)) set(x, y, rgb, 255);
      else set(x, y, [0, 0, 0], 0);
    }
  }

  // Download arrow: vertical stem + downward triangle + base line.
  const cx = size / 2;
  const stemW = size * 0.11;
  const stemTop = size * 0.28;
  const stemBot = size * 0.52;
  const headTop = size * 0.46;
  const headBot = size * 0.66;
  const headHalf = size * 0.20;
  const baseTop = size * 0.74;
  const baseBot = size * 0.80;
  const baseHalf = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0;
      // stem
      if (y >= stemTop && y <= stemBot && Math.abs(x - cx) <= stemW / 2) a = 1;
      // arrow head (triangle pointing down)
      if (y >= headTop && y <= headBot) {
        const tt = (y - headTop) / (headBot - headTop);
        const halfW = headHalf * (1 - tt);
        if (Math.abs(x - cx) <= halfW) a = 1;
      }
      // base line (tray)
      if (y >= baseTop && y <= baseBot && Math.abs(x - cx) <= baseHalf) a = 1;
      if (a) blendWhite(x, y, 1);
    }
  }

  return px;
}

function encodePng(size, px) {
  // Add filter byte (0) at the start of each scanline.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(px.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(name, size, opts) {
  const png = encodePng(size, drawIcon(size, opts));
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`  ${name} (${size}×${size}, ${png.length} bytes)`);
}

fs.mkdirSync(OUT, { recursive: true });
console.log('Generating icons →', OUT);
write('icon-192.png', 192, {});
write('icon-512.png', 512, {});
write('icon-maskable-512.png', 512, { maskable: true });
write('apple-touch-icon.png', 180, {});
console.log('Done.');
