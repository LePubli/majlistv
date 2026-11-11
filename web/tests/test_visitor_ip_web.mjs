// Audit 11/2026 — le serveur du site transmet l'adresse du visiteur à l'API (sinon : une seule limite de débit pour tous).
// node web/tests/test_visitor_ip_web.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'vip-'));
copyFileSync(join(web, 'lib/visitorIp.js'), join(tmp, 'visitorIp.mjs'));
const { forwardedFor, visitorHeaders } = await import(pathToFileURL(join(tmp, 'visitorIp.mjs')).href);

const get = (h) => (k) => h[k];
assert.equal(forwardedFor(get({ 'x-forwarded-for': '9.9.9.9, 81.2.3.4' })), '9.9.9.9, 81.2.3.4', 'en-tête de nginx relayé tel quel (l’API ne croit que la fin)');
assert.equal(forwardedFor(get({ 'x-real-ip': '81.2.3.4' })), '81.2.3.4', 'à défaut : X-Real-IP');
assert.equal(forwardedFor(get({})), '', 'rien à transmettre');
assert.ok(forwardedFor(get({ 'x-forwarded-for': 'a'.repeat(5000) })).length <= 500, 'longueur bornée');
assert.deepEqual(await visitorHeaders(), {}, 'hors d’une requête : aucun en-tête, aucune erreur');

// Le proxy /api et tous les appels faits pendant le rendu des pages transmettent l'adresse.
assert.match(read('app/api/[...path]/route.js'), /headers\['x-forwarded-for'\] = xff/, 'proxy /api');
for (const f of ['lib/seo.js', 'lib/texts.js', 'lib/theme.js', 'lib/pages.js', 'app/layout.js', 'app/manifest.js']) {
  const s = read(f);
  const calls = (s.match(/await fetch\(/g) || []).length;
  const fwd = (s.match(/headers: await visitorHeaders\(\)/g) || []).length;
  assert.ok(calls > 0 && calls === fwd, `${f} : ${fwd} appel(s) sur ${calls} transmettent l'adresse du visiteur`);
}
console.log('adresse du visiteur OK');
