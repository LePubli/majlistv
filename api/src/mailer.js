// Envoi des e-mails : file d'attente en base (email_outbox) vidée par une boucle de fond.
// Réglages SMTP dans Admin → Paramètres → E-mails (pris en compte sans redéploiement).
import nodemailer from 'nodemailer';
import { pool } from './db.js';
import { getSetting } from './settings.js';
import { renderEmail } from './emails.js';

const MAX_ATTEMPTS = 5;
const state = { running: false, timer: null, log: null, transport: null, sig: '' };

// Réglages d'envoi actuels, ou null si l'envoi n'est pas configuré.
export async function smtpConf() {
  const [host, port, security, user, pass, from, replyTo] = await Promise.all(
    ['smtp_host', 'smtp_port', 'smtp_security', 'smtp_user', 'smtp_password', 'mail_from', 'mail_reply_to'].map((k) => getSetting(k))
  );
  if (!host || !from) return null;
  return { host, port: Number(port) || 587, security: security || 'starttls', user, pass, from, replyTo };
}

function transportFor(c) {
  const sig = JSON.stringify([c.host, c.port, c.security, c.user, c.pass]);
  if (state.sig !== sig) {
    state.transport = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.security === 'ssl',
      requireTLS: c.security === 'starttls',
      ignoreTLS: c.security === 'none',
      auth: c.user ? { user: c.user, pass: c.pass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
    state.sig = sig;
  }
  return state.transport;
}

// Envoi immédiat (test depuis le back-office). Lève une erreur lisible en cas d'échec.
export async function sendNow({ to, subject, html, text }) {
  const c = await smtpConf();
  if (!c) throw new Error('Serveur SMTP et expéditeur à renseigner (et enregistrer) avant le test.');
  return transportFor(c).sendMail({ from: c.from, replyTo: c.replyTo || undefined, to, subject, html, text });
}

export async function baseVars() {
  const [app, webUrl] = await Promise.all([getSetting('app_name'), getSetting('web_url')]);
  return { app: app || 'Mejliss TV', webUrl: (webUrl || '').replace(/\/$/, '') };
}

// Met un e-mail en file. db = pool ou client de transaction. dedupeKey : jamais deux fois le même envoi.
// vars.path (ex. /account) devient le lien du bouton.
export async function enqueueEmail(db, { userId = null, to, locale, kind, vars = {}, dedupeKey = null }) {
  renderEmail(kind, locale, vars); // vérifie tout de suite que le modèle existe
  await db.query(
    `INSERT INTO email_outbox(user_id, to_email, kind, locale, vars, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (dedupe_key) DO NOTHING`,
    [userId, to, kind, locale || 'fr', JSON.stringify(vars), dedupeKey]
  );
  kickMailer();
}

// Mise en forme au moment de l'envoi : nom du site, adresse et logo actuels.
function compose(m, base) {
  const vars = { ...base, ...m.vars };
  if (m.vars.path && base.webUrl) vars.url = base.webUrl + m.vars.path;
  return renderEmail(m.kind, m.locale, vars);
}

// Même chose pour un utilisateur connu : e-mail, prénom et langue lus en base.
export async function enqueueForUser(db, userId, kind, vars = {}, dedupeKey = null) {
  const { rows } = await db.query('SELECT email, name, locale FROM users WHERE id = $1', [userId]);
  if (!rows[0]) return;
  await enqueueEmail(db, { userId, to: rows[0].email, locale: rows[0].locale, kind, vars: { name: rows[0].name, ...vars }, dedupeKey });
}

async function tick() {
  if (state.running) return;
  state.running = true;
  try {
    // Un e-mail resté bloqué plus de 48 h (envoi non configuré) n'a plus de sens : on l'abandonne.
    await pool.query("UPDATE email_outbox SET status = 'expired' WHERE status = 'pending' AND created_at < now() - interval '48 hours'");
    const c = await smtpConf();
    if (!c) return;
    // Réservation (10 min) : si le serveur redémarre pendant l'envoi, l'e-mail repart ensuite.
    const { rows } = await pool.query(
      `UPDATE email_outbox SET attempts = attempts + 1, send_after = now() + interval '10 minutes'
        WHERE id IN (SELECT id FROM email_outbox WHERE status = 'pending' AND send_after <= now()
                     ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED)
        RETURNING id, to_email, kind, locale, vars, attempts`
    );
    if (!rows.length) return;
    const transport = transportFor(c);
    const base = await baseVars();
    for (const m of rows) {
      try {
        const mail = compose(m, base);
        await transport.sendMail({ from: c.from, replyTo: c.replyTo || undefined, to: m.to_email, ...mail });
        await pool.query("UPDATE email_outbox SET status = 'sent', sent_at = now(), last_error = NULL, subject = $2 WHERE id = $1", [m.id, mail.subject]);
      } catch (err) {
        const last = m.attempts >= MAX_ATTEMPTS;
        await pool.query(
          `UPDATE email_outbox SET status = $2, last_error = $3, send_after = now() + make_interval(mins => $4) WHERE id = $1`,
          [m.id, last ? 'failed' : 'pending', String(err.message).slice(0, 500), 2 ** m.attempts]
        );
        state.log?.warn(`E-mail ${m.id} non envoyé (essai ${m.attempts}/${MAX_ATTEMPTS}) : ${err.message}`);
      }
    }
  } catch (err) {
    state.log?.warn(`File d'e-mails : ${err.message}`);
  } finally {
    state.running = false;
  }
}

// Déclenche un passage rapide (après une mise en file) sans attendre le prochain tour.
export function kickMailer() {
  if (state.log) setTimeout(tick, 200);
}

export function startMailer(log, everyMs = 15000) {
  state.log = log;
  setTimeout(tick, 2000);
  return setInterval(tick, everyMs);
}
