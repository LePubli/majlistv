// Étape 45 — notification de saison : une fois par année hégirienne, seulement aux membres qui ont activé les notifications, pas de rattrapage tardif.
// Variables : DATABASE_URL, JWT_SECRET, SETTINGS_KEY, PRACTICE_KEY.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const { pool } = await import('../src/db.js');
const { runSeasons } = await import('../src/modules/seasons/lib.js');
const { invalidateSettings } = await import('../src/settings.js');

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
const D = (s) => new Date(`${s}T12:00:00Z`);
const tag = randomUUID().slice(0, 8);
await pool.query("INSERT INTO season_pages(id) VALUES ('ramadan'), ('hajj'), ('mawlid'), ('ashura') ON CONFLICT DO NOTHING");
await pool.query("UPDATE season_pages SET enabled = false, notify = true, last_notified_year = NULL, collection_id = NULL, lead_days = NULL, title_fr = '', title_en = '', title_ar = '', text_fr = '', text_en = '', text_ar = ''");
await pool.query("DELETE FROM app_settings WHERE key IN ('feat_seasons', 'hijri_offset_days')");
invalidateSettings?.();
const mk = async (push, disabled = false) => (await pool.query(
  "INSERT INTO users(email, password_hash, name, notify_push, disabled_at) VALUES ($1, 'x', 'N', $2, $3) RETURNING id", [`sn-${tag}-${randomUUID().slice(0, 6)}@test.local`, push, disabled ? new Date() : null])).rows[0].id;
const [a, b, c] = [await mk(true), await mk(true), await mk(false)];
const dis = await mk(true, true);
const mine = new Set([a, b, c, dis]);
const calls = [];
const send = async (uid, kind, vars, path) => { if (mine.has(uid)) calls.push({ uid, kind, vars, path }); return 1; };
const yes = async () => true; const no = async () => false;
const lastYear = async (id) => (await pool.query('SELECT last_notified_year AS y FROM season_pages WHERE id = $1', [id])).rows[0].y;

// 1) saison désactivée : rien
await runSeasons(null, D('2026-02-18'), { send, hasChannel: yes });
ok(calls.length === 0, 'saison désactivée : aucune notification');
// 2) saison activée, sans canal de notification : rien et rien de marqué
await pool.query("UPDATE season_pages SET enabled = true WHERE id = 'ramadan'");
await runSeasons(null, D('2026-02-18'), { send, hasChannel: no });
ok(calls.length === 0 && (await lastYear('ramadan')) === null, 'sans canal : rien envoyé, saison pas marquée');
// 3) avant l'ouverture de la période : rien
await runSeasons(null, D('2026-02-10'), { send, hasChannel: yes });
ok(calls.length === 0, 'avant l’ouverture : rien');
// 4) ouverture : envoyé aux membres qui ont activé les notifications (ni les autres ni les comptes suspendus)
await runSeasons(null, D('2026-02-11'), { send, hasChannel: yes });
const got = new Set(calls.map((x) => x.uid));
ok(got.has(a) && got.has(b) && !got.has(c) && !got.has(dis), 'ouverture : envoyé aux membres qui ont activé les notifications, pas aux autres ni aux comptes suspendus');
ok(calls[0].kind === 'season' && calls[0].vars.t.fr === 'Ramadan : des conférences pour le mois béni' && calls[0].vars.b.en && calls[0].vars.t.ar, 'textes par défaut dans les 3 langues');
ok((await lastYear('ramadan')) === 1447, 'année hégirienne 1447 enregistrée');
// 5) pas de doublon
const n = calls.length;
await runSeasons(null, D('2026-02-12'), { send, hasChannel: yes });
await runSeasons(null, D('2026-03-01'), { send, hasChannel: yes });
ok(calls.length === n, 'une seule notification par année hégirienne');
// 6) textes saisis
await pool.query("UPDATE season_pages SET enabled = true, title_fr = 'Hajj chez nous', text_en = 'Custom text' WHERE id = 'hajj'");
await runSeasons(null, D('2026-05-11'), { send, hasChannel: yes });
const h = calls.filter((x) => x.vars.t.fr === 'Hajj chez nous');
ok(h.length >= 2 && h[0].vars.b.en === 'Custom text' && h[0].vars.t.en.startsWith('Hajj and Eid'), 'textes saisis dans l’admin, sinon texte par défaut');
// 7) activée en cours de saison : marquée sans rien envoyer
await pool.query("UPDATE season_pages SET enabled = true WHERE id = 'mawlid'");
const m = calls.length;
await runSeasons(null, D('2026-08-20'), { send, hasChannel: yes });
ok(calls.length === m && (await lastYear('mawlid')) === 1448, 'activée en cours de saison : marquée, aucune notification tardive');
// 8) notification coupée pour la saison
await pool.query("UPDATE season_pages SET enabled = true, notify = false WHERE id = 'ashura'");
await runSeasons(null, D('2026-06-16'), { send, hasChannel: yes });
ok(calls.length === m && (await lastYear('ashura')) === null, 'notification coupée : rien');
// 9) fonction coupée
await pool.query("UPDATE season_pages SET notify = true, last_notified_year = NULL WHERE id = 'ashura'");
await pool.query("INSERT INTO app_settings(key, value) VALUES ('feat_seasons', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'");
invalidateSettings?.();
await runSeasons(null, D('2026-06-16'), { send, hasChannel: yes });
ok(calls.length === m, 'fonction coupée : rien');

await pool.query("DELETE FROM app_settings WHERE key = 'feat_seasons'");
await pool.query("UPDATE season_pages SET enabled = false, notify = true, last_notified_year = NULL, title_fr = '', text_en = ''");
await pool.query('DELETE FROM users WHERE id = ANY($1)', [[a, b, c, dis]]);
await pool.end();
console.log('seasons run OK');
