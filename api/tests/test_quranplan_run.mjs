// Étape 45E — lecture du Coran en 30 jours : découpage des juz, jour du programme, rappel quotidien.
// Variables : DATABASE_URL, JWT_SECRET, SETTINGS_KEY, PRACTICE_KEY.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const { pool } = await import('../src/db.js');
const { JUZS, SURA_VERSES } = await import('../src/modules/quran/juz.js');
const { dayOf, runPlan } = await import('../src/modules/quranplan/lib.js');
const { invalidateSettings } = await import('../src/settings.js');
const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };

// Découpage : 30 juz contigus qui couvrent les 6236 versets
ok(SURA_VERSES.length === 114 && SURA_VERSES.reduce((a, b) => a + b, 0) === 6236, '114 sourates, 6236 versets');
const idx = (p) => SURA_VERSES.slice(0, p.sura - 1).reduce((a, b) => a + b, 0) + p.aya; // rang du verset (1 à 6236)
ok(JUZS.length === 30 && idx(JUZS[0].start) === 1 && idx(JUZS[29].end) === 6236, 'du premier au dernier verset');
ok(JUZS.every((j, i) => i === 0 || idx(j.start) === idx(JUZS[i - 1].end) + 1), 'juz contigus, sans trou ni chevauchement');
ok(JUZS.every((j) => j.end.aya >= 1 && j.end.aya <= SURA_VERSES[j.end.sura - 1]), 'fins de juz valides');
ok(JUZS[1].start.sura === 2 && JUZS[1].start.aya === 142 && JUZS[29].start.sura === 78, 'juz 2 = Al-Baqara 142, juz 30 = sourate 78');
ok(JUZS[13].end.sura === 16 && JUZS[13].end.aya === 128 && JUZS[12].end.sura === 14 && JUZS[12].end.aya === 52, 'fin de juz en fin de sourate (14:52, 16:128)');
ok(dayOf('2026-11-01', '2026-11-01') === 1 && dayOf('2026-11-01', '2026-11-30') === 30 && dayOf('2026-11-01', '2026-10-31') === 0, 'jour du programme');
ok(dayOf('2026-03-20', '2026-03-31') === 12 && dayOf('2026-10-20', '2026-10-30') === 11, 'jour du programme aux changements d’heure');

// Rappel
await pool.query("DELETE FROM app_settings WHERE key IN ('feat_quranplan', 'feat_quran')"); invalidateSettings?.();
const tag = randomUUID().slice(0, 8);
const mk = async (push = true) => (await pool.query("INSERT INTO users(email, password_hash, name, notify_push) VALUES ($1,'x','P',$2) RETURNING id", [`qp-${tag}-${randomUUID().slice(0, 6)}@test.local`, push])).rows[0].id;
const [a, b, c, d] = [await mk(), await mk(), await mk(false), await mk()];
for (const u of [a, b, c]) await pool.query("INSERT INTO quran_plans(user_id, started_on, remind_hour) VALUES ($1, '2026-11-01', 8)", [u]);
await pool.query("INSERT INTO quran_plans(user_id, started_on, remind_hour) VALUES ($1, '2026-10-01', 8)", [d]); // programme terminé (jour > 30)
await pool.query('INSERT INTO quran_plan_reads(user_id, juz) VALUES ($1, 6)', [b]); // b a déjà lu le juz 6
const mine = new Set([a, b, c, d]); const calls = [];
const send = async (uid, kind, vars, path) => { if (mine.has(uid)) calls.push({ uid, kind, vars, path }); return 1; };
const yes = async () => true;
await runPlan(null, new Date('2026-11-06T06:30:00Z'), { send, hasChannel: yes });
ok(calls.length === 0, 'avant l’heure choisie : rien');
await runPlan(null, new Date('2026-11-06T07:10:00Z'), { send, hasChannel: yes });
const got = new Set(calls.map((x) => x.uid));
ok(got.has(a) && !got.has(b) && !got.has(c) && !got.has(d), 'rappel : juz du jour non lu, notifications activées, programme en cours');
ok(calls[0].kind === 'quranplan' && calls[0].vars.juz === 6 && calls[0].path === '/coran/4#v148', 'jour 6 → juz 6 (An-Nisa 148), lien vers le verset');
const n = calls.length;
await runPlan(null, new Date('2026-11-06T08:10:00Z'), { send, hasChannel: yes });
ok(calls.length === n, 'un seul rappel par jour');
await runPlan(null, new Date('2026-11-07T13:00:00Z'), { send, hasChannel: yes });
ok(calls.length === n, 'plus de 3 h après l’heure : pas de rappel tardif');
await pool.query("INSERT INTO app_settings(key, value) VALUES ('feat_quranplan', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'"); invalidateSettings?.();
await runPlan(null, new Date('2026-11-08T07:10:00Z'), { send, hasChannel: yes });
ok(calls.length === n, 'fonction coupée : rien');
await pool.query("DELETE FROM app_settings WHERE key = 'feat_quranplan'"); invalidateSettings?.();
await runPlan(null, new Date('2026-11-08T07:10:00Z'), { send, hasChannel: yes });
ok(calls.length > n, 'le lendemain : nouveau rappel');
await pool.query('DELETE FROM users WHERE id = ANY($1)', [[a, b, c, d]]);
await pool.end();
console.log('quran plan run OK');
