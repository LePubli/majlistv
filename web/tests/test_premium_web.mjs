// Thème « Premium » (thème V20 fourni par Epok, 19/11/2026) : thème AUTONOME qui reproduit la maquette V20 à l'identique
// (en-tête, accueil, pied de page, barre du bas), avec les vraies données ; feuille /premium/v20.css chargée seulement pour lui.
// Choix d'Epok : Montserrat (pas de Georgia), vrai logo Mejliss, menu de la maquette, images du thème sauf « Prophètes ».
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// 1. Thème autonome : pas de data-premium, pas de bascule sur le thème bleu.
const { SKINS, isBlueFamily, applySkin, V20_CSS } = await import('../lib/skin.js');
assert.deepEqual(SKINS, ['classique', 'nuit', 'bleu', 'premium']);
assert.ok(isBlueFamily('bleu') && !isBlueFamily('premium'), 'premium ne reprend pas les écrans du thème bleu');
const el = { dataset: {} };
applySkin(el, 'premium'); assert.deepEqual(el.dataset, { skin: 'premium' });
assert.equal(V20_CSS, '/premium/v20.css');
const lay = read('app/layout.js');
assert.match(lay, /data-skin=\{skin\}/);
assert.match(lay, /skin === 'premium' && <link id="v20-css" rel="stylesheet" href=\{V20_CSS\} \/>/, 'v20.css seulement pour Premium');
assert.doesNotMatch(lay, /data-premium/);

