// Étape D5 (18/11/2026) — adresse d'origine des vidéos et des chapitres audio, affichée seulement dans Studio.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const st = read('app/studio/[id]/page.js');
// Ligne « Source » dans l'étape « Vidéo » (V), juste après l'état de la vidéo, avant le panneau d'import.
const v = st.slice(st.indexOf('<Row letter="V"'), st.indexOf('<Row letter="T"'));
assert.ok(v.indexOf('<SourceLine x={x} t={t} />') > 0 && v.indexOf('<SourceLine') < v.indexOf('<ImportVideoPanel'), 'source dans la ligne Vidéo');
assert.equal((st.match(/<SourceLine /g) || []).length, 1);
assert.match(st, /if \(x\.sourceUrl\) body = /); assert.match(st, /else if \(x\.importedFrom\) body = /); assert.match(st, /else if \(x\.source === 'upload'\) body = t\('srcUpload'\);/);
assert.match(st, /target="_blank" rel="noopener noreferrer nofollow"/, 'lien ouvert dans un nouvel onglet, sans transmettre la page');
const ay = read('app/studio/(module-audyn)/audyn/[id]/page.js');
assert.match(ay, /\{c\.sourceUrl && <a href=\{c\.sourceUrl\} target="_blank" rel="noopener noreferrer nofollow"[^>]*data-testid="chapter-source">/);
// Rien sur le site public : ni la page vidéo ni les vignettes n'utilisent ces champs.
for (const f of ['app/talks/[id]/TalkClient.js', 'components/TalkCard.js', 'app/page.js', 'app/catalogue/CatalogueClient.js']) assert.doesNotMatch(read(f), /importedFrom|sourceUrl/, `${f} : pas d'adresse d'origine`);
const api = fs.readFileSync(new URL('../../api/src/routes/talks.js', import.meta.url), 'utf8');
const me = api.slice(api.indexOf("app.get('/me/talks'"), api.indexOf("app.post('/talks'"));
assert.match(me, /t\.imported_from AS "importedFrom"/); assert.match(me, /r\.sourceUrl = talkSourceUrl\(r\)\?\.url \|\| null;/);
assert.doesNotMatch(api.slice(0, api.indexOf("app.get('/me/talks'")), /imported_from AS "importedFrom"/, 'pas dans les routes publiques');
const i18n = read('lib/i18n.js');
for (const k of ['srcLabel', 'srcExternal', 'srcFile', 'srcImported', 'srcAudioFr', 'srcUpload']) assert.equal((i18n.match(new RegExp(`\\n {4}${k}: `, 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('test_d5_web OK');
