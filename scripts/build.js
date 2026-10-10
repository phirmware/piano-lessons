// Copies the static app into dist/ for deployment (no bundling needed).
import { cp, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}dist`;

await rm(out, { recursive: true, force: true });
await mkdir(out);
for (const path of ['index.html', 'src', 'fonts']) {
  await cp(`${root}${path}`, `${out}/${path}`, { recursive: true });
}
console.log('Built dist/');
