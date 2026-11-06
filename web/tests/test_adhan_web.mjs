// Adhan sur le site : réglage, prière à annoncer, catalogue identique à celui de l'application, fichiers présents.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ADHANS, GRACE_MS, adhanUrl, dueAdhan, pickAdhan, readAdhanPrefs } from '../lib/adhanWeb.js';
assert.deepEqual(readAdhanPrefs(null), { mode: 'silent', id: 'adhan-1' }, 'silencieux par défaut');
assert.deepEqual(readAdhanPrefs('pas du json'), { mode: 'silent', id: 'adhan-1' });
assert.deepEqual(readAdhanPrefs(JSON.stringify({ mode: 'adhan', id: 'adhan-3' })), { mode: 'adhan', id: 'adhan-3' });
assert.equal(readAdhanPrefs(JSON.stringify({ mode: 'adhan', id: 'inconnu' })).id, 'adhan-1');
assert.equal(readAdhanPrefs(JSON.stringify({ mode: 'bruit' })).mode, 'silent');
assert.equal(pickAdhan('adhan-2').file, 'adhan_2.mp3'); assert.equal(adhanUrl(pickAdhan('adhan-2')), '/adhan/adhan_2.mp3');

const T = Date.UTC(2026, 10, 6, 12, 0);
const items = [{ id: 'fajr', at: T - 6 * 3600e3 }, { id: 'sunrise', at: T - 5 * 3600e3 }, { id: 'dhuhr', at: T }, { id: 'asr', at: T + 3 * 3600e3 }];
const all = { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true };
assert.equal(dueAdhan(items, T + 5_000, all, {})?.id, 'dhuhr', 'sonne dans les secondes qui suivent');
assert.equal(dueAdhan(items, T - 1_000, all, {}), null, 'pas avant l\'heure');
assert.equal(dueAdhan(items, T + GRACE_MS + 1, all, {}), null, 'pas pour une page ouverte longtemps après');
assert.equal(dueAdhan(items, T + 5_000, { ...all, dhuhr: false }, {}), null, 'prière décochée');
const d = dueAdhan(items, T + 5_000, all, {});
assert.equal(dueAdhan(items, T + 6_000, all, { [d.key]: T }), null, 'une seule fois par prière');
assert.equal(dueAdhan([{ id: 'sunrise', at: T }], T + 1, { sunrise: true }, {}), null, 'le lever du soleil n\'est pas une prière');

const mob = JSON.parse(readFileSync(new URL('../../mobile/assets/sounds/adhans.json', import.meta.url), 'utf8'));
assert.deepEqual(ADHANS, mob.map(({ id, name, file }) => ({ id, name, file })), 'même catalogue que l\'application (mobile/assets/sounds/adhans.json)');
for (const a of ADHANS) assert.ok(existsSync(new URL(`../public/adhan/${a.file}`, import.meta.url)), `public/adhan/${a.file}`);
const i18n = readFileSync(new URL('../lib/i18n.js', import.meta.url), 'utf8');
for (const k of ['adhTitle', 'adhHelp', 'adhSilent', 'adhOn', 'adhChoose', 'adhListen', 'adhStop', 'adhPlaying', 'adhNotif', 'adhNotifOn']) assert.equal(i18n.split(`${k}:`).length - 1, 3, `${k} en fr/en/ar`);
console.log('OK test_adhan_web');
