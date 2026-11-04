// Fonctions pures de l'onglet Apprendre : quiz, engagements, erreurs « offre requise ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api';
import { canCommit, commitBody, firstUnanswered, isLearningRequired, sortCommitments, submitBody } from '../src/lib/learn';
import { DICT } from '../src/lib/i18n';
import type { Commitment } from '../src/lib/types';

const qs = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];

test('quiz : première question sans réponse et corps envoyé dans l’ordre', () => {
  assert.equal(firstUnanswered(qs, {}), 0);
  assert.equal(firstUnanswered(qs, { q1: 2, q3: 0 }), 1);
  assert.equal(firstUnanswered(qs, { q1: 0, q2: 1, q3: 3 }), -1);
  assert.deepEqual(submitBody(qs, { q3: 1, q1: 0 }), { answers: [{ questionId: 'q1', index: 0 }, { questionId: 'q3', index: 1 }] });
});

test('erreur « offre Apprentissage requise » reconnue (403 + code), pas les autres', () => {
  assert.equal(isLearningRequired(new ApiError('x', 403, 'learning_required')), true);
  assert.equal(isLearningRequired(new ApiError('x', 403, 'other')), false);
  assert.equal(isLearningRequired(new ApiError('x', 401, 'learning_required')), false);
  assert.equal(isLearningRequired(new Error('x')), false);
});

test('plus de badges adultes (décision d\'Epok, 04/11) : ni libellés, ni identifiants', () => {
  for (const l of ['fr', 'en', 'ar'] as const) assert.equal(Object.keys(DICT[l]).some((k) => k.startsWith('badge.') || k === 'quiz.newBadges' || k === 'learn.badges'), false, `${l} : reste des textes de badges adultes`);
});

const c = (id: string, status: Commitment['status'], overdue = false) => ({ id, status, overdue } as Commitment);
test('engagements : en retard d’abord, puis à faire / en cours, puis le reste ; ordre stable', () => {
  const out = sortCommitments([c('a', 'done'), c('b', 'todo'), c('c', 'doing', true), c('d', 'not_yet'), c('e', 'todo')]);
  assert.deepEqual(out.map((x) => x.id), ['c', 'b', 'e', 'a', 'd']);
});

test('engagement : texte libre OU proposition, accord envoyé une seule fois', () => {
  assert.deepEqual(commitBody({ suggestionId: 's1', text: '', niyya: ' ', due: 'week', consent: true, consentGiven: false }), { niyya: '', due: 'week', suggestionId: 's1', consent: true });
  assert.deepEqual(commitBody({ suggestionId: 's1', text: ' Appeler mon frère ', niyya: 'pour lui', due: null, consent: true, consentGiven: true }), { niyya: 'pour lui', due: null, text: 'Appeler mon frère' });
  assert.equal(canCommit({ suggestionId: null, text: 'ab', consent: true, consentGiven: true }), false);
  assert.equal(canCommit({ suggestionId: 's1', text: '', consent: false, consentGiven: false }), false);
  assert.equal(canCommit({ suggestionId: 's1', text: '', consent: true, consentGiven: false }), true);
  assert.equal(canCommit({ suggestionId: null, text: 'abc', consent: false, consentGiven: true }), true);
});

test('série de jours : textes présents dans les 3 langues, avec les jetons attendus', () => {
  const keys = ['skTitle', 'skDay1', 'skDayN', 'skZero', 'skRisk', 'skDone', 'skBest', 'skWeek', 'skRest', 'skRestUsed', 'skGoalTitle', 'skGoalUnit', 'skReached', 'skGoalSet', 'skRule', 'skHide', 'skShow'];
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of keys) assert.ok((DICT[l] as Record<string, string>)[k], `${l}.${k}`);
  for (const l of ['fr', 'en', 'ar'] as const) assert.ok((DICT[l] as Record<string, string>).skBest.includes('{n}'), `${l}.skBest : jeton {n}`);
});
