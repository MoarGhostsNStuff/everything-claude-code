#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#5A1F8E"/>
      <stop offset="50%" style="stop-color:#7B2FBE"/>
      <stop offset="100%" style="stop-color:#FF6B35"/>
    </linearGradient>
    <linearGradient id="heart" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FF6B35"/>
      <stop offset="100%" style="stop-color:#FFB088"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="108" fill="url(#bg)"/>
  <g transform="translate(256,240)" filter="url(#glow)">
    <path d="M-85,10 C-85,-35 -35,-50 0,0 C35,-50 85,-35 85,10 C85,50 35,75 0,100 C-35,75 -85,50 -85,10 Z"
          fill="url(#heart)" opacity="0.9"/>
    <text x="0" y="20" text-anchor="middle" font-size="72" fill="white"
          font-weight="bold" font-family="serif" opacity="0.95">∞</text>
  </g>
  <text x="256" y="400" text-anchor="middle" font-size="42" fill="white"
        font-weight="600" font-family="-apple-system,sans-serif" opacity="0.85"
        letter-spacing="4">UNCONDITIONAL</text>
</svg>`;

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), SVG_ICON);

async function generatePngs() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.log('sharp not installed. SVG saved to icons/icon.svg — convert manually.');
    return;
  }

  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
  const svgBuffer = Buffer.from(SVG_ICON);

  for (const size of sizes) {
    const out = path.join(iconsDir, `icon-${size}.png`);
    await sharp(svgBuffer).resize(size, size).png().toFile(out);
    console.log(`Generated icon-${size}.png`);
  }
  console.log('All icons generated.');
}

generatePngs().catch(console.error);
