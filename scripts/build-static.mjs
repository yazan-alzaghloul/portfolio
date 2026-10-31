// Explicit public-file allowlist: never publish backend files, tests or local secrets.
import { cp, mkdir, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'site-dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'favicon.png', 'sitemap.xml', 'Yazan-Alzaghloul-CV.pdf']) await copyFile(resolve(root, file), resolve(output, file));
await cp(resolve(root, 'assets'), resolve(output, 'assets'), { recursive: true, filter: source => !source.endsWith('.DS_Store') });
console.log('Public GitHub Pages files prepared in site-dist/');
