// Utilitaires de navigation : on n'accepte que des chemins du site (jamais un lien externe).
export const safePath = (p, fallback = '') => (typeof p === 'string' && /^\/(?![\/\\])/.test(p) ? p : fallback);

// Chemin de la page des formules, avec retour vers la page d'origine (ex. la conférence qui a donné envie de s'abonner).
export const pricingPath = (from) => (safePath(from) ? `/pricing?from=${encodeURIComponent(from)}` : '/pricing');

// Chemin d'inscription / de connexion qui ramène ensuite vers `next`.
export const authPath = (kind, next) => `/${kind}?next=${encodeURIComponent(next)}`;
