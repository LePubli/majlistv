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
// Import d'une chaîne ou d'une playlist (un contenu par vidéo)
for (const k of ['ayChOpen', 'ayChTitle', 'ayChHelp', 'ayChRead', 'ayChListing', 'ayChFound', 'ayChAll', 'ayChNone', 'ayChSelected', 'ayChAlready', 'ayChPublish', 'ayChRights', 'ayChImport', 'ayChDone', 'ayChSkipped'])
  assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, `texte ${k} dans les 3 langues`);
const ch = read('components/AudynChannelImport.js');
assert.match(ch, /call\('\/studio\/audyn\/listings', \{ method: 'POST'/, 'liste demandée au serveur');
assert.match(ch, /const waiting = r\.data\.status === 'listing' \|\| r\.data\.entries\.some\(\(e\) => e\.detail\?\.status === 'wanted'\);\n\s+if \(waiting\) timer = setTimeout\(tick, 3000\);/, 'suivi pendant la lecture (et les détails demandés), arrêté ensuite');
assert.match(ch, /setSel\(new Set\(r\.data\.entries\.filter\(\(e\) => !e\.inAudyn\)\.map\(\(e\) => e\.id\)\)\)/, 'tout coché sauf ce qui est déjà dans Audyn');
assert.match(ch, /disabled=\{x\.inAudyn\}/, 'déjà dans Audyn : non cochable');
assert.match(ch, /disabled=\{busy \|\| sel\.size === 0 \|\| !o\.rights\}/, 'import bloqué sans attestation ni vidéo cochée');
assert.match(ch, /publish: false, rights: false/, 'publication automatique décochée d\'origine');
assert.match(ch, /fr: true, split: true/, 'voix française et découpage cochés d\'origine');
assert.match(list, /\{chan && <AudynChannelImport onDone=\{reload\} \/>\}/, 'panneau ouvert depuis la page Audyn du Studio');
console.log('OK — Audyn : import depuis un lien (Studio)');

// 13/11 : YouTube qui bloque le serveur — imports en attente signalés, relance des échecs (un par un ou tous).
{
  const list = fs.readFileSync(join(web, 'app/studio/(module-audyn)/audyn/page.js'), 'utf8');
  assert.match(list, /call\('\/studio\/audyn\/link-imports\/failed'\)/);
  assert.match(list, /call\('\/studio\/audyn\/link-imports\/retry-failed', \{ method: 'POST' \}\)/);
  assert.match(list, /failed\?\.waiting > 0 && <p className="error" role="alert">\{t\('ayBlockedWait'\)/);
  const item = fs.readFileSync(join(web, 'app/studio/(module-audyn)/audyn/[id]/page.js'), 'utf8');
  assert.match(item, /j\.status === 'failed' && <button type="button" className="btn ghost sm" onClick=\{\(\) => retryJob\(j\)\}>/);
  const i18n = fs.readFileSync(join(web, 'lib/i18n.js'), 'utf8');
  for (const k of ['ayRetry', 'ayRetryAll', 'ayFailedN', 'ayFailedBlocked', 'ayBlockedWait']) assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, k);
  assert.match(i18n, /Admin → Paramètres → Vidéos YouTube, Vimeo et Dailymotion/, 'nom exact de la section des réglages');
}
