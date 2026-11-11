// Audit 11/2026 (P3) — app/back.css n'est chargé que sur /studio et /admin.
// Ce test échoue si une classe qui n'existe QUE dans back.css est utilisée par une page du site public
// (elle s'afficherait sans style) : il faut alors déplacer sa règle de back.css vers globals.css.
// node web/tests/test_css_back.mjs   (depuis la racine du dépôt ou depuis web/)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(path.join(web, 'package.json'));
const postcss = require(require.resolve('postcss', { paths: [path.join(web, 'node_modules/next/node_modules'), path.join(web, 'node_modules')] }));

const walk = (d) => fs.readdirSync(d).flatMap((n) => {
  if (['node_modules', '.next', 'tests', 'public'].includes(n)) return [];
  const p = path.join(d, n);
  return fs.statSync(p).isDirectory() ? walk(p) : (/\.(js|jsx)$/.test(n) ? [p] : []);
});
const src = new Map(walk(web).map((f) => [path.resolve(f), fs.readFileSync(f, 'utf8')]));
const resolve = (f, rel) => { const p = path.resolve(path.dirname(f), rel); for (const c of [p, p + '.js', p + '/index.js', p + '.jsx']) if (src.has(c)) return c; return null; };
const isModuleCard = (f) => /[\\/]modules[\\/][^\\/]+[\\/]module\.js$/.test(f);
// Fichiers importés par un fichier. Dans la fiche d'un module, les écrans « admin » et « studio » ne sont ouverts que depuis l'administration.
const imports = (f, s) => {
  const out = [];
  for (const line of s.split('\n')) {
    if (isModuleCard(f) && /^\s*(admin|studio)\s*:/.test(line)) continue;
    for (const m of line.matchAll(/(?:from\s+|import\s*\(\s*|require\(\s*)['"](\.[^'"]+)['"]/g)) { const r = resolve(f, m[1]); if (r) out.push(r); }
  }
  if (/require\.context\(\s*'\.\.\/modules'/.test(s)) for (const k of src.keys()) if (isModuleCard(k)) out.push(k);
  return out;
};
const isBack = (f) => /[\\/]app[\\/](admin|studio)[\\/]/.test(f);
const entries = [...src.keys()].filter((f) => (/[\\/]app[\\/]/.test(f) && /[\\/](page|layout|not-found|error|global-error|loading|template|route)\.js$/.test(f)) || /[\\/]middleware\.js$/.test(f));
const front = new Set(); const todo = entries.filter((f) => !isBack(f));
while (todo.length) { const f = todo.pop(); if (front.has(f)) continue; front.add(f); for (const g of imports(f, src.get(f))) todo.push(g); }
assert.ok(front.size > 100, 'pages publiques trouvées');

const frontText = [...front].map((f) => src.get(f)).join('\n');
const frontWords = new Set(frontText.match(/[a-zA-Z_][\w-]*/g) || []);
// Classes construites par le code : préfixe collé à ${…} ou à une concaténation ('kd-l' + n).
const dyn = new Set(); for (const m of frontText.matchAll(/([A-Za-z][\w-]*)(?:\$\{|['"]\s*\+)/g)) dyn.add(m[1]);
const dynLong = [...dyn].filter((p) => p.length >= 2); const dynShort = [...dyn].filter((p) => p.length === 1);
const backOnly = (c) => {
  if (frontWords.has(c) || dynLong.some((p) => c.startsWith(p))) return false;
  if (c.length <= 4 && (/^[a-z]+\d+$/i.test(c) || dynShort.some((p) => c.startsWith(p)))) return false;
  return true;
};

const back = postcss.parse(fs.readFileSync(path.join(web, 'app/back.css'), 'utf8'));
const bad = []; let n = 0;
back.walkRules((r) => {
  let p = r.parent; while (p && p.type === 'atrule') { if (/keyframes|font-face/.test(p.name)) return; p = p.parent; }
  n += 1;
  for (const s of r.selectors) {
    const cls = [...s.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]);
    if (!cls.length || !cls.some(backOnly)) bad.push(s);
  }
});
assert.ok(n > 300, 'back.css contient les styles du Studio et de l’administration');
assert.deepEqual(bad.slice(0, 20), [], 'règles de back.css utilisées par le site public : les déplacer dans globals.css');

for (const f of ['app/admin/layout.js', 'app/studio/layout.js']) assert.match(fs.readFileSync(path.join(web, f), 'utf8'), /import '\.\.\/back\.css'/, `${f} charge back.css`);
assert.doesNotMatch(fs.readFileSync(path.join(web, 'app/layout.js'), 'utf8'), /back\.css/, 'back.css n’est pas chargé sur le site public');
console.log(`css back OK (${n} règles réservées au Studio et à l'administration)`);
