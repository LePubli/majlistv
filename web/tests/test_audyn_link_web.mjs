// Audyn — import du son depuis un lien : écrans du Studio (contenu et liste) et textes.
// node web/tests/test_audyn_link_web.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const i18n = read('lib/i18n.js');
const KEYS = ['ayLinkTitle', 'ayLinkHelp', 'ayLinkAdd', 'ayLinkFr', 'ayLinkNeedRights', 'ayLinkRights', 'ayLinkQueued', 'ayLinkStPending', 'ayLinkStRun', 'ayLinkStDone',
  'ayLinkDoneFr', 'ayLinkStFailed', 'ayLinkStCanceled', 'ayLinkList', 'ayLinkCancel', 'ayLinkCoverJob', 'ayLinkCoverDone', 'ayCoverFromLink', 'ayCoverFromLinkHelp',
  'ayCoverQueued', 'ayNewFromLink', 'ayNewFromLinkHelp', 'ayLinkReading', 'ayLinkNoInfo', 'ayLinkSplit', 'ayLinkParts', 'ayLinkPartsFr', 'ayResplit',
  'ayResplitTitle', 'ayResplitConfirm', 'ayResplitQueued', 'ayResplitDone', 'ayResplitJob'];
for (const k of KEYS) assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, `texte ${k} dans les 3 langues`);

const item = read('app/studio/(module-audyn)/audyn/[id]/page.js');
assert.match(item, /call\(`\/studio\/audyn\/\$\{id\}\/link-imports`, \{ method: 'POST', body: JSON\.stringify\(\{ url: link\.trim\(\), rights: true, audioLang: frLink \? 'fr' : 'original', split: splitLink \}\) \}\)/, 'demande : lien, attestation, voix, découpage');
assert.match(item, /const \[frLink, setFrLink\] = useState\(true\)/, 'voix française cochée d\'origine');
assert.match(item, /disabled=\{!link\.trim\(\) \|\| !rights\}/, 'bouton bloqué sans attestation');
assert.match(item, /if \(!anyActive\) return undefined;\s*const timer = setInterval\(loadJobs, 4000\)/, 'suivi toutes les 4 s seulement s\'il y a une demande en cours');
assert.match(item, /if \(ended\) load\(\);/, 'une demande finie recharge les chapitres');
assert.match(item, /\{it\.canCoverFromLink && \(/, 'bouton « image de la vidéo » seulement avec un chapitre importé');
assert.match(item, /\{j\.active && <button type="button" className="btn ghost sm" onClick=\{\(\) => cancelJob\(j\)\}>/, 'annulation des demandes en cours');
assert.match(item, /dir="ltr"/, 'adresse saisie de gauche à droite (arabe)');
assert.match(item, /const \[splitLink, setSplitLink\] = useState\(true\)/, 'découpage par chapitres coché d\'origine');
assert.match(item, /audioLang: frLink \? 'fr' : 'original', split: splitLink/, 'choix du découpage envoyé');
assert.match(item, /\{c\.sourceUrl && <button className="btn ghost sm" onClick=\{\(\) => resplit\(c\)\}/, '« Redécouper » seulement pour un chapitre importé d\'une vidéo');
assert.match(item, /if \(!rights\) \{ setErr\(t\('ayLinkNeedRights'\)\); return; \}\s*if \(!confirm\(t\('ayResplitConfirm'\)\)\) return;/, 'redécoupage : attestation puis confirmation');
assert.match(read('app/studio/(module-audyn)/audyn/page.js'), /cover: 'auto', split: splitLink/, 'création depuis un lien : découpage transmis');

const list = read('app/studio/(module-audyn)/audyn/page.js');
assert.match(list, /onBlur=\{readLink\}/, 'lien lu dès qu\'on quitte le champ');
assert.match(list, /title: x\.title \|\| r\.data\.title/, 'pré-remplissage sans écraser la saisie');
assert.match(list, /disabled=\{busy \|\| !f\.title\.trim\(\) \|\| \(link\.trim\(\) && !linkRights\)\}/, 'création bloquée sans attestation quand il y a un lien');
assert.match(list, /cover: 'auto'/, 'couverture posée si le contenu n\'en a pas');

assert.match(read('app/back.css'), /\.ay-jobs li\.bad/); assert.doesNotMatch(read('app/globals.css'), /\.ay-jobs/);
console.log('OK — Audyn : import depuis un lien (Studio)');
