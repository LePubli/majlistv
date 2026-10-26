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

/** Clé de stockage d'un visuel : ads/<uuid>.<ext>. */
export const MEDIA_KEY_RE = /^ads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|mp4|webm)$/;
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
