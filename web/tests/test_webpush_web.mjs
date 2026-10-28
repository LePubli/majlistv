// Étape 40 — aides Web Push du site. Lancer : node web/tests/test_webpush_web.mjs
import assert from 'node:assert/strict';
import { urlBase64ToUint8Array, pushSupport } from '../lib/webPush.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
const u = urlBase64ToUint8Array('BAECAw-_');
ok(u.length === 6 && u[0] === 4 && u[4] === 0x0f && u[5] === 0xbf, 'clé base64url décodée en octets (- et _ gérés)');
ok(urlBase64ToUint8Array('AQID').join() === '1,2,3', 'sans remplissage « = » : accepté');
const base = { hasSW: true, hasPush: true, hasNotification: true, secure: true, permission: 'default', ios: false, standalone: false };
ok(pushSupport(base) === 'default', 'navigateur compatible, pas encore autorisé');
ok(pushSupport({ ...base, permission: 'granted' }) === 'granted', 'autorisé');
ok(pushSupport({ ...base, permission: 'denied' }) === 'denied', 'bloqué par le membre');
ok(pushSupport({ ...base, hasPush: false }) === 'unsupported', 'pas de PushManager : non pris en charge');
ok(pushSupport({ ...base, secure: false }) === 'unsupported', 'page non sécurisée : non pris en charge');
ok(pushSupport({ ...base, ios: true }) === 'ios_install', 'iPhone hors site installé : demander d\'installer d\'abord');
ok(pushSupport({ ...base, ios: true, standalone: true }) === 'default', 'iPhone, site installé : possible');
