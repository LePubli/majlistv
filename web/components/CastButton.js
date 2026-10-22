'use client';
import { useEffect, useRef, useState } from 'react';
import { CAST_SDK_URL, castCapableBrowser, castMedia, resumeAfterCast } from '../lib/cast';

// Diffusion Chromecast depuis le site et la PWA (SDK Google Cast, récepteur multimédia par défaut : pas de compte développeur à créer).
// Le bouton n'apparaît que si le navigateur sait diffuser ET qu'un appareil est détecté sur le réseau (état géré par le SDK).
// Pendant la diffusion : le lecteur local est en pause et caché par un panneau de commande ; une transcription cliquable qui change
// la position du lecteur local (seekTo) est répercutée sur le téléviseur ; au retour, le lecteur reprend à la position du téléviseur.
// Sous Safari / iOS : rien (AirPlay est dans les commandes natives du lecteur).
let sdkPromise = null;
function loadSdk() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    window.__onGCastApiAvailable = (ok) => resolve(Boolean(ok));
    const s = document.createElement('script');
    s.src = CAST_SDK_URL; s.async = true;
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
    setTimeout(() => resolve(false), 8000); // réseau bloqué : on abandonne sans gêner la lecture
  });
  return sdkPromise;
}

export default function CastButton({ videoRef, src, title, poster, duration = 0, t }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState(null); // null = pas de diffusion ; { device, paused, time }
  const ctl = useRef(null);
  const busy = useRef(false); // évite la boucle « position locale ↔ position distante »

  useEffect(() => {
    if (!castCapableBrowser(navigator.userAgent)) return undefined;
    let dead = false; let cleanup = () => {};
    loadSdk().then((ok) => {
      if (dead || !ok || !window.cast || !window.chrome || !window.chrome.cast) return;
      const { cast, chrome } = window;
      const ctx = cast.framework.CastContext.getInstance();
      ctx.setOptions({ receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID, autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED });
      const player = new cast.framework.RemotePlayer();
      const rc = new cast.framework.RemotePlayerController(player);
      ctl.current = { ctx, player, rc };
      const video = () => videoRef.current;

      const sync = () => {
        const s = ctx.getCurrentSession();
        if (!s) return;
        setState({ device: s.getCastDevice().friendlyName || 'Chromecast', paused: player.isPaused, time: player.currentTime || 0 });
        const v = video();
        if (v && Math.abs((v.currentTime || 0) - player.currentTime) > 1) { busy.current = true; try { v.currentTime = player.currentTime; } catch { /* lecteur pas prêt */ } setTimeout(() => { busy.current = false; }, 300); }
      };
      const start = () => {
        const s = ctx.getCurrentSession();
        const v = video();
        const m = castMedia({ src, title, poster, startSeconds: v ? v.currentTime : 0, durationSeconds: duration, origin: window.location.origin });
        if (!s || !m) return;
        if (v) v.pause();
        const info = new chrome.cast.media.MediaInfo(m.contentUrl, m.contentType);
        info.streamType = chrome.cast.media.StreamType.BUFFERED;
        info.metadata = new chrome.cast.media.GenericMediaMetadata();
        info.metadata.title = m.title;
        if (m.image) info.metadata.images = [new chrome.cast.Image(m.image)];
        const req = new chrome.cast.media.LoadRequest(info);
        req.currentTime = m.startSeconds; req.autoplay = true;
        s.loadMedia(req).then(sync, () => { setState(null); try { ctx.endCurrentSession(true); } catch { /* déjà fermée */ } if (v) v.play().catch(() => {}); });
        setState({ device: s.getCastDevice().friendlyName || 'Chromecast', paused: false, time: m.startSeconds });
      };
      const stop = () => {
        const v = video();
        const t0 = resumeAfterCast(player.currentTime, v ? v.currentTime : 0, duration);
        setState(null);
        if (v) { busy.current = true; try { v.currentTime = t0; } catch { /* ignoré */ } setTimeout(() => { busy.current = false; }, 300); v.play().catch(() => {}); }
      };
      const onSession = (e) => {
        const S = cast.framework.SessionState;
        if (e.sessionState === S.SESSION_STARTED || e.sessionState === S.SESSION_RESUMED) { if (e.sessionState === S.SESSION_STARTED) start(); else sync(); }
        else if (e.sessionState === S.SESSION_ENDED) stop();
      };
      const onChange = () => sync();
      ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, onSession);
      rc.addEventListener(cast.framework.RemotePlayerEventType.ANY_CHANGE, onChange);

      // Le lecteur local reçoit « lecture » ou « nouvelle position » d'ailleurs (transcription, chapitres, raccourcis) : on les envoie au téléviseur.
      const v0 = video();
      const onPlay = () => { if (ctx.getCurrentSession() && !busy.current) { v0.pause(); if (player.isPaused) rc.playOrPause(); } };
      const onSeek = () => { if (ctx.getCurrentSession() && !busy.current && Math.abs(v0.currentTime - player.currentTime) > 1.5) { player.currentTime = v0.currentTime; rc.seek(); } };
      if (v0) { v0.addEventListener('play', onPlay); v0.addEventListener('seeked', onSeek); }
      setReady(true);
      cleanup = () => {
        ctx.removeEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, onSession);
        rc.removeEventListener(cast.framework.RemotePlayerEventType.ANY_CHANGE, onChange);
        if (v0) { v0.removeEventListener('play', onPlay); v0.removeEventListener('seeked', onSeek); }
      };
    });
    return () => { dead = true; cleanup(); };
  }, [src, title, poster, duration, videoRef]);

  if (!ready) return null;
  const c = ctl.current;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <>
      <div className="wb-cast" title={t('castLabel')}>
        {/* Élément personnalisé fourni par le SDK Google Cast : icône + choix de l'appareil. */}
        <google-cast-launcher aria-label={t('castLabel')} />
      </div>
      {state && c ? (
        <div className="cast-panel" role="group" aria-label={t('castOn').replace('{device}', state.device)}>
          <strong>{t('castOn').replace('{device}', state.device)}</strong>
          <span className="meta small">{fmt(state.time)}{duration ? ` / ${fmt(duration)}` : ''}</span>
          <div className="cast-ctl">
            <button type="button" className="btn ghost" onClick={() => { c.player.currentTime = Math.max(0, c.player.currentTime - 10); c.rc.seek(); }}>−10 s</button>
            <button type="button" className="btn" onClick={() => c.rc.playOrPause()}>{state.paused ? t('castPlay') : t('castPause')}</button>
            <button type="button" className="btn ghost" onClick={() => { c.player.currentTime = c.player.currentTime + 10; c.rc.seek(); }}>+10 s</button>
            <button type="button" className="btn ghost" onClick={() => c.ctx.endCurrentSession(true)}>{t('castStop')}</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
