// Étape I3 — Pages en blocs : lecture côté serveur des emplacements (blocs avant / après une page existante)
// et des pages personnalisées /p/<nom>. Les emplacements sont gardés 10 secondes en mémoire.
import { visitorHeaders } from './visitorIp';
const API = process.env.API_URL || 'http://localhost:3000';
let cached = null;
let at = 0;

// { '/pricing': { before: [blocs], after: [blocs], targeted: bool }, … } — seulement les blocs « tout le monde » ;
// les blocs réservés à un public (visiteurs, membres, abonnés…) sont chargés ensuite par le navigateur, selon la connexion.
export async function pageSlots() {
  if (cached && Date.now() - at < 10_000) return cached;
  try {
    const res = await fetch(`${API}/pages/slots`, { cache: 'no-store', headers: await visitorHeaders(), signal: AbortSignal.timeout(2000) });
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
    const res = await fetch(`${API}/pages/view?path=${encodeURIComponent(`/p/${slug}`)}&ssr=1`, { cache: 'no-store', headers: await visitorHeaders(), signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// Pages personnalisées en ligne (plan du site).
export async function publicPages() {
  try {
    const res = await fetch(`${API}/pages/public-list`, { cache: 'no-store', headers: await visitorHeaders(), signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.json() : [];
  } catch { return []; }
}

// Étape I4 — « En-tête, menus et pied de page » publié : { nav, zones: { topbar, footerTop }, targeted } (blocs « tout le monde » seulement ; 10 s en mémoire).
let layoutCache = null;
let layoutAt = 0;
// Projet Menus : menus créés dans Admin → Menus et affectés à un emplacement (null = menus d'origine). Ajoutés au même objet.
async function siteMenus() {
  try {
    const res = await fetch(`${API}/menus/resolved`, { cache: 'no-store', headers: await visitorHeaders(), signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null; // fonction « menus » coupée, ou API en difficulté : menus d'origine
    const j = await res.json();
    return j.locations && Object.keys(j.locations).length ? j.locations : null;
  } catch { return null; }
}
export async function siteLayout() {
  if (layoutCache !== null && Date.now() - layoutAt < 10_000) return layoutCache || null;
  let base = layoutCache || null; // dernier réglage connu si l'API ne répond pas
  let known = false;
  try {
    const res = await fetch(`${API}/pages/view?path=%2F_layout&ssr=1`, { cache: 'no-store', headers: await visitorHeaders(), signal: AbortSignal.timeout(2000) });
    if (res.status === 404) { base = null; known = true; }
    else if (res.ok) {
      const j = await res.json();
      base = { nav: j.nav || null, zones: { topbar: j.zones?.topbar || [], footerTop: j.zones?.footerTop || [] }, targeted: Boolean(j.targeted) };
      known = true;
    }
  } catch { /* API injoignable : derniers réglages connus, ou menus d'origine */ }
  const menus = await siteMenus();
  const out = menus ? { ...(base || { nav: null, zones: { topbar: [], footerTop: [] }, targeted: false }), menus } : base;
  if (known || menus) { layoutCache = out || false; layoutAt = Date.now(); }
  return out || null;
}
