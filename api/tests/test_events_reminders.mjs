// Amélioration 4.2, étape 3 : rappels d'événements (base réelle, envois simulés). Variables : DATABASE_URL, JWT_SECRET, SETTINGS_KEY, PRACTICE_KEY.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';
import { runEventReminders, dueKind } from '../src/modules/events/reminders.js';
import { renderEmail } from '../src/emails.js';
import { pushText } from '../src/push.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
const tag = randomUUID().slice(0, 6);
const T0 = new Date('2027-03-10T12:00:00Z');
const at = (min) => new Date(T0.getTime() + min * 60000);

// Règle pure
ok(dueKind(at(23 * 60), T0) === 'day', '23 h avant : rappel « jour »');
ok(dueKind(at(25 * 60), T0) === null, '25 h avant : rien');
ok(dueKind(at(3 * 60), T0) === null, 'moins de 3 h avant : plus de rappel « jour »');
ok(dueKind(at(20), T0) === 'soon', '20 min avant : « ça commence »');
ok(dueKind(at(-3), T0) === 'soon' && dueKind(at(-6), T0) === null, 'jusqu\'à 5 min après le début, pas au-delà');

// Modèles : les trois langues, sans variable oubliée
for (const l of ['fr', 'en', 'ar']) {
  for (const k of ['event_reminder', 'event_soon', 'event_cancelled']) {
    const m = renderEmail(k, l, { title: 'Titre X', when: 'demain', webUrl: 'https://exemple.fr', path: '/events/1' });
    assert.ok(m.subject.includes('Titre X') && !/\{[a-z]+\}/.test(m.html + m.text), `${k}/${l}`);
    const p = pushText(k, l, { title: 'Titre X', at: at(0).toISOString() }); assert.ok(p.title && p.body && !/undefined/.test(p.body), `push ${k}/${l}`);
  }
}
ok(true, 'e-mails et notifications : 3 modèles × 3 langues');

// Base : un organisateur, 3 membres, des événements
const mkUser = async (name, disabled = false) => (await pool.query("INSERT INTO users(email, password_hash, name, locale, disabled_at) VALUES ($1, 'x', $2, $3, $4) RETURNING id", [`${name}-${tag}@test.local`, name, name === 'en' ? 'en' : 'fr', disabled ? new Date() : null])).rows[0].id;
const owner = await mkUser('orga'); const u1 = await mkUser('fr'); const u2 = await mkUser('en'); const uOff = await mkUser('off', true);
const mkEv = async (title, startMin, status = 'published') => (await pool.query("INSERT INTO events(title, source, video_ref, starts_at, duration_minutes, status, created_by) VALUES ($1, 'youtube', 'dQw4w9WgXcQ', $2, 60, $3, $4) RETURNING id", [`${title} ${tag}`, at(startMin), status, owner])).rows[0].id;
const sub = (e, u) => pool.query('INSERT INTO event_reminders(event_id, user_id) VALUES ($1, $2)', [e, u]);
const eDay = await mkEv('Jour', 20 * 60); const eFar = await mkEv('Loin', 50 * 60); const eCanc = await mkEv('Annulé', 5 * 60, 'cancelled'); const eDraft = await mkEv('Brouillon', 20 * 60, 'draft');
for (const e of [eDay, eFar, eCanc, eDraft]) { await sub(e, u1); await sub(e, u2); await sub(e, uOff); }

const sent = { push: [], mail: [] };
const deps = { mailOn: true, pushOn: true, send: async (uid, kind, vars, path) => { sent.push.push({ uid, kind, vars, path }); return 1; }, mail: async (uid, kind, vars, key) => { sent.mail.push({ uid, kind, vars, key }); } };
const mine = (l) => l.filter((x) => [u1, u2, uOff].includes(x.uid));
const log = { warn: (m) => console.log('WARN', m), info: () => {} };
const run = (when) => runEventReminders(log, when, deps);

let n = await run(T0);
ok(n === 8 && mine(sent.push).filter((x) => x.kind === 'event_reminder').length === 2 && mine(sent.mail).filter((x) => x.kind === 'event_reminder').length === 2, 'rappel « jour » : 2 membres × (notification + e-mail)');
ok(mine(sent.push).filter((x) => x.kind === 'event_cancelled').length === 2, 'annulation : avisée aux 2 membres');
ok(![...sent.push, ...sent.mail].some((x) => x.uid === uOff), 'membre désactivé : rien');
ok(![...sent.push, ...sent.mail].some((x) => x.vars.title.startsWith('Loin') || x.vars.title.startsWith('Brouillon')), 'événement lointain ou brouillon : rien');
const fr = sent.mail.find((x) => x.uid === u1 && x.kind === 'event_reminder'); const en = sent.mail.find((x) => x.uid === u2 && x.kind === 'event_reminder');
ok(fr.vars.path === `/events/${eDay}` && fr.vars.when !== en.vars.when && /mars/.test(fr.vars.when) && /March/.test(en.vars.when), 'date dans la langue du membre, lien vers la fiche');
ok(fr.key === `event:${eDay}:${u1}:event_reminder`, 'clé anti-doublon du courrier');

// Pas de double envoi
sent.push.length = 0; sent.mail.length = 0;
ok((await run(T0)) === 0 && (await run(at(30))) === 0, 'deuxième passage : aucun doublon');

// « Ça commence » 20 min avant le début de eDay
const s = await run(at(20 * 60 - 20));
ok(s === 4 && mine(sent.push).every((x) => x.kind === 'event_soon') && mine(sent.push).length === 2, '« ça commence » : une fois par membre, par notification et e-mail');
ok((await run(at(20 * 60 - 10))) === 0, '« ça commence » : pas de répétition');

// Heure déplacée : le nouveau créneau est rappelé de nouveau
await pool.query('UPDATE event_reminders SET day_sent_at = NULL, soon_sent_at = NULL WHERE event_id = $1', [eFar]);
sent.push.length = 0; sent.mail.length = 0;
ok((await run(at(50 * 60 - 10 * 60))) === 4, 'événement lointain, plus tard dans la fenêtre : rappel « jour »');

// Sans canal : rien, et rien n'est marqué comme envoyé
const eNone = await mkEv('SansCanal', 10 * 60); await sub(eNone, u1);
ok((await runEventReminders(null, T0, { ...deps, mailOn: false, pushOn: false })) === 0, 'sans canal d\'envoi : rien');
const marked = (await pool.query('SELECT day_sent_at FROM event_reminders WHERE event_id = $1', [eNone])).rows[0].day_sent_at;
ok(marked === null, 'sans canal : le rappel reste dû');
// Une seule voie (e-mail seul)
sent.push.length = 0; sent.mail.length = 0;
await runEventReminders(null, T0, { ...deps, pushOn: false });
ok(sent.push.length === 0 && sent.mail.some((x) => x.vars.title.startsWith('SansCanal')), 'e-mail seul : fonctionne sans notification');

await pool.query('DELETE FROM events WHERE created_by = $1', [owner]);
await pool.query('DELETE FROM users WHERE email LIKE $1', [`%-${tag}@test.local`]);
await pool.end();
console.log('\nTout est OK');
