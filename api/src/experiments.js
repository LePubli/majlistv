// Amélioration 7.2 — Tests A/B : règles pures (testées sans base) utilisées par routes/experiments.js.
import crypto from 'node:crypto';

/** Zones du site que l'on peut tester. `keys` = textes (clés de web/lib/i18n.js) que les variantes peuvent remplacer. */
export const ZONES = {
  vitrine_hero: {
    label: "Bannière de l'accueil visiteur",
    keys: { vtTitle1: 'Titre, ligne 1', vtTitle2: 'Titre, ligne 2 (en or)', vtLead: "Phrase d'accroche", heroCta: 'Bouton principal (avec essai gratuit)' },
  },
};
// Zone « page Tarifs » : textes + deux réglages de présentation (valeurs = réglages Admin → Paramètres → Paiement).
ZONES.pricing = {
  label: 'Page Tarifs (visiteurs non inscrits)',
  keys: { pricingTitle: 'Titre de la page', tierStdTag: 'Sous-titre de la formule standard', startTrial: 'Bouton « essai » (utiliser {n} pour le nombre de jours)', trialNote: 'Phrase sur l\'essai gratuit (carte demandée)', trialNoCardNote: 'Phrase sur l\'essai gratuit (sans carte)', freeMonths: 'Mois offerts par l\'annuelle (utiliser {n})' },
  options: {
    highlight: { label: 'Formule mise en avant', setting: 'pricing_highlight', def: 'year', values: { year: 'L\'annuelle', month: 'La mensuelle', none: 'Aucune' } },
    order: { label: 'Ordre des formules', setting: 'pricing_order', def: 'month_first', values: { month_first: 'Mensuelle puis annuelle', year_first: 'Annuelle puis mensuelle' } },
  },
};
// Zone « application mobile » : écran « Créer un compte ». Les clés sont celles de mobile/src/lib/i18n.ts (pas celles du site).
// `manual` : « garder la variante » ne modifie rien tout seul (les textes de l'appli sont dans son code, à mettre à jour par une mise à jour en ligne).
ZONES.mobile_register = {
  label: "Application mobile : écran « Créer un compte »",
  manual: true,
  keys: { 'auth.register': 'Titre et bouton « Créer un compte »', 'auth.toRegister': 'Lien « Pas encore de compte ? »', 'auth.pitch': "Phrase d'accroche au-dessus du formulaire (absente de l'original)" },
};
// Zone « prix » : chaque variante porte ses propres prix Stripe (price_…), créés par l'administrateur chez Stripe. Rien d'autre ne change.
ZONES.price = {
  label: "Prix de l'abonnement (formule standard)",
  goal: 'subscription',
  priceTest: true,
  keys: {},
};
export const PRICE_ID_RE = /^price_[A-Za-z0-9_]{1,80}$/;
export const LANGS = ['fr', 'en', 'ar'];
export const VARIANT_KEYS = ['A', 'B', 'C'];
export const VISITOR_RE = /^[A-Za-z0-9-]{16,64}$/;
export const hashVisitor = (visitor) => crypto.createHash('sha256').update(String(visitor)).digest('hex');

/** Position stable du visiteur dans [0, 1) pour ce test : le même visiteur reçoit toujours la même variante. */
export function bucket(visitor, experimentId) {
  const h = crypto.createHash('sha256').update(`${experimentId}:${visitor}`).digest();
  return h.readUInt32BE(0) / 0x100000000;
}

/** Variante d'un visiteur selon les poids ([{ key, weight }]). */
export function assign(visitor, experimentId, variants) {
  const total = variants.reduce((s, v) => s + v.weight, 0);
  let x = bucket(visitor, experimentId) * total;
  for (const v of variants) { if (x < v.weight) return v.key; x -= v.weight; }
  return variants[variants.length - 1].key;
}

