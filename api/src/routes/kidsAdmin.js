// Administration → « Kids & profils familiaux » : vue d'ensemble de l'espace enfant, UNIQUEMENT agrégée.
//   GET /admin/kids   administrateur seulement.
// Vie privée : aucun prénom, avatar ni identité d'enfant ou de parent n'est renvoyé — seulement des nombres, et les titres publics des vidéos.
// Sources réelles : kid_profiles (tranche d'âge, limite, catalogue), kid_usage (temps passé, calculé par le serveur), kid_story_usage (histoires du soir),
// kid_actions (petites actions), kid_badges, kid_quiz_attempts, users (code parental, rapport e-mail), talks.kids_bands (tranches d'âge autorisées d'une vidéo) + catégories Kids.
import { pool } from '../db.js';
import { visibleSql } from '../visibility.js';
import { BANDS } from '../taxonomy.js';

export default async function kidsAdminRoutes(app) {
  app.get('/admin/kids', { preHandler: app.requireRole('admin') }, async () => {
    const one = async (sql, args = []) => (await pool.query(sql, args)).rows[0];
    const fam = await one(
      `SELECT count(DISTINCT p.user_id)::int AS families, count(*)::int AS profiles,
              count(*) FILTER (WHERE p.created_at > now() - interval '30 days')::int AS new30,
              count(*) FILTER (WHERE p.daily_limit_min IS NOT NULL)::int AS limited,
              count(*) FILTER (WHERE p.catalog_mode = 'selected')::int AS selected
         FROM kid_profiles p`);
    const bandRows = (await pool.query('SELECT band, count(*)::int AS n FROM kid_profiles GROUP BY band')).rows;
    const byBand = BANDS.map((b) => ({ band: b, profiles: bandRows.find((r) => r.band === b)?.n || 0 }));
    const parents = await one(
      `SELECT count(*) FILTER (WHERE u.kids_pin_hash IS NOT NULL)::int AS with_pin, count(*) FILTER (WHERE u.kids_report_email)::int AS with_report
         FROM users u WHERE EXISTS (SELECT 1 FROM kid_profiles p WHERE p.user_id = u.id)`);
    const use = await one(
      `SELECT count(DISTINCT profile_id) FILTER (WHERE day >= current_date - 6)::int AS active7,
              count(DISTINCT profile_id) FILTER (WHERE day >= current_date - 29)::int AS active30,
              coalesce(sum(seconds) FILTER (WHERE day >= current_date - 6), 0)::bigint AS sec7
         FROM kid_usage`);
    const stories = await one("SELECT coalesce(sum(seconds) FILTER (WHERE day >= current_date - 6), 0)::bigint AS sec7 FROM kid_story_usage").catch(() => ({ sec7: 0 })); // module Audyn absent : 0
    const daily = (await pool.query(
      `SELECT to_char(g.d, 'YYYY-MM-DD') AS day, count(DISTINCT u.profile_id)::int AS active, coalesce(sum(u.seconds), 0)::int AS seconds
         FROM generate_series(current_date - 13, current_date, interval '1 day') AS g(d) LEFT JOIN kid_usage u ON u.day = g.d::date
        GROUP BY g.d ORDER BY g.d`)).rows;
    const act = await one(
      `SELECT count(*) FILTER (WHERE status = 'claimed')::int AS waiting,
              count(*) FILTER (WHERE status = 'validated' AND validated_at > now() - interval '30 days')::int AS validated30,
              count(*) FILTER (WHERE status = 'todo')::int AS todo
         FROM kid_actions`);
    const learn = await one(
      `SELECT (SELECT count(*) FROM kid_quiz_attempts WHERE created_at > now() - interval '30 days')::int AS quizzes30,
              (SELECT count(*) FROM kid_badges WHERE earned_at > now() - interval '30 days')::int AS badges30`).catch(() => ({ quizzes30: 0, badges30: 0 }));
    const cat = await one(
      `SELECT count(*)::int AS talks,
              count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM talk_categories tc JOIN categories c ON c.id = tc.category_id WHERE tc.talk_id = t.id AND c.catalogue_type = 'kids')
                                 AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = t.category_id AND c.catalogue_type = 'kids'))::int AS unclassified
         FROM talks t WHERE cardinality(t.kids_bands) > 0 AND ${visibleSql('t')}`);
    const talkBands = (await pool.query(`SELECT b AS band, count(*)::int AS n FROM talks t, unnest(t.kids_bands) AS b WHERE ${visibleSql('t')} GROUP BY b`)).rows;
    const universes = await one("SELECT count(*)::int AS n FROM categories WHERE catalogue_type = 'kids' AND parent_id IS NULL");
    const top = (await pool.query(
      `SELECT t.id, t.title, count(*)::int AS viewers FROM kid_progress k JOIN talks t ON t.id = k.talk_id
        WHERE k.updated_at > now() - interval '30 days' AND ${visibleSql('t')} GROUP BY t.id, t.title ORDER BY viewers DESC, t.title LIMIT 5`)).rows;
    const mins = (s) => Math.round(Number(s) / 60);
    return {
      families: fam.families, profiles: fam.profiles, newProfiles30: fam.new30, byBand,
      limits: { withDailyLimit: fam.limited, selectedCatalog: fam.selected, parentsWithPin: parents.with_pin, parentsWithReport: parents.with_report },
      usage: { active7: use.active7, active30: use.active30, minutes7: mins(use.sec7), storyMinutes7: mins(stories.sec7), avgMinutesPerActive7: use.active7 ? Math.round(mins(use.sec7) / use.active7) : 0 },
      daily: daily.map((d) => ({ day: d.day, active: d.active, minutes: mins(d.seconds) })),
      actions: { waiting: act.waiting, validated30: act.validated30, todo: act.todo },
      learning: { quizzes30: learn.quizzes30, badges30: learn.badges30 },
      catalogue: { talks: cat.talks, unclassified: cat.unclassified, universes: universes.n, byBand: BANDS.map((b) => ({ band: b, talks: talkBands.find((r) => r.band === b)?.n || 0 })) },
      top: top.map((r) => ({ id: r.id, title: r.title, viewers: r.viewers })),
    };
  });
}
