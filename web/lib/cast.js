// 22b-10 : diffusion sur la télévision depuis le site et la PWA (Chromecast via le SDK Google Cast « sender » web).
// Logique pure, testable avec Node : rien ici ne touche au navigateur.
//  - Chrome, Edge, Opera, Brave… (Android et ordinateur, PWA installée comprise) : Chromecast.
//  - Safari (Mac, iPhone, iPad) : AirPlay déjà proposé par les commandes natives du lecteur, rien à ajouter.
//  - Firefox et navigateurs iOS autres que Safari : pas de diffusion possible.

export const CAST_SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
export const HLS_MIME = 'application/x-mpegurl';

/** Navigateur capable de Chromecast (moteur Chromium hors iOS, où tous les navigateurs sont Safari en dessous). */
export function castCapableBrowser(ua = '') {
  if (!ua || /iPhone|iPad|iPod|CriOS|FxiOS|EdgiOS/i.test(ua)) return false;
  if (/Firefox|FxiOS/i.test(ua)) return false;
  return /Chrome\/|Chromium\/|Edg\/|OPR\//i.test(ua);
}

/** Vidéo diffusable : flux HLS du serveur, jamais YouTube / Vimeo (lus depuis leur plateforme) ni l'aperçu d'un fichier public coupé par le navigateur. */
export function castableTalk(talk) {
  return Boolean(talk && talk.hlsPath && talk.source === 'upload');
}

const absolute = (u, origin) => { try { return new URL(u, origin).toString(); } catch { return ''; } };

/** Description du média envoyé au récepteur : adresse complète (le téléviseur ne connaît pas notre site), position de reprise. */
export function castMedia({ src, title = '', poster = '', startSeconds = 0, durationSeconds = 0, origin }) {
  const url = absolute(src, origin);
  if (!/^https:\/\//i.test(url)) return null; // le récepteur exige du https
  const img = poster ? absolute(poster, origin) : '';
  const start = Number.isFinite(startSeconds) && startSeconds > 0 ? Math.floor(startSeconds) : 0;
  return {
    contentUrl: url,
    contentType: HLS_MIME,
    title: String(title).slice(0, 200),
    image: /^https:\/\//i.test(img) ? img : '',
    startSeconds: start,
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0,
  };
}

/** Position de reprise sur l'appareil à la fin de la diffusion. */
export function resumeAfterCast(remote, before, duration = 0) {
  const v = Number.isFinite(remote) && remote >= 0 ? remote : before || 0;
  return duration > 0 ? Math.max(0, Math.min(v, duration - 1)) : Math.max(0, v);
}
