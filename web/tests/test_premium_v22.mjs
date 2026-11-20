// Mise à jour design V22 (thème Premium) : menu transparent sur /catalogue et /series, rangées OTT, hub Shorts, fiche vidéo
// (« Retour au programme », bandeau quiz). Contrôles sur les sources + les 3 langues ; l'aspect est vérifié par captures (README).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const header = read('components/premium/PmHeader.js');
assert.match(header, /path === '\/catalogue'/); assert.match(header, /path === '\/series'/);
const css = read('app/skin-premium.css');
for (const c of ['.pm-card', '.pm-rail-track', '.pm-cat-hero', '.pm-sh-grid', '.wb-banner', '.wb-back', '.pm-spot']) assert.ok(css.includes(c), `CSS ${c}`);
assert.match(css, /grid-auto-columns: calc\(\(100% - 4 \* 12px\) \/ 5\)/, '5 cartes par rangée');
assert.match(css, /pm-card:hover[^}]*scale/, 'survol');
assert.match(css, /inset-inline/, 'logique RTL');
const home = read('components/premium/PmHome.js');
assert.match(home, /\/collections\/home/); assert.match(home, /\/shorts\?limit=/); assert.match(home, /feat\('shorts'\)/);
assert.ok(!/v20-preview-cards/.test(home), 'tuiles de démonstration retirées');
const cat = read('components/premium/PmCatalogue.js');
assert.match(cat, /pm-cat-hero/); assert.match(cat, /railMode/);
assert.match(read('app/(module-shorts)/shorts/page.js'), /ShortsEntry/);
assert.match(read('components/ShortsEntry.js'), /dataset\.skin === 'premium'/);
const talk = read('app/talks/[id]/TalkClient.js');
assert.match(talk, /className="wb-back"/); assert.match(talk, /className="wb-banner"/);
// Textes dans les 3 langues (chaque clé doit exister 3 fois).
const i18n = read('lib/i18n.js');
for (const k of ['wbBack', 'wbBackSeries', 'wbBannerTitle', 'wbBannerSub', 'wbBannerCta', 'pmSelection', 'pmExploreCollection', 'pmShortsEyebrow', 'pmShortsTitleA', 'pmShortsTitleB', 'pmShortsIntro', 'pmShortTag', 'pmShortsBack']) {
  const n = (i18n.match(new RegExp(`^    ${k}:`, 'gm')) || []).length;
  assert.equal(n, 3, `${k} dans fr / en / ar (trouvé ${n})`);
}
console.log('premium V22 OK');
