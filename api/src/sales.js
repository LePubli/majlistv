// Étape C-1 — Contenus payants à l'unité (vidéos et Audyn) : prix, droits d'accès, paiement confirmé, remboursement.
// Un contenu « en vente » se paie à part, même pour les abonnés (qui peuvent avoir une réduction). Achat = accès pour toujours ;
// location = accès pendant N heures à partir du paiement. Le propriétaire du contenu et les administrateurs y ont toujours accès.
import { pool } from './db.js';
import { getSetting } from './settings.js';
import { featureOn } from './features.js';
import { hasActiveSubscription } from './access.js';
import { enqueueForUser } from './mailer.js';
import { fmtDateTime } from './emails.js';

export const SALE_KINDS = ['talk', 'audyn'];
export const MIN_CENTS = 50;
export const MAX_CENTS = 50000;

// Texte accepté avant le paiement (contenu numérique fourni tout de suite : renonciation au délai de rétractation, art. L221-28 du Code de la consommation).
export const SALE_TERMS_VERSION = '2026-11-14';
export const SALE_TERMS_TEXT = {
  fr: "J'accepte les conditions générales de vente. Je demande l'accès immédiat à ce contenu et je renonce ainsi à mon droit de rétractation.",
  en: 'I accept the terms of sale. I ask for immediate access to this content and therefore waive my right of withdrawal.',
  ar: 'أوافق على شروط البيع. أطلب الوصول الفوري إلى هذا المحتوى وبذلك أتنازل عن حقي في التراجع.',
};

/** Fonction « Contenus payants à l'unité » activée (Admin → Fonctions) ? Coupée : aucun contenu n'est vendu ni bloqué par la vente. */
export const salesOn = () => featureOn('sales');

/** Prix réduit pour un abonné (arrondi au centime, jamais sous le minimum de Stripe). */
export function memberPrice(cents, pct) {
  if (!cents) return null;
  const p = Math.max(0, Math.min(90, Number(pct) || 0));
  if (!p) return cents;
  return Math.max(MIN_CENTS, Math.round((cents * (100 - p)) / 100));
}

/** Prix « 6,99 » ou « 6.99 » (euros) → centimes ; vide → null ; hors bornes → NaN. */
export function parseCents(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? Math.round(v) : Math.round(Number(String(v).replace(',', '.').trim()) * 100);
  if (!Number.isFinite(n) || n < MIN_CENTS || n > MAX_CENTS) return NaN;
  return n;
}

/** Ce que voit un visiteur : prix normal, prix abonné, prix qui le concerne, et ce qu'il possède déjà. */
export function saleShape(offer, { member = false, owned = null, currency = 'eur' } = {}) {
  if (!offer) return null;
  const opt = (cents) => (cents ? { price: cents, memberPrice: memberPrice(cents, offer.member_discount_pct), yourPrice: member ? memberPrice(cents, offer.member_discount_pct) : cents } : null);
  const buy = opt(offer.buy_cents);
  const rent = offer.rent_cents ? { ...opt(offer.rent_cents), hours: offer.rent_hours } : null;
  return {
    currency, buy, rent, memberDiscountPct: offer.member_discount_pct, member,
    owned: owned ? { mode: owned.mode, expiresAt: owned.expires_at ?? null } : null,
  };
}

/** Offre d'un contenu (ou null). */
export async function getOffer(kind, id, db = pool) {
  return (await db.query('SELECT * FROM sale_offers WHERE kind = $1 AND item_id = $2', [kind, id])).rows[0] || null;
}

/** Droit en cours d'un utilisateur sur un contenu : achat (pour toujours) en priorité, sinon location la plus longue encore valable. */
export async function ownedBy(userId, kind, id) {
  if (!userId) return null;
  return (await pool.query(
    `SELECT mode, expires_at FROM sale_purchases
      WHERE user_id = $1 AND kind = $2 AND item_id = $3 AND status = 'paid' AND (expires_at IS NULL OR expires_at > now())
      ORDER BY (mode = 'buy') DESC, expires_at DESC NULLS FIRST LIMIT 1`, [userId, kind, id])).rows[0] || null;
}

