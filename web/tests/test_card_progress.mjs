// Progression sur les cartes du thème Premium + garde-fou « jeton » : un appel à /me/… ne doit JAMAIS passer `null` en 3e argument de
// call() (ce qui retire le jeton : 401 en silence, la progression n'apparaît jamais). node web/tests/test_card_progress.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name === '.next' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : /\.(js|jsx)$/.test(e.name) ? [path.join(d, e.name)] : []));
const bad = [];
for (const f of [...walk('web/components'), ...walk('web/app')]) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/call\(\s*(['"`])\/(?:me|studio|admin)\/[^)]*?,\s*\{\},\s*null\s*\)/g)) bad.push(`${f} : ${m[0].slice(0, 70)}`);
}
assert.deepEqual(bad, [], 'appel authentifié sans jeton (3e argument null) :\n' + bad.join('\n'));

const ott = fs.readFileSync('web/components/premium/PmOtt.js', 'utf8');
assert.match(ott, /export function useTalkProgress/, 'hook d\'avancement');
assert.match(ott, /\/me\/progress\?ids=/, 'appelle GET /me/progress');
assert.match(ott, /pm-card-done/, 'pastille « Terminé »');
assert.match(ott, /pct > 0 && !done/, 'pas de barre sur une carte terminée');
const cat = fs.readFileSync('web/components/premium/PmCatalogue.js', 'utf8');
assert.match(cat, /\/me\/series/, 'séries : épisodes terminés du membre');
assert.match(cat, /pct=\{prog\[x\.id\]\?\.pct\}/, 'cartes vidéo : pourcentage réel');
assert.match(cat, /done=\{full\}/, 'cartes série : terminée quand tous les épisodes sont vus');
const css = fs.readFileSync('web/app/skin-premium.css', 'utf8');
assert.match(css, /\.pm-card-done \{[^}]*inset-inline-end/, 'pastille posée en fin de ligne (RTL)');
console.log('OK — test_card_progress');
