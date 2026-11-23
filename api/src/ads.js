// Étape 24c — publicité au lancement : règles pures (testées sans base) utilisées par routes/ads.js.

export const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm' };
export const IMAGE_MAX_MB = 8;
export const VIDEO_MAX_MB = 40;

/** { kind, ext, maxMb } d'un type de fichier accepté, sinon null. */
export function mediaInfo(contentType) {
  const t = String(contentType || '').toLowerCase();
  if (IMAGE_TYPES[t]) return { kind: 'image', ext: IMAGE_TYPES[t], maxMb: IMAGE_MAX_MB, type: t };
  if (VIDEO_TYPES[t]) return { kind: 'video', ext: VIDEO_TYPES[t], maxMb: VIDEO_MAX_MB, type: t };
  return null;
}

/** Clé de stockage d'un visuel : campaigns/<uuid>.<ext> (ads/… accepté : ancien nom). */
export const MEDIA_KEY_RE = /^(?:campaigns|ads)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|mp4|webm)$/;
export const keyInfo = (key) => {
  const m = MEDIA_KEY_RE.exec(String(key || ''));
  if (!m) return null;
  const ext = m[1];
  const type = Object.entries({ ...IMAGE_TYPES, ...VIDEO_TYPES }).find(([, e]) => e === ext)[0];
  return mediaInfo(type);
};

