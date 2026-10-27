// Étape 37 — calculs purs du suivi des sauvegardes. Lancer : node tests/test_backup_lib.mjs
import assert from 'node:assert/strict';
import { evaluateBackup, cleanDetails, ageText, maxBackupHours, maxRestoreDays, LEVEL_NUM } from '../src/backupLib.js';
import { alertText } from '../src/healthLib.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
const H = 3600e3, D = 24 * H, now = Date.UTC(2026, 9, 27, 12, 0, 0);
const cfg = { tokenSet: true, maxHours: 30, maxDays: 10 };
const good = (ago, extra = {}) => ({ ok: true, summary: 'ok', at: now - ago, details: { garageOk: true, ...extra } });

ok(evaluateBackup({ backup: null, restore_test: null }, { ...cfg, tokenSet: false }, now).level === 'off', 'sans jeton : suivi désactivé');
let r = evaluateBackup({ backup: null, restore_test: null }, cfg, now);
ok(r.level === 'warn' && r.reasons.length === 2, 'jeton posé, aucun rapport : attention (sauvegarde + test)');
r = evaluateBackup({ backup: good(8 * H), restore_test: good(3 * D) }, cfg, now);
ok(r.level === 'ok' && r.reasons.length === 0, 'tout est récent : ok');
r = evaluateBackup({ backup: good(31 * H), restore_test: good(3 * D) }, cfg, now);
ok(r.level === 'crit' && /Aucune sauvegarde reçue depuis 31 h/.test(r.reasons[0]), 'sauvegarde silencieuse depuis 31 h : critique');
r = evaluateBackup({ backup: good(29 * H), restore_test: good(3 * D) }, cfg, now);
ok(r.level === 'ok', '29 h : encore dans la limite de 30 h');
r = evaluateBackup({ backup: { ok: false, summary: 'pg_dump a échoué', at: now - 2 * H, details: {} }, restore_test: good(D) }, cfg, now);
ok(r.level === 'crit' && /pg_dump a échoué/.test(r.reasons[0]), 'sauvegarde en échec : critique avec le motif');
r = evaluateBackup({ backup: good(H, { garageOk: false }), restore_test: good(D) }, cfg, now);
ok(r.level === 'warn' && /vidéos/.test(r.reasons[0]), 'vidéos non sauvegardées : attention');
r = evaluateBackup({ backup: good(H), restore_test: good(11 * D) }, cfg, now);
ok(r.level === 'warn' && /Dernier test de restauration réussi il y a 11 j/.test(r.reasons[0]), 'test de restauration trop ancien : attention');
r = evaluateBackup({ backup: good(H), restore_test: { ok: false, summary: 'dump trop vieux', at: now - D, details: {} } }, cfg, now);
ok(r.level === 'crit', 'test de restauration en échec : critique');
r = evaluateBackup({ backup: good(31 * H), restore_test: null }, cfg, now);
ok(r.level === 'crit' && r.reasons.length === 2, 'le pire niveau l’emporte, tous les motifs sont listés');

ok(maxBackupHours('abc') === 30 && maxBackupHours(1) === 6 && maxBackupHours(99999) === 336, 'durée max : défaut et bornes (heures)');
ok(maxRestoreDays(undefined) === 10 && maxRestoreDays(0) === 1 && maxRestoreDays(500) === 90, 'durée max : défaut et bornes (jours)');
ok(ageText(30 * 60e3) === '30 min' && ageText(5 * H) === '5 h' && ageText(5 * D) === '5 j', 'durées lisibles');

const c = cleanDetails({ snapshots: 5, repoBytes: '1234', evil: 'x', restoreTalks: -3, dumpBytes: 'abc', snapshotAt: '2026-10-27T04:20:00Z', garageOk: true, tables: 1e20 });
ok(c.snapshots === 5 && c.repoBytes === 1234 && c.garageOk === true && c.snapshotAt === '2026-10-27T04:20:00.000Z', 'détails : champs connus gardés');
ok(!('evil' in c) && !('restoreTalks' in c) && !('dumpBytes' in c) && !('tables' in c), 'détails : champs inconnus, négatifs, non numériques ou énormes écartés');
ok(Object.keys(cleanDetails(null)).length === 0 && Object.keys(cleanDetails('x')).length === 0, 'détails : entrée invalide → vide');

ok(LEVEL_NUM.ok === 0 && LEVEL_NUM.warn === 1 && LEVEL_NUM.crit === 2, 'niveaux numériques 0/1/2');
const t = alertText('backup', 'crit', 2, 'La dernière sauvegarde a échoué.');
ok(/Sauvegardes/.test(t.title) && t.summary.includes('échoué') && t.advice.includes('last-status'), 'e-mail d’alerte sauvegardes');
ok(/retour à la normale/.test(alertText('backup', 'ok', 0, '').title), 'e-mail de retour à la normale');
console.log('\nTout est OK');
