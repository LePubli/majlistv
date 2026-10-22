'use client';
// Lecteur YouTube / Vimeo piloté par le site. Il expose dans videoRef un objet qui se comporte comme une balise <video>
// (currentTime, duration, paused, play(), pause(), événements timeupdate / pause / ended / loadedmetadata) :
// transcription cliquable, chapitres, reprise de lecture et liens « ?t= » fonctionnent donc comme pour une vidéo envoyée.
// Les sous-titres traduits sont affichés par-dessus la vidéo (on ne peut pas les injecter dans le lecteur YouTube).
import { useEffect, useRef, useState } from 'react';
import { registerMedia } from '../lib/mediaRegistry';

const scripts = {};
function loadScript(src, ready) {
  if (!scripts[src]) {
    scripts[src] = new Promise((resolve, reject) => {
      if (ready()) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onerror = () => reject(new Error('Lecteur indisponible'));
      if (src.includes('youtube.com')) {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
      } else {
        s.onload = () => resolve();
      }
      document.head.appendChild(s);
    });
  }
  return scripts[src];
}

// Imitation minimale d'un HTMLMediaElement.
class MediaAdapter {
  constructor() { this.l = {}; this.t = 0; this.d = NaN; this.isPaused = true; this.isEnded = false; this.impl = null; }
  addEventListener(type, fn) { (this.l[type] = this.l[type] || new Set()).add(fn); }
  removeEventListener(type, fn) { this.l[type]?.delete(fn); }
  emit(type) { this.l[type]?.forEach((fn) => { try { fn({ type }); } catch { /* écouteur fautif ignoré */ } }); }
  get currentTime() { return this.t; }
  set currentTime(v) { this.t = Math.max(0, Number(v) || 0); this.impl?.seek(this.t); this.emit('timeupdate'); }
  get duration() { return this.d; }
  get paused() { return this.isPaused; }
  get ended() { return this.isEnded; }
  play() { this.impl?.play(); return Promise.resolve(); }
  pause() { this.impl?.pause(); }
  get playbackRate() { return this.rate || 1; }
  set playbackRate(v) { this.rate = Number(v) || 1; this.impl?.setRate?.(this.rate); }
  // Volume (0 à 1) et coupure du son : utilisés par la version française (le son de la vidéo est baissé sous la voix doublée).
  get volume() { return this.vol ?? 1; }
  set volume(v) { this.vol = Math.min(1, Math.max(0, Number(v))); if (!this.mut) this.impl?.setVolume?.(this.vol); }
  get muted() { return Boolean(this.mut); }
  set muted(m) { this.mut = Boolean(m); this.impl?.setVolume?.(this.mut ? 0 : (this.vol ?? 1)); }
}

function parseVtt(text) {
  const ts = (v) => { const p = v.trim().split(':').map(Number); return (p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]) || 0; };
  const cues = [];
  for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const body = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (body) cues.push({ s: ts(a), e: ts(b.trim().split(' ')[0]), text: body });
  }
  return cues;
}

