// Horaires de prière calculés en interne (étape 23a) : aucun service extérieur, fonctionne hors connexion.
// Méthode astronomique classique (position du soleil, angles du crépuscule, ombre pour Asr), précision d'environ une minute.
// Les heures sont rendues en instants absolus (Date) : l'affichage choisit le fuseau avec Intl (voir fmtTime).
// Ce fichier n'a aucune dépendance : il est copié tel quel dans l'application (mobile/src/lib/prayerTimes.ts).

/** Méthodes de calcul. fajr / isha : angle du soleil sous l'horizon (degrés) ; ishaMin : minutes après Maghrib à la place d'un angle. */
export const METHODS = {
  uoif: { fajr: 12, isha: 12, label: 'UOIF (France)' },
  mwl: { fajr: 18, isha: 17, label: 'Ligue islamique mondiale' },
  umm: { fajr: 18.5, ishaMin: 90, label: 'Umm al-Qura (La Mecque)' },
  egypt: { fajr: 19.5, isha: 17.5, label: 'Autorité générale égyptienne' },
  turkey: { fajr: 18, isha: 17, adj: { sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7 }, label: 'Diyanet (Turquie)' },
  isna: { fajr: 15, isha: 15, label: 'ISNA (Amérique du Nord)' },
};
export const METHOD_IDS = Object.keys(METHODS);
export const HIGH_LAT_RULES = ['angle', 'middle', 'seventh'];
export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const sin = (d) => Math.sin(d * D2R);
const cos = (d) => Math.cos(d * D2R);
const tan = (d) => Math.tan(d * D2R);
const asin = (x) => Math.asin(x) * R2D;
const acos = (x) => Math.acos(x) * R2D;
const atan2 = (y, x) => Math.atan2(y, x) * R2D;
const acot = (x) => Math.atan(1 / x) * R2D;
const fixAngle = (a) => { a -= 360 * Math.floor(a / 360); return a; };
const fixHour = (h) => { h -= 24 * Math.floor(h / 24); return h; };

function julian(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

// Déclinaison du soleil et équation du temps.
function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = fixHour(atan2(cos(e) * sin(L), cos(L)) / 15);
  return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - RA };
}

/**
 * Horaires d'un jour civil à un endroit.
 * @param {{lat:number, lon:number, y:number, m:number, d:number, method?:string, asr?:'standard'|'hanafi', highLat?:string}} p
 * @returns {{fajr:Date, sunrise:Date, dhuhr:Date, asr:Date, maghrib:Date, isha:Date}}
 */
export function dayTimes({ lat, lon, y, m, d, method = 'uoif', asr = 'standard', highLat = 'angle' }) {
  const M = METHODS[method] || METHODS.uoif;
  const factor = asr === 'hanafi' ? 2 : 1;
  const jd = julian(y, m, d) - lon / (15 * 24);

  const midDay = (t) => fixHour(12 - sunPosition(jd + t).eqt);
  const angleTime = (angle, t, ccw) => {
    const decl = sunPosition(jd + t).decl;
    const dt = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
    return midDay(t) + (ccw ? -dt : dt);
  };
  const asrTime = (t) => {
    const decl = sunPosition(jd + t).decl;
    return angleTime(-acot(factor + tan(Math.abs(lat - decl))), t, false);
  };
  const compute = (tt) => {
    const t = tt.map((x) => x / 24);
    return {
      fajr: angleTime(M.fajr, t[0], true),
      sunrise: angleTime(0.833, t[1], true),
      dhuhr: midDay(t[2]),
      asr: asrTime(t[3]),
      sunset: angleTime(0.833, t[4], false),
      isha: M.ishaMin ? NaN : angleTime(M.isha, t[5], false),
    };
  };
  // Deux passes : la première donne des heures approchées, la seconde les affine.
  let r = compute([5, 5, 12, 13, 18, 18]);
  const keep = (v, fallback) => (Number.isNaN(v) ? fallback : v); // angle non atteint : on garde l'estimation de départ
  r = compute([keep(r.fajr, 4), keep(r.sunrise, 6), r.dhuhr, r.asr, keep(r.sunset, 18), keep(r.isha, 21)]);

  const maghrib = r.sunset;
  let { fajr, isha } = r;
  if (M.ishaMin) isha = maghrib + M.ishaMin / 60;

  // Latitudes élevées (été du nord) : quand l'angle n'est pas atteint, on prend une part de la nuit.
  const night = fixHour(r.sunrise - r.sunset);
  const portion = (angle) => (highLat === 'middle' ? 0.5 : highLat === 'seventh' ? 1 / 7 : angle / 60) * night;
  const diff = (a, b) => fixHour(b - a);
  if (Number.isNaN(fajr) || diff(fajr, r.sunrise) > portion(M.fajr)) fajr = r.sunrise - portion(M.fajr);
  if (!M.ishaMin && (Number.isNaN(isha) || diff(r.sunset, isha) > portion(M.isha))) isha = r.sunset + portion(M.isha);

  // Heure solaire locale -> instant UTC, avec les minutes de précaution propres à certaines méthodes (Diyanet).
  const adj = M.adj || {};
  const at = (h, k) => new Date(Date.UTC(y, m - 1, d) + (h - lon / 15) * 3_600_000 + (adj[k] || 0) * 60_000);
  return { fajr: at(fajr, 'fajr'), sunrise: at(r.sunrise, 'sunrise'), dhuhr: at(r.dhuhr, 'dhuhr'), asr: at(r.asr, 'asr'), maghrib: at(maghrib, 'maghrib'), isha: at(isha, 'isha') };
}

/** Jour civil {y, m, d} d'un instant dans un fuseau (IANA, ex. « Europe/Paris »). */
export function civilDate(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: g('year'), m: g('month'), d: g('day') };
}

/**
 * Prières (et lever du soleil, id « sunrise ») d'hier, d'aujourd'hui et de demain, triées : { id, at (ms) }.
 * Trois jours suffisent pour toujours connaître la prière en cours et la suivante.
 */
export function schedule(nowMs, { lat, lon, tz, method, asr, highLat }) {
  const base = civilDate(nowMs, tz);
  const out = [];
  for (const delta of [-1, 0, 1]) {
    const day = new Date(Date.UTC(base.y, base.m - 1, base.d + delta));
    const t = dayTimes({ lat, lon, y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate(), method, asr, highLat });
    for (const id of [...PRAYERS, 'sunrise']) out.push({ id, at: t[id].getTime() });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Heure d'un instant dans un fuseau : « 13:07 » (24 h) ou selon la langue. */
export function fmtTime(ms, tz, locale = 'fr') {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}
