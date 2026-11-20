// Explicit public-file allowlist: never publish backend files, tests or local secrets.
import { cp, mkdir, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, basename } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
// Source photos kept in the repo but not referenced by the site; don't ship them.
const unpublished = new Set([
  'yazan-alzaghloul.jpg',
  'yazan-alzaghloul-transparent.png',
  'yazan-alzaghloul-transparent-v4.png',
  'yazan-hero-400.webp',
  'yazan-hero-enhanced-480.webp',
  'yazan-hero-enhanced-1440.webp',
  'yazan-hero-enhanced-fallback.jpg',
]);
const output = resolve(root, 'site-dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'favicon.png', 'sitemap.xml', 'Yazan-Alzaghloul-CV.pdf', 'og.png']) await copyFile(resolve(root, file), resolve(output, file));
await cp(resolve(root, 'assets'), resolve(output, 'assets'), { recursive: true, filter: source => !source.endsWith('.DS_Store') && !unpublished.has(basename(source)) });
console.log('Public GitHub Pages files prepared in site-dist/');
