// Audyn — catégories gérées : liste déroulante (fiche, création, import d'une chaîne), panneau « Catégories », textes.
// node web/tests/test_audyn_categories_web.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const i18n = read('lib/i18n.js');
for (const k of ['ayCatOpen', 'ayCatTitle', 'ayCatHelp', 'ayCatAdd', 'ayCatNewPh', 'ayCatNewOpt', 'ayCatNone', 'ayCatEmpty', 'ayCatCount', 'ayCatRename', 'ayCatDel', 'ayCatDelAsk']) {
  assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, `texte ${k} dans les 3 langues`);
}
const comp = read('components/AudynCategories.js');
assert.match(comp, /call\('\/studio\/audyn\/categories'\)/, 'liste lue');
assert.match(comp, /call\('\/studio\/audyn\/categories', \{ method: 'POST'/, 'création');
assert.match(comp, /call\(`\/studio\/audyn\/categories\/\$\{edit\.id\}`, \{ method: 'PATCH'/, 'renommage');
assert.match(comp, /call\(`\/studio\/audyn\/categories\/\$\{c\.id\}`, \{ method: 'DELETE' \}\)/, 'suppression');
assert.match(comp, /if \(!confirm\(t\('ayCatDelAsk'\)/, 'suppression confirmée');
assert.match(comp, /<option value="">\{t\('ayCatNone'\)\}<\/option>/, '« Sans catégorie »');
assert.match(comp, /<option value=\{NEW\}>\{t\('ayCatNewOpt'\)\}<\/option>/, '« Nouvelle catégorie… »');
assert.match(comp, /const free = typing \|\| \(cats !== null && !known\)/, 'ancienne catégorie hors liste : champ libre');
assert.match(comp, /dir="auto"/, 'noms en arabe ou en français');
const item = read('app/studio/(module-audyn)/audyn/[id]/page.js');
assert.match(item, /<AudynCategoryPicker id="ay-item-cat" value=\{f\.category\}/, 'fiche du contenu : liste déroulante');
assert.doesNotMatch(item, /field\('category'/, 'plus de champ libre seul sur la fiche');
const list = read('app/studio/(module-audyn)/audyn/page.js');
assert.match(list, /<AudynCategoryPicker id="ay-new-cat"/, 'création : liste déroulante');
assert.match(list, /\{cats && <AudynCategoryManager onChange=\{reload\} \/>\}/, 'panneau « Catégories »');
assert.match(list, /category: '' \}\)/, 'catégorie envoyée à la création');
const ch = read('components/AudynChannelImport.js');
assert.match(ch, /<AudynCategoryPicker id="ay-ch-cat"/, 'import d\'une chaîne : liste déroulante');
assert.match(read('app/back.css'), /\.ay-cat-list > li \{[^}]*flex-wrap: wrap/, 'liste lisible sur téléphone');
console.log('test_audyn_categories_web : OK');
