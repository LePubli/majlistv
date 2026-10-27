// Étape 29 — calculs purs de la santé du serveur. Lancer : node tests/test_health_lib.mjs
import assert from 'node:assert/strict';
import { levelOf, diskFromStatfs, memFrom, decideAlert, trend, fmtBytes, alertText, REPEAT_MS } from '../src/healthLib.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('OK   ' + m); };

// Niveaux
ok(levelOf(50, 80, 90) === 'ok', 'niveau ok');
ok(levelOf(80, 80, 90) === 'warn', 'niveau attention à 80');
ok(levelOf(90, 80, 90) === 'crit', 'niveau critique à 90');
ok(levelOf(85, 90, 80) === 'ok' && levelOf(90, 90, 80) === 'crit', 'seuil critique jamais sous le seuil attention');

// Disque comme df : 100 blocs, 40 libres mais 30 disponibles → utilisé 60, dispo 30 → 67 %
const d = diskFromStatfs({ bsize: 1024, blocks: 100, bfree: 40, bavail: 30 });
ok(d.pct === 67 && d.total === 102400 && d.free === 30720, 'pourcentage disque comme df (arrondi au supérieur)');
ok(diskFromStatfs({ bsize: 4096, blocks: 0, bfree: 0, bavail: 0 }).pct === 0, 'disque vide sans division par zéro');

// Mémoire
const m = memFrom(16e9, 4e9);
ok(m.pct === 75 && m.avail === 4e9, 'mémoire utilisée 75 %');

// Matrice d'alertes
const H = 3600e3, now = 1e12;
ok(decideAlert(null, 'ok', now) === null, 'ok → ok : rien');
ok(decideAlert({ level: 'ok', lastSentAt: null }, 'warn', now) === 'alert', 'ok → attention : alerte');
ok(decideAlert({ level: 'ok', lastSentAt: null }, 'crit', now) === 'alert', 'ok → critique : alerte');
ok(decideAlert({ level: 'warn', lastSentAt: now - H }, 'crit', now) === 'alert', 'attention → critique : alerte');
ok(decideAlert({ level: 'crit', lastSentAt: now - H }, 'warn', now) === null, 'critique → attention : rien');
ok(decideAlert({ level: 'crit', lastSentAt: now - H }, 'crit', now) === null, 'critique persistant < 24 h : rien');
ok(decideAlert({ level: 'crit', lastSentAt: now - REPEAT_MS.crit }, 'crit', now) === 'alert', 'critique persistant ≥ 24 h : rappel');
ok(decideAlert({ level: 'warn', lastSentAt: now - 71 * H }, 'warn', now) === null, 'attention persistant < 72 h : rien');
ok(decideAlert({ level: 'warn', lastSentAt: now - 72 * H }, 'warn', now) === 'alert', 'attention persistant ≥ 72 h : rappel');
ok(decideAlert({ level: 'warn', lastSentAt: null }, 'warn', now) === 'alert', 'attention jamais notifié (mail absent) : réessaie');
ok(decideAlert({ level: 'crit', lastSentAt: now - H }, 'ok', now) === 'recovered', 'retour à la normale après alerte envoyée');
ok(decideAlert({ level: 'crit', lastSentAt: null }, 'ok', now) === null, 'retour à la normale sans alerte envoyée : rien');

// Tendance
const day = 86400e3, GB = 1024 ** 3;
const pts = Array.from({ length: 48 }, (_, i) => ({ t: i * 3600e3, used: 20 * GB + (i / 24) * 2 * GB }));
const t = trend(pts, 40 * GB);
ok(t.enough && Math.abs(t.bytesPerDay - 2 * GB) < 0.01 * GB, 'tendance : +2 Go par jour');
ok(t.daysLeft > 7.5 && t.daysLeft < 8.5, `tendance : ~8 jours avant plein (${t.daysLeft})`);
ok(!trend(pts.slice(0, 5), 40 * GB).enough, 'tendance : trop peu de mesures');
ok(!trend(Array.from({ length: 20 }, (_, i) => ({ t: i * 60e3, used: GB })), 40 * GB).enough, 'tendance : période trop courte');
const flat = trend(Array.from({ length: 30 }, (_, i) => ({ t: i * 3600e3, used: 10 * GB })), 40 * GB);
ok(flat.enough && flat.daysLeft === null, 'tendance stable : pas de date de saturation');
const down = trend(Array.from({ length: 30 }, (_, i) => ({ t: i * 3600e3, used: 30 * GB - i * GB / 10 })), 40 * GB);
ok(down.daysLeft === null, 'tendance en baisse : pas de date de saturation');

// Formats
ok(fmtBytes(1.5 * GB) === '1.5 Go' && fmtBytes(300 * 1024 ** 2) === '300 Mo' && fmtBytes(2048) === '2 Ko' && fmtBytes(NaN) === '—', 'tailles lisibles');
const a = alertText('disk', 'crit', 93, 'Il reste 5 Go.');
ok(/critique/.test(a.title) && /93 %/.test(a.title) && /docker image prune/.test(a.advice) && !/volume prune -f/.test(a.advice), 'texte alerte disque critique (sans conseil dangereux)');
ok(/revenu à la normale/.test(alertText('mem', 'ok', 50, '').title), 'texte retour à la normale');
console.log(`\n${n} vérifications réussies`);
