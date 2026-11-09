// Projet Menus (étape 2) — menus de l'application : filtre public / téléphone / fonctions coupées, adresses, onglets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppMenu, resolveTabs, tabActive, targetOf, parseMenus, audienceOk, onPhone, labelOf, SCREENS, type MenuItem, type Ctx } from '../src/lib/menus';

const ctx = (o: Partial<Ctx> = {}): Ctx => ({ locale: 'fr', loggedIn: false, role: null, hasSeries: true, feat: () => true, siteUrl: 'https://site.test', ...o });
const L = (fr: string, en?: string) => ({ fr, ...(en ? { en } : {}) });

test('aucun menu affecté : null (l\'application garde ses menus d\'origine)', () => {
  assert.equal(resolveAppMenu(undefined, ctx()), null);
  assert.equal(resolveAppMenu(null, ctx()), null);
  assert.equal(resolveTabs(undefined, ctx()), null);
  assert.equal(parseMenus(null), null);
  assert.equal(parseMenus({ locations: { web_top: [] } }), null, 'les emplacements du site ne concernent pas l\'appli');
  assert.deepEqual(Object.keys(parseMenus({ locations: { app_tabs: [{ id: 'a' }], web_top: [] } }) || {}), ['app_tabs']);
});

test('adresses : écrans, contenus, pages, liens', () => {
  const c = ctx({ loggedIn: true });
  const t = (it: Partial<MenuItem>) => targetOf({ id: 'x', kind: 'url', ...it } as MenuItem, c);
  assert.deepEqual(t({ kind: 'appscreen', screen: 'quran' }), { type: 'route', pathname: '/quran' });
  assert.equal(t({ kind: 'appscreen', screen: 'inconnu' }), null);
  assert.deepEqual(t({ kind: 'talk', ref: 'abc' }), { type: 'route', pathname: '/talk/[id]', params: { id: 'abc' } });
  assert.deepEqual(t({ kind: 'series', ref: 'abc' }), { type: 'route', pathname: '/series/[id]', params: { id: 'abc' } });
  assert.deepEqual(t({ kind: 'collection', ref: 'abc' }), { type: 'route', pathname: '/collections/[id]', params: { id: 'abc' } });
  assert.deepEqual(t({ kind: 'channel', ref: 'mon-slug' }), { type: 'route', pathname: '/speaker/[slug]', params: { slug: 'mon-slug' } });
  assert.deepEqual(t({ kind: 'page', ref: '/p/ma-page' }), { type: 'site', url: 'https://site.test/p/ma-page' });
  assert.deepEqual(t({ kind: 'url', href: '/pricing' }), { type: 'site', url: 'https://site.test/pricing' });
  assert.deepEqual(t({ kind: 'url', href: 'https://exemple.org' }), { type: 'site', url: 'https://exemple.org' });
  assert.deepEqual(t({ kind: 'url', href: 'mailto:a@b.fr' }), { type: 'link', url: 'mailto:a@b.fr' });
  assert.deepEqual(t({ kind: 'url', href: 'tel:+33123' }), { type: 'link', url: 'tel:+33123' });
  assert.equal(t({ kind: 'url', href: 'javascript:alert(1)' }), null, 'adresse dangereuse ignorée');
  assert.equal(t({ kind: 'talk' }), null, 'contenu sans identifiant');
  assert.equal(t({ kind: 'builtin', key: 'home' }), null, 'les liens d\'origine du site n\'ont pas d\'écran');
});

test('écrans : fonction coupée, membres, séries', () => {
  const it: MenuItem = { id: 'a', kind: 'appscreen', screen: 'shorts', label: L('Shorts') };
  assert.equal(resolveAppMenu([it], ctx({ feat: (f) => f !== 'shorts' }))!.length, 0, 'fonction coupée : le lien disparaît');
  assert.equal(resolveAppMenu([it], ctx())!.length, 1);
  const lib: MenuItem = { id: 'b', kind: 'appscreen', screen: 'library', label: L('Biblio') };
  assert.equal(resolveAppMenu([lib], ctx())!.length, 0, 'bibliothèque : membres seulement');
  assert.equal(resolveAppMenu([lib], ctx({ loggedIn: true }))!.length, 1);
  const ser: MenuItem = { id: 'c', kind: 'appscreen', screen: 'series', label: L('Séries') };
  assert.equal(resolveAppMenu([ser], ctx({ hasSeries: false }))!.length, 0);
  for (const [k, s] of Object.entries(SCREENS)) assert.ok(s.pathname.startsWith('/') && s.icon, `écran ${k}`);
});

