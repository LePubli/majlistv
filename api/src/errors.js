// Étape 39 — Suivi des erreurs : enregistrement, regroupement, alerte e-mail, nettoyage.
// recordError() ne lève JAMAIS d'exception (une erreur du suivi ne doit pas aggraver une erreur) et ne bloque pas la réponse.
import { pool } from './db.js';
import { getSetting, isOn } from './settings.js';
import { enqueueEmail, smtpConf } from './mailer.js';
import { recipients } from './health.js';
import { alertKind, alertText, clip, fingerprint, makeLimiter, normRoute, scrub } from './errorsLib.js';

const events = makeLimiter(60, 60e3);      // 60 erreurs enregistrées par minute et par processus
const alerts = makeLimiter(6, 3600e3);     // 6 e-mails d'alerte par heure
const KEEP_EVENTS_DAYS = 30;
const KEEP_CLOSED_DAYS = 90;

/** e = { source: 'api' | 'web', message, stack, route, method, status, path, userAgent } → { fingerprint, alerted } ou { dropped: true }. */
export async function recordError(e, now = Date.now()) {
  try {
    if (!events.allow(now)) return { dropped: true };
    const source = e.source === 'web' ? 'web' : 'api';
    const message = clip(scrub(e.message || 'Erreur sans message'), 500);
    const stack = clip(scrub(e.stack || ''), 4000);
    const route = normRoute(e.route || e.path || '');
    const fp = fingerprint(source, message, route);
    const prev = (await pool.query('SELECT state FROM error_groups WHERE fingerprint = $1', [fp])).rows[0] || null;
    const { rows } = await pool.query(
      `INSERT INTO error_groups(fingerprint, source, message, route, method, http_status, last_stack)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (fingerprint) DO UPDATE SET count = error_groups.count + 1, last_at = now(), last_stack = EXCLUDED.last_stack,
         state = CASE WHEN error_groups.state = 'resolved' THEN 'open' ELSE error_groups.state END,
         resolved_at = CASE WHEN error_groups.state = 'resolved' THEN NULL ELSE error_groups.resolved_at END
       RETURNING count, source, message, route`,
      [fp, source, message, route, clip(e.method || '', 10), Number.isInteger(e.status) ? e.status : null, stack]);
    await pool.query('INSERT INTO error_events(fingerprint, path, user_agent) VALUES ($1, $2, $3)', [fp, clip(scrub(e.path || route), 300), clip(scrub(e.userAgent || ''), 200)]);

    const kind = alertKind(prev);
    let alerted = false;
    if (kind && isOn(await getSetting('errors_alerts_enabled')) && alerts.allow(now) && (await smtpConf())) {
      const to = await recipients();
      const t = alertText(kind, { ...rows[0], count: Number(rows[0].count) });
      const slot = Math.floor(now / 3600e3);
      for (const addr of to) {
        await enqueueEmail(pool, { to: addr, locale: 'fr', kind: 'health_alert', vars: { title: t.title, summary: t.summary, advice: t.advice, path: '/admin?tab=errors' }, dedupeKey: `error:${fp}:${kind}:${slot}:${addr}` });
      }
      if (to.length) { alerted = true; await pool.query('UPDATE error_groups SET last_alert_at = now() WHERE fingerprint = $1', [fp]); }
    }
    return { fingerprint: fp, alerted };
  } catch {
    return { failed: true };
  }
}

/** Nettoyage quotidien : occurrences de plus de 30 jours, erreurs résolues ou ignorées sans nouvelle occurrence depuis 90 jours. */
export async function purgeErrors() {
  await pool.query("DELETE FROM error_events WHERE at < now() - ($1 || ' days')::interval", [String(KEEP_EVENTS_DAYS)]);
  await pool.query("DELETE FROM error_groups WHERE state <> 'open' AND last_at < now() - ($1 || ' days')::interval", [String(KEEP_CLOSED_DAYS)]);
}

let timer = null;
export function startErrors(log) {
  const tick = () => purgeErrors().catch((e) => log?.warn({ err: e.message }, 'errors: nettoyage impossible'));
  setTimeout(tick, 60e3).unref?.();
  timer = setInterval(tick, 24 * 3600e3);
  timer.unref?.();
  return timer;
}
