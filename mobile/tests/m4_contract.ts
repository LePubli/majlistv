// Étape M4 — essai de bout en bout contre une VRAIE API de test datée pendant Ramadan : circuit (cases, rattrapage, refus d'avance,
// tarawih, rappel), bilan (à partir du 20e jour), enfant (« je l'ai fait »), pastille du parent, validation. Actions FICTIVES créées
// puis supprimées ; profil enfant d'essai supprimé. Lancer l'API avec RAMADAN_NOW (ex. 2026-03-12, 23e jour), puis :
//   API_TEST_URL=http://127.0.0.1:3055 npx tsx tests/m4_contract.ts
// Non lancé par « npm test ». À NE PAS lancer contre le site réel.
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../src/lib/api';
import { bilanCards, canMark, itemsOf, marksOf, statusLine, type Bilan, type KidRamadanResponse, type ParentRamadanResponse, type PendingResponse, type RamadanResponse } from '../src/lib/ramadan';
import { translate } from '../src/lib/i18n';
import type { User } from '../src/lib/types';

const URL_ = process.env.API_TEST_URL;
if (!URL_) { console.log('API_TEST_URL absent : essai ignoré'); process.exit(0); }
if (/le-publicitaire\.fr/.test(URL_)) { console.log('Refusé : cet essai ne se lance que contre une API de test.'); process.exit(2); }
let token: string | null = null;
const api = createApi({ baseUrl: URL_, getToken: () => token });
const step = (s: string) => console.log('  ✓ ' + s);
const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('fr', k, v);
const tri = (s: string) => ({ fr: s, en: s, ar: s });

