// Parrainage : code personnel, récompense au premier paiement du filleul.
import crypto from 'node:crypto';
import { getNumber, getSetting, isOn } from '../../settings.js';
import { enqueueForUser } from '../../mailer.js';
import { fmtDate } from '../../emails.js';
import { monthsLabel } from '../gifts/lib.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans O/0/I/1 : lisible à voix haute
export const CODE_LEN = 8;
// Un parrain n'a qu'un code par compte et qu'un jour pour l'activer : le filleul doit venir de s'inscrire.
export const CLAIM_WINDOW_HOURS = 48;

export function newCode() {
  const bytes = crypto.randomBytes(CODE_LEN);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// « abcd-ef23 », « ABCDEF23 » → « ABCDEF23 » ; null si la forme est invalide.
export function normalizeCode(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === CODE_LEN && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}

// Code du membre, créé à la première demande.
export async function codeFor(db, userId) {
  const have = (await db.query('SELECT code FROM referral_codes WHERE user_id = $1', [userId])).rows[0];
  if (have) return have.code;
  for (let i = 0; i < 10; i++) {
    const code = newCode();
    const r = await db.query('INSERT INTO referral_codes(user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code', [userId, code]);
    if (r.rowCount) return r.rows[0].code;
    const again = (await db.query('SELECT code FROM referral_codes WHERE user_id = $1', [userId])).rows[0]; // course : l'autre requête a gagné
    if (again) return again.code;
  }
  throw new Error('Impossible de créer un code de parrainage');
}

const extend = (db, userId, months) => db.query(
  `UPDATE users SET premium_until = GREATEST(COALESCE(premium_until, now()), now()) + make_interval(months => $2) WHERE id = $1
   RETURNING premium_until, locale, name`, [userId, months]);

// Facture payée (Stripe) : si le payeur est un filleul en attente, les mois offerts sont versés (une seule fois, même si Stripe rejoue l'événement).
export async function rewardOnPaidInvoice(client, inv) {
  if (!inv?.customer || !(Number(inv.amount_paid) > 0)) return false;
  if (!isOn(await getSetting('feat_referral'))) return false;
  const referee = (await client.query('SELECT id FROM users WHERE stripe_customer_id = $1 LIMIT 1', [inv.customer])).rows[0];
  if (!referee) return false;
  const months = await getNumber('referral_months');
  if (!(months > 0)) return false;
  // Verrou : un seul traitement par filleul.
  const ref = (await client.query(
    "UPDATE referrals SET status = 'rewarded', rewarded_at = now(), months = $2 WHERE referee_id = $1 AND status = 'pending' RETURNING id, referrer_id", [referee.id, months])).rows[0];
  if (!ref) return false;
  const cap = await getNumber('referral_max_per_year');
  const used = (await client.query(
    "SELECT count(*)::int AS n FROM referrals WHERE referrer_id = $1 AND referrer_rewarded AND rewarded_at > now() - interval '365 days'", [ref.referrer_id])).rows[0].n;
  const referrerGets = cap === 0 || used < cap;
  const e = (await extend(client, referee.id, months)).rows[0];
  const p = (await client.query('SELECT name FROM users WHERE id = $1', [ref.referrer_id])).rows[0];
  await enqueueForUser(client, referee.id, 'referral_reward_referee', {
    months: monthsLabel(months, e.locale), referrer: p?.name || '', date: fmtDate(e.premium_until, e.locale), path: '/account',
  }, `ref-referee:${ref.id}`);
  if (referrerGets) {
    const r = (await extend(client, ref.referrer_id, months)).rows[0];
    await client.query('UPDATE referrals SET referrer_rewarded = true WHERE id = $1', [ref.id]);
    await enqueueForUser(client, ref.referrer_id, 'referral_reward_referrer', {
      months: monthsLabel(months, r.locale), friend: e.name || '', date: fmtDate(r.premium_until, r.locale), path: '/account?tab=referral',
    }, `ref-referrer:${ref.id}`);
  }
  return true;
}

