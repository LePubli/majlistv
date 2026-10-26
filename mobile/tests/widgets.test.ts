// Widgets Android (étape 25) : données et textes affichés (Prière, Réviser, Citation), sans dépendance native.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePrefs } from '../src/lib/prayer/prayerLogic';
import { WIDGET_LINKS, citationFresh, citationView, localDay, parseCitation, parseRevision, prayerView, reviseView, type PrayerSnap } from '../src/widgets/model';

const prefs = resolvePrefs({ loc: { mode: 'city', city: 'lille' } }, {}, 'Europe/Paris') as unknown as NonNullable<PrayerSnap['prefs']>;
const snap = (over: Partial<PrayerSnap> = {}): PrayerSnap => ({ on: true, enabled: true, prefs, locale: 'fr', ...over });
const at = (iso: string) => new Date(iso).getTime();

test('prayerView : fonction ou prière coupée → message, jamais d’exception', () => {
  const now = at('2026-10-26T10:00:00Z');
  for (const s of [null, snap({ on: false }), snap({ enabled: false }), snap({ prefs: null })]) {
    const v = prayerView(s, now);
    assert.equal(v.kind, 'off');
  }
  assert.match((prayerView(null, now) as { message: string }).message, /prière/i);
});

test('prayerView : prochaine prière, cinq horaires du jour, une seule mise en évidence', () => {
  const now = at('2026-10-26T10:00:00Z'); // 11 h à Lille : Dhuhr (≈ 13 h) est la suivante
  const v = prayerView(snap(), now);
  assert.equal(v.kind, 'ready');
  if (v.kind !== 'ready') return;
  assert.equal(v.next.id, 'dhuhr');
  assert.equal(v.rows.length, 5);
  assert.deepEqual(v.rows.map((r) => r.id), ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
  assert.equal(v.rows.filter((r) => r.next).length, 1);
  assert.equal(v.rows.find((r) => r.id === 'fajr')?.past, true);
  assert.equal(v.rows.find((r) => r.id === 'asr')?.past, false);
  assert.match(v.next.time, /^\d{2}:\d{2}$/);
  assert.equal(v.next.name, v.rows.find((r) => r.id === 'dhuhr')?.name);
  assert.equal(v.place, 'Lille');
});

test('prayerView : après Isha, la prochaine est Fajr du lendemain (liste du jour inchangée)', () => {
  const v = prayerView(snap(), at('2026-10-26T21:30:00Z'));
  assert.equal(v.kind, 'ready');
  if (v.kind !== 'ready') return;
  assert.equal(v.next.id, 'fajr');
  assert.ok(v.rows.every((r) => !r.next)); // la prochaine n'est pas dans les horaires d'aujourd'hui
  assert.ok(v.rows.every((r) => r.past));
});

test('prayerView : langues (arabe)', () => {
  const v = prayerView(snap({ locale: 'ar' }), at('2026-10-26T10:00:00Z'));
  assert.equal(v.kind, 'ready');
  if (v.kind === 'ready') assert.match(v.next.name, /[؀-ۿ]/);
});

test('reviseView : états connecté, abonnement, rien à réviser, liste', () => {
  const ok = reviseView({ state: 'ok', total: 5, week: 3, titles: ['A', 'B', 'C'], at: 1 }, 'fr');
  assert.equal(ok.kind, 'ok'); assert.equal(ok.number, '5'); assert.deepEqual(ok.titles, ['A', 'B']); assert.match(ok.week, /3/); assert.match(ok.label, /5/);
  const none = reviseView({ state: 'ok', total: 0, week: 0, titles: [], at: 1 }, 'fr');
  assert.equal(none.kind, 'none'); assert.equal(none.week, '');
  assert.equal(reviseView({ state: 'login', total: 0, week: 0, titles: [], at: 1 }, 'fr').kind, 'login');
  assert.equal(reviseView(null, 'fr').kind, 'login');
  assert.equal(reviseView({ state: 'tier', total: 0, week: 0, titles: [], at: 1 }, 'en').kind, 'tier');
  assert.equal(reviseView({ state: 'error', total: 0, week: 0, titles: [], at: 1 }, 'ar').kind, 'error');
  assert.match(reviseView({ state: 'ok', total: 2, week: 0, titles: [], at: 1 }, 'en').label, /review/);
});

test('parseRevision : réponse du serveur lue sans jamais planter', () => {
  assert.deepEqual(parseRevision({ total: 7, items: [{ title: 'x' }, { title: '' }, { id: 1 }, { title: 'y' }], upcoming: { week: 4 } }, 9), { state: 'ok', total: 7, week: 4, titles: ['x', 'y'], at: 9 });
  assert.equal(parseRevision({ items: [{ title: 'a' }] }, 1).total, 1); // total absent : on compte les éléments
  assert.deepEqual(parseRevision(null, 2), { state: 'ok', total: 0, week: 0, titles: [], at: 2 });
  assert.equal(parseRevision({ total: -3, upcoming: { week: 'x' } }, 1).total, 0);
});

test('citationView : extrait court / grand, texte arabe, absence', () => {
  const long = 'mot '.repeat(80).trim();
  const c = { text: long, textAr: 'ن'.repeat(300), attribution: 'Coran 2:286', day: '2026-10-26' };
  const small = citationView(c, 'fr', 'small');
  assert.equal(small.kind, 'ok'); assert.ok(small.text.length <= 131); assert.ok(small.text.endsWith('…')); assert.equal(small.textAr, '');
  const large = citationView(c, 'fr', 'large');
  assert.ok(large.textAr.length > 0 && large.textAr.length <= 141); assert.ok(large.text.length <= 221);
  assert.equal(citationView({ ...c, text: 'Court.' }, 'fr', 'small').text, 'Court.');
  const none = citationView(null, 'en', 'small');
  assert.equal(none.kind, 'none'); assert.match(none.text, /quote/i);
});

test('parseCitation / citationFresh / localDay', () => {
  assert.deepEqual(parseCitation({ text: ' Salut ', textAr: ' ', attribution: 'X' }, '2026-10-26'), { text: 'Salut', textAr: null, attribution: 'X', day: '2026-10-26' });
  assert.equal(parseCitation(null, 'd'), null);
  assert.equal(parseCitation({ text: '  ' }, 'd'), null);
  assert.equal(parseCitation({ text: 5 }, 'd'), null);
  const c = parseCitation({ text: 'a' }, '2026-10-26');
  assert.equal(citationFresh(c, '2026-10-26'), true);
  assert.equal(citationFresh(c, '2026-10-27'), false);
  assert.equal(citationFresh(null, '2026-10-27'), false);
  assert.match(localDay(Date.now()), /^\d{4}-\d{2}-\d{2}$/);
});

test('liens des widgets : schéma de l’application', () => {
  for (const l of Object.values(WIDGET_LINKS)) assert.ok(l.startsWith('mejlisstv://'));
});
