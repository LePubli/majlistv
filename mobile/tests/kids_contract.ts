// 22b-9a/9b : essai du client Kids contre une vraie API (lancé à la main, pas par « npm test »).
//   KIDS_FIXTURE="$(python3 api/tests/kids_fixture.py | tail -1)" API_URL=http://127.0.0.1:3055 npx tsx tests/kids_contract.ts   (depuis mobile/)
// Parcours de l'application : état parent → code parental → profil → entrée (jeton enfant) → catalogue → recherche → lecture + reprise → temps → sortie par code.
import assert from 'node:assert/strict';
import { createApi, ApiError } from '../src/lib/api';
import { DICT, translate } from '../src/lib/i18n';
import { actionStateKey, actionsOpenCount, exitMessage, leftMin, openActions, playableShorts, quizAnswers, starsMessageKey, parseKidSession, progressBody, resolveShelves, searchTerm, serializeKidSession, shelfTitle, validPin } from '../src/lib/kids';
import { pickSource } from '../src/lib/playback';
import type { KidAction, KidActionCounts, KidCatalog, KidCard, KidProfile, KidQuizQuestion, KidQuizResult, KidShort, KidSummary, KidsState, KidTime, Talk } from '../src/lib/types';

const fx = JSON.parse(process.env.KIDS_FIXTURE || '{}') as { token: string; talkId: string; rubricId: number; shortId: string };
const base = process.env.API_URL || 'http://127.0.0.1:3055';
const parent = createApi({ baseUrl: base, getToken: () => fx.token });
const t = (k: string, v?: Record<string, string | number>) => translate('fr', k as never, v);
assert.ok(DICT.fr.kdWho, 'textes Kids importés');

