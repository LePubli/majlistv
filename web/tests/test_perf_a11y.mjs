// Amélioration 6.8 — garde-fous de vitesse et d'accessibilité (sans navigateur) : empêchent de réintroduire les défauts corrigés.
// Les mesures chiffrées (Lighthouse + axe) se lancent à la main : ops/audit/README.md. node web/tests/test_perf_a11y.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const walk = (d) => readdirSync(join(root, d)).flatMap((f) => { const p = join(d, f); return statSync(join(root, p)).isDirectory() ? walk(p) : [p]; });
const src = [...walk('components'), ...walk('app')].filter((p) => p.endsWith('.js'));

// 1. Toute image porte un attribut alt (vide si décorative).
for (const f of src) for (const m of read(f).matchAll(/<img\b[^>]*?(\/?>)/gs)) assert.ok(/\balt=/.test(m[0]), `${f} : <img> sans alt : ${m[0].slice(0, 80)}`);

// 2. Logos : les composants utilisent les versions allégées (les originaux ne servent qu'à la carte de partage et au service worker).
for (const f of src) { const c = read(f); assert.ok(!/\/brand\/(emblem|wordmark)\.png/.test(c), `${f} : utiliser /brand/emblem-s.png ou wordmark-s.png (versions légères)`); }
for (const [f, max] of [['public/brand/emblem-s.png', 60e3], ['public/brand/wordmark-s.png', 40e3], ['public/brand/kids-banner-960.jpg', 120e3]]) assert.ok(statSync(join(root, f)).size < max, `${f} trop lourd`);
assert.ok(read('components/Vitrine.js').includes('kids-banner-960.jpg 960w'), 'bannière Kids : version 960 px pour les téléphones');

// 3. Le pied de page ne saute pas pendant le chargement (CLS).
assert.ok(read('app/layout.js').includes('className="page-shell"') && /\.page-shell\s*\{[^}]*min-height:\s*100svh/.test(read('app/globals.css')), 'zone de page d\'au moins un écran');

// 4. Lien d'évitement : trouve le <main> même s'il apparaît après le chargement des données.
assert.ok(read('components/SkipLink.js').includes('MutationObserver'), 'lien d\'évitement : attend le <main>');

// 5. Libellé accessible = texte visible (WCAG 2.5.3) sur les cartes qui contiennent déjà leur titre.
assert.ok(!/className="vt-hero-card"[^>]*aria-label/.test(read('components/Vitrine.js')), 'vt-hero-card : pas d\'aria-label différent du texte visible');
assert.ok(!/className="kd-card"[^>]*aria-label/.test(read('components/KidsBanner.js')), 'kd-card : pas d\'aria-label différent du texte visible');

// 6. JavaScript moderne : pas de polyfills pour de très vieux navigateurs.
assert.ok(JSON.parse(read('package.json')).browserslist?.length >= 3, 'browserslist défini');
console.log('OK  perf + accessibilité (garde-fous)');
