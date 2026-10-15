// Étape I2 — Textes du site modifiables (Admin → Textes), lus côté serveur et superposés aux textes d'origine (lib/i18n.js).
// Gardés 10 secondes en mémoire : une modification est visible au plus tard 10 s après (l'API garde aussi sa copie).
import { DICT } from './i18n';

const API = process.env.API_URL || 'http://localhost:3000';
let cached = null;
let at = 0;

export async function siteTexts() {
  if (cached && Date.now() - at < 10_000) return cached;
  try {
    const res = await fetch(`${API}/texts`, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const t = await res.json();
      if (t && typeof t.texts === 'object') { cached = t; at = Date.now(); }
    }
  } catch { /* API injoignable : textes d'origine (ou derniers textes connus) */ }
  return cached;
}

// Textes d'une langue : textes d'origine + textes modifiés. Une clé inconnue du code est ignorée.
export function mergeDict(locale, texts) {
  const base = DICT[locale] || DICT.fr;
  const over = texts?.texts?.[locale];
  if (!over) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) if (k in base && typeof v === 'string' && v) out[k] = v;
  return out;
}

// Raccourci pour les pages serveur : const dict = await dictFor(locale)
export async function dictFor(locale) {
  return mergeDict(locale, await siteTexts());
}
