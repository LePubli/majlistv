// 22b-5 : logique pure de la mise à jour de l'application + cohérence de la configuration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLatest, notesFor, formatSize, shouldCheck, bannerHidden, installedCode, progressRatio, isTrustedDownload, CHECK_EVERY_MS } from '../src/lib/appUpdate';
import { APP_DICT } from '../src/lib/i18n';

const API = 'https://api-majlisstv.le-publicitaire.fr';
const sha = 'a'.repeat(64);
const good = { latest: { version: '0.5.0', versionCode: 1012, size: 50_000_000, sha256: sha, notes: { fr: 'Nouveautés', en: 'News' }, publishedAt: '2026-10-22T10:00:00Z', downloadUrl: `${API}/app/download/1012` }, updateAvailable: true, required: false };

test('parseLatest : réponse valide', () => {
  const r = parseLatest(good, API)!;
  assert.equal(r.latest!.versionCode, 1012); assert.equal(r.updateAvailable, true); assert.equal(r.required, false);
  assert.deepEqual(r.latest!.notes, { fr: 'Nouveautés', en: 'News' });
});

test('parseLatest : aucune version publiée', () => {
  assert.deepEqual(parseLatest({ latest: null, updateAvailable: false, required: false }, API), { latest: null, updateAvailable: false, required: false });
});

test('parseLatest : réponses invalides ou dangereuses refusées', () => {
  const bad = (patch: Record<string, unknown>) => parseLatest({ ...good, latest: { ...good.latest, ...patch } }, API);
  assert.equal(parseLatest(null, API), null); assert.equal(parseLatest('x', API), null); assert.equal(parseLatest(42, API), null);
  assert.equal(bad({ versionCode: 0 }), null); assert.equal(bad({ versionCode: 1.5 }), null); assert.equal(bad({ size: 0 }), null);
  assert.equal(bad({ sha256: 'xyz' }), null); assert.equal(bad({ sha256: 'A'.repeat(64) }), null);
  assert.equal(bad({ version: '../x' }), null); assert.equal(bad({ version: '' }), null);
  assert.equal(bad({ downloadUrl: 'https://evil.example/app.apk' }), null, 'autre serveur refusé');
  assert.equal(bad({ downloadUrl: 'http://api-majlisstv.le-publicitaire.fr/app/download/1' }), null, 'http refusé pour un serveur https');
  assert.equal(bad({ downloadUrl: 'javascript:alert(1)' }), null);
  assert.equal(bad({ downloadUrl: 42 }), null);
});

test('parseLatest : notes tronquées, types étranges ignorés', () => {
  const r = parseLatest({ ...good, latest: { ...good.latest, notes: { fr: 'x'.repeat(5000), en: 12, ar: null } } }, API)!;
  assert.equal(r.latest!.notes.fr!.length, 1500); assert.equal(r.latest!.notes.en, undefined); assert.equal(r.latest!.notes.ar, undefined);
});

test('isTrustedDownload : serveur de test en http accepté seulement s\'il est lui-même en http', () => {
  assert.equal(isTrustedDownload('http://127.0.0.1:3055/x', 'http://127.0.0.1:3055'), true);
  assert.equal(isTrustedDownload('http://127.0.0.1:3055/x', API), false);
  assert.equal(isTrustedDownload('not a url', API), false);
});

test('notesFor : langue de la personne, sinon français, sinon une autre', () => {
  assert.equal(notesFor({ fr: 'a', en: 'b' }, 'en'), 'b');
  assert.equal(notesFor({ fr: 'a' }, 'ar'), 'a');
  assert.equal(notesFor({ en: 'b' }, 'ar'), 'b');
  assert.equal(notesFor({}, 'fr'), '');
});

test('formatSize', () => {
  assert.equal(formatSize(50_660_000, 'fr'), '48,3 Mo');
  assert.equal(formatSize(50_660_000, 'en'), '48.3 MB');
  assert.equal(formatSize(300 * 1048576, 'fr'), '300 Mo');
  assert.equal(formatSize(0), ''); assert.equal(formatSize(NaN), '');
});

test('shouldCheck : au plus toutes les 6 h', () => {
  assert.equal(shouldCheck(null, 1000), true);
  assert.equal(shouldCheck(1000, 1000 + CHECK_EVERY_MS - 1), false);
  assert.equal(shouldCheck(1000, 1000 + CHECK_EVERY_MS), true);
  assert.equal(shouldCheck(5000, 100), true, 'horloge reculée');
  assert.equal(shouldCheck(1000, 1001, true), true);
});

