// Cartes cadeaux (étape 21) : codes, durées et traitement du paiement confirmé. Utilisé par les routes et par le webhook Stripe.
import { randomInt } from 'node:crypto';
import { enqueueForUser, enqueueEmail } from '../../mailer.js';
import { pickLocale } from '../../emails.js';

export const GIFT_MONTHS = [1, 3, 12];
// 32 caractères sans ambiguïté (ni 0/O ni 1/I) : 32^12 ≈ 1,2 × 10^18 codes possibles.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newCode() {
  let s = '';
  for (let i = 0; i < 12; i += 1) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

// Saisie tolérante : minuscules, espaces, tirets absents ou en trop.
export function normalizeCode(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 12 ? `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` : null;
}

// « 3 mois » dans la langue de l'e-mail.
export function monthsLabel(n, locale) {
  const l = pickLocale(locale);
  if (l === 'en') return `${n} ${n === 1 ? 'month' : 'months'}`;
  if (l === 'ar') return n === 1 ? 'شهر واحد' : n === 12 ? '12 شهرًا' : `${n} أشهر`;
  return `${n} mois`;
}

// Paiement confirmé : la carte passe à « paid » (une seule fois, même si Stripe rejoue l'événement) et les e-mails partent.
export async function applyGiftPaid(client, session) {
  const id = session.metadata?.gift_id;
  if (!id || session.payment_status !== 'paid') return false;
  const { rows } = await client.query(
    `UPDATE gift_cards SET status = 'paid', paid_at = now(), amount = $2, currency = $3, stripe_payment_intent = $4
      WHERE id = $1 AND status = 'pending' RETURNING id, code, months, purchaser_id, purchaser_name, recipient_email, recipient_name, message`,
    [id, session.amount_total ?? null, session.currency ?? null, typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null]);
  const g = rows[0];
  if (!g) return false;
  const buyer = g.purchaser_id ? (await client.query('SELECT email, name, locale FROM users WHERE id = $1', [g.purchaser_id])).rows[0] : null;
  const loc = buyer?.locale || 'fr';
  if (buyer) {
    await enqueueForUser(client, g.purchaser_id, 'gift_purchased',
      { months: monthsLabel(g.months, loc), code: g.code, recipient: g.recipient_email || '', path: '/account#gifts' }, `gift-buy:${g.id}`);
  }
  if (g.recipient_email) {
    await enqueueEmail(client, { to: g.recipient_email, locale: loc, kind: 'gift_received',
      vars: { name: g.recipient_name || '', from: g.purchaser_name || buyer?.name || '', months: monthsLabel(g.months, loc), code: g.code, message: g.message || '', path: `/redeem?code=${g.code}` },
      dedupeKey: `gift-recv:${g.id}` });
  }
  return true;
}

// Remboursement complet chez Stripe : une carte non activée est annulée ; une carte déjà activée est seulement marquée.
export async function applyGiftRefund(client, charge) {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi || !charge.refunded) return false;
  const r = await client.query(
    `UPDATE gift_cards SET refunded_at = now(),
            status = CASE WHEN status = 'paid' THEN 'void' ELSE status END,
            voided_at = CASE WHEN status = 'paid' THEN now() ELSE voided_at END
      WHERE stripe_payment_intent = $1 AND refunded_at IS NULL`, [pi]);
  return r.rowCount > 0;
}
