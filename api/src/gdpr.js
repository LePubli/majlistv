// Étape 36 — Droits RGPD en libre-service : exporter ses données, supprimer son compte.
//
// EXPORT : tout ce que la base garde sur la personne. La liste des tables est DÉCOUVERTE dans la base (clés étrangères vers users) : une table
// ajoutée plus tard est exportée d'office, sans que personne n'ait à y penser. Seules les colonnes « propriétaires » (user_id, purchaser_id…)
// comptent : les colonnes « created_by / reviewed_by… » décrivent des actions d'équipe sur des contenus, pas des données de la personne.
// Les secrets (mots de passe, clés, jetons, codes de secours, code PIN) ne sont jamais exportés, même chiffrés.
// SUPPRESSION : voir deleteAccount().
import { pool } from './db.js';
import { stripeClient } from './routes/billing.js';
import { enqueueEmail } from './mailer.js';

// Colonnes qui rattachent une ligne à une personne.
export const OWN_COLUMNS = ['user_id', 'purchaser_id', 'redeemed_by', 'reporter_id', 'owner_id', 'organizer_id'];
// Tables qui pointent vers users mais qui n'ont rien à exporter (technique ou secret), avec la raison (documentée dans le README).
export const EXCLUDED_TABLES = {
  login_challenges: 'jeton de connexion temporaire (secret)',
  two_factor_recovery: 'empreintes des codes de secours (secret)',
  device_tokens: 'jetons de notification du téléphone (secret technique)',
  password_resets: 'empreintes de jetons de réinitialisation (secret)',
};
// Colonnes qui désignent un membre de l'équipe auteur d'une action sur un contenu (créé par, relu par…) : pas des données de la personne.
// Toute autre colonne qui pointe vers users est exportée d'office (le RGPD pardonne mal un oubli).
export const STAFF_COLUMNS = ['created_by', 'updated_by', 'reviewed_by', 'handled_by', 'actor_id', 'requested_by', 'lock_user', 'rights_by', 'consent_recorded_by', 'closed_by', 'added_by'];
// Données rattachées indirectement (par la ligne d'un tableau déjà exporté) : { tableEnfant: [colonne, tableParent] }.
// Profils enfants (avancement, étoiles, quiz, révision, temps d'écran), éléments des listes, bilans de l'objectif.
export const CHILD_TABLES = {
  kid_actions: ['profile_id', 'kid_profiles'], kid_badges: ['profile_id', 'kid_profiles'], kid_catalog: ['profile_id', 'kid_profiles'],
  kid_progress: ['profile_id', 'kid_profiles'], kid_quiz_attempts: ['profile_id', 'kid_profiles'], kid_revision: ['profile_id', 'kid_profiles'],
  kid_usage: ['profile_id', 'kid_profiles'], user_list_items: ['list_id', 'user_lists'], self_checkins: ['goal_id', 'self_goals'],
};
// Valeurs jamais exportées, quel que soit le tableau.
export const SENSITIVE_KEY = /(password|hash|secret|token|totp|recovery|(^|_)pin($|_))/i;
// Colonnes de la fiche membre exportées (liste blanche).
export const USER_COLUMNS = ['id', 'email', 'name', 'role', 'locale', 'created_at', 'preferred_sub_lang', 'favorite_categories', 'onboarded_at', 'premium_until',
  'kids_report_email', 'practice_consent_at', 'practice_email', 'practice_weekday', 'notify_speakers', 'notify_weekly', 'notify_push', 'notify_lifecycle', 'disabled_at'];
const ROW_CAP = 5000;

export const redact = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !SENSITIVE_KEY.test(k)));

// Tables et colonnes « propriétaires » à exporter, lues dans la base.
export async function ownedTables() {
  const { rows } = await pool.query(
    `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass AND array_length(c.conkey, 1) = 1
      ORDER BY 1, 2`);
  return rows.map((r) => ({ table: r.tbl.replace(/^"|"$/g, ''), column: r.col }));
}

// Tout ce qui est classé : exporté, ou exclu avec une raison, ou action d'équipe (ignorée). Sert au test qui empêche d'oublier une table.
export async function classify() {
  const all = await ownedTables();
  return all.map((x) => ({ ...x, kind: EXCLUDED_TABLES[x.table] ? 'excluded' : STAFF_COLUMNS.includes(x.column) ? 'staff' : 'export' }));
}

const q = (id) => `"${String(id).replace(/"/g, '""')}"`; // identifiants issus du catalogue PostgreSQL, jamais de l'extérieur

