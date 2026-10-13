'use client';
import { useEffect, useRef } from 'react';

// Lecteur vidéo Mejliss TV.
// - Flux HLS (vidéos envoyées) : hls.js (qualité adaptative), lecture native sinon (Safari / iOS).
// - Fichier direct (MP4 / WebM, ex. archive.org) : lecture native par plages, sans téléchargement complet.
// startSeconds : reprise de lecture. videoRef : ref du parent (transcription cliquable). tracks : [{ lang, label, src, isDefault }].
// previewSeconds / onPreviewEnd : aperçu limité (fichiers directs ; pour le HLS, la limite est appliquée par le serveur).
// audioSrc / audioMode : flux audio seul (lecture écran éteint) ; la position et l'état lecture/pause sont conservés au changement de mode.
// rate : vitesse de lecture (0.75 → 2). title : affiché sur l'écran verrouillé (Media Session).
export default function VideoPlayer({ src, audioSrc = '', audioMode = false, rate = 1, title = '', poster, tracks = [], videoRef, startSeconds = 0, previewSeconds = 0, onPreviewEnd, autoPlay = false }) {
  const auto = useRef(autoPlay); // lancement automatique (épisode suivant d'une série) : lu au montage
  const start = useRef(startSeconds); // position de reprise : lue une seule fois, au montage
  const carry = useRef({ pos: 0, playing: false, seen: false }); // dernière position connue (pour changer de mode sans perdre sa place)
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const asAudio = Boolean(audioMode && audioSrc);
  const active = asAudio ? audioSrc : src;
  const isHls = /\.m3u8(\?|$)/i.test(active || '');

  // Suit la position et l'état de lecture ; applique la vitesse dès que le média est prêt.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const track = () => { carry.current.pos = v.currentTime || 0; carry.current.seen = true; };
    const onPlay = () => { carry.current.playing = true; v.playbackRate = rateRef.current; };
    const onPause = () => { carry.current.playing = false; };
    const onReady = () => { v.playbackRate = rateRef.current; };
    v.addEventListener('timeupdate', track); v.addEventListener('play', onPlay); v.addEventListener('pause', onPause);
    v.addEventListener('loadedmetadata', onReady); v.addEventListener('canplay', onReady);
    return () => {
      v.removeEventListener('timeupdate', track); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause);
      v.removeEventListener('loadedmetadata', onReady); v.removeEventListener('canplay', onReady);
    };
  }, [asAudio, videoRef]);
  useEffect(() => { const v = videoRef.current; if (v) { v.defaultPlaybackRate = rate; v.playbackRate = rate; } }, [rate, asAudio, active, videoRef]);

  // Écran verrouillé / notifications : titre, pochette, lecture-pause et ±15 s.
  useEffect(() => {
    const v = videoRef.current;
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !v || !title) return undefined;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new window.MediaMetadata({ title, artist: 'Mejliss TV', artwork: poster ? [{ src: poster }] : [] });
      ms.setActionHandler('play', () => v.play().catch(() => {}));
      ms.setActionHandler('pause', () => v.pause());
      ms.setActionHandler('seekbackward', () => { v.currentTime = Math.max(0, v.currentTime - 15); });
      ms.setActionHandler('seekforward', () => { v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 15); });
    } catch { /* navigateur sans Media Session complète */ }
    return () => { try { ['play', 'pause', 'seekbackward', 'seekforward'].forEach((a) => ms.setActionHandler(a, null)); } catch { /* ignoré */ } };
  }, [asAudio, title, poster, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    const src = active;
    if (!video || !src) return undefined;
    // Changement de mode vidéo ↔ audio : on reprend là où on était, et on relance si ça jouait.
    if (carry.current.seen) { start.current = carry.current.pos; auto.current = carry.current.playing; }
    if (!isHls) {
      const seek = () => { if (start.current > 0) video.currentTime = start.current; };
      video.addEventListener('loadedmetadata', seek, { once: true });
      if (auto.current) video.addEventListener('canplay', () => video.play().catch(() => {}), { once: true });
      video.src = src;
      return () => { video.removeEventListener('loadedmetadata', seek); video.removeAttribute('src'); video.load(); };
    }
    let hls;
    let cancelled = false;
    import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;
      if (Hls.isSupported()) {
        hls = new Hls(start.current > 0 ? { startPosition: start.current } : {});
        hls.loadSource(src);
        hls.attachMedia(video);
        if (auto.current) video.addEventListener('canplay', () => video.play().catch(() => {}), { once: true });
      } else {
        video.src = src; // Safari / iOS : HLS natif
      }
    });
    return () => { cancelled = true; if (hls) hls.destroy(); };
  }, [active, isHls, videoRef]);

  // Aperçu : la lecture s'arrête à la limite (et on ne peut pas sauter au-delà).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !previewSeconds) return undefined;
    if (isHls) { // flux HLS : le serveur coupe déjà l'aperçu ; on prévient simplement quand il se termine
      const done = () => onPreviewEnd && onPreviewEnd();
      video.addEventListener('ended', done);
      return () => video.removeEventListener('ended', done);
    }
    const guard = () => {
      if (video.currentTime >= previewSeconds) {
        video.pause();
        video.currentTime = previewSeconds;
        if (onPreviewEnd) onPreviewEnd();
      }
    };
    video.addEventListener('timeupdate', guard);
    video.addEventListener('seeking', guard);
    return () => { video.removeEventListener('timeupdate', guard); video.removeEventListener('seeking', guard); };
  }, [previewSeconds, isHls, onPreviewEnd, videoRef]);

  if (asAudio) {
    // Mode audio : pochette + lecteur audio (la lecture continue écran éteint si le téléphone l'autorise).
    return (
      <div className="audio-stage" style={poster ? { backgroundImage: `url(${poster})` } : undefined}>
        <div className="audio-veil">
          <span className="audio-badge">🎧</span>
          <audio key="a" ref={videoRef} controls preload="metadata" controlsList="nodownload" />
        </div>
      </div>
    );
  }
  return (
    <video key="v" ref={videoRef} controls playsInline controlsList="nodownload" preload="metadata" poster={poster || undefined}>
      {tracks.map((tr) => <track key={tr.lang} kind="subtitles" srcLang={tr.lang} label={tr.label} src={tr.src} default={tr.isDefault || undefined} />)}
    </video>
  );
}
