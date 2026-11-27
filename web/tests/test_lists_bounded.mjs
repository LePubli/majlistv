// Garde-fou « plus de liste interminable » (bug signalé plusieurs fois) : vérifie que les briques de pagination sont bien branchées.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const kit = read('components/backoffice/Kit.js');
assert.match(kit, /usePaged\(rows, pageSize \|\| PAGE_SIZE/, 'Table du back-office paginée d\'office');
assert.match(kit, /pageSize = PAGE_SIZE/, 'taille de page par défaut');
assert.match(kit, /onRow\(base \+ ri\)/, 'onRow reçoit l\'indice dans la liste complète');

const pager = read('components/Pager.js');
assert.match(pager, /PAGE_SIZE = 25/);

const contents = read('app/studio/contents/page.js');
assert.match(contents, /usePaged\(shown, 25/, 'Studio → Contenus paginé');
assert.match(contents, /pageRows\.every/, '« tout cocher » limité à la page affichée');
assert.equal((contents.match(/<Pager p=\{pg\}/g) || []).length, 2, 'barre de pages dans les deux variantes');
assert.doesNotMatch(contents, /shown\.map\(/, 'jamais toute la liste d\'un bloc');

for (const l of ['studio', 'admin']) assert.match(read(`app/${l}/layout.js`), /<TableGuardMount \/>/, `garde-fou monté dans ${l}`);
assert.match(read('components/TableGuard.js'), /const SIZE = 25/);

const css = read('app/skin-premium-admin.css');
assert.match(css, /td:first-child:has\(input\[type="checkbox"\]\)/, 'colonne des cases à cocher étroite');
assert.match(css, /\.bm-table-scroll \{ max-width: 100%/, 'tableau jamais plus large que son cadre');
assert.match(read('app/back.css'), /tr\[hidden\] \{ display: none !important; \}/);

// i18n : 3 langues
const i18n = read('lib/i18n.js');
for (const k of ['pgRange', 'pgPrev', 'pgNext', 'pgSize', 'pgLabel']) assert.equal((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, k);
console.log('OK — test_lists_bounded');