/** Lien d'une publicité : http(s) seulement (jamais javascript:, intent:, etc.). Renvoie l'adresse nettoyée ou null. */
export function safeLink(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

/** Situation d'une publicité à l'instant `now` : paused | scheduled | ended | live. */
export function adStatus(ad, now = new Date()) {
  if (!ad.active) return 'paused';
  const t = now.getTime();
  if (ad.starts_at && new Date(ad.starts_at).getTime() > t) return 'scheduled';
  if (ad.ends_at && new Date(ad.ends_at).getTime() <= t) return 'ended';
  return 'live';
}

/**
 * Rotation : parmi les publicités en cours (déjà triées dans l'ordre fixe), prend `count` publicités à la suite de celle montrée
 * en dernier (`afterId`), en reprenant au début après la dernière. Dernière inconnue (ou supprimée) → on commence au début.
 */
export function pickAds(live, afterId, count) {
  if (!live.length) return [];
  const n = Math.min(Math.max(1, Math.floor(count) || 1), live.length);
  const at = live.findIndex((a) => a.id === afterId);
  const start = at < 0 ? 0 : (at + 1) % live.length;
  return Array.from({ length: n }, (_, i) => live[(start + i) % live.length]);
}

/** Taux de clic en % (une décimale) ; 0 sans affichage. */
export const clickRate = (impressions, clicks) => (impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : 0);

// ---- Ciblage par langue (amélioration 5.3) ----
export const AD_LANGS = ['fr', 'en', 'ar'];
/** « fr-FR », « EN », « ar » → 'fr' | 'en' | 'ar' ; toute autre valeur (ou rien) → '' (langue inconnue). */
export const normLang = (v) => { const l = String(v ?? '').trim().toLowerCase().slice(0, 2); return AD_LANGS.includes(l) ? l : ''; };
/** Une publicité sans langue choisie est montrée partout ; langue inconnue (version ancienne de l'application) : montrée aussi. */
export const matchesLang = (languages, lang) => !languages || languages.length === 0 || !lang || languages.includes(lang);
/** Répartition par langue : une ligne par langue (fr, en, ar) + « none » (sans langue) = total général − langues connues. */
export function langBreakdown(total, rows) {
  const out = Object.fromEntries([...AD_LANGS, 'none'].map((k) => [k, { impressions: 0, clicks: 0, skips: 0 }]));
  for (const r of rows) if (AD_LANGS.includes(r.lang)) { out[r.lang].impressions += r.impressions; out[r.lang].clicks += r.clicks; out[r.lang].skips += r.skips; }
  for (const k of ['impressions', 'clicks', 'skips']) out.none[k] = Math.max(0, total[k] - AD_LANGS.reduce((s, l) => s + out[l][k], 0));
  return out;
}

// ---- Ciblage par pays (fuseau horaire du téléphone) et par appareil ----
// Le pays est APPROXIMATIF : il est déduit du fuseau horaire réglé sur le téléphone (aucune adresse IP n'est analysée ni conservée).
export const TZ_COUNTRY = {
  'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Luxembourg': 'LU', 'Europe/Zurich': 'CH', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES',
  'Europe/Lisbon': 'PT', 'Europe/Rome': 'IT', 'Europe/Berlin': 'DE', 'Europe/Amsterdam': 'NL', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Vienna': 'AT', 'Europe/Warsaw': 'PL', 'Europe/Istanbul': 'TR',
  'Europe/Athens': 'GR', 'Europe/Moscow': 'RU',
  'Africa/Casablanca': 'MA', 'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN', 'Africa/Cairo': 'EG', 'Africa/Tripoli': 'LY', 'Africa/Dakar': 'SN',
  'Africa/Abidjan': 'CI', 'Africa/Lagos': 'NG', 'Africa/Nouakchott': 'MR', 'Africa/Bamako': 'ML', 'Africa/Douala': 'CM', 'Africa/Johannesburg': 'ZA',
  'Asia/Riyadh': 'SA', 'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM', 'Asia/Baghdad': 'IQ',
  'Asia/Amman': 'JO', 'Asia/Beirut': 'LB', 'Asia/Damascus': 'SY', 'Asia/Jerusalem': 'IL', 'Asia/Karachi': 'PK', 'Asia/Jakarta': 'ID',
  'Asia/Kuala_Lumpur': 'MY', 'Asia/Singapore': 'SG', 'Asia/Dhaka': 'BD', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Tehran': 'IR',
  'America/Toronto': 'CA', 'America/Montreal': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Halifax': 'CA',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US',
  'America/Sao_Paulo': 'BR', 'America/Martinique': 'MQ', 'America/Guadeloupe': 'GP', 'America/Cayenne': 'GF', 'Indian/Reunion': 'RE', 'Indian/Mayotte': 'YT',
  'Australia/Sydney': 'AU', 'Pacific/Auckland': 'NZ',
};
/** Pays proposés dans l'administration (code, libellé) — ceux qu'on sait reconnaître. */
export const AD_COUNTRIES = [
  ['FR', 'France'], ['BE', 'Belgique'], ['CH', 'Suisse'], ['LU', 'Luxembourg'], ['CA', 'Canada'], ['MA', 'Maroc'], ['DZ', 'Algérie'], ['TN', 'Tunisie'],
  ['SN', 'Sénégal'], ['CI', "Côte d'Ivoire"], ['SA', 'Arabie saoudite'], ['AE', 'Émirats arabes unis'], ['QA', 'Qatar'], ['KW', 'Koweït'], ['EG', 'Égypte'],
  ['GB', 'Royaume-Uni'], ['DE', 'Allemagne'], ['ES', 'Espagne'], ['IT', 'Italie'], ['NL', 'Pays-Bas'], ['TR', 'Turquie'], ['US', 'États-Unis'],
  ['MQ', 'Martinique'], ['GP', 'Guadeloupe'], ['RE', 'La Réunion'],
];
export const AD_COUNTRY_CODES = AD_COUNTRIES.map((c) => c[0]);
/** « Europe/Paris » → 'FR' ; fuseau inconnu ou absent → '' (pays inconnu). */
export const tzToCountry = (tz) => TZ_COUNTRY[String(tz ?? '').trim()] || '';
export const AD_DEVICES = ['android', 'ios', 'tv', 'web'];
/** 'Android', 'iOS', 'tv', 'web' → valeur connue ; sinon '' (appareil inconnu). */
export const normDevice = (v) => { const d = String(v ?? '').trim().toLowerCase(); return AD_DEVICES.includes(d) ? d : ''; };
/** Publicité sans pays choisi : montrée partout. Avec pays : montrée seulement si le pays est connu ET choisi (inconnu → pas de publicité ciblée). */
export const matchesCountry = (countries, country) => !countries || countries.length === 0 || (Boolean(country) && countries.includes(country));
export const matchesDevice = (devices, device) => !devices || devices.length === 0 || (Boolean(device) && devices.includes(device));
/** Durée moyenne en secondes (une décimale) et taux d'aller-au-bout en %. */
export const avgSeconds = (watchMs, n) => (n > 0 ? Math.round(watchMs / n / 100) / 10 : 0);
export const completionRate = (completed, n) => (n > 0 ? Math.round((completed / n) * 1000) / 10 : 0);
/** Ajoute ?ad=<id> aux liens qui mènent vers notre propre site (mesure des inscriptions) ; les autres liens ne sont jamais modifiés. */
export function trackedLink(link, adId, webUrl) {
  try {
    const u = new URL(link); const w = new URL(webUrl);
    if (u.host !== w.host) return link;
    u.searchParams.set('ad', adId);
    return u.toString();
  } catch { return link; }
}
