// Gera uma versão da página para publicação como Artifact (sem <html>/<head>/<body>).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = head
  .split('\n')
  .filter((l) => /<title>|<script|<link rel="stylesheet"|<link rel="icon"|theme-color/.test(l))
  .join('\n');

writeFileSync(process.argv[2], keep + '\n' + body);
console.log('ok');
