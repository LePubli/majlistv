// Audyn — import d'une chaîne : catégorie propre à chaque vidéo et détail de chaque vidéo avant l'import.
// node web/tests/test_audyn_channel_detail_web.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const i18n = read('lib/i18n.js');
for (const k of ['ayChRowCat', 'ayChRowCatList', 'ayChListCatHelp', 'ayChDetail', 'ayChDetailHide', 'ayChDetailsChecked', 'ayChDetailLoading', 'ayChDetailFailed',
  'ayChDetailRetry', 'ayChDetailOpen', 'ayChDetailLangs', 'ayChDetailFr', 'ayChDetailChapters', 'ayChDetailNoChapters', 'ayChDetailNoDesc']) {
  assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, `texte ${k} dans les 3 langues`);
}
const c = read('components/AudynChannelImport.js');
assert.match(c, /<RowCategory id=\{x\.id\} value=\{rowCat\[x\.id\]\}/, 'menu de catégorie sur chaque ligne');
assert.match(c, /<option value=\{LIST\}>\{t\('ayChRowCatList'\)\}<\/option>/, '« Catégorie de la liste » par défaut');
assert.match(c, /categories, access: o\.access/, 'catégories par vidéo envoyées à l\'import');
assert.match(c, /filter\(\(\[id, v\]\) => sel\.has\(id\) && v !== undefined\)/, 'seulement les vidéos cochées dont la catégorie a été changée');
assert.match(c, /\/studio\/audyn\/listings\/\$\{lid\}\/details/, 'détail demandé au serveur');
assert.match(c, /ids: ids\.slice\(0, MAX_DETAILS\)/, '50 vidéos au plus par demande');
assert.match(c, /e\.detail\?\.status === 'wanted'/, 'suivi tant que des détails sont en cours');
assert.match(c, /if \(r\.data\.status !== 'listing' && first\)/, 'cases cochées une seule fois (le suivi ne les réinitialise pas)');
assert.match(c, /<div className="ay-ch-desc" dir="auto">\{d\.description\}<\/div>/, 'description');
assert.match(c, /d\.chapters\.map/, 'chapitres');
assert.match(c, /langs\.includes\('fr'\)/, 'voix française repérée');
assert.match(c, /rel="noopener noreferrer"/, 'lien vers la vidéo sûr');
assert.match(c, /onRetry=\{\(\) => askDetails\(\[x\.id\], true\)\}/, 'réessayer après un échec');
const css = read('app/back.css');
assert.match(css, /\.ay-ch-desc \{[^}]*white-space: pre-wrap/);
assert.match(css, /@media \(max-width: 520px\) \{ \.ay-ch-ctl, \.ay-ch-detail \{ padding-inline-start: 0; margin-inline-start: 0; \} \}/, 'téléphone : pleine largeur');
console.log('test_audyn_channel_detail_web : OK');
