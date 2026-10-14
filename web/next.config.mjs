/** @type {import('next').NextConfig} */

// En-têtes de sécurité du site public.
// Le nginx du serveur en pose déjà une partie (HSTS, X-Frame-Options…) ; les répéter ici garantit
// qu'ils sont présents même si le site est servi autrement (test local, autre hébergement, prévisualisation).
// Pas de Content-Security-Policy pour l'instant : le site intègre les lecteurs YouTube et Vimeo, et une
// CSP mal réglée empêcherait les vidéos de se lancer. À ajouter dans une étape dédiée, avec test de la
// lecture sur les trois sources (fichier envoyé, YouTube, Vimeo) — voir README, section Sécurité.
const securityHeaders = [
  // Empêche le navigateur de « devenir » le type de fichier annoncé (attaques par type MIME).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Le site ne peut pas être affiché dans un cadre sur un autre domaine (clickjacking).
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // L'adresse complète de la page n'est pas transmise aux sites externes.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Aucune page n'a besoin de la caméra, du micro ni de la position.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Impose HTTPS pendant un an (le certificat est géré par le serveur).
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

export default {
  output: 'standalone',
  // N'annonce pas la technologie du site (l'en-tête « X-Powered-By: Next.js » renseigne un attaquant
  // sur la pile à cibler).
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
