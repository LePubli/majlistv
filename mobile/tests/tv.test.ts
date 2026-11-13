// Application TV (étape TV-1) : règles pures, QR code, déclaration Android TV, écrans, textes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fmtTvCode, tvResumeSeconds, tvRouteFor, tvRows } from '../src/lib/tvRules';
import { qrMatrix } from '../src/lib/qr';
import { DICT } from '../src/lib/i18n';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

test('règles TV', () => {
  assert.equal(fmtTvCode('ABCD2345'), 'ABCD 2345');
  assert.equal(tvRouteFor(['tv']), null);
  assert.equal(tvRouteFor(['(tabs)']), '/tv', 'écran du téléphone ouvert sur la télé : retour à l’accueil TV');
  assert.deepEqual(tvRows([{ key: 'a', talks: [] }, { key: 'b', talks: [1] }, { key: 'c' }]).map((r) => r.key), ['b']);
  assert.equal(tvResumeSeconds(10_000, 3600), 0, 'moins de 30 s : depuis le début');
  assert.equal(tvResumeSeconds(600_000, 3600), 600);
  assert.equal(tvResumeSeconds(3_590_000, 3600), 0, 'fin de vidéo : depuis le début');
});

test('QR code de connexion (JavaScript pur)', () => {
  const m = qrMatrix('https://majlisstv.le-publicitaire.fr/tv?code=ABCD2345');
  assert.ok(m.length >= 25 && m.every((r) => r.length === m.length));
  assert.equal(m[0][0], true, 'repère de coin');
  assert.equal(m[7][7], false, 'séparateur du repère');
});

test('déclaration Android TV (plugin) et version', () => {
  const p = read('plugins/withAndroidTV.js');
  for (const s of ['android.software.leanback', 'android.hardware.touchscreen', "'android:required': 'false'", 'LEANBACK_LAUNCHER', "'@drawable/tv_banner'", 'tv-banner.png']) assert.ok(p.includes(s), s);
  const app = JSON.parse(read('app.json'));
  assert.ok(app.expo.plugins.includes('./plugins/withAndroidTV'));
  const png = readFileSync(join(__dirname, '..', 'assets/tv-banner.png'));
  assert.equal(png.readUInt32BE(16), 320); assert.equal(png.readUInt32BE(20), 180);
});

test('écrans TV branchés', () => {
  const l = read('src/app/_layout.tsx');
  assert.match(l, /if \(isTV\(\)\) \{/); assert.match(l, /<TvLock \/>/);
  const a = read('src/app/tv/account.tsx');
  assert.match(a, /api\.post<Start>\('\/auth\/tv\/start'/); assert.match(a, /'\/auth\/tv\/poll', \{ secret: s\.secret \}/); assert.match(a, /await adopt\(\{ token: r\.token, user: r\.user \}\)/);
  const p = read('src/app/tv/play/[id].tsx');
  assert.match(p, /new ProgressTracker\(/, 'reprise synchronisée'); assert.match(p, /nativeControls/);
  assert.match(read('src/components/tv/Focusable.tsx'), /hasTVPreferredFocus=\{first\}/);
  const keys = ['tv.home', 'tv.account', 'tv.login', 'tv.featured', 'tv.watch', 'tv.resume', 'tv.fromStart', 'tv.continue', 'tv.locked', 'tv.loginTitle', 'tv.loginStep1', 'tv.loginStep2', 'tv.newCode', 'tv.scan'];
  for (const lang of ['fr', 'en', 'ar'] as const) for (const k of keys) assert.ok((DICT[lang] as Record<string, string>)[k], `${k} (${lang})`);
});
