// Essai gratuit une seule fois par personne (relecture 25/11) : clé = adresse e-mail simplifiée (voir migrations/137_trial_claims.sql).
export function trialKey(email) {
  const [localRaw = '', domainRaw = ''] = String(email || '').trim().toLowerCase().split('@');
  const domain = domainRaw === 'googlemail.com' ? 'gmail.com' : domainRaw;
  let local = localRaw.split('+')[0];
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

// L'essai est-il encore offert à ce compte ? (aucun AUTRE compte n'a déjà pris l'essai avec cette boîte e-mail)
export async function trialAvailable(db, userId, email) {
  const r = await db.query('SELECT user_id FROM trial_claims WHERE key = $1', [trialKey(email)]);
  return !r.rows[0] || r.rows[0].user_id === userId;
}
export const claimTrial = (db, userId, email) =>
  db.query('INSERT INTO trial_claims(key, user_id) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [trialKey(email), userId]);
