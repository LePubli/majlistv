// Éditeur de montage (étape E5d) : aides de la page « Extraits 9:16 » pour le cadre qui suit le visage.
// Même calcul que api/src/modules/editor/follow.js (la trajectoire vient du serveur ; ici on ne fait que la lire et créer des corrections).
export const MIN_MANUAL = 0.5;  // durée minimale d'une correction (secondes)
export const NEW_MANUAL = 3;    // durée d'une correction créée en glissant le cadre
const r1 = (x) => Math.round(x * 10) / 10;

// Position du cadre (0..100) à l'instant t, sur une trajectoire [{ t, x }] : ligne droite entre deux points.
export function pathAt(path, t) {
  if (!path?.length) return 50;
  if (t <= path[0].t) return path[0].x;
  for (let i = 1; i < path.length; i++) {
    if (t <= path[i].t) {
      const a = path[i - 1]; const b = path[i];
      return b.t === a.t ? b.x : a.x + (b.x - a.x) * ((t - a.t) / (b.t - a.t));
    }
  }
  return path[path.length - 1].x;
}

// Position affichée du cadre : pendant un glissement, la position de la souris ; avec suivi ou corrections, la trajectoire ; sinon le cadre fixe.
export function frameAt(form, path, t, drag = null) {
  if (drag != null) return drag;
  if (form && (form.follow || form.manual?.length) && path?.length) return pathAt(path, t);
  return form ? form.cropX : 50;
}

// Nouvelle correction qui commence à l'instant `at` (dans [from, end]) : 3 s au plus, sans chevaucher les autres. null s'il n'y a pas la place.
export function makeManual(list, at, end, x) {
  const sorted = [...list].sort((a, b) => a.from - b.from);
  if (sorted.some((m) => at >= m.from && at < m.to)) return null;
  let to = Math.min(end, at + NEW_MANUAL);
  const next = sorted.find((m) => m.from > at);
  if (next) to = Math.min(to, next.from);
  const from = r1(at); to = Math.floor(to * 10) / 10;
  if (to - from < MIN_MANUAL - 1e-9) return null;
  return { from, to, x: r1(Math.max(0, Math.min(100, x))) };
}
