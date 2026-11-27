// Fonctions pures de réorganisation (utilisées par SortableList et testées à part).

// Déplace l'élément `from` à la place `to` (0 = tout en haut) sans modifier le tableau d'origine.
export function moveItem(list, from, to) {
  const a = [...list];
  if (from < 0 || from >= a.length) return a;
  const t = Math.max(0, Math.min(a.length - 1, to));
  const [x] = a.splice(from, 1);
  a.splice(t, 0, x);
  return a;
}

// Ordre « naturel » des titres : Épisode 2 avant Épisode 10.
export const byTitle = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr', { numeric: true, sensitivity: 'base' });
