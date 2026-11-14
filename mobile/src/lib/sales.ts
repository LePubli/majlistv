// Étape C-3 — contenus payants à l'unité (vidéo, Audyn) dans l'application : forme renvoyée par l'API et règles pures (testées avec Node).
// L'achat et la location se paient sur le site (même compte) ; l'application affiche les prix et ouvre l'accès dès que c'est payé.

export type SaleOption = { price: number; memberPrice: number; yourPrice: number };
export type Sale = {
  currency: string;
  buy: SaleOption | null;
  rent: (SaleOption & { hours: number }) | null;
  memberDiscountPct: number;
  member: boolean;
  owned: { mode: 'buy' | 'rent'; expiresAt: string | null } | null;
};
export type Purchase = {
  id: string; kind: 'talk' | 'audyn'; itemId: string; title: string; mode: 'buy' | 'rent'; amount: number; currency: string;
  status: 'paid' | 'refunded'; paidAt: string | null; expiresAt: string | null; refundedAt: string | null; active: boolean;
};

/** 7,99 € (deux décimales seulement s'il y a des centimes). */
export function saleMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: String(currency || 'eur').toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format((cents || 0) / 100);
  } catch { return `${(cents / 100).toFixed(2)} ${String(currency || 'eur').toUpperCase()}`; }
}

/** Durée de location lisible : jours entiers à partir de 48 h, sinon heures. */
export const rentUnit = (hours: number): { unit: 'days' | 'hours'; n: number } => (hours >= 48 && hours % 24 === 0 ? { unit: 'days', n: hours / 24 } : { unit: 'hours', n: hours });

/** Adresse de la fiche sur le site, où se fait le paiement. */
export const salePageUrl = (site: string, kind: 'talk' | 'audyn', id: string) => `${site.replace(/\/$/, '')}${kind === 'talk' ? '/talks/' : '/audyn/'}${id}`;

/** Prix le plus bas proposé à la personne (« à partir de … ») ; null si rien n'est en vente. */
export function fromPrice(s: Sale | null | undefined): number | null {
  if (!s) return null;
  const p = [s.buy?.yourPrice, s.rent?.yourPrice].filter((x): x is number => typeof x === 'number');
  return p.length ? Math.min(...p) : null;
}

/** Une location est-elle encore valable à cet instant ? (achat : toujours) */
export function ownedActive(o: Sale['owned'], now = Date.now()): boolean {
  if (!o) return false;
  if (o.mode === 'buy' || !o.expiresAt) return true;
  return new Date(o.expiresAt).getTime() > now;
}