export default function ExternalPlayer({ source, videoId, title, startSeconds = 0, previewSeconds = 0, onPreviewEnd, tracks = [], videoRef, t, autoPlay = false, rate = 1 }) {
  const auto = useRef(autoPlay); // lancement automatique (épisode suivant d'une série)
  const [adapter] = useState(() => new MediaAdapter());
  if (videoRef) videoRef.current = adapter; // disponible avant les effets des composants parents
  useEffect(() => registerMedia(adapter), [adapter]); // la pause de prière peut ainsi l'arrêter (étape 23a)
  const host = useRef(null);
  // Vitesse : appliquée au changement, puis à chaque démarrage (le lecteur distant peut l'ignorer avant d'être prêt).
  useEffect(() => {
    adapter.playbackRate = rate;
    const apply = () => adapter.impl?.setRate?.(rate);
    adapter.addEventListener('canplay', apply); adapter.addEventListener('play', apply);
    return () => { adapter.removeEventListener('canplay', apply); adapter.removeEventListener('play', apply); };
  }, [adapter, rate]);
  const start = useRef(startSeconds); // lu une seule fois, au montage
  const [failed, setFailed] = useState(false);
  const [sub, setSub] = useState(() => (tracks.find((x) => x.isDefault) || {}).lang || '');
  const [cues, setCues] = useState([]);
  const [line, setLine] = useState('');

  // Création du lecteur de la plateforme.
  useEffect(() => {
    let alive = true;
    let poll;
    let player;
    const limit = previewSeconds > 0 ? previewSeconds : 0;
    const guard = () => {
      if (limit && adapter.t >= limit) {
        adapter.impl?.pause();
        adapter.impl?.seek(limit);
        if (onPreviewEnd) onPreviewEnd();
      }
    };
    if (source === 'youtube') {
      loadScript('https://www.youtube.com/iframe_api', () => Boolean(window.YT && window.YT.Player)).then(() => {
        if (!alive) return;
        const el = document.createElement('div');
        host.current.appendChild(el);
        player = new window.YT.Player(el, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { ...(auto.current ? { autoplay: 1 } : {}), start: Math.floor(start.current || 0), ...(limit ? { end: Math.ceil(limit) } : {}), rel: 0, playsinline: 1, iv_load_policy: 3, cc_load_policy: 0 },
          events: {
            onReady: () => {
              adapter.d = player.getDuration() || NaN;
              adapter.t = player.getCurrentTime() || 0;
              adapter.emit('loadedmetadata');
              adapter.emit('canplay');
            },
            onStateChange: (e) => {
              const S = window.YT.PlayerState;
              if (e.data === S.PLAYING) { adapter.isPaused = false; adapter.isEnded = false; adapter.emit('play'); }
              if (e.data === S.PAUSED) { adapter.isPaused = true; adapter.emit('pause'); }
              if (e.data === S.ENDED) { adapter.isPaused = true; adapter.isEnded = true; adapter.emit('ended'); if (limit && onPreviewEnd) onPreviewEnd(); }
            },
          },
        });
        adapter.impl = {
          seek: (s) => player.seekTo?.(s, true),
          play: () => player.playVideo?.(),
          pause: () => player.pauseVideo?.(),
          setRate: (r) => player.setPlaybackRate?.(r),
          setVolume: (v) => player.setVolume?.(Math.round(v * 100)),
        };
        // L'API YouTube n'envoie pas d'événement de temps : on interroge le lecteur 4 fois par seconde.
        poll = setInterval(() => {
          if (!player.getCurrentTime) return;
          adapter.t = player.getCurrentTime() || 0;
          if (!Number.isFinite(adapter.d) || !adapter.d) adapter.d = player.getDuration?.() || NaN;
          if (!adapter.isPaused) { adapter.emit('timeupdate'); guard(); }
        }, 250);
      }).catch(() => alive && setFailed(true));
    } else {
      loadScript('https://player.vimeo.com/api/player.js', () => Boolean(window.Vimeo && window.Vimeo.Player)).then(() => {
        if (!alive) return;
        const frame = document.createElement('iframe');
        frame.src = `https://player.vimeo.com/video/${encodeURIComponent(videoId)}?dnt=1&title=0&byline=0&portrait=0${auto.current ? '&autoplay=1' : ''}${start.current ? `#t=${Math.floor(start.current)}s` : ''}`;
        frame.allow = 'autoplay; fullscreen; picture-in-picture';
        frame.allowFullscreen = true;
        frame.title = title || 'Vimeo';
        host.current.appendChild(frame);
        player = new window.Vimeo.Player(frame);
        player.on('loaded', () => player.getDuration().then((d) => { adapter.d = d; adapter.emit('loadedmetadata'); adapter.emit('canplay'); }));
        player.on('timeupdate', (d) => { adapter.t = d.seconds; adapter.d = d.duration; adapter.emit('timeupdate'); guard(); });
        player.on('play', () => { adapter.isPaused = false; adapter.isEnded = false; adapter.emit('play'); });
        player.on('pause', () => { adapter.isPaused = true; adapter.emit('pause'); });
        player.on('ended', () => { adapter.isPaused = true; adapter.isEnded = true; adapter.emit('ended'); });
        adapter.impl = {
          seek: (s) => player.setCurrentTime(s).catch(() => {}),
          play: () => player.play().catch(() => {}),
          pause: () => player.pause().catch(() => {}),
          setRate: (r) => player.setPlaybackRate(r).catch(() => {}),
          setVolume: (v) => player.setVolume(v).catch(() => {}),
        };
      }).catch(() => alive && setFailed(true));
    }
    return () => {
      alive = false;
      clearInterval(poll);
      try { player?.destroy?.(); } catch { /* déjà détruit */ }
      if (host.current) host.current.innerHTML = '';
      adapter.impl = null;
    };
    // Lecteur recréé seulement si la vidéo change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, videoId]);

  // Sous-titres choisis : chargés puis affichés en suivant la lecture.
  const tracksSig = tracks.map((x) => x.src).join('|'); // la liste est recréée à chaque rendu du parent
  useEffect(() => {
    const tr = tracks.find((x) => x.lang === sub);
    if (!tr) { setCues([]); setLine(''); return undefined; }
    let off = false;
    fetch(tr.src).then((r) => (r.ok ? r.text() : '')).then((txt) => { if (!off) setCues(parseVtt(txt)); }).catch(() => {});
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, tracksSig]);
  useEffect(() => {
    if (!cues.length) { setLine(''); return undefined; }
    const onTime = () => {
      const now = adapter.currentTime;
      const c = cues.find((x) => x.s <= now && now < x.e);
      setLine(c ? c.text : '');
    };
    adapter.addEventListener('timeupdate', onTime);
    return () => adapter.removeEventListener('timeupdate', onTime);
  }, [cues, adapter]);

  if (failed) return <p className="soon">{t ? t('playerUnavailable') : 'Lecteur indisponible'}</p>;
  return (
    <div className="ext-player">
      <div ref={host} className="ext-frame" />
      {line && <div className="ext-sub" aria-live="off">{line}</div>}
      {tracks.length > 0 && (
        <label className="ext-cc">
          <span className="sr-only">{t ? t('subtitles') : 'Sous-titres'}</span>
          <select value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">{t ? t('subtitlesOff') : 'Sans sous-titres'}</option>
            {tracks.map((x) => <option key={x.lang} value={x.lang}>{x.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
