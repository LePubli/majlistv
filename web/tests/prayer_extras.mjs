// Amélioration 4.3 : Qibla, date hégirienne, calendrier du mois. Lancement : node web/tests/prayer_extras.mjs
import assert from 'node:assert/strict';
import { qibla, compassIndex, turnTo, smoothHeading, hijriOfCivil, isWhiteDay, monthTable, shiftMonth, KAABA, HIJRI_OK } from '../lib/prayerExtras.js';
import { dayTimes } from '../lib/prayerTimes.js';
import { CITIES, cityById } from '../lib/prayerCities.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n += 1; };
const near = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m} : ${a} ≠ ${b} (±${tol})`); n += 1; };

// --- Qibla : valeurs de référence connues (sources publiques de Qibla, tolérance 0,6°)
const ref = { paris: [48.8566, 2.3522, 119.1], newyork: [40.7128, -74.006, 58.5], tokyo: [35.6762, 139.6503, 293.0], london: [51.5074, -0.1278, 118.99], jakarta: [-6.2088, 106.8456, 295.1], capetown: [-33.9249, 18.4241, 23.0] };
for (const [k, [la, lo, b]] of Object.entries(ref)) near(qibla(la, lo).bearing, b, 0.6, `Qibla ${k}`);
// Distance Paris - La Mecque : environ 4 500 km (haversine)
const dp = qibla(48.8566, 2.3522).distanceKm; ok(dp > 4400 && dp < 4600, `distance Paris ${dp}`);
// Contrôle indépendant : le cap, suivi sur le grand cercle, arrive bien à la Kaaba (formule de destination)
for (const [k, [la, lo]] of Object.entries(ref)) {
  const q = qibla(la, lo); const R = 6371; const d = q.distanceKm / R; const br = q.bearing * Math.PI / 180; const p1 = la * Math.PI / 180; const l1 = lo * Math.PI / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
  const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  near(p2 * 180 / Math.PI, KAABA.lat, 0.3, `arrivée lat ${k}`); near(((l2 * 180 / Math.PI) + 540) % 360 - 180, KAABA.lon, 0.3, `arrivée lon ${k}`);
}
// Toutes les villes intégrées : cap entre 0 et 360, distance positive
for (const c of CITIES) { const q = qibla(c.lat, c.lon); ok(q.bearing >= 0 && q.bearing < 360 && q.distanceKm >= 0, `ville ${c.id}`); }
ok(qibla(KAABA.lat, KAABA.lon).distanceKm <= 1, 'sur place : distance nulle');

// --- Points cardinaux et rotation
ok(compassIndex(0) === 0 && compassIndex(119) === 3 && compassIndex(359) === 0 && compassIndex(270) === 6 && compassIndex(-90) === 6, 'points cardinaux');
ok(turnTo(350, 10) === 20 && turnTo(10, 350) === -20, 'écart court à travers le nord');
ok(Math.abs(turnTo(0, 180)) === 180, 'demi-tour');
ok(turnTo(100, 119) === 19 && turnTo(119, 100) === -19, 'écart simple');
near(turnTo(300, 119), 179, 0.001, 'écart 300 -> 119 (179 vers la droite)');
const s1 = smoothHeading(359, 1, 0.5); near(((s1 + 180) % 360) - 180, 0, 0.001, 'lissage à travers le nord');
ok(smoothHeading(null, 370) === 10, 'premier cap');

// --- Date hégirienne : repères du registre (Ramadan 1447 : 18/02/2026 → 19/03/2026)
let h = hijriOfCivil({ y: 2026, m: 2, d: 18 }); ok(h.year === 1447 && h.month === 9 && h.day === 1, `1er Ramadan 1447 : ${JSON.stringify(h)}`);
h = hijriOfCivil({ y: 2026, m: 3, d: 19 }); ok(h.year === 1447 && h.month === 9 && h.day === 30, `30 Ramadan : ${JSON.stringify(h)}`);
ok(HIJRI_OK === true, 'HIJRI_OK : le moteur sait calculer la date hégirienne (auto-contrôle)');
h = hijriOfCivil({ y: 2026, m: 3, d: 20 }); ok(h.month === 10 && h.day === 1, `1er Chawwal : ${JSON.stringify(h)}`);
const h0 = hijriOfCivil({ y: 2026, m: 11, d: 4 }); const h1 = hijriOfCivil({ y: 2026, m: 11, d: 4 }, 1); const hm1 = hijriOfCivil({ y: 2026, m: 11, d: 4 }, -1);
ok(h1.day === h0.day + 1 || h1.day === 1, 'décalage +1'); ok(hm1.day === h0.day - 1 || hm1.month !== h0.month, 'décalage -1');
ok(JSON.stringify(hijriOfCivil({ y: 2026, m: 11, d: 4 }, 99)) === JSON.stringify(hijriOfCivil({ y: 2026, m: 11, d: 4 }, 2)), 'décalage borné à ±2');
ok(isWhiteDay({ day: 13 }) && isWhiteDay({ day: 15 }) && !isWhiteDay({ day: 12 }) && !isWhiteDay({ day: 16 }), 'jours blancs');

// --- Calendrier du mois : identique au calcul du jour, 30 lignes en novembre
const lille = cityById('lille') || cityById('paris');
const p = { lat: lille.lat, lon: lille.lon, tz: lille.tz, method: 'uoif', asr: 'standard', highLat: 'angle' };
const rows = monthTable({ ...p, y: 2026, m: 11 });
ok(rows.length === 30, '30 jours en novembre'); ok(monthTable({ ...p, y: 2026, m: 2 }).length === 28 && monthTable({ ...p, y: 2028, m: 2 }).length === 29, 'février 28 / 29');
const t4 = dayTimes({ ...p, y: 2026, m: 11, d: 4 }); ok(rows[3].times.fajr === t4.fajr.getTime() && rows[3].times.isha === t4.isha.getTime(), 'ligne du 4 = calcul du jour');
ok(rows[0].dow === 0 && rows[3].dow === 3, 'jours de la semaine (1er nov 2026 = dimanche)');
for (const r of rows) { const t = r.times; ok(t.fajr < t.sunrise && t.sunrise < t.dhuhr && t.dhuhr < t.asr && t.asr < t.maghrib && t.maghrib < t.isha, `ordre des prières le ${r.d}`); }
ok(rows.filter((r) => r.white).length >= 3 && rows.filter((r) => r.white).length <= 6, 'jours blancs : 3 à 6 jours dans un mois civil');
for (let i = 1; i < rows.length; i += 1) { const a = rows[i - 1].hijri; const b = rows[i].hijri; ok((b.year === a.year && b.month === a.month && b.day === a.day + 1) || b.day === 1, `hégire continu ${rows[i].d}`); }
ok(shiftMonth({ y: 2026, m: 12 }, 1).y === 2027 && shiftMonth({ y: 2026, m: 12 }, 1).m === 1 && shiftMonth({ y: 2026, m: 1 }, -1).y === 2025 && shiftMonth({ y: 2026, m: 1 }, -1).m === 12, 'changement d\'année');
console.log(`${n} contrôles : TOUT EST OK`);
