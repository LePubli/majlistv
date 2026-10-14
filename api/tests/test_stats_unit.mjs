// 18 : fonctions de statistiques (provenance, appareil, langue, empreinte du jour) et purge. Prérequis : PG de test (variables de api-test.env).
import assert from 'node:assert/strict';
import { classifySource, deviceOf, langOf, countryOf, fingerprint, isBot, purgeStats, todayStr } from '../src/stats.js';
import { pool } from '../src/db.js';

const ok = (m) => console.log('OK   ' + m);
assert.deepEqual(classifySource('', 'site.fr'), { source: 'direct', domain: null }); ok('sans origine : direct');
assert.equal(classifySource('https://www.google.fr/search?q=x', 'site.fr').source, 'search'); ok('Google : moteur de recherche');
assert.equal(classifySource('https://duckduckgo.com/', 'site.fr').source, 'search');
assert.equal(classifySource('https://l.facebook.com/l.php', 'site.fr').source, 'social');
assert.equal(classifySource('https://t.co/abc', 'site.fr').source, 'social');
assert.equal(classifySource('https://www.youtube.com/watch', 'site.fr').source, 'social'); ok('réseaux sociaux reconnus');
assert.deepEqual(classifySource('https://blog.exemple.org/a', 'site.fr'), { source: 'other', domain: 'blog.exemple.org' }); ok('autre site : domaine conservé');
assert.equal(classifySource('https://www.site.fr/page', 'site.fr').source, 'internal'); ok('même site : ignoré');
assert.equal(classifySource('pas une url', 'site.fr').source, 'direct'); ok('adresse illisible : direct');
assert.equal(classifySource('https://evilgoogle.com/', 'site.fr').source, 'other'); ok('« evilgoogle.com » n\'est pas Google');
assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148'), 'mobile');
assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0) Safari'), 'tablet');
assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14; SM-X) Safari'), 'tablet');
assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel) Mobile Safari'), 'mobile');
assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0) Chrome'), 'desktop'); ok('appareils');
assert.equal(langOf('fr-FR,fr;q=0.9'), 'fr'); assert.equal(langOf('ar'), 'ar'); assert.equal(langOf('de-DE'), 'other'); assert.equal(langOf(undefined), 'other'); ok('langues');
assert.equal(countryOf({ 'cf-ipcountry': 'fr' }), 'FR'); assert.equal(countryOf({ 'cf-ipcountry': 'XX' }), null); assert.equal(countryOf({}), null); assert.equal(countryOf({ 'cf-ipcountry': 'France' }), null); ok('pays (en-tête CDN valide seulement)');
assert.ok(isBot('Googlebot/2.1') && isBot('') && isBot(undefined) && isBot('curl/8') && !isBot('Mozilla/5.0 (Windows NT 10.0) Chrome/126')); ok('robots');
const a = fingerprint('2026-01-01', 'site', '1.2.3.4', 'UA');
assert.equal(a, fingerprint('2026-01-01', 'site', '1.2.3.4', 'UA'));
assert.notEqual(a, fingerprint('2026-01-02', 'site', '1.2.3.4', 'UA'));
assert.notEqual(a, fingerprint('2026-01-01', 'site', '1.2.3.5', 'UA'));
assert.ok(a.length === 22 && !a.includes('1.2.3.4')); ok('empreinte : stable dans la journée, change le lendemain, opaque');

// purge
await pool.query("DELETE FROM stat_seen WHERE kind = 'unit'");
const today = todayStr();
await pool.query("INSERT INTO stat_seen(day, kind, h) VALUES ($1::date - 3, 'unit', 'old'), ($1::date - 1, 'unit', 'recent'), ($1::date, 'unit', 'today')", [today]);
await pool.query("INSERT INTO stat_dim_daily(day, audience, dim, value, views) VALUES ($1::date - 900, 'web', 'unit', 'old', 1), ($1::date - 10, 'web', 'unit', 'keep', 1) ON CONFLICT DO NOTHING", [today]);
await purgeStats();
const seen = (await pool.query("SELECT h FROM stat_seen WHERE kind = 'unit' ORDER BY h")).rows.map((r) => r.h);
assert.deepEqual(seen, ['recent', 'today']); ok('purge : empreintes de plus de 2 jours supprimées');
const dims = (await pool.query("SELECT value FROM stat_dim_daily WHERE dim = 'unit'")).rows.map((r) => r.value);
assert.deepEqual(dims, ['keep']); ok('purge : compteurs de plus de ~26 mois supprimés, récents gardés');
await pool.query("DELETE FROM stat_seen WHERE kind = 'unit'"); await pool.query("DELETE FROM stat_dim_daily WHERE dim = 'unit'");
await pool.end();
console.log('TOUT OK');
