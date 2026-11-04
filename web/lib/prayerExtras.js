// Amélioration 4.3 — Prière complète : direction de la Qibla, date hégirienne, calendrier du mois.
// Logique pure (aucune dépendance, ni React ni navigateur) : testée avec Node (web/tests/prayer_extras.mjs).
import { dayTimes } from './prayerTimes.js';

/** Kaaba (La Mecque), en degrés. */
export const KAABA = { lat: 21.4225, lon: 39.8262 };
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/**
 * Direction de la Qibla depuis un lieu : cap initial du grand cercle (0° = nord, sens des aiguilles d'une montre) et distance en km.
 * @returns {{ bearing: number, distanceKm: number }}
 */
export function qibla(lat, lon) {
  const p1 = lat * D2R; const p2 = KAABA.lat * D2R;
  const dl = (KAABA.lon - lon) * D2R;
  const y = Math.sin(dl);
  const x = Math.cos(p1) * Math.tan(p2) - Math.sin(p1) * Math.cos(dl);
  const bearing = (Math.atan2(y, x) * R2D + 360) % 360;
  // Distance (haversine, rayon moyen 6371 km).
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const distanceKm = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
  return { bearing: Math.round(bearing * 10) / 10, distanceKm: Math.round(distanceKm) };
}

/** Point cardinal le plus proche d'un cap : 0 N, 1 NE, 2 E, 3 SE, 4 S, 5 SO, 6 O, 7 NO. */
export const compassIndex = (bearing) => Math.round((((bearing % 360) + 360) % 360) / 45) % 8;

/** Écart le plus court entre deux caps, signé : positif = tourner vers la droite. Résultat entre -180 et 180. */
export function turnTo(heading, target) {
  const d = (((target - heading) % 360) + 540) % 360 - 180;
  return Math.round(d * 10) / 10;
}

/** Lissage d'un cap qui bouge (la boussole d'un téléphone tremble) : moyenne sur le plus court chemin. */
export function smoothHeading(prev, next, k = 0.25) {
  if (prev == null) return ((next % 360) + 360) % 360;
  return (((prev + turnTo(prev, next) * k) % 360) + 360) % 360;
}

const DAY = 86400000;
const hfmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });

/**
 * Date hégirienne (Umm al-Qura) d'un jour civil {y, m, d}, décalée de `offsetDays` (-2 à +2 : réglage de l'administrateur).
 * Le calendrier Umm al-Qura est un calcul : il peut différer d'un jour de l'observation de la lune dans le pays de la personne.
 */
export function hijriOfCivil({ y, m, d }, offsetDays = 0) {
  const off = Math.max(-2, Math.min(2, Math.round(Number(offsetDays)) || 0));
  const noon = Date.UTC(y, m - 1, d, 12) + off * DAY;
  const p = Object.fromEntries(hfmt.formatToParts(new Date(noon)).map((x) => [x.type, x.value]));
  return { year: parseInt(p.year, 10), month: parseInt(p.month, 10), day: parseInt(p.day, 10) };
}

/** « Jours blancs » : 13, 14 et 15 de chaque mois hégirien (jeûne recommandé). */
export const isWhiteDay = (h) => h.day >= 13 && h.day <= 15;

/**
 * Calendrier d'un mois civil : une ligne par jour avec la date hégirienne et les horaires (instants en ms).
 * @param {{lat:number, lon:number, tz:string, method:string, asr:string, highLat?:string, y:number, m:number, hijriOffset?:number}} p
 */
export function monthTable({ lat, lon, method, asr, highLat, y, m, hijriOffset = 0 }) {
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const rows = [];
  for (let d = 1; d <= n; d += 1) {
    const t = dayTimes({ lat, lon, y, m, d, method, asr, highLat });
    const hijri = hijriOfCivil({ y, m, d }, hijriOffset);
    rows.push({
      d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), hijri, white: isWhiteDay(hijri),
      times: { fajr: t.fajr.getTime(), sunrise: t.sunrise.getTime(), dhuhr: t.dhuhr.getTime(), asr: t.asr.getTime(), maghrib: t.maghrib.getTime(), isha: t.isha.getTime() },
    });
  }
  return rows;
}

/** Mois civil précédent / suivant d'un couple {y, m}. */
export const shiftMonth = ({ y, m }, delta) => { const i = y * 12 + (m - 1) + delta; return { y: Math.floor(i / 12), m: (i % 12) + 1 }; };
