// Étape 40 — aides du navigateur pour les notifications (Web Push). Les fonctions pures sont testées dans tests/test_webpush_web.mjs.
export const SW_URL = '/push-sw.js';
export const SW_SCOPE = '/push-scope/';

// Clé VAPID (base64url) → octets attendus par pushManager.subscribe().
export function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (String(b64).length % 4)) % 4);
  const raw = atob((String(b64) + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

// Que peut faire ce navigateur ? env = { hasSW, hasPush, hasNotification, secure, permission, ios, standalone }
// → 'unsupported' | 'ios_install' (iPhone : à ajouter à l'écran d'accueil d'abord) | 'denied' | 'default' | 'granted'
export function pushSupport(env) {
  if (env.ios && !env.standalone) return 'ios_install';
  if (!env.secure || !env.hasSW || !env.hasPush || !env.hasNotification) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  return env.permission === 'granted' ? 'granted' : 'default';
}

export function browserEnv() {
  if (typeof window === 'undefined') return { hasSW: false, hasPush: false, hasNotification: false, secure: false, permission: 'default', ios: false, standalone: false };
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return {
    hasSW: 'serviceWorker' in navigator, hasPush: 'PushManager' in window, hasNotification: 'Notification' in window, secure: window.isSecureContext,
    permission: 'Notification' in window ? Notification.permission : 'default',
    ios, standalone: window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true,
  };
}

async function registration() {
  await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  return navigator.serviceWorker.getRegistration(SW_SCOPE).then((r) => r || navigator.serviceWorker.ready);
}

// Abonnement actuel de CE navigateur (ou null).
export async function currentSubscription() {
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch { return null; }
}

// Demande l'autorisation, s'abonne, et enregistre l'abonnement sur le serveur. Renvoie { ok } ou { ok:false, reason }.
export async function enablePush(call, locale) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' };
  const k = await call('/web-push/key');
  if (!k.ok) return { ok: false, reason: 'server' };
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(k.data.publicKey) });
  const r = await call('/me/web-push', { method: 'POST', body: JSON.stringify({ ...sub.toJSON(), locale }) });
  if (!r.ok) { await sub.unsubscribe().catch(() => {}); return { ok: false, reason: 'server' }; }
  await call('/me/notifications', { method: 'PUT', body: JSON.stringify({ push: true }) }); // l'interrupteur général du compte doit être actif
  return { ok: true };
}

export async function disablePush(call) {
  const sub = await currentSubscription();
  if (!sub) return { ok: true };
  await call('/me/web-push', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) });
  await sub.unsubscribe().catch(() => {});
  return { ok: true };
}
