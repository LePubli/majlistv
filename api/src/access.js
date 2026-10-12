// Droit d'accès aux conférences premium : abonnement Stripe en cours (essai, actif ou en retard de paiement)
// ou accès offert par un admin (users.premium_until).
import { pool } from './db.js';

// Le délai de grâce de 2 jours après la fin de période évite de couper l'accès si un webhook arrive en retard.
export async function hasActiveSubscription(userId) {
  if (!userId) return false;
  const { rowCount } = await pool.query(
    `SELECT 1 FROM users WHERE id = $1 AND premium_until > now()
     UNION ALL
     SELECT 1 FROM subscriptions
      WHERE user_id = $1 AND status IN ('trialing', 'active', 'past_due')
        AND (current_period_end IS NULL OR current_period_end > now() - interval '2 days')
     LIMIT 1`,
    [userId]
  );
  return rowCount > 0;
}
