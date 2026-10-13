// Accueil vitrine (étape 12.1) : bannière du haut + rangées (nouveautés, une par catégorie).
// GET /home est public ; l'image de la bannière personnalisée se règle côté admin.
import { z } from 'zod';
import { pool } from '../db.js';
import { presignGet, putObject, deleteObject } from '../storage.js';
import { visibleSql } from '../visibility.js';
import { getSetting, getNumber, isOn, saveSettings } from '../settings.js';
import { listSeries } from './series.js';

const HERO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const CARD = `t.id, t.title, t.speaker, t.language, t.access, t.source, t.video_ref, t.category_id AS "categoryId", c.name AS category, t.level,
  t.duration_seconds AS "durationSeconds", t.poster_key, t.external_thumb, t.description`;
const FROM = 'FROM talks t LEFT JOIN categories c ON c.id = t.category_id';
const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };

// Même mise en forme que les autres listes : lien de miniature temporaire, pas de clé interne.
async function card(r, { withDescription = false } = {}) { // summary : extrait pour la vignette agrandie
  const out = { ...r };
  out.posterUrl = r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null);
  out.summary = clip(r.description, withDescription ? 240 : 170);
  for (const k of ['poster_key', 'external_thumb', 'description']) delete out[k];
  if (out.source === 'upload') delete out.video_ref;
  return out;
}

