// Studio → Sous-titres → « Qualité » : mesures FORMELLES de lisibilité des sous-titres déjà enregistrés (transcript_segments).
// Deux familles de mesures : (1) FORMELLES — normes usuelles du sous-titrage et complétude (21 caractères par seconde, 2 lignes de
// 42 caractères, 8 secondes au plus par sous-titre) ; (2) CONFIANCE de la reconnaissance vocale — Whisper note chaque phrase qu'il
// transcrit (transcript_segments.confidence, 0 à 1) et les phrases sous le seuil « doubtBelow » sont signalées « incertaines ».
// La confiance n'existe que pour la langue d'origine transcrite par Whisper (pas pour les sous-titres venus d'une plateforme, ni
// les traductions, ni les transcriptions d'avant la migration 128) et s'efface quand un humain corrige la phrase. Ce n'est qu'un
// indice : elle ne dit pas que le texte est faux, seulement que la machine hésitait.
export const NORMS = { maxCps: 21, maxChars: 84, maxSeconds: 8, overlapMs: 50, sameMinChars: 16, doubtBelow: 0.55 };
export const FLAGS = ['empty', 'fast', 'long', 'slow', 'overlap', 'same', 'doubt'];

/** Fragment SQL : une ligne par phrase avec ses drapeaux (booléens). Paramètres : $1 = talk ids (uuid[]), $2 = lang ou NULL. */
export const FLAGGED_SQL = `
  WITH src AS (
    SELECT t.id AS talk_id, COALESCE(t.transcript_language, t.language) AS src_lang FROM talks t WHERE t.id = ANY($1::uuid[])
  ), seg AS (
    SELECT s.talk_id, s.lang, s.idx, s.start_ms, s.end_ms, btrim(s.text) AS txt, char_length(btrim(s.text)) AS len,
           s.end_ms - s.start_ms AS dur, s.confidence, lag(s.end_ms) OVER (PARTITION BY s.talk_id, s.lang ORDER BY s.idx) AS prev_end
      FROM transcript_segments s WHERE s.talk_id = ANY($1::uuid[]) AND ($2::text IS NULL OR s.lang = $2)
  ), f AS (
    SELECT seg.*, src.src_lang, (seg.lang = src.src_lang) AS is_src,
           (seg.len = 0) AS f_empty,
           (seg.dur > 0 AND seg.len * 1000.0 / seg.dur > ${NORMS.maxCps}) AS f_fast,
           (seg.len > ${NORMS.maxChars}) AS f_long,
           (seg.dur > ${NORMS.maxSeconds * 1000}) AS f_slow,
           (seg.prev_end IS NOT NULL AND seg.start_ms < seg.prev_end - ${NORMS.overlapMs}) AS f_overlap,
           (seg.lang = src.src_lang AND seg.confidence IS NOT NULL AND seg.confidence < ${NORMS.doubtBelow}) AS f_doubt,
           (seg.lang <> src.src_lang AND seg.len >= ${NORMS.sameMinChars}
              AND EXISTS (SELECT 1 FROM transcript_segments o WHERE o.talk_id = seg.talk_id AND o.lang = src.src_lang AND o.idx = seg.idx AND btrim(o.text) = seg.txt)) AS f_same
      FROM seg JOIN src ON src.talk_id = seg.talk_id
  )`;

/** Note sur 100 d'une langue : part de phrases sans défaut, les phrases manquantes (traduction incomplète) comptant comme défauts. */
export function scoreOf({ segments, flagged, expected }) {
  const total = Math.max(segments, expected || 0);
  if (!total) return null;
  const missing = Math.max(0, (expected || 0) - segments);
  return Math.max(0, Math.round(100 * (1 - (flagged + missing) / total)));
}
export const levelOf = (score) => (score == null ? 'none' : score >= 90 ? 'good' : score >= 70 ? 'check' : 'fix');
export const LEVEL_RANK = { fix: 0, check: 1, good: 2, none: 3 };

/** Rassemble les lignes agrégées (talk, lang) en contenus avec leurs langues, la note la plus basse faisant la note du contenu. */
export function buildTalks(talks, aggRows, correctionRows = []) {
  const bySrc = new Map();
  for (const r of aggRows) if (r.is_src) bySrc.set(r.talk_id, r.segments);
  const pend = new Map(correctionRows.map((r) => [r.talk_id, r.n]));
  const out = [];
  for (const t of talks) {
    const rows = aggRows.filter((r) => r.talk_id === t.id);
    if (!rows.length) continue;
    const expected = bySrc.get(t.id) || 0;
    const langs = rows.map((r) => {
      const missing = r.is_src ? 0 : Math.max(0, expected - r.segments);
      const score = scoreOf({ segments: r.segments, flagged: r.flagged, expected: r.is_src ? 0 : expected });
      return {
        lang: r.lang, isSource: r.is_src, segments: r.segments, expected: r.is_src ? r.segments : expected, flagged: r.flagged, score, level: levelOf(score),
        avgCps: r.chars && r.ms ? Math.round((r.chars * 1000 / r.ms) * 10) / 10 : null,
        // Confiance moyenne de Whisper (0 à 100) sur les phrases qui en ont une ; null si aucune (voir l'en-tête).
        confidence: r.conf_n ? Math.round(r.conf_avg * 100) : null, confidenceN: r.conf_n || 0,
        counts: { empty: r.f_empty, fast: r.f_fast, long: r.f_long, slow: r.f_slow, overlap: r.f_overlap, same: r.f_same, doubt: r.f_doubt || 0, missing },
      };
    }).sort((a, b) => (b.isSource - a.isSource) || a.lang.localeCompare(b.lang));
    const worst = langs.reduce((m, l) => (l.score != null && (m == null || l.score < m) ? l.score : m), null);
    out.push({ id: t.id, title: t.title, speaker: t.speaker, srcLang: langs.find((l) => l.isSource)?.lang || null, langs, score: worst, level: levelOf(worst), pendingCorrections: pend.get(t.id) || 0 });
  }
  return out.sort((a, b) => (LEVEL_RANK[a.level] - LEVEL_RANK[b.level]) || ((a.score ?? 101) - (b.score ?? 101)) || a.title.localeCompare(b.title));
}

/** Défauts d'une phrase, dans l'ordre d'importance. */
export const issuesOf = (r) => FLAGS.filter((k) => r['f_' + k]);