async function main() {
  const adm = await api.post<{ token: string }>('/auth/login', { email: process.env.ADMIN_EMAIL ?? 'admin@test.local', password: process.env.ADMIN_PASSWORD ?? 'AdminPassw0rd-test' });
  token = adm.token;
  const st0 = (await api.get<RamadanResponse>('/ramadan', { lang: 'fr' })).status;
  assert.ok(st0.active && st0.day, 'l\'API doit être datée pendant Ramadan (RAMADAN_NOW)');
  const today = st0.day!;
  const mk = (b: object) => api.post<{ id: number }>('/admin/ramadan/items', { link: '', reference: 'Essai automatique M4', position: 9999, validated: true, enabled: true, text: tri(''), ...b });
  const every = await mk({ audience: 'adult', day: 0, title: tri('Essai M4 — chaque jour') });
  const todayItem = await mk({ audience: 'adult', day: today, title: tri('Essai M4 — jour du jour'), link: '/coran/18#v10' });
  const kidItem = await mk({ audience: 'kid', day: today, title: tri('Essai M4 — enfant') });
  const ids = [every.id, todayItem.id, kidItem.id];
  let profileId: string | null = null;
  try {
    // Membre : circuit
    const reg = await api.post<{ token: string; user: User }>('/auth/register', { email: `m4-${Date.now()}@test.local`, password: 'Passw0rd-m4-test', locale: 'fr' });
    token = reg.token;
    let d = await api.get<RamadanResponse>('/ramadan', { lang: 'fr' });
    assert.equal(statusLine(d.status, t, 'fr'), `Jour ${today} de Ramadan ${d.status.hyear}`);
    assert.ok(itemsOf(d, today).some((x) => x.id === todayItem.id) && itemsOf(d, today).some((x) => x.id === every.id));
    assert.equal(canMark(d, today), true); assert.equal(canMark(d, today + 1), false);
    await api.put('/ramadan/mark', { day: today, itemId: todayItem.id, done: true });
    await api.put('/ramadan/mark', { day: 1, itemId: every.id, done: true });
    try { await api.put('/ramadan/mark', { day: Math.min(30, today + 1), itemId: every.id, done: true }); if (today < 30) assert.fail(); } catch (e) { assert.ok(e instanceof ApiError && e.status === 400); }
    d = await api.get<RamadanResponse>('/ramadan', { lang: 'fr' });
    assert.deepEqual(marksOf(d, today), [todayItem.id]); assert.deepEqual(marksOf(d, 1), [every.id]);
    step(`circuit : jour ${today}, cocher le jour, rattraper le jour 1, refus du lendemain`);
    await api.put('/ramadan/tarawih', { day: today, done: true, rakaat: 8, place: 'mosque' });
    await api.put('/ramadan/prefs', { remindHour: 21 });
    d = await api.get<RamadanResponse>('/ramadan', { lang: 'fr' });
    assert.deepEqual(d.me?.tarawih[String(today)], { rakaat: 8, place: 'mosque' }); assert.equal(d.me?.remindHour, 21);
    step('tarawih (8 rakaat, mosquée) et rappel 21 h');
    const b = (await api.get<{ bilan: Bilan }>('/ramadan/bilan')).bilan;
    if (today >= 20) {
      assert.ok(b); assert.equal(b!.tarawih.nights, 1); assert.equal(b!.tarawih.rakaat, 8); assert.ok(b!.actions.done >= 2);
      assert.equal(bilanCards(b!, t, () => true).length, 5);
      await api.put('/ramadan/bilan/note', { text: 'Note d\'essai M4' });
      assert.equal((await api.get<{ bilan: Bilan }>('/ramadan/bilan')).bilan!.note, 'Note d\'essai M4');
      step('bilan : chiffres, note chiffrée enregistrée et relue');
    } else step(`bilan : fermé avant le 20e jour (bilan=${JSON.stringify(b)})`);

    // Parent (admin) et enfant
    token = adm.token;
    const ks = await api.get<{ hasPin: boolean; profiles: { id: string }[] }>('/me/kids');
    if (!ks.hasPin) await api.put('/me/kids/pin', { code: '4826' });
    try { profileId = (await api.post<{ id: string }>('/me/kids/profiles', { name: `Essai${Date.now() % 100000}`, avatar: 'owl', band: '7-10' })).id; }
    catch (e) { if (!(e instanceof ApiError && e.code === 'limit')) throw e; }
    const pid = profileId ?? ks.profiles[0]?.id;
    assert.ok(pid, 'un profil enfant est nécessaire');
    const before = await api.get<PendingResponse>('/me/kids/pending');
    const kid = await api.post<{ token: string }>(`/me/kids/profiles/${pid}/enter`);
    token = kid.token;
    let k = await api.get<KidRamadanResponse>('/kids/ramadan', { lang: 'fr' });
    const mine = k.items.find((x) => x.id === kidItem.id)!;
    assert.equal(mine.state, 'todo');
    await api.post('/kids/ramadan/claim', { itemId: kidItem.id });
    k = await api.get<KidRamadanResponse>('/kids/ramadan', { lang: 'fr' });
    assert.equal(k.items.find((x) => x.id === kidItem.id)!.state, 'claimed');
    step('enfant : action du jour, « Je l\'ai fait » → en attente');
    token = adm.token;
    const after = await api.get<PendingResponse>('/me/kids/pending');
    assert.equal(after.total, before.total + 1, 'pastille +1');
    assert.ok(after.profiles.find((p) => p.id === pid)!.ramadan >= 1);
    const pr = await api.get<ParentRamadanResponse>(`/me/kids/profiles/${pid}/ramadan`, { lang: 'fr' });
    assert.equal(pr.days[0].day, today); assert.equal(pr.days[0].items.find((x) => x.id === kidItem.id)!.state, 'claimed');
    await api.post(`/me/kids/profiles/${pid}/ramadan/validate`, { day: today, itemId: kidItem.id });
    assert.equal((await api.get<PendingResponse>('/me/kids/pending')).total, before.total, 'pastille revenue');
    await api.put('/me/kids/pending-prefs', { email: false });
    assert.equal((await api.get<{ pendingEmail: boolean }>('/me/kids')).pendingEmail, false);
    await api.put('/me/kids/pending-prefs', { email: true });
    step('parent : pastille +1, 7 derniers jours, validation, pastille revenue, préférence e-mail');
  } finally {
    token = adm.token;
    for (const id of ids) await api.del(`/admin/ramadan/items/${id}`).catch(() => {});
    if (profileId) await api.del(`/me/kids/profiles/${profileId}`).catch(() => {});
    step('actions et profil d\'essai supprimés');
  }
  console.log('M4 : contrat OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