async function main() {
  let st = await parent.get<KidsState>('/me/kids');
  assert.equal(st.allowed, true); assert.equal(st.hasPin, false); assert.deepEqual(st.bands, ['3-6', '7-10', '11-14']);
  console.log('état parent OK');

  assert.equal(validPin('12'), false);
  await assert.rejects(() => parent.put('/me/kids/pin', { code: '12' }), (e: ApiError) => e.status === 400);
  await parent.put('/me/kids/pin', { code: '2468' });
  st = await parent.get<KidsState>('/me/kids'); assert.equal(st.hasPin, true);
  const p = await parent.post<KidProfile>('/me/kids/profiles', { name: 'Yacine', avatar: 'fox', band: '7-10' });
  await assert.rejects(() => parent.post('/me/kids/profiles', { name: 'Yacine', avatar: 'lion', band: '3-6' }), (e: ApiError) => e.code === 'duplicate');
  console.log('code parental + profil OK');

  const entered = await parent.post<{ token: string; profile: KidProfile }>(`/me/kids/profiles/${p.id}/enter`);
  const stored = parseKidSession(serializeKidSession({ token: entered.token, profile: entered.profile, issuedAt: Date.now() }));
  assert.equal(stored?.profile.name, 'Yacine');
  const kid = createApi({ baseUrl: base, getToken: () => stored!.token });
  // Le jeton enfant est refusé hors de l'espace enfant.
  await assert.rejects(() => kid.get('/me/kids'), (e: ApiError) => e.status === 403 && e.code === 'kid_mode');
  console.log('entrée + verrou du jeton enfant OK');

  const cat = await kid.get<KidCatalog>('/kids/catalog');
  assert.ok(cat.talks.some((x) => x.id === fx.talkId), 'la conférence Kids est dans le catalogue');
  const rows = resolveShelves(cat.shelves, cat.talks, false, 'x');
  assert.ok(rows.length > 0);
  const titles = rows.map((r) => shelfTitle(r.shelf, { t, rubrics: cat.rubrics, locale: 'fr' }));
  assert.ok(titles.includes('Nouveautés'), `rangées : ${titles.join(' | ')}`);
  assert.ok(cat.rubrics.some((r) => r.id === fx.rubricId));
  assert.equal(resolveShelves(cat.shelves, cat.talks, true, '3-6').length, 0, 'filtre âge : aucune vidéo dont la plus jeune tranche est 3-6');
  console.log('catalogue OK :', titles.join(' | '));

  assert.equal(searchTerm('é'), null);
  const found = await kid.get<{ talks: KidCard[] }>('/kids/search', { q: 'etoiles' }); // sans accent : trouve « étoiles »
  assert.ok(found.talks.some((x) => x.id === fx.talkId), 'recherche sans accents');
  console.log('recherche OK');

  const talk = await kid.get<Talk>(`/talks/${fx.talkId}`);
  const src = pickSource(talk, base);
  assert.ok(src.uri?.includes('/hls/') && src.uri.includes('t='), 'flux HLS avec jeton');
  const playlist = await fetch(src.uri!); assert.equal(playlist.status, 200);
  assert.equal(progressBody(3, 20), null); const body = progressBody(12.4, 600)!; assert.deepEqual(body, { positionMs: 12400, durationMs: 600000 }); // (la vidéo d'essai ne dure que 20 s : 600 s évite le « terminé » automatique)
  assert.equal((await kid.put<{ ok: boolean }>(`/kids/progress/${fx.talkId}`, body)).ok, true);
  const again = await kid.get<Talk>(`/talks/${fx.talkId}`); assert.equal(again.resumeMs, 12400, 'reprise propre à l\'enfant');
  const cat2 = await kid.get<KidCatalog>('/kids/catalog'); assert.equal(cat2.shelves[0].kind, 'resume'); assert.equal(cat2.talks.find((x) => x.id === fx.talkId)!.positionMs, 12400);
  console.log('lecture + reprise OK');

  const tm = await kid.post<KidTime>('/kids/ping'); assert.equal(tm.timeUp, false); assert.equal(leftMin(tm), null);
  await parent.put(`/me/kids/profiles/${p.id}/controls`, { dailyLimitMin: 15 });
  const tm2 = await kid.post<KidTime>('/kids/ping'); assert.ok((leftMin(tm2) ?? 99) <= 15 && !tm2.timeUp);
  console.log('temps OK : reste', leftMin(tm2), 'min');

  // 22b-9b : quiz (réponses jamais envoyées avec les questions), étoiles, petites actions, courts.
  const qz = await kid.get<{ questions: KidQuizQuestion[] }>(`/kids/talks/${fx.talkId}/quiz`);
  assert.equal(qz.questions.length, 5); assert.ok(qz.questions.every((x) => !('correct_index' in x) && !('correctIndex' in x) && x.options.length === 3), 'pas de réponse dans les questions');
  assert.equal(quizAnswers(qz.questions, [1, 1, 1, 1]), null, 'envoi incomplet refusé côté application');
  const good = quizAnswers(qz.questions, qz.questions.map(() => 1))!; assert.equal(good.length, 5);
  const bad = await kid.post<KidQuizResult>(`/kids/talks/${fx.talkId}/quiz/submit`, { answers: quizAnswers(qz.questions, qz.questions.map(() => 0))! });
  assert.equal(bad.stars, 1); assert.equal(starsMessageKey(bad.stars), 'kdStars1'); assert.equal(bad.score, 0);
  const win = await kid.post<KidQuizResult>(`/kids/talks/${fx.talkId}/quiz/submit`, { answers: good });
  assert.equal(win.stars, 3); assert.equal(win.score, 5); assert.equal(win.totalStars, 3, 'la meilleure note compte, rejouer ne fait pas baisser');
  assert.ok(win.results.every((r) => r.correct && r.correctIndex === 1));
  const sm = await kid.get<KidSummary>('/kids/summary'); assert.equal(sm.stars, 3); assert.equal(sm.quizzes, 2);
  assert.equal((await kid.get<KidCatalog>('/kids/catalog')).talks.find((x) => x.id === fx.talkId)!.stars, 3);
  assert.equal((await kid.get<Talk>(`/talks/${fx.talkId}`)).quiz?.available, true);
  console.log('quiz + étoiles OK (', win.stars, 'étoiles ; badges', sm.badges.length, ')');

  const act = await parent.post<{ id: string }>(`/me/kids/profiles/${p.id}/actions`, { title: 'Ranger ma chambre' });
  let acts = await kid.get<{ actions: KidAction[]; counts: KidActionCounts }>('/kids/actions');
  assert.equal(acts.actions[0].status, 'todo'); assert.equal(actionsOpenCount(acts.counts), 1); assert.equal(actionStateKey(acts.actions[0].status), 'kaStTodo');
  await kid.post(`/kids/actions/${act.id}/claim`);
  acts = await kid.get('/kids/actions'); assert.equal(acts.actions[0].status, 'claimed'); assert.equal(actionStateKey('claimed'), 'kaStClaimed');
  await parent.post(`/me/kids/profiles/${p.id}/actions/${act.id}/validate`);
  acts = await kid.get('/kids/actions'); assert.equal(acts.actions[0].status, 'validated'); assert.equal(openActions(acts.actions).length, 0);
  console.log('petites actions OK');

  const shorts = playableShorts(await kid.get<KidShort[]>('/shorts', { limit: 20 }));
  assert.equal(shorts.length, 1); assert.equal(shorts[0].id, fx.shortId); assert.equal(shorts[0].talk.id, fx.talkId);
  await kid.post(`/shorts/${fx.shortId}/view`);
  console.log('courts OK');

  // Sortie : mauvais code (essais restants) puis bon code (jeton du parent).
  let wrong: ApiError | null = null;
  try { await kid.post('/kids/exit', { code: '0000' }); } catch (e) { wrong = e as ApiError; }
  assert.equal(wrong?.code, 'bad_pin'); assert.equal(wrong?.data?.left, 4);
  assert.equal(exitMessage({ status: wrong!.status, code: wrong!.code, data: wrong!.data, message: wrong!.message }, t), 'Ce n\'est pas le bon code. Il reste 4 essai(s).');
  const out = await kid.post<{ token: string; user: { id: string } }>('/kids/exit', { code: '2468' });
  assert.ok(out.token && out.user.id);
  const back = createApi({ baseUrl: base, getToken: () => out.token });
  assert.equal((await back.get<KidsState>('/me/kids')).profiles.length, 1);
  console.log('sortie par code OK');
  console.log('TOUT OK');
}
main().catch((e) => { console.error(e); process.exit(1); });
