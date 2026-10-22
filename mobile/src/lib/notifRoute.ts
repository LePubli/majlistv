// Page de l'application à ouvrir quand on touche une notification du serveur. Le serveur envoie un chemin « du site »
// (/conferences/<slug>, /learning, /collections/<id>, /) ; ici on le traduit en écran de l'application.
// Fonction pure : testée avec Node (tests/notif.test.ts).

/** Écran visé ; '/' = accueil. Jamais d'adresse extérieure : tout ce qui n'est pas reconnu mène à l'accueil. */
export function routeForPath(path: unknown): string {
  const p = typeof path === 'string' ? path.trim() : '';
  if (!p.startsWith('/') || p.startsWith('//') || p.length > 300) return '/';
  const [clean] = p.split(/[?#]/);
  const seg = clean.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return ''; } });
  const safe = (s: string | undefined) => (s && /^[A-Za-z0-9_-]{1,120}$/.test(s) ? s : null);
  if (seg[0] === 'conferences' && safe(seg[1])) return `/talk/${safe(seg[1])}`;
  if (seg[0] === 'collections' && safe(seg[1])) return `/collections/${safe(seg[1])}`;
  if (seg[0] === 'intervenants' && safe(seg[1])) return `/speaker/${safe(seg[1])}`;
  if (seg[0] === 'learning') return '/learn';
  return '/';
}
