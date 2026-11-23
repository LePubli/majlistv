// Noms de catégories dans la langue de l'utilisateur (23/11/2026) — même logique que web/lib/catNames.js.
// L'API ajoute aux cartes un `categoryTr` ({ en, ar } : nom complet traduit, seulement si la catégorie a une traduction) ; on remplace
// `category` par cette version quand elle existe, sinon le français reste. Appelée une fois par le client d'API : aucun écran à modifier.
const SKIP = /^\/(admin|studio|categories\/|me\/talks)|catalogue=all/;

type Tr = Record<string, unknown> | null | undefined;
const pick = (tr: unknown, locale: string): string | null => {
  const v = tr && typeof tr === 'object' ? (tr as Record<string, unknown>)[locale] : null;
  return typeof v === 'string' && v.trim() ? v : null;
};

export function localizeCatNames<T>(data: T, locale: string | undefined, path = ''): T {
  if (!locale || locale === 'fr' || SKIP.test(path)) return data;
  const walk = (o: unknown, depth: number): void => {
    if (!o || typeof o !== 'object' || depth > 8) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
    const r = o as Record<string, unknown>;
    const c = pick(r.categoryTr as Tr, locale); if (c) r.category = c;
    const f = pick(r.fullNameTr as Tr, locale); if (f) r.fullName = f;
    const n = pick(r.nameTr as Tr, locale); if (n) r.name = n;
    for (const k of Object.keys(r)) { const v = r[k]; if (v && typeof v === 'object' && !k.endsWith('Tr')) walk(v, depth + 1); }
  };
  walk(data, 0);
  return data;
}
