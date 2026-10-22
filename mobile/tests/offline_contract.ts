// 22b-6 : essai du client contre une vraie API (lancé à la main, pas par « npm test »).
//   OFFLINE_FIXTURE='{"token":"…","freeToken":"…","talkId":"…"}' API_URL=http://127.0.0.1:3055 npx tsx tests/offline_contract.ts
// Parcours de l'application : options → préparation (attente) → téléchargement → empreinte → renouvellement → refus sans abonnement.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApi, ApiError } from '../src/lib/api';
import { errorCodeFor, parsePrepare, pollDelay, applyRenewal, type DownloadRecord, fileNameFor, parseIndex } from '../src/lib/downloads';

const fx = JSON.parse(process.env.OFFLINE_FIXTURE || '{}') as { token: string; freeToken: string; talkId: string };
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
    file: fileNameFor(fx.talkId, 'video', 360), poster: null, downloadedAt: Date.now(), expiresAt: ready.expiresAt, positionMs: 0, synced: true, version: ready.version };
  assert.equal(parseIndex(JSON.stringify([rec])).length, 1);
  const ren = await api.post<{ items: { talkId: string; ok: boolean; expiresAt?: string; reason?: string }[] }>('/me/offline/renew', { talkIds: [fx.talkId] });
  assert.equal(applyRenewal([rec], ren.items, Date.now()).records.length, 1);
  console.log('renouvellement abonné OK');

  // Un compte sans abonnement : refusé à la préparation (code « subscription ») et au renouvellement (téléchargement supprimé).
  const free = apiOf(fx.freeToken);
  await assert.rejects(() => free.post(`/me/offline/${fx.talkId}`, { kind: 'audio' }), (e: unknown) => e instanceof ApiError && errorCodeFor(e.status, e.code) === 'subscription');
  const ren2 = await free.post<{ items: { talkId: string; ok: boolean; reason?: string }[] }>('/me/offline/renew', { talkIds: [fx.talkId] });
  assert.equal(applyRenewal([rec], ren2.items, Date.now()).removed.length, 1);
  console.log('refus sans abonnement OK');
  console.log('TOUT OK');
}
main().catch((e) => { console.error(e); process.exit(1); });
