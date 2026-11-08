// Amélioration 7.2 : règles pures des tests A/B (affectation, statistiques, validation des textes). node tests/test_experiments_lib.mjs
import assert from 'node:assert/strict';
import { bucket, assign, computeStats, cleanConfig, normalCdf, hashVisitor, VISITOR_RE, MIN_VISITORS } from '../src/experiments.js';
const ok = (m) => console.log('OK   ' + m);

// Affectation : stable, répartie selon les poids, indépendante d'un test à l'autre
const v2 = [{ key: 'A', weight: 50 }, { key: 'B', weight: 50 }];
assert.equal(assign('visiteur-0123456789abcdef', 'e1', v2), assign('visiteur-0123456789abcdef', 'e1', v2)); ok('affectation stable');
const count = (vs, e = 'e1', n = 20000) => { const c = {}; for (let i = 0; i < n; i++) { const k = assign(`visitor-${i}-0123456789`, e, vs); c[k] = (c[k] || 0) + 1; } return c; };
let c = count(v2); assert.ok(Math.abs(c.A - 10000) < 300 && Math.abs(c.B - 10000) < 300, JSON.stringify(c)); ok('50/50 sur 20 000 visiteurs');
c = count([{ key: 'A', weight: 80 }, { key: 'B', weight: 10 }, { key: 'C', weight: 10 }]); assert.ok(Math.abs(c.A - 16000) < 400 && Math.abs(c.B - 2000) < 300 && Math.abs(c.C - 2000) < 300, JSON.stringify(c)); ok('80/10/10 respecté');
let same = 0; for (let i = 0; i < 2000; i++) { const x = `visitor-${i}-0123456789`; if (assign(x, 'e1', v2) === assign(x, 'e2', v2)) same++; }
assert.ok(same > 800 && same < 1200, `corrélation entre tests : ${same}/2000`); ok('un test n\'influence pas la répartition d\'un autre');
assert.ok(bucket('x'.repeat(20), 'e') >= 0 && bucket('x'.repeat(20), 'e') < 1); ok('position dans [0, 1)');

// Visiteur et empreinte
assert.ok(VISITOR_RE.test('3f2b1c9e-8a7d-4e6f-9b1a-2c3d4e5f6a7b') && !VISITOR_RE.test('court') && !VISITOR_RE.test('a b c d e f g h i j k l m n o p')); ok('identifiant visiteur : format accepté / refusé');
assert.equal(hashVisitor('abc').length, 64); assert.notEqual(hashVisitor('abc'), 'abc'); ok('seule l\'empreinte est enregistrée');

// Loi normale et statistiques
assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3 && Math.abs(normalCdf(0) - 0.5) < 1e-6 && Math.abs(normalCdf(-1.96) - 0.025) < 1e-3); ok('loi normale');
let s = computeStats([{ key: 'A', visitors: 1000, clicks: 100, conversions: 50 }, { key: 'B', visitors: 1000, clicks: 150, conversions: 80 }]);
assert.equal(s[1].verdict, 'better'); assert.ok(s[1].confidence > 99 && s[1].lift === 60 && s[1].rate === 8 && s[0].verdict === 'reference'); ok('5 % → 8 % sur 1 000 visiteurs : meilleur, confiance > 99 %, +60 %');
s = computeStats([{ key: 'A', visitors: 1000, clicks: 0, conversions: 80 }, { key: 'B', visitors: 1000, clicks: 0, conversions: 50 }]);
assert.equal(s[1].verdict, 'worse'); ok('moins bien détecté');
s = computeStats([{ key: 'A', visitors: 1000, clicks: 0, conversions: 50 }, { key: 'B', visitors: 1000, clicks: 0, conversions: 55 }]);
assert.equal(s[1].verdict, 'inconclusive'); ok('5 % vs 5,5 % : pas concluant');
s = computeStats([{ key: 'A', visitors: 50, clicks: 0, conversions: 5 }, { key: 'B', visitors: 50, clicks: 0, conversions: 25 }]);
assert.equal(s[1].verdict, 'collecting'); assert.equal(s[1].confidence, null); assert.ok(MIN_VISITORS === 100); ok('moins de 100 visiteurs par variante : « pas assez de données », aucune confiance affichée');
s = computeStats([{ key: 'A', visitors: 500, clicks: 0, conversions: 0 }, { key: 'B', visitors: 500, clicks: 0, conversions: 0 }]);
assert.equal(s[1].verdict, 'collecting'); assert.equal(s[1].lift, null); ok('aucune inscription : pas de division par zéro');
s = computeStats([{ key: 'A', visitors: 0, clicks: 0, conversions: 0 }, { key: 'B', visitors: 0, clicks: 0, conversions: 0 }]); assert.equal(s[1].rate, 0); ok('aucun visiteur : tout à zéro');

// Validation des textes
let r = cleanConfig('vitrine_hero', { texts: { fr: { vtLead: '  Bonjour  ', heroCta: '' }, en: { vtLead: 'Hi' } } });
assert.deepEqual(r.texts, { fr: { vtLead: 'Bonjour' }, en: { vtLead: 'Hi' } }); ok('textes nettoyés, vides ignorés');
assert.ok(cleanConfig('vitrine_hero', { texts: { de: { vtLead: 'x' } } }).error); ok('langue inconnue refusée');
assert.ok(cleanConfig('vitrine_hero', { texts: { fr: { pricingTitle: 'x' } } }).error); ok('clé hors zone refusée');
assert.ok(cleanConfig('vitrine_hero', { texts: { fr: { vtLead: 'x'.repeat(301) } } }).error); ok('texte trop long refusé');
assert.ok(cleanConfig('vitrine_hero', { texts: { fr: { vtLead: 'a\u0000b' } } }).error); ok('caractère de contrôle refusé');
assert.ok(cleanConfig('zone_inconnue', {}).error); ok('zone inconnue refusée');
r = cleanConfig('pricing', { texts: { fr: { pricingTitle: 'Titre' } }, options: { highlight: 'month', order: '' } });
assert.deepEqual(r, { texts: { fr: { pricingTitle: 'Titre' } }, options: { highlight: 'month' } }); ok('tarifs : textes et réglages, réglage vide ignoré');
assert.ok(cleanConfig('pricing', { options: { highlight: 'zzz' } }).error && cleanConfig('pricing', { options: { price: '1' } }).error && cleanConfig('vitrine_hero', { options: { highlight: 'month' } }).error); ok('tarifs : valeur ou réglage inconnu refusé (les prix ne sont pas modifiables)');
assert.ok(cleanConfig('pricing', { texts: { fr: { vtLead: 'x' } } }).error); ok('tarifs : un texte d\'une autre zone est refusé');
r = cleanConfig('mobile_register', { texts: { fr: { 'auth.register': 'Rejoindre', 'auth.pitch': 'Gratuit 7 jours' } } });
assert.deepEqual(r, { texts: { fr: { 'auth.register': 'Rejoindre', 'auth.pitch': 'Gratuit 7 jours' } }, options: {} }); ok('appli : textes de l\'écran « Créer un compte » acceptés');
assert.ok(cleanConfig('mobile_register', { texts: { fr: { vtLead: 'x' } } }).error && cleanConfig('mobile_register', { options: { highlight: 'month' } }).error); ok('appli : texte ou réglage d\'une autre zone refusé');
console.log('OK  experiments lib');
