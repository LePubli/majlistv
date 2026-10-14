// Statistiques d'audience anonymes (étape 18) : côté navigateur.
// Rien n'est stocké durablement : un indicateur de « visite en cours » dans sessionStorage (effacé à la fermeture de l'onglet),
// pour ne signaler la provenance (Google, réseau social…) qu'à l'arrivée sur le site. Aucun cookie, aucun identifiant.
import { useEffect, useRef } from 'react';

const KEY = 'mj_land';

// Provenance de la visite : créée à la première page vue de l'onglet. `ref` = page d'origine si elle est sur un autre site.
function landing() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
    let ref = '';
    try { if (document.referrer && new URL(document.referrer).host !== location.host) ref = document.referrer; } catch { /* adresse illisible : visite directe */ }
    const l = { path: location.pathname, ref, page: false, talk: false };
    sessionStorage.setItem(KEY, JSON.stringify(l));
    return l;
  } catch { return { path: '', ref: '', page: true, talk: true }; } // stockage indisponible : pas de provenance
}
// « Arrivée » : vrai une seule fois, sur la première page de la visite. kind = 'page' | 'talk'.
export function claimEntry(kind) {
  const l = landing();
  if (l.path !== location.pathname || l[kind]) return {};
  l[kind] = true;
  try { sessionStorage.setItem(KEY, JSON.stringify(l)); } catch { /* ignoré */ }
  return { entry: true, ...(l.ref ? { ref: l.ref } : {}) };
}

// Hook de mesure d'une lecture (adultes ou enfants). videoRef : <video> ou adaptateur YouTube/Vimeo (mêmes événements).
//   call : fonction d'appel API ; kids : espace enfant (envoi vers /kids/stats) ; active : la conférence est chargée.
//   playing : compter les lectures (faux pendant l'aperçu d'une conférence premium : seule l'ouverture est comptée).
export function useTalkStats({ videoRef, talkId, call, kids = false, active = true, playing = true, statsOn = true }) {
  const send = useRef(null);
  send.current = (body) => { if (statsOn) call(kids ? '/kids/stats' : '/stats/hit', { method: 'POST', body: JSON.stringify({ talkId, ...body }), keepalive: true }).catch(() => {}); };

  // Ouverture de la page.
  useEffect(() => {
    if (!active || !talkId) return;
    send.current({ type: 'view', ...(kids ? {} : claimEntry('talk')) });
  }, [active, talkId, kids]);

  // Lecture : démarrage, temps regardé, quartiles, fin.
  useEffect(() => {
    if (!active || !talkId || !playing) return undefined;
    const v = videoRef.current;
    if (!v || !v.addEventListener) return undefined;
    let started = false, acc = 0, watched = 0, last = null, done = false; // acc : à envoyer ; watched : total regardé depuis l'ouverture
    const reached = new Set();
    const flush = () => { const s = Math.min(60, Math.round(acc)); if (s >= 1) { acc -= s; send.current({ type: 'progress', seconds: s }); } };
    const onPlay = () => { last = v.currentTime; if (!started) { started = true; send.current({ type: 'play' }); } };
    const onTime = () => {
      if (v.paused || v.ended) { last = v.currentTime; return; }
      const now = v.currentTime; const dt = now - (last ?? now);
      last = now;
      // Seulement une lecture continue : un saut dans la vidéo (dt hors de 0–2,5 s) ne compte ni comme temps ni comme quartile.
      if (dt <= 0 || dt > 2.5) return;
      acc += dt; watched += dt;
      if (acc >= 15) flush();
      // Quartile = part de la vidéo réellement REGARDÉE (et non la position) : avancer dans la barre ne compte pas.
      const d = v.duration;
      if (Number.isFinite(d) && d > 0) for (const q of [25, 50, 75]) if (!reached.has(q) && watched / d * 100 >= q) { reached.add(q); send.current({ type: 'quartile', q }); }
    };
    const onPause = () => { flush(); last = null; };
    // « Terminée » : la fin est atteinte ET au moins la moitié a été regardée (un saut direct à la fin ne compte pas).
    const onEnd = () => { flush(); const d = v.duration; if (!done && Number.isFinite(d) && d > 0 && watched / d >= 0.5) { done = true; send.current({ type: 'complete' }); } };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    v.addEventListener('play', onPlay); v.addEventListener('timeupdate', onTime); v.addEventListener('pause', onPause); v.addEventListener('ended', onEnd);
    document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', flush);
    if (!v.paused && !v.ended) onPlay();
    return () => {
      flush();
      v.removeEventListener('play', onPlay); v.removeEventListener('timeupdate', onTime); v.removeEventListener('pause', onPause); v.removeEventListener('ended', onEnd);
      document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush);
    };
  }, [active, talkId, playing, videoRef]);
}
