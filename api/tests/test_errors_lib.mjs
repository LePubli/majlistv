// Étape 39 — calculs purs du suivi des erreurs. Lancer : node tests/test_errors_lib.mjs
import assert from 'node:assert/strict';
import { scrub, clip, normRoute, fingerprint, isNoise, alertKind, makeLimiter, alertText } from '../src/errorsLib.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };

// Masquage
ok(scrub('Échec pour jean.dupont@exemple.fr') === 'Échec pour [e-mail]', 'e-mail masqué');
ok(scrub('Authorization: Bearer abcdef1234567890xyz').includes('Bearer [jeton]') && !scrub('Bearer abcdef1234567890xyz').includes('abcdef'), 'jeton Bearer masqué');
ok(scrub('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk').includes('[jeton]'), 'JWT masqué');
ok(scrub('GET /talks?token=SECRET123&x=1 échoue') === 'GET /talks?[…] échoue', 'paramètres d’adresse masqués');
ok(scrub('depuis 192.168.1.20') === 'depuis [ip]', 'adresse IP masquée');
ok(scrub('clé abcdefghijklmnopqrstuvwxyz0123456789ABCD vue').includes('[secret]'), 'longue chaîne secrète masquée');
ok(scrub(null) === '' && scrub(undefined) === '', 'valeurs vides sans exception');
ok(clip('abcdef', 4) === 'abc…' && clip('abc', 4) === 'abc', 'troncature');

// Routes et empreintes
ok(normRoute('/talks/3f2b8c1e-aaaa-4bbb-8ccc-123456789abc/quiz?x=1') === '/talks/:id/quiz', 'route : identifiant et paramètres retirés');
ok(normRoute('https://site.fr/talks/42/notes#a') === '/talks/:id/notes', 'adresse complète : chemin seul, nombre remplacé');
ok(normRoute('') === '' && normRoute(null) === '', 'route vide');
const a = fingerprint('api', 'Conférence 12 introuvable', '/talks/12');
const b = fingerprint('api', 'Conférence 99 introuvable', '/talks/99');
ok(a === b && /^[0-9a-f]{16}$/.test(a), 'deux numéros différents = la même erreur');
ok(a !== fingerprint('web', 'Conférence 12 introuvable', '/talks/12'), 'serveur et navigateur : deux erreurs distinctes');
ok(a !== fingerprint('api', 'Autre message', '/talks/12'), 'message différent : erreur différente');
ok(fingerprint('api', 'Erreur pour a@b.fr', '/x') === fingerprint('api', 'Erreur pour c@d.fr', '/x'), 'e-mails différents : même erreur (et jamais dans l’empreinte)');

// Bruit
ok(isNoise('ResizeObserver loop limit exceeded') && isNoise('Script error.') && isNoise('') && isNoise('Failed to fetch'), 'bruit courant ignoré');
ok(isNoise('boom', 'at chrome-extension://abc/content.js:1') && !isNoise('TypeError: x is undefined', 'at https://site/app.js:1'), 'extensions ignorées, vraies erreurs gardées');

// Alerte
ok(alertKind(null) === 'new' && alertKind({ state: 'open' }) === null && alertKind({ state: 'resolved' }) === 'regression' && alertKind({ state: 'ignored' }) === null, 'alerte : nouvelle ou revenue, jamais pour ouverte ou ignorée');
const t = alertText('new', { source: 'api', message: 'Boom', route: '/talks/:id', count: 1 });
ok(t.title.startsWith('Nouvelle erreur sur le serveur') && t.summary.includes('Première occurrence') && t.advice.includes('Admin → Erreurs'), 'e-mail : nouvelle erreur serveur');
ok(alertText('regression', { source: 'web', message: 'Boom', route: '', count: 5 }).title.startsWith('Erreur revenue sur le site'), 'e-mail : erreur revenue (navigateur)');

// Limiteur
const l = makeLimiter(3, 1000);
ok([0, 1, 2, 3].map((i) => l.allow(100 + i)).join() === 'true,true,true,false', 'limiteur : 3 par fenêtre');
ok(l.allow(1200) === true, 'limiteur : nouvelle fenêtre');
console.log('\nTout est OK');
