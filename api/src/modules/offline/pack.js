// Étape 22b-6 bis — « pack hors connexion » d'une conférence : tout ce qui accompagne la vidéo (résumé, points clés, chapitres, transcription
// dans chaque langue disponible, quiz avec les bonnes réponses et leurs explications). Réservé aux abonnés (même contrôle que le fichier).
import { pool } from '../../db.js';
import { quizInfo } from '../quiz/routes.js';
import { getNumber } from '../../settings.js';

/** Construit le pack d'une conférence (le contrôle d'accès est fait par la route). */
export async function buildPack(talkId) {
  const ins = (await pool.query(
    "SELECT lang, summary, key_points, chapters FROM talk_insights WHERE talk_id = $1 AND status = 'ready' ORDER BY lang", [talkId])).rows;
  const seg = (await pool.query(
    'SELECT lang, start_ms, end_ms, text FROM transcript_segments WHERE talk_id = $1 ORDER BY lang, idx', [talkId])).rows;
  const byLang = new Map();
  for (const r of seg) {
    if (!byLang.has(r.lang)) byLang.set(r.lang, []);
    byLang.get(r.lang).push({ s: r.start_ms, e: r.end_ms, t: r.text });
  }
  let quiz = null;
  try {
    if ((await quizInfo(talkId)).available) {
      const qs = (await pool.query(
        `SELECT id, question, options, correct_index, explanation, evidence_ms, chapter_ms, chapter_title
           FROM quiz_questions WHERE talk_id = $1 AND status = 'approved' ORDER BY evidence_ms NULLS LAST, created_at, id`, [talkId])).rows;
      quiz = {
        passPercent: await getNumber('quiz_pass_percent'),
        questions: qs.map((q) => ({ id: q.id, question: q.question, options: q.options, correctIndex: q.correct_index, explanation: q.explanation, chapterMs: q.chapter_ms, chapterTitle: q.chapter_title })),
      };
    }
  } catch { /* module quiz absent : pas de quiz dans le pack */ }
  return {
    talkId,
    builtAt: new Date().toISOString(),
    insights: ins.map((r) => ({ lang: r.lang, summary: r.summary, keyPoints: r.key_points, chapters: (r.chapters || []).map((c) => ({ s: c.ms, t: c.title })) })),
    transcripts: [...byLang].map(([lang, segments]) => ({ lang, segments })),
    quiz,
  };
}
