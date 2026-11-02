// Étape B5 — signal quotidien au parent : à partir de l'heure réglée (Paris), une seule fois par jour, regroupé (push + e-mail),
// seulement pour une demande NOUVELLE depuis le dernier signal ; e-mail désactivable ; push seulement si notifications activées.
// Données fictives. Variables : DATABASE_URL, JWT_SECRET, SETTINGS_KEY, PRACTICE_KEY. Migrations appliquées (démarrer l'API une fois).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const { pool } = await import('../src/db.js');
const { runPending, pendingFor } = await import('../src/modules/kids/pending.js');
const { invalidateSettings } = await import('../src/settings.js');
const { renderEmail } = await import('../src/emails.js');
const { pushText } = await import('../src/push.js');
const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };

await pool.query("DELETE FROM app_settings WHERE key IN ('kids_enabled', 'kids_pending_enabled', 'kids_pending_hour', 'feat_ramadan')"); invalidateSettings?.();
const tag = randomUUID().slice(0, 8);
const mk = async (push, email) => (await pool.query("INSERT INTO users(email, password_hash, name, notify_push, kids_pending_email) VALUES ($1,'x','Parent',$2,$3) RETURNING id", [`kr-${tag}-${randomUUID().slice(0, 6)}@test.local`, push, email])).rows[0].id;
const [a, b, c] = [await mk(true, true), await mk(false, true), await mk(true, false)];
const kid = async (u, name) => (await pool.query("INSERT INTO kid_profiles(user_id, name, band) VALUES ($1,$2,'7-10') RETURNING id", [u, name])).rows[0].id;
const [ka, kb, kc] = [await kid(a, 'Amina'), await kid(b, 'Bilal'), await kid(c, 'Sara')];
const claim = (k, at = 'now()') => pool.query(`INSERT INTO kid_actions(profile_id, title, status, claimed_at) VALUES ($1, 'Action fictive', 'claimed', ${at})`, [k]);
await claim(ka); await claim(ka); await claim(kb); await claim(kc);
ok((await pendingFor(a)).total === 2, 'parent A : 2 en attente');

const mine = new Set([a, b, c]);
let calls = [];
const send = async (uid, kind, vars, path) => { if (mine.has(uid)) calls.push({ uid, kind, vars, path }); return 1; };
const yes = async () => true;
const mails = async () => (await pool.query("SELECT user_id, vars FROM email_outbox WHERE kind = 'kids_pending' AND user_id = ANY($1)", [[a, b, c]])).rows;

// 17 h à Paris (16 h UTC, hiver) : avant l'heure réglée (18 h par défaut) → rien
await runPending(null, new Date('2026-11-06T16:00:00Z'), { send, hasChannel: yes });
ok(calls.length === 0 && (await mails()).length === 0, 'avant 18 h (Paris) : aucun signal');

// 19 h à Paris
await runPending(null, new Date('2026-11-06T18:00:00Z'), { send, hasChannel: yes });
ok(calls.length === 2 && calls.every((x) => x.kind === 'kids_pending' && x.path === '/kids'), 'push aux parents qui ont activé les notifications (A et C)');
ok(calls.find((x) => x.uid === a).vars.count === 2 && calls.find((x) => x.uid === a).vars.names === 'Amina', 'push regroupé : 2 actions, prénom de l’enfant');
let m = await mails();
ok(m.length === 2 && m.some((x) => x.user_id === a) && m.some((x) => x.user_id === b) && !m.some((x) => x.user_id === c), 'e-mail à A et B ; pas à C (e-mail désactivé)');
ok(m.find((x) => x.user_id === a).vars.path === '/kids' && m.find((x) => x.user_id === a).vars.children === 'Amina', 'e-mail : lien vers l’espace Kids et prénom');

// Même jour, plus tard : jamais deux fois
calls = [];
await runPending(null, new Date('2026-11-06T20:30:00Z'), { send, hasChannel: yes });
ok(calls.length === 0 && (await mails()).length === 2, 'le même jour : pas de second signal');

// Lendemain, aucune nouvelle demande : pas de relance pour les mêmes demandes
await pool.query("UPDATE kid_actions SET claimed_at = '2026-11-06T12:00:00Z' WHERE profile_id = ANY($1)", [[ka, kb, kc]]);
await runPending(null, new Date('2026-11-07T18:00:00Z'), { send, hasChannel: yes });
ok(calls.length === 0, 'lendemain sans nouvelle demande : pas de relance');

// Nouvelle demande d'Amina le 8 → signal le 8
await claim(ka, "'2026-11-08T10:00:00Z'");
await runPending(null, new Date('2026-11-08T18:00:00Z'), { send, hasChannel: yes });
ok(calls.length === 1 && calls[0].uid === a && calls[0].vars.count === 3, 'nouvelle demande : signal regroupé (3 en attente)');

// Réglage coupé
calls = [];
await pool.query("INSERT INTO app_settings(key, value) VALUES ('kids_pending_enabled', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'"); invalidateSettings?.();
await claim(kb, "'2026-11-09T10:00:00Z'");
ok(await runPending(null, new Date('2026-11-09T18:00:00Z'), { send, hasChannel: yes }) === 0 && calls.length === 0, 'réglage coupé : aucun signal');
await pool.query("DELETE FROM app_settings WHERE key = 'kids_pending_enabled'"); invalidateSettings?.();

// Textes
const e = renderEmail('kids_pending', 'fr', { name: 'Parent', app: 'Mejliss TV', count: '3', children: 'Amina', url: 'https://x.test/kids' });
ok(e.subject === 'Amina attend votre validation' && e.text.includes('3 action(s) de Amina'), 'e-mail en français');
ok(renderEmail('kids_pending', 'ar', { name: 'P', app: 'M', count: '2', children: 'سارة' }).html.includes('dir="rtl"'), 'e-mail en arabe (RTL)');
ok(pushText('kids_pending', 'en', { count: 1, names: 'Bilal' }).body === 'Bilal is waiting for your approval.', 'notification en anglais');

await pool.query("DELETE FROM email_outbox WHERE user_id = ANY($1)", [[a, b, c]]);
await pool.query('DELETE FROM users WHERE id = ANY($1)', [[a, b, c]]);
await pool.end();
console.log('kids pending run OK');
