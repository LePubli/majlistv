// M2 : Coran dans l'application — réglages, adresse de récitation, enchaînement, tajwid, mot à mot, filtres, programme 30 jours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PREFS, ARABIC_SIZES, filterSuras, juzRange, nextAya, paint, planPhase, readPrefs, reciterUrl, suraNum, suraQuery, tajColor, tajLegend, tokens, wordMode,
} from '../src/lib/quran';
import { routeForPath } from '../src/lib/notifRoute';
import { todayTarget } from '../src/lib/today';
import { DICT } from '../src/lib/i18n';

test('readPrefs : valeurs par défaut, valeurs gardées, valeurs étranges écartées', () => {
  assert.deepEqual(readPrefs(null), DEFAULT_PREFS);
  assert.deepEqual(readPrefs('pas du json'), DEFAULT_PREFS);
  const p = readPrefs(JSON.stringify({ translation: 'hamidullah', ph: false, tafsir: 'ibn-kathir', size: 4, reciter: 'alafasy', chain: false, wbw: true, taj: true }));
  assert.deepEqual(p, { translation: 'hamidullah', ph: false, tafsir: 'ibn-kathir', size: 4, reciter: 'alafasy', chain: false, wbw: true, taj: true });
  const bad = readPrefs({ translation: '../x', ph: 'oui', size: 9, reciter: 'A B', tafsir: 3 });
  assert.equal(bad.translation, undefined);
  assert.equal(bad.ph, true);
  assert.equal(bad.size, 2);
  assert.equal(bad.reciter, '');
  assert.equal(bad.tafsir, '');
  assert.equal(readPrefs({ translation: 'none' }).translation, 'none', '« none » = sans traduction');
});

test('suraQuery : mêmes paramètres que le site', () => {
  assert.deepEqual(suraQuery('fr', DEFAULT_PREFS), { lang: 'fr' });
  assert.deepEqual(suraQuery('ar', { ...DEFAULT_PREFS, translation: 'x', ph: false, wbw: true, taj: true }), { lang: 'ar', translation: 'x', translit: 'none', words: '1', tajweed: '1' });
  assert.equal(ARABIC_SIZES[1] < ARABIC_SIZES[4], true);
});

test('reciterUrl : numéros sur trois chiffres, https seulement', () => {
  assert.equal(reciterUrl('https://a.example/{sura3}{aya3}.mp3', 2, 5), 'https://a.example/002005.mp3');
  assert.equal(reciterUrl('https://a.example/{sura}/{aya}.mp3', 114, 6), 'https://a.example/114/6.mp3');
  assert.equal(reciterUrl('http://a.example/{sura3}.mp3', 1, 1), null);
  assert.equal(reciterUrl('javascript:alert(1)', 1, 1), null);
});

test('nextAya : enchaîne jusqu\'à la fin de la sourate', () => {
  const v = [{ aya: 1 }, { aya: 2 }, { aya: 3 }];
  assert.equal(nextAya(v, 1, true), 2);
  assert.equal(nextAya(v, 3, true), null);
  assert.equal(nextAya(v, 1, false), null);
});

test('tajwid : tronçons colorés, couleur neutre pour une règle inconnue, légende traduite', () => {
  const cps = [...'abcdef'];
  assert.deepEqual(paint(cps, [['ghunnah', 1, 3]]), [{ text: 'a', rule: null }, { text: 'bc', rule: 'ghunnah' }, { text: 'def', rule: null }]);
  assert.deepEqual(paint(cps, [['madd_2', 4, 999]], 3, 6), [{ text: 'd', rule: null }, { text: 'ef', rule: 'madd_2' }]);
  assert.deepEqual(paint(cps, null), [{ text: 'abcdef', rule: null }]);
  assert.equal(tajColor('ghunnah'), '#4ade80');
  assert.equal(tajColor('inconnue'), '#d1d5db');
  const leg = tajLegend({ '1': [['ghunnah', 0, 1], ['idghaam_shafawi', 2, 3]] }, 'ar');
  assert.deepEqual(leg, [{ color: '#4ade80', label: 'غنة' }, { color: '#38bdf8', label: 'إدغام' }]);
});

