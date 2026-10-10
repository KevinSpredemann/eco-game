// Depois do build: lista todos os arquivos de dist/ dentro do sw.js (precache offline).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const dist = 'dist';
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(dist, p).split('\\').join('/'));
  }
})(dist);
const list = ['./', ...files.filter((f) => f !== 'sw.js').map((f) => './' + f)];
const hash = createHash('sha1');
for (const f of files) if (f !== 'sw.js') hash.update(readFileSync(join(dist, f)));
const sw = readFileSync(join(dist, 'sw.js'), 'utf8')
  .replace('__VERSION__', hash.digest('hex').slice(0, 10))
  .replace('__PRECACHE__', JSON.stringify(list, null, 2));
writeFileSync(join(dist, 'sw.js'), sw);
console.log(`sw.js: ${list.length} arquivos no cache offline`);
