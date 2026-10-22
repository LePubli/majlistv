// 22b-6 bis : licence signée, horloge de confiance. Les licences de test sont signées avec Node (Ed25519), comme le fait le serveur :
// la vérification faite par l'application (tweetnacl) doit donc accepter exactement ce format.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { CLOCK_SLACK_MS, advanceHighWater, clockRolledBack, decodeBase64, licenceState, trustedNow, verifyLicence } from '../src/lib/license';

const NOW = Date.UTC(2026, 9, 22, 12);
const T = '3f2a1b9c-1111-4222-8333-444455556666';
const SHA = 'a'.repeat(64);
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
const other = generateKeyPairSync('ed25519');
const OTHER_PUB = other.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');

function licence(over: Record<string, unknown> = {}, key = privateKey) {
  const body = Buffer.from(JSON.stringify({ v: 1, sub: 'u1', talk: T, kind: 'video', h: 720, sha: SHA, iat: Math.floor(NOW / 1000), exp: Math.floor(NOW / 1000) + 30 * 86400, ...over }));
  return `${body.toString('base64url')}.${sign(null, body, key).toString('base64url')}`;
}
const file = (lic: string) => ({ talkId: T, kind: 'video' as const, height: 720, sha256: SHA, licence: lic });

test('decodeBase64 : base64 et base64url, valeurs invalides refusées', () => {
  assert.deepEqual([...decodeBase64('aGVsbG8')!], [...Buffer.from('hello')]);
  assert.deepEqual([...decodeBase64('aGVsbG8=')!], [...Buffer.from('hello')]);
  const raw = Buffer.from([251, 255, 254, 1, 2, 3]);
  assert.deepEqual([...decodeBase64(raw.toString('base64url'))!], [...raw]); assert.deepEqual([...decodeBase64(raw.toString('base64'))!], [...raw]);
  assert.equal(decodeBase64('a'), null); assert.equal(decodeBase64('!!!!'), null); assert.equal(decodeBase64(5 as unknown as string), null);
});

test('licence valide : signature acceptée, contenu lu', () => {
  const p = verifyLicence(licence(), PUB);
  assert.equal(p?.sub, 'u1'); assert.equal(p?.talk, T); assert.equal(p?.sha, SHA); assert.equal(p?.h, 720);
  assert.deepEqual(licenceState(file(licence()), 'u1', PUB, NOW), { state: 'ok', expiresAt: (Math.floor(NOW / 1000) + 30 * 86400) * 1000 });
});

test('licence falsifiée ou mal formée : refusée', () => {
  const good = licence();
  const [body, sig] = good.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, sub: 'u1', talk: T, kind: 'video', h: 720, sha: SHA, iat: 1, exp: 9999999999 })).toString('base64url');
  for (const bad of [`${forged}.${sig}`, `${body}.${sig.slice(0, -4)}AAAA`, body, `${body}.`, '', 'a.b.c', licence({}, other.privateKey)]) assert.equal(verifyLicence(bad, PUB), null, bad.slice(0, 30));
  assert.equal(verifyLicence(good, OTHER_PUB), null, 'autre clé'); assert.equal(verifyLicence(good, null), null); assert.equal(verifyLicence(null, PUB), null); assert.equal(verifyLicence(good, 'pas-une-clé'), null);
  assert.equal(verifyLicence(licence({ v: 2 }), PUB), null, 'version inconnue'); assert.equal(verifyLicence(licence({ exp: 'demain' }), PUB), null);
});

test('licenceState : expiration, compte, fichier', () => {
  const lic = licence(); const end = (Math.floor(NOW / 1000) + 30 * 86400) * 1000;
  assert.equal(licenceState(file(lic), 'u1', PUB, end - 1).state, 'ok');
  assert.equal(licenceState(file(lic), 'u1', PUB, end).state, 'expired');
  assert.equal(licenceState(file(lic), 'u2', PUB, NOW).state, 'wrong_user'); assert.equal(licenceState(file(lic), null, PUB, NOW).state, 'wrong_user');
  assert.equal(licenceState({ ...file(lic), sha256: 'b'.repeat(64) }, 'u1', PUB, NOW).state, 'wrong_file', 'autre fichier');
  assert.equal(licenceState({ ...file(lic), talkId: '4f2a1b9c-1111-4222-8333-444455556666' }, 'u1', PUB, NOW).state, 'wrong_file', 'autre conférence');
  assert.equal(licenceState({ ...file(lic), kind: 'audio', height: 0 }, 'u1', PUB, NOW).state, 'wrong_file');
  assert.equal(licenceState(file(lic), 'u1', null, NOW).state, 'invalid', 'pas de clé'); assert.equal(licenceState(file(''), 'u1', PUB, NOW).state, 'invalid', 'ancien téléchargement sans licence');
  const audio = licence({ kind: 'audio', h: 0 }); assert.equal(licenceState({ talkId: T, kind: 'audio', height: 0, sha256: SHA, licence: audio }, 'u1', PUB, NOW).state, 'ok');
});

test('horloge de confiance : reculer la date ne prolonge rien', () => {
  const lic = licence(); const end = (Math.floor(NOW / 1000) + 30 * 86400) * 1000;
  let hw = advanceHighWater(0, NOW);                                  // 1er jour : l'application voit la date
  hw = advanceHighWater(hw, end + 86400000);                          // jour 31 : la licence est expirée
  assert.equal(licenceState(file(lic), 'u1', PUB, trustedNow(end + 86400000, hw)).state, 'expired');
  const rolledBack = NOW + 86400000;                                  // l'utilisateur recule le téléphone au jour 2
  assert.equal(trustedNow(rolledBack, hw), hw); assert.equal(licenceState(file(lic), 'u1', PUB, trustedNow(rolledBack, hw)).state, 'expired', 'toujours expiré');
  assert.equal(clockRolledBack(rolledBack, hw), true);
  assert.equal(clockRolledBack(hw - CLOCK_SLACK_MS + 1000, hw), false, 'petit écart toléré'); assert.equal(clockRolledBack(NOW, 0), false, 'jamais rien vu');
  assert.equal(advanceHighWater(100, 50, NaN, 200, 150), 200);
});
