#!/usr/bin/env node
// Publie un APK sur notre serveur (étape 22b-5). Lancé par le workflow GitHub après la fabrication de l'APK.
//   node scripts/publish-release.mjs <fichier.apk> <version> <versionCode>
// Variables : APP_PUBLISH_TOKEN (obligatoire), APP_API_URL (défaut : https://api-majlisstv.le-publicitaire.fr), RELEASE_NOTES_FILE (défaut : release-notes.json).
// Envoi en morceaux de 32 Mo directement vers le stockage (liens signés), puis le serveur contrôle taille et empreinte SHA-256 avant de publier.
import { createHash } from 'node:crypto';
import { fetchRetry } from './http-retry.mjs';
import { createReadStream, readFileSync, statSync, openSync, readSync, closeSync, existsSync } from 'node:fs';

const [file, version, code] = process.argv.slice(2);
const token = process.env.APP_PUBLISH_TOKEN;
const api = (process.env.APP_API_URL || 'https://api-majlisstv.le-publicitaire.fr').replace(/\/+$/, '');
if (!file || !version || !code || !token) { console.error('Usage : APP_PUBLISH_TOKEN=… node scripts/publish-release.mjs <apk> <version> <versionCode>'); process.exit(2); }
const versionCode = Number(code);
if (!Number.isInteger(versionCode) || versionCode < 1) { console.error('versionCode invalide'); process.exit(2); }

const sha256 = await new Promise((res, rej) => { const h = createHash('sha256'); createReadStream(file).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
const size = statSync(file).size;
const notesFile = process.env.RELEASE_NOTES_FILE || 'release-notes.json';
const notes = existsSync(notesFile) ? JSON.parse(readFileSync(notesFile, 'utf8')) : {};

async function call(path, body) {
  const r = await fetch(api + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const txt = await r.text();
  let json; try { json = JSON.parse(txt); } catch { json = { error: txt.slice(0, 300) }; }
  if (!r.ok) throw Object.assign(new Error(`${path} → ${r.status} ${json.error || ''}`), { status: r.status });
  return json;
}

console.log(`APK ${version} (build ${versionCode}) · ${(size / 1048576).toFixed(1)} Mo · sha256 ${sha256.slice(0, 12)}…`);
let init;
try { init = await call('/app/publish/apk/init', { version, versionCode, size, sha256, notes }); }
catch (e) {
  if (e.status === 409) { console.log('Ce numéro de build est déjà publié ou dépassé : rien à faire.'); process.exit(0); }
  throw e;
}
const fd = openSync(file, 'r');
const parts = [];
try {
  for (const p of init.parts) {
    const start = (p.partNumber - 1) * init.partSize;
    const len = Math.min(init.partSize, size - start);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, start);
    let etag = null;
    for (let attempt = 1; attempt <= 3 && !etag; attempt += 1) {
      try {
        const r = await fetch(p.url, { method: 'PUT', body: buf });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        etag = r.headers.get('etag');
        if (!etag) throw new Error('ETag absent (CORS du stockage ?)');
      } catch (e) { if (attempt === 3) throw new Error(`morceau ${p.partNumber} : ${e.message}`); await new Promise((r2) => setTimeout(r2, 2000 * attempt)); }
    }
    parts.push({ PartNumber: p.partNumber, ETag: etag });
    console.log(`  morceau ${p.partNumber}/${init.parts.length} envoyé`);
  }
} finally { closeSync(fd); }
const done = await call('/app/publish/apk/commit', { versionCode, uploadId: init.uploadId, parts });
console.log(`Publié : version ${done.version} (build ${done.versionCode}).`);
