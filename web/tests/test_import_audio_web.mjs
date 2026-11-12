// Import — piste audio française de la plateforme d'origine (migration 113) : cases et bouton du Studio.
// node web/tests/test_import_audio_web.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const i18n = read('lib/i18n.js');
const KEYS = ['impAudioOpt', 'impAudioOptHelp', 'impAudioGot', 'impAudioNone', 'impAudioFetchHelp', 'impAudioFetch', 'impAudioStarted', 'impAudioRunning', 'impAudioFailed'];
for (const k of KEYS) assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, `texte ${k} dans les 3 langues`);

// Nouvelle vidéo : la case n'apparaît qu'avec « Importer chez nous », cochée d'origine, et le choix part avec la demande.
const nw = read('app/studio/new/page.js');
assert.match(nw, /const \[frAudio, setFrAudio\] = useState\(true\)/, 'voix française cochée d\'origine');
assert.match(nw, /\{wantImport && \(\s*<div className="fld">\s*<label className="check"><input type="checkbox" checked=\{frAudio\}/, 'case affichée seulement pour un import');
assert.match(nw, /body\.importAudio = frAudio \? 'fr' : 'original'/, 'choix envoyé à l\'API');

// Fiche d'une vidéo : case pour la copie d'une vidéo du catalogue, bouton pour une vidéo déjà importée.
const p = read('components/ImportVideoPanel.js');
assert.match(p, /audioLang: fetchAudio \|\| frAudio \? 'fr' : 'original'/, 'langue envoyée avec la demande');
assert.match(p, /setCanFetchAudio\?\.\(Boolean\(r\.data\.canFetchAudio\)\)/, 'le serveur décide si la voix française est récupérable');
assert.match(p, /\{!canStart && !active && hosted && canFetchAudio && \(/, 'bouton réservé à une vidéo hébergée, sans demande en cours');
assert.match(p, /disabled=\{busy \|\| !rights\} onClick=\{\(\) => start\(true\)\}>\{t\('impAudioFetch'\)\}/, 'déclaration des droits exigée avant de récupérer la voix');
assert.match(p, /imp\.audioUsed === 'fr' \? t\('impAudioGot'\) : t\('impAudioNone'\)/, 'résultat affiché : piste française ou voix d\'origine');
assert.match(p, /imp\.reimport \? t\('impAudioFailed'\) : t\('impFailed'\)/, 'échec de la récupération distingué d\'un échec d\'import');
assert.doesNotMatch(p, /useEffect\(\(\) => \{ refresh(Ref\.current)?\(\); \}/, 'pas de demande au montage du panneau (il est remonté à chaque rendu : boucle)');
assert.match(read('app/studio/[id]/page.js'), /setCanAudio\(Boolean\(r\.data\.canFetchAudio\)\)/, 'la page charge l\'état une fois et le passe au panneau');
assert.match(p, /talk\.source !== 'archive'/, 'archive.org : pas de case (fichier servi tel quel)');

// Spectateur : une vidéo déjà en français ne propose ni version française ni demande.
assert.match(read('modules/dubbing/TalkAudio.js'), /if \(!d \|\| d\.native\) return null;/);
console.log('OK — import : piste audio française (Studio et lecteur)');
