// M5 : Apprendre — onglets et sections, cartes mémoire, assistant, bilan personnel, liens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTION_LABEL, addDays, askErrorKey, cardsToday, clock, dropTurn, goalsFull, groupOf, groupsFor, markReported, pickSection, pushTurn,
  replaceGoal, replayAt, requeue, shortDate, validQuestion, type Goal, type SelfCheckResponse,
} from '../src/lib/learnHub';
import { routeForPath } from '../src/lib/notifRoute';
import { todayTarget } from '../src/lib/today';
import { DICT } from '../src/lib/i18n';

test('onglets : 4 groupes, sections selon les fonctions activées', () => {
  const all = groupsFor(() => true);
  assert.deepEqual(all.map((g) => g.id), ['g_today', 'g_quran', 'g_talks', 'g_progress']);
  assert.deepEqual(all[2].subs, ['path', 'rev', 'cards']);
  const few = groupsFor((id) => !['quran', 'athkar', 'memorycards', 'selfcheck'].includes(id));
  assert.deepEqual(few.map((g) => g.id), ['g_today', 'g_talks', 'g_progress'], 'groupe Coran caché sans Coran ni athkar');
  assert.deepEqual(few[1].subs, ['path', 'rev']);
  assert.equal(pickSection(all, 'cards'), 'cards');
  assert.equal(pickSection(all, 'inconnu'), 'dash');
  assert.equal(pickSection(few, 'cards'), 'dash', 'section coupée → tableau de bord');
  assert.equal(groupOf(all, 'bilan').id, 'g_progress');
  for (const k of Object.values(SECTION_LABEL)) assert.ok(k);
});

test('cartes : ratée = revient une fois, jamais en boucle ; passage à revoir', () => {
  const a = { id: 'a' }; const b = { id: 'b' };
  let r = requeue([a, b], a, false, new Set());
  assert.deepEqual(r.queue.map((x) => x.id), ['b', 'a']);
  r = requeue(r.queue, b, true, r.retried); assert.deepEqual(r.queue.map((x) => x.id), ['a']);
  r = requeue(r.queue, a, false, r.retried); assert.deepEqual(r.queue, [], 'deuxième échec : la carte ne revient plus');
  assert.equal(replayAt({ startMs: 65000 }), 62);
  assert.equal(replayAt({ startMs: 4000 }), undefined);
  assert.equal(replayAt({ startMs: null }), undefined);
  assert.equal(cardsToday({ total: 9, mastered: 1, learning: 3, due: 2, newAvailable: 5 }), 7);
});

test('assistant : question valide, erreurs, conversation, horloge', () => {
  assert.equal(validQuestion('ab'), false); assert.equal(validQuestion('  abc '), true); assert.equal(validQuestion('x'.repeat(401)), false);
  assert.equal(askErrorKey('learning_required'), 'askNeedLearning');
  assert.equal(askErrorKey('ask_quota'), 'askQuota');
  assert.equal(askErrorKey(undefined, 503), 'askUnavailable');
  assert.equal(askErrorKey('autre'), 'askError');
  let turns = Array.from({ length: 30 }, (_, i) => ({ id: String(i), question: 'q', answer: 'a' }));
  turns = pushTurn(turns, { id: 'new', question: 'q', answer: 'a' });
  assert.equal(turns.length, 30); assert.equal(turns[29].id, 'new');
  assert.equal(markReported(turns, 'new')[29].reported, true);
  assert.equal(dropTurn(turns, 'new').length, 29);
  assert.equal(clock(65000), '1:05'); assert.equal(clock(3725000), '1:02:05'); assert.equal(clock(-5), '0:00');
});

test('bilan personnel : dates, limite, archivage', () => {
  assert.equal(addDays('2026-11-02', 6), '2026-11-08');
  assert.match(shortDate('2026-11-02', 'fr'), /2/);
  const g = (id: string, archived = false): Goal => ({ id, nature: 'quality', title: id, themeId: null, commitmentId: null, archived, current: null, marks: {} });
  const d = { goals: [g('a'), g('b'), g('c', true)], limit: 2 } as unknown as SelfCheckResponse;
  assert.equal(goalsFull(d), true);
  assert.deepEqual(replaceGoal([g('a'), g('b')], g('a', true), false).map((x) => x.id), ['b'], 'archivé : quitte la liste active');
  assert.deepEqual(replaceGoal([g('a'), g('b')], g('a', true), true).map((x) => x.archived), [true, false]);
});