test('mot à mot : proposé seulement si le nombre de mots correspond', () => {
  assert.deepEqual(tokens([...'ab  cd e']), [[0, 2], [4, 6], [7, 8]]);
  assert.equal(wordMode('aa bb cc', ['1', '2', '3']), true);
  assert.equal(wordMode('aa bb cc', ['1', '2']), false);
  assert.equal(wordMode('aa', null), false);
});

test('filterSuras, juzRange, planPhase, suraNum', () => {
  const list = [{ n: 1, en: 'Al-Fatiha', ar: 'الفاتحة', verses: 7 }, { n: 2, en: 'Al-Baqara', ar: 'البقرة', verses: 286 }];
  assert.equal(filterSuras(list, 'baq').length, 1);
  assert.equal(filterSuras(list, 'الفاتحة')[0].n, 1);
  assert.equal(filterSuras(list, '2')[0].n, 2);
  assert.equal(filterSuras(list, ' ').length, 2);
  const j = { n: 1, start: { sura: 1, aya: 1, name: 'Al-Fatiha', ar: 'الفاتحة' }, end: { sura: 2, aya: 141, name: 'Al-Baqara', ar: 'البقرة' } };
  assert.equal(juzRange(j, 'fr'), 'Al-Fatiha 1 → Al-Baqara 141');
  assert.equal(juzRange(j, 'ar'), 'الفاتحة 1 → البقرة 141');
  const base = { startedOn: '2026-11-01', todayJuz: null, reads: [], remindHour: null, completed: 0, finished: false };
  assert.equal(planPhase({ ...base, day: 3 }), 'day');
  assert.equal(planPhase({ ...base, day: 31 }), 'over');
  assert.equal(planPhase({ ...base, day: 0 }), 'soon');
  assert.equal(suraNum('114'), 114);
  for (const bad of ['0', '115', 'x', undefined, '2.5']) assert.equal(suraNum(bad), null);
});

test('liens : notification du programme et bloc « Aujourd\'hui » ouvrent le Coran de l\'application', () => {
  assert.equal(routeForPath('/coran'), '/quran');
  assert.equal(routeForPath('/coran/2#v142'), '/quran/2?aya=142');
  assert.equal(routeForPath('/coran/18'), '/quran/18');
  assert.equal(routeForPath('/coran/115'), '/');
  assert.equal(routeForPath('/coran/abc'), '/');
  assert.deepEqual(todayTarget('/coran'), { app: '/quran' });
});

test('textes du Coran présents dans les trois langues', () => {
  const keys = ['qrTitle', 'qrNav', 'qrIntro', 'qrSoon', 'qrSearch', 'qrFilter', 'qrNoResult', 'qrVerses', 'qrNotFound', 'qrSura', 'qrOptions', 'qrTranslation', 'qrPhonetic', 'qrTafsir', 'qrNone', 'qrSize', 'qrVerse',
    'qrShowTafsir', 'qrHideTafsir', 'qrPrev', 'qrNext', 'qrSources', 'qrSource', 'qrReciter', 'qrChain', 'qrWbw', 'qrTajweed', 'qrListen', 'qrStop', 'qrAudioErr', 'qrLegend', 'qrNotes',
    'khTitle', 'khIntro', 'khLogin', 'khStart', 'khDay', 'khOver', 'khSoon', 'khProgress', 'khRead', 'khCompleted', 'khFinished', 'khEndTx', 'khShare', 'khShared', 'khShareTx', 'khOverTx', 'khOverHelp',
    'khContinue', 'khToday', 'khReadNow', 'khMark', 'khShowAll', 'khHideAll', 'khJuz', 'khRemind', 'khRestart', 'khRestartAsk', 'khStop', 'khStopAsk', 'atNoRemind', 'cancelBtn', 'errGeneric'];
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of keys) assert.ok((DICT[l] as Record<string, string>)[k], `${l}.${k}`);
});