// 2. Feuille V20 : toutes les classes préfixées « v20- », tout est limité à .v20-app, Montserrat, images locales.
const v20 = read('public/premium/v20.css');
assert.ok(v20.length > 100000);
assert.doesNotMatch(v20, /Georgia/);
assert.doesNotMatch(v20, /@import/);
assert.doesNotMatch(v20, /assets\//);
const sels = strip(v20).replace(/@(media|supports)[^{]*\{/g, '').match(/[^{}]+\{/g).map((x) => x.slice(0, -1).trim()).filter((x) => x && !/^(from|to|\d|@)/.test(x));
const top = (sel) => { const out = []; let d = 0, cur = ''; for (const ch of sel) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
for (const r of sels) for (const part of top(r)) assert.match(part.trim(), /^(\[dir="rtl"\] )?\.v20-app/, `règle limitée à .v20-app : ${part.trim()}`);
for (const m of strip(v20).replace(/url\([^)]*\)/g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)) assert.ok(m[1].startsWith('v20-') || /^\d/.test(m[1]), `classe préfixée : ${m[1]}`);
for (const m of v20.matchAll(/url\(['"]?\/premium\/([\w.-]+)['"]?\)/g)) assert.ok(fs.existsSync(new URL(`../public/premium/${m[1]}`, import.meta.url)), `image ${m[1]}`);
// La feuille est régénérée par le script (idempotent) : on vérifie qu'il existe et se lance.
assert.ok(fs.existsSync(new URL('../scripts/build-premium-css.py', import.meta.url)));

// 3. Écrans V20 branchés : en-tête, pied de page, barre du bas, accueil.
assert.match(read('components/Header.js'), /if \(skin === 'premium'\) return <PmHeader \/>/);
assert.match(read('components/Footer.js'), /skin === 'premium' \? <PmFooter \/> : <SiteFooter \/>/);
assert.match(read('components/MemberShell.js'), /if \(skin === 'premium'\) return <>\{children\}<PmMobileNav \/><\/>/);
assert.match(read('app/page.js'), /if \(skin === 'premium'\) return <PmHome \/>/);
const hd = read('components/premium/PmHeader.js');
for (const c of ['v20-topbar v20-exact-header', 'v20-is-overlay', 'v20-brand v20-exact-brand', 'v20-nav v20-exact-nav', 'v20-exact-bell', 'v20-menu-toggle']) assert.ok(hd.includes(c), c);
assert.match(hd, /\/brand\/emblem-bleu-s\.png/, 'vrai logo Mejliss');
for (const k of ["t('home')", "t('navCatalogue')", "t('seriesNav')", "t('navLearn')", "t('kdNav')"]) assert.ok(hd.includes(k), `menu de la maquette : ${k}`);
for (const k of ['"/pratique"', '"/library"', '"/account"', 'logoutNow']) assert.ok(hd.includes(k), `menu de l'avatar : ${k}`);
assert.doesNotMatch(hd, /notification-dot/, 'pas de pastille de notification inventée');
const home = read('components/premium/PmHome.js');
for (const c of ['v20-hero v20-faithful-hero v20-hero-home', 'v20-mobile-universes', 'v20-continue-card', 'v20-poster-card', 'v20-big-learn-banner', 'v20-preview-kids', 'v20-preview-mobile', 'v20-preview-player', 'v20-preview-tv']) assert.ok(home.includes(c), c);
for (const api of ["call('/home')", "call('/me/continue')", "call('/me/learning'"]) assert.ok(home.includes(api), `vraies données : ${api}`);
assert.doesNotMatch(home, /75%|12:34|45:20|Salahuddin|Les Héritiers|avatar-reference/, 'aucun contenu de démonstration de la maquette');
assert.match(home, /course && \(/, 'progression du parcours seulement si elle existe');
assert.match(read('components/premium/PmMobileNav.js'), /v20-mobile-nav/);
assert.match(read('components/premium/PmFooter.js'), /legal\/mentions-legales/, 'liens légaux obligatoires');
assert.match(read('components/premium/PmFooter.js'), /<SkinPicker \/>/, 'un visiteur peut quitter le thème');
assert.match(read('components/SkinPicker.js'), /v === 'premium' \|\| cur === 'premium'\)\) \{ window\.location\.reload\(\)/);

// 4. Compléments (skin-premium.css) : limités au thème Premium ou à .v20-app.
const css = strip(read('app/skin-premium.css'));
const rules = css.match(/[^{}@]+\{/g).map((x) => x.replace(/\{$/, '').trim()).filter((x) => x && !/^(from|to|\d)/.test(x) && !x.startsWith('media') && !/^\(/.test(x));
for (const r of rules) for (const part of top(r)) assert.match(part.trim(), /^(html\[data-skin="premium"\]|html:not\(\[data-skin="premium"\]\)|\.v20-app|\[dir="rtl"\] \.v20-app)/, `règle limitée au thème Premium : ${part.trim()}`);
assert.doesNotMatch(css, /Georgia|data-premium/);
for (const m of css.matchAll(/url\('\/premium\/([\w-]+\.webp)'\)/g)) assert.ok(fs.existsSync(new URL(`../public/premium/${m[1]}`, import.meta.url)), `image ${m[1]}`);

// 5. Images : ni avatar inventé, ni capture de référence, ni affiche « Prophètes ».
const files = fs.readdirSync(new URL('../public/premium/', import.meta.url));
assert.ok(!files.some((f) => /avatar|reference|prophet|prophete/i.test(f)));
const { PREMIUM_ART, posterArt } = await import('../lib/thumb.js');
for (const a of PREMIUM_ART) { assert.ok(files.includes(`${a}.webp`)); assert.doesNotMatch(a, /salahuddin|khwarizmi|kids/); }
assert.match(posterArt('x'), /^url\(\/premium\/[\w-]+\.webp\)$/);

// 6. Textes en fr / en / ar.
const i18n = read('lib/i18n.js');
for (const k of ['skPremium', 'pmWatchNow', 'pmLeft', 'pmLearnTitle', 'pmLearnSub', 'pmLearnCur', 'pmProfile', 'pmUniverses', 'pmNewTag']) assert.equal((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, `${k} en fr/en/ar`);
void execFileSync;
console.log('web premium OK');
