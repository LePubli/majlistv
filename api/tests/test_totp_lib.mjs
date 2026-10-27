// Étape 31 — TOTP et codes de secours (calculs purs). Lancer : node tests/test_totp_lib.mjs
import assert from 'node:assert/strict';
import { base32Encode, base32Decode, codeAt, verifyTotp, otpauthUri, newSecret, newRecoveryCodes, normalizeRecovery, hashRecovery, stepOf } from '../src/totp.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('OK   ' + m); };

// Vecteurs officiels de la RFC 6238 (SHA-1, clé « 12345678901234567890 »), 6 derniers chiffres.
const S = base32Encode(Buffer.from('12345678901234567890'));
ok(codeAt(S, Math.floor(59 / 30)) === '287082', 'RFC 6238 : t = 59 s');
ok(codeAt(S, Math.floor(1111111109 / 30)) === '081804', 'RFC 6238 : t = 1111111109 s');
ok(codeAt(S, Math.floor(1234567890 / 30)) === '005924', 'RFC 6238 : t = 1234567890 s');
ok(codeAt(S, Math.floor(2000000000 / 30)) === '279037', 'RFC 6238 : t = 2000000000 s');

// base32
ok(base32Decode(S).toString() === '12345678901234567890', 'base32 aller-retour');
ok(base32Decode('gezd gnbv-gy3t').length === 7, 'base32 : espaces, tirets et minuscules tolérés');
assert.throws(() => base32Decode('abc1'), /invalide/); n++; console.log('OK   base32 : caractère invalide refusé');
ok(/^[A-Z2-7]{32}$/.test(newSecret()), 'clé secrète : 32 caractères base32 (160 bits)');

// Vérification
const t = 1111111109 * 1000;
ok(verifyTotp(S, '081804', { now: t }) === Math.floor(1111111109 / 30), 'code du pas courant accepté');
ok(verifyTotp(S, '081 804', { now: t }) != null, 'espaces dans le code ignorés');
ok(verifyTotp(S, codeAt(S, Math.floor(1111111109 / 30) - 1), { now: t }) != null, 'pas précédent accepté (horloge en retard de 30 s)');
ok(verifyTotp(S, codeAt(S, Math.floor(1111111109 / 30) + 1), { now: t }) != null, 'pas suivant accepté (horloge en avance de 30 s)');
ok(verifyTotp(S, codeAt(S, Math.floor(1111111109 / 30) - 3), { now: t }) === null, 'code vieux de 90 s refusé');
ok(verifyTotp(S, '000000', { now: t }) === null && verifyTotp(S, 'abcdef', { now: t }) === null && verifyTotp(S, '12345', { now: t }) === null && verifyTotp(S, null, { now: t }) === null, 'codes faux ou mal formés refusés');
const step = verifyTotp(S, '081804', { now: t });
ok(verifyTotp(S, '081804', { now: t, lastStep: step }) === null, 'un code déjà utilisé ne sert pas deux fois');
ok(verifyTotp(S, codeAt(S, step + 1), { now: t, lastStep: step }) != null, 'le pas suivant reste utilisable');
ok(stepOf(30000) === 1 && stepOf(29999) === 0, 'pas de 30 secondes');

// Adresse du QR code
const u = otpauthUri({ issuer: 'Mejliss TV', account: 'a+b@test.local', secret: 'ABC234' });
ok(u === 'otpauth://totp/Mejliss%20TV:a%2Bb%40test.local?secret=ABC234&issuer=Mejliss%20TV&algorithm=SHA1&digits=6&period=30', 'adresse otpauth');

// Codes de secours
const codes = newRecoveryCodes(10);
ok(codes.length === 10 && new Set(codes).size === 10 && codes.every((c) => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(c)), '10 codes de secours distincts au bon format');
ok(normalizeRecovery(codes[0].toUpperCase().replace('-', ' ')) === codes[0], 'code de secours : casse, espace et tiret ignorés');
ok(normalizeRecovery('123456') === null && normalizeRecovery('abc') === null && normalizeRecovery(undefined) === null, 'un code à 6 chiffres n\'est pas un code de secours');
ok(hashRecovery(codes[0]) !== hashRecovery(codes[1]) && /^[0-9a-f]{64}$/.test(hashRecovery(codes[0])), 'empreinte SHA-256');
console.log(`\n${n} vérifications réussies`);
