// Transcription et sous-titres : protégés par le même jeton de lecture que le flux HLS.
import { z } from 'zod';
import { pool } from '../db.js';
import { checkPlaybackToken, playbackLevel } from '../playback.js';
import { toVtt } from '../vtt.js';

const idSchema = z.object({ id: z.string().uuid() });
const langRe = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export default async function transcriptRoutes(app) {
  // Récupère les segments d'une langue (par défaut : langue de la transcription).
  async function load(id, lang) {
    const talk = await pool.query('SELECT transcript_language FROM talks WHERE id = $1', [id]);
    if (!talk.rows[0]) return null;
    const code = lang || talk.rows[0].transcript_language;
    if (!code) return { lang: null, segments: [], languages: [] };
    const [seg, langs] = await Promise.all([
      pool.query('SELECT start_ms, end_ms, text FROM transcript_segments WHERE talk_id = $1 AND lang = $2 ORDER BY idx', [id, code]),
      pool.query('SELECT DISTINCT lang FROM transcript_segments WHERE talk_id = $1 ORDER BY lang', [id]),
    ]);
    return { lang: code, segments: seg.rows, languages: langs.rows.map((r) => r.lang) };
  }

  app.get('/talks/:id/transcript', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { lang, t } = z.object({ lang: z.string().regex(langRe).optional(), t: z.string().optional() }).parse(req.query);
    if (!checkPlaybackToken(id, t)) return reply.code(403).send({ error: 'Accès refusé' });
    const data = await load(id, lang);
    if (!data) return reply.code(404).send({ error: 'Introuvable' });
    return {
      lang: data.lang,
      languages: data.languages,
      segments: data.segments.map((s) => ({ s: s.start_ms, e: s.end_ms, t: s.text })),
    };
  });

  app.get('/talks/:id/subs/:file', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const m = req.params.file.match(/^(.+)\.vtt$/);
    if (!m || !langRe.test(m[1])) return reply.code(404).send({ error: 'Introuvable' });
    if (!checkPlaybackToken(id, req.query.t)) return reply.code(403).send({ error: 'Accès refusé' });
    const data = await load(id, m[1]);
    if (!data || !data.segments.length) return reply.code(404).send({ error: 'Introuvable' });
    return reply.header('content-type', 'text/vtt; charset=utf-8').header('cache-control', 'private, max-age=300').send(toVtt(data.segments));
  });

  // Résumé, points clés et chapitres (même jeton de lecture que la transcription).
  app.get('/talks/:id/insights', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { lang, t } = z.object({ lang: z.string().regex(langRe).optional(), t: z.string().optional() }).parse(req.query);
    const level = playbackLevel(id, t);
    if (!level) return reply.code(403).send({ error: 'Accès refusé' });
    const { rows } = await pool.query(
      "SELECT lang, summary, key_points, chapters FROM talk_insights WHERE talk_id = $1 AND status = 'ready' ORDER BY lang", [id]
    );
    // Langues encore en préparation : le site attend celle du visiteur au lieu d'afficher définitivement une autre langue.
    const pending = (await pool.query(
      "SELECT lang FROM talk_insights WHERE talk_id = $1 AND status IN ('pending', 'processing') ORDER BY lang", [id]
    )).rows.map((r) => r.lang);
    if (!rows.length) return { lang: null, languages: [], pending, summary: '', keyPoints: [], chapters: [] };
    // Langue demandée ; sinon le français, puis l'anglais, puis la langue d'origine.
    const base = (lang || '').split('-')[0];
    const row = rows.find((r) => r.lang === lang) || rows.find((r) => r.lang === base)
      || rows.find((r) => r.lang === 'fr') || rows.find((r) => r.lang === 'en') || rows[0];
    return {
      lang: row.lang,
      pending,
      languages: rows.map((r) => r.lang),
      summary: row.summary,
      keyPoints: row.key_points,
      // Aperçu gratuit : résumé seulement (les chapitres pointent vers la partie réservée aux abonnés).
      chapters: level === 'full' ? row.chapters.map((c) => ({ s: c.ms, t: c.title })) : [],
      preview: level === 'preview',
    };
  });
}
