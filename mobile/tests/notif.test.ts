// 22b-4 : page ouverte au toucher d'une notification + planning des rappels de prière + copie du calcul du site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { routeForPath } from '../src/lib/notifRoute';
import { planPrayers, PLAN_DAYS } from '../src/lib/prayerPlan';
import { resolvePrefs, statusAt, buildSchedule } from '../src/lib/prayer/prayerLogic';
import { registerMedia, playingMedia } from '../src/lib/mediaRegistry';
import { APP_DICT } from '../src/lib/i18n';

test('routeForPath : chemins envoyés par le serveur', () => {
  assert.equal(routeForPath('/conferences/3f2a1b9c-1111-2222-3333-444455556666'), '/talk/3f2a1b9c-1111-2222-3333-444455556666');
  assert.equal(routeForPath('/conferences/ma-conference'), '/talk/ma-conference');
  assert.equal(routeForPath('/collections/abc-123'), '/collections/abc-123');
  assert.equal(routeForPath('/intervenants/cheikh-x'), '/speaker/cheikh-x');
  assert.equal(routeForPath('/learning'), '/learn');
  assert.equal(routeForPath('/'), '/');
  assert.equal(routeForPath('/conferences/x?utm=1#a'), '/talk/x');
});

test('routeForPath : jamais d\'adresse extérieure ni de valeur étrange', () => {
  for (const bad of [undefined, null, 42, '', 'https://evil.example/x', '//evil.example', 'javascript:alert(1)', '/conferences/', '/conferences/../../etc', '/conferences/a b', '/conferences/%E0%A4%A', '/inconnu', '/' + 'a'.repeat(400)]) {
    assert.equal(routeForPath(bad), '/', String(bad).slice(0, 30));
  }
});

const cfg = { defaultEnabled: true, pill: true, method: 'uoif', asr: 'standard', blockMinutes: 10, maxBlockMinutes: 30, city: 'paris' };
const prefs = resolvePrefs(null, cfg, 'Europe/Paris');
const T0 = Date.UTC(2026, 9, 22, 8, 0); // 22/10/2026, 10 h à Paris

test('planPrayers : 5 prières par jour sur 7 jours, futures, ordonnées, sans doublon', () => {
  const plan = planPrayers(T0, prefs);
  assert.ok(plan.length >= 30 && plan.length <= PLAN_DAYS * 5, `nombre : ${plan.length}`);
  assert.ok(plan.every((p) => p.at > T0));
  for (let i = 1; i < plan.length; i += 1) assert.ok(plan[i].at > plan[i - 1].at);
  assert.equal(new Set(plan.map((p) => p.key)).size, plan.length);
  assert.ok(plan.every((p) => ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].includes(p.id)), 'jamais le lever du soleil');
  assert.equal(plan[0].id, 'dhuhr'); // à 10 h, la prochaine est Dhuhr
});

test('planPrayers : seulement les prières cochées', () => {
  const p = resolvePrefs({ prayers: { fajr: false, dhuhr: true, asr: false, maghrib: false, isha: false } }, cfg, 'Europe/Paris');
  const plan = planPrayers(T0, p);
  assert.ok(plan.length >= 7 && plan.every((x) => x.id === 'dhuhr'));
  const none = resolvePrefs({ prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false } }, cfg, 'Europe/Paris');
  assert.equal(planPrayers(T0, none).length, 0);
});

test('planPrayers : même clé que celle de la pause (une prière = un rappel = une pause)', () => {
  const plan = planPrayers(T0, prefs);
  const items = buildSchedule(T0, prefs);
  const st = statusAt(items, plan[0].at + 5 * 60_000, prefs);
  assert.equal(st.current?.key, plan[0].key);
});

test('planPrayers : change d\'heure d\'été sans trou ni doublon (nuit du 24 au 25/10/2026)', () => {
  const plan = planPrayers(Date.UTC(2026, 9, 23, 8, 0), prefs);
  const days = new Map<string, number>();
  for (const p of plan) { const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(p.at); days.set(d, (days.get(d) || 0) + 1); }
  for (const [d, n] of days) if (d >= '2026-10-24' && d <= '2026-10-26') assert.equal(n, 5, `${d} : ${n} prières`);
});

test('copie du calcul du site : identique à web/lib (relancer scripts/import-prayer.mjs sinon)', () => {
  const web = join(__dirname, '../../web/lib');
  if (!existsSync(web)) return; // dépôt réduit à mobile/ : rien à comparer
  for (const f of ['prayerTimes.js', 'prayerCities.js', 'prayerLogic.js']) {
    const copy = readFileSync(join(__dirname, '../src/lib/prayer', f), 'utf8').split('\n').slice(1).join('\n');
    assert.equal(copy, readFileSync(join(web, f), 'utf8'), `${f} n'est plus à jour`);
  }
});

test('mediaRegistry : seuls les lecteurs qui jouent sont mis en pause ; retrait au démontage', () => {
  let a = true; const log: string[] = [];
  const off1 = registerMedia({ isPlaying: () => a, pause: () => log.push('a'), play: () => undefined });
  const off2 = registerMedia({ isPlaying: () => false, pause: () => log.push('b'), play: () => undefined });
  const off3 = registerMedia({ isPlaying: () => { throw new Error('lecteur détruit'); }, pause: () => undefined, play: () => undefined });
  assert.equal(playingMedia().length, 1);
  playingMedia().forEach((m) => m.pause());
  assert.deepEqual(log, ['a']);
  a = false; assert.equal(playingMedia().length, 0);
  off1(); off2(); off3();
});

test('textes : toutes les clés « np.* » existent en français, anglais et arabe, avec les mêmes variables', () => {
  const keys = Object.keys(APP_DICT.fr).filter((k) => k.startsWith('np.'));
  assert.ok(keys.length >= 13);
  for (const k of keys) for (const l of ['en', 'ar'] as const) {
    const v = (APP_DICT[l] as Record<string, string>)[k];
    assert.ok(v && v.length > 1, `${l} ${k}`);
    const vars = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(vars(v), vars((APP_DICT.fr as Record<string, string>)[k]), `variables ${l} ${k}`);
  }
});
