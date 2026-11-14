// Crops the illustration area of each painted card from the design-pack plates and writes
// public/art/cards/<ID>.webp, plus src/ui/artManifest.json (the ids that have real art).
// Any <ID>.webp you drop into public/art/cards yourself is picked up too.
// Run: node scripts/prepare-art.mjs
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cfg = JSON.parse(readFileSync('scripts/art-crops.json', 'utf8'));
mkdirSync(cfg.outDir, { recursive: true });
for (const c of cfg.crops) {
  const src = join(cfg.plateDir, c.plate);
  if (!existsSync(src)) {
    console.warn(`missing ${src}, skipped ${c.ids.join(', ')}`);
    continue;
  }
  const buf = await sharp(src)
    .extract({ left: c.x, top: c.y, width: c.w, height: c.h })
    .resize({ width: cfg.width, kernel: 'lanczos3' })
    .webp({ quality: 82 })
    .toBuffer();
  for (const id of c.ids) writeFileSync(join(cfg.outDir, `${id}.webp`), buf);
  console.log(`${c.ids.join(' + ')}  <-  ${c.plate}  (${c.title})`);
}
const ids = readdirSync(cfg.outDir).filter((f) => /^(CR|BS|FIN|MAN)-\d\d\.webp$/.test(f)).map((f) => f.replace('.webp', '')).sort();
writeFileSync('src/ui/artManifest.json', `${JSON.stringify(ids)}\n`);
console.log(`${ids.length} cards have art`);
