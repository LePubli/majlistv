// Audit 11/2026, navigation — lots A, B, C.
// A : menus du Studio et de l'Admin rangés par groupes, sans écran perdu ni adresse changée.
// B : en-tête Kids pour un parent connecté sur /kids.  C : mêmes mots entre le menu latéral et les onglets d'Apprendre.
// node web/tests/test_nav_lots_web.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const i18n = read('lib/i18n.js');
const has3 = (k) => assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, `texte ${k} dans les 3 langues`);

// --- A : Admin
const ad = read('components/AdminShell.js');
const block = ad.slice(ad.indexOf('const groups = ['), ad.indexOf('const visible = (id)'));
const groups = [...block.matchAll(/\{ key: '(\w+)', title: t\('(\w+)'\), items: \[(.*)\] \},/g)].map((m) => ({ key: m[1], title: m[2], ids: [...m[3].matchAll(/\['(\w+)',/g)].map((x) => x[1]) }));
assert.deepEqual(groups.map((g) => g.key), ['pilot', 'cat', 'practice', 'growth', 'site', 'tech'], 'six groupes');
const all = groups.flatMap((g) => g.ids);
const EXPECTED = ['dashboard', 'users', 'stats', 'revenue', 'health', 'errors', 'ask', 'lifecycle', 'categories', 'speakers', 'watch', 'ads', 'experiments', 'gifts', 'referral', 'regions', 'seasons', 'friday', 'athkar', 'ramadan', 'quran', 'kidrubrics', 'features', 'modules', 'settings', 'appearance', 'pages', 'menus', 'texts', 'legal', 'audit'];
assert.deepEqual([...all].sort(), [...EXPECTED].sort(), 'les 31 écrans d’avant, ni plus ni moins');
assert.equal(new Set(all).size, all.length, 'aucun écran en double');
assert.ok(groups.every((g) => g.ids.length <= 8), 'aucun groupe de plus de 8 écrans');
for (const g of groups) has3(g.title);
// --- A : Studio
const sd = read('components/StudioShell.js');
for (const k of ['sdGrpPublish', 'sdGrpProd', 'sdGrpAudience', 'sdGrpSettings']) { assert.ok(sd.includes(`t('${k}')`), `groupe ${k}`); has3(k); }
for (const h of ['/studio', '/studio/contents', '/studio/subtitles', '/studio/dubbing', '/studio/editor', '/studio/activity', '/studio/settings']) assert.ok(sd.includes(`row('${h}')`), `entrée ${h} toujours au menu`);
assert.ok(sd.includes('row(analyticsHref)') && sd.includes("'/studio/moderation'"), 'données analytiques et modération');
assert.match(sd, /STUDIO_GROUP_OF = \{ '\/studio\/references': 'settings' \}/, 'entrées des modules rangées');
assert.match(sd, /STUDIO_TAB_OF = \{ '\/studio\/corrections': '\/studio\/subtitles' \}/, 'corrections : onglet de Sous-titres, plus de ligne de menu');
assert.match(sd, /l\.group === 'mod' \? \(isModOnly \? 'mod' : 'audience'\) : \(isModOnly \? '' :/, 'un modérateur ne reçoit pas les entrées des organisateurs');
for (const k of ['adGrpSet', 'adGrpSec', 'msPath']) assert.ok(!i18n.includes(`    ${k}: `), `ancien texte ${k} retiré`);

// --- B : Kids
const hd = read('components/Header.js');
assert.match(hd, /if \(kid\) return <KidHeader \/>;\s+if \(ready && user && path && path\.startsWith\('\/kids'\)\) return <KidsParentHeader \/>;\s+return <MainHeader \/>;/, 'ordre : enfant, parent sur /kids, sinon site');
const kp = hd.slice(hd.indexOf('function KidsParentHeader'), hd.indexOf('export default function Header'));
assert.ok(kp.includes('href="/kids"') && kp.includes("t('kdBackSite')") && !kp.includes('hd-nav') && !kp.includes('/catalogue'), 'en-tête parent : logo Kids et retour au site, pas le menu adulte');
has3('kdBackSite');

// --- C : Apprendre
assert.match(read('components/MemberShell.js'), /learning: \{ key: 'learning', href: '\/learning', label: t\('lgGToday'\)/, 'menu latéral : même mot que l’onglet d’arrivée');
assert.ok(!/"[^"\n]*\bathkar\b[^"\n]*",$/im.test(i18n), 'plus de « athkar » dans les textes affichés');
console.log('navigation lots A B C OK');

// --- Lots D, E, F : cinq destinations, onglets de rubrique, menu latéral par destination, lecteur pleine largeur
{
  const nav = read('lib/navcfg.js');
  assert.match(nav, /builtin: \[\['home', 'Accueil'\], \['catalogue', 'Catalogue'\], \['learning', 'Apprendre'\], \['pratique', 'Pratique'\], \['library', 'Ma bibliothèque'\], \['kids', 'Mejliss Kids'\],\n\s+\['shorts', 'Shorts', true\]/, 'menu du haut : cinq destinations puis Kids');
  assert.match(nav, /builtin: \[\['home', 'Accueil'\], \['catalogue', 'Catalogue'\], \['learning', 'Apprendre'\], \['pratique', 'Pratique'\], \['library', 'Ma bibliothèque'\],\n\s+\['kids', 'Mejliss Kids', true\]/, 'barre du téléphone : les mêmes cinq, Kids masqué');
  assert.match(nav, /groups: \[\['catalogue', 'Catalogue'\], \['space', 'Apprendre'\], \['pratique', 'Pratique'\], \['library', 'Ma bibliothèque'\], \['account', 'Mon compte'\], \['manage', 'Gestion'\]\]/, 'menu latéral : un groupe par destination');
  assert.equal(nav, read('../api/src/navcfg.js'), 'navcfg identique côté API');
  // aucune ancienne clé perdue (un menu enregistré dans Admin → Menus peut encore s'en servir)
  for (const k of ['home', 'catalogue', 'series', 'collections', 'quran', 'audyn', 'events', 'ramadan', 'prayer', 'books', 'channels', 'shorts', 'learning', 'quranlearn', 'athkar', 'quiz', 'practice', 'bilan']) assert.ok(nav.includes(`['${k}', `), `clé ${k} toujours connue`);

  const st = read('components/SectionTabs.js');
  for (const p of ['/catalogue', '/series', '/shorts', '/collections', '/chaines', '/audyn', '/books', '/events', '/pratique', '/priere', '/coran', '/adhkar', '/ramadan']) assert.ok(st.includes(`'${p}'`), `onglet ${p}`);
  assert.match(st, /SECTION_PATHS\[s\]\.includes\(path\)/, 'barre seulement sur les pages de liste (adresse exacte)');
  assert.match(read('app/layout.js'), /<MemberShell><SectionTabs \/><RouteGate>/, 'onglets posés au-dessus de chaque page');
  for (const f of ['app/pratique/page.js', 'app/adhkar/page.js']) assert.ok(fs.existsSync(join(web, f)), `${f} existe`);
  assert.match(read('app/adhkar/page.js'), /<Athkar \/>/, '/adhkar montre le même écran que l’onglet d’Apprendre');
  for (const k of ['stVideos', 'stAudio', 'stLive', 'stLabel', 'pqHub', 'pqHubIntro', 'pqHubPrayerTx', 'pqHubQuranTx', 'pqHubAthkarTx', 'pqHubRamadanTx', 'pqHubOpen', 'pqHubLogin', 'msLibShort', 'kdNavShort']) has3(k);

  const sh = read('lib/shell.js');
  assert.match(sh, /WATCH_PATH = \/\^\\\/\(conferences\|talks\)\\\/\[\^\/\]\+\\\/\?\$\//, 'page d’une vidéo reconnue');
  const ms = read('components/MemberShell.js');
  assert.match(ms, /if \(!member \|\| WATCH_PATH\.test\(path \|\| '\/'\)\) return <>\{children\}\{bar\}<\/>;/, 'vidéo : pas de menu latéral, la barre du bas reste');
  assert.match(ms, /aria-expanded=\{isOpen\(g\)\}/, 'groupes du menu latéral repliables');
  assert.match(ms, /athkar: \{ key: 'athkar', href: '\/adhkar'/, 'Adhkar pointe vers sa page');
  const hd2 = read('components/Header.js');
  assert.match(hd2, /pratique: \{ key: 'pratique', href: '\/pratique'/, 'Pratique dans le menu du haut');
  assert.match(hd2, /className="hd-kids hd-kids-m"/, 'bouton Kids dans l’en-tête du téléphone');
  assert.match(read('app/globals.css'), /@media \(max-width: 900px\) \{\s+\.header a\.hd-kids-m \{ display: inline-flex;/, 'bouton Kids visible sur téléphone seulement');
  console.log('navigation lots D E F OK');
}
