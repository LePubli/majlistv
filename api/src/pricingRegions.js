// Étape 44 — Tarifs par pays : groupes de pays avec leurs propres prix Stripe.
import { pool } from './db.js';
import { getSetting, isOn } from './settings.js';

// Code pays ISO 3166-1 alpha-2 (« ma », « MA » → « MA ») ou null.
export const normalizeCountry = (c) => {
  const s = String(c || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
};

// Liste de pays saisie à la main (« ma, dz tn ») → codes uniques ; null si un code est invalide.
export function parseCountries(input) {
  const parts = (Array.isArray(input) ? input : String(input || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const c = normalizeCountry(p);
    if (!c) return null;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

export const regionalPricingOn = async () => isOn(await getSetting('feat_regional_pricing'));

// Groupe actif qui couvre ce pays (fonction coupée = aucun groupe).
export async function regionForCountry(country) {
  const c = normalizeCountry(country);
  if (!c || !(await regionalPricingOn())) return null;
  const { rows } = await pool.query(
    `SELECT id, name, price_monthly AS month, price_yearly AS year, price_learn_monthly AS "learnMonth", price_learn_yearly AS "learnYear"
       FROM price_regions WHERE enabled AND $1 = ANY(countries) ORDER BY created_at LIMIT 1`, [c]);
  return rows[0] || null;
}

// Au moins un groupe actif : la page Abonnement propose alors le choix du pays.
export async function anyRegion() {
  if (!(await regionalPricingOn())) return false;
  return (await pool.query('SELECT 1 FROM price_regions WHERE enabled LIMIT 1')).rowCount > 0;
}

// Tous les prix « Apprentissage » (généraux + par pays) : sert à reconnaître le palier d'un abonnement.
export async function learningPriceIds() {
  const general = [await getSetting('stripe_price_learn_monthly'), await getSetting('stripe_price_learn_yearly')];
  const { rows } = await pool.query('SELECT price_learn_monthly AS m, price_learn_yearly AS y FROM price_regions');
  return [...general, ...rows.flatMap((r) => [r.m, r.y])].filter(Boolean);
}
