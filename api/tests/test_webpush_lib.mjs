// Étape 40 — règles pures du Web Push. Lancer : node api/tests/test_webpush_lib.mjs
import assert from 'node:assert/strict';
import { endpointAllowed, parseSubscription, webPayload, isGone } from '../src/webPushLib.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
const P = 'B' + 'A'.repeat(86);       // 87 car. base64url ≈ clé P-256 non compressée (65 octets)
const A = 'a'.repeat(22);

ok(endpointAllowed('https://fcm.googleapis.com/fcm/send/abc'), 'Chrome / Edge : accepté');
ok(endpointAllowed('https://updates.push.services.mozilla.com/wpush/v2/xyz'), 'Firefox : accepté');
ok(endpointAllowed('https://web.push.apple.com/QWERTY'), 'Safari : accepté');
ok(endpointAllowed('https://wns2-par02p.notify.windows.com/w/?token=1'), 'Windows : accepté');
ok(!endpointAllowed('http://fcm.googleapis.com/x'), 'http refusé');
ok(!endpointAllowed('https://127.0.0.1/x') && !endpointAllowed('https://localhost/x'), 'adresse locale refusée');
ok(!endpointAllowed('https://169.254.169.254/latest/meta-data'), 'adresse interne du cloud refusée');
ok(!endpointAllowed('https://fcm.googleapis.com.evil.example/x'), 'faux sous-domaine refusé');
ok(!endpointAllowed('https://evil.example/fcm.googleapis.com'), 'nom dans le chemin refusé');
ok(!endpointAllowed('https://user:pw@fcm.googleapis.com/x'), 'identifiants dans l’adresse refusés');
ok(!endpointAllowed('https://fcm.googleapis.com:8443/x'), 'port inhabituel refusé');
ok(!endpointAllowed('pas une adresse'), 'texte quelconque refusé');

const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: P, auth: A }, locale: 'ar-MA' };
let r = parseSubscription(good);
ok(r.ok && r.sub.locale === 'ar', 'abonnement valide, langue ramenée à 2 lettres');
ok(parseSubscription({ ...good, locale: 'zz' }).sub.locale === 'fr', 'langue inconnue → français');
ok(!parseSubscription({ ...good, keys: { p256dh: 'court', auth: A } }).ok, 'clé trop courte refusée');
ok(!parseSubscription({ ...good, keys: { p256dh: P, auth: 'é'.repeat(20) } }).ok, 'secret non base64url refusé');
ok(!parseSubscription({ ...good, endpoint: 'https://evil.example/x' }).ok, 'service inconnu refusé');
ok(!parseSubscription(null).ok && !parseSubscription('x').ok, 'corps vide refusé');

const pl = JSON.parse(webPayload({ title: 'T'.repeat(500), body: 'B'.repeat(900), path: '//evil.example', kind: 'speaker_new' }));
ok(pl.title.length === 120 && pl.body.length === 300, 'titre et message tronqués');
ok(pl.path === '/', 'chemin hors du site remplacé par l’accueil');
ok(JSON.parse(webPayload({ title: 'a', body: 'b', path: '/conferences/x' })).path === '/conferences/x', 'chemin du site gardé');
ok(isGone(410) && isGone(404) && !isGone(500) && !isGone(429), 'seuls 404 / 410 suppriment l’abonnement');
console.log('\nTout est OK');
