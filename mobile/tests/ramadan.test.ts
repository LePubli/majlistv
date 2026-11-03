// M4 : circuit de Ramadan (jours, cases, tarawih), bilan, enfants, pastille, liens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeText, bilanCards, canMark, clampRakaat, dayFull, hasItems, itemLink, itemsOf, kidStateKey, marksOf, startDay, statusLine, type RamadanResponse } from '../src/lib/ramadan';
import { routeForPath } from '../src/lib/notifRoute';
import { todayTarget } from '../src/lib/today';
import { translate, DICT } from '../src/lib/i18n';

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('fr', k, v);
const it = (id: number, day: number) => ({ id, day, title: `A${id}`, text: '', link: '', reference: '' });
const base = (active: boolean, day: number | null, me = true): RamadanResponse => ({
  status: { active, day, hyear: 1448, startsOn: '2027-02-08', endsOn: '2027-03-09', daysToStart: active ? 0 : 20 },
  everyDay: [it(1, 0)],
  days: Array.from({ length: 30 }, (_, k) => ({ day: k + 1, items: k === 4 ? [it(5, 5)] : [] })),
  ...(me ? { me: { marks: { '5': [1, 5], '3': [1] }, tarawih: {}, remindHour: null } } : {}),
});

test('actions d\'un jour : « chaque jour » + celles du jour ; cases et jours complets', () => {
  const d = base(true, 6);
  assert.deepEqual(itemsOf(d, 5).map((x) => x.id), [1, 5]);
  assert.deepEqual(itemsOf(d, 2).map((x) => x.id), [1]);
  assert.deepEqual(marksOf(d, 5), [1, 5]);
  assert.deepEqual(marksOf(d, 9), []);
  assert.equal(dayFull(d, 5), true); assert.equal(dayFull(d, 2), false);
  assert.equal(hasItems(d), true);
  assert.equal(hasItems({ ...d, everyDay: [], days: d.days.map((x) => ({ ...x, items: [] })) }), false);
});

test('cocher : pendant Ramadan, jour déjà commencé, membre connecté', () => {
  assert.equal(canMark(base(true, 6), 6), true);
  assert.equal(canMark(base(true, 6), 1), true, 'rattrapage permis');
  assert.equal(canMark(base(true, 6), 7), false, 'pas d\'avance');
  assert.equal(canMark(base(false, null), 1), false, 'hors Ramadan');
  assert.equal(canMark(base(true, 6, false), 6), false, 'visiteur');
  assert.equal(startDay(base(true, 12).status), 12);
  assert.equal(startDay(base(false, null).status), 1);
});

test('ligne d\'état et rakaat', () => {
  assert.equal(statusLine(base(true, 12).status, t, 'fr'), 'Jour 12 de Ramadan 1448');
  assert.match(statusLine(base(false, null).status, t, 'fr'), /20/);
  assert.equal(statusLine({ active: false, day: null, hyear: null, startsOn: null, endsOn: null, daysToStart: null }, t, 'fr'), '');
  assert.equal(clampRakaat(8), 8); assert.equal(clampRakaat(1), 2); assert.equal(clampRakaat(99), 40); assert.equal(clampRakaat(''), null); assert.equal(clampRakaat('x'), null);
});

test('bilan : cartes, Coran et athkar seulement si leur fonction est active', () => {
  const b = { hyear: 1448, start: '', end: '', days: 30, daysPassed: 20, actions: { done: 30, expected: 40, fullDays: 12 }, tarawih: { nights: 15, rakaat: 120, mosque: 10, home: 5 }, quranJuz: 9, athkarDays: 7, note: '' };
  const all = bilanCards(b, t, () => true);
  assert.equal(all.length, 5);
  assert.equal(all[0].value, '30 / 40'); assert.equal(all[1].value, '12 / 20'); assert.match(all[2].label, /120/);
  assert.equal(bilanCards(b, t, (id) => id !== 'athkar' && id !== 'quranplan').length, 3);
});

test('liens des actions : écran de l\'application ou page du site, jamais d\'adresse extérieure', () => {
  assert.deepEqual(itemLink('/coran/18#v10'), { app: '/quran/18?aya=10' });
  assert.deepEqual(itemLink('/coran'), { app: '/quran' });
  assert.deepEqual(itemLink('/learning?tab=athkar'), { app: '/athkar' });
  assert.deepEqual(itemLink('/conferences/ma-conf'), { app: '/talk/ma-conf' });
  assert.deepEqual(itemLink('/collections/abc'), { web: '/collections/abc' });
  for (const bad of ['', 'https://evil.example', '//evil.example', 'javascript:x', '/a b']) assert.equal(itemLink(bad), null, bad);
});

test('pastille et états des enfants', () => {
  assert.equal(badgeText(0), ''); assert.equal(badgeText(3), '3'); assert.equal(badgeText(12), '9+');
  assert.equal(kidStateKey('claimed'), 'kaStClaimed'); assert.equal(kidStateKey('validated'), 'kaStValidated'); assert.equal(kidStateKey('todo'), 'kaStTodo');
});

test('notifications et « Aujourd\'hui » : Ramadan et Kids dans l\'application', () => {
  assert.equal(routeForPath('/ramadan'), '/ramadan');
  assert.equal(routeForPath('/kids'), '/kids');
  assert.deepEqual(todayTarget('/ramadan#rb-t'), { app: '/ramadan?bilan=1' });
});

test('textes Ramadan, bilan, enfants et pastille dans les trois langues', () => {
  const keys = ['rzNav', 'rzTitle', 'rzIntro', 'rzDayOf', 'rzStartsIn', 'rzLogin', 'rzSoon', 'rzSoonTx', 'rzDays', 'rzDay', 'rzToday', 'rzNoItem', 'rzEveryDay', 'rzOpen', 'rzTarawih', 'rzRakaat', 'rzPlace', 'rzMosque', 'rzHome', 'rzLater', 'rzNote',
    'rbEnded', 'rbTitle', 'rbIntro', 'rbActions', 'rbFullDays', 'rbTarawih', 'rbRakaat', 'rbJuz', 'rbAthkar', 'rbPlaces', 'rbNote', 'rbNoteHint', 'rbPrivate', 'rbSave', 'rbSaved',
    'kzTitle', 'kzCount', 'kzParent', 'kzOpen', 'kzOff', 'kzNone', 'kaDone', 'kaWait', 'kaValidated', 'kaParentChecks', 'kaStTodo', 'kaStClaimed', 'kaStValidated', 'kaValidate',
    'kpBadge', 'kpTitle', 'kpCount', 'kpGo', 'kpEmail', 'ivTitle', 'ivRamadan', 'obAthkar'];
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of keys) assert.ok((DICT[l] as Record<string, string>)[k], `${l}.${k}`);
});
