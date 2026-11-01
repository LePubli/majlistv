// Étape 45F — circuit de Ramadan : jour du mois (hégirien), actions du jour, rappel quotidien. Données fictives.
// Variables : DATABASE_URL, JWT_SECRET, SETTINGS_KEY, PRACTICE_KEY.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const { pool } = await import('../src/db.js');
const { ramadanStatus, itemsOfDay, runRamadan } = await import('../src/modules/ramadan/lib.js');
const { invalidateSettings } = await import('../src/settings.js');
const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
const Z = (s) => new Date(s);
await pool.query("DELETE FROM app_settings WHERE key IN ('feat_ramadan', 'hijri_offset_days')"); invalidateSettings?.();

let st = await ramadanStatus(Z('2026-02-23T10:00:00Z'));
ok(st.active && st.day === 6 && st.hyear === 1447 && st.startsOn === '2026-02-18', 'pendant Ramadan 1447 : jour 6 (début le 18 février 2026)');
st = await ramadanStatus(Z('2026-11-01T10:00:00Z'));
ok(!st.active && st.day === null && st.startsOn === '2027-02-08' && st.daysToStart === 99 && st.hyear === 1448, 'hors Ramadan : prochain début annoncé (8 février 2027, dans 99 jours)');
await pool.query("INSERT INTO app_settings(key, value) VALUES ('hijri_offset_days', '1') ON CONFLICT (key) DO UPDATE SET value = '1'"); invalidateSettings?.();
st = await ramadanStatus(Z('2026-02-17T10:00:00Z'));
ok(st.active && st.day === 1, 'décalage +1 jour (réglage des saisons) : Ramadan commence un jour plus tôt');
await pool.query("DELETE FROM app_settings WHERE key = 'hijri_offset_days'"); invalidateSettings?.();
ok(itemsOfDay([{ id: 1, day: 0 }, { id: 2, day: 6 }, { id: 3, day: 7 }], 6).map((i) => i.id).join() === '1,2', 'actions du jour = celles du jour + celles de chaque jour');

// Rappel
const tag = randomUUID().slice(0, 8);
const mk = async (push = true) => (await pool.query("INSERT INTO users(email, password_hash, name, notify_push) VALUES ($1,'x','R',$2) RETURNING id", [`rm-${tag}-${randomUUID().slice(0, 6)}@test.local`, push])).rows[0].id;
const [a, b, c] = [await mk(), await mk(), await mk(false)];
const i1 = (await pool.query("INSERT INTO ramadan_items(day, title_fr, enabled, reviewed_at) VALUES (0, 'Action fictive de chaque jour', true, now()) RETURNING id")).rows[0].id;
const i2 = (await pool.query("INSERT INTO ramadan_items(day, title_fr, enabled, reviewed_at) VALUES (6, 'Action fictive du jour 6', true, now()) RETURNING id")).rows[0].id;
const i3 = (await pool.query("INSERT INTO ramadan_items(day, title_fr, enabled) VALUES (6, 'Brouillon', false) RETURNING id")).rows[0].id;
for (const u of [a, b, c]) await pool.query('INSERT INTO ramadan_prefs(user_id, remind_hour) VALUES ($1, 20)', [u]);
for (const it of [i1, i2]) await pool.query('INSERT INTO ramadan_marks(user_id, hyear, day, item_id) VALUES ($1, 1447, 6, $2)', [b, it]); // b a tout fait
const mine = new Set([a, b, c]); const calls = [];
const send = async (uid, kind, vars, path) => { if (mine.has(uid)) calls.push({ uid, kind, vars, path }); return 1; };
const yes = async () => true;
await runRamadan(null, Z('2026-11-06T19:10:00Z'), { send, hasChannel: yes });
ok(calls.length === 0, 'hors Ramadan : aucun rappel');
await runRamadan(null, Z('2026-02-23T18:30:00Z'), { send, hasChannel: yes });
ok(calls.length === 0, 'avant l’heure choisie (19 h 30 à Paris) : rien');
await runRamadan(null, Z('2026-02-23T19:10:00Z'), { send, hasChannel: yes });
const got = new Set(calls.map((x) => x.uid));
ok(got.has(a) && !got.has(b) && !got.has(c), 'rappel : actions pas toutes faites, notifications activées');
ok(calls[0].kind === 'ramadan' && calls[0].vars.day === 6 && calls[0].vars.total === 2 && calls[0].path === '/ramadan', 'jour 6, 2 actions attendues (brouillon exclu), lien /ramadan');
const n = calls.length;
await runRamadan(null, Z('2026-02-23T20:10:00Z'), { send, hasChannel: yes });
ok(calls.length === n, 'un seul rappel par jour');
await pool.query("INSERT INTO app_settings(key, value) VALUES ('feat_ramadan', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'"); invalidateSettings?.();
await runRamadan(null, Z('2026-02-24T19:10:00Z'), { send, hasChannel: yes });
ok(calls.length === n, 'fonction coupée : rien');
await pool.query("DELETE FROM app_settings WHERE key = 'feat_ramadan'"); invalidateSettings?.();
await pool.query('DELETE FROM ramadan_items WHERE id = ANY($1)', [[i1, i2, i3]]);
await pool.query('DELETE FROM users WHERE id = ANY($1)', [[a, b, c]]);
await pool.end();
console.log('ramadan run OK');