export async function exportData(userId) {
  const u = (await pool.query(`SELECT ${USER_COLUMNS.map(q).join(', ')}, (totp_enabled_at IS NOT NULL) AS two_factor_enabled FROM users WHERE id = $1`, [userId])).rows[0];
  if (!u) return null;
  const data = {};
  const tables = [];
  for (const t of await classify()) {
    if (t.kind !== 'export') continue;
    const key = t.column === 'user_id' ? t.table : `${t.table} (${t.column})`;
    const { rows } = await pool.query(`SELECT * FROM ${q(t.table)} WHERE ${q(t.column)} = $1 LIMIT ${ROW_CAP}`, [userId]);
    if (!rows.length) continue;
    data[key] = rows.map(redact);
    tables.push({ table: key, rows: rows.length });
    // Données rattachées à ces lignes (ex. avancement d'un profil enfant).
    for (const [child, [fk, parent]] of Object.entries(CHILD_TABLES)) {
      if (parent !== t.table) continue;
      const ids = rows.map((r) => r.id).filter(Boolean);
      if (!ids.length) continue;
      const kids = (await pool.query(`SELECT * FROM ${q(child)} WHERE ${q(fk)} = ANY($1) LIMIT ${ROW_CAP}`, [ids])).rows;
      if (kids.length) { data[child] = kids.map(redact); tables.push({ table: child, rows: kids.length }); }
    }
  }
  return {
    format: 'mejliss-export-v1',
    exportedAt: new Date().toISOString(),
    note: "Toutes les données personnelles que la plateforme conserve à votre sujet. Les mots de passe, clés et jetons n'y figurent jamais. Les factures sont conservées par notre prestataire de paiement (obligation légale).",
    account: u,
    tables,
    data,
  };
}

// Ce qui empêche (ou conditionne) la suppression : { blockers: [{code, message}], liveSubscriptions: [ids] }.
export async function deletionCheck(userId) {
  const blockers = [];
  const u = (await pool.query('SELECT id, role FROM users WHERE id = $1', [userId])).rows[0];
  if (!u) return null;
  if (u.role === 'admin') {
    const others = (await pool.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL AND id <> $1", [userId])).rows[0].n;
    if (!others) blockers.push({ code: 'last_admin', message: "Vous êtes le dernier administrateur : nommez un autre administrateur avant de supprimer ce compte." });
  }
  const talks = (await pool.query('SELECT count(*)::int AS n FROM talks WHERE organizer_id = $1', [userId])).rows[0].n;
  if (talks) blockers.push({ code: 'has_talks', message: `Ce compte possède ${talks} conférence(s) : demandez à l'administrateur de les transférer à un autre compte avant la suppression.`, talks });
  const live = (await pool.query("SELECT id FROM subscriptions WHERE user_id = $1 AND status IN ('trialing', 'active', 'past_due', 'unpaid')", [userId])).rows.map((r) => r.id);
  return { blockers, liveSubscriptions: live };
}

// Arrête les abonnements Stripe (sans remboursement). Erreur lisible si impossible : le compte n'est alors PAS supprimé.
export async function cancelSubscriptions(stripe, ids) {
  for (const id of ids) {
    try { await stripe.subscriptions.cancel(id); } catch (err) {
      if (err?.code === 'resource_missing' || /No such subscription|already been canceled/i.test(String(err?.message))) continue; // déjà arrêté chez Stripe
      throw new Error("L'abonnement n'a pas pu être arrêté chez Stripe : le compte n'a pas été supprimé. Réessayez ou contactez-nous.");
    }
  }
}

// Suppression définitive. Les données liées partent avec le compte (favoris, notes, progression, révision, bilans, profils enfants, listes…).
// Conservés sans lien avec la personne : preuves d'acceptation des CGV (obligation légale), historique de revenus agrégé, journal d'équipe.
export async function deleteAccount(userId, log) {
  const check = await deletionCheck(userId);
  if (!check) return { ok: false, code: 'not_found' };
  if (check.blockers.length) return { ok: false, code: check.blockers[0].code, message: check.blockers[0].message };
  if (check.liveSubscriptions.length) {
    const stripe = await stripeClient();
    if (!stripe) return { ok: false, code: 'stripe_unavailable', message: "Un abonnement est en cours et le paiement n'est pas joignable : contactez-nous pour supprimer votre compte." };
    await cancelSubscriptions(stripe, check.liveSubscriptions);
  }
  const u = (await pool.query('SELECT email, name, locale FROM users WHERE id = $1', [userId])).rows[0];
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  try {
    await enqueueEmail(pool, { userId: null, to: u.email, locale: u.locale, kind: 'account_deleted', vars: { name: u.name }, dedupeKey: `account-deleted:${userId}` });
  } catch (err) { log?.warn(`E-mail de suppression de compte : ${err.message}`); }
  log?.info(`Compte supprimé par son titulaire (${userId})`);
  return { ok: true, subscriptionsStopped: check.liveSubscriptions.length };
}
