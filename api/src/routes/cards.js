// Aperçu vidéo au survol d'une vignette (étape 12.2). Public : ne donne que le début de la vidéo.
import { z } from 'zod';
import { pool } from '../db.js';
import { visibleSql } from '../visibility.js';
import { makePreviewToken } from '../playback.js';
import { getSetting, isOn } from '../settings.js';

export default async function cardsRoutes(app) {
  // Réponse : { kind: 'hls', src } | { kind: 'youtube' | 'vimeo', ref } | { kind: 'none' }.
  // - Vidéo envoyée : jeton d'aperçu (le serveur coupe le flux à la durée de l'aperçu gratuit, même pour une conférence premium).
  // - YouTube / Vimeo : uniquement si la conférence est gratuite.
  // - archive.org : pas d'aperçu (miniature seulement).
  app.get('/talks/:id/hover', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const none = { kind: 'none' };
    if (!isOn(await getSetting('card_preview'))) return none;
    const { rows } = await pool.query(
      `SELECT source, video_ref, access, video_status FROM talks t WHERE t.id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')}`, [id]);
    const t = rows[0];
    if (!t) return reply.code(404).send({ error: 'Conférence introuvable' });
    reply.header('cache-control', 'private, max-age=60');
    if (t.source === 'upload') return { kind: 'hls', src: `/hls/${id}/master.m3u8?t=${encodeURIComponent(makePreviewToken(id, 30 * 60))}` };
    if (t.access === 'free' && (t.source === 'youtube' || t.source === 'vimeo')) return { kind: t.source, ref: t.video_ref };
    return none;
  });
}
