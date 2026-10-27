// Étape 29 — Santé du serveur : mesures du système, historique, tendance et alertes e-mail.
// Le disque mesuré est celui qui porte le dossier HEALTH_DISK_PATH (par défaut « / » dans le conteneur) : sous Docker,
// c'est le disque du serveur qui héberge les images (le même que `df -h /` sur le VPS). Les images Docker et le cache de build
// ne sont pas visibles d'ici (le conteneur n'a pas accès à Docker, volontairement) : l'écran affiche les commandes de nettoyage.
import fs from 'node:fs';
import os from 'node:os';
import { pool } from './db.js';
import { getSetting, getNumber, isOn } from './settings.js';
import { enqueueEmail, smtpConf } from './mailer.js';
import { alertText, decideAlert, diskFromStatfs, fmtBytes, levelOf, memFrom, trend } from './healthLib.js';

const DISK_PATH = process.env.HEALTH_DISK_PATH || '/';
const EVERY_MS = 10 * 60 * 1000;
const KEEP_DAYS = 35;

/** Mesures instantanées du système (jamais d'exception : une mesure impossible vaut null). */
export function readSystem(path = DISK_PATH) {
  let disk = null;
  try { disk = diskFromStatfs(fs.statfsSync(path)); } catch { /* disque illisible */ }
  const mem = memFrom(os.totalmem(), os.freemem());
  return { disk, mem, load: os.loadavg(), cpus: os.availableParallelism ? os.availableParallelism() : os.cpus().length, uptimeSec: Math.round(os.uptime()) };
}

async function thresholds() {
  const [diskWarn, diskCrit, memCrit] = await Promise.all([getNumber('health_disk_warn_pct'), getNumber('health_disk_crit_pct'), getNumber('health_mem_crit_pct')]);
  return { diskWarn, diskCrit, memWarn: Math.max(5, memCrit - 5), memCrit };
}

/** Destinataires des alertes : réglage « health_alert_to » (adresses séparées par des virgules), sinon tous les administrateurs. */
export async function recipients() {
  const set = String(await getSetting('health_alert_to') || '').split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /^\S+@\S+\.\S+$/.test(s));
  if (set.length) return [...new Set(set)];
  const { rows } = await pool.query("SELECT email FROM users WHERE role = 'admin' AND disabled_at IS NULL ORDER BY created_at");
  return rows.map((r) => r.email);
}

async function sendAlert(kind, level, pct, detail, now) {
  const to = await recipients();
  if (!to.length || !(await smtpConf())) return false;
  const t = alertText(kind, level, pct, detail);
  const slot = Math.floor(now / 3600e3);
  for (const addr of to) {
    await enqueueEmail(pool, { to: addr, locale: 'fr', kind: 'health_alert', vars: { title: t.title, summary: t.summary, advice: t.advice, path: '/admin?tab=health' }, dedupeKey: `health:${kind}:${level}:${slot}:${addr}` });
  }
  return true;
}

async function evaluate(kind, pct, warn, crit, detail, now, enabled) {
  const level = levelOf(pct, warn, crit);
  const { rows } = await pool.query('SELECT level, extract(epoch FROM last_sent_at) * 1000 AS last FROM health_alerts WHERE kind = $1', [kind]);
  const prev = rows[0] ? { level: rows[0].level, lastSentAt: rows[0].last == null ? null : Number(rows[0].last) } : null;
  const action = enabled ? decideAlert(prev, level, now) : null;
  const sent = action ? await sendAlert(kind, action === 'recovered' ? 'ok' : level, pct, detail, now) : false;
  // Le niveau est mémorisé à chaque mesure ; la date d'envoi seulement si un e-mail est réellement parti.
  await pool.query(
    `INSERT INTO health_alerts(kind, level, since, last_sent_at) VALUES ($1, $2, now(), CASE WHEN $3 THEN now() END)
     ON CONFLICT (kind) DO UPDATE SET level = EXCLUDED.level,
       since = CASE WHEN health_alerts.level = EXCLUDED.level THEN health_alerts.since ELSE now() END,
       last_sent_at = CASE WHEN $3 THEN now() WHEN EXCLUDED.level = 'ok' THEN NULL ELSE health_alerts.last_sent_at END`,
    [kind, level, sent]);
  return { kind, level, action, sent };
}

