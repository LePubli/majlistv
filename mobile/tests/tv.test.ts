// Application TV (étape TV-1) : règles pures, QR code, déclaration Android TV, écrans, textes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fmtTvCode, tvCardWidth, tvMenuWidth, tvResumeSeconds, tvRouteFor, tvRows, audynRows } from '../src/lib/tvRules';
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

test('TV-2 : tailles pour une télé 1080p, catalogue et recherche', () => {
  assert.equal(tvMenuWidth(960), 180); assert.equal(tvMenuWidth(1920), 220);
  const w = tvCardWidth(960 - 180); assert.ok(w > 150 && w < 230, `vignette des rangées : ${w}`);
  assert.ok(tvCardWidth(960 - 180 - 200, 4) >= 150, 'grille de 4 : jamais sous 150');
  const c = read('src/app/tv/catalog.tsx');
  assert.match(c, /api\.get<Card\[\]>\('\/talks', \{ category: cat \?\? undefined, limit: PAGE, offset \}\)/);
  assert.match(c, /onEndReached=\{\(\) => \{ void load\(false\); \}\}/, 'suite chargée en bas de la grille');
  const s = read('src/app/tv/search.tsx');
  assert.match(s, /api\.get<SearchResult>\('\/search', \{ q: term, limit: 40 \}\)/);
  const sh = read('src/components/tv/TvShell.tsx');
  for (const h of ["'/tv/catalog'", "'/tv/search'"]) assert.ok(sh.includes(h), h);
  for (const lang of ['fr', 'en', 'ar'] as const) for (const k of ['tv.catalog', 'tv.search', 'tv.allCategories', 'tv.searchPh', 'tv.searchHelp', 'tv.noResult', 'tv.results']) assert.ok((DICT[lang] as Record<string, string>)[k], `${k} (${lang})`);
});

test('TV-3 : rangées Audyn (nouveautés, catégories, autres)', () => {
  const items = [{ id: 'a', category: 'Sîra' }, { id: 'b', category: null }, { id: 'c', category: 'Fiqh' }, { id: 'd', category: 'Sîra' }];
  const r = audynRows({ items, categories: ['Fiqh', 'Sîra', 'Vide'] }, 'Nouveautés', 'Autres');
  assert.deepEqual(r.map((x) => [x.key, x.items.map((i) => i.id).join('')]), [['new', 'abcd'], ['c-Fiqh', 'c'], ['c-Sîra', 'ad'], ['other', 'b']]);
  assert.deepEqual(audynRows({ items: [], categories: [] }, 'N', 'A'), []);
  assert.deepEqual(audynRows({ items: [{ id: 'x' }], categories: [] }, 'N', 'A').map((x) => x.key), ['new']);
});

test('TV-3 : écrans direct et Audyn présents, menu conditionné aux fonctions', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  const shell = read('src/components/tv/TvShell.tsx');
  assert.match(shell, /'\/tv\/live'[^\n]*feat\('livetv'\)/);
  assert.match(shell, /'\/tv\/audyn'[^\n]*feat\('audyn'\)/);
  assert.match(read('src/app/tv/live.tsx'), /api\.get<\{ channels: LiveChannel\[\] \}>\('\/live'\)/);
  assert.match(read('src/app/tv/embed.tsx'), /validEmbedId\(/);
  const det = read('src/app/tv/audyn/[id].tsx');
  assert.match(det, /au\.openResume\(b\)/);
  assert.match(det, /router\.push\('\/tv\/audyn\/player'\)/);
  const pl = read('src/components/tv/TvNowPlaying.tsx');
  for (const f of ['au.toggle', 'au.skip(-15)', 'au.skip(15)', 'au.prev', 'au.next']) assert.ok(pl.includes(f), f);
  for (const k of ['tv.live', 'tv.noLive', 'tv.listen', 'tv.chaptersTitle', 'tv.nothingPlaying']) for (const l of ['fr', 'en', 'ar'] as const) assert.ok((DICT[l] as Record<string, string>)[k], `${l}:${k}`);
});

test('TV-4 : verrou de l’espace Kids sur la télé', () => {
  assert.equal(tvRouteFor(['tv', 'kids', 'home'], true), null);
  assert.equal(tvRouteFor(['tv', 'kids', 'watch', '[id]'], true), null);
  assert.equal(tvRouteFor(['tv', 'kids', 'exit'], true), null);
  assert.equal(tvRouteFor(['tv', 'kids', 'stories'], true), null);
  assert.equal(tvRouteFor(['tv', 'kids', 'story', '[id]'], true), null);
  assert.equal(tvRouteFor(['tv', 'kids', 'listen'], true), null);
  assert.equal(tvRouteFor(['tv', 'kids'], true), '/tv/kids/home', 'choix du profil fermé à l’enfant');
  assert.equal(tvRouteFor(['tv'], true), '/tv/kids/home', 'accueil adulte fermé');
  assert.equal(tvRouteFor(['tv', 'account'], true), '/tv/kids/home');
  assert.equal(tvRouteFor(['tv', 'audyn', 'player'], true), '/tv/kids/home');
  assert.equal(tvRouteFor(['(tabs)'], true), '/tv/kids/home');
  assert.equal(tvRouteFor(['tv', 'kids'], false), null);
});

test('TV-4 : écrans Kids de la télé', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  assert.match(read('src/components/tv/TvShell.tsx'), /'\/tv\/kids'[^\n]*feat\('kids'\)/);
  assert.match(read('src/app/_layout.tsx'), /tvRouteFor\(segments, !!kid\)/);
  const home = read('src/app/tv/kids/home.tsx');
  assert.match(home, /hardwareBackPress', \(\) => true/, '« Retour » ne quitte pas l’espace');
  assert.match(home, /\/tv\/kids\/exit/);
  assert.doesNotMatch(home, /TvShell/, 'pas de menu adulte pour l’enfant');
  assert.match(read('src/app/tv/kids/exit.tsx'), /await exit\(code\)/);
  const w = read('src/app/tv/kids/watch/[id].tsx');
  assert.match(w, /kidApi\.put\(`\/kids\/progress\/\$\{talk\.id\}`/);
  assert.match(w, /isTimeUp\(err\)/);
  assert.match(read('src/app/tv/kids/story/[id].tsx'), /kidApi\.get<AudynDetail>\(`\/kids\/stories\/\$\{id\}`\)/);
  for (const k of ['tv.kidsNeedSub', 'tv.kidsSetup', 'tv.kidsManage']) for (const l of ['fr', 'en', 'ar'] as const) assert.ok((DICT[l] as Record<string, string>)[k], `${l}:${k}`);
});