test('public, téléphone, langue', () => {
  assert.ok(audienceOk(undefined, ctx()) && audienceOk('all', ctx()));
  assert.ok(audienceOk('visitor', ctx()) && !audienceOk('visitor', ctx({ loggedIn: true })));
  assert.ok(!audienceOk('member', ctx()) && audienceOk('member', ctx({ loggedIn: true })));
  assert.ok(!audienceOk('manager', ctx({ loggedIn: true, role: 'user' })) && audienceOk('manager', ctx({ loggedIn: true, role: 'moderator' })));
  assert.ok(onPhone(undefined) && onPhone([]) && onPhone(['m', 'd']) && !onPhone(['d']) && !onPhone(['t', 'd']));
  assert.equal(labelOf(L('Salut', 'Hello'), 'en'), 'Hello');
  assert.equal(labelOf(L('Salut'), 'ar'), 'Salut', 'langue absente : français');
  assert.equal(labelOf(undefined, 'fr'), '');
});

test('menu ☰ : titres, sous-menus, éléments retirés', () => {
  const items: MenuItem[] = [
    { id: 'a', kind: 'appscreen', screen: 'home', label: L('Accueil') },
    { id: 'b', kind: 'heading', label: L('Découvrir', 'Discover'), children: [
      { id: 'b1', kind: 'appscreen', screen: 'quran', label: L('Coran') },
      { id: 'b2', kind: 'url', href: '/x', label: L('Membres'), audience: 'member' },
      { id: 'b3', kind: 'talk', ref: 'u1', label: L('Conf') },
    ] },
    { id: 'c', kind: 'heading', label: L('Vide'), children: [{ id: 'c1', kind: 'url', href: '/y', label: L('Y'), audience: 'manager' }] },
    { id: 'd', kind: 'url', href: '/d', label: L('Bureau'), devices: ['d'] },
    { id: 'e', kind: 'url', href: '/e' },
    { id: 'f', kind: 'builtin', key: 'home' },
  ];
  const r = resolveAppMenu(items, ctx({ locale: 'en' }))!;
  assert.deepEqual(r.map((x) => x.key), ['a', 'b'], 'titre sans sous-lien visible, ordinateur seulement, sans texte, lien d\'origine : retirés');
  assert.equal(r[1].label, 'Discover');
  assert.deepEqual(r[1].children.map((x) => x.key), ['b1', 'b3'], 'lien « membres » absent pour un visiteur');
  assert.equal(r[1].target, null);
  assert.deepEqual(resolveAppMenu(items, ctx({ loggedIn: true }))![1].children.map((x) => x.key), ['b1', 'b2', 'b3']);
  assert.equal(r[0].icon, 'home', 'icône par défaut de l\'écran');
});

test('onglets : 5 au plus, avec adresse, onglet actif', () => {
  const mk = (n: number): MenuItem[] => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, kind: 'appscreen', screen: 'home', label: L(`T${i}`) }));
  assert.equal(resolveTabs(mk(7), ctx())!.length, 5);
  const tabs = resolveTabs([{ id: 'a', kind: 'appscreen', screen: 'talks', label: L('Catalogue'), icon: 'star' }, { id: 'b', kind: 'talk', ref: 'u1', label: L('Conf') }], ctx())!;
  assert.equal(tabs[0].icon, 'star', 'icône choisie dans Admin → Menus');
  assert.ok(tabActive(tabs[0].target, '/talks') && tabActive(tabs[0].target, '/talks/abc') && !tabActive(tabs[0].target, '/talksx'));
  assert.ok(tabActive({ type: 'route', pathname: '/' }, '/') && !tabActive({ type: 'route', pathname: '/' }, '/talks'));
  assert.ok(tabActive(tabs[1].target, '/talk/u1') && !tabActive(tabs[1].target, '/talk/u2'));
  assert.ok(!tabActive({ type: 'site', url: 'https://x' }, '/'));
});
