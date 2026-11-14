// Étape C-3 — contenus payants à l'unité dans l'application et sur la télé.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromPrice, ownedActive, rentUnit, saleMoney, salePageUrl, type Sale } from '../src/lib/sales';
import { DICT } from '../src/lib/i18n';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const sale = (o: Partial<Sale> = {}): Sale => ({ currency: 'eur', buy: { price: 799, memberPrice: 599, yourPrice: 799 }, rent: { price: 299, memberPrice: 224, yourPrice: 299, hours: 48 }, memberDiscountPct: 25, member: false, owned: null, ...o });

test('règles pures', () => {
  assert.equal(saleMoney(799, 'eur', 'fr').replace(/\s/g, ' '), '7,99 €');
  assert.equal(saleMoney(1200, 'eur', 'fr').replace(/\s/g, ' '), '12 €');
  assert.deepEqual(rentUnit(48), { unit: 'days', n: 2 });
  assert.deepEqual(rentUnit(24), { unit: 'hours', n: 24 });
  assert.deepEqual(rentUnit(36), { unit: 'hours', n: 36 });
  assert.equal(salePageUrl('https://site.test/', 'talk', 'a1'), 'https://site.test/talks/a1');
  assert.equal(salePageUrl('https://site.test', 'audyn', 'b2'), 'https://site.test/audyn/b2');
  assert.equal(fromPrice(sale()), 299);
  assert.equal(fromPrice(sale({ rent: null })), 799);
  assert.equal(fromPrice(null), null);
  assert.equal(ownedActive({ mode: 'buy', expiresAt: null }), true);
  assert.equal(ownedActive({ mode: 'rent', expiresAt: new Date(Date.now() + 60000).toISOString() }), true);
  assert.equal(ownedActive({ mode: 'rent', expiresAt: new Date(Date.now() - 60000).toISOString() }), false);
  assert.equal(ownedActive(null), false);
});

test('écrans : vidéo, Audyn, compte, télé', () => {
  const talk = read('src/app/talk/[id].tsx');
  assert.match(talk, /locked && talk\.sale \? <SaleCard kind="talk" id=\{talk\.id\} sale=\{talk\.sale\} onRefresh=\{onRefresh\} \/> : locked \? <LockCard/);
  assert.match(talk, /\$\{talk\.data\.locked \? 'l' : 'o'\}/, 'le lecteur est recréé quand l’achat ouvre la vidéo');
  const au = read('src/app/audyn/[id].tsx');
  assert.match(au, /!book\.access\.full && book\.sale \? <SaleCard kind="audyn"/);
  assert.match(au, /\[id, user\?\.id\]/);
  const card = read('src/components/SaleCard.tsx');
  assert.match(card, /Linking\.openURL\(salePageUrl\(SITE_URL, kind, id\)\)/);
  assert.match(card, /AppState\.addEventListener\('change', \(st\) => \{ if \(st === 'active'\) onRefresh\(\); \}\)/);
  assert.match(card, /api\.get<Purchase\[\]>\('\/me\/purchases'\)/);
  assert.match(read('src/app/(tabs)/account.tsx'), /user && feat\('sales'\) \? <PurchasesSection \/>/);
  const tv = read('src/components/tv/TvSale.tsx');
  assert.match(tv, /<QrCode value=\{url\}/); assert.match(tv, /setInterval\(onRefresh, TV_SALE_POLL_MS\)/);
  assert.match(read('src/app/tv/talk/[id].tsx'), /x\.locked && x\.sale \? \(\s*<TvSale kind="talk"/);
  assert.match(read('src/app/tv/audyn/[id].tsx'), /!b\.access\.full && b\.sale \? <TvSale kind="audyn"/);
  for (const k of ['sale.title', 'sale.buy', 'sale.rent', 'sale.buyOnSite', 'sale.siteHelp', 'sale.refresh', 'sale.mine', 'sale.owned', 'sale.rentedUntil', 'tv.saleScan', 'tv.saleLogin'])
    for (const l of ['fr', 'en', 'ar'] as const) assert.ok((DICT[l] as Record<string, string>)[k], `${l}:${k}`);
});

test('étape D : liens vers les pages légales dans Mon compte', () => {
  const acc = read('src/app/(tabs)/account.tsx');
  for (const slug of ['mentions-legales', 'cgv', 'confidentialite']) assert.ok(acc.includes(`'${slug}'`), slug);
  assert.ok(acc.includes('`${SITE_URL}/legal/${slug}`'));
  for (const k of ['legal.notice', 'legal.terms', 'legal.privacy']) for (const l of ['fr', 'en', 'ar'] as const) assert.ok((DICT[l] as Record<string, string>)[k], `${l}:${k}`);
});
