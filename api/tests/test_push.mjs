// 22b-4 : notifications sur téléphone (FCM) avec un FAUX serveur Google. Depuis api/ :
//   set -a; . /var/tmp/api-test.env; set +a; node tests/test_push.mjs
// Vérifie : lecture de la clé (JSON / base64), signature RS256 du jeton, envoi, jeton périmé supprimé, textes fr/en/ar,
// interrupteur du compte, et les trois boucles (intervenants suivis, sélection de la semaine, révision).
import http from 'node:http';
import { generateKeyPairSync, createVerify } from 'node:crypto';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };

// --- Faux Google : /token (OAuth) et /v1/projects/:p/messages:send (FCM)
const sent = []; let tokenCalls = 0; let jwtOk = false;
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url === '/token') {
      tokenCalls += 1;
      const a = new URLSearchParams(body).get('assertion') || '';
      const [h, c, sig] = a.split('.');
      jwtOk = createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, sig, 'base64url') && JSON.parse(Buffer.from(c, 'base64url').toString()).scope.includes('firebase.messaging');
      res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ access_token: 'tok-' + tokenCalls, expires_in: 3600 }));
    }
    const m = /^\/v1\/projects\/([^/]+)\/messages:send$/.exec(req.url);
    if (m && req.headers.authorization?.startsWith('Bearer tok-')) {
      const msg = JSON.parse(body).message; sent.push(msg);
      res.setHeader('content-type', 'application/json');
      if (msg.token.startsWith('GONE')) { res.statusCode = 404; return res.end(JSON.stringify({ error: { status: 'NOT_FOUND', message: 'unregistered' } })); }
      return res.end(JSON.stringify({ name: 'projects/x/messages/1' }));
    }
    res.statusCode = 401; res.end('{}');
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
process.env.FCM_API_BASE = base;
const sa = { client_email: 'svc@test.iam', private_key: pem, project_id: 'proj-test', token_uri: base + '/token' };

const { pool } = await import('../src/db.js');
const { invalidateSettings } = await import('../src/settings.js');
const push = await import('../src/push.js');
const { runSpeakers, runWeekly } = await import('../src/notifyMailer.js');
const { speakerSlug } = await import('../src/speakers.js');
const tag = Math.random().toString(36).slice(2, 8);
const set = async (k, v, secret = false) => { await pool.query('INSERT INTO app_settings(key,value,is_secret) VALUES ($1,$2,false) ON CONFLICT (key) DO UPDATE SET value=$2, is_secret=false', [k, v]); invalidateSettings(); };
const del = async (k) => { await pool.query('DELETE FROM app_settings WHERE key=$1', [k]); invalidateSettings(); };

// 1. Lecture de la clé
ok(push.parseServiceAccount('') === null && push.parseServiceAccount('pas du json') === null && push.parseServiceAccount('{"a":1}') === null, 'clé absente ou invalide : refusée');
ok(push.parseServiceAccount(JSON.stringify(sa))?.project === 'proj-test', 'clé JSON lue');
ok(push.parseServiceAccount(Buffer.from(JSON.stringify(sa)).toString('base64'))?.email === 'svc@test.iam', 'clé en base64 lue');
ok(push.parseServiceAccount(JSON.stringify({ ...sa, private_key: pem.replace(/\n/g, '\\n') }))?.key.includes('\n'), 'retours à la ligne « \\n » rétablis');

// 2. Sans clé : rien n'est envoyé
await del('fcm_service_account');
const mk = async (n, o = {}) => (await pool.query("INSERT INTO users(email,name,password_hash,locale,notify_speakers,notify_weekly,notify_push) VALUES ($1,$2,'x',$3,$4,$5,$6) RETURNING id",
  [`pu-${n}-${tag}@test.local`, n, o.locale || 'fr', o.speakers ?? true, o.weekly ?? true, o.push ?? true])).rows[0].id;
const dev = (u, t, loc = 'fr') => pool.query('INSERT INTO device_tokens(token,user_id,locale) VALUES ($1,$2,$3)', [t, u, loc]);
const uFr = await mk('fr'), uEn = await mk('en', { locale: 'en' }), uAr = await mk('ar', { locale: 'ar' }), uOff = await mk('off', { push: false }), uNone = await mk('nodev');
await dev(uFr, `OKFR${tag}`.padEnd(30, 'x')); await dev(uEn, `OKEN${tag}`.padEnd(30, 'x')); await dev(uAr, `OKAR${tag}`.padEnd(30, 'x')); await dev(uOff, `OKOFF${tag}`.padEnd(30, 'x'));
ok((await push.pushToUser(uFr, 'revision_daily', { count: 2 }, '/learning')) === 0 && sent.length === 0, 'sans clé Firebase : aucun envoi, aucune erreur');

