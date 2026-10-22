// 22b-6 : logique pure du hors connexion (index des téléchargements, renouvellement, réponses du serveur).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DownloadRecord, applyRenewal, daysLeft, errorCodeFor, fileNameFor, isExpired, isSafeFile, parseIndex, parsePrepare, pollDelay, resumeFor, shouldRenew, totalBytes, upsert, RENEW_EVERY_MS,
} from '../src/lib/downloads';
import { APP_DICT } from '../src/lib/i18n';

const T1 = '3f2a1b9c-1111-4222-8333-444455556666';
const T2 = '4f2a1b9c-1111-4222-8333-444455556666';
const NOW = Date.UTC(2026, 9, 22, 12);
const rec = (over: Partial<DownloadRecord> = {}): DownloadRecord => ({
  talkId: T1, userId: 'u1', title: 'T', speaker: 'S', durationSeconds: 3000, kind: 'video', height: 720, size: 100, sha256: 'a'.repeat(64), file: fileNameFor(T1, 'video', 720),
  poster: null, downloadedAt: NOW, expiresAt: NOW + 30 * 86400000, positionMs: 0, synced: true, version: '0', ...over,
});

test('fileNameFor / isSafeFile : jamais de chemin libre', () => {
  assert.equal(fileNameFor(T1, 'audio', 0), `${T1}-audio.m4a`); assert.equal(fileNameFor(T1, 'video', 360), `${T1}-video-360.mp4`);
  assert.ok(isSafeFile(`${T1}-audio.m4a`) && isSafeFile(`${T1}-video-720.mp4`));
  for (const bad of ['../x.mp4', `${T1}-video-720.mp4/../../etc`, 'index.json', `${T1}-video-720.mp4.part`, '', null, 5]) assert.equal(isSafeFile(bad), false, String(bad));
});

test('parseIndex : lignes invalides ignorées, une ligne par conférence', () => {
  const good = rec(); const newer = rec({ downloadedAt: NOW + 5, title: 'récent', kind: 'audio', height: 0, file: fileNameFor(T1, 'audio', 0) });
  const raw = JSON.stringify([good, newer, rec({ talkId: T2, file: fileNameFor(T2, 'audio', 0), kind: 'audio', height: 0 }), { talkId: 'x' }, null, 5,
    { ...good, talkId: '5f2a1b9c-1111-4222-8333-444455556666', file: '../../evil' }, { ...good, kind: 'film' }]);
  const out = parseIndex(raw);
  assert.equal(out.length, 2); assert.equal(out.find((r) => r.talkId === T1)!.title, 'récent');
  assert.deepEqual(parseIndex('pas du json'), []); assert.deepEqual(parseIndex('{"a":1}'), []); assert.deepEqual(parseIndex(null), []); assert.deepEqual(parseIndex(''), []);
});

test('parseIndex : valeurs étranges ramenées à des valeurs sûres', () => {
  const r = parseIndex(JSON.stringify([{ ...rec(), title: 'x'.repeat(1000), positionMs: -5, size: 'grand', synced: undefined, poster: '../p.jpg' }]))[0];
  assert.equal(r.title.length, 300); assert.equal(r.positionMs, 0); assert.equal(r.size, 0); assert.equal(r.synced, true); assert.equal(r.poster, null);
  assert.equal(parseIndex(JSON.stringify([{ ...rec(), poster: `${T1}.jpg` }]))[0].poster, `${T1}.jpg`);
});

test('expiration et jours restants', () => {
  const r = rec();
  assert.equal(isExpired(r, NOW), false); assert.equal(isExpired(r, r.expiresAt), true); assert.equal(isExpired(r, r.expiresAt + 1), true);
  assert.equal(daysLeft(r, NOW), 30); assert.equal(daysLeft(r, NOW + 29.5 * 86400000), 1); assert.equal(daysLeft(r, r.expiresAt + 5), 0);
});

