// Renders the PWA icons from public/icons/icon.svg. Run: node scripts/make-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg');
await sharp(svg).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(svg).resize(512, 512).png().toFile('public/icons/icon-512.png');
// Maskable: shrink the sigil into the safe zone on a full-bleed background.
const inner = await sharp(svg).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0b0a09' } })
  .composite([{ input: inner, gravity: 'centre' }])
  .png()
  .toFile('public/icons/icon-maskable-512.png');
console.log('icons written');
