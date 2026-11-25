// Page vidéo Premium d'après la maquette V22 (24/11) : barre du haut, titre, panneau d'épisodes, parcours, « À découvrir ensuite ».
// Lancement : node web/tests/test_pm_watch.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const i18n = read('lib/i18n.js');
for (const k of ['pmPlayerCrumb', 'pmNextTitle', 'pmJourneyKicker', 'pmJourneyTitle', 'pmJourneySub', 'pmJourneyCta', 'pmShortsSub', 'pmShortsAll', 'pmDiscoverTitle', 'pmDiscoverSub', 'pmDiscoverCta', 'tabDesc', 'pmTabEpisodes', 'pmTabSettings']) {
  assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, `texte ${k} dans les 3 langues`);
}
const talk = read('app/talks/[id]/TalkClient.js');
assert.match(talk, /const pm = skin === 'premium'/, 'mise en page de la maquette réservée au thème Premium');
for (const c of ['pm-wtop', 'pm-wmode', 'pm-weyebrow', 'pm-wsub', 'pm-side-head', 'pm-side-num', 'pm-side-ep', 'pm-side-ok', 'pm-journey']) assert.ok(talk.includes(c), `JSX ${c}`);
assert.match(talk, /nextSec\(pm \? 3 : 8\)/, 'À découvrir ensuite : 3 cartes par défaut en Premium');
assert.match(talk, /feat\('learning'\) && !learnOn/, 'carte « Votre parcours » seulement si Apprendre est actif et que la carte Apprendre de la vidéo est absente');
assert.match(talk, /hasPlayer && !pm && <ActionTile icon=\{ICONS\.cinema\}/, 'le mode cinéma passe dans la barre du haut en Premium (pas de doublon)');
assert.match(talk, /className="wb-back"/, 'lien de retour conservé');
const css = read('app/skin-premium.css');
for (const c of ['.pm-wtop', '.pm-wmode', '.pm-side-num', '.pm-journey', '.wb-next .wb-row', '--pm-serif']) assert.ok(css.includes(c), `CSS ${c}`);
assert.match(talk, /ptab/, 'onglets du panneau latéral');
for (const c of ['pm-ptabs', 'pm-pchap', 'pm-pset']) assert.ok(css.includes(c) , `CSS ${c}`);
assert.match(css, /main\.page\.watch-b > \.seo-extra/, 'extrait SEO placé en bas de la grille');
// Relecture du 25/11 : onglet par défaut stable, une seule analyse IA, transcription conservée, clavier du panneau
assert.match(talk, /const waitIns = hasInsights && !ins\.loaded && tab === ''/, 'pas de bascule Descriptif -> Résumé');
assert.match(talk, /chaptersHost=\{pm \? chapHost : null\}/, 'chapitres du panneau = même instance Insights');
assert.doesNotMatch(talk, /tab="chapters"/, 'plus de 2e instance Insights');
assert.match(talk, /trSeen\.current \|\| current === 'transcript'/, 'transcription gardée montée');
assert.match(talk, /onKeyDown=\{onPtabKey\}/, 'flèches dans les onglets du panneau');
assert.match(read('components/Insights.js'), /createPortal\(chaptersEl, chaptersHost\)/);
assert.match(read('components/Providers.js'), /r\.status === 401 \|\| r\.status === 403\) localStorage\.removeItem\('token'\)\; return null; \}\) \/\/ erreur passagère \(API/, 'jeton gardé si l\'API est indisponible');
console.log('test_pm_watch : OK');
