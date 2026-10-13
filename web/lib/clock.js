// Minutes d'une vidéo : millisecondes <-> « 12:30 » / « 1:02:30 ».
export const clock = (ms) => {
  const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${m}:${p(s % 60)}`;
};
// Renvoie les millisecondes, ou null si la saisie est invalide.
export const parseClock = (v) => {
  const m = String(v).trim().match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/);
  if (!m || Number(m[3]) > 59) return null;
  return ((Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3])) * 1000;
};
