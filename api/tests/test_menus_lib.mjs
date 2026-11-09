// Projet Menus : validation d'un menu (api/src/menus.js), copies identiques API ↔ site, et résolution côté site (web/lib/menus.js).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanMenuGeneric, cleanMenuItems, fitsLocation, LOCATIONS, KIND_KEYS } from '../src/menus.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
assert.equal(read('../src/menus.js'), read('../../web/lib/menusCfg.js'), 'menus.js : API et site identiques');
assert.equal(read('../src/navcfg.js'), read('../../web/lib/navcfg.js'), 'navcfg.js : API et site identiques');

const U = '11111111-1111-1111-1111-111111111111';
const L = (s) => ({ fr: s });
const ok = (items, loc) => { const r = loc ? cleanMenuItems(items, loc) : cleanMenuGeneric(items); assert.ok(r.items, JSON.stringify(r)); return r.items; };
const ko = (items, re, loc) => { const r = loc ? cleanMenuItems(items, loc) : cleanMenuGeneric(items); assert.ok(r.error && re.test(r.error), `${re} attendu, reçu ${JSON.stringify(r)}`); };

assert.deepEqual(KIND_KEYS, ['builtin', 'url', 'talk', 'series', 'collection', 'channel', 'page', 'appscreen', 'heading']);
assert.deepEqual(Object.keys(LOCATIONS), ['web_top', 'web_side', 'web_bar', 'web_footer', 'app_drawer', 'app_tabs']);

// Normalisation : un texte simple devient {fr}, les valeurs par défaut disparaissent.
const n = ok([{ id: 'a', kind: 'url', ref: '/x', label: ' Salut ', audience: 'all', devices: ['m', 't', 'd'], icon: '' }]);
assert.deepEqual(n, [{ id: 'a', kind: 'url', ref: '/x', label: { fr: 'Salut' } }]);
ok([{ id: 'a', kind: 'talk', ref: U }, { id: 'b', kind: 'series', ref: U }, { id: 'c', kind: 'collection', ref: U }, { id: 'd', kind: 'channel', ref: 'mon-intervenant' }, { id: 'e', kind: 'page', ref: '/p/ma-page' }]);
ok([{ id: 'a', kind: 'heading', label: L('T'), children: [{ id: 'b', kind: 'url', ref: 'mailto:a@b.fr', label: L('Écrire') }, { id: 'c', kind: 'url', ref: 'tel:+33123', label: L('Appeler') }] }]);

// Refus
ko([{ id: 'a', kind: 'url', ref: 'http://x.fr', label: L('x') }], /Adresse non valide/);
ko([{ id: 'a', kind: 'url', ref: '/x y', label: L('x') }], /Adresse non valide/);
ko([{ id: 'a', kind: 'url', ref: '/x', label: L('x'), newTab: 1, }, { id: 'b', kind: 'talk', ref: U, newTab: true }], /nouvel onglet|Nouvel onglet/i);
ko([{ id: 'A!', kind: 'url', ref: '/x', label: L('x') }], /Identifiant/);
ko([{ kind: 'url', ref: '/x', label: L('x') }], /Identifiant/);
ko([{ id: 'a', kind: 'url', ref: '/x', label: { de: 'x' } }], /Langue inconnue/);
ko([{ id: 'a', kind: 'url', ref: '/x', label: L('x'.repeat(61)) }], /60 caractères/);
ko([{ id: 'a', kind: 'heading', label: L('T'), children: [{ id: 'b', kind: 'heading', label: L('U'), children: [{ id: 'c', kind: 'url', ref: '/x', label: L('x') }] }] }], /Un seul niveau/);
ko(Array.from({ length: 41 }, (_, i) => ({ id: `i${i}`, kind: 'url', ref: '/x', label: L('x') })), /40 éléments/);

