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
  if (seg[0] === 'ramadan' && !seg[1]) return '/ramadan'; // rappel du circuit (étape M4)
  if (seg[0] === 'kids' && !seg[1]) return '/kids'; // un enfant attend une validation (étape M4)
  if (seg[0] === 'learning' && /[?&]tab=athkar\b/.test(p)) return '/athkar'; // rappel des athkar (étape M3)
  // Apprendre (étape M5) : la section demandée (?tab=rev, cards, bilan…) est gardée si elle est connue.
  if (seg[0] === 'learning') {
    const tab = /[?&]tab=([a-z]{2,8})\b/.exec(p)?.[1];
    return tab && ['dash', 'quran', 'path', 'rev', 'cards', 'commit', 'bilan', 'att'].includes(tab) ? `/learn?tab=${tab}` : /#bilan$/.test(p) ? '/learn?tab=bilan' : '/learn';
  }
  // Coran (étape M2) : /coran, /coran/<sourate>#v<verset> (rappel de la lecture en 30 jours).
  if (seg[0] === 'coran' && !seg[1]) return '/quran';
  if (seg[0] === 'coran' && /^\d{1,3}$/.test(seg[1] ?? '') && Number(seg[1]) >= 1 && Number(seg[1]) <= 114) {
    const aya = /#v(\d{1,3})$/.exec(p)?.[1];
    return `/quran/${Number(seg[1])}${aya && Number(aya) >= 1 ? `?aya=${Number(aya)}` : ''}`;
  }
  return '/';
}
