// Événements en direct (application) : logique pure, textes dans les 3 langues, branchements. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { APP_DICT } from '../src/lib/i18n';
import { calendarUrl, fmtCountdown, fmtWhen, isOpenEvent, nextRefreshMs } from '../src/lib/events';
import { buildEmbedHtml, validEmbedId } from '../src/lib/embed';

const r = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('décompte lisible', () => {
  assert.equal(fmtCountdown(2 * 86400000 + 3 * 3600000 + 15 * 60000), '2 j 03 h 15 min');
  assert.equal(fmtCountdown(3 * 3600000 + 5 * 60000), '3 h 05 min');
  assert.equal(fmtCountdown(12 * 60000 + 5000, { d: 'd', h: 'h', m: 'min', s: 's' }), '12 min 05 s');
  assert.equal(fmtCountdown(-5000), '0 min 00 s'); assert.equal(fmtCountdown(NaN), '0 min 00 s');
});

test('date dans la langue choisie', () => {
  const iso = '2026-12-05T19:00:00.000Z';
  assert.match(fmtWhen(iso, 'fr'), /décembre/); assert.match(fmtWhen(iso, 'en'), /December/);
  assert.ok(fmtWhen(iso, 'xx').length > 5, 'langue inconnue : français par défaut');
});

test('fichier agenda et phases', () => {
  assert.equal(calendarUrl('https://api.exemple.fr/', 'abc-1'), 'https://api.exemple.fr/events/abc-1/calendar.ics');
  assert.ok(isOpenEvent({ phase: 'upcoming' }) && isOpenEvent({ phase: 'live' }) && !isOpenEvent({ phase: 'ended' }) && !isOpenEvent({ phase: 'cancelled' }));
});

test('relecture de la fiche : à l\'ouverture, puis chaque minute, jamais une fois fini', () => {
  const now = Date.parse('2026-12-05T18:00:00Z');
  assert.equal(nextRefreshMs({ phase: 'ended', startsAt: '2026-12-01T10:00:00Z' }, now), null);
  assert.equal(nextRefreshMs({ phase: 'cancelled', startsAt: '2026-12-09T10:00:00Z' }, now), null);
  assert.equal(nextRefreshMs({ phase: 'live', startsAt: '2026-12-05T17:55:00Z' }, now), 60000);
  assert.equal(nextRefreshMs({ phase: 'upcoming', startsAt: '2026-12-05T18:00:20Z' }, now), 21000);
  assert.equal(nextRefreshMs({ phase: 'upcoming', startsAt: '2026-12-09T18:00:00Z' }, now), 60000);
  assert.equal(nextRefreshMs({ phase: 'upcoming', startsAt: '2026-12-05T18:00:00Z' }, now), 5000);
});

test('lecteur : identifiants du serveur acceptés, douteux refusés', () => {
  assert.ok(validEmbedId('youtube', 'dQw4w9WgXcQ') && validEmbedId('vimeo', '123456'));
  assert.ok(!validEmbedId('youtube', 'x"onload="a') && !validEmbedId('vimeo', 'abc') && !validEmbedId('dailymotion', ''));
  assert.match(buildEmbedHtml('youtube', 'dQw4w9WgXcQ', { origin: 'https://exemple.fr', auto: true }), /dQw4w9WgXcQ/);
});

test('textes : toutes les clés utilisées existent en fr, en et ar', () => {
  const used = new Set<string>();
  for (const f of ['../src/app/events/index.tsx', '../src/app/events/[id].tsx', '../src/components/EventParts.tsx', '../src/components/HomeBands.tsx', '../src/components/MenuDrawer.tsx']) {
    for (const m of r(f).matchAll(/\bt\('(evn\.[A-Za-z]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 25, `${used.size} textes utilisés`);
  for (const lang of ['fr', 'en', 'ar'] as const) for (const k of used) assert.ok((APP_DICT[lang] as Record<string, string>)[k], `${k} manquant en ${lang}`);
  for (const [k, v] of [['evn.soon', '{t}'], ['evn.starts', '{d}'], ['evn.duration', '{n}']] as const)
    for (const lang of ['fr', 'en', 'ar'] as const) assert.ok((APP_DICT[lang] as Record<string, string>)[k].includes(v), `${k} sans ${v} en ${lang}`);
});

test('branchements : écrans déclarés, menu, accueil, aucune dépendance native ajoutée', () => {
  const layout = r('../src/app/_layout.tsx');
  assert.match(layout, /name="events\/index"/); assert.match(layout, /name="events\/\[id\]"/);
  assert.match(r('../src/components/MenuDrawer.tsx'), /key: 'events'.*feat\('events'\)/);
  assert.match(r('../src/app/(tabs)/index.tsx'), /<EventsBand \/>/);
  for (const f of ['../src/app/events/index.tsx', '../src/app/events/[id].tsx']) assert.ok(existsSync(new URL(f, import.meta.url)));
  // Le lecteur n'est créé qu'en phase « live » avec un lien donné par le serveur
  assert.match(r('../src/app/events/[id].tsx'), /ev\?\.phase === 'live' && !!ev\.video && validEmbedId/);
  // Pas de nouveau module natif : la mise à jour passe en ligne (sans nouvel APK)
  const pkg = JSON.parse(r('../package.json')); assert.ok(!('expo-calendar' in (pkg.dependencies || {})));
});
