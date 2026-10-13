// Référencement (Google, réseaux sociaux) : données publiques et minimales servies au site pour les balises <head>,
// les données structurées (JSON-LD), le sitemap et les vignettes à adresse stable.
// Règle : seules les conférences / séries visibles du public sont exposées, et jamais d'élément premium
// (transcription, lien de lecture protégé) : titre, description, intervenant, durée, miniature seulement.
import { z } from 'zod';
import { pool } from '../db.js';
import { presignGet } from '../storage.js';
import { visibleSql } from '../visibility.js';
import { getSetting } from '../settings.js';
import { episodeLabels, listSeries } from './series.js';
import { ensureSlug, ensureAllSlugs, idFromRef } from '../slugs.js';

const idParam = z.object({ id: z.string().uuid() });
const refParam = z.object({ id: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/i) }); // UUID ou slug
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => { const x = clean(s); return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };

async function siteInfo() {
  return { baseUrl: String(await getSetting('web_url')).replace(/\/$/, ''), appName: await getSetting('app_name'), description: clean(await getSetting('seo_description')) };
}

// Adresse stable de la miniature (les liens de stockage expirent) : le site la sert via /api/seo/poster/….
const posterPath = (kind, id) => `/api/seo/poster/${kind}/${id}`;

export default async function seoRoutes(app) {
  app.get('/seo/site', async () => siteInfo());

  app.get('/seo/talks/:id', async (req, reply) => {
    const ref = refParam.parse(req.params).id;
    const id = await idFromRef('talks', ref);
    if (!id) return reply.code(404).send({ error: 'Conférence introuvable' });
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.description, t.speaker, t.language, t.access, t.source, t.video_ref, t.duration_seconds AS "durationSeconds",
              c.name AS category, COALESCE(t.publish_at, t.created_at) AS "publishedAt", (t.poster_key IS NOT NULL OR t.external_thumb IS NOT NULL) AS "hasPoster"
         FROM talks t LEFT JOIN category_names c ON c.id = t.category_id
        WHERE t.id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')}`, [id]);
    const t = rows[0];
    if (!t) return reply.code(404).send({ error: 'Conférence introuvable' });
    const series = (await episodeLabels([id])).get(id) || null;
    // Chapitres et extrait de la transcription : seulement pour les conférences gratuites (jamais de contenu premium dans le HTML public).
    let chapters = []; let excerpt = ''; let summary = '';
    if (t.access === 'free') {
      const ins = (await pool.query(
        `SELECT summary, chapters FROM talk_insights WHERE talk_id = $1 AND status = 'ready'
          ORDER BY (lang = $2) DESC, (lang = 'fr') DESC, lang LIMIT 1`, [id, t.language || 'fr'])).rows[0];
      if (ins) {
        summary = clip(ins.summary, 1200);
        chapters = (Array.isArray(ins.chapters) ? ins.chapters : []).filter((c) => Number.isFinite(c?.ms) && c?.title).slice(0, 40).map((c) => ({ ms: c.ms, title: clip(c.title, 140) }));
      }
      excerpt = clip((await pool.query('SELECT left(coalesce(transcript_text, \'\'), 1500) AS x FROM talks WHERE id = $1', [id])).rows[0]?.x, 1200);
    }
    reply.header('cache-control', 'public, max-age=60');
    return {
      id: t.id, slug: await ensureSlug('talks', id), summary, chapters, excerpt, title: t.title, description: clip(t.description, 5000), speaker: t.speaker, language: t.language, access: t.access,
      category: t.category, durationSeconds: t.durationSeconds, publishedAt: t.publishedAt,
      embed: t.source === 'youtube' ? { kind: 'youtube', ref: t.video_ref } : t.source === 'vimeo' ? { kind: 'vimeo', ref: t.video_ref } : null,
      posterPath: t.hasPoster ? posterPath('talks', id) : null, series,
      site: await siteInfo(),
    };
  });

  app.get('/seo/series/:id', async (req, reply) => {
    const ref = refParam.parse(req.params).id;
    const id = await idFromRef('series', ref);
    if (!id) return reply.code(404).send({ error: 'Série introuvable' });
    const s = (await pool.query(
      `SELECT s.id, s.title, s.description, s.speaker, s.has_seasons AS "hasSeasons", s.updated_at AS "updatedAt", s.poster_key, c.name AS category
         FROM series s LEFT JOIN category_names c ON c.id = s.category_id WHERE s.id = $1 AND s.published`, [id])).rows[0];
    if (!s) return reply.code(404).send({ error: 'Série introuvable' });
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.duration_seconds AS "durationSeconds", (t.poster_key IS NOT NULL OR t.external_thumb IS NOT NULL) AS "hasPoster"
         FROM series_episodes e JOIN talks t ON t.id = e.talk_id AND t.video_status = 'ready' AND ${visibleSql('t')}
        WHERE e.series_id = $1 ORDER BY e.position`, [id]);
    if (!rows.length) return reply.code(404).send({ error: 'Série introuvable' });
    const labels = await episodeLabels(rows.map((r) => r.id));
    reply.header('cache-control', 'public, max-age=60');
    return {
      id: s.id, slug: await ensureSlug('series', id), title: s.title, description: clip(s.description, 5000), speaker: s.speaker, category: s.category, updatedAt: s.updatedAt,
      posterPath: s.poster_key || rows.some((r) => r.hasPoster) ? posterPath('series', id) : null,
      episodes: await Promise.all(rows.map(async (r) => ({ id: r.id, slug: await ensureSlug('talks', r.id), title: r.title, durationSeconds: r.durationSeconds, seasonNumber: labels.get(r.id)?.seasonNumber ?? null, number: labels.get(r.id)?.number ?? null }))),
      site: await siteInfo(),
    };
  });

  // Vignette à adresse stable : redirige vers un lien de stockage frais (ou la miniature de la plateforme d'origine).
  app.get('/seo/poster/talks/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const t = (await pool.query(
      `SELECT t.poster_key, t.external_thumb FROM talks t WHERE t.id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')}`, [id])).rows[0];
    const url = t && (t.poster_key ? await presignGet(t.poster_key) : t.external_thumb);
    if (!url) return reply.code(404).send({ error: 'Pas de miniature' });
    reply.header('cache-control', 'public, max-age=300');
    return reply.redirect(url, 302);
  });

  app.get('/seo/poster/series/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const s = (await pool.query('SELECT poster_key FROM series WHERE id = $1 AND published', [id])).rows[0];
    if (!s) return reply.code(404).send({ error: 'Série introuvable' });
    let url = s.poster_key ? await presignGet(s.poster_key) : null;
    if (!url) {
      const t = (await pool.query(
        `SELECT t.poster_key, t.external_thumb FROM series_episodes e JOIN talks t ON t.id = e.talk_id AND t.video_status = 'ready' AND ${visibleSql('t')}
          WHERE e.series_id = $1 AND (t.poster_key IS NOT NULL OR t.external_thumb IS NOT NULL) ORDER BY e.position LIMIT 1`, [id])).rows[0];
      url = t && (t.poster_key ? await presignGet(t.poster_key) : t.external_thumb);
    }
    if (!url) return reply.code(404).send({ error: 'Pas de miniature' });
    reply.header('cache-control', 'public, max-age=300');
    return reply.redirect(url, 302);
  });


  // Ouvrages : fiche publique (jamais le fichier PDF), couverture à adresse stable.
  const HAS_EDITION = `(EXISTS (SELECT 1 FROM book_files f WHERE f.book_id = b.id AND f.rights_confirmed) OR EXISTS (SELECT 1 FROM book_links l WHERE l.book_id = b.id))`;
  app.get('/seo/books/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = (await pool.query(`SELECT b.id, b.title, b.author, b.description, b.updated_at AS "updatedAt", b.cover_key FROM books b WHERE b.id = $1 AND b.published AND ${HAS_EDITION}`, [id])).rows[0];
    if (!b) return reply.code(404).send({ error: 'Ouvrage introuvable' });
    const langs = (await pool.query(
      `SELECT DISTINCT lang FROM (SELECT lang FROM book_files WHERE book_id = $1 AND rights_confirmed UNION SELECT lang FROM book_links WHERE book_id = $1) x ORDER BY lang`, [id])).rows.map((r) => r.lang);
    reply.header('cache-control', 'public, max-age=60');
    return { id: b.id, title: b.title, author: b.author, description: clip(b.description, 5000), updatedAt: b.updatedAt, langs, posterPath: b.cover_key ? `/api/seo/poster/books/${id}` : null, site: await siteInfo() };
  });
  app.get('/seo/poster/books/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = (await pool.query('SELECT cover_key FROM books WHERE id = $1 AND published', [id])).rows[0];
    if (!b?.cover_key) return reply.code(404).send({ error: 'Pas de couverture' });
    reply.header('cache-control', 'public, max-age=300');
    return reply.redirect(await presignGet(b.cover_key), 302);
  });

  // Plan du site : conférences et séries visibles (jusqu'à 5 000 de chaque).
  app.get('/seo/sitemap', async (req, reply) => {
    await ensureAllSlugs('talks'); await ensureAllSlugs('series');
    const talks = (await pool.query(
      `SELECT t.id, t.slug, COALESCE(t.publish_at, t.created_at) AS "lastmod" FROM talks t
        WHERE t.video_status = 'ready' AND ${visibleSql('t')} ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT 5000`)).rows;
    const series = (await listSeries({ limit: 5000 })).map((s) => s.id);
    const lastmods = (await pool.query('SELECT id, slug, updated_at FROM series WHERE id = ANY($1)', [series])).rows;
    const when = new Map(lastmods.map((r) => [r.id, r.updated_at]));
    const slugOf = new Map(lastmods.map((r) => [r.id, r.slug]));
    reply.header('cache-control', 'public, max-age=300');
    const books = (await pool.query(`SELECT b.id, b.updated_at AS lastmod FROM books b WHERE b.published AND ${HAS_EDITION} ORDER BY b.updated_at DESC LIMIT 2000`)).rows;
    return { ...(await siteInfo()), talks, series: series.map((id) => ({ id, slug: slugOf.get(id), lastmod: when.get(id) })), books };
  });
}
