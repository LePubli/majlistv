// Audyn — règles pures (testées avec Node, sans base ni stockage).
export const AUDIENCES = ['kids', 'adults', 'both'];
export const ACCESS = ['learning', 'free'];

const AUDIO = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a' };
const COVER = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const COVER_MAX_MB = 5;

/** Format audio accepté : { ext, type } ou null. MP3 recommandé ; le M4A doit être « faststart » pour que l'aperçu coupé reste lisible. */
export function audioInfo(contentType) {
  const ext = AUDIO[String(contentType || '').toLowerCase()];
  return ext ? { ext, type: ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4' } : null;
}
export function coverInfo(contentType) {
  const ext = COVER[String(contentType || '').toLowerCase()];
  return ext ? { ext, type: String(contentType).toLowerCase() } : null;
}

/** Nombre d'octets à servir pour un aperçu de `previewSec` secondes d'un fichier de `size` octets et `durationSec` secondes. */
export function previewBytes(size, durationSec, previewSec) {
  const s = Math.max(0, Math.floor(Number(size) || 0));
  const p = Math.max(1, Math.floor(Number(previewSec) || 0));
  const d = Math.floor(Number(durationSec) || 0);
  if (!s) return 0;
  // Durée connue : proportion + 3 % de marge + 8 Ko (en-têtes) ; sinon on suppose 256 kb/s au plus (32 000 octets par seconde).
  const n = d > 0 ? Math.ceil(s * Math.min(1, p / d) * 1.03) + 8192 : p * 32000;
  return Math.min(s, n);
}

/** Texte nettoyé : espaces superflus retirés, longueur bornée. */
export const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Nouvel ordre des chapitres : `ids` doit contenir exactement les mêmes chapitres que `current`. Renvoie la liste, ou null. */
export function validOrder(ids, current) {
  if (!Array.isArray(ids) || ids.length !== current.length) return null;
  const set = new Set(current);
  if (new Set(ids).size !== ids.length || !ids.every((i) => set.has(i))) return null;
  return ids;
}

/** Un contenu peut-il être publié ? Message d'erreur en français, ou null. */
export function publishError(item, chapters) {
  if (!item.title || !String(item.title).trim()) return 'Le titre est obligatoire';
  if (!chapters.length) return 'Ajoutez au moins un chapitre (fichier audio) avant de publier';
  return null;
}

/** Accès complet ? Contenu ouvert à tous, ou membre de la formule « Apprentissage ». */
export const fullAccess = (item, hasLearning) => item.access === 'free' || Boolean(hasLearning);

export const sumDuration = (chapters) => chapters.reduce((a, c) => a + (Number(c.duration_seconds ?? c.durationSeconds) || 0), 0);
