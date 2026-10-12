'use client';
import { useEffect, useRef } from 'react';

// Lecteur vidéo Mejliss TV.
// - Flux HLS (vidéos envoyées) : hls.js (qualité adaptative), lecture native sinon (Safari / iOS).
// - Fichier direct (MP4 / WebM, ex. archive.org) : lecture native par plages, sans téléchargement complet.
// startSeconds : reprise de lecture. videoRef : ref du parent (transcription cliquable). tracks : [{ lang, label, src, isDefault }].
// previewSeconds / onPreviewEnd : aperçu limité (fichiers directs ; pour le HLS, la limite est appliquée par le serveur).
export default function VideoPlayer({ src, poster, tracks = [], videoRef, startSeconds = 0, previewSeconds = 0, onPreviewEnd }) {
  const start = useRef(startSeconds); // position de reprise : lue une seule fois, au montage
  const isHls = /\.m3u8(\?|$)/i.test(src || '');
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;
    if (!isHls) {
      const seek = () => { if (start.current > 0) video.currentTime = start.current; };
      video.addEventListener('loadedmetadata', seek, { once: true });
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
      } else {
        video.src = src; // Safari / iOS : HLS natif
      }
    });
    return () => { cancelled = true; if (hls) hls.destroy(); };
  }, [src, isHls, videoRef]);

  // Aperçu : la lecture s'arrête à la limite (et on ne peut pas sauter au-delà).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !previewSeconds || isHls) return undefined;
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

  return (
    <video ref={videoRef} controls playsInline controlsList="nodownload" preload="metadata" poster={poster || undefined}>
      {tracks.map((tr) => <track key={tr.lang} kind="subtitles" srcLang={tr.lang} label={tr.label} src={tr.src} default={tr.isDefault || undefined} />)}
    </video>
  );
}
