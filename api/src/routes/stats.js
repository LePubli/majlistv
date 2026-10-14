// Rapports d'audience (étape 18).
//   GET /admin/stats   administrateur : tout le site (visiteurs, provenance, appareils…) + toutes les conférences
//   GET /studio/stats  organisateur   : ses propres conférences seulement
// Paramètres : days (7 | 30 | 90 | 365), audience (web | kids), talk (une conférence), format (json | csv).
// Chiffres uniquement agrégés : jamais d'identité, y compris pour Kids (aucun profil d'enfant n'est nommé ni identifiable).
import { z } from 'zod';
import { pool } from '../db.js';
import { TZ } from '../revision.js';
import { todayStr } from '../stats.js';

const query = z.object({
  days: z.coerce.number().int().refine((n) => [7, 30, 90, 365].includes(n), 'days').default(30),
  audience: z.enum(['web', 'kids']).default('web'),
  talk: z.string().uuid().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

const addDays = async (day, n) => (await pool.query('SELECT ($1::date + $2::int)::text AS d', [day, n])).rows[0].d;
const num = (v) => Number(v) || 0;
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((100 * a) / b)) : null);

// Lit les compteurs d'une période. scope : { organizerId, talkId }.
async function talkPart(audience, since, until, scope) {
  const P = [audience, since, until, scope.organizerId || null, scope.talkId || null];
  const base = `WITH base AS (
    SELECT d.*, t.title, t.duration_seconds AS dur, t.speaker, t.category_id
      FROM stat_talk_daily d JOIN talks t ON t.id = d.talk_id
     WHERE d.audience = $1 AND d.day BETWEEN $2::date AND $3::date
       AND ($4::uuid IS NULL OR t.organizer_id = $4) AND ($5::uuid IS NULL OR d.talk_id = $5))`;
  const run = async (sql, extra = []) => (await pool.query(`${base} ${sql}`, [...P, ...extra])).rows;
  const [tot] = await run(`SELECT coalesce(sum(views),0)::int AS views, coalesce(sum(viewers),0)::int AS viewers, coalesce(sum(plays),0)::int AS plays,
      coalesce(sum(seconds),0)::bigint AS seconds, coalesce(sum(q25),0)::int AS q25, coalesce(sum(q50),0)::int AS q50, coalesce(sum(q75),0)::int AS q75,
      coalesce(sum(completes),0)::int AS completes, coalesce(sum(plays * greatest(dur, 0)),0)::bigint AS possible FROM base`);
  return { run, tot };
}

const totalsShape = (t) => ({
  views: num(t.views), viewers: num(t.viewers), plays: num(t.plays), minutes: Math.round(num(t.seconds) / 6) / 10, // minutes avec une décimale
  completes: num(t.completes), q25: num(t.q25), q50: num(t.q50), q75: num(t.q75),
  completionRate: pct(num(t.completes), num(t.plays)),
  avgWatchPct: pct(num(t.seconds), num(t.possible)),
});

