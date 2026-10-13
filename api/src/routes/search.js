// Recherche dans le catalogue : Meilisearch si configuré (fautes de frappe tolérées, extraits, passages horodatés),
// sinon recherche SQL simple. Les extraits de transcription d'une conférence premium ne sont montrés qu'aux
// personnes qui y ont accès (abonné, propriétaire, admin).
import { z } from 'zod';
import { visibleSql } from '../visibility.js';
import { pool } from '../db.js';
import { presignGet } from '../storage.js';
import { hasActiveSubscription } from '../access.js';
import { INDEX, meili, meiliConf, queryWords } from '../search.js';
import { listSeries, episodeLabels } from './series.js';

const schema = z.object({
  q: z.string().trim().min(1).max(100),
  category: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
});

const CARD = `t.id, t.title, t.speaker, t.language, t.access, t.source, t.video_ref, t.organizer_id, c.name AS category,
  t.duration_seconds AS "durationSeconds", t.poster_key, t.external_thumb, t.description`;
const PRE = '⟦';
const POST = '⟧';

// Extrait le plus parlant : d'abord la transcription, puis les traductions, puis la description.
function pickSnippet(f, canSeeText) {
  const order = canSeeText ? ['transcript', 'transcriptOther', 'description'] : ['description'];
  for (const k of order) if (f?.[k] && f[k].includes(PRE)) return { field: k, text: f[k] };
  return null;
}

export default async function searchRoutes(app) {
  app.get('/search', async (req) => {
    const p = schema.parse(req.query);
    const viewer = await app.optionalUser(req);
    const subscriber = viewer ? await hasActiveSubscription(viewer.sub) : false;
    const canSee = (row) => row.access === 'free' || subscriber || (viewer && (viewer.role === 'admin' || viewer.sub === row.organizer_id));

    let engine = 'sql';
    let ids = null;
    let total = 0;
    const formatted = new Map();
    const c = await meiliConf();
    if (c) {
      try {
        const r = await meili(c, 'POST', `/indexes/${INDEX}/search`, {
          q: p.q, limit: p.limit, offset: p.offset,
          filter: p.category ? `categoryId = ${p.category}` : undefined,
          attributesToRetrieve: ['id'],
          attributesToCrop: ['transcript', 'transcriptOther', 'description'], cropLength: 24, cropMarker: '…',
          attributesToHighlight: ['transcript', 'transcriptOther', 'description'], highlightPreTag: PRE, highlightPostTag: POST,
        }, 5000);
        ids = r.hits.map((h) => h.id);
        total = r.estimatedTotalHits ?? ids.length;
        for (const h of r.hits) formatted.set(h.id, h._formatted);
        engine = 'meilisearch';
      } catch (err) {
        req.log.warn(`Recherche Meilisearch indisponible, repli SQL : ${err.message}`);
      }
    }

    let rows;
    if (ids) {
      const res = await pool.query(`SELECT ${CARD} FROM talks t LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.id = ANY($1) AND t.video_status = 'ready' AND ${visibleSql('t')}`, [ids]);
      const byId = new Map(res.rows.map((r) => [r.id, r]));
      rows = ids.map((id) => byId.get(id)).filter(Boolean);
    } else {
      const where = `t.video_status = 'ready' AND ${visibleSql('t')}
        AND (t.title ILIKE '%' || $1 || '%' OR t.speaker ILIKE '%' || $1 || '%' OR t.description ILIKE '%' || $1 || '%'
             OR t.transcript_text ILIKE '%' || $1 || '%')
        AND ($2::int IS NULL OR t.category_id = $2)`;
      const q = p.q.replace(/[%_\\]/g, '\\$&');
      total = (await pool.query(`SELECT count(*)::int AS n FROM talks t WHERE ${where}`, [q, p.category ?? null])).rows[0].n;
      rows = (await pool.query(`SELECT ${CARD} FROM talks t LEFT JOIN categories c ON c.id = t.category_id WHERE ${where}
        ORDER BY t.created_at DESC LIMIT $3 OFFSET $4`, [q, p.category ?? null, p.limit, p.offset])).rows;
    }

    // Passages horodatés (vidéos envoyées accessibles) : jusqu'à 3 par conférence, dans l'ordre de la vidéo.
    // Mots de la requête + mots réellement trouvés par Meilisearch (corrige les fautes de frappe : « relativitée » → « relativité »).
    const found = [];
    for (const f of formatted.values()) {
      for (const k of ['transcript', 'transcriptOther']) {
        for (const m of (f?.[k] || '').matchAll(/⟦([^⟧]{3,40})⟧/g)) found.push(m[1]);
      }
    }
    const words = [...new Set([...queryWords(p.q), ...queryWords(found.join(' '))])].slice(0, 10);
    const momentIds = rows.filter((r) => canSee(r)).map((r) => r.id); // toutes sources : YouTube / Vimeo transcrits aussi
    const moments = new Map();
    if (words.length && momentIds.length) {
      const pats = words.map((w) => `%${w.replace(/[%_\\]/g, '\\$&')}%`);
      const { rows: segs } = await pool.query(
        `SELECT talk_id, start_ms, text FROM (
           SELECT s.talk_id, s.start_ms, s.text,
                  row_number() OVER (PARTITION BY s.talk_id ORDER BY (s.lang = t.transcript_language) DESC, s.start_ms) AS rn
           FROM transcript_segments s JOIN talks t ON t.id = s.talk_id
           WHERE s.talk_id = ANY($1) AND s.text ILIKE ANY($2)) x
         WHERE rn <= 3 ORDER BY talk_id, start_ms`, [momentIds, pats]);
      for (const s of segs) {
        if (!moments.has(s.talk_id)) moments.set(s.talk_id, []);
        moments.get(s.talk_id).push({ ms: s.start_ms, text: s.text.length > 160 ? s.text.slice(0, 157) + '…' : s.text });
      }
    }

    const labels = await episodeLabels(rows.map((r) => r.id)); // place de chaque résultat dans une série
    const hits = [];
    for (const r of rows) {
      const see = canSee(r);
      const snip = pickSnippet(formatted.get(r.id), see);
      hits.push({
        id: r.id, title: r.title, speaker: r.speaker, language: r.language, access: r.access, source: r.source,
        video_ref: r.source === 'upload' ? undefined : r.video_ref, category: r.category, durationSeconds: r.durationSeconds,
        posterUrl: r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null),
        snippet: snip ? snip.text : null,
        snippetFrom: snip ? snip.field : null,
        moments: moments.get(r.id) || [],
        series: labels.get(r.id) || null,
      });
    }
    // Séries dont le titre, l'intervenant ou la présentation contiennent la recherche (première page seulement).
    const series = p.offset === 0 ? await listSeries({ limit: 6, q: p.q, category: p.category || null }) : [];
    return { engine, total, hits, series, markers: [PRE, POST] };
  });
}
