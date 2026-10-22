// COPIE de web/lib/prayerLogic.js — ne pas modifier ici : node scripts/import-prayer.mjs
// Logique pure de la fonction Prière (étape 23a) : préférences, prière en cours / suivante, fenêtre de pause, compte à rebours.
// Sans React ni navigateur : testée avec Node (web/tests/prayer.mjs) et copiée dans l'application.
import { METHOD_IDS, HIGH_LAT_RULES, PRAYERS, schedule } from './prayerTimes.js';
import { cityById, cityForTimezone, DEFAULT_CITY } from './prayerCities.js';

/** Réglages de l'administrateur (GET /config → prayer) avec valeurs de secours. */
export function normalizeConfig(cfg) {
  const c = cfg || {};
  const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
  const maxBlock = num(c.maxBlockMinutes, 30, 1, 120);
  return {
    defaultEnabled: c.defaultEnabled !== false,
    pill: c.pill !== false,
    method: METHOD_IDS.includes(c.method) ? c.method : 'uoif',
    asr: c.asr === 'hanafi' ? 'hanafi' : 'standard',
    maxBlockMinutes: maxBlock,
    blockMinutes: Math.min(maxBlock, num(c.blockMinutes, 10, 1, 120)),
    city: cityById(c.city) ? c.city : DEFAULT_CITY,
  };
}

/** Préférences d'une personne : valeurs par défaut de l'administrateur, puis ce qu'elle a choisi (jamais une valeur hors limites). */
export function resolvePrefs(stored, cfgIn, deviceTz) {
  const cfg = normalizeConfig(cfgIn);
  const s = stored && typeof stored === 'object' ? stored : {};
  const city = cityForTimezone(deviceTz, cfg.city);
  let loc;
  if (s.loc && s.loc.mode === 'geo' && Number.isFinite(s.loc.lat) && Number.isFinite(s.loc.lon) && Math.abs(s.loc.lat) <= 90 && Math.abs(s.loc.lon) <= 180) {
    // Position de l'appareil, arrondie à 0,1° (≈ 11 km) : suffisant pour les horaires et peu précis pour la vie privée.
    loc = { mode: 'geo', lat: Math.round(s.loc.lat * 10) / 10, lon: Math.round(s.loc.lon * 10) / 10, tz: validTz(s.loc.tz) || deviceTz || city.tz, name: String(s.loc.name || '').slice(0, 80) };
  } else if (s.loc && s.loc.mode === 'city' && cityById(s.loc.city)) {
    const c = cityById(s.loc.city);
    loc = { mode: 'city', city: c.id, lat: c.lat, lon: c.lon, tz: c.tz, name: c.name };
  } else {
    loc = { mode: 'auto', city: city.id, lat: city.lat, lon: city.lon, tz: city.tz, name: city.name };
  }
  const prayers = {};
  for (const id of PRAYERS) prayers[id] = !(s.prayers && s.prayers[id] === false);
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : cfg.defaultEnabled,
    pill: typeof s.pill === 'boolean' ? s.pill : cfg.pill,
    method: METHOD_IDS.includes(s.method) ? s.method : cfg.method,
    asr: s.asr === 'hanafi' || s.asr === 'standard' ? s.asr : cfg.asr,
    highLat: HIGH_LAT_RULES.includes(s.highLat) ? s.highLat : 'angle',
    blockMinutes: Math.min(cfg.maxBlockMinutes, Math.max(1, Math.round(Number(s.blockMinutes)) || cfg.blockMinutes)),
    prayers,
    loc,
  };
}

/** Ce qu'on enregistre : uniquement les choix, jamais le détail calculé. */
export function storable(prefs) {
  const { enabled, pill, method, asr, highLat, blockMinutes, prayers, loc } = prefs;
  return { enabled, pill, method, asr, highLat, blockMinutes, prayers, loc: loc.mode === 'geo' ? { mode: 'geo', lat: loc.lat, lon: loc.lon, tz: loc.tz, name: loc.name } : loc.mode === 'city' ? { mode: 'city', city: loc.city } : { mode: 'auto' } };
}

function validTz(tz) {
  try { if (tz) { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } } catch { /* fuseau inconnu */ }
  return null;
}
export { validTz };

/** Horaires utiles pour les prochains jours, limités aux prières choisies. */
export function buildSchedule(nowMs, prefs) {
  return schedule(nowMs, { lat: prefs.loc.lat, lon: prefs.loc.lon, tz: prefs.loc.tz, method: prefs.method, asr: prefs.asr, highLat: prefs.highLat });
}

/**
 * Où en est-on ?
 *  - next    : la prochaine des cinq prières ({ id, at }), affichée dans la pastille ; le lever du soleil n'en est pas une.
 *  - current : la prière dont la fenêtre de pause est ouverte ({ id, at, endsAt, key }), sinon null.
 *              Seules les prières cochées dans les réglages déclenchent la pause.
 */
export function statusAt(items, nowMs, prefs) {
  const wanted = items.filter((p) => prefs.prayers[p.id]);
  const blockMs = prefs.blockMinutes * 60_000;
  const next = items.find((p) => PRAYERS.includes(p.id) && p.at > nowMs) || null;
  const last = [...wanted].reverse().find((p) => p.at <= nowMs) || null;
  const current = last && nowMs < last.at + blockMs ? { id: last.id, at: last.at, endsAt: last.at + blockMs, key: prayerKey(last) } : null;
  return { next, current };
}

/** Identifiant d'une prière précise (nom + minute) : sert à ne demander qu'une fois par prière. */
export const prayerKey = (p) => `${p.id}@${Math.floor(p.at / 60_000)}`;

/** Compte à rebours : « 1 h 24 » au-dessus d'une heure, « 34:12 » en dessous. */
export function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h} h ${p(m)}` : `${p(m)}:${p(sec)}`;
}

/** Les 10 dernières prières déjà traitées (« J'ai prié », « Continuer », fin de la pause) : { clé: instant }. */
export function rememberDone(done, key, nowMs) {
  const next = { ...(done || {}), [key]: nowMs };
  const keys = Object.keys(next).sort((a, b) => next[b] - next[a]).slice(0, 10);
  return Object.fromEntries(keys.map((k) => [k, next[k]]));
}
