// 22b-6 / 22b-6 bis : essai du client contre une vraie API (lancé à la main, pas par « npm test »).
//   OFFLINE_FIXTURE='{"token":"…","freeToken":"…","talkId":"…"}' API_URL=http://127.0.0.1:3055 npx tsx tests/offline_contract.ts
// Parcours de l'application : options → préparation (attente) → téléchargement → empreinte → renouvellement → refus sans abonnement.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApi, ApiError } from '../src/lib/api';
import { errorCodeFor, parsePrepare, pollDelay, applyRenewal, type DownloadRecord, fileNameFor, parseIndex, packNameFor } from '../src/lib/downloads';
import { licenceState, verifyLicence } from '../src/lib/license';
import { gradeQuiz, parsePack } from '../src/lib/offlinePack';
import { submitBody } from '../src/lib/learn';

const fx = JSON.parse(process.env.OFFLINE_FIXTURE || '{}') as { token: string; freeToken: string; talkId: string; freeTalkId: string };
const base = process.env.API_URL || 'http://127.0.0.1:3055';
const apiOf = (token: string) => createApi({ baseUrl: base, getToken: () => token });
const api = apiOf(fx.token);

async function main() {
  const opts = await api.get<{ validDays: number; audio: { estimatedBytes: number } | null; video: { height: number }[] }>(`/me/offline/${fx.talkId}/options`);
  assert.equal(opts.video.map((v) => v.height).join(), '360,720'); assert.ok(opts.audio);
  console.log('options OK', JSON.stringify(opts));

  let ready: ReturnType<typeof parsePrepare> = null;
  for (let i = 0; i < 60 && ready?.kind !== 'ready'; i += 1) {
    const res = parsePrepare(await api.post<unknown>(`/me/offline/${fx.talkId}`, { kind: 'video', height: 360, retry: i === 0 }));
    assert.ok(res && res.kind !== 'failed', 'préparation échouée');
    ready = res;
    if (res.kind === 'preparing') await new Promise((r) => setTimeout(r, Math.min(pollDelay(i), 1000)));
  }
  assert.equal(ready?.kind, 'ready'); if (ready?.kind !== 'ready') throw new Error('x');
  const bytes = Buffer.from(await (await fetch(ready.url)).arrayBuffer());
  assert.equal(bytes.length, ready.size); assert.equal(createHash('sha256').update(bytes).digest('hex'), ready.sha256);
  console.log('téléchargement + empreinte OK', bytes.length, 'octets');

  const rec: DownloadRecord = { talkId: fx.talkId, userId: 'u', title: 'T', speaker: '', durationSeconds: 20, kind: 'video', height: 360, size: ready.size, sha256: ready.sha256,
    file: fileNameFor(fx.talkId, 'video', 360), poster: null, downloadedAt: Date.now(), expiresAt: ready.expiresAt, licence: ready.licence, pack: null, packAt: 0, positionMs: 0, synced: true, version: ready.version };
  const me = await api.get<{ id: string }>('/auth/me');
  rec.userId = me.id;
  assert.equal(parseIndex(JSON.stringify([rec])).length, 1);

  // Licence : la signature faite par le serveur (Node) est acceptée par l'application (tweetnacl) et liée au bon compte / fichier.
  const lic = verifyLicence(ready.licence, ready.publicKey);
  assert.ok(lic && lic.sub === me.id && lic.talk === fx.talkId && lic.sha === ready.sha256 && lic.h === 360);
  assert.equal(licenceState(rec, me.id, ready.publicKey, Date.now()).state, 'ok');
  assert.equal(licenceState(rec, 'autre-compte', ready.publicKey, Date.now()).state, 'wrong_user');
  assert.equal(licenceState(rec, me.id, ready.publicKey, Date.now() + 31 * 86400000).state, 'expired');
  assert.equal(licenceState({ ...rec, sha256: 'c'.repeat(64) }, me.id, ready.publicKey, Date.now()).state, 'wrong_file');
  assert.ok(Math.abs(ready.serverTime - Date.now()) < 60000, 'heure du serveur fournie');
  console.log('licence signée OK');

  // Renouvellement par fichier : nouvelle licence valide.
  const ren = await api.post<{ items: { talkId: string; ok: boolean; expiresAt?: string; reason?: string; kind?: 'audio' | 'video'; licence?: string; publicKey?: string }[]; serverTime: string }>(
    '/me/offline/renew', { files: [{ talkId: fx.talkId, kind: 'video', height: 360, sha256: ready.sha256 }] });
  const renewed = applyRenewal([rec], ren.items, Date.now()).records[0];
  assert.equal(licenceState(renewed, me.id, ren.items[0].publicKey!, Date.now()).state, 'ok'); assert.ok(renewed.licence);
  console.log('renouvellement abonné OK');

  // Pack hors connexion : résumé, chapitres, transcription, quiz ; la correction locale donne le même résultat que le serveur.
  const pack = parsePack(await api.get<unknown>(`/me/offline/${fx.talkId}/pack`));
  assert.ok(pack && pack.insights[0].summary === 'Résumé test' && pack.transcripts[0].segments[0].t === 'Bonjour' && pack.quiz && pack.quiz.questions.length === 5);
  assert.equal(packNameFor(fx.talkId).startsWith('pack-'), true);
  const answers: Record<string, number> = {}; pack.quiz!.questions.forEach((q, i) => { answers[q.id] = i < 3 ? q.correctIndex : (q.correctIndex + 1) % 3; });
  const local = gradeQuiz(pack.quiz!, answers);
  const server = await api.post<{ score: number; percent: number; passed: boolean; results: { questionId: string; correct: boolean; correctIndex: number }[] }>(`/talks/${fx.talkId}/quiz/submit`, submitBody(pack.quiz!.questions, answers));
  assert.equal(local.score, server.score); assert.equal(local.percent, server.percent); assert.equal(local.passed, server.passed);
  assert.deepEqual(local.results.map((r) => [r.questionId, r.correct, r.correctIndex]), server.results.map((r) => [r.questionId, r.correct, r.correctIndex]));
  console.log('pack + quiz local = quiz serveur OK');

  // Un compte sans abonnement : refusé à la préparation (code « subscription ») et au renouvellement (téléchargement supprimé).
  const free = apiOf(fx.freeToken);
  await assert.rejects(() => free.post(`/me/offline/${fx.talkId}`, { kind: 'audio' }), (e: unknown) => e instanceof ApiError && errorCodeFor(e.status, e.code) === 'subscription');
  const ren2 = await free.post<{ items: { talkId: string; ok: boolean; reason?: string }[] }>('/me/offline/renew', { files: [{ talkId: fx.talkId, kind: 'video', height: 360, sha256: ready.sha256 }] });
  assert.equal(applyRenewal([rec], ren2.items, Date.now()).removed.length, 1);
  // Même une conférence en accès libre est réservée aux abonnés pour le téléchargement et le pack.
  await assert.rejects(() => free.post(`/me/offline/${fx.freeTalkId}`, { kind: 'audio' }), (e: unknown) => e instanceof ApiError && errorCodeFor(e.status, e.code) === 'subscription');
  await assert.rejects(() => free.get(`/me/offline/${fx.freeTalkId}/pack`), (e: unknown) => e instanceof ApiError && e.status === 403);
  console.log('refus sans abonnement (y compris conférence libre) OK');
  console.log('TOUT OK');
}
main().catch((e) => { console.error(e); process.exit(1); });