/**
 * Pour une liste de contenus : offre et droit de l'utilisateur, en deux requêtes.
 * Renvoie une Map id → { offer, owned } (seulement les contenus en vente). Fonction coupée : Map vide.
 */
export async function saleMap(kind, ids, userId) {
  const out = new Map();
  if (!ids.length || !(await salesOn())) return out;
  const offers = (await pool.query('SELECT * FROM sale_offers WHERE kind = $1 AND item_id = ANY($2::uuid[])', [kind, ids])).rows;
  if (!offers.length) return out;
  const owned = userId ? (await pool.query(
    `SELECT DISTINCT ON (item_id) item_id, mode, expires_at FROM sale_purchases
      WHERE user_id = $1 AND kind = $2 AND item_id = ANY($3::uuid[]) AND status = 'paid' AND (expires_at IS NULL OR expires_at > now())
      ORDER BY item_id, (mode = 'buy') DESC, expires_at DESC NULLS FIRST`, [userId, kind, offers.map((o) => o.item_id)])).rows : [];
  const own = new Map(owned.map((r) => [r.item_id, r]));
  for (const o of offers) out.set(o.item_id, { offer: o, owned: own.get(o.item_id) || null });
  return out;
}

/**
 * Accès d'un utilisateur à un contenu en vente. → null si le contenu n'est pas en vente (ou fonction coupée) : les règles
 * habituelles s'appliquent ; sinon { allowed, sale } où sale est la forme publique (prix, réduction, droit possédé).
 * `isOwner` : propriétaire du contenu, administrateur ou modérateur (accès sans payer).
 */
export async function saleAccess(kind, id, userId, isOwner = false) {
  if (!(await salesOn())) return null;
  const offer = await getOffer(kind, id);
  if (!offer) return null;
  const owned = await ownedBy(userId, kind, id);
  const member = userId ? await hasActiveSubscription(userId) : false;
  const currency = await getSetting('plan_currency');
  return { allowed: Boolean(isOwner || owned), sale: saleShape(offer, { member, owned, currency }) };
}

/** Condition SQL « ce contenu n'est pas en vente » (listes des enfants : un contenu payant n'y apparaît pas). */
export const notOnSaleSql = (kind, col) => `NOT EXISTS (SELECT 1 FROM sale_offers so_ WHERE so_.kind = '${kind}' AND so_.item_id = ${col})`;

// --- Webhook Stripe (appelé par routes/billing.js via ext) -------------------------------------------------------------

/** Paiement confirmé : l'achat ou la location devient valable (location : à partir de maintenant). */
export async function applySalePaid(client, session) {
  const id = session.metadata?.sale_purchase_id;
  if (!id || session.payment_status !== 'paid') return false;
  const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
  const { rows } = await client.query(
    `UPDATE sale_purchases SET status = 'paid', paid_at = now(), stripe_payment_intent = $2,
            amount = COALESCE($3, amount), currency = COALESCE($4, currency),
            expires_at = CASE WHEN mode = 'rent' THEN now() + make_interval(hours => rent_hours) END
      WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id, pi, session.amount_total ?? null, session.currency ?? null]);
  const p = rows[0];
  if (!p) return false;
  if (p.user_id) {
    const u = (await client.query('SELECT locale FROM users WHERE id = $1', [p.user_id])).rows[0];
    const path = p.kind === 'talk' ? `/talk/${p.item_id}` : `/audyn/${p.item_id}`;
    await enqueueForUser(client, p.user_id, p.mode === 'buy' ? 'sale_bought' : 'sale_rented',
      { title: p.title, until: p.expires_at ? fmtDateTime(p.expires_at, u?.locale || 'fr') : '', path }, `sale-paid:${p.id}`);
  }
  return true;
}

/** Remboursement complet chez Stripe : l'accès s'arrête. */
export async function applySaleRefund(client, charge) {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi || !charge.refunded) return false;
  const r = await client.query(
    "UPDATE sale_purchases SET status = 'refunded', refunded_at = now() WHERE stripe_payment_intent = $1 AND status = 'paid'", [pi]);
  return r.rowCount > 0;
}
