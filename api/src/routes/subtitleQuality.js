// Studio → Sous-titres → « Qualité » : lisibilité et complétude des sous-titres de mes contenus (voir subtitleQuality.js pour les règles).
//   GET /studio/subtitles/quality            contenus (les miens et ceux de mes chaînes) avec la note de chaque langue
//   GET /studio/subtitles/quality/:id?lang=  les phrases à corriger d'une langue (60 au plus, les plus problématiques d'abord)
// Réservé à l'organisateur et à l'administrateur ; chacun ne voit que ses contenus et ceux de ses chaînes. Lecture seule.
import { z } from 'zod';
import { pool } from '../db.js';
import { managedSpeakers } from '../channelAccess.js';
import { NORMS, FLAGGED_SQL, buildTalks, issuesOf } from '../subtitleQuality.js';

const idSchema = z.object({ id: z.guid() });
const langRe = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export default async function subtitleQualityRoutes(app) {
  const staff = { preHandler: app.requireRole('organizer', 'admin') };
  const mine = async (user) => (await pool.query(
    `SELECT id, title, speaker FROM talks WHERE organizer_id = $1 OR lower(trim(speaker)) = ANY($2::text[]) ORDER BY created_at DESC`,
    [user.sub, await managedSpeakers(user.sub)])).rows;

  app.get('/studio/subtitles/quality', staff, async (req) => {
    const talks = await mine(req.user);
    const ids = talks.map((t) => t.id);
    const { rows } = await pool.query(
      `${FLAGGED_SQL}
       SELECT talk_id, lang, bool_or(is_src) AS is_src, count(*)::int AS segments, sum(len)::bigint AS chars, sum(dur) FILTER (WHERE dur > 0)::bigint AS ms,
              count(*) FILTER (WHERE f_empty OR f_fast OR f_long OR f_slow OR f_overlap OR f_same OR f_doubt)::int AS flagged,
              count(*) FILTER (WHERE f_empty)::int AS f_empty, count(*) FILTER (WHERE f_fast)::int AS f_fast, count(*) FILTER (WHERE f_long)::int AS f_long,
              count(*) FILTER (WHERE f_slow)::int AS f_slow, count(*) FILTER (WHERE f_overlap)::int AS f_overlap, count(*) FILTER (WHERE f_same)::int AS f_same,
              count(*) FILTER (WHERE f_doubt)::int AS f_doubt, avg(confidence)::float AS conf_avg, count(confidence)::int AS conf_n
         FROM f GROUP BY talk_id, lang`, [ids, null]);
    const agg = rows.map((r) => ({ ...r, chars: Number(r.chars), ms: Number(r.ms) }));
    // Corrections de membres en attente : seulement si le module « corrections » est installé (table présente).
    let cor = [];
    if ((await pool.query("SELECT to_regclass('subtitle_corrections') AS t")).rows[0].t) {
      cor = (await pool.query("SELECT talk_id, count(*)::int AS n FROM subtitle_corrections WHERE status = 'pending' AND talk_id = ANY($1::uuid[]) GROUP BY talk_id", [ids])).rows;
    }
    const list = buildTalks(talks, agg, cor);
    const count = (lv) => list.filter((t) => t.level === lv).length;
    return {
      norms: NORMS,
      totals: { talks: talks.length, analysed: list.length, withoutText: talks.length - list.length, good: count('good'), check: count('check'), fix: count('fix') },
      talks: list,
    };
  });

  app.get('/studio/subtitles/quality/:id', staff, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { lang } = z.object({ lang: z.string().regex(langRe) }).parse(req.query);
    if (!(await mine(req.user)).some((t) => t.id === id)) return reply.code(404).send({ error: 'Contenu introuvable' });
    const { rows } = await pool.query(
      `${FLAGGED_SQL}
       SELECT idx, start_ms AS "startMs", end_ms AS "endMs", txt AS text, len, dur, f_empty, f_fast, f_long, f_slow, f_overlap, f_same, f_doubt, confidence
         FROM f WHERE f_empty OR f_fast OR f_long OR f_slow OR f_overlap OR f_same OR f_doubt
        ORDER BY (f_empty::int + f_fast::int + f_long::int + f_slow::int + f_overlap::int + f_same::int + f_doubt::int) DESC, (CASE WHEN dur > 0 THEN len * 1000.0 / dur ELSE 0 END) DESC, idx LIMIT 60`, [[id], lang]);
    return {
      lang, norms: NORMS,
      items: rows.map((r) => ({ idx: r.idx, startMs: r.startMs, endMs: r.endMs, text: r.text, chars: r.len, seconds: Math.round(r.dur / 100) / 10, confidence: r.confidence == null ? null : Math.round(r.confidence * 100), cps: r.dur > 0 ? Math.round((r.len * 1000 / r.dur) * 10) / 10 : null, issues: issuesOf(r) })),
    };
  });
}
