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
assert.match(sd, /STUDIO_GROUP_OF = \{ '\/studio\/corrections': 'prod', '\/studio\/references': 'settings' \}/, 'entrées des modules rangées');
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
assert.ok(i18n.includes('    lgGQuran: "Coran et adhkar",'), 'une seule orthographe : adhkar');
assert.ok(!/"[^"\n]*\bathkar\b[^"\n]*",$/im.test(i18n), 'plus de « athkar » dans les textes affichés');
console.log('navigation lots A B C OK');
