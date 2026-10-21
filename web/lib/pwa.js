// Étape 22a — outils du site installable (PWA) : détection de l'appareil et de l'installation, invite d'installation.
// L'invite d'installation (« beforeinstallprompt », Chrome / Edge / Android) est captée tôt par PwaRegister puis rangée ici.

let deferred = null;           // invite d'installation en attente
const subs = new Set();

export function setInstallPrompt(e) { deferred = e; subs.forEach((f) => f(Boolean(e))); }
export function onInstallPrompt(f) { subs.add(f); f(Boolean(deferred)); return () => subs.delete(f); }

// Ouvre l'invite d'installation du navigateur. Renvoie 'accepted', 'dismissed' ou null (aucune invite disponible).
export async function promptInstall() {
  if (!deferred) return null;
  const e = deferred;
  setInstallPrompt(null); // une invite ne sert qu'une fois
  e.prompt();
  try { return (await e.userChoice)?.outcome || null; } catch { return null; }
}

// Le site est-il ouvert comme application (icône de l'écran d'accueil) ?
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Appareil, pour choisir les explications : ios | android | desktop. iOS Safari seul peut installer sur iPhone / iPad.
export function platform(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent, touch = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints) {
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1); // iPad récent : se présente comme un Mac
  if (ios) return { os: 'ios', safari: !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) };
  if (/Android/.test(ua)) return { os: 'android', safari: false };
  return { os: 'desktop', safari: /Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua) };
}
