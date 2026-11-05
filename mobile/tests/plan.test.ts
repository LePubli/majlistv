// Mon planning (application) : dates, fenêtres, regroupement par jour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addMonths, canPlan, groupByDay, mondayOf, sectionOfKind, stepCursor, todoCount, windowOf } from '../src/lib/plan';
import type { PlanAuto, PlanItem } from '../src/lib/types';

test('addDays / mondayOf : changement d\'heure et de mois sans décalage', () => {
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(mondayOf('2026-11-05'), '2026-11-02'); // jeudi
  assert.equal(mondayOf('2026-11-08'), '2026-11-02'); // dimanche
  assert.equal(mondayOf('2026-11-02'), '2026-11-02');
});
test('addMonths : toujours le 1er du mois', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-01');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-01');
  assert.equal(addMonths('2026-01-15', -1), '2025-12-01');
});
test('windowOf : jour, semaine (7 jours), mois (42 jours depuis un lundi)', () => {
  assert.deepEqual(windowOf('day', '2026-11-05'), { from: '2026-11-05', to: '2026-11-05' });
  assert.deepEqual(windowOf('week', '2026-11-05'), { from: '2026-11-02', to: '2026-11-08' });
  const m = windowOf('month', '2026-11-15');
  assert.equal(m.from, '2026-10-26');
  assert.equal(m.to, addDays(m.from, 41));
  assert.equal(new Date(`${m.from}T00:00:00Z`).getUTCDay(), 1);
});
test('stepCursor : pas selon la vue', () => {
  assert.equal(stepCursor('day', '2026-11-05', 1), '2026-11-06');
  assert.equal(stepCursor('week', '2026-11-05', -1), '2026-10-29');
  assert.equal(stepCursor('month', '2026-11-05', 1), '2026-12-01');
});
test('groupByDay / todoCount : compte ce qui reste à faire', () => {
  const auto: PlanAuto[] = [{ day: 'A', type: 'cards', count: 3 }, { day: 'A', type: 'quran', juz: 2, done: true }, { day: 'B', type: 'bilan' }];
  const items: PlanItem[] = [{ id: '1', day: 'A', kind: 'video', done: false }, { id: '2', day: 'A', kind: 'custom', done: true, note: 'x' }];
  const g = groupByDay(auto, items);
  assert.equal(g.get('A')?.auto.length, 2);
  assert.equal(g.get('A')?.mine.length, 2);
  assert.equal(todoCount(g.get('A')), 2);
  assert.equal(todoCount(g.get('B')), 1);
  assert.equal(todoCount(g.get('C')), 0);
});
test('sectionOfKind / canPlan', () => {
  assert.equal(sectionOfKind('action'), 'commit');
  assert.equal(sectionOfKind('cards'), 'cards');
  assert.equal(sectionOfKind('video'), null);
  assert.equal(sectionOfKind('custom'), null);
  assert.equal(canPlan('2026-11-05', '2026-11-05'), true);
  assert.equal(canPlan('2026-11-04', '2026-11-05'), false);
});
