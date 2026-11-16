// Étape N7 (16/11) — application alignée sur le site : Apprendre en 3 onglets (voir learnHub.test.ts), accueil allégé,
// bibliothèque en 4 onglets avec « Ma liste », compte en 3 onglets, page vidéo (3 onglets, un seul bouton, fin de vidéo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accTabOf, libTabOf, mergeMyList, myListPlan } from '../src/lib/mylist';
import { endSteps, tabOf, talkTabs } from '../src/lib/talkFlow';
import { withQuizLine, todayLabel, todayTarget } from '../src/lib/today';
import { DICT } from '../src/lib/i18n';
import type { Card } from '../src/lib/types';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const c = (id: string, extra: object = {}) => ({ id, title: id, speaker: '', access: 'free', source: 'upload', ...extra }) as Card & { addedAt?: string; favoritedAt?: string };

test('« Ma liste » : fusion sans doublon, la plus récente d’abord ; bouton unique', () => {
  const m = mergeMyList([c('a', { addedAt: '2026-11-03', positionMs: 5 }), c('b', { addedAt: '2026-11-01' })], [c('b', { favoritedAt: '2026-11-04' }), c('d', { favoritedAt: '2026-11-02' })]);
  assert.deepEqual(m.map((x) => x.id), ['b', 'a', 'd']);
  assert.deepEqual(m[0].srcs, ['later', 'fav']);
  assert.equal(m[1].positionMs, 5);
  assert.deepEqual(mergeMyList(null, undefined), []);
  const all = () => true;
  assert.deepEqual(myListPlan(true, true, all), { remove: ['fav', 'later'], add: null }, 'retrait : des deux');
  assert.deepEqual(myListPlan(false, true, all), { remove: ['later'], add: null });
  assert.deepEqual(myListPlan(false, false, all), { remove: [], add: 'fav' }, 'ajout : favoris');
  assert.deepEqual(myListPlan(false, false, (id) => id !== 'favorites'), { remove: [], add: 'later' }, 'favoris éteints : plus tard');
  assert.deepEqual(myListPlan(false, false, () => false), { remove: [], add: null });
});

test('bibliothèque et compte : onglets et anciens liens', () => {
  assert.equal(libTabOf('later'), 'list'); assert.equal(libTabOf('fav'), 'list'); assert.equal(libTabOf('favs'), 'list');
  assert.equal(libTabOf('notes'), 'notes'); assert.equal(libTabOf('lists'), 'lists'); assert.equal(libTabOf(undefined), 'resume'); assert.equal(libTabOf('x'), 'resume');
  assert.equal(accTabOf('gifts'), 'billing'); assert.equal(accTabOf('purchases'), 'billing'); assert.equal(accTabOf('referral'), 'billing');
  assert.equal(accTabOf('emails'), 'notifs'); assert.equal(accTabOf('data'), 'profile'); assert.equal(accTabOf(undefined), 'profile');
  const lib = read('src/app/(tabs)/library.tsx');
  assert.match(lib, /\['resume', t\('tbResume'\)\]/); assert.match(lib, /\['list', t\('lbMyList'\)\]/); assert.match(lib, /\['notes', t\('tbNotes'\)\]/);
  assert.doesNotMatch(lib, /function Favorites|function Later\(/, 'plus d’onglets Favoris et Plus tard séparés');
  assert.match(lib, /api\.get<NoteGroup\[\]>\('\/me\/notes'\)/);
  const acc = read('src/app/(tabs)/account.tsx');
  for (const k of ['tbProfile', 'acTabBilling', 'msNotif']) assert.ok(acc.includes(`label={t('${k}')}`), k);
  assert.match(acc, /\$\{SITE_URL\}\/account\?tab=profile&s=data/);
});

test('page vidéo : 3 onglets, un seul bouton « Ma liste », fin de vidéo dans le même ordre', () => {
  const on = () => true;
  assert.deepEqual(talkTabs({ loggedIn: true, feat: on, locked: false, hasTracks: true }), ['about', 'notes', 'ask']);
  assert.deepEqual(talkTabs({ loggedIn: false, feat: on, locked: false, hasTracks: true }), ['about', 'notes'], 'visiteur : pas de questions');
  assert.deepEqual(talkTabs({ loggedIn: true, feat: on, locked: false, hasTracks: false }), ['about', 'notes'], 'sans sous-titres : pas de questions');
  assert.deepEqual(talkTabs({ loggedIn: true, feat: on, locked: true, hasTracks: true }), ['about']);
  assert.equal(tabOf('transcript'), 'about'); assert.equal(tabOf('summary'), 'about'); assert.equal(tabOf('notes'), 'notes');
  assert.deepEqual(endSteps({ locked: false, quiz: true, quizPassed: false, practice: true, next: true }), ['quiz', 'practice', 'next']);
  assert.deepEqual(endSteps({ locked: false, quiz: true, quizPassed: true, practice: true, next: true }), ['practice', 'next'], 'quiz réussi : on passe à « que faire »');
  assert.deepEqual(endSteps({ locked: false, quiz: false, quizPassed: false, practice: false, next: true }), ['next']);
  assert.deepEqual(endSteps({ locked: true, quiz: true, quizPassed: false, practice: true, next: true }), ['lock'], 'fin d’aperçu : l’invitation seulement');
  const talk = read('src/app/talk/[id].tsx');
  assert.match(talk, /toggleMyList\(talk\.id\)/);
  assert.doesNotMatch(talk, /toggleFav|toggleLater/, 'plus de boutons Favori et Plus tard séparés');
  assert.match(talk, /transcriptOpen=\{!!atMs\}/, 'arrivée à une minute : transcription dépliée');
  const tabs = read('src/components/talk/TalkTabs.tsx');
  assert.match(tabs, /<Summary talk=\{talk\} insights=\{insights\} \/>/);
  assert.match(tabs, /t\('tpTranscriptShow'\)/);
});

test('accueil : carte « À faire aujourd’hui » avec les quiz, une seule bande, rangée « Ma liste »', () => {
  const d = { date: '2026-11-16', left: 1, items: [{ kind: 'cards', order: 30, done: false, href: '/learning?tab=cards' }, { kind: 'athkar', order: 20, done: true, href: '/learning?tab=athkar' }] };
  const w = withQuizLine(d, 3);
  assert.deepEqual(w?.items.map((x) => x.kind), ['cards', 'quiz', 'athkar'], 'à faire d’abord, par ordre ; faits en bas');
  assert.equal(w?.left, 2);
  assert.equal(withQuizLine(d, 0), d);
  assert.equal(todayLabel({ kind: 'quiz', order: 35, done: false, href: '' }, (k) => k), 'tdQuiz');
  assert.deepEqual(todayTarget('/learning?tab=rev'), { app: '/learn?tab=rev' });
  const home = read('src/app/(tabs)/index.tsx');
  assert.match(home, /<TodayBlock home \/>/); assert.match(home, /<SeasonBands \/>/);
  assert.doesNotMatch(home, /revRow|qpTodoRow|<FormatTiles|<FridayBand/, 'plus de rangées en double ni de tuiles de formats');
  assert.match(home, /mergeMyList\(l, f\)\.slice\(0, 16\)/);
  assert.match(read('src/components/SeasonBands.tsx'), /\{has === false \? <FridayBand \/> : null\}/);
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of ['tpQuestions', 'tpTranscriptShow', 'acTabBilling', 'tbResume', 'tbNotes', 'ntLibEmpty', 'lgSeriesAtt'] as const) assert.ok((DICT[l] as Record<string, string>)[k], `${l}.${k}`);
});
