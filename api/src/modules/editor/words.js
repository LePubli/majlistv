// Module « Éditeur de montage » — étape E5a : montage par le texte.
//
// L'éditeur montre la transcription de la conférence ; supprimer des mots ou des phrases du texte coupe la vidéo
// (les coupes elles-mêmes sont faites par le site, sur le montage : web/modules/editor/ops.js, cutRange / restoreRange).
// Cette route donne le texte avec la place de chaque mot dans la vidéo source :
//   - « précis » : mots horodatés par Whisper (table transcript_words, réglage « Horodater chaque mot ») ;
//   - « estimé » : conférence transcrite avant l'étape E5a, sous-titres de l'auteur (YouTube, Vimeo), phrase corrigée à la main
//     après la transcription, ou traduction : la durée de la phrase est répartie entre ses mots selon leur longueur.
// Une phrase dont le texte a été corrigé ne correspond plus aux mots de Whisper : elle passe d'elle-même en « estimé ».
import { z } from 'zod';
import { pool } from '../../db.js';

export const MAX_SEGMENTS = 6000;

// Texte comparable : sans espaces ni majuscules (Whisper colle la ponctuation aux mots, comme dans la phrase).
export const squash = (s) => String(s || '').normalize('NFC').replace(/\s+/g, '').toLowerCase();

// Mots estimés d'une phrase : la durée [s, e] est répartie selon la longueur de chaque mot (+1 pour l'espace).
export function estimateWords(seg) {
  const toks = String(seg.text || '').split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const weights = toks.map((w) => w.length + 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const span = Math.max(0, seg.e - seg.s);
  let at = seg.s;
  return toks.map((w, i) => {
    const s = at; at += (span * weights[i]) / sum;
    return { s: r3(s), e: r3(i === toks.length - 1 ? seg.e : at), w };
  });
}
const r3 = (x) => Math.round(x * 1000) / 1000;

// Phrases + mots. segs = [{ idx, s, e, text }] (secondes) ; words = Map(seg_idx → [{ s, e, w }]).
export function buildWords(segs, words) {
  let precise = 0;
  const out = segs.map((seg) => {
    const ws = words.get(seg.idx);
    if (ws?.length && squash(ws.map((x) => x.w).join('')) === squash(seg.text)) {
      precise += 1;
      // Un mot qui déborde de sa phrase (rare chez Whisper) est ramené dans la phrase.
      return { ...seg, precise: true, words: ws.map((x) => ({ s: r3(Math.max(seg.s, Math.min(x.s, seg.e))), e: r3(Math.max(seg.s, Math.min(Math.max(x.e, x.s), seg.e))), w: x.w })) };
    }
    return { ...seg, precise: false, words: estimateWords(seg) };
  });
  return { segments: out, precise, total: segs.length };
}

// Langue montrée par défaut : la langue parlée (celle de la transcription), sinon le français, sinon la première.
export function pickLang(langs, origin, wanted) {
  if (wanted && langs.includes(wanted)) return wanted;
  if (origin && langs.includes(origin)) return origin;
  const o = langs.find((l) => origin && String(origin).startsWith(l));
  return o || (langs.includes('fr') ? 'fr' : langs[0] || null);
}

export async function wordsOf(talkId, origin, wanted) {
  const langs = (await pool.query('SELECT DISTINCT lang FROM transcript_segments WHERE talk_id = $1 ORDER BY lang', [talkId])).rows.map((r) => r.lang);
  const lang = pickLang(langs, origin, wanted);
  if (!lang) return { lang: null, langs, origin: origin || null, segments: [], precise: 0, total: 0 };
  const segs = (await pool.query(
    'SELECT idx, start_ms / 1000.0 AS s, end_ms / 1000.0 AS e, text FROM transcript_segments WHERE talk_id = $1 AND lang = $2 ORDER BY idx LIMIT $3',
    [talkId, lang, MAX_SEGMENTS])).rows.map((r) => ({ idx: r.idx, s: Number(r.s), e: Number(r.e), text: r.text }));
  const words = new Map();
  const rows = (await pool.query(
    'SELECT seg_idx, start_ms / 1000.0 AS s, end_ms / 1000.0 AS e, word FROM transcript_words WHERE talk_id = $1 AND lang = $2 ORDER BY seg_idx, idx',
    [talkId, lang])).rows;
  for (const w of rows) {
    if (!words.has(w.seg_idx)) words.set(w.seg_idx, []);
    words.get(w.seg_idx).push({ s: Number(w.s), e: Number(w.e), w: w.word });
  }
  return { lang, langs, origin: origin || null, ...buildWords(segs, words) };
}

export default async function wordRoutes(app, { guard, viewer }) {
  const q = z.object({ lang: z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/).optional() });
  // Texte de la conférence, mot à mot, en temps source.
  app.get('/studio/editor/projects/:id/words', viewer, async (req, reply) => {
    const row = await guard(req, reply); if (!row) return reply;
    const { lang } = q.parse(req.query || {});
    const origin = (await pool.query('SELECT transcript_language FROM talks WHERE id = $1', [row.talk_id])).rows[0]?.transcript_language || row.lang || null;
    return wordsOf(row.talk_id, origin, lang);
  });
}