test('bannerHidden : version écartée ne revient pas, sauf si obligatoire', () => {
  const l = good.latest;
  assert.equal(bannerHidden(null, null, false), true);
  assert.equal(bannerHidden(null, l, false), false);
  assert.equal(bannerHidden(1012, l, false), true);
  assert.equal(bannerHidden(1011, l, false), false, 'une version plus récente revient');
  assert.equal(bannerHidden(1012, l, true), false);
});

test('installedCode / progressRatio', () => {
  assert.equal(installedCode('1012'), 1012); assert.equal(installedCode(null), 0); assert.equal(installedCode('abc'), 0); assert.equal(installedCode('0'), 0);
  assert.equal(progressRatio(50, 100, 999), 0.5); assert.equal(progressRatio(50, -1, 100), 0.5); assert.equal(progressRatio(500, 100, 100), 1); assert.equal(progressRatio(5, -1, 0), 0);
});

test('textes « au.* » présents en français, anglais et arabe', () => {
  const keys = Object.keys(APP_DICT.fr).filter((k) => k.startsWith('au.'));
  assert.ok(keys.length >= 15);
  for (const l of ['en', 'ar'] as const) for (const k of keys) assert.ok((APP_DICT[l] as Record<string, string>)[k], `${l}:${k}`);
});

test('configuration : permission d\'installation, numéro de build et notes de version', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')).expo;
  assert.ok(app.android.permissions.includes('android.permission.REQUEST_INSTALL_PACKAGES'));
  assert.ok(Number.isInteger(app.android.versionCode) && app.android.versionCode >= 3);
  const notes = JSON.parse(readFileSync(join(__dirname, '..', 'release-notes.json'), 'utf8'));
  for (const l of ['fr', 'en', 'ar']) assert.ok(typeof notes[l] === 'string' && notes[l].length > 10 && notes[l].length <= 1500, l);
  const cfg = require('../app.config.js');
  const prev = process.env.GITHUB_RUN_NUMBER;
  process.env.GITHUB_RUN_NUMBER = '57';
  assert.equal(cfg({ config: app }).android.versionCode, 1057);
  delete process.env.GITHUB_RUN_NUMBER;
  assert.equal(cfg({ config: app }).android.versionCode, app.android.versionCode);
  if (prev) process.env.GITHUB_RUN_NUMBER = prev;
});

// ---- Partie 2 : mises à jour du contenu (expo-updates)
test('runtimeVersion : stable, change avec le natif, pas avec le reste', () => {
  const { runtimeVersionFor, nativeFingerprint } = require('../runtimeVersion.js');
  const app = { version: '0.5.0', android: { package: 'x.y', permissions: ['B', 'A'] }, plugins: ['p'] };
  const pkg = { dependencies: { b: '1', a: '2' } };
  const rv = runtimeVersionFor(pkg, app);
  assert.match(rv, /^0\.5\.0-[0-9a-f]{8}$/);
  assert.equal(runtimeVersionFor({ dependencies: { a: '2', b: '1' } }, { ...app, android: { ...app.android, permissions: ['A', 'B'] } }), rv, "l'ordre ne compte pas");
  assert.notEqual(runtimeVersionFor({ dependencies: { a: '2', b: '1', c: '1' } }, app), rv, 'nouvelle bibliothèque');
  assert.notEqual(runtimeVersionFor(pkg, { ...app, android: { ...app.android, permissions: ['A', 'B', 'C'] } }), rv, 'nouvelle permission');
  assert.notEqual(runtimeVersionFor(pkg, { ...app, plugins: ['p', 'q'] }), rv, 'nouveau plugin');
  assert.equal(nativeFingerprint({ dependencies: {}, devDependencies: { z: '1' } }, app), nativeFingerprint({ dependencies: {} }, app), 'devDependencies ignorées');
  assert.match(rv, /^\d{1,3}\.\d{1,3}\.\d{1,3}(-[0-9A-Za-z.]{1,20})?$/, 'accepté par le serveur');
});

test('configuration expo-updates : adresse du serveur, démarrage sans attente, version d\'exécution calculée', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')).expo;
  assert.equal(app.updates.url, `${app.extra.apiUrl}/app/updates/manifest`);
  assert.equal(app.updates.checkAutomatically, 'ON_LOAD'); assert.equal(app.updates.fallbackToCacheTimeout, 0);
  const cfg = require('../app.config.js')({ config: app });
  assert.match(cfg.runtimeVersion, /^0\.\d+\.\d+-[0-9a-f]{8}$/);
  assert.equal(JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).dependencies['expo-updates'] !== undefined, true);
});

test('textes du bandeau « contenu prêt » en trois langues', () => {
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of ['au.otaReady', 'au.otaRestart']) assert.ok((APP_DICT[l] as Record<string, string>)[k], `${l}:${k}`);
});