test('liens vers Apprendre : section gardée', () => {
  assert.equal(routeForPath('/learning?tab=cards'), '/learn?tab=cards');
  assert.equal(routeForPath('/learning?tab=rev'), '/learn?tab=rev');
  assert.equal(routeForPath('/learning#bilan'), '/learn?tab=bilan');
  assert.equal(routeForPath('/learning?tab=xyz'), '/learn');
  assert.equal(routeForPath('/learning'), '/learn');
  assert.deepEqual(todayTarget('/learning?tab=cards'), { app: '/learn?tab=cards' });
});

test('textes Apprendre présents dans les trois langues', () => {
  const keys = ['lgGToday', 'lgGQuran', 'lgGTalks', 'lgGProgress', 'lgGTodayTx', 'lgGQuranTx', 'lgGTalksTx', 'lgGProgressTx', 'lgGotIt', 'lgSub', 'tbLabel', 'tbDash', 'tbPath', 'tbQuizRev', 'tbCommit', 'tbAtt', 'msBilan',
    'mcTab', 'mcTitle', 'mcIntro', 'mcDue', 'mcNew', 'mcLearning', 'mcMastered', 'mcStart', 'mcFree', 'mcFreeHint', 'mcFreeNote', 'mcNone', 'mcNoneToday', 'mcMore', 'mcProgress', 'mcQuit', 'mcFromTalk', 'mcNewBadge', 'mcFlip',
    'mcKnown', 'mcAgain', 'mcAnswer', 'mcWhy', 'mcPassage', 'mcReplay', 'mcDoneTitle', 'mcDoneText', 'mcDoneMastered', 'mcDoneAgain', 'mcBack', 'mcErr',
    'scTitle', 'scIntro', 'scWeekHead', 'scFrise', 'scWeekOf', 'scNoCheck', 'scSt_achieved', 'scSt_progress', 'scSt_not_yet', 'scThisWeek', 'scLinked', 'scLink', 'scNotePh', 'scNoteFirst', 'scUnarchive', 'scArchive',
    'scRemoveConfirm', 'scPickTheme', 'scOwnWords', 'scGoalText', 'scPhQuality', 'scPhDefect', 'scAdd', 'scQualities', 'scDefects', 'scEmptyQuality', 'scEmptyDefect', 'scAddQuality', 'scAddDefect', 'scFull',
    'scShowArchived', 'scRemind', 'scRemindDay', 'scRemindHour', 'scPrivacy', 'scExportJson', 'scErase', 'scEraseConfirm', 'pzNote', 'pzNoteAdd', 'pzNoteEdit', 'pzRemove', 'pzConsent', 'pzNeedConsent', 'save', 'saving',
    'evTitle', 'evIntro', 'evMonth', 'evEmpty', 'evLearned', 'evPracticed', 'evWatched', 'evQuizzes', 'evMade', 'evDone', 'evGoal', 'evChecks', 'evPrivacy',
    'askTab', 'askTitle', 'askIntro', 'askPlaceholder', 'askSend', 'askThinking', 'askLoading', 'askSources', 'askReplay', 'askRemaining', 'askQuota', 'askNote', 'askNeedLearning', 'askSeeOffer', 'askBusy', 'askFailed',
    'askNoTranscript', 'askUnavailable', 'askError', 'askReport', 'askReportAsk', 'askReportSend', 'askReportDone', 'askDelete',
    'lrSeries', 'lrNoSeries', 'lrQuizOf', 'lrAttGet', 'lrAttView', 'lrAttDel', 'lrAttDelConfirm', 'lrAttLeft', 'lrAttNote', 'lrRecent', 'lrBadgesWon', 'lrStepW', 'lrStepQ', 'lrStepR', 'lrStepP', 'lrStepWv', 'lrStepQv', 'lrStepRv', 'lrStepPv',
    'lgSteps', 'lgResume', 'lgStartTitle', 'lgStartSub', 'lgStart', 'lgTodayRev', 'lgRevN', 'lgRevText', 'lgRevStart', 'lgRevNone', 'lgCardsN', 'lgCardsGo', 'lgProgress',
    'revNone', 'revNoneYet', 'revGo', 'revMore', 'revMasteredN', 'revEmail', 'lzKicker', 'lzTitle', 'lzText', 'lzH1', 'lzH2', 'lzH2s', 'lzH3', 'lzH4', 'lzP', 'lzCta', 'lzLocked', 'esFindTalk', 'esSeeSeries'];
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of keys) assert.ok((DICT[l] as Record<string, string>)[k], `${l}.${k}`);
});
