// Noms de catégories dans la langue du visiteur (23/11/2026).
// L'API ajoute aux cartes de vidéos / séries un `categoryTr` ({ en, ar } : nom complet traduit, seulement si la catégorie a une traduction)
// et, dans la liste des catégories, `nameTr` / `fullNameTr`. Cette fonction remplace `category`, `name` et `fullName` par la version traduite
// quand elle existe ; sinon le français reste (jamais de texte vide). Appelée une fois par la fonction `call` du site : aucun écran à modifier.
// Le français et l'administration (Studio, Admin) ne sont jamais touchés : ils gardent le nom d'origine.
const SKIP = /^\/(admin|studio|categories\/|me\/talks)|catalogue=all/;

export function localizeCatNames(data, locale, path = '') {
  if (!locale || locale === 'fr' || SKIP.test(path)) return data;
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 8) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
    const pick = (tr) => (tr && typeof tr === 'object' && typeof tr[locale] === 'string' && tr[locale].trim() ? tr[locale] : null);
    const c = pick(o.categoryTr); if (c) o.category = c;
    const f = pick(o.fullNameTr); if (f) o.fullName = f;
    const n = pick(o.nameTr); if (n) o.name = n;
    for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object' && !k.endsWith('Tr')) walk(v, depth + 1); }
  };
  walk(data, 0);
  return data;
}
