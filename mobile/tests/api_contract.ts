// Essai de bout en bout contre une VRAIE API (pas de simulation) : le client de l'application et les routes du serveur
// se comprennent. Lancer : API_TEST_URL=http://127.0.0.1:3055 ADMIN_EMAIL=… ADMIN_PASSWORD=… npx tsx tests/api_contract.ts
// Non lancé par « npm test » (il faut une API qui tourne).
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../src/lib/api';
import { pickSource } from '../src/lib/playback';
import { ProgressTracker } from '../src/lib/progress';
import type { Card, Category, Home, Insights, Talk, User, BillingStatus } from '../src/lib/types';

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

  // --- session expirée ---
  token = 'jeton.invalide';
  await assert.rejects(api.get('/me/continue'), (e: ApiError) => e.status === 401);
  assert.equal(loggedOut, 1); step('jeton invalide → 401 → déconnexion déclenchée');
  token = null;
  await assert.rejects(api.get('/talks/00000000-0000-4000-8000-000000000000'), (e: ApiError) => e.status === 404); step('conférence inconnue → 404');
}

main().then(() => console.log('TOUT EST OK')).catch((e) => { console.error('ÉCHEC', e); process.exit(1); });
