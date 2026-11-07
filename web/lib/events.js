// Événements en direct (site) : décompte, adresse d'intégration, champ date/heure local.
export function countdownParts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

// « 2 j 03 h 15 min » ; sous une heure : « 12 min 05 s ». units = { d, h, m, s } (libellés traduits).
export function fmtCountdown(ms, u = { d: 'j', h: 'h', m: 'min', s: 's' }) {
  const c = countdownParts(ms); const p2 = (n) => String(n).padStart(2, '0');
  if (c.d > 0) return `${c.d} ${u.d} ${p2(c.h)} ${u.h} ${p2(c.m)} ${u.m}`;
  if (c.h > 0) return `${c.h} ${u.h} ${p2(c.m)} ${u.m}`;
  return `${c.m} ${u.m} ${p2(c.s)} ${u.s}`;
}

// Adresse du lecteur intégré (domaines déjà autorisés par la politique de sécurité du site). null si la source est inconnue.
export function embedSrc(video) {
  if (!video || !/^[\w-]{1,20}$/.test(String(video.ref))) return null;
  if (video.source === 'youtube' && /^[\w-]{11}$/.test(video.ref)) return `https://www.youtube-nocookie.com/embed/${video.ref}?autoplay=1&rel=0&playsinline=1`;
  if (video.source === 'vimeo' && /^\d+$/.test(video.ref)) return `https://player.vimeo.com/video/${video.ref}?autoplay=1`;
  return null;
}

// ISO (UTC) → valeur d'un champ « datetime-local » dans le fuseau de l'appareil, et retour.
export function toLocalInput(iso) {
  const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (v) => new Date(v).toISOString();
