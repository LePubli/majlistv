// Amélioration 4.2 : règles pures des événements en direct (adresse, phase, fichier agenda).
import assert from 'node:assert/strict';
import { parseLiveUrl, phaseOf, buildIcs, icsDate, publicShape } from '../src/modules/events/lib.js';

// Adresses
assert.deepEqual(parseLiveUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { source: 'youtube', ref: 'dQw4w9WgXcQ' });
assert.deepEqual(parseLiveUrl('https://youtu.be/dQw4w9WgXcQ?t=5'), { source: 'youtube', ref: 'dQw4w9WgXcQ' });
assert.deepEqual(parseLiveUrl('https://www.youtube.com/live/dQw4w9WgXcQ'), { source: 'youtube', ref: 'dQw4w9WgXcQ' });
assert.deepEqual(parseLiveUrl('https://vimeo.com/event/123456'), { source: 'vimeo', ref: '123456' });
assert.deepEqual(parseLiveUrl('https://vimeo.com/987654321'), { source: 'vimeo', ref: '987654321' });
for (const bad of ['', 'n’importe quoi', 'https://example.org/x', 'ftp://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=court', 'https://dailymotion.com/video/x7tgad0']) assert.equal(parseLiveUrl(bad), null, bad);

// Phase : annoncé → direct ouvert 10 min avant → terminé à la fin prévue
const ev = { starts_at: '2026-12-01T18:00:00Z', duration_minutes: 60 };
const at = (s) => new Date(s);
assert.equal(phaseOf(ev, at('2026-12-01T17:49:59Z'), 10), 'upcoming');
assert.equal(phaseOf(ev, at('2026-12-01T17:50:00Z'), 10), 'live');
assert.equal(phaseOf(ev, at('2026-12-01T18:59:59Z'), 10), 'live');
assert.equal(phaseOf(ev, at('2026-12-01T19:00:00Z'), 10), 'ended');
assert.equal(phaseOf(ev, at('2026-12-01T17:55:00Z'), 0), 'upcoming');

// Forme publique : le lien du direct est caché avant l'ouverture
const row = { id: 'e1', title: 'T', speaker: 'S', description: 'D', language: 'fr', source: 'youtube', video_ref: 'dQw4w9WgXcQ', starts_at: '2099-01-01T10:00:00Z', duration_minutes: 30, status: 'published' };
assert.equal(publicShape(row).video, undefined);
assert.deepEqual(publicShape(row, { privileged: true }).video, { source: 'youtube', ref: 'dQw4w9WgXcQ' });
assert.equal(publicShape({ ...row, starts_at: '2000-01-01T10:00:00Z', duration_minutes: 99999 > 600 ? 600 : 1 }, { now: new Date('2000-01-01T10:05:00Z') }).phase, 'live');
assert.ok(publicShape({ ...row, starts_at: '2000-01-01T10:00:00Z' }, { now: new Date('2000-01-01T10:05:00Z') }).video);
assert.equal(publicShape({ ...row, status: 'cancelled' }).phase, 'cancelled');

// Fichier agenda
assert.equal(icsDate('2026-12-01T18:00:00+01:00'), '20261201T170000Z');
const ics = buildIcs({ ...row, title: 'Titre; avec, virgule', description: 'Ligne 1\nLigne 2', starts_at: '2026-12-01T18:00:00+01:00', duration_minutes: 90 }, { url: 'https://exemple.fr/events/e1', now: new Date('2026-11-07T10:00:00Z') });
assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
assert.match(ics, /DTSTART:20261201T170000Z\r\n/); assert.match(ics, /DTEND:20261201T183000Z\r\n/);
assert.match(ics, /SUMMARY:Titre\; avec\\, virgule\r\n/);
assert.ok(ics.includes('Ligne 1\\n\\nLigne 2') || ics.includes('Ligne 1\\nLigne 2'), 'retours à la ligne échappés');
assert.match(ics, /TRIGGER:-PT1H/); assert.match(ics, /STATUS:CONFIRMED/);
assert.match(buildIcs({ ...row, status: 'cancelled' }), /STATUS:CANCELLED/);
// Lignes pliées à 75 octets, sans couper un caractère accentué
const long = buildIcs({ ...row, description: 'é'.repeat(200) });
for (const l of long.split('\r\n')) assert.ok(Buffer.byteLength(l) <= 75, `ligne trop longue : ${Buffer.byteLength(l)}`);
assert.ok(!/�/.test(long));
console.log('test_events_lib : TOUT OK');
