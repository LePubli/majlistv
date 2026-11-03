// M3 : athkar (moments, touchers groupés, objectif), saisons et vendredi, liens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ATHKAR_CATS, addPending, applyTap, catsPresent, clampGoal, pickCat, reachesTarget, seasonWhen, SEASON_ICON, type AthkarItem } from '../src/lib/athkar';
import { routeForPath } from '../src/lib/notifRoute';
import { todayTarget } from '../src/lib/today';
import { translate, DICT } from '../src/lib/i18n';

const it = (id: number, category: string, count = 0, target = 3): AthkarItem => ({ id, category, ar: 'x', translit: '', tr: '', reference: 'réf', target, count });

test('moments présents, dans l\'ordre du site', () => {
  assert.deepEqual(catsPresent([it(1, 'sleep'), it(2, 'morning'), it(3, 'morning')]), ['morning', 'sleep']);
  assert.deepEqual(catsPresent([]), []);
  assert.equal(pickCat('evening'), 'evening');
  assert.equal(pickCat('autre'), '');
  assert.equal(pickCat(undefined), '');
  assert.equal(ATHKAR_CATS.length, 5);
});

test('touchers : +1 immédiat, regroupés avant l\'envoi, objectif atteint signalé une fois', () => {
  const l = applyTap([it(1, 'morning', 1), it(2, 'evening')], 1);
  assert.equal(l[0].count, 2); assert.equal(l[1].count, 0);
  const p = new Map<number, number>();
  addPending(p, 1); addPending(p, 1); addPending(p, 2);
  assert.deepEqual([...p], [[1, 2], [2, 1]]);
  for (let i = 0; i < 2000; i++) addPending(p, 3);
  assert.equal(p.get(3), 1000, 'jamais plus que ce que l\'API accepte en un envoi');
  assert.equal(reachesTarget(it(1, 'm', 2, 3)), true);
  assert.equal(reachesTarget(it(1, 'm', 3, 3)), false);
});

test('objectif du jour : entier de 1 à 100', () => {
  assert.equal(clampGoal('5'), 5); assert.equal(clampGoal(0), 1); assert.equal(clampGoal(500), 100); assert.equal(clampGoal('abc'), 1); assert.equal(clampGoal(2.6), 3);
});

test('saison : « dans n jours », « encore n jours », « dernier jour »', () => {
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('fr', k, v);
  const s = { id: 'ramadan', name: 'Ramadan', title: 'Ramadan', text: '', collection: null, talks: [], theme: false };
  assert.match(seasonWhen({ ...s, daysToStart: 3, daysLeft: 30 }, t), /3/);
  assert.match(seasonWhen({ ...s, daysToStart: 0, daysLeft: 5 }, t), /5/);
  assert.equal(seasonWhen({ ...s, daysToStart: 0, daysLeft: 0 }, t), t('seasonLast'));
  assert.equal(SEASON_ICON.ramadan, '🌙');
});

test('liens : rappel des athkar et bloc « Aujourd\'hui » ouvrent le compteur', () => {
  assert.equal(routeForPath('/learning?tab=athkar'), '/athkar');
  assert.equal(routeForPath('/learning'), '/learn');
  assert.deepEqual(todayTarget('/learning?tab=athkar', 'morning'), { app: '/athkar?cat=morning' });
});

test('textes athkar, vendredi et saisons présents dans les trois langues', () => {
  const keys = ['atTab', 'atToday', 'atStreak', 'atDays', 'atGoal', 'atRemind', 'atNoRemind', 'atEmpty', 'atEmptyTx', 'atCats', 'atAll', 'atCat_morning', 'atCat_evening', 'atCat_after_prayer', 'atCat_sleep', 'atCat_general',
    'atRef', 'atTapLabel', 'atDone', 'atReset', 'atResetAsk', 'atNote', 'esReadQuran', 'fdTitle', 'fdKahf', 'fdRow', 'seasonIn', 'seasonLeft', 'seasonLast', 'seasonSee', 'rzNav'];
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of keys) assert.ok((DICT[l] as Record<string, string>)[k], `${l}.${k}`);
});

test('thème : aucun style figé au chargement du module avec une couleur du thème', () => {
  // Un objet « const x = { … colors.… } » au niveau du fichier garderait les couleurs du premier thème.
  const bad: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/kids|widgets/.test(f)) walk(p); } else if (/\.tsx?$/.test(f) && !/theme\.ts$/.test(f)) {
    for (const line of readFileSync(p, 'utf8').split('\n')) if (/^(export )?const \w+(: \w+)? = \{/.test(line) && /\bcolors\.\w+/.test(line) && !/get \w+\(\)/.test(line)) bad.push(`${p}: ${line.slice(0, 80)}`);
  } } };
  walk(new URL('../src', import.meta.url).pathname);
  assert.deepEqual(bad, []);
});
