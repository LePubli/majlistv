// Étape I1 — Thème du site (Admin → Apparence) : lu côté serveur et injecté dans chaque page par app/layout.js.
// Gardé 10 secondes en mémoire : une publication est visible au plus tard 10 s après (l'API garde aussi sa copie).
const API = process.env.API_URL || 'http://localhost:3000';
let cached = null;
let at = 0;

export async function siteTheme() {
  if (cached && Date.now() - at < 10_000) return cached;
  try {
    const res = await fetch(`${API}/theme`, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const t = await res.json();
      if (typeof t.css === 'string') { cached = t; at = Date.now(); }
    }
  } catch { /* API injoignable : la feuille de style garde ses valeurs d'origine (globals.css) */ }
  return cached;
}

// Couleur de fond du thème (barre d'adresse des téléphones).
export function themeBg(theme) {
  return theme?.css?.match(/--bg:(#[0-9A-Fa-f]{3,8})/)?.[1] || '#0B0906';
}
