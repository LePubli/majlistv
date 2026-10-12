// Chiffrement des clés d'API stockées en base (AES-256-GCM). La clé de chiffrement est SETTINGS_KEY (variable d'environnement,
// à définir une seule fois, identique sur l'API, le traducteur et le transcripteur).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const raw = process.env.SETTINGS_KEY || '';
export const cryptoReady = raw.length >= 16;
const key = createHash('sha256').update(raw).digest();

// Format : base64( iv (12 octets) | tag (16 octets) | texte chiffré )
export function encrypt(plain) {
  if (!cryptoReady) throw new Error('SETTINGS_KEY manquante');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
