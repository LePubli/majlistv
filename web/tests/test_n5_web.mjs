// Étape N5 (16/11) — Bibliothèque en 4 onglets (Reprendre · Ma liste · Listes · Notes) et Mon compte en 3 onglets
// (Profil · Abonnement et achats · Notifications) ; anciennes adresses reprises ; réglages de la prière sur la page Prière.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// « Ma liste » : fusion favoris + plus tard, sans doublon (fonction pure vérifiée telle qu'écrite)
const lib = read('app/library/page.js');
const start = lib.indexOf('export function mergeMyList');
const end = lib.indexOf('\n}\n', start) + 2;
const mergeMyList = new Function(`${lib.slice(start, end).replace('export function', 'function')}; return mergeMyList;`)();
const m = mergeMyList([{ id: 1, positionMs: 5 }, { id: 2 }], [{ id: 2 }, { id: 3 }]);
assert.deepEqual(m.map((x) => x.id), [1, 2, 3], 'plus tard d’abord, puis favoris, sans doublon');
assert.deepEqual(m.find((x) => x.id === 2).srcs, ['later', 'fav'], 'une vidéo dans les deux est retirée des deux');
assert.equal(m[0].positionMs, 5, 'l’avancement est gardé');
assert.deepEqual(mergeMyList(null, null), []);

// Bibliothèque : 4 onglets, anciens onglets
assert.match(lib, /export const LEGACY_TABS = \{ favs: \['list'\], later: \['list'\] \};/);
assert.match(lib, /\{ id: 'list', label: t\('lbMyList'\) \}/);
assert.doesNotMatch(lib, /id: 'favs'|id: 'later'|id: 'follows'/, 'plus d’onglets Favoris, Plus tard, Chaînes suivies');
assert.match(lib, /router\.replace\('\/chaines#suivies'\)/, '?tab=follows → Catalogue → Chaînes');
assert.match(lib, /useTab\(tabs, undefined, LEGACY_TABS\)/);

// Chaînes suivies en haut de /chaines
assert.match(read('app/(module-channels)/chaines/page.js'), /<FollowedSection \/>/);
assert.match(read('components/FollowedChannels.js'), /<section id="suivies"/);

// Mon compte : 3 onglets, sections, prière déplacée
const acc = read('app/account/page.js');
const tabsBlock = acc.slice(acc.indexOf('const tabs = ['), acc.indexOf('];', acc.indexOf('const tabs = [')));
assert.equal((tabsBlock.match(/\{ id: '/g) || []).length, 3, 'trois onglets');
for (const id of ['profile', 'billing', 'notifs']) assert.ok(tabsBlock.includes(`id: '${id}'`), id);
assert.doesNotMatch(acc, /PrayerSettings/, 'les réglages de la prière ne sont plus dans Mon compte');
assert.match(acc, /router\.replace\('\/priere\?tab=settings'\)/, '?tab=prayer → page Prière');
for (const s of ['sec-security', 'sec-data', 'sec-sub', 'sec-purchases', 'sec-gifts', 'sec-referral']) assert.ok(acc.includes(`id="${s}"`), s);
const accLegacy = new Function(`${acc.slice(acc.indexOf('export const LEGACY_TABS'), acc.indexOf('};', acc.indexOf('export const LEGACY_TABS')) + 2).replace('export const', 'const')}; return LEGACY_TABS;`)();
assert.deepEqual(accLegacy.emails, ['notifs']);
assert.deepEqual(accLegacy.data, ['profile', 'data']);
assert.deepEqual(accLegacy.gifts, ['billing', 'gifts']);
assert.deepEqual(accLegacy.referral, ['billing', 'referral']);

// Onglets : anciennes adresses ?tab=… et #… reprises, section à montrer
const tabs = read('components/Tabs.js');
assert.match(tabs, /export function useTab\(tabs, def, legacy = \{\}\)/);
assert.match(tabs, /return \[current, go, sec\];/);
assert.match(tabs, /window\.location\.hash\.slice\(1\)/);
assert.match(tabs, /export function useScrollToSec/);

// Menus : même configuration côté site et API
const nav = read('lib/navcfg.js');
assert.equal(nav, fs.readFileSync(new URL('../../api/src/navcfg.js', import.meta.url), 'utf8'), 'navcfg identique site / API');
assert.match(nav, /library: \[\['mylist', 'Ma liste'\], \['lists', 'Mes listes'\], \['notes', 'Mes notes'\]/);
assert.match(nav, /account: \[\['account', 'Profil'\], \['billing', 'Abonnement et achats'\], \['mails', 'Notifications'\]/);
const ms = read('components/MemberShell.js');
assert.match(ms, /mylist: \{ key: 'mylist', href: '\/library\?tab=list'/);
assert.match(ms, /mails: \{ key: 'mails', href: '\/account\?tab=notifs'/);
assert.match(ms, /follows: \{ key: 'follows', href: '\/chaines#suivies'/);

// Liens mis à jour
assert.match(read('app/page.js'), /href="\/library\?tab=list"/);
assert.match(read('app/unsubscribe/[token]/page.js'), /href="\/account\?tab=notifs"/);

// Textes en 3 langues
const i18n = read('lib/i18n.js');
for (const k of ['lbMyList', 'lbMyListIntro', 'lbMyListEmpty', 'lbMyListRemove', 'acTabBilling', 'acPrayerLink']) {
  assert.equal((i18n.match(new RegExp(`\\n    ${k}: `, 'g')) || []).length, 3, k);
}
console.log('test_n5_web OK');
