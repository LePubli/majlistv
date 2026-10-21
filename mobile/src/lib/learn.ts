// Petites fonctions pures de l'onglet Apprendre (testées sans téléphone).
import { ApiError } from './api';
import type { BadgeId, Commitment, DueKind, PracticeStatus, QuizQuestion } from './types';

export const STATUSES: PracticeStatus[] = ['todo', 'doing', 'done', 'not_yet'];
export const DUE_KINDS: DueKind[] = ['today', 'week', 'month'];

/** Réponse 403 « offre Apprentissage requise » du serveur. */
export function isLearningRequired(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403 && e.code === 'learning_required';
}

/** Clé de traduction d'un badge (une inconnue ne casse pas l'écran : on retombe sur l'identifiant). */
export const BADGE_IDS: BadgeId[] = ['first_quiz', 'passed_5', 'passed_10', 'perfect', 'comeback', 'streak_3', 'explorer', 'series_done'];
export const isBadgeId = (s: string): s is BadgeId => (BADGE_IDS as string[]).includes(s);

/** Index de la première question sans réponse, ou -1 si tout est répondu. */
export function firstUnanswered(questions: Pick<QuizQuestion, 'id'>[], answers: Record<string, number>): number {
  return questions.findIndex((q) => answers[q.id] === undefined);
}

/** Corps de la requête de soumission du quiz, dans l'ordre des questions. */
export function submitBody(questions: Pick<QuizQuestion, 'id'>[], answers: Record<string, number>) {
  return { answers: questions.filter((q) => answers[q.id] !== undefined).map((q) => ({ questionId: q.id, index: answers[q.id] })) };
}

/** Engagements à afficher en premier : en retard, puis à faire / en cours, puis les autres. */
export function sortCommitments(items: Commitment[]): Commitment[] {
  const rank = (c: Commitment) => (c.overdue ? 0 : c.status === 'todo' || c.status === 'doing' ? 1 : 2);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/** Corps de la requête « Je m'engage » : une proposition OU un texte libre (jamais les deux). */
export function commitBody(opts: { suggestionId: string | null; text: string; niyya: string; due: DueKind | null; consent: boolean; consentGiven: boolean }) {
  const text = opts.text.trim();
  const body: Record<string, unknown> = { niyya: opts.niyya.trim(), due: opts.due };
  if (text.length >= 3) body.text = text;
  else if (opts.suggestionId) body.suggestionId = opts.suggestionId;
  if (!opts.consentGiven && opts.consent) body.consent = true;
  return body;
}

/** L'engagement peut-il être envoyé ? (une action choisie ou écrite ; accord déjà donné ou coché) */
export function canCommit(opts: { suggestionId: string | null; text: string; consent: boolean; consentGiven: boolean }): boolean {
  const hasAction = !!opts.suggestionId || opts.text.trim().length >= 3;
  return hasAction && (opts.consentGiven || opts.consent);
}
