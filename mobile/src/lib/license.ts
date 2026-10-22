// Hors connexion (22b-6 bis) : licence d'un téléchargement et horloge de confiance. Logique pure (testée avec Node, tests/license.test.ts).
// Le serveur signe (Ed25519) un petit document { compte, conférence, fichier (empreinte), date de fin }. L'application ne lit un fichier que si
// la signature est valide, que c'est bien le compte connecté et que la date de fin n'est pas passée — selon l'horloge de confiance :
// la plus tardive des heures vues (téléphone, serveur). Reculer la date du téléphone ne prolonge donc rien.
import nacl from 'tweetnacl';

export type LicencePayload = { v: number; sub: string; talk: string; kind: 'audio' | 'video'; h: number; sha: string; iat: number; exp: number };
export type LicenceState = 'ok' | 'expired' | 'invalid' | 'wrong_user' | 'wrong_file';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Décode du base64 ou du base64url (sans dépendance native ni atob). null si invalide. */
export function decodeBase64(input: string): Uint8Array | null {
  if (typeof input !== 'string') return null;
  const s = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(s) || s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let bits = 0; let acc = 0; let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    acc = (acc << 6) | B64.indexOf(s[i]);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[n] = (acc >> bits) & 0xff; n += 1; acc &= (1 << bits) - 1; }
  }
  return out.subarray(0, n);
}

const ascii = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 1) s += String.fromCharCode(b[i]); return s; };

/** Lit et vérifie la signature. null si la licence est mal formée, la clé mauvaise ou la signature fausse. */
export function verifyLicence(licence: string | null | undefined, publicKeyB64: string | null | undefined): LicencePayload | null {
  if (!licence || !publicKeyB64) return null;
  const parts = licence.split('.');
  if (parts.length !== 2) return null;
  const body = decodeBase64(parts[0]); const sig = decodeBase64(parts[1]); const pub = decodeBase64(publicKeyB64);
  if (!body || !sig || !pub || sig.length !== 64 || pub.length !== 32) return null;
  let ok = false;
  try { ok = nacl.sign.detached.verify(body, sig, pub); } catch { ok = false; }
  if (!ok) return null;
  try {
    const p = JSON.parse(ascii(body)) as Record<string, unknown>;
    if (p.v !== 1 || typeof p.sub !== 'string' || typeof p.talk !== 'string' || (p.kind !== 'audio' && p.kind !== 'video') || typeof p.sha !== 'string'
      || typeof p.exp !== 'number' || typeof p.iat !== 'number' || typeof p.h !== 'number') return null;
    return p as unknown as LicencePayload;
  } catch { return null; }
}

export type LicensedFile = { talkId: string; kind: 'audio' | 'video'; height: number; sha256: string; licence: string };

/** Un fichier peut-il être lu maintenant ? `now` = horloge de confiance (voir trustedNow). */
export function licenceState(rec: LicensedFile, userId: string | null, publicKey: string | null, now: number): { state: LicenceState; expiresAt: number } {
  const p = verifyLicence(rec.licence, publicKey);
  if (!p) return { state: 'invalid', expiresAt: 0 };
  const expiresAt = p.exp * 1000;
  if (p.talk !== rec.talkId || p.sha !== rec.sha256 || p.kind !== rec.kind || p.h !== (rec.kind === 'audio' ? 0 : Math.round(rec.height))) return { state: 'wrong_file', expiresAt };
  if (!userId || p.sub !== userId) return { state: 'wrong_user', expiresAt };
  if (now >= expiresAt) return { state: 'expired', expiresAt };
  return { state: 'ok', expiresAt };
}

/** Marge de tolérance entre deux horloges (secondes d'écart, changement d'heure automatique…). */
export const CLOCK_SLACK_MS = 10 * 60 * 1000;

/** Heure de confiance : jamais en arrière de la plus tardive des heures déjà vues. */
export const trustedNow = (deviceNow: number, highWater: number) => Math.max(deviceNow, highWater);

/** Nouvelle « plus haute heure vue ». */
export const advanceHighWater = (highWater: number, ...times: number[]) => times.reduce((m, t) => (Number.isFinite(t) && t > m ? t : m), highWater);

/** L'horloge du téléphone a-t-elle été reculée ? */
export const clockRolledBack = (deviceNow: number, highWater: number) => highWater > 0 && deviceNow < highWater - CLOCK_SLACK_MS;
