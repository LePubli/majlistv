// Étape 40 — Web Push (notifications dans le navigateur ou le site installé), protocole standard VAPID, librairie « web-push ».
// Les clés VAPID sont créées automatiquement au premier besoin, puis gardées en base (clé privée chiffrée avec SETTINGS_KEY).
// Rien à configurer par l'administrateur : il suffit que la fonction « Notifications dans le navigateur » soit active (Admin → Fonctions).
import webpush from 'web-push';
import { pool } from './db.js';
import { cryptoReady, encrypt, decrypt } from './crypto.js';
import { isGone, webPayload } from './webPushLib.js';

let cache = null;

// Renvoie { publicKey, privateKey } ou null si SETTINGS_KEY est absente (impossible de protéger la clé privée).
export async function vapidKeys() {
  if (cache) return cache;
  if (!cryptoReady) return null;
  let row = (await pool.query('SELECT public_key, private_enc FROM web_push_keys WHERE id')).rows[0];
  if (!row) {
    const k = webpush.generateVAPIDKeys();
    // ON CONFLICT : deux démarrages simultanés ne créent qu'une seule paire.
    await pool.query('INSERT INTO web_push_keys(id, public_key, private_enc) VALUES (true, $1, $2) ON CONFLICT (id) DO NOTHING', [k.publicKey, encrypt(k.privateKey)]);
    row = (await pool.query('SELECT public_key, private_enc FROM web_push_keys WHERE id')).rows[0];
  }
  try { cache = { publicKey: row.public_key, privateKey: decrypt(row.private_enc) }; } catch { return null; } // SETTINGS_KEY changée : clé illisible
  return cache;
}
export const resetVapidCache = () => { cache = null; };

function subject() {
  const m = String(process.env.ADMIN_EMAIL || '').trim();
  return m.includes('@') ? `mailto:${m}` : 'https://majlisstv.le-publicitaire.fr';
}

// Envoie à UN abonnement. 'ok' | 'gone' (à supprimer) ; lève une erreur pour un échec temporaire.
export async function sendToSubscription(keys, sub, message) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, webPayload(message), {
      vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 60 * 60 * 24, urgency: 'normal', timeout: 15000,
    });
    return 'ok';
  } catch (err) {
    if (isGone(err?.statusCode)) return 'gone';
    throw new Error(`Web Push ${err?.statusCode || ''} ${err?.body || err?.message || ''}`.trim().slice(0, 200));
  }
}

// Envoie à tous les navigateurs d'un compte. `textFor(locale)` donne { title, body }. Ne lève jamais. Renvoie le nombre d'envois réussis.
export async function webPushToUser(userId, textFor, path, kind, log) {
  try {
    const keys = await vapidKeys();
    if (!keys) return 0;
    const { rows } = await pool.query('SELECT id, endpoint, p256dh, auth, locale FROM web_push_subscriptions WHERE user_id = $1', [userId]);
    let sent = 0;
    for (const s of rows) {
      try {
        const r = await sendToSubscription(keys, s, { ...textFor(s.locale), path, kind });
        if (r === 'ok') { sent += 1; await pool.query('UPDATE web_push_subscriptions SET last_seen = now() WHERE id = $1', [s.id]); }
        else await pool.query('DELETE FROM web_push_subscriptions WHERE id = $1', [s.id]);
      } catch (err) { log?.warn?.(`Web Push (${userId}) : ${err.message}`); }
    }
    return sent;
  } catch (err) {
    log?.warn?.(`Web Push (${userId}) : ${err.message}`);
    return 0;
  }
}

// Y a-t-il au moins un navigateur abonné ? (sert aux boucles d'envoi : inutile de travailler s'il n'y a aucun canal)
export async function anyWebSubscription() {
  return (await pool.query('SELECT EXISTS (SELECT 1 FROM web_push_subscriptions) AS x')).rows[0].x;
}