// Emplacements
ko([{ id: 'a', kind: 'url', ref: '/y', label: L('T'), children: [{ id: 'b', kind: 'url', ref: '/x', label: L('x') }] }], /sous-menus/, 'web_bar');
ko([{ id: 'a', kind: 'heading', label: L('T') }], /titre/, 'web_bar');
ko(Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, kind: 'url', ref: '/x', label: L('x') })), /5 éléments/, 'web_bar');
ko([{ id: 'a', kind: 'builtin', ref: 'home' }], /origine/, 'app_drawer');
ko([{ id: 'a', kind: 'builtin', ref: 'channels' }], /inconnu/, 'web_top'); // « Chaînes » n'existe pas dans le menu du haut
ok([{ id: 'a', kind: 'builtin', ref: 'home' }, { id: 'b', kind: 'appscreen', ref: 'quran' }], 'web_top');
ok([{ id: 'a', kind: 'appscreen', ref: 'learn' }, { id: 'b', kind: 'heading', label: L('Plus'), children: [{ id: 'c', kind: 'appscreen', ref: 'quran' }] }], 'app_drawer');
// Pied de page : liens légaux obligatoires, jamais masqués ni limités
const legal = [{ id: 'm', kind: 'builtin', ref: 'mentions' }, { id: 'c', kind: 'builtin', ref: 'cgv' }, { id: 'p', kind: 'builtin', ref: 'privacy' }];
ok(legal, 'web_footer');
ko(legal.slice(0, 2), /légaux/, 'web_footer');
ko([{ ...legal[0], hidden: true }, ...legal.slice(1)], /légaux/, 'web_footer');
ko([{ ...legal[0], audience: 'member' }, ...legal.slice(1)], /légaux/, 'web_footer');
assert.equal(fitsLocation(legal, 'web_footer'), null);
assert.match(fitsLocation(legal, 'web_bar'), /5 éléments|origine|inconnu/);

// ---- Résolution côté site
const src = read('../../web/lib/menus.js').replace("import { tx } from './blocks';", "const tx = (v, l) => (v && typeof v === 'object' ? v[l] || v.fr || v.en || v.ar || '' : '');");
const { resolveMenu } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const D = [
  { key: 'home', href: '/', label: 'Accueil', on: true },
  { key: 'prayer', href: '/priere', label: 'Prière', on: false }, // fonction coupée
  { key: 'mentions', href: '/legal/mentions-legales', label: 'Mentions', on: true },
];
const items = [
  { id: 'a', kind: 'builtin', key: 'home' },
  { id: 'b', kind: 'builtin', key: 'prayer' },
  { id: 'c', kind: 'builtin', key: 'inconnu' },
  { id: 'd', kind: 'heading', label: { fr: 'Découvrir', en: 'Discover' }, children: [
    { id: 'd1', kind: 'url', href: '/x', label: { fr: 'X' }, audience: 'member' },
    { id: 'd2', kind: 'talk', href: '/conferences/y', label: { fr: 'Y' } },
  ] },
  { id: 'e', kind: 'heading', label: { fr: 'Vide' }, children: [{ id: 'e1', kind: 'url', href: '/z', label: { fr: 'Z' }, audience: 'manager' }] },
  { id: 'f', kind: 'appscreen', screen: 'quran', label: { fr: 'Appli' } },
  { id: 'g', kind: 'url', href: '/m', label: { fr: 'M' }, devices: ['d'] },
  { id: 'h', kind: 'builtin', key: 'mentions', audience: 'manager', devices: ['d'] },
];
let r = resolveMenu(items, D, { user: null, lang: 'en' });
assert.deepEqual(r.map((x) => x.key), ['home', 'd', 'g'], 'visiteur : sans la fonction coupée, sans les liens membres/équipe, sans écran d\'appli');
const d = r.find((x) => x.key === 'd');
assert.equal(d.label, 'Discover', 'texte dans la langue demandée');
assert.deepEqual(d.children.map((c) => c.key), ['d2'], 'sous-menu : le lien « membres » disparaît pour un visiteur');
assert.equal(r.find((x) => x.key === 'g').cls, 'pb-hide-m pb-hide-t', 'appareils : masqué sur téléphone et tablette');
r = resolveMenu(items, D, { user: { role: 'admin' }, lang: 'fr' });
assert.deepEqual(r.find((x) => x.key === 'd').children.map((c) => c.key), ['d1', 'd2']);
assert.ok(r.find((x) => x.key === 'e'), 'équipe : sous-menu « équipe » visible');
// Liens légaux : toujours visibles, tout public, tous appareils
r = resolveMenu(items, D, { user: null, lang: 'fr', required: ['mentions'] });
const m = r.find((x) => x.key === 'mentions');
assert.ok(m && m.cls === '', 'lien légal toujours affiché');
// Titre sans sous-menu : retiré, sauf dans le menu latéral
assert.ok(!resolveMenu([{ id: 'z', kind: 'heading', label: { fr: 'Seul' } }], D, { user: null, lang: 'fr' }).length);
assert.equal(resolveMenu([{ id: 'z', kind: 'heading', label: { fr: 'Seul' } }], D, { user: null, lang: 'fr', keepHeadings: true }).length, 1);
console.log('menus lib OK');