// Adresse de bouton acceptée : chemin du site ou lien https.
const safeLink = (u) => (/^\/(?!\/)/.test(u) || /^https:\/\//i.test(u) ? u : '');

export default async function homeRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  app.get('/home', async (req) => {
    const viewer = await app.optionalUser(req); // connecté : ses thèmes préférés passent en premier
    const mode = await getSetting('home_hero_mode');
    const size = await getNumber('home_row_size');
    const vis = visibleSql('t');

    let hero = { mode: 'text' };
    if (mode === 'featured') {
      const { rows } = await pool.query(`SELECT ${CARD} ${FROM} WHERE t.featured AND t.video_status = 'ready' AND ${vis} ORDER BY t.featured_at DESC LIMIT 5`);
      if (rows.length) hero = { mode: 'featured', items: await Promise.all(rows.map((r) => card(r, { withDescription: true }))) };
    } else if (mode === 'custom') {
      const key = await getSetting('home_hero_image_key');
      hero = {
        mode: 'custom',
        title: await getSetting('home_hero_title'), subtitle: await getSetting('home_hero_subtitle'),
        ctaLabel: await getSetting('home_hero_cta_label'), ctaUrl: safeLink(await getSetting('home_hero_cta_url')),
        videoUrl: /^https:\/\//i.test(await getSetting('home_hero_video_url')) ? await getSetting('home_hero_video_url') : '',
        imageUrl: key ? await presignGet(key) : null,
      };
    }

    const rows = [];
    if (isOn(await getSetting('home_row_new'))) {
      const r = await pool.query(`SELECT ${CARD} ${FROM} WHERE t.video_status = 'ready' AND ${vis} ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT $1`, [size]);
      if (r.rows.length) rows.push({ key: 'new', title: null, talks: await Promise.all(r.rows.map((x) => card(x))) });
    }
    if (isOn(await getSetting('home_row_series'))) {
      const list = await listSeries({ limit: size });
      if (list.length) rows.push({ key: 'series', title: null, series: list });
    }
    // « Pour commencer » : les conférences de niveau débutant, pour un visiteur qui découvre le sujet.
    if (isOn(await getSetting('home_row_beginner'))) {
      const r = await pool.query(`SELECT ${CARD} ${FROM} WHERE t.level = 'beginner' AND t.video_status = 'ready' AND ${vis} ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT $1`, [size]);
      if (r.rows.length) rows.push({ key: 'beginner', title: null, talks: await Promise.all(r.rows.map((x) => card(x))) });
    }
    if (isOn(await getSetting('home_rows_categories'))) {
      // Les catégories les plus fournies d'abord ; les conférences sans catégorie n'ont pas de rangée (elles sont dans « Nouveautés »).
      const { rows: cats } = await pool.query(
        `SELECT c.id, c.name, count(*)::int AS n FROM categories c JOIN talks t ON t.category_id = c.id
          WHERE t.video_status = 'ready' AND ${vis} GROUP BY c.id ORDER BY n DESC, c.name LIMIT 12`);
      for (const c of cats) {
        const r = await pool.query(`SELECT ${CARD} ${FROM} WHERE t.category_id = $1 AND t.video_status = 'ready' AND ${vis} ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT $2`, [c.id, size]);
        rows.push({ key: `cat:${c.id}`, title: c.name, categoryId: c.id, total: c.n, talks: await Promise.all(r.rows.map((x) => card(x))) });
      }
    }
    // Thèmes préférés du visiteur : leurs rangées viennent d'abord (après « Nouveautés »), marquées forYou.
    if (viewer) {
      const fav = (await pool.query('SELECT favorite_categories AS c FROM users WHERE id = $1', [viewer.sub])).rows[0]?.c || [];
      if (fav.length) {
        for (const r of rows) r.forYou = r.categoryId != null && fav.includes(r.categoryId);
        const top = (r) => ['new', 'series', 'beginner'].includes(r.key);
        const head = rows.filter(top); const mine = rows.filter((r) => !top(r) && r.forYou); const rest = rows.filter((r) => !top(r) && !r.forYou);
        rows.splice(0, rows.length, ...head, ...mine, ...rest);
      }
    }
    return { hero, rows };
  });

  // « Dans la même veine » (fiche conférence) : même intervenant d'abord, puis même catégorie, puis les plus récentes pour compléter.
  app.get('/talks/:id/similar', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const vis = visibleSql('t');
    const cur = (await pool.query('SELECT speaker, category_id FROM talks WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Conférence introuvable' });
    const size = Math.min(await getNumber('home_row_size'), 12);
    const { rows } = await pool.query(
      `SELECT ${CARD}, (CASE WHEN $2 <> '' AND lower(t.speaker) = lower($2) THEN 2 ELSE 0 END + CASE WHEN $3::int IS NOT NULL AND t.category_id = $3 THEN 1 ELSE 0 END) AS score
         ${FROM} WHERE t.id <> $1 AND t.video_status = 'ready' AND ${vis}
        ORDER BY score DESC, COALESCE(t.publish_at, t.created_at) DESC LIMIT $4`, [id, cur.speaker || '', cur.category_id, size]);
    return Promise.all(rows.map((r) => { const { score, ...x } = r; return card(x); }));
  });

  // Image de la bannière personnalisée (JPEG / PNG / WebP en data-URL, 2,5 Mo max).
  app.post('/admin/home/hero-image', { ...adminOnly, bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const { image } = z.object({ image: z.string().max(3_500_000) }).parse(req.body ?? {});
    const m = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return reply.code(400).send({ error: 'Image JPEG, PNG ou WebP attendue' });
    const buf = Buffer.from(m[2], 'base64');
    const magic = (m[1] === 'image/jpeg' && buf[0] === 0xff && buf[1] === 0xd8)
      || (m[1] === 'image/png' && buf.subarray(1, 4).toString() === 'PNG')
      || (m[1] === 'image/webp' && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP');
    if (!magic || buf.length > 2.5 * 1024 * 1024) return reply.code(400).send({ error: 'Image invalide ou trop lourde (2,5 Mo maximum)' });
    const old = await getSetting('home_hero_image_key');
    const key = `site/hero-${Date.now()}.${HERO_TYPES[m[1]]}`;
    await putObject(key, buf, m[1]);
    await saveSettings({ home_hero_image_key: key }, req.user.sub);
    if (old?.startsWith('site/')) await deleteObject(old).catch(() => {});
    return reply.code(201).send({ imageUrl: await presignGet(key) });
  });

  app.get('/admin/home/hero-image', adminOnly, async () => {
    const key = await getSetting('home_hero_image_key');
    return { imageUrl: key ? await presignGet(key) : null };
  });

  app.delete('/admin/home/hero-image', adminOnly, async (req, reply) => {
    const old = await getSetting('home_hero_image_key');
    await saveSettings({ home_hero_image_key: null }, req.user.sub);
    if (old?.startsWith('site/')) await deleteObject(old).catch(() => {});
    return reply.code(204).send();
  });
}
