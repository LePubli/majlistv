// Essai de bout en bout contre une VRAIE API (pas de simulation) : le client de l'application et les routes du serveur
// se comprennent. Lancer : API_TEST_URL=http://127.0.0.1:3055 ADMIN_EMAIL=… ADMIN_PASSWORD=… npx tsx tests/api_contract.ts
// Non lancé par « npm test » (il faut une API qui tourne).
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../src/lib/api';
import { pickSource } from '../src/lib/playback';
import { ProgressTracker } from '../src/lib/progress';
import { canCommit, commitBody, isLearningRequired, submitBody } from '../src/lib/learn';
import type {
  Card, Category, Home, Insights, Talk, User, BillingStatus, ListsResponse, ListDetail, QuizData, QuizResult, PracticeTalk,
  Commitment, PracticeMine, RevisionResponse, LearningResponse, QuizTodoCard,
} from '../src/lib/types';

const URL_ = process.env.API_TEST_URL;
if (!URL_) { console.log('API_TEST_URL absent : essai ignoré'); process.exit(0); }
const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@test.local';
const adminPassword = process.env.ADMIN_PASSWORD ?? 'AdminPassw0rd-test';

let token: string | null = null;
let loggedOut = 0;
const api = createApi({ baseUrl: URL_, getToken: () => token, onUnauthorized: () => { loggedOut++; } });
const step = (s: string) => console.log('  ✓ ' + s);