/** Vérifie et nettoie les textes d'une variante pour une zone ; retourne { texts } ou { error }. */
export function cleanConfig(zone, config) {
  const z = ZONES[zone];
  if (!z) return { error: 'Zone inconnue' };
  const out = {};
  for (const [lang, map] of Object.entries(config?.texts || {})) {
    if (!LANGS.includes(lang)) return { error: `Langue inconnue : ${lang}` };
    for (const [k, v] of Object.entries(map || {})) {
      if (!z.keys[k]) return { error: `Texte non modifiable dans cette zone : ${k}` };
      const s = String(v ?? '').trim();
      if (!s) continue; // vide = on garde le texte d'origine
      if (s.length > 300) return { error: 'Texte trop long (300 caractères maximum)' };
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s)) return { error: 'Caractère de contrôle interdit' };
      (out[lang] ||= {})[k] = s;
    }
  }
  // Réglages de présentation : une valeur choisie s'applique telle quelle (vide = on garde le réglage actuel du site).
  // Test de prix : uniquement des identifiants de prix Stripe (mensuel et/ou annuel) ; aucun texte.
  const prices = {};
  if (z.priceTest) {
    if (Object.keys(out).length) return { error: 'Un test de prix ne modifie aucun texte' };
    for (const [k, v] of Object.entries(config?.prices || {})) {
      if (k !== 'month' && k !== 'year') return { error: `Prix inconnu : ${k}` };
      const id = String(v ?? '').trim();
      if (!id) continue;
      if (!PRICE_ID_RE.test(id)) return { error: 'Identifiant de prix invalide (il commence par price_)' };
      prices[k] = id;
    }
  } else if (Object.keys(config?.prices || {}).length) return { error: 'Les prix ne se testent que dans la zone « prix »' };
  const options = {};
  for (const [k, v] of Object.entries(config?.options || {})) {
    const o = z.options?.[k];
    if (!o) return { error: `Réglage non modifiable dans cette zone : ${k}` };
    if (v === '' || v == null) continue;
    if (!(v in o.values)) return { error: `Valeur inconnue pour « ${o.label} »` };
    options[k] = v;
  }
  return { texts: out, options, prices };
}

// Fonction de répartition de la loi normale (approximation d'Abramowitz-Stegun, erreur < 1e-7).
export function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export const MIN_VISITORS = 100;   // par variante
export const MIN_CONVERSIONS = 10; // au total
/** Statistiques : rows = [{ key, visitors, clicks, conversions }] ; la variante A est la référence. */
export function computeStats(rows) {
  const ctl = rows.find((r) => r.key === 'A');
  return rows.map((r) => {
    const rate = r.visitors ? r.conversions / r.visitors : 0;
    const out = { ...r, rate: Math.round(rate * 10000) / 100, clickRate: r.visitors ? Math.round((r.clicks / r.visitors) * 10000) / 100 : 0, lift: null, confidence: null, verdict: r.key === 'A' ? 'reference' : 'collecting' };
    if (r.key === 'A' || !ctl) return out;
    const enough = r.visitors >= MIN_VISITORS && ctl.visitors >= MIN_VISITORS && r.conversions + ctl.conversions >= MIN_CONVERSIONS;
    const pc = ctl.visitors ? ctl.conversions / ctl.visitors : 0;
    out.lift = pc > 0 ? Math.round(((rate - pc) / pc) * 1000) / 10 : null; // en % relatif
    if (!enough) return out;
    const pool = (r.conversions + ctl.conversions) / (r.visitors + ctl.visitors);
    const se = Math.sqrt(pool * (1 - pool) * (1 / r.visitors + 1 / ctl.visitors));
    const z = se > 0 ? (rate - pc) / se : 0;
    const p = 2 * (1 - normalCdf(Math.abs(z)));
    out.confidence = Math.round((1 - p) * 1000) / 10;
    out.verdict = p < 0.05 ? (rate > pc ? 'better' : 'worse') : 'inconclusive';
    return out;
  });
}