export async function buildReport({ audience, days, organizerId = null, talkId = null, site = false }) {
  const until = todayStr();
  const since = await addDays(until, -(days - 1));
  const prevUntil = await addDays(since, -1);
  const prevSince = await addDays(prevUntil, -(days - 1));
  const scope = { organizerId, talkId };
  const cur = await talkPart(audience, since, until, scope);
  const prev = await talkPart(audience, prevSince, prevUntil, scope);
  const wide = site && !talkId; // chiffres du site entier (hors conférence précise)
  const out = { days, audience, since, until, scope: site ? 'site' : 'mine', talkId: talkId || null };
  out.totals = totalsShape(cur.tot);
  out.prev = totalsShape(prev.tot);

  // Série par jour (tous les jours de la période, même sans activité).
  const series = (await cur.run(`SELECT g.day::date::text AS day, coalesce(sum(b.views),0)::int AS views, coalesce(sum(b.plays),0)::int AS plays,
        round(coalesce(sum(b.seconds),0) / 60.0, 1)::float AS minutes
      FROM generate_series($2::date, $3::date, '1 day') AS g(day) LEFT JOIN base b ON b.day = g.day GROUP BY g.day ORDER BY g.day`));
  out.series = series;
  out.funnel = [['views', out.totals.views], ['plays', out.totals.plays], ['q25', out.totals.q25], ['q50', out.totals.q50], ['q75', out.totals.q75], ['completes', out.totals.completes]]
    .map(([key, n]) => ({ key, n }));

  out.top = (await cur.run(`SELECT talk_id AS id, title, sum(views)::int AS views, sum(plays)::int AS plays, round(sum(seconds) / 60.0, 1)::float AS minutes,
        sum(completes)::int AS completes, sum(seconds)::bigint AS seconds, max(dur) AS dur
      FROM base GROUP BY talk_id, title HAVING sum(views) + sum(plays) > 0 ORDER BY sum(plays) DESC, sum(views) DESC LIMIT 25`))
    .map((r) => ({ id: r.id, title: r.title, views: r.views, plays: r.plays, minutes: r.minutes, completes: r.completes,
      completionRate: pct(r.completes, r.plays), avgWatchPct: r.dur > 0 && r.plays > 0 ? pct(num(r.seconds), r.plays * r.dur) : null }));
  out.categories = await cur.run(`SELECT coalesce(c.name, '—') AS name, sum(b.plays)::int AS plays, sum(b.views)::int AS views, round(sum(b.seconds) / 60.0, 1)::float AS minutes
      FROM base b LEFT JOIN category_names c ON c.id = b.category_id GROUP BY c.name HAVING sum(b.views) + sum(b.plays) > 0 ORDER BY sum(b.plays) DESC, sum(b.views) DESC LIMIT 8`);
  out.speakers = await cur.run(`SELECT speaker AS name, sum(plays)::int AS plays, sum(views)::int AS views, round(sum(seconds) / 60.0, 1)::float AS minutes
      FROM base WHERE speaker <> '' GROUP BY speaker HAVING sum(views) + sum(plays) > 0 ORDER BY sum(plays) DESC, sum(views) DESC LIMIT 8`);

  if (audience === 'web') {
    // Provenance / appareil / langue : site entier (admin) ou ouvertures des conférences de l'organisateur.
    const dims = {};
    if (wide) {
      for (const dim of ['source', 'referrer', 'device', 'lang', 'country']) {
        dims[dim] = (await pool.query(
          `SELECT value, sum(views)::int AS views, sum(visitors)::int AS visitors FROM stat_dim_daily
            WHERE audience = 'web' AND dim = $1 AND day BETWEEN $2::date AND $3::date GROUP BY value ORDER BY sum(visitors) DESC, sum(views) DESC LIMIT 8`, [dim, since, until])).rows;
      }
      const tot = (r) => ({ visitors: num(r.visitors), pageviews: num(r.views) });
      out.site = {
        totals: tot((await pool.query(`SELECT sum(visitors) AS visitors, sum(views) AS views FROM stat_dim_daily WHERE audience = 'web' AND dim = 'all' AND day BETWEEN $1::date AND $2::date`, [since, until])).rows[0]),
        prev: tot((await pool.query(`SELECT sum(visitors) AS visitors, sum(views) AS views FROM stat_dim_daily WHERE audience = 'web' AND dim = 'all' AND day BETWEEN $1::date AND $2::date`, [prevSince, prevUntil])).rows[0]),
      };
      const sd = (await pool.query(`SELECT g.day::date::text AS day, coalesce(sum(d.visitors),0)::int AS visitors, coalesce(sum(d.views),0)::int AS pageviews
          FROM generate_series($1::date, $2::date, '1 day') AS g(day) LEFT JOIN stat_dim_daily d ON d.day = g.day AND d.audience = 'web' AND d.dim = 'all'
          GROUP BY g.day ORDER BY g.day`, [since, until])).rows;
      out.series = out.series.map((r, i) => ({ ...r, visitors: sd[i].visitors, pageviews: sd[i].pageviews }));
    } else {
      for (const dim of ['source', 'device', 'lang']) {
        dims[dim] = (await pool.query(
          `SELECT d.value, sum(d.views)::int AS views FROM stat_talk_dim_daily d JOIN talks t ON t.id = d.talk_id
            WHERE d.dim = $1 AND d.day BETWEEN $2::date AND $3::date AND ($4::uuid IS NULL OR t.organizer_id = $4) AND ($5::uuid IS NULL OR d.talk_id = $5)
            GROUP BY d.value ORDER BY sum(d.views) DESC LIMIT 8`, [dim, since, until, organizerId || null, talkId || null])).rows;
      }
    }
    out.dims = dims;
  } else {
    // Kids : quiz (par conférence) et, pour l'administrateur, usage de l'espace enfant. Aucun profil n'est identifiable.
    const QF = `(a.created_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR t.organizer_id = $3) AND ($4::uuid IS NULL OR a.talk_id = $4)`;
    const QP = [since, until, organizerId || null, talkId || null];
    const q = (await pool.query(`SELECT count(*)::int AS attempts, round(avg(percent))::int AS "avgPercent", round(avg(stars)::numeric, 1)::float AS "avgStars"
        FROM kid_quiz_attempts a JOIN talks t ON t.id = a.talk_id WHERE ${QF}`, QP)).rows[0];
    const qDay = (await pool.query(`SELECT (a.created_at AT TIME ZONE '${TZ}')::date::text AS day, count(*)::int AS n
        FROM kid_quiz_attempts a JOIN talks t ON t.id = a.talk_id WHERE ${QF} GROUP BY 1`, QP)).rows;
    const qd = new Map(qDay.map((r) => [r.day, r.n]));
    out.series = out.series.map((r) => ({ ...r, quiz: qd.get(r.day) || 0 }));
    const qTalk = (await pool.query(`SELECT a.talk_id AS id, count(*)::int AS attempts, round(avg(a.stars)::numeric, 1)::float AS stars, round(avg(a.percent))::int AS percent
        FROM kid_quiz_attempts a JOIN talks t ON t.id = a.talk_id WHERE ${QF} GROUP BY a.talk_id`, QP)).rows;
    const qm = new Map(qTalk.map((r) => [r.id, r]));
    out.top = out.top.map((r) => ({ ...r, quizAttempts: qm.get(r.id)?.attempts || 0, quizStars: qm.get(r.id)?.stars ?? null, quizPercent: qm.get(r.id)?.percent ?? null }));
    out.kids = { quiz: q };
    if (wide) { // chiffres globaux de l'espace enfant : administrateur seulement
      const use = (await pool.query(`SELECT g.day::date::text AS day, count(u.profile_id) FILTER (WHERE u.seconds > 0)::int AS active, round(coalesce(sum(u.seconds), 0) / 60.0)::int AS minutes
          FROM generate_series($1::date, $2::date, '1 day') AS g(day) LEFT JOIN kid_usage u ON u.day = g.day GROUP BY g.day ORDER BY g.day`, [since, until])).rows;
      out.series = out.series.map((r, i) => ({ ...r, activeKids: use[i].active, kidMinutes: use[i].minutes }));
      const sum = (await pool.query(`SELECT count(DISTINCT profile_id)::int AS "activeKids", round(coalesce(sum(seconds), 0) / 60.0)::int AS minutes
          FROM kid_usage WHERE day BETWEEN $1::date AND $2::date AND seconds > 0`, [since, until])).rows[0];
      const bands = (await pool.query(`SELECT band, count(*)::int AS n FROM kid_profiles GROUP BY band ORDER BY band`)).rows;
      const fam = (await pool.query(`SELECT count(DISTINCT user_id)::int AS n, count(*)::int AS profiles FROM kid_profiles`)).rows[0];
      out.kids.usage = { ...sum, families: fam.n, profiles: fam.profiles, bands };
    }
  }
  if (organizerId) {
    out.talks = (await pool.query(`SELECT id, title FROM talks WHERE organizer_id = $1 ORDER BY created_at DESC LIMIT 300`, [organizerId])).rows;
  }
  return out;
}

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(r) {
  const lines = [];
  const row = (...c) => lines.push(c.map(csvCell).join(';'));
  row('Statistiques', r.audience, `${r.since} → ${r.until}`);
  lines.push('');
  const keys = r.series.length ? Object.keys(r.series[0]) : [];
  row(...keys);
  for (const s of r.series) row(...keys.map((k) => s[k]));
  lines.push('');
  row('Conférence', 'Ouvertures', 'Lectures', 'Minutes regardées', 'Terminées', 'Taux de fin %', '% moyen regardé', ...(r.audience === 'kids' ? ['Quiz joués', 'Étoiles moyennes'] : []));
  for (const t of r.top) row(t.title, t.views, t.plays, t.minutes, t.completes, t.completionRate, t.avgWatchPct, ...(r.audience === 'kids' ? [t.quizAttempts, t.quizStars] : []));
  // BOM : Excel ouvre ainsi correctement les accents.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export default async function statsRoutes(app) {
  const send = async (reply, q, opts) => {
    const r = await buildReport({ ...opts, audience: q.audience, days: q.days, talkId: q.talk || null });
    if (q.format === 'csv') {
      return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="statistiques-${q.audience}-${r.since}_${r.until}.csv"`).header('cache-control', 'private, no-store').send(toCsv(r));
    }
    return reply.header('cache-control', 'private, no-store').send(r);
  };
  app.get('/admin/stats', { preHandler: app.requireRole('admin') }, async (req, reply) => send(reply, query.parse(req.query), { site: true }));
  app.get('/studio/stats', { preHandler: app.requireRole('organizer', 'admin') }, async (req, reply) => {
    const q = query.parse(req.query);
    if (q.talk) { // un organisateur ne voit que ses conférences
      const t = (await pool.query('SELECT organizer_id FROM talks WHERE id = $1', [q.talk])).rows[0];
      if (!t || t.organizer_id !== req.user.sub) return reply.code(404).send({ error: 'Conférence introuvable' });
    }
    return send(reply, q, { organizerId: req.user.sub });
  });
}