async function main() {
  // --- visiteur ---
  const home = await api.get<Home>('/home');
  assert.ok(['text', 'featured', 'custom'].includes(home.hero.mode)); step('GET /home (visiteur) : bannière ' + home.hero.mode);
  assert.ok(Array.isArray(home.rows));
  const cats = await api.get<Category[]>('/categories');
  assert.ok(Array.isArray(cats)); step('GET /categories : ' + cats.length + ' catégories');

  // --- inscription + connexion ---
  const email = `app+${Date.now()}@test.local`;
  const reg = await api.post<{ token: string; user: User }>('/auth/register', { email, password: 'Motdepasse-123', name: 'Essai', locale: 'ar' });
  assert.equal(reg.user.email, email); assert.ok(reg.token); step('POST /auth/register');
  await assert.rejects(api.post('/auth/login', { email, password: 'faux-mot-de-passe' }), (e: ApiError) => e.status === 401); step('mauvais mot de passe → 401 (sans déconnexion forcée)');
  assert.equal(loggedOut, 0);
  const login = await api.post<{ token: string; user: User }>('/auth/login', { email, password: 'Motdepasse-123' });
  token = login.token;
  const me = await api.get<User>('/auth/me');
  assert.equal(me.name, 'Essai'); assert.equal(me.locale, 'ar'); step('POST /auth/login + GET /auth/me');

  // --- une conférence de test (compte administrateur) ---
  const admin = await createApi({ baseUrl: URL_, getToken: () => null }).post<{ token: string }>('/auth/login', { email: adminEmail, password: adminPassword });
  const adminApi = createApi({ baseUrl: URL_, getToken: () => admin.token });
  const tag = Date.now();
  const created = await adminApi.post<{ id: string }>('/talks', {
    title: `Essai application ${tag}`, speaker: 'Intervenant test', description: 'Un résumé de test.', access: 'free',
    videoUrl: 'https://archive.org/details/testitem' + tag, rightsConfirmed: true,
  }).catch((e: ApiError) => { console.log('    (création via archive.org impossible ici : ' + e.message + ')'); return null; });

  // Catalogue : on prend la première conférence disponible (créée ou existante).
  let list = await api.get<Card[]>('/talks', { limit: 5 });
  step('GET /talks : ' + list.length + ' conférence(s)');
  let talkId = list[0]?.id ?? created?.id;
  if (!talkId) {
    console.log('  ! aucune conférence prête dans cette base : essais de lecture ignorés');
    return;
  }
  const q = await api.get<Card[]>('/talks', { q: list[0].title.split(' ')[0], limit: 5 });
  assert.ok(Array.isArray(q)); step('GET /talks?q= (recherche)');
  const c0 = list[0];
  assert.ok(typeof c0.id === 'string' && typeof c0.title === 'string' && 'speaker' in c0); step('forme d’une carte : id, title, speaker, source…');

  // --- fiche + lecture ---
  const talk = await api.get<Talk>(`/talks/${talkId}`);
  assert.equal(talk.id, talkId);
  const src = pickSource(talk, URL_);
  step(`GET /talks/:id → source : ${talk.source}, uri ${src.uri ? 'oui' : 'non'}, externe ${src.external}, verrouillé ${!!talk.locked}`);
  if (talk.playbackToken) {
    const ins = await api.get<Insights>(`/talks/${talkId}/insights`, { t: talk.playbackToken, lang: 'fr' });
    assert.ok(Array.isArray(ins.chapters) && Array.isArray(ins.keyPoints)); step('GET /talks/:id/insights');
  }
  if (src.uri && src.uri.startsWith(URL_)) {
    const m3u8 = await fetch(src.uri);
    assert.ok([200, 404].includes(m3u8.status)); step('GET playlist HLS → ' + m3u8.status);
  }

  // --- reprise de lecture : le suiveur de l'application écrit, le serveur relit ---
  let sent = 0;
  const tracker = new ProgressTracker(async (p) => { await api.put(`/me/progress/${talkId}`, p); sent++; }, { intervalMs: 10000 });
  tracker.update(125_000, 600_000, false);
  await tracker.flush();
  assert.equal(sent, 1);
  const cont = await api.get<Card[]>('/me/continue');
  const mine = cont.find((c) => c.id === talkId);
  assert.ok(mine, 'la conférence apparaît dans « Continuer à regarder »');
  assert.equal(mine!.positionMs, 125_000); step('PUT /me/progress → GET /me/continue : position 125 000 ms');
  const again = await api.get<Talk>(`/talks/${talkId}`);
  assert.equal(again.resumeMs, talk.locked ? again.resumeMs : 125_000); step('GET /talks/:id → resumeMs relu');

  // --- favori ---
  await api.put(`/me/favorites/${talkId}`);
  assert.equal((await api.get<Talk>(`/talks/${talkId}`)).favorite, true);
  await api.del(`/me/favorites/${talkId}`);
  assert.equal((await api.get<Talk>(`/talks/${talkId}`)).favorite, false); step('favori : ajout / retrait');

  // --- abonnement (lecture seule) ---
  const b = await api.get<BillingStatus>('/billing/status');
  assert.equal(typeof b.active, 'boolean'); step('GET /billing/status : actif = ' + b.active);

  // --- tranche 2a : listes personnelles ---
  const created1 = await api.post<{ id: string; title: string; items: number }>('/me/lists', { title: 'Ma liste de test' });
  assert.equal(created1.items, 0);
  await api.put(`/me/lists/${created1.id}/items/${talkId}`);
  const inList = await api.get<string[]>(`/me/lists/containing/${talkId}`);
  assert.deepEqual(inList, [created1.id]);
  const detail = await api.get<ListDetail>(`/me/lists/${created1.id}`);
  assert.equal(detail.talks.length, 1); assert.equal(detail.talks[0].id, talkId);
  const all = await api.get<ListsResponse>('/me/lists');
  assert.equal(all.lists.find((l) => l.id === created1.id)?.items, 1); assert.ok(all.limit >= 1);
  step('listes : création, ajout, « contient », détail, compteur');
  await api.del(`/me/lists/${created1.id}/items/${talkId}`);
  assert.equal((await api.get<ListDetail>(`/me/lists/${created1.id}`)).talks.length, 0);
  await api.del(`/me/lists/${created1.id}`);
  await assert.rejects(api.get(`/me/lists/${created1.id}`), (e: ApiError) => e.status === 404); step('listes : retrait de la conférence puis suppression');

  // --- tranche 2a : quiz et mise en pratique (contenu créé par l'administrateur) ---
  const qids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const q = await adminApi.post<{ id: string }>(`/talks/${talkId}/studio/quiz/questions`, {
      question: `Question de test numéro ${i + 1} ?`, options: ['Bonne réponse', 'Mauvaise A', 'Mauvaise B', 'Mauvaise C'], correctIndex: 0,
      explanation: `Parce que l'intervenant le dit (${i + 1}).`, evidenceMs: 1000 * (i + 1),
    });
    await adminApi.patch(`/studio/quiz/questions/${q.id}`, { status: 'approved' });
    qids.push(q.id);
  }
  const sids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const sg = await adminApi.post<{ id: string }>(`/talks/${talkId}/studio/practice/suggestions`, { text: `Action de test numéro ${i + 1} à faire`, size: i + 1 });
    await adminApi.patch(`/studio/practice/suggestions/${sg.id}`, { status: 'approved' });
    sids.push(sg.id);
  }
  step('contenu de test : 3 questions de quiz et 2 propositions d’action validées (API Studio)');

  const quiz = await api.get<QuizData>(`/talks/${talkId}/quiz`);
  assert.equal(quiz.questions.length, 3); assert.ok(quiz.passPercent > 0);
  assert.ok(!JSON.stringify(quiz).includes('correctIndex'), 'les bonnes réponses ne sont pas envoyées avant la validation');
  assert.ok(quiz.questions.every((q) => q.options.length >= 2));
  step('GET /talks/:id/quiz : 3 questions, sans les bonnes réponses');
  const wrong = await api.post<QuizResult>(`/talks/${talkId}/quiz/submit`, submitBody(quiz.questions, Object.fromEntries(quiz.questions.map((q) => [q.id, 3]))));
  assert.equal(wrong.passed, false); assert.equal(wrong.percent, 0); assert.equal(wrong.saved, true); assert.equal(wrong.learning, null);
  assert.ok(wrong.results.every((r) => r.correct === false && r.correctIndex === 0 && !!r.explanation));
  const right = await api.post<QuizResult>(`/talks/${talkId}/quiz/submit`, submitBody(quiz.questions, Object.fromEntries(quiz.questions.map((q) => [q.id, 0]))));
  assert.equal(right.passed, true); assert.equal(right.percent, 100); assert.equal(right.best, 100);
  step('POST /quiz/submit : tout faux → 0 % (corrections), tout juste → 100 % réussi, enregistré');
  const guestApi = createApi({ baseUrl: URL_, getToken: () => null });
  const g = await guestApi.post<QuizResult>(`/talks/${talkId}/quiz/submit`, submitBody(quiz.questions, { [quiz.questions[0].id]: 0 }));
  assert.equal(g.saved, false); assert.equal(g.score, 1); step('quiz en visiteur : corrigé mais non enregistré (saved = false)');
  const todo = await api.get<QuizTodoCard[]>('/me/quiz/todo');
  assert.ok(Array.isArray(todo)); step('GET /me/quiz/todo : ' + todo.length + ' à passer');

  // Membre sans l'offre Apprentissage : 403 « learning_required » partout où c'est réservé.
  for (const path of ['/me/revision', '/me/learning', '/me/practice']) {
    await assert.rejects(api.get(path), (e: ApiError) => isLearningRequired(e), path);
  }
  const pub = await api.get<PracticeTalk>(`/talks/${talkId}/practice`);
  assert.equal(pub.suggestions.length, 2); assert.equal(pub.tier, false); assert.equal(pub.signedIn, true); assert.deepEqual(pub.mine, []);
  await assert.rejects(api.post(`/talks/${talkId}/practice/commitments`, commitBody({ suggestionId: sids[0], text: '', niyya: '', due: null, consent: true, consentGiven: false })), (e: ApiError) => isLearningRequired(e));
  assert.equal(loggedOut, 0);
  step('sans offre Apprentissage : /me/revision, /me/learning, /me/practice et « Je m’engage » → 403 learning_required (sans déconnexion)');

  // Compte avec l'offre (administrateur = accès complet) : révision, score, engagements.
  const rev = await adminApi.get<RevisionResponse>('/me/revision');
  assert.ok(Array.isArray(rev.items) && typeof rev.total === 'number'); step('GET /me/revision (offre) : ' + rev.items.length + ' à réviser');
  const aq = await adminApi.get<QuizData>(`/talks/${talkId}/quiz`);
  const ar = await adminApi.post<QuizResult>(`/talks/${talkId}/quiz/submit`, submitBody(aq.questions, Object.fromEntries(aq.questions.map((q) => [q.id, 0]))));
  assert.ok(ar.learning && ar.learning.newBadges.includes('first_quiz'), 'premier quiz → badge first_quiz');
  const learn = await adminApi.get<LearningResponse>('/me/learning');
  assert.equal(learn.badges.length, 8); assert.ok(learn.score >= 1); assert.ok(learn.badges.find((b) => b.id === 'first_quiz')?.earned);
  step('quiz (offre) : score et badge « first_quiz » gagné ; GET /me/learning : 8 badges, score ' + learn.score);

  await assert.rejects(adminApi.post(`/talks/${talkId}/practice/commitments`, { suggestionId: sids[0], niyya: '', due: null }), (e: ApiError) => e.status === 409 && e.code === 'consent_required');
  assert.equal(canCommit({ suggestionId: sids[0], text: '', consent: false, consentGiven: false }), false);
  const com = await adminApi.post<Commitment>(`/talks/${talkId}/practice/commitments`, commitBody({ suggestionId: sids[0], text: '', niyya: 'Pour progresser', due: 'week', consent: true, consentGiven: false }));
  assert.equal(com.status, 'todo'); assert.equal(com.niyya, 'Pour progresser'); assert.ok(com.text.startsWith('Action de test')); assert.ok(com.dueOn);
  const own = await adminApi.post<Commitment>(`/talks/${talkId}/practice/commitments`, commitBody({ suggestionId: null, text: ' Ma propre action ', niyya: '', due: null, consent: false, consentGiven: true }));
  assert.equal(own.text, 'Ma propre action'); assert.equal(own.dueOn, null);
  step('engagements : accord exigé (409), proposition + intention + échéance, texte libre');
  const pub2 = await adminApi.get<PracticeTalk>(`/talks/${talkId}/practice`);
  assert.equal(pub2.tier, true); assert.equal(pub2.consent, true); assert.equal(pub2.mine.length, 2);
  const upd = await adminApi.patch<Commitment>(`/me/practice/${com.id}`, { status: 'done' });
  assert.equal(upd.status, 'done'); assert.ok(upd.doneAt);
  const myPractice = await adminApi.get<PracticeMine>('/me/practice');
  assert.equal(myPractice.counts.done, 1); assert.equal(myPractice.counts.todo, 1); assert.equal(myPractice.items.length, 2);
  step('PATCH /me/practice/:id (statut « fait ») ; GET /me/practice : compteurs fait 1 / à faire 1');
  await adminApi.del(`/me/practice/${com.id}`); await adminApi.del(`/me/practice/${own.id}`);
  assert.equal((await adminApi.get<PracticeMine>('/me/practice')).items.length, 0); step('nettoyage : engagements supprimés');

  // --- session expirée ---
  token = 'jeton.invalide';
  await assert.rejects(api.get('/me/continue'), (e: ApiError) => e.status === 401);
  assert.equal(loggedOut, 1); step('jeton invalide → 401 → déconnexion déclenchée');
  token = null;
  await assert.rejects(api.get('/talks/00000000-0000-4000-8000-000000000000'), (e: ApiError) => e.status === 404); step('conférence inconnue → 404');
}

main().then(() => console.log('TOUT EST OK')).catch((e) => { console.error('ÉCHEC', e); process.exit(1); });