// 3. Avec clé : envoi, textes, jeton signé
await set('fcm_service_account', JSON.stringify(sa));
ok((await push.pushToUser(uFr, 'revision_daily', { count: 2 }, '/learning')) === 1, 'un appareil atteint');
ok(sent.at(-1).notification.title === 'À réviser aujourd’hui' && sent.at(-1).notification.body === '2 conférences à réviser', 'texte français');
ok(sent.at(-1).data.path === '/learning' && sent.at(-1).data.kind === 'revision_daily' && sent.at(-1).android.notification.channel_id === 'news', 'chemin, type et canal Android');
ok(jwtOk && tokenCalls === 1, 'jeton OAuth demandé avec une signature RS256 valide');
await push.pushToUser(uEn, 'revision_daily', { count: 1 }, '/learning'); await push.pushToUser(uAr, 'weekly_selection', { titles: ['أ', 'ب'] }, '/');
ok(sent.at(-2).notification.body === '1 talk to review', 'texte anglais');
ok(sent.at(-1).notification.title === 'اختيارات الأسبوع' && sent.at(-1).notification.body === 'أ · ب', 'texte arabe');
ok(tokenCalls === 1, 'jeton OAuth réutilisé (un seul appel)');
const n0 = sent.length;
ok((await push.pushToUser(uOff, 'revision_daily', { count: 1 }, '/learning')) === 0 && sent.length === n0, 'interrupteur « notifications téléphone » coupé : rien');
ok((await push.pushToUser(uNone, 'revision_daily', { count: 1 }, '/learning')) === 0, 'compte sans téléphone : rien');

// 4. Jeton périmé supprimé
await dev(uFr, `GONE${tag}`.padEnd(30, 'x'));
ok((await push.pushToUser(uFr, 'revision_daily', { count: 1 }, '/')) === 1, 'un bon jeton + un périmé : 1 atteint');
ok((await pool.query("SELECT count(*)::int AS n FROM device_tokens WHERE token LIKE 'GONE%' AND user_id=$1", [uFr])).rows[0].n === 0, 'jeton périmé supprimé de la base');

// 5. Alertes d'intervenants (sans SMTP : seulement le téléphone)
await pool.query("DELETE FROM app_settings WHERE key IN ('smtp_host','mail_from')"); invalidateSettings();
await set('notify_speakers_enabled', 'true');
const admin = (await pool.query("SELECT id FROM users WHERE email='admin@test.local'")).rows[0].id;
const S1 = `Cheikh Push ${tag}`;
await runSpeakers(console); // vide les conférences déjà en attente d'autres tests
await pool.query('INSERT INTO speaker_follows(user_id,speaker_slug,speaker_name) VALUES ($1,$2,$3),($4,$2,$3)', [uFr, speakerSlug(S1), S1, uOff]);
const tk = async (title) => (await pool.query(
  "INSERT INTO talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,show_adults) VALUES ($1,'d',$2,'youtube',$3,$4,'published','ready','free',600,true) RETURNING id, slug",
  [`${title} ${tag}`, S1, 'v' + Math.random().toString(36).slice(2, 11), admin])).rows[0];
const t1 = await tk('Patience');
const before = sent.length;
const n = await runSpeakers(console);
ok(n === 2, 'alerte préparée pour les 2 abonnés (même sans e-mail configuré)');
const mine = sent.slice(before);
ok(mine.length === 1 && mine[0].token.startsWith('OKFR'), 'téléphone du membre atteint ; celui dont l’interrupteur est coupé : rien');
ok(mine[0].notification.title === 'Nouvelle conférence' && mine[0].notification.body.includes(`Patience ${tag}`) && mine[0].data.path === `/conferences/${t1.id}`, 'titre, intervenant et lien vers la conférence');
ok((await pool.query('SELECT announced_at FROM talks WHERE id=$1', [t1.id])).rows[0].announced_at !== null, 'conférence marquée « annoncée »');
ok((await pool.query("SELECT count(*)::int AS n FROM email_outbox WHERE user_id=$1 AND kind='speaker_new'", [uFr])).rows[0].n === 0, "sans SMTP : aucun e-mail mis en file");

// 6. Sans aucun canal : rien n'est annoncé
await del('fcm_service_account');
const t2 = await tk('Gratitude');
ok((await runSpeakers(console)) === 0 && (await pool.query('SELECT announced_at FROM talks WHERE id=$1', [t2.id])).rows[0].announced_at === null, 'ni e-mail ni téléphone : rien d’annoncé (rien de perdu)');

// 7. Sélection de la semaine par téléphone
await set('fcm_service_account', JSON.stringify(sa));
await set('weekly_enabled', 'true');
const dow = (await pool.query("SELECT extract(isodow FROM now() AT TIME ZONE 'Europe/Paris')::int AS d")).rows[0].d;
await set('weekly_weekday', String(dow)); await set('weekly_hour', '0');
await pool.query('UPDATE users SET notify_weekly=false WHERE id <> ALL($1)', [[uFr]]);
await pool.query('UPDATE users SET weekly_last_week=NULL WHERE id=$1', [uFr]);
const b2 = sent.length;
const w = await runWeekly(console);
ok(w === 1 && sent.length === b2 + 1 && sent.at(-1).notification.title === 'La sélection de la semaine', 'sélection de la semaine envoyée au téléphone du membre');
ok((await runWeekly(console)) === 0, 'jamais deux fois la même semaine');

// Remise en état
await del('weekly_enabled'); await del('weekly_weekday'); await del('weekly_hour'); await del('fcm_service_account');
await pool.query('DELETE FROM users WHERE email LIKE $1', [`pu-%-${tag}@test.local`]);
srv.close(); await pool.end();
console.log(bad ? `${bad} ÉCHEC(S)` : 'TOUT EST OK');
process.exit(bad ? 1 : 0);
