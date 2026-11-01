// Étape 45C — vendredi : jour à Paris, carte publique, notification une fois par vendredi, pas de rattrapage tardif.
// Variables : DATABASE_URL, JWT_SECRET, SETTINGS_KEY, PRACTICE_KEY.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const { pool } = await import('../src/db.js');
const { runFriday, parisDay, publicFriday, DEFAULTS } = await import('../src/modules/friday/lib.js');
const { invalidateSettings } = await import('../src/settings.js');

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
const Z = (s) => new Date(s);
const tag = randomUUID().slice(0, 8);
await pool.query("INSERT INTO friday_page(id) VALUES (1) ON CONFLICT DO NOTHING");
await pool.query("UPDATE friday_page SET enabled = false, notify = true, notify_hour = 8, last_notified_on = NULL, collection_id = NULL, show_kahf = true, show_ghusl = true, show_salawat = true, ghusl_fr = '', salawat_en = '', notif_fr = '', notif_en = '', notif_ar = ''");
await pool.query("DELETE FROM app_settings WHERE key IN ('feat_friday')");
invalidateSettings?.();
const mk = async (push, disabled = false) => (await pool.query(
  "INSERT INTO users(email, password_hash, name, notify_push, disabled_at) VALUES ($1, 'x', 'N', $2, $3) RETURNING id", [`fr-${tag}-${randomUUID().slice(0, 6)}@test.local`, push, disabled ? new Date() : null])).rows[0].id;
const [a, b, c] = [await mk(true), await mk(true), await mk(false)];
const dis = await mk(true, true);
const mine = new Set([a, b, c, dis]);
const calls = [];
const send = async (uid, kind, vars, path) => { if (mine.has(uid)) calls.push({ uid, kind, vars, path }); return 1; };
const yes = async () => true; const no = async () => false;
const last = async () => (await pool.query("SELECT to_char(last_notified_on, 'YYYY-MM-DD') AS d FROM friday_page WHERE id = 1")).rows[0].d;

// Jour à Paris (hiver UTC+1, été UTC+2) : vendredi 23 h 30 à Paris = vendredi 22 h 30 UTC ; samedi 0 h 30 à Paris = vendredi 23 h 30 UTC
ok(parisDay(Z('2026-11-06T07:00:00Z')).isFriday && parisDay(Z('2026-11-06T07:00:00Z')).hour === 8, 'vendredi 8 h à Paris reconnu');
ok(!parisDay(Z('2026-11-06T23:30:00Z')).isFriday, 'samedi 0 h 30 à Paris n’est plus vendredi (même si c’est encore vendredi en UTC)');
ok(parisDay(Z('2026-11-05T23:30:00Z')).isFriday && parisDay(Z('2026-11-05T23:30:00Z')).date === '2026-11-06', 'vendredi 0 h 30 à Paris est déjà vendredi (jeudi en UTC)');
ok(parisDay(Z('2026-07-10T10:00:00Z')).isFriday && !parisDay(Z('2026-07-11T10:00:00Z')).isFriday, 'heure d’été : vendredi 10 juillet 2026');

// Carte publique : désactivée = rien ; activée = seulement le vendredi
ok((await publicFriday('fr', Z('2026-11-06T10:00:00Z'))).active === false, 'vendredi désactivé : pas de carte');
await pool.query('UPDATE friday_page SET enabled = true');
ok((await publicFriday('fr', Z('2026-11-05T10:00:00Z'))).active === false, 'activé mais jeudi : pas de carte');
const f = await publicFriday('en', Z('2026-11-06T10:00:00Z'));
ok(f.active && f.ghusl === DEFAULTS.ghusl.en && f.salawat === DEFAULTS.salawat.en && f.kahf?.n === 18, 'vendredi : carte avec les textes par défaut (en) et Al-Kahf');
await pool.query("UPDATE friday_page SET ghusl_fr = 'Texte saisi', show_salawat = false");
const g = await publicFriday('fr', Z('2026-11-06T10:00:00Z'));
ok(g.ghusl === 'Texte saisi' && g.salawat === null, 'texte saisi dans l’admin, élément masqué = null');

// Notification
await runFriday(null, Z('2026-11-05T10:00:00Z'), { send, hasChannel: yes });
ok(calls.length === 0, 'jeudi : rien');
await runFriday(null, Z('2026-11-06T06:30:00Z'), { send, hasChannel: yes });
ok(calls.length === 0, 'vendredi 7 h 30 (avant 8 h) : rien');
await runFriday(null, Z('2026-11-06T07:10:00Z'), { send, hasChannel: no });
ok(calls.length === 0 && (await last()) === null, 'sans canal de notification : rien envoyé, jour pas marqué');
await runFriday(null, Z('2026-11-06T07:10:00Z'), { send, hasChannel: yes });
const got = new Set(calls.map((x) => x.uid));
ok(got.has(a) && got.has(b) && !got.has(c) && !got.has(dis), 'envoyé aux membres qui ont activé les notifications, pas aux autres ni aux comptes suspendus');
ok(calls[0].kind === 'friday' && calls[0].vars.b.fr === DEFAULTS.notif.fr && calls[0].vars.b.en && calls[0].vars.b.ar, 'texte par défaut dans les 3 langues');
ok((await last()) === '2026-11-06', 'date du vendredi enregistrée');
const n = calls.length;
await runFriday(null, Z('2026-11-06T09:00:00Z'), { send, hasChannel: yes });
ok(calls.length === n, 'une seule notification par vendredi');
await runFriday(null, Z('2026-11-13T07:30:00Z'), { send, hasChannel: yes });
ok(calls.length > n, 'le vendredi suivant : nouvelle notification');
// Activé trop tard : marqué sans envoi
await pool.query("UPDATE friday_page SET last_notified_on = NULL");
const m = calls.length;
await runFriday(null, Z('2026-11-20T18:00:00Z'), { send, hasChannel: yes });
ok(calls.length === m && (await last()) === '2026-11-20', 'heure déjà passée de plus de 6 h : marqué, aucune notification tardive');
// Notification coupée / vendredi désactivé
await pool.query("UPDATE friday_page SET notify = false, last_notified_on = NULL");
await runFriday(null, Z('2026-11-27T07:30:00Z'), { send, hasChannel: yes });
ok(calls.length === m && (await last()) === null, 'notification coupée : rien');
await pool.query("UPDATE friday_page SET notify = true, enabled = false");
await runFriday(null, Z('2026-11-27T07:30:00Z'), { send, hasChannel: yes });
ok(calls.length === m, 'vendredi désactivé : rien');
await pool.query("UPDATE friday_page SET enabled = true");
await pool.query("INSERT INTO app_settings(key, value) VALUES ('feat_friday', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'"); invalidateSettings?.();
await runFriday(null, Z('2026-11-27T07:30:00Z'), { send, hasChannel: yes });
ok(calls.length === m, 'fonction coupée : rien');

await pool.query("DELETE FROM app_settings WHERE key = 'feat_friday'"); invalidateSettings?.();
await pool.query("UPDATE friday_page SET enabled = false, last_notified_on = NULL, ghusl_fr = '', show_salawat = true");
await pool.query('DELETE FROM users WHERE id = ANY($1)', [[a, b, c, dis]]);
console.log('friday run OK'); process.exit(0);
