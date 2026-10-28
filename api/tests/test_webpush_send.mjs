// Étape 40 — envoi Web Push réel (chiffrement + VAPID) vers un faux service de notification HTTPS local, base réelle.
// Variables : DATABASE_URL, JWT_SECRET, SETTINGS_KEY, PRACTICE_KEY. Nécessite openssl.
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { execSync } from 'node:child_process';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // faux service local à certificat auto-signé (test uniquement)
const { pool } = await import('../src/db.js');
const { pushToUser } = await import('../src/push.js');
const { vapidKeys, anyWebSubscription } = await import('../src/webPush.js');
const { invalidateSettings } = await import('../src/settings.js');

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
const dir = mkdtempSync(join(tmpdir(), 'wp-'));
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${dir}/k.pem -out ${dir}/c.pem -days 1 -subj /CN=localhost 2>/dev/null`);
const hits = [];
let status = 201;
const srv = createServer({ key: readFileSync(`${dir}/k.pem`), cert: readFileSync(`${dir}/c.pem`) }, (req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => { hits.push({ url: req.url, headers: req.headers, size: Buffer.concat(chunks).length }); res.statusCode = status; res.end(); });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const mkUser = async (push = true) => {
  const id = randomUUID();
  await pool.query("INSERT INTO users(id, email, password_hash, name, role, notify_push) VALUES ($1, $2, 'x', 'Test', 'user', $3)", [id, `wp-${id.slice(0, 8)}@test.local`, push]);
  return id;
};
const addSub = async (uid, path, locale = 'fr') => {
  const e = createECDH('prime256v1'); e.generateKeys();
  await pool.query('INSERT INTO web_push_subscriptions(user_id, endpoint, p256dh, auth, locale) VALUES ($1, $2, $3, $4, $5)',
    [uid, `https://127.0.0.1:${port}${path}`, e.getPublicKey().toString('base64url'), randomBytes(16).toString('base64url'), locale]);
};

await pool.query("DELETE FROM app_settings WHERE key = 'feat_webpush'"); invalidateSettings(); // valeur par défaut : fonction activée
const keys = await vapidKeys();
ok(keys && keys.publicKey.length >= 80 && keys.privateKey.length >= 40, 'clés VAPID créées automatiquement');
ok((await vapidKeys()).publicKey === keys.publicKey, 'clés stables (relues, pas régénérées)');
const raw = (await pool.query('SELECT private_enc FROM web_push_keys')).rows[0].private_enc;
ok(!raw.includes(keys.privateKey), 'clé privée chiffrée en base');

const u1 = await mkUser();
await addSub(u1, '/ok-1'); await addSub(u1, '/ok-2', 'ar');
ok(await anyWebSubscription(), 'un canal navigateur existe');
let n = await pushToUser(u1, 'revision_daily', { count: 3 }, '/learning');
ok(n === 2 && hits.length === 2, 'une notification par navigateur abonné');
ok(/^vapid t=/.test(hits[0].headers.authorization || '') && hits[0].headers['content-encoding'] === 'aes128gcm', 'signature VAPID et contenu chiffré (aes128gcm)');
ok(hits[0].size > 40 && hits[0].size < 4096, 'taille du message plausible');

hits.length = 0;
const u2 = await mkUser(false); await addSub(u2, '/off');
n = await pushToUser(u2, 'revision_daily', { count: 1 }, '/learning');
ok(n === 0 && hits.length === 0, 'interrupteur « notifications » du compte coupé : rien envoyé');

status = 410;
const u3 = await mkUser(); await addSub(u3, '/gone');
n = await pushToUser(u3, 'weekly_selection', { titles: ['A'] }, '/');
ok(n === 0 && (await pool.query('SELECT count(*)::int AS n FROM web_push_subscriptions WHERE user_id = $1', [u3])).rows[0].n === 0, '410 : abonnement périmé supprimé');

status = 500;
const u4 = await mkUser(); await addSub(u4, '/flaky');
n = await pushToUser(u4, 'weekly_selection', { titles: ['A'] }, '/', { warn() {} });
ok(n === 0 && (await pool.query('SELECT count(*)::int AS n FROM web_push_subscriptions WHERE user_id = $1', [u4])).rows[0].n === 1, '500 : abonnement gardé, aucune exception');

status = 201; hits.length = 0;
await pool.query("INSERT INTO app_settings(key, value, is_secret) VALUES ('feat_webpush','false',false) ON CONFLICT (key) DO UPDATE SET value = 'false'"); invalidateSettings();
n = await pushToUser(u1, 'revision_daily', { count: 1 }, '/learning');
ok(n === 0 && hits.length === 0, 'fonction coupée dans Admin → Fonctions : rien envoyé');

await pool.query("DELETE FROM app_settings WHERE key = 'feat_webpush'"); invalidateSettings();
await pool.query('DELETE FROM users WHERE id = ANY($1)', [[u1, u2, u3, u4]]);
srv.close(); await pool.end();
console.log('\nTout est OK');
