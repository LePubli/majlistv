// Étape 22b-6 bis — « licence » d'un téléchargement : petit document signé (Ed25519) qui lie le fichier (empreinte), le compte et la date de fin.
// L'application ne lit un fichier que si la signature est valide, que le compte est le bon et que la date de fin n'est pas passée.
// Format : base64url(JSON) + '.' + base64url(signature). La signature porte sur les octets du JSON.
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { pool } from '../../db.js';
import { cryptoReady, encrypt, decrypt } from '../../crypto.js';

let cache = null;
const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Charge la paire de clés, la crée si elle n'existe pas encore. */
export async function getKeys() {
  if (cache) return cache;
  let row = (await pool.query('SELECT public_key, private_key, encrypted FROM offline_keys WHERE id = 1')).rows[0];
  if (!row) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    await pool.query(
      'INSERT INTO offline_keys (id, public_key, private_key, encrypted) VALUES (1, $1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [raw, cryptoReady ? encrypt(pem) : pem, cryptoReady]);
    row = (await pool.query('SELECT public_key, private_key, encrypted FROM offline_keys WHERE id = 1')).rows[0];
  }
  const pem = row.encrypted ? decrypt(row.private_key) : row.private_key;
  cache = { publicKey: row.public_key, privateKey: createPrivateKey(pem) };
  return cache;
}

/** Charge utile d'une licence (fonction pure, testée). */
export function licensePayload({ userId, talkId, kind, height, sha256, now, expiresAt }) {
  return { v: 1, sub: String(userId), talk: String(talkId), kind, h: Number(height) || 0, sha: String(sha256 || ''), iat: Math.floor(now / 1000), exp: Math.floor(new Date(expiresAt).getTime() / 1000) };
}

export function signPayload(payload, privateKey) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return `${b64url(body)}.${b64url(sign(null, body, privateKey))}`;
}

/** Signe la licence d'un téléchargement → { licence, publicKey }. */
export async function issueLicense(fields) {
  const k = await getKeys();
  return { licence: signPayload(licensePayload(fields), k.privateKey), publicKey: k.publicKey };
}

export { createPublicKey };
