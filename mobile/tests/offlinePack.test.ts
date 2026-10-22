// 22b-6 bis : pack hors connexion (résumé, chapitres, transcription, quiz) et file des quiz passés hors connexion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_QUEUE, dropAttempt, enqueueAttempt, gradeQuiz, parsePack, parseQueue, pickLang } from '../src/lib/offlinePack';

const T = '3f2a1b9c-1111-4222-8333-444455556666';
const raw = {
  talkId: T, builtAt: '2026-10-22T12:00:00Z',
  insights: [{ lang: 'fr', summary: 'Résumé', keyPoints: ['A', 5, 'B'], chapters: [{ s: 0, t: 'Intro' }, { s: 9000, t: 'Suite' }] }, { lang: 5 }, 'x'],
  transcripts: [{ lang: 'fr', segments: [{ s: 0, e: 4000, t: 'Bonjour' }, { s: 4000, e: 9000, t: 'Salut' }] }, { lang: 'en', segments: [] }, { lang: 'ar', segments: [{ s: 0, e: 1, t: 'مرحبا' }] }],
  quiz: { passPercent: 70, questions: [
    { id: 'q1', question: 'Q1 ?', options: ['a', 'b', 'c'], correctIndex: 1, explanation: 'parce que', chapterMs: 0, chapterTitle: 'Intro' },
    { id: 'q2', question: 'Q2 ?', options: ['a', 'b'], correctIndex: 0, explanation: null },
    { id: 'q3', question: 'cassée', options: ['a', 'b'], correctIndex: 7 }, { id: 'q4', question: 'une seule', options: ['a'], correctIndex: 0 }, { question: 'sans id', options: ['a', 'b'], correctIndex: 0 },
  ] },
};

test('parsePack : contenu valide gardé, éléments cassés ignorés', () => {
  const p = parsePack(raw)!;
  assert.equal(p.talkId, T); assert.equal(p.insights.length, 1); assert.deepEqual(p.insights[0].keyPoints, ['A', 'B']); assert.equal(p.insights[0].chapters[1].t, 'Suite');
  assert.deepEqual(p.transcripts.map((t) => t.lang), ['fr', 'ar'], 'langue sans segment ignorée');
  assert.equal(p.quiz!.questions.length, 2, 'questions invalides écartées'); assert.equal(p.quiz!.questions[1].explanation, null);
  assert.equal(parsePack(JSON.stringify(raw))!.talkId, T, 'texte JSON accepté');
});

test('parsePack : entrées invalides → null, quiz absent ou vide → null', () => {
  for (const bad of [null, 'pas du json', 5, [], {}, { talkId: 5 }]) assert.equal(parsePack(bad as unknown), null);
  assert.equal(parsePack({ talkId: T })!.quiz, null); assert.deepEqual(parsePack({ talkId: T })!.insights, []);
  assert.equal(parsePack({ talkId: T, quiz: { passPercent: 70, questions: [] } })!.quiz, null);
  assert.equal(parsePack({ talkId: T, quiz: { questions: [{ id: 'a', question: 'q', options: ['a', 'b'], correctIndex: 0 }] } })!.quiz!.passPercent, 70, 'seuil par défaut');
});

test('pickLang : langue demandée, racine, français, anglais, première', () => {
  const l = [{ lang: 'ar' }, { lang: 'en' }, { lang: 'fr' }];
  assert.equal(pickLang(l, 'en')!.lang, 'en'); assert.equal(pickLang(l, 'fr-CA')!.lang, 'fr'); assert.equal(pickLang(l, 'de')!.lang, 'fr'); assert.equal(pickLang(l.slice(0, 2), 'de')!.lang, 'en');
  assert.equal(pickLang([{ lang: 'ar' }], 'de')!.lang, 'ar'); assert.equal(pickLang([], 'fr'), null); assert.equal(pickLang(l, null)!.lang, 'fr');
});

test('gradeQuiz : même calcul que le serveur', () => {
  const quiz = parsePack(raw)!.quiz!;
  let r = gradeQuiz(quiz, { q1: 1, q2: 0 }); assert.equal(r.score, 2); assert.equal(r.percent, 100); assert.equal(r.passed, true); assert.equal(r.results[0].explanation, 'parce que'); assert.equal(r.saved, false);
  r = gradeQuiz(quiz, { q1: 0, q2: 0 }); assert.equal(r.score, 1); assert.equal(r.percent, 50); assert.equal(r.passed, false); assert.equal(r.results[0].correctIndex, 1); assert.equal(r.results[0].correct, false);
  r = gradeQuiz(quiz, { q1: 1 }); assert.equal(r.results[1].chosen, null); assert.equal(r.results[1].correct, false); assert.equal(r.percent, 50);
  assert.equal(gradeQuiz({ passPercent: 70, questions: [] }, {}).percent, 0);
  assert.equal(gradeQuiz({ ...quiz, passPercent: 50 }, { q1: 1 }).passed, true, 'seuil réglable');
});

test('file des quiz : lecture sûre, ajout, retrait, plafond', () => {
  assert.deepEqual(parseQueue(null), []); assert.deepEqual(parseQueue('pas du json'), []); assert.deepEqual(parseQueue('{"a":1}'), []);
  const q = parseQueue(JSON.stringify([{ talkId: T, answers: [{ questionId: 'q1', index: 1 }, { questionId: 'q2', index: 9 }, { questionId: 5, index: 0 }], at: 5 }, { talkId: T, answers: [] }, null, { answers: [] }]));
  assert.equal(q.length, 1); assert.deepEqual(q[0].answers, [{ questionId: 'q1', index: 1 }]);
  const a = { talkId: T, answers: [{ questionId: 'q1', index: 0 }], at: 1 };
  let list = enqueueAttempt([], a); assert.equal(list.length, 1); assert.deepEqual(dropAttempt(list, a), []);
  for (let i = 0; i < MAX_QUEUE + 10; i += 1) list = enqueueAttempt(list, { ...a, at: i });
  assert.equal(list.length, MAX_QUEUE); assert.equal(list[list.length - 1].at, MAX_QUEUE + 9);
});
