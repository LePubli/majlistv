// Image d'une catégorie envoyée depuis l'admin : l'API la donne en adresse relative au SITE (« /api/catalogue/category-image/12/image?v=… »).
// Sur l'appli on la rend absolue : « /api/… » passe par l'adresse de l'API (sans le préfixe /api), un autre chemin par celle du site.
// Fonction pure : les adresses du serveur sont passées en paramètre (testable sans l'environnement Expo).
export function catImageUrl(v: string | null | undefined, apiUrl: string, siteUrl: string): string | null {
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('/api/')) return apiUrl + v.slice(4);
  if (v.startsWith('/')) return siteUrl + v;
  return null;
}

// Images d'ambiance de secours (même idée que le site) : tirage stable par thème, pour qu'une tuile garde son image d'une visite à l'autre.
export const CAT_FALLBACK_COLORS: [string, string][] = [
  ['#13294b', '#0b1220'], ['#1b2a5a', '#0b1220'], ['#12384a', '#0b1220'], ['#2a2150', '#0b1220'], ['#1a3b3a', '#0b1220'], ['#3a2a1a', '#0b1220'],
];
export const catFallback = (id: number) => CAT_FALLBACK_COLORS[Math.abs(id) % CAT_FALLBACK_COLORS.length];
