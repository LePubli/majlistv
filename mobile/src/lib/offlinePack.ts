// Hors connexion (22b-6 bis) : « pack » d'une conférence téléchargée (résumé, chapitres, transcription, quiz) et file des quiz passés hors connexion.
// Logique pure (testée avec Node, tests/offlinePack.test.ts).
import type { QuizResult } from '@/lib/types';

export type PackInsight = { lang: string; summary: string; keyPoints: string[]; chapters: { s: number; t: string }[] };
export type PackTranscript = { lang: string; segments: { s: number; e: number; t: string }[] };
export type PackQuestion = { id: string; question: string; options: string[]; correctIndex: number; explanation: string | null; chapterMs: number | null; chapterTitle: string | null };
export type PackQuiz = { passPercent: number; questions: PackQuestion[] };
export type OfflinePack = { talkId: string; builtAt: string; insights: PackInsight[]; transcripts: PackTranscript[]; quiz: PackQuiz | null };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const s = (v: unknown, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Valide le pack reçu du serveur ou relu sur le disque ; ignore ce qui est invalide, jamais d'exception. */
export function parsePack(raw: unknown): OfflinePack | null {
  let data = raw;
  if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch { return null; } }
  if (!isObj(data) || typeof data.talkId !== 'string') return null;
  const insights: PackInsight[] = arr(data.insights).filter(isObj).filter((i) => typeof i.lang === 'string').map((i) => ({
    lang: s(i.lang, 12), summary: s(i.summary), keyPoints: arr(i.keyPoints).filter((k): k is string => typeof k === 'string'),
    chapters: arr(i.chapters).filter(isObj).map((c) => ({ s: n(c.s), t: s(c.t, 300) })),
  }));
  const transcripts: PackTranscript[] = arr(data.transcripts).filter(isObj).filter((t) => typeof t.lang === 'string').map((t) => ({
    lang: s(t.lang, 12), segments: arr(t.segments).filter(isObj).map((x) => ({ s: n(x.s), e: n(x.e), t: s(x.t, 2000) })),
  })).filter((t) => t.segments.length > 0);
  let quiz: PackQuiz | null = null;
  if (isObj(data.quiz)) {
    const qs: PackQuestion[] = arr(data.quiz.questions).filter(isObj)
      .filter((q) => typeof q.id === 'string' && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.correctIndex))
      .map((q) => ({
        id: q.id as string, question: s(q.question, 1000), options: arr(q.options).map((o) => s(o, 500)), correctIndex: q.correctIndex as number,
        explanation: typeof q.explanation === 'string' ? q.explanation : null, chapterMs: typeof q.chapterMs === 'number' ? q.chapterMs : null, chapterTitle: typeof q.chapterTitle === 'string' ? q.chapterTitle : null,
      }))
      .filter((q) => q.correctIndex >= 0 && q.correctIndex < q.options.length);
    if (qs.length) quiz = { passPercent: Math.min(100, Math.max(1, n(data.quiz.passPercent) || 70)), questions: qs };
  }
  return { talkId: data.talkId, builtAt: s(data.builtAt, 40), insights, transcripts, quiz };
}

/** Langue à afficher : celle demandée, sa racine (« fr-CA » → « fr »), puis le français, l'anglais, la première disponible. */
export function pickLang<T extends { lang: string }>(items: T[], wanted?: string | null): T | null {
  if (!items.length) return null;
  const w = (wanted || '').toLowerCase();
  const base = w.split('-')[0];
  return items.find((i) => i.lang.toLowerCase() === w) || items.find((i) => i.lang.toLowerCase() === base)
    || items.find((i) => i.lang === 'fr') || items.find((i) => i.lang === 'en') || items[0];
}

/** Correction locale : mêmes champs que la réponse du serveur (POST /talks/:id/quiz/submit), sans badges ni enregistrement. */
export function gradeQuiz(quiz: PackQuiz, answers: Record<string, number>): QuizResult {
  const results = quiz.questions.map((q) => {
    const chosen = answers[q.id] === undefined ? null : answers[q.id];
    return { questionId: q.id, chosen, correct: chosen === q.correctIndex, correctIndex: q.correctIndex, explanation: q.explanation, chapterTitle: q.chapterTitle };
  });
  const score = results.filter((r) => r.correct).length;
  const total = quiz.questions.length;
  const percent = total ? Math.round((100 * score) / total) : 0;
  return { score, total, percent, passed: percent >= quiz.passPercent, passPercent: quiz.passPercent, best: null, saved: false, learning: null, results };
}

// ---- File d'attente des quiz passés hors connexion (envoyés au serveur à la reconnexion) ----
export type QueuedAttempt = { talkId: string; answers: { questionId: string; index: number }[]; at: number };
export const MAX_QUEUE = 50;

export function parseQueue(raw: string | null | undefined): QueuedAttempt[] {
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : []; } catch { return []; }
  if (!Array.isArray(data)) return [];
  const out: QueuedAttempt[] = [];
  for (const x of data) {
    if (!isObj(x) || typeof x.talkId !== 'string') continue;
    const answers = arr(x.answers).filter(isObj).filter((a) => typeof a.questionId === 'string' && Number.isInteger(a.index) && (a.index as number) >= 0 && (a.index as number) <= 3)
      .map((a) => ({ questionId: a.questionId as string, index: a.index as number }));
    if (answers.length) out.push({ talkId: x.talkId, answers, at: n(x.at) });
  }
  return out.slice(-MAX_QUEUE);
}

export const enqueueAttempt = (q: QueuedAttempt[], a: QueuedAttempt) => [...q, a].slice(-MAX_QUEUE);
export const dropAttempt = (q: QueuedAttempt[], a: QueuedAttempt) => q.filter((x) => x !== a);
