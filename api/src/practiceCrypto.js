// Chiffrement des données personnelles de « Mise en pratique » (AES-256-GCM) avec une clé DÉDIÉE : PRACTICE_KEY.
// Cette clé est distincte de SETTINGS_KEY (clés d'API) : si l'une fuit, l'autre reste protégée. À définir une seule fois : la changer
// rend les engagements existants illisibles. Format : base64( iv (12) | tag (16) | texte chiffré ). Chaîne vide = chaîne vide.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const raw = () => process.env.PRACTICE_KEY || '';
export const practiceKeyReady = () => raw().length >= 16;
const key = () => createHash('sha256').update('practice:' + raw()).digest();

export function sealText(plain) {
  const s = String(plain ?? '');
  if (!s) return '';
  if (!practiceKeyReady()) throw new Error('PRACTICE_KEY manquante');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(s, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}

// Texte illisible (clé changée, donnée abîmée) : on renvoie '' plutôt que de planter toute la liste.
export function openText(b64) {
  if (!b64) return '';
  try {
    const buf = Buffer.from(b64, 'base64');
    const d = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}
