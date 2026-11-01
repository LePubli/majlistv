// Étape 45D — athkar : série de jours, rappel quotidien (heure de Paris, une fois par jour, seulement si l'objectif n'est pas atteint).
// Données fictives. Variables : DATABASE_URL, JWT_SECRET, SETTINGS_KEY, PRACTICE_KEY.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const { pool } = await import('../src/db.js');
const { runAthkar, streakOf, doneByDay } = await import('../src/modules/athkar/lib.js');
const { prevDate, parisDay } = await import('../src/parisTime.js');
const { invalidateSettings } = await import('../src/settings.js');
const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };

// Série (calcul pur)
const m = new Map([['2026-11-06', 2], ['2026-11-05', 1], ['2026-11-04', 3], ['2026-11-02', 5]]);
ok(streakOf(m, 1, '2026-11-06') === 3, 'série : 3 jours consécutifs (aujourd’hui compris)');
ok(streakOf(m, 2, '2026-11-06') === 1, 'série avec objectif 2 : le 5 ne compte pas');
ok(streakOf(m, 1, '2026-11-07') === 3, 'aujourd’hui pas encore fait : la série d’hier reste');
ok(streakOf(new Map(), 1, '2026-11-07') === 0, 'aucun jour : série 0');
ok(prevDate('2026-03-01') === '2026-02-28' && prevDate('2026-01-01') === '2025-12-31', 'jour précédent (fin de mois, fin d’année)');
ok(parisDay(new Date('2026-11-06T23:30:00Z')).date === '2026-11-07', 'jour à Paris (après minuit)');

// Rappel
const tag = randomUUID().slice(0, 8);
await pool.query("DELETE FROM app_settings WHERE key = 'feat_athkar'"); invalidateSettings?.();
const mk = async (push = true) => (await pool.query("INSERT INTO users(email, password_hash, name, notify_push) VALUES ($1,'x','A',$2) RETURNING id", [`ak-${tag}-${randomUUID().slice(0, 6)}@test.local`, push])).rows[0].id;
const [a, b, c, d] = [await mk(), await mk(), await mk(false), await mk()];
const it = (await pool.query("INSERT INTO athkar_items(category, text_ar, reference, target, enabled, reviewed_at) VALUES ('morning', 'نص تجريبي', 'Référence fictive', 3, true, now()) RETURNING id")).rows[0].id;
const draft = (await pool.query("INSERT INTO athkar_items(category, text_ar, reference, target, enabled) VALUES ('morning', 'مسودة', 'Référence fictive', 1, false) RETURNING id")).rows[0].id;
for (const u of [a, b, c, d]) await pool.query('INSERT INTO athkar_prefs(user_id, daily_goal, remind_hour) VALUES ($1, 1, 8)', [u]);
const learners = new Set([a, b, c]); // d n'a pas la formule Apprentissage
const learning = async (u) => learners.has(u);
const mine = new Set([a, b, c, d]);
const calls = [];
const send = async (uid, kind, vars, path) => { if (mine.has(uid)) calls.push({ uid, kind, vars, path }); return 1; };
const yes = async () => true;
// b a déjà terminé son dhikr aujourd'hui (6 nov., Paris)
await pool.query("INSERT INTO athkar_counts(user_id, item_id, day, count) VALUES ($1, $2, '2026-11-06', 3)", [b, it]);
ok((await doneByDay(b, 400, new Date('2026-11-06T10:00:00Z'))).get('2026-11-06') === 1, 'dhikr terminé compté pour le jour');
await pool.query("INSERT INTO athkar_counts(user_id, item_id, day, count) VALUES ($1, $2, '2026-11-06', 5)", [a, draft]);
ok(!(await doneByDay(a, 400, new Date('2026-11-06T10:00:00Z'))).get('2026-11-06'), 'dhikr non publié : ne compte pas');

await runAthkar(null, new Date('2026-11-06T06:30:00Z'), { send, hasChannel: yes, learning });
ok(calls.length === 0, '7 h 30 à Paris (avant 8 h) : rien');
await runAthkar(null, new Date('2026-11-06T07:10:00Z'), { send, hasChannel: async () => false, learning });
ok(calls.length === 0, 'sans canal de notification : rien');
await runAthkar(null, new Date('2026-11-06T07:10:00Z'), { send, hasChannel: yes, learning });
const got = new Set(calls.map((x) => x.uid));
ok(got.has(a) && !got.has(b) && !got.has(c) && !got.has(d), 'rappel : seulement si objectif pas atteint, notifications activées, formule Apprentissage');
ok(calls[0].kind === 'athkar' && calls[0].vars.goal === 1 && calls[0].path === '/learning?tab=athkar', 'rappel : contenu et lien vers l’onglet');
const n = calls.length;
await runAthkar(null, new Date('2026-11-06T08:10:00Z'), { send, hasChannel: yes, learning });
ok(calls.length === n, 'un seul rappel par jour');
await runAthkar(null, new Date('2026-11-07T11:30:00Z'), { send, hasChannel: yes, learning });
ok(calls.length === n, 'plus de 3 h après l’heure choisie : pas de rappel tardif');
await runAthkar(null, new Date('2026-11-08T07:30:00Z'), { send, hasChannel: yes, learning });
ok(calls.length > n, 'le lendemain : nouveau rappel');
await pool.query("INSERT INTO app_settings(key, value) VALUES ('feat_athkar', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'"); invalidateSettings?.();
const k = calls.length;
await runAthkar(null, new Date('2026-11-09T07:30:00Z'), { send, hasChannel: yes, learning });
ok(calls.length === k, 'fonction coupée : rien');

await pool.query("DELETE FROM app_settings WHERE key = 'feat_athkar'"); invalidateSettings?.();
await pool.query('DELETE FROM athkar_items WHERE id = ANY($1)', [[it, draft]]);
await pool.query('DELETE FROM users WHERE id = ANY($1)', [[a, b, c, d]]);
await pool.end();
console.log('athkar run OK');
