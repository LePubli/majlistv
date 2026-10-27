// Étape 39 — Suivi des erreurs (site) : envoie une erreur du navigateur à l'API (Admin → Erreurs).
// Limites : 5 envois par page, la même erreur une seule fois, jamais d'exception ni de blocage. Rien de personnel n'est joint
// (message, trace, adresse de la page sans paramètres) ; le serveur masque en plus e-mails, jetons et adresses IP.
const seen = new Set();
let sent = 0;

/** Décide si une erreur doit être envoyée (pure : testée avec Node). */
export function shouldSend(message, seenSet = seen, count = sent, max = 5) {
  const key = String(message || '').slice(0, 200);
  if (!key || seenSet.has(key) || count >= max) return false;
  return true;
}

export function reportError(err, extra = '') {
  try {
    const message = String((err && err.message) || err || '').slice(0, 900);
    if (!shouldSend(message)) return;
    seen.add(message.slice(0, 200)); sent += 1;
    const body = JSON.stringify({ message, stack: String((err && err.stack) || extra || '').slice(0, 7000), path: `${window.location.pathname}` });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/errors/client', new Blob([body], { type: 'application/json' }))) return;
    fetch('/api/errors/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* le suivi ne doit jamais casser la page */ }
}