test('applyRenewal : prolongé, supprimé (abonnement fini / conférence retirée), gardé (autre refus)', () => {
  const rs = [rec(), rec({ talkId: T2, file: fileNameFor(T2, 'audio', 0), kind: 'audio', height: 0 })];
  const later = new Date(NOW + 60 * 86400000).toISOString();
  let r = applyRenewal(rs, [{ talkId: T1, ok: true, expiresAt: later }, { talkId: T2, ok: false, reason: 'subscription' }], NOW);
  assert.equal(r.records.length, 1); assert.equal(r.records[0].expiresAt, Date.parse(later)); assert.deepEqual(r.removed.map((x) => x.talkId), [T2]);
  r = applyRenewal(rs, [{ talkId: T1, ok: false, reason: 'gone' }, { talkId: T2, ok: false, reason: 'not_ready' }], NOW);
  assert.deepEqual(r.removed.map((x) => x.talkId), [T1]); assert.equal(r.records.length, 1); assert.equal(r.records[0].talkId, T2);
  r = applyRenewal(rs, [{ talkId: T1, ok: true, expiresAt: 'n importe quoi' }], NOW);
  assert.equal(r.records[0].expiresAt, rs[0].expiresAt, 'date invalide : inchangée');
  r = applyRenewal(rs, [{ talkId: T1, ok: true, expiresAt: new Date(NOW - 1000).toISOString() }], NOW);
  assert.equal(r.records[0].expiresAt, rs[0].expiresAt, 'date passée : inchangée');
  r = applyRenewal(rs, [], NOW); assert.equal(r.records.length, 2); assert.equal(r.removed.length, 0);
});

test('shouldRenew : au plus toutes les 12 h', () => {
  assert.equal(shouldRenew(null, NOW), true); assert.equal(shouldRenew(NOW, NOW + RENEW_EVERY_MS - 1), false); assert.equal(shouldRenew(NOW, NOW + RENEW_EVERY_MS), true);
  assert.equal(shouldRenew(NOW + 10, NOW), true, 'horloge reculée'); assert.equal(shouldRenew(NOW, NOW + 1, true), true);
});

test('upsert / totalBytes / resumeFor / pollDelay', () => {
  const a = rec({ size: 10 }); const b = rec({ talkId: T2, file: fileNameFor(T2, 'audio', 0), size: 5 });
  assert.equal(upsert([a, b], rec({ size: 99 })).length, 2); assert.equal(upsert([a, b], rec({ size: 99 }))[0].size, 99); assert.equal(totalBytes([a, b]), 15);
  assert.equal(resumeFor({ positionMs: 3000, durationSeconds: 100 }), 0); assert.equal(resumeFor({ positionMs: 50_000, durationSeconds: 100 }), 50_000); assert.equal(resumeFor({ positionMs: 95_000, durationSeconds: 100 }), 0);
  assert.equal(pollDelay(0), 1500); assert.equal(pollDelay(100), 5000);
});

test('parsePrepare : réponses du serveur validées', () => {
  const sha = 'b'.repeat(64);
  assert.deepEqual(parsePrepare({ status: 'preparing' }), { kind: 'preparing' });
  assert.deepEqual(parsePrepare({ status: 'failed', error: 'boom' }), { kind: 'failed', error: 'boom' });
  const ok = parsePrepare({ status: 'ready', url: 'https://s3.example/x', size: 1234, sha256: sha, expiresAt: '2026-11-21T12:00:00.000Z', version: '0', height: 720 });
  assert.equal(ok?.kind, 'ready'); if (ok?.kind === 'ready') { assert.equal(ok.size, 1234); assert.equal(ok.expiresAt, Date.parse('2026-11-21T12:00:00.000Z')); }
  for (const bad of [null, 'x', {}, { status: 'ready' }, { status: 'ready', url: 'ftp://x', size: 1, sha256: sha, expiresAt: '2026-11-21T12:00:00Z' }, { status: 'ready', url: 'https://x', size: 0, sha256: sha, expiresAt: '2026-11-21T12:00:00Z' },
    { status: 'ready', url: 'https://x', size: 1, sha256: 'zz', expiresAt: '2026-11-21T12:00:00Z' }, { status: 'ready', url: 'https://x', size: 1, sha256: sha, expiresAt: 'jamais' }, { status: 'autre' }]) {
    assert.equal(parsePrepare(bad), null, JSON.stringify(bad)?.slice(0, 40));
  }
});

test('errorCodeFor', () => {
  assert.equal(errorCodeFor(403, 'subscription'), 'subscription'); assert.equal(errorCodeFor(403), 'subscription'); assert.equal(errorCodeFor(409, 'external'), 'external');
  assert.equal(errorCodeFor(409, 'not_ready'), 'not_ready'); assert.equal(errorCodeFor(409, 'no_audio'), 'no_audio'); assert.equal(errorCodeFor(500), 'generic');
});

test('textes « dl.* » présents en français, anglais et arabe', () => {
  const keys = Object.keys(APP_DICT.fr).filter((k) => k.startsWith('dl.'));
  assert.ok(keys.length >= 35);
  for (const l of ['en', 'ar'] as const) for (const k of keys) assert.ok((APP_DICT[l] as Record<string, string>)[k], `${l}:${k}`);
});
