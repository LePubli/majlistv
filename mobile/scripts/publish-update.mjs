#!/usr/bin/env node
// Publie une mise à jour du CONTENU de l'application sur notre serveur (étape 22b-5, partie 2).
//   node scripts/publish-update.mjs [dossier d'export (défaut : dist)]
// Prérequis : `npx expo export --platform android --output-dir dist` déjà lancé. Variables : APP_PUBLISH_TOKEN (obligatoire), APP_API_URL.
// Les fichiers sont envoyés directement au stockage (liens signés) ; seuls les fichiers absents du stockage sont envoyés.
import { createHash } from 'node:crypto';
import { fetchRetry } from './http-retry.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = process.argv[2] || 'dist';
const token = process.env.APP_PUBLISH_TOKEN;
const api = (process.env.APP_API_URL || 'https://api-majlisstv.le-publicitaire.fr').replace(/\/+$/, '');
if (!token) { console.error('APP_PUBLISH_TOKEN manquant'); process.exit(2); }
if (!existsSync(join(dir, 'metadata.json'))) { console.error(`Pas d'export dans ${dir} : lancez d'abord « npx expo export --platform android --output-dir ${dir} »`); process.exit(2); }

const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  json: 'application/json', mp3: 'audio/mpeg', mp4: 'video/mp4', m4a: 'audio/mp4', wav: 'audio/wav', txt: 'text/plain', html: 'text/html', js: 'application/javascript', hbc: 'application/javascript' };
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const md5 = (b) => createHash('md5').update(b).digest('hex');

const meta = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')).fileMetadata?.android;
if (!meta?.bundle) { console.error('metadata.json : pas de bundle Android'); process.exit(2); }
const cfg = JSON.parse(execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], { encoding: 'utf8', env: { ...process.env, EXPO_NO_TELEMETRY: '1', CI: '1' } }));
const runtimeVersion = cfg.runtimeVersion;
if (typeof runtimeVersion !== 'string') { console.error('runtimeVersion absent de la configuration'); process.exit(2); }

const bundleBuf = readFileSync(join(dir, meta.bundle));
const files = new Map(); // sha256 → { buf, contentType }
const launch = { sha256: sha256(bundleBuf) };
files.set(launch.sha256, { buf: bundleBuf, contentType: 'application/javascript' });
const assets = [];
for (const a of meta.assets || []) {
  const buf = readFileSync(join(dir, a.path));
  const ext = String(a.ext || '').replace(/^\./, '');
  const contentType = TYPES[ext.toLowerCase()] || 'application/octet-stream';
  const sha = sha256(buf);
  files.set(sha, { buf, contentType });
  assets.push({ sha256: sha, key: md5(buf), contentType, ...(ext ? { fileExtension: `.${ext}` } : {}) });
}

async function call(path, body) {
  const r = await fetch(api + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const txt = await r.text(); let json; try { json = JSON.parse(txt); } catch { json = { error: txt.slice(0, 300) }; }
  if (!r.ok) throw new Error(`${path} → ${r.status} ${json.error || ''}`);
  return json;
}

console.log(`Mise à jour du contenu · version d'exécution ${runtimeVersion} · ${files.size} fichier(s) · bundle ${(bundleBuf.length / 1048576).toFixed(1)} Mo`);
const init = await call('/app/publish/update/init', { runtimeVersion, assets: [...files.entries()].map(([sha, f]) => ({ sha256: sha, contentType: f.contentType, size: f.buf.length })) });
for (const u of init.uploads) {
  const f = files.get(u.sha256);
  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
    const r = await fetch(u.url, { method: 'PUT', body: f.buf, headers: { 'content-type': u.contentType } }).catch(() => null);
    ok = Boolean(r && r.ok);
    if (!ok && attempt < 3) await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
  if (!ok) throw new Error(`envoi du fichier ${u.sha256.slice(0, 8)} impossible`);
}
console.log(`  ${init.uploads.length} fichier(s) envoyé(s), ${files.size - init.uploads.length} déjà présent(s)`);
const done = await call('/app/publish/update/commit', { runtimeVersion, launchAsset: launch, assets, expoClient: cfg, notes: (process.env.GITHUB_SHA || '').slice(0, 7) });
console.log(`Publié : mise à jour ${done.id}`);
