// Étape M6 — essai de bout en bout contre une VRAIE API de test : nouveau compte (« Par quoi commencer ? » une seule fois),
// parrainage (code, lien, rattachement d'un compte neuf, refus de son propre code), cartes cadeaux (liste, codes refusés).
//   API_TEST_URL=http://127.0.0.1:3055 npx tsx tests/m6_contract.ts
// Non lancé par « npm test ». À NE PAS lancer contre le site réel (il crée des comptes).
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../src/lib/api';
import { codeOk, giftCode, referralLink, showStart, type Gift, type Referral } from '../src/lib/onboarding';
import type { AppConfig, User } from '../src/lib/types';

const URL_ = process.env.API_TEST_URL;
if (!URL_) { console.log('API_TEST_URL absent : essai ignoré'); process.exit(0); }
if (/le-publicitaire\.fr/.test(URL_)) { console.log('Refusé : cet essai ne se lance que contre une API de test.'); process.exit(2); }
let token: string | null = null;
const api = createApi({ baseUrl: URL_, getToken: () => token });
const step = (s: string) => console.log('  ✓ ' + s);
const reg = async (tag: string) => api.post<{ token: string; user: User }>('/auth/register', { email: `m6-${tag}-${Date.now()}@test.local`, password: 'Passw0rd-m6-test', locale: 'fr' });

async function main() {
  const cfg = await api.get<AppConfig>('/config', undefined, false);
  const feat = (id: string) => cfg.features[id] !== false;

  const a = await reg('a');
  token = a.token;
  let me = await api.get<User>('/auth/me');
  assert.equal(me.onboarded, false, 'nouveau compte : pas encore vu');
  assert.equal(showStart(me, feat), feat('onboarding'));
  await api.put('/me/onboarding', { done: true });
  me = await api.get<User>('/auth/me');
  assert.equal(me.onboarded, true); assert.equal(showStart(me, feat), false);
  step('nouveau compte : « Par quoi commencer ? » affiché puis enregistré comme vu');

  if (feat('referral')) {
    const r = await api.get<Referral>('/me/referral');
    assert.ok(codeOk(r.code), `code lisible : ${r.code}`);
    assert.match(referralLink('https://site.example', r.code), /register\?ref=/);
    assert.equal(r.stats.invited, 0); assert.equal(r.referredBy, null);
    try { await api.post('/me/referral/claim', { code: r.code }); assert.fail(); } catch (e) { assert.ok(e instanceof ApiError && e.code === 'self'); }
    const b = await reg('b');
    token = b.token;
    await api.post('/me/referral/claim', { code: r.code });
    const rb = await api.get<Referral>('/me/referral');
    assert.ok(rb.referredBy, 'filleul rattaché');
    token = a.token;
    const ra = await api.get<Referral>('/me/referral');
    assert.equal(ra.stats.invited, 1); assert.equal(ra.stats.pending, 1);
    step('parrainage : code, refus de son propre code, filleul rattaché, compteurs du parrain (1 invité, en attente)');
  } else step('parrainage : fonction coupée');

  if (feat('gifts')) {
    const g = await api.get<Gift[]>('/me/gifts');
    assert.ok(Array.isArray(g) && g.length === 0);
    assert.equal(giftCode('abcd'), null);
    try { await api.post('/gifts/redeem', { code: 'ABCD-EFGH-JKLM' }); assert.fail(); } catch (e) { assert.ok(e instanceof ApiError && e.code === 'unknown'); }
    try { await api.post('/gifts/redeem', { code: 'abc' }); assert.fail(); } catch (e) { assert.ok(e instanceof ApiError && e.code === 'bad_code'); }
    step('cartes cadeaux : liste vide, code inconnu et code mal formé refusés avec un message');
  } else step('cartes cadeaux : fonction coupée');
  console.log('M6 : contrat OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
