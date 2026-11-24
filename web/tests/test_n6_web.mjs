// Étape N6 (16/11) — Page vidéo : 3 onglets sous le lecteur (À propos · Mes notes · Questions), un seul bouton « Ma liste »,
// fin de vidéo toujours dans le même ordre (quiz → que faire → épisode suivant).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const tc = read('app/talks/[id]/TalkClient.js');

// Onglets
const tabsBlock = tc.slice(tc.indexOf('  const tabs = ['), tc.indexOf('];', tc.indexOf('  const tabs = [')));
assert.deepEqual([...tabsBlock.matchAll(/key: '([a-z]+)'/g)].map((x) => x[1]), ['summary', 'desc', 'notes', 'ask', 'transcript', 'about'], 'Résumé · Descriptif · Notes · Questions · Transcription · À propos (dernier)');
assert.match(tc, /useState\(''\)/, 'on arrive sur le premier onglet disponible');
assert.match(tc, /\{tabs\.length > 1 && <div className="tablist"/, 'pas de barre pour un seul onglet');
// Résumé (Insights), descriptif, transcription à la demande, À propos = fiche technique seulement
assert.match(tc, /<div id="panel-summary"[\s\S]*?<Insights/, 'Résumé = Insights');
assert.match(tc, /<div id="panel-desc"[\s\S]*?about-text/, 'Descriptif = texte de la vidéo');
const about = tc.slice(tc.indexOf('<div id="panel-about"'), tc.indexOf("{current === 'ask'"));
assert.match(about, /className="details"/, 'À propos : fiche détaillée');
assert.doesNotMatch(about, /about-text|<Insights/, 'À propos ne contient plus tout le texte');
assert.match(tc, /if \(jumpMs && hasTracks\) setTab\('transcript'\)/, '?t= ouvre la transcription');

// Un seul bouton « Ma liste »
assert.match(tc, /act="mylist"/);
assert.doesNotMatch(tc, /act="fav"|act="later"/, 'plus de boutons Favori et Plus tard séparés');
assert.match(tc, /toggleMyList\(id\)/);
const pv = read('components/Providers.js');
assert.match(pv, /const inMyList = useCallback\(\(id\) => favs\.has\(id\) \|\| later\.has\(id\)/);
assert.match(pv, /if \(f \|\| l\) return \(f \? await toggleFav\(id\) : null\) \|\| \(l \? await toggleLater\(id\) : null\);/, 'retrait : des deux');
assert.match(pv, /if \(features\.favorites !== false\) return toggleFav\(id\);\n\s*if \(features\.watchlater !== false\) return toggleLater\(id\);/, 'ajout : favoris, sinon plus tard');
const card = read('components/TalkCard.js');
assert.match(card, /toggleMyList\(talk\.id\)/);
assert.doesNotMatch(card, /'♥'|toggleLater|toggleFav/, 'vignette : un seul bouton');
// Rangée « Ma liste » de l'accueil
const home = read('app/page.js');
assert.match(home, /mergeMyList\(l, f\)\.slice\(0, 16\)/);
assert.match(home, /title=\{<>\{t\('lbMyList'\)\}/);

// Fin de vidéo : quiz → que faire → épisode suivant
assert.match(tc, /const onEnd = \(\) => \{ if \(quizOn && !quizPassed\) setQuizOffer\(true\); else if \(practiceOn\) setPracticeOffer\(true\); else if \(canChain\) setUpNext\(8\); \};/);
assert.match(tc, /if \(practiceOn\) setPracticeOffer\(true\); else if \(canChain\) setUpNext\(8\);/, '« Plus tard » sur le quiz → que faire');
assert.match(tc, /onClick=\{\(\) => \{ setPracticeOffer\(false\); if \(canChain\) setUpNext\(8\); \}\}/, '« Plus tard » sur que faire → épisode suivant');

// Un seul encart de paiement à la fois (sous le lecteur, ou dans la fin d'aperçu)
assert.match(tc, /\{!previewEnded && lock\}/);
assert.equal((tc.match(/\{lock\}/g) || []).length, 1, 'l’encart n’apparaît qu’une fois dans la fin d’aperçu');

// Textes
const i18n = read('lib/i18n.js');
for (const k of ['mlAdd', 'mlRemove', 'mlAdded', 'mlRemoved', 'tpTranscriptShow', 'tpQuestions']) {
  assert.equal((i18n.match(new RegExp(`\\n    ${k}: `, 'g')) || []).length, 3, k);
}
assert.match(i18n, /\n    wbList: "Listes",/, 'le bouton des listes personnelles ne s’appelle plus « Ma liste »');
console.log('test_n6_web OK');
