// Étape 31 — Codes à usage unique basés sur le temps (TOTP, RFC 6238) et codes de secours. Aucune dépendance : node:crypto seulement.
// Compatible Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden, etc. (SHA-1, 6 chiffres, pas de 30 s).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('Clé invalide');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Nouvelle clé secrète : 20 octets aléatoires (160 bits), en base32. */
export const newSecret = () => base32Encode(randomBytes(20));

/** Code à 6 chiffres pour un pas donné (pas = secondes Unix / 30). */
export function codeAt(secretB32, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

export const stepOf = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS);

/**
 * Vérifie un code saisi (tolérance ±1 pas = ±30 s pour les horloges un peu décalées).
 * lastStep : dernier pas déjà accepté (jamais réutilisable). Renvoie le pas accepté, ou null.
 */
export function verifyTotp(secretB32, input, { now = Date.now(), lastStep = null } = {}) {
  const code = String(input ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return null;
  const cur = stepOf(now);
  for (const s of [cur, cur - 1, cur + 1]) {
    if (lastStep != null && s <= Number(lastStep)) continue;
    const good = Buffer.from(codeAt(secretB32, s));
    if (timingSafeEqual(good, Buffer.from(code))) return s;
  }
  return null;
}

/** Adresse à encoder dans le QR code (format « otpauth » reconnu par toutes les applications). */
export function otpauthUri({ issuer, account, secret }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

// Codes de secours : 10 codes « xxxxx-xxxxx » (lettres sans ambiguïté + chiffres), 50 bits chacun.
const RC_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => {
    const pick = () => Array.from({ length: 5 }, () => RC_ALPHABET[randomInt(RC_ALPHABET.length)]).join('');
    return `${pick()}-${pick()}`;
  });
}
/** Forme canonique d'un code de secours saisi (casse, espaces et tiret ignorés) ; null si le format n'est pas le bon. */
export function normalizeRecovery(input) {
  const c = String(input ?? '').toLowerCase().replace(/[\s-]/g, '');
  return /^[a-z2-9]{10}$/.test(c) ? `${c.slice(0, 5)}-${c.slice(5)}` : null;
}
export const hashRecovery = (code) => createHash('sha256').update(code).digest('hex');
