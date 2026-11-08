// 24c : règles pures de la publicité au lancement. Lancer : node api/tests/test_ads_lib.mjs
import assert from 'node:assert/strict';
import { mediaInfo, keyInfo, safeLink, adStatus, pickAds, clickRate } from '../src/ads.js';

// Types de fichiers
assert.equal(mediaInfo('image/jpeg').kind, 'image');
assert.equal(mediaInfo('VIDEO/MP4').kind, 'video');
assert.equal(mediaInfo('video/webm').ext, 'webm');
assert.equal(mediaInfo('application/pdf'), null);
assert.equal(mediaInfo('image/svg+xml'), null); // SVG refusé (peut contenir du script)
assert.equal(mediaInfo(undefined), null);
assert.equal(keyInfo('ads/0b3f1f9e-1111-4222-8333-444455556666.mp4').kind, 'video');
assert.equal(keyInfo('ads/0b3f1f9e-1111-4222-8333-444455556666.jpg').kind, 'image');
assert.equal(keyInfo('campaigns/0b3f1f9e-1111-4222-8333-444455556666.webm').kind, 'video');
assert.equal(keyInfo('campaigns/../secret.mp4'), null);
assert.equal(keyInfo('talks/0b3f1f9e-1111-4222-8333-444455556666.mp4'), null);
assert.equal(keyInfo('ads/../secret.mp4'), null);

// Liens : http(s) seulement
assert.equal(safeLink('https://exemple.fr/offre?x=1'), 'https://exemple.fr/offre?x=1');
assert.equal(safeLink('  http://exemple.fr '), 'http://exemple.fr/');
for (const bad of ['javascript:alert(1)', 'intent://x#Intent;end', 'ftp://exemple.fr', 'exemple.fr', '', null]) assert.equal(safeLink(bad), null, String(bad));

// Situation selon active et dates
const now = new Date('2026-10-26T12:00:00Z');
assert.equal(adStatus({ active: false }, now), 'paused');
assert.equal(adStatus({ active: true }, now), 'live');
assert.equal(adStatus({ active: true, starts_at: '2026-10-27T00:00:00Z' }, now), 'scheduled');
assert.equal(adStatus({ active: true, ends_at: '2026-10-26T12:00:00Z' }, now), 'ended');
assert.equal(adStatus({ active: true, starts_at: '2026-10-26T08:00:00Z', ends_at: '2026-10-26T18:00:00Z' }, now), 'live');

// Rotation
const L = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const ids = (x) => x.map((a) => a.id).join('');
assert.equal(ids(pickAds(L, undefined, 1)), 'a');
assert.equal(ids(pickAds(L, 'a', 1)), 'b');
assert.equal(ids(pickAds(L, 'c', 1)), 'a');         // reprend au début
assert.equal(ids(pickAds(L, 'zzz', 1)), 'a');       // dernière supprimée : début
assert.equal(ids(pickAds(L, 'b', 2)), 'ca');        // plusieurs à la suite, avec retour au début
assert.equal(ids(pickAds(L, 'a', 9)), 'bca');       // jamais plus que le nombre de publicités (pas de doublon)
assert.equal(ids(pickAds([], 'a', 2)), '');
assert.equal(ids(pickAds([{ id: 'x' }], 'x', 3)), 'x');
assert.equal(ids(pickAds(L, undefined, 0)), 'a');

assert.equal(clickRate(200, 5), 2.5);
assert.equal(clickRate(0, 0), 0);
console.log('OK  ads lib');

// ---- Amélioration 5.3 : langue ----
{
  const { normLang, matchesLang, langBreakdown } = await import('../src/ads.js');
  assert.equal(normLang('fr-FR'), 'fr'); assert.equal(normLang('EN'), 'en'); assert.equal(normLang('ar'), 'ar');
  for (const v of ['de', '', null, undefined, 'x', 42]) assert.equal(normLang(v), '');
  assert.ok(matchesLang([], 'fr') && matchesLang(undefined, 'ar') && matchesLang(null, ''), 'sans langue choisie : partout');
  assert.ok(matchesLang(['fr'], 'fr') && !matchesLang(['fr'], 'ar') && matchesLang(['fr', 'ar'], 'ar'));
  assert.ok(matchesLang(['fr'], ''), 'langue inconnue (application ancienne) : publicité montrée');
  const b = langBreakdown({ impressions: 10, clicks: 3, skips: 2 }, [{ lang: 'fr', impressions: 4, clicks: 2, skips: 1 }, { lang: 'ar', impressions: 3, clicks: 0, skips: 0 }, { lang: '', impressions: 1, clicks: 0, skips: 0 }]);
  assert.deepEqual(b.fr, { impressions: 4, clicks: 2, skips: 1 }); assert.deepEqual(b.en, { impressions: 0, clicks: 0, skips: 0 });
  assert.deepEqual(b.none, { impressions: 3, clicks: 1, skips: 1 }, 'sans langue = total − langues connues');
  assert.equal(langBreakdown({ impressions: 1, clicks: 0, skips: 0 }, [{ lang: 'fr', impressions: 5, clicks: 0, skips: 0 }]).none.impressions, 0, 'jamais négatif');
  console.log('OK  ads lang');
}

// ---- Amélioration 5.3, étape 2 : rapport annonceur ----
{
  const { fillDays, newReportToken, TOKEN_RE, buildReport, reportPdf } = await import('../src/adReport.js');
  const days = fillDays([{ day: '2026-11-07', impressions: 4, clicks: 1 }, { day: '2020-01-01', impressions: 9, clicks: 9 }], '2026-11-08', 90);
  const t = (c, m) => { if (!c) { console.error('FAIL ' + m); process.exit(1); } console.log('OK   ' + m); };
  t(days.length === 90 && days[89].day === '2026-11-08' && days[0].day === '2026-08-11', 'courbe : 90 jours se terminant aujourd\'hui');
  t(days[88].impressions === 4 && days[89].impressions === 0, 'courbe : jours sans donnée à zéro, hors période ignorés');
  const a = newReportToken(), b = newReportToken();
  t(a !== b && TOKEN_RE.test(a) && a.length === 32, 'jeton secret : 32 caractères, unique, valide');
  t(!TOKEN_RE.test('court') && !TOKEN_RE.test('x'.repeat(30) + '/..'), 'jeton invalide refusé');
  const lang = (i, c) => ({ impressions: i, clicks: c, skips: 0 });
  const rep = buildReport({ advertiser: 'Café Élan', title: 'Offre d’été — 20 %', starts_at: null, ends_at: null, created_at: new Date(), languages: ['fr'], impressions: 10, clicks: 2, skips: 1 },
    [{ day: '2026-11-08', impressions: 10, clicks: 2 }], { fr: lang(6, 2), en: lang(0, 0), ar: lang(0, 0), none: lang(4, 0) }, '2026-11-08', 'live');
  t(rep.totals.ctr === 20 && rep.byLang.fr.ctr > 33 && rep.byLang.none.ctr === 0, 'rapport : taux de clic total et par langue');
  t(!JSON.stringify(rep).includes('token') && !JSON.stringify(rep).includes('link'), 'rapport : ni jeton ni lien');
  const pdf = await reportPdf({ ...rep, title: 'Offre d’été — العربية 20 %' });
  t(pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 1500, 'PDF généré (accents gérés, caractères non gérés remplacés)');
}
