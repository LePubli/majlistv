// Fonctions pures du module « Mises à jour de l'application » (testées dans tests/test_appupdates_lib.mjs).
import { createHash, timingSafeEqual } from 'node:crypto';

/** Empreinte hexadécimale → base64url (format demandé par le protocole expo-updates pour `hash`). */
export const hexToB64Url = (hex) => Buffer.from(hex, 'hex').toString('base64url');

/** Comparaison sans fuite de durée ; faux si l'une des deux valeurs est vide. */
export function tokenOk(given, expected) {
  if (!given || !expected) return false;
  const a = createHash('sha256').update(String(given)).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

/** « Bearer xxx » → « xxx » (sinon chaîne vide). */
export const bearer = (h) => { const m = /^Bearer\s+(\S+)$/i.exec(String(h || '')); return m ? m[1] : ''; };

export const SHA_RE = /^[0-9a-f]{64}$/;
export const MD5_RE = /^[0-9a-f]{32}$/;
export const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}(-[0-9A-Za-z.]{1,20})?$/;
export const assetKey = (sha) => `app/assets/${sha}`;
export const apkKey = (code) => `app/apk/${code}.apk`;
const cleanBase = (u) => String(u || '').replace(/\/+$/, '');

/** Manifeste expo-updates d'une mise à jour enregistrée. Les adresses des fichiers sont stables (elles ne doivent jamais changer). */
export function buildManifest(row, apiUrl) {
  const url = (sha) => `${cleanBase(apiUrl)}/app/updates/assets/${sha}`;
  const b = row.bundle;
  return {
    id: row.id,
    createdAt: new Date(row.created_at).toISOString(),
    runtimeVersion: row.runtime_version,
    launchAsset: { hash: hexToB64Url(b.launchAsset.sha256), key: b.launchAsset.sha256, contentType: 'application/javascript', url: url(b.launchAsset.sha256) },
    assets: b.assets.map((a) => ({
      hash: hexToB64Url(a.sha256), key: a.key, contentType: a.contentType, ...(a.fileExtension ? { fileExtension: a.fileExtension } : {}), url: url(a.sha256),
    })),
    metadata: {},
    extra: { expoClient: b.expoClient || {} },
  };
}

/** Corps multipart/mixed du protocole : une partie « manifest » (+ « extensions ») ou une partie « directive ». */
export function multipartBody(parts, boundary) {
  const out = [];
  for (const p of parts) {
    out.push(`--${boundary}\r\ncontent-disposition: form-data; name="${p.name}"\r\ncontent-type: ${p.type || 'application/json'}\r\n\r\n${JSON.stringify(p.json)}\r\n`);
  }
  out.push(`--${boundary}--\r\n`);
  return out.join('');
}

// Le client accepte-t-il le multipart ? (absent ou joker = oui)
export function accepts(accept) {
  const a = String(accept || '').toLowerCase();
  if (!a.trim()) return { multipart: true, json: true };
  return { multipart: /multipart\/mixed|\*\/\*/.test(a), json: /application\/expo\+json|application\/json|\*\/\*/.test(a) };
}

/** Nombre de morceaux d'un envoi en plusieurs parties. */
export const partCount = (size, partSize) => Math.max(1, Math.ceil(size / partSize));
