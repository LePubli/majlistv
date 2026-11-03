// Étape M5 — essai de bout en bout contre une VRAIE API de test : Apprendre (tableau de bord, révision, cartes mémoire,
// parcours et attestations, bilan personnel et évolution, assistant). Le compte administrateur de test sert de compte
// « Apprentissage » ; l'objectif de bilan créé est supprimé à la fin. Lancer :
//   API_TEST_URL=http://127.0.0.1:3055 npx tsx tests/m5_contract.ts
// Non lancé par « npm test ». À NE PAS lancer contre le site réel.
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../src/lib/api';
import { isLearningRequired } from '../src/lib/learn';
import { askErrorKey, cardsToday, goalsFull, requeue, type CardsResponse, type EvolutionResponse, type Goal, type SelfCheckResponse } from '../src/lib/learnHub';
import type { User } from '../src/lib/types';

const URL_ = process.env.API_TEST_URL;
if (!URL_) { console.log('API_TEST_URL absent : essai ignoré'); process.exit(0); }
if (/le-publicitaire\.fr/.test(URL_)) { console.log('Refusé : cet essai ne se lance que contre une API de test.'); process.exit(2); }
let token: string | null = null;
const api = createApi({ baseUrl: URL_, getToken: () => token });
const step = (s: string) => console.log('  ✓ ' + s);

async function main() {
  // Membre sans offre : écran « offre requise » (cartes, bilan, apprentissage).
  const reg = await api.post<{ token: string; user: User }>('/auth/register', { email: `m5-${Date.now()}@test.local`, password: 'Passw0rd-m5-test', locale: 'fr' });
  token = reg.token;
  for (const p of ['/me/learning', '/me/cards', '/me/selfcheck']) {
    try { await api.get(p); assert.fail(p); } catch (e) { assert.ok(isLearningRequired(e), `${p} : learning_required`); }
  }
  assert.ok(Array.isArray(await api.get('/me/quiz/todo')), 'quiz à passer ouverts à tout membre');
  step('membre sans offre : apprentissage, cartes et bilan refusés (écran « offre »), quiz à passer ouverts');

  const adm = await api.post<{ token: string }>('/auth/login', { email: process.env.ADMIN_EMAIL ?? 'admin@test.local', password: process.env.ADMIN_PASSWORD ?? 'AdminPassw0rd-test' });
  token = adm.token;
  const l = await api.get<{ score: number; badges: unknown[]; series: { id: string; complete: boolean; attestation: unknown }[]; recent: unknown[] }>('/me/learning');
  assert.equal(typeof l.score, 'number'); assert.ok(Array.isArray(l.series)); assert.ok(l.series.every((s) => 'attestation' in s), 'attestation présente sur chaque parcours');
  const rv = await api.get<{ items: unknown[]; upcoming: { week: number }; emailEnabled?: boolean }>('/me/revision');
  assert.ok(Array.isArray(rv.items) && typeof rv.upcoming.week === 'number');
  step(`tableau de bord : score ${l.score}, ${l.badges.length} badges, ${l.series.length} parcours, ${rv.items.length} révision(s)`);
  for (const s of l.series.filter((x) => !x.complete).slice(0, 1)) {
    try { await api.post('/me/learning/attestations', { seriesId: s.id }); assert.fail(); } catch (e) { assert.ok(e instanceof ApiError && e.code === 'incomplete'); }
    step('attestation refusée pour un parcours incomplet (code incomplete)');
  }

  const c = await api.get<CardsResponse>('/me/cards');
  assert.ok(c.counts && c.session && Array.isArray(c.session.cards));
  assert.equal(cardsToday(c.counts), c.counts.due + c.counts.newAvailable);
  if (c.session.cards.length) {
    const card = c.session.cards[0];
    assert.ok(card.id && card.front && card.answer && card.talkId);
    const q = requeue(c.session.cards, card, false, new Set());
    assert.equal(q.queue.at(-1)?.id, card.id);
    step(`cartes : ${c.session.cards.length} carte(s) aujourd'hui, recto/verso complets (pas de réponse envoyée : le calendrier reste intact)`);
  } else step(`cartes : aucune carte aujourd'hui (total ${c.counts.total})`);
  const free = await api.get<CardsResponse>('/me/cards', { free: '1' });
  assert.equal(free.free, true);

  const sc = await api.get<SelfCheckResponse>('/me/selfcheck');
  assert.equal(sc.weeks.length, 8); assert.equal(sc.week, sc.weeks.at(-1));
  let created: Goal | null = null;
  try {
    if (goalsFull(sc)) { step('bilan : limite d\'objectifs atteinte, création non essayée'); }
    else {
      created = await api.post<Goal>('/me/selfcheck/goals', { nature: 'quality', title: 'Objectif d\'essai M5', ...(sc.consent ? {} : { consent: true }) });
      assert.equal(created.title, 'Objectif d\'essai M5');
      const ck = await api.put<{ status: string; note: string }>(`/me/selfcheck/goals/${created.id}/checkin`, { status: 'progress', note: 'Note d\'essai' });
      assert.equal(ck.status, 'progress'); assert.equal(ck.note, 'Note d\'essai');
      const ar = await api.patch<Goal>(`/me/selfcheck/goals/${created.id}`, { archived: true });
      assert.equal(ar.archived, true);
      const again = await api.get<SelfCheckResponse>('/me/selfcheck');
      assert.ok(!again.goals.some((g) => g.id === created?.id), 'archivé : hors de la liste active');
      const withA = await api.get<SelfCheckResponse>('/me/selfcheck', { archived: '1' });
      const mine = withA.goals.find((g) => g.id === created?.id)!;
      assert.equal(mine.marks[sc.week], 'progress');
      step('bilan : objectif créé, point « En progrès » avec note chiffrée, archivé, frise de la semaine');
    }
  } finally {
    if (created) await api.del(`/me/selfcheck/goals/${created.id}`).catch(() => {});
  }
  const ev = await api.get<EvolutionResponse>('/me/evolution');
  assert.equal(ev.months.length, 12); assert.ok(ev.months.includes(ev.month));
  step(`évolution : ${ev.months.length} mois, ${ev.themes.length} thème(s) ce mois`);

  const talk = (await api.get<{ id: string }[]>('/talks', { limit: 1 }, false))[0];
  if (talk) {
    try {
      const info = await api.get<{ available: boolean; reason?: string; remaining?: number }>(`/talks/${talk.id}/ask`);
      step(`assistant : ${info.available ? `disponible (${info.remaining} question(s) restantes)` : `indisponible — texte affiché : ${askErrorKey(info.reason)}`}`);
    } catch (e) { assert.ok(e instanceof ApiError); step(`assistant : refus ${e.status} → texte ${askErrorKey(e.code, e.status)}`); }
    const h = await api.get<{ items: unknown[] }>(`/talks/${talk.id}/ask/history`).catch(() => ({ items: [] }));
    assert.ok(Array.isArray(h.items));
  }
  console.log('M5 : contrat OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