/** Une mesure : enregistre l'échantillon, met à jour les niveaux et envoie les alertes éventuelles. */
export async function runCheck(now = Date.now()) {
  const sys = readSystem();
  if (sys.disk) {
    await pool.query('INSERT INTO health_samples(at, disk_total, disk_free, mem_total, mem_avail, load1) VALUES (to_timestamp($1 / 1000.0), $2, $3, $4, $5, $6) ON CONFLICT (at) DO NOTHING',
      [now, sys.disk.total, sys.disk.free, sys.mem.total, sys.mem.avail, sys.load[0]]);
  }
  await pool.query("DELETE FROM health_samples WHERE at < now() - ($1 || ' days')::interval", [String(KEEP_DAYS)]);
  const th = await thresholds();
  const enabled = isOn(await getSetting('health_alerts_enabled'));
  const out = [];
  if (sys.disk) out.push(await evaluate('disk', sys.disk.pct, th.diskWarn, th.diskCrit, `Il reste ${fmtBytes(sys.disk.free)} sur ${fmtBytes(sys.disk.total)}.`, now, enabled));
  out.push(await evaluate('mem', sys.mem.pct, th.memWarn, th.memCrit, `Il reste ${fmtBytes(sys.mem.avail)} de mémoire disponible sur ${fmtBytes(sys.mem.total)}.`, now, enabled));
  return { sys, checks: out };
}

/** Données de l'écran Admin → Santé du serveur. */
export async function report() {
  const sys = readSystem();
  const th = await thresholds();
  const [series, alerts, db, tables, mailOn, to] = await Promise.all([
    pool.query(`SELECT extract(epoch FROM date_trunc('hour', at)) * 1000 AS t, round(avg(disk_total - disk_free))::bigint AS used, max(disk_total)::bigint AS total,
                       round(avg(mem_total - mem_avail))::bigint AS mem_used, max(mem_total)::bigint AS mem_total, round(avg(load1)::numeric, 2) AS load1
                  FROM health_samples WHERE at > now() - interval '7 days' GROUP BY 1 ORDER BY 1`),
    pool.query('SELECT kind, level, since, last_sent_at FROM health_alerts'),
    pool.query('SELECT pg_database_size(current_database())::bigint AS size'),
    pool.query(`SELECT relname AS name, pg_total_relation_size(c.oid)::bigint AS size FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 2 DESC LIMIT 6`),
    smtpConf(), recipients(),
  ]);
  const pts = series.rows.map((r) => ({ t: Number(r.t), used: Number(r.used), total: Number(r.total), memUsed: Number(r.mem_used), memTotal: Number(r.mem_total), load1: Number(r.load1) }));
  const disk = sys.disk && { ...sys.disk, level: levelOf(sys.disk.pct, th.diskWarn, th.diskCrit), ...trend(pts.map((p) => ({ t: p.t, used: p.used })), sys.disk.total) };
  const mem = { ...sys.mem, level: levelOf(sys.mem.pct, th.memWarn, th.memCrit) };
  const loadPct = Math.round((sys.load[0] / Math.max(1, sys.cpus)) * 100);
  const worst = [disk?.level, mem.level].includes('crit') ? 'crit' : [disk?.level, mem.level].includes('warn') ? 'warn' : 'ok';
  return {
    now: Date.now(), level: worst, disk, mem,
    cpu: { load: sys.load.map((n) => Math.round(n * 100) / 100), cpus: sys.cpus, loadPct, level: loadPct >= 150 ? 'crit' : loadPct >= 90 ? 'warn' : 'ok' },
    uptimeSec: sys.uptimeSec, thresholds: th,
    series: pts.map((p) => ({ t: p.t, diskPct: p.total ? Math.round((p.used / p.total) * 1000) / 10 : null, memPct: p.memTotal ? Math.round((p.memUsed / p.memTotal) * 1000) / 10 : null, load1: p.load1 })),
    database: { size: Number(db.rows[0].size), tables: tables.rows.map((r) => ({ name: r.name, size: Number(r.size) })) },
    alerts: { enabled: isOn(await getSetting('health_alerts_enabled')), mailConfigured: Boolean(mailOn), recipients: to.length, states: alerts.rows },
  };
}

let timer = null;
/** Boucle de fond : une mesure toutes les 10 minutes (première après 30 s). */
export function startHealth(log) {
  const tick = () => runCheck().catch((e) => log?.warn({ err: e.message }, 'health: mesure impossible'));
  setTimeout(tick, 30000).unref?.();
  timer = setInterval(tick, EVERY_MS);
  timer.unref?.();
  return timer;
}
