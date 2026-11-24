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
// Depuis l'étape 4 de l'éditeur, les liens d'origine viennent de navDefaults.js et l'en-tête suit Admin → Menus.
const nd = read('lib/navDefaults.js');
for (const k of ["t('home')", "t('navCatalogue')", "t('seriesNav')", "t('navLearn')", "t('kdNav')"]) assert.ok(nd.includes(k), `menu de la maquette : ${k}`);
assert.ok(hd.includes('menus?.web_top'), 'en-tête piloté par Admin → Menus');
for (const k of ['"/pratique"', '"/library"', '"/account"', 'logoutNow']) assert.ok(hd.includes(k), `menu de l'avatar : ${k}`);
assert.doesNotMatch(hd, /notification-dot/, 'pas de pastille de notification inventée');
const home = read('components/premium/PmHomeSections.js'); // sections de l'accueil (étape 4)
for (const c of ['v20-hero v20-faithful-hero v20-hero-home', 'v20-mobile-universes', 'OttRail', 'OttCard', 'pm-spot', 'pm-kids-promo', 'v20-big-learn-banner']) assert.ok(home.includes(c), c);
for (const api of ["usePmData('/home')", "usePmData('/me/continue'", "usePmData('/me/learning'"]) assert.ok(home.includes(api), `vraies données : ${api}`);
assert.doesNotMatch(home, /75%|12:34|45:20|Salahuddin|Les Héritiers|avatar-reference/, 'aucun contenu de démonstration de la maquette');
assert.match(home, /course && \(/, 'progression du parcours seulement si elle existe');
assert.match(read('components/premium/PmMobileNav.js'), /v20-mobile-nav/);
assert.match(read('lib/navDefaults.js'), /legal\/mentions-legales/, 'liens légaux obligatoires (valeurs d’origine)'); assert.match(read('components/premium/PmFooter.js'), /required/, 'liens légaux imposés');
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
const i18nSrc = read('lib/i18n.js');
for (const k of ['skPremium', 'pmWatchNow', 'pmLeft', 'pmLearnTitle', 'pmLearnSub', 'pmLearnCur', 'pmProfile', 'pmUniverses', 'pmNewTag']) assert.equal((i18nSrc.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, `${k} en fr/en/ar`);
// 7. Lot 2 : catalogue, liste des séries, fiche série (maquette V20 : catalogue-v11, heritage-v9), vraies données.
assert.match(read('app/catalogue/CatalogueClient.js'), /if \(skin === 'premium'\) return <PmCatalogue \/>/);
assert.match(read('app/(module-series)/series/page.js'), /skin === 'premium' \? <PmCatalogue series \/> : <SeriesList \/>/);
assert.match(read('app/(module-series)/series/[id]/SeriesClient.js'), /if \(skin === 'premium'\) return <PmSeries id=/);
const cat = read('components/premium/PmCatalogue.js');
for (const c of ['pm-cat-hero', 'pm-cat-search', 'pm-cat-chips', 'pm-cat-formats', 'pm-cat-grid', 'OttCard', 'OttRail', 'v20-cv11-more', 'v20-cv11-cross-learn', 'v20-cv11-cross-kids', 'v20-cv11-empty']) assert.ok(cat.includes(c), c);
for (const api of ["'/talks?'", "'/talks/facets?'", "'/formats?used=1'", "'/series?limit=100'"]) assert.ok(cat.includes(api), `vraies données : ${api}`);
assert.doesNotMatch(cat, /HD<|cv11-quality|Les Héritiers|Yacine/, 'ni « HD » ni contenu de démonstration');
assert.match(cat, /catalogueTabs\(/, 'les autres rubriques du Catalogue restent accessibles');
assert.match(read('components/SectionTabs.js'), /skin === 'premium' && \(path === '\/catalogue' \|\| path === '\/series'\)\) return null/);
const ser = read('components/premium/PmSeries.js');
for (const c of ['v20-heritage-v9', 'v20-hv9-hero', 'v20-hv9-pills', 'v20-hv9-hero-actions', 'v20-hv9-series-progress', 'v20-hv9-tabs', 'v20-hv9-episode', 'v20-hv9-learning-card', 'v20-hv9-ring', 'v20-hv9-related']) assert.ok(ser.includes(c), c);
for (const api of ['`/series/${id}`', "'/me/learning'"]) assert.ok(ser.includes(api), `vraies données : ${api}`);
assert.match(ser, /lpct != null && \(/, 'progression Apprendre seulement si elle existe');
assert.doesNotMatch(ser, /62 %|284|VOST|2024|Tout public/, 'aucun chiffre de démonstration');
assert.match(read('components/premium/PmHeader.js'), /\/\^\\\/series\\\/\[\^\/\]\+\$\/\.test\(path\)/, 'en-tête posé sur l’image de la fiche série');
for (const k of ['pmSeriesTitle', 'pmCatIntro', 'pmSearchPh', 'pmResultN', 'pmSortAlpha', 'pmLearnSeries', 'pmSameTheme', 'pmEpN', 'pmQuizOf']) assert.equal((i18nSrc.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, `${k} en fr/en/ar`);
// 8. Lot 3 : Apprendre (« Mon espace Apprendre » de la maquette V20, lv10), vraies données.
const lrn = read('components/premium/PmLearning.js');
for (const c of ['v20-learnv10', 'v20-lv10-hero', 'v20-lv10-progress-card', 'v20-lv10-ring', 'v20-lv10-goals-card', 'v20-lv10-path-grid', 'v20-lv10-review-card', 'v20-lv10-tools-grid', 'v20-lv10-focus', 'v20-lv10-bilan-tile', 'v20-lv10-flow-head']) assert.ok(lrn.includes(c), c);
const lpage = read('app/(module-learning)/learning/page.js');
assert.match(lpage, /pm && tab === 'today'[\s\S]*<PmLearning /, 'tableau de bord V20 sur l’onglet Aujourd’hui');
assert.match(lpage, /<PmLearnFlow /, 'en-tête V20 pour Réviser et Mes progrès');
assert.match(lpage, /skin === 'premium'/);
assert.match(read('components/premium/PmHeader.js'), /path === '\/learning'/, 'en-tête posé sur l’image d’Apprendre');
assert.match(lrn, /call\('\/series\?limit=100'/, 'vraies affiches de séries');
assert.match(lrn, /lastScores\.length >= 2/, 'courbe seulement avec de vrais résultats');
assert.doesNotMatch(lrn, /avatar-reference|Le Coran|Sîra|piliers|75 ?%|Les valeurs du quotidien|2\/3/, 'aucun parcours, chiffre ou photo de démonstration');
for (const k of ['pmLnMySpace', 'pmLnTitleEm', 'pmLnIntro', 'pmLnGoals', 'pmLnNothing', 'pmLnPaths', 'pmLnRevWait', 'pmLnToolsTitle', 'pmLnBilan', 'pmLnBack']) assert.equal((i18nSrc.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, `${k} en fr/en/ar`);
// 9. Lot 4 : Mejliss Kids côté enfant (écran Kids de la maquette V20, kids-v8), vraies données.
const kd = read('components/premium/PmKids.js');
for (const c of ['v20-kids-topbar', 'v20-kids-logo', 'v20-kids-badge', 'v20-kids-head-nav', 'v20-kids-profile-pill', 'v20-kids-hero', 'v20-kids-v8-hero-copy', 'v20-kids-v8-primary', 'v20-kids-categories', 'v20-kids-v8-featured-grid', 'v20-kids-v8-feature-card']) assert.ok(kd.includes(c), c);
assert.match(kd, /call\('\/kids\/catalog'\)/, 'vraies rubriques et rangées Kids');
assert.match(kd, /call\('\/kids\/exit'/, 'sortie par code parental conservée');
assert.doesNotMatch(kd, /Yacine et Lina|12 épisodes|Série · \d|Les Prophètes en histoires|Petits Savants|Mon Coran illustré/, 'ni série ni affiche de démonstration');
assert.match(read('components/Header.js'), /skin === 'premium' \? <PmKidHeader \/> : <KidHeader \/>/, 'en-tête enfant premium');
const kh = read('components/KidsHome.js');
assert.match(kh, /pm\s*\? <div className="v20-app pm-page pm-kids">/, 'accueil Kids premium sans menu latéral');
assert.match(kh, /<PmKidsTop /);
assert.match(kh, /!pm && <aside className="kd-side">/, 'menu latéral conservé pour les autres thèmes');
assert.match(read('components/KidCatalog.js'), /useSearchParams\(\)\.get\('r'\)/, 'rubrique choisie par l’adresse');
assert.match(css, /\.v20-app\.pm-kids \.v20-kids-v8 \.v20-kids-hero-visual \{ background-image: url\('\/premium\/kids-hero-scene\.webp'\)/, 'illustration de décor du bandeau');
assert.match(kd, /mtrMin/, 'durées traduites (arabe)');
// 10. Lot 5 : Formules, connexion / inscription, Mon compte (style V20 : panneaux dégradés, boutons arrondis) ; aucun prix écrit dans le code.
assert.match(css, /main\.page\.pricing[\s\S]*main\.page\.acct/, 'pages Formules et Mon compte habillées');
assert.match(css, /:is\(\.plan, \.card, \.card-lite, \.waiver\)/, 'panneaux dégradés V20');
assert.doesNotMatch(read('app/pricing/page.js').replace(/\/\/.*$/gm, ''), /6[,.]99|69[,.]99|9[,.]99|99[,.]99/, 'aucun prix écrit dans le code (ils viennent de Stripe)');
// 11. Lot 6 : lecteur et page vidéo (mise en page V20 « lecteur » pv12 appliquée à la vraie page, vrai lecteur conservé).
assert.match(css, /\.wb-hero \{ background: linear-gradient\(155deg, var\(--c-0f2a49,#0f2a49\), var\(--c-061325,#061325\)\)/, 'cadre du lecteur V20');
assert.match(css, /\.wb-learn \{ background: linear-gradient\(135deg, var\(--c-0c3a6e,#0c3a6e\), var\(--c-0a2548,#0a2548\)\)/, 'carte Apprendre bleue');
assert.match(read('app/talks/[id]/TalkClient.js'), /<VideoPlayer|ExternalPlayer/, 'vrai lecteur conservé');
void execFileSync;
// 5. Back-office Premium (Admin + Studio, Lot 1) : feuille limitée au thème, chargée par les deux layouts, textes ×3 langues.
const bo = strip(read('app/skin-premium-admin.css'));
const boRules = bo.match(/[^{}@]+\{/g).map((x) => x.replace(/\{$/, '').trim()).filter((x) => x && !x.startsWith('media'));
assert.ok(boRules.length > 100, 'feuille du back-office présente');
for (const r of boRules) for (const part of top(r)) assert.match(part.trim(), /^html\[data-skin="premium"\]/, `règle du back-office limitée au thème Premium : ${part.trim()}`);
for (const l of ['app/admin/layout.js', 'app/studio/layout.js']) assert.match(read(l), /skin-premium-admin\.css/, `${l} charge la feuille`);
const shell = read('components/ManageShell.js');
for (const c of ['BoTop', "skin === 'premium'", 'bo-switch']) assert.ok(shell.includes(c), `ManageShell : ${c}`);
const bell = read('components/backoffice/BoBell.js');
for (const p of ['/admin/watch/count', '/admin/errors?state=open', '/admin/ask/stats', '/admin/health', '/moderation/summary', '/studio/activity/count']) assert.ok(bell.includes(p), `cloche : vraie source ${p}`);
assert.match(bell, /total > 0 && <i className="bo-dot"/, 'le point de la cloche n\'apparaît que s\'il y a des alertes');
const boI18n = read('lib/i18n.js');
for (const k of ['boBell', 'boNoAlerts', 'boAlWatch', 'boAlErrors', 'boAlAsk', 'boAlHealth', 'boAlMod', 'boAlReports', 'boAlTasks', 'boApps', 'boAppStudio', 'boAppAdmin', 'boAppSite', 'boAccount', 'boSearch', 'boAdminShort', 'boOverview', 'boStats', 'boRevenue', 'bqPageTitle', 'bqPageSub', 'bqKAll', 'bqKRun', 'bqKReview', 'bqKLive', 'bqTitle', 'bqClose', 'bqTitleField', 'bqSpeaker', 'bqLangs', 'bqDuration', 'bqStatus', 'bqVis', 'bqSteps', 'bqOptions', 'sdPmTitle', 'sdPmSub', 'bqKDraft']) assert.equal((boI18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, `${k} en fr, en et ar`);

console.log('web premium OK');
