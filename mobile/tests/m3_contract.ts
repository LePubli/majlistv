// Étape M3 — essai de bout en bout contre une VRAIE API de test : athkar (offre Apprentissage requise, compteur, objectif,
// rappel, remise à zéro), saison en cours et vendredi. Un dhikr FICTIF est créé puis supprimé.
// Lancer l'API avec des dates simulées (un vendredi de Ramadan), puis :
//   API_TEST_URL=http://127.0.0.1:3055 npx tsx tests/m3_contract.ts
// Non lancé par « npm test ». À NE PAS lancer contre le site réel.
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../src/lib/api';
import { isLearningRequired } from '../src/lib/learn';
import { catsPresent, clampGoal, seasonWhen, type AthkarResponse, type Friday, type Season } from '../src/lib/athkar';
import { translate } from '../src/lib/i18n';
import type { User } from '../src/lib/types';

const URL_ = process.env.API_TEST_URL;
if (!URL_) { console.log('API_TEST_URL absent : essai ignoré'); process.exit(0); }
if (/le-publicitaire\.fr/.test(URL_)) { console.log('Refusé : cet essai ne se lance que contre une API de test.'); process.exit(2); }
let token: string | null = null;
const api = createApi({ baseUrl: URL_, getToken: () => token });
const step = (s: string) => console.log('  ✓ ' + s);

async function main() {
  // Membre sans l'offre Apprentissage : l'écran affiche l'encadré « offre requise ».
  const reg = await api.post<{ token: string; user: User }>('/auth/register', { email: `m3-${Date.now()}@test.local`, password: 'Passw0rd-m3-test', locale: 'fr' });
  token = reg.token;
  try { await api.get('/athkar', { lang: 'fr' }); assert.fail('aurait dû être refusé'); } catch (e) { assert.ok(isLearningRequired(e), 'code learning_required'); }
  step('membre sans offre Apprentissage : refus reconnu par l\'application');

  const adm = await api.post<{ token: string }>('/auth/login', { email: process.env.ADMIN_EMAIL ?? 'admin@test.local', password: process.env.ADMIN_PASSWORD ?? 'AdminPassw0rd-test' });
  token = adm.token;
  const item = await api.post<{ id: number }>('/admin/athkar', {
    category: 'sleep', textAr: 'نَصٌّ تَجْرِيبِيٌّ', translit: 'nass tajribi', trFr: 'Texte fictif (essai M3)', trEn: 'Test text (M3)', reference: 'Essai automatique — à supprimer',
    target: 3, position: 9999, validated: true, enabled: true,
  });
  try {
    const d = await api.get<AthkarResponse>('/athkar', { lang: 'fr' });
    const mine = d.items.find((x) => x.id === item.id)!;
    assert.ok(mine, 'dhikr publié visible'); assert.equal(mine.tr, 'Texte fictif (essai M3)'); assert.equal(mine.count, 0);
    assert.ok(catsPresent(d.items).includes('sleep'));
    assert.match(d.today, /^\d{4}-\d{2}-\d{2}$/);
    const en = await api.get<AthkarResponse>('/athkar', { lang: 'en' });
    assert.equal(en.items.find((x) => x.id === item.id)!.tr, 'Test text (M3)');
    const ar = await api.get<AthkarResponse>('/athkar', { lang: 'ar' });
    assert.equal(ar.items.find((x) => x.id === item.id)!.tr, '', 'en arabe : pas de traduction');
    step(`GET /athkar (fr, en, ar) : ${d.items.length} dhikr publiés, le dhikr d'essai avec sa traduction`);

    const before = d.doneToday;
    assert.equal((await api.post<{ count: number }>(`/athkar/${item.id}/tap`, { n: 2 })).count, 2);
    assert.equal((await api.post<{ count: number }>(`/athkar/${item.id}/tap`, { n: 1 })).count, 3);
    const after = await api.get<AthkarResponse>('/athkar', { lang: 'fr' });
    assert.equal(after.items.find((x) => x.id === item.id)!.count, 3);
    assert.equal(after.doneToday, before + 1, 'dhikr terminé compté dans « Terminés aujourd\'hui »');
    step('touchers groupés (2 puis 1) : objectif atteint, compté dans la journée');

    await api.put('/athkar/prefs', { goal: clampGoal('7'), remindHour: 7 });
    const p = await api.get<AthkarResponse>('/athkar', { lang: 'fr' });
    assert.equal(p.goal, 7); assert.equal(p.remindHour, 7);
    await api.put('/athkar/prefs', { goal: 1, remindHour: null });
    assert.equal((await api.post<{ count: number }>(`/athkar/${item.id}/reset`)).count, 0);
    try { await api.post('/athkar/999999999/tap', { n: 1 }); assert.fail(); } catch (e) { assert.ok(e instanceof ApiError && e.status === 404); }
    step('objectif et rappel enregistrés, remise à zéro, dhikr inconnu refusé');
  } finally {
    await api.del(`/admin/athkar/${item.id}`).catch(() => {});
    step('dhikr d\'essai supprimé');
  }

  token = null;
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('fr', k, v);
  const s = (await api.get<{ season: Season }>('/seasons/current', { lang: 'fr' }, false)).season;
  if (s) {
    assert.ok(s.id && s.title && Array.isArray(s.talks));
    step(`GET /seasons/current : ${s.id} — « ${seasonWhen(s, t)} »`);
  } else step('GET /seasons/current : aucune saison en cours (bandeau masqué)');
  const f = await api.get<Friday>('/friday', { lang: 'fr' }, false);
  if (f.active) {
    assert.ok(Array.isArray(f.talks)); assert.equal(f.kahf === null || typeof f.kahf.n === 'number', true);
    step(`GET /friday : vendredi actif (Al-Kahf ${f.kahf ? (f.kahf.ready ? 'prête' : 'pas prête') : 'masquée'})`);
  } else step('GET /friday : pas vendredi ou désactivé (bandeau masqué)');
  console.log('M3 : contrat OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
