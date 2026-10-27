// Étape 39 — nettoyage des erreurs anciennes (base réelle). Variables : DATABASE_URL, JWT_SECRET, SETTINGS_KEY, PRACTICE_KEY.
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { purgeErrors, recordError } from '../src/errors.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
await pool.query("DELETE FROM error_groups WHERE fingerprint LIKE 'purge%'");
const mk = (fp, state, days) => pool.query("INSERT INTO error_groups(fingerprint, source, message, state, last_at) VALUES ($1, 'api', 'm', $2, now() - ($3 || ' days')::interval)", [fp, state, String(days)]);
await mk('purge-open-old', 'open', 200); await mk('purge-res-old', 'resolved', 100); await mk('purge-res-new', 'resolved', 10); await mk('purge-ign-old', 'ignored', 95);
await pool.query("INSERT INTO error_events(fingerprint, at) VALUES ('purge-open-old', now() - interval '40 days'), ('purge-open-old', now() - interval '2 days')");
await purgeErrors();
const left = (await pool.query("SELECT fingerprint FROM error_groups WHERE fingerprint LIKE 'purge%' ORDER BY 1")).rows.map((r) => r.fingerprint);
ok(left.join() === 'purge-open-old,purge-res-new', 'résolues/ignorées de plus de 90 jours supprimées, ouvertes et récentes gardées');
const ev = (await pool.query("SELECT count(*)::int AS n FROM error_events WHERE fingerprint = 'purge-open-old'")).rows[0].n;
ok(ev === 1, 'occurrences de plus de 30 jours supprimées');
await pool.query("DELETE FROM error_groups WHERE fingerprint LIKE 'purge%'");
const r = await recordError({ source: 'api', message: 'Essai direct', stack: 'at x', route: '/essai/1' });
ok(r.fingerprint && /^[0-9a-f]{16}$/.test(r.fingerprint), 'recordError renvoie l’empreinte');
await pool.query('DELETE FROM error_groups WHERE fingerprint = $1', [r.fingerprint]);
await pool.end();
console.log('\nTout est OK');
