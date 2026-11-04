// Page Prière de l'application : Qibla, date hégirienne, calendrier du mois, cap de la boussole (mêmes résultats que le site).
import test from 'node:test';
import assert from 'node:assert/strict';
import { HIJRI_OK, compassIndex, hijriOfCivil, monthTable, qibla, shiftMonth, smoothHeading, turnTo } from '../src/lib/prayer/prayerExtras';
import { headingOf } from '../src/lib/compassHeading';

test('Qibla : Paris ≈ 119°, New York ≈ 58,5°, Tokyo ≈ 293°', () => {
  assert.ok(Math.abs(qibla(48.8566, 2.3522).bearing - 119.1) < 0.6);
  assert.ok(Math.abs(qibla(40.7128, -74.006).bearing - 58.5) < 0.6);
  assert.ok(Math.abs(qibla(35.6762, 139.6503).bearing - 293) < 0.6);
  const d = qibla(48.8566, 2.3522).distanceKm;
  assert.ok(d > 4400 && d < 4600, `distance ${d}`);
});

test('date hégirienne : 18/02/2026 = 1er Ramadan 1447 et l\'appareil de test sait la calculer', () => {
  assert.equal(HIJRI_OK, true);
  assert.deepEqual(hijriOfCivil({ y: 2026, m: 2, d: 18 }), { year: 1447, month: 9, day: 1 });
  assert.deepEqual(hijriOfCivil({ y: 2026, m: 2, d: 18 }, 1), { year: 1447, month: 9, day: 2 }); // décalage de l'administrateur
  assert.deepEqual(hijriOfCivil({ y: 2026, m: 2, d: 18 }, 9), { year: 1447, month: 9, day: 3 }); // plafonné à +2
});

test('calendrier du mois : 30 jours en novembre, jours blancs 13-15, horaires croissants', () => {
  const rows = monthTable({ lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris', method: 'UOIF', asr: 'standard', y: 2026, m: 11 });
  assert.equal(rows.length, 30);
  for (const r of rows) {
    assert.equal(r.white, r.hijri.day >= 13 && r.hijri.day <= 15);
    const x = r.times; assert.ok(x.fajr < x.sunrise && x.sunrise < x.dhuhr && x.dhuhr < x.asr && x.asr < x.maghrib && x.maghrib < x.isha, `jour ${r.d}`);
  }
  assert.deepEqual(shiftMonth({ y: 2026, m: 12 }, 1), { y: 2027, m: 1 });
  assert.deepEqual(shiftMonth({ y: 2026, m: 1 }, -1), { y: 2025, m: 12 });
});

test('boussole : sens de rotation, lissage, point cardinal', () => {
  assert.equal(turnTo(20, 119), 99);                 // à droite
  assert.equal(turnTo(300, 119), 179);               // chemin le plus court
  assert.equal(turnTo(119, 119), 0);
  assert.ok(turnTo(350, 10) === 20 && turnTo(10, 350) === -20);
  assert.equal(smoothHeading(null, 40), 40);
  const s = smoothHeading(350, 10); assert.ok(s > 350 || s < 10, 'lissage à travers le nord');
  assert.equal(compassIndex(119), 3);                // sud-est
});

test('cap du téléphone : nord géographique d\'abord, sinon magnétique, sinon rien', () => {
  assert.equal(headingOf({ trueHeading: 123.4, magHeading: 120 }), 123.4);
  assert.equal(headingOf({ trueHeading: -1, magHeading: 120 }), 120);
  assert.equal(headingOf({ trueHeading: -1, magHeading: -1 }), null);
  assert.equal(headingOf({ trueHeading: 360, magHeading: 0 }), 0);
  assert.equal(headingOf({ trueHeading: Number.NaN, magHeading: Number.NaN }), null);
  assert.equal(headingOf(null), null);
});
