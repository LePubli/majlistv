// Étape I3 — Pages en blocs : lecture côté serveur des emplacements (blocs avant / après une page existante)
// et des pages personnalisées /p/<nom>. Les emplacements sont gardés 10 secondes en mémoire.
const API = process.env.API_URL || 'http://localhost:3000';
let cached = null;
let at = 0;

// { '/pricing': { before: [blocs], after: [blocs], targeted: bool }, … } — seulement les blocs « tout le monde » ;
// les blocs réservés à un public (visiteurs, membres, abonnés…) sont chargés ensuite par le navigateur, selon la connexion.
export async function pageSlots() {
  if (cached && Date.now() - at < 10_000) return cached;
  try {
    const res = await fetch(`${API}/pages/slots`, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const j = await res.json();
      if (j && typeof j.slots === 'object') { cached = j.slots; at = Date.now(); }
    }
  } catch { /* API injoignable : aucun bloc ajouté (ou derniers blocs connus) */ }
  return cached || {};
}

// Page personnalisée en ligne (rendu serveur : seulement les blocs « tout le monde »), ou null.
export async function customPage(slug) {
  try {
    const res = await fetch(`${API}/pages/view?path=${encodeURIComponent(`/p/${slug}`)}&ssr=1`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// Pages personnalisées en ligne (plan du site).
export async function publicPages() {
  try {
    const res = await fetch(`${API}/pages/public-list`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.json() : [];
  } catch { return []; }
}
