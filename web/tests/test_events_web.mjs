// Événements en direct (étape 2) : textes FR/EN/AR, pages, décompte, intégration. node tests/test_events_web.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { countdownParts, fmtCountdown, embedSrc, toLocalInput, fromLocalInput } from '../lib/events.js';
const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const files = ['../app/events/page.js', '../app/events/[id]/page.js', '../app/studio/(module-events)/events/page.js', '../components/EventBits.js', '../components/EventsBand.js', '../modules/events/module.js'];
for (const f of files) assert.ok(existsSync(new URL(f, import.meta.url)), `${f} manquant`);

// Tous les textes utilisés existent en fr, en et ar
const i18n = r('../lib/i18n.js'); const keys = new Set();
for (const f of files) for (const m of r(f).matchAll(/\bt\('(evn[A-Za-z]+)'\)|label: '(evn[A-Za-z]+)'/g)) keys.add(m[1] || m[2]);
for (const k of ['evnLive', 'evnSoon', 'evnEnded', 'evnCancelled', 'evnD', 'evnH', 'evnM', 'evnS', 'evnStDraft', 'evnStPub', 'evnStCanc']) keys.add(k);
assert.ok(keys.size >= 35, `${keys.size} textes utilisés`);
for (const k of keys) assert.equal(i18n.split(`${k}:`).length - 1, 3, `texte ${k} manquant en fr / en / ar`);
// Les textes à variables gardent leurs variables dans les 3 langues
for (const [k, v] of [['evnSoon', '{t}'], ['evnStarts', '{d}'], ['evnDuration', '{n}'], ['evnLiveFrame', '{title}'], ['evnReminders', '{n}']]) {
  const parts = i18n.split(`${k}: "`).slice(1).map((x) => x.split('",')[0]);
  assert.equal(parts.length, 3, k); for (const p of parts) assert.ok(p.includes(v), `${k} sans ${v}`);
}
// Fonction, module, menus
assert.match(r('../lib/modules.js'), /'events'/); assert.match(r('../modules/events/module.js'), /roles: \['organizer', 'admin'\]/);
assert.match(r('../components/MemberShell.js'), /events: \{ key: 'events', href: '\/events'/);
assert.equal(r('../lib/navcfg.js'), readFileSync(new URL('../../api/src/navcfg.js', import.meta.url), 'utf8'), 'navcfg identique côté API et site');
assert.match(r('../app/page.js'), /<EventsBand \/>/);

// Décompte
assert.deepEqual(countdownParts(90061000), { d: 1, h: 1, m: 1, s: 1 });
assert.deepEqual(countdownParts(-5000), { d: 0, h: 0, m: 0, s: 0 });
assert.equal(fmtCountdown(2 * 86400000 + 3 * 3600000 + 15 * 60000), '2 j 03 h 15 min');
assert.equal(fmtCountdown(3 * 3600000 + 5 * 60000), '3 h 05 min');
assert.equal(fmtCountdown(12 * 60000 + 5000, { d: 'd', h: 'h', m: 'min', s: 's' }), '12 min 05 s');

// Intégration : seulement des domaines déjà autorisés par la politique de sécurité, et refus des références douteuses
assert.equal(embedSrc({ source: 'youtube', ref: 'dQw4w9WgXcQ' }), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&playsinline=1');
assert.equal(embedSrc({ source: 'vimeo', ref: '123456' }), 'https://player.vimeo.com/video/123456?autoplay=1');
for (const bad of [null, {}, { source: 'youtube', ref: 'court' }, { source: 'youtube', ref: 'x"onload="a' }, { source: 'vimeo', ref: 'abc' }, { source: 'autre', ref: 'dQw4w9WgXcQ' }]) assert.equal(embedSrc(bad), null);
const csp = r('../middleware.js'); assert.match(csp, /youtube-nocookie\.com/); assert.match(csp, /player\.vimeo\.com/);
// Le lecteur n'apparaît qu'en phase « live »
assert.match(r('../app/events/[id]/page.js'), /ev\.phase === 'live' \? embedSrc\(ev\.video\)/);
// Heure locale ↔ UTC
const iso = '2026-12-05T19:00:00.000Z'; assert.equal(fromLocalInput(toLocalInput(iso)), iso);
console.log('OK test_events_web');
