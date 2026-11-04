// Amélioration 2.5 — « À regarder plus tard » : bouton des vignettes et de la page vidéo, onglet de Ma bibliothèque, rangée de l'accueil.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pr = read('components/Providers.js');
assert.match(pr, /\/api\/me\/watchlater\/ids/, 'état chargé une fois (Providers)'); assert.match(pr, /toggleLater/, 'bascule partagée');
assert.match(pr, /features\.watchlater === false/, 'fonction coupée : rien n’est chargé');
assert.match(read('components/TalkCard.js'), /feat\('watchlater'\) && <button type="button" className=\{`hc-btn/, 'bouton sur la vignette');
const tc = read('app/talks/[id]/TalkClient.js');
assert.match(tc, /act="later"/, 'bouton « Plus tard » de la page vidéo'); assert.match(tc, /className="wl-msg" role="status"/, 'confirmation annoncée');
assert.doesNotMatch(tc, /window\.alert/, 'pas de fenêtre d’alerte');
const lib = read('app/library/page.js');
assert.match(lib, /\{ id: 'later', label: t\('wlTab'\) \}/, 'onglet de Ma bibliothèque'); assert.match(lib, /\/me\/watchlater'/, 'liste chargée');
assert.match(lib, /EmptyState text=\{t\('wlEmpty'\)\}/, 'état vide utile');
assert.match(read('app/page.js'), /<Row id="row-later"/, 'rangée de l’accueil');
assert.match(read('components/WatchBar.js'), /clockOn:/, 'icônes');
const i18n = read('lib/i18n.js');
for (const k of ['wlTab', 'wlRow', 'wlAdd', 'wlRemove', 'wbLater', 'wlAdded', 'wlRemoved', 'wlIntro', 'wlEmpty']) assert.equal((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web watch later OK');
