'use client';
// Page d'une conférence → « Langue de l'audio » (maquette « Studio v2 », écran 7) — étape D2.
// - Version française disponible : choix Version française / Voix d'origine. Vidéo envoyée : la vidéo est coupée et la piste
//   « mix » (voix française + voix d'origine baissée) est jouée en phase avec elle ; YouTube / Vimeo / archive.org : le son de la
//   vidéo est baissé et la voix française seule est jouée par-dessus. Mode audio seul : la piste « mix » est lue directement.
// - Pas encore de version française : « Demander la version française » (abonnés), nombre de demandes.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { tf } from './shared';

const DRIFT = 0.35; // écart toléré entre la vidéo et la voix française (secondes) avant de recaler

// Joue `src` en phase avec le lecteur (balise <video> ou lecteur YouTube / Vimeo piloté).
function useDubSync({ videoRef, src, on, hasMix, duck, deps }) {
  useEffect(() => {
    if (!on || !src) return undefined;
    let media = null;
    let stopped = false;
    // Balise <audio> cachée dans la page (et non un objet Audio isolé) : les lecteurs d'écran l'ignorent, les tests peuvent la lire.
    const audio = document.createElement('audio');
    audio.className = 'dub-sync';
    audio.hidden = true;
    audio.setAttribute('aria-hidden', 'true');
    audio.preload = 'auto';
    audio.src = src;
    document.body.appendChild(audio);
    const quiet = () => {
      if (!media) return;
      if (hasMix) media.muted = true; // la piste « mix » contient déjà la voix d'origine baissée
      else media.volume = duck / 100; // voix seule : on baisse le son de la vidéo
    };
    const sync = (force) => {
      if (!media) return;
      const tm = media.currentTime || 0;
      if (force || Math.abs((audio.currentTime || 0) - tm) > DRIFT) { try { audio.currentTime = tm; } catch { /* pas encore prêt */ } }
      audio.playbackRate = media.playbackRate || 1;
    };
    const onPlay = () => { quiet(); sync(true); audio.play().catch(() => {}); };
    const onPause = () => audio.pause();
    const onTime = () => { if (!media.paused) { sync(false); if (audio.paused) audio.play().catch(() => {}); } };
    const onSeek = () => sync(true);
    const onRate = () => { audio.playbackRate = media.playbackRate || 1; };
    // Bouton « son » du lecteur : il règle le volume de la version française (la vidéo reste coupée pour éviter deux voix).
    const onVolume = () => { if (hasMix && !media.muted) { audio.volume = media.volume; media.muted = true; } };
    const attach = () => {
      if (stopped) return;
      media = videoRef.current;
      if (!media) { setTimeout(attach, 300); return; }
      quiet();
      media.addEventListener('play', onPlay); media.addEventListener('pause', onPause); media.addEventListener('ended', onPause);
      media.addEventListener('timeupdate', onTime); media.addEventListener('seeked', onSeek); media.addEventListener('ratechange', onRate);
      media.addEventListener('volumechange', onVolume);
      if (!media.paused) onPlay();
    };
    attach();
    return () => {
      stopped = true;
      audio.pause(); audio.removeAttribute('src'); audio.load(); audio.remove();
      if (media) {
        media.removeEventListener('play', onPlay); media.removeEventListener('pause', onPause); media.removeEventListener('ended', onPause);
        media.removeEventListener('timeupdate', onTime); media.removeEventListener('seeked', onSeek); media.removeEventListener('ratechange', onRate);
        media.removeEventListener('volumechange', onVolume);
        if (hasMix) media.muted = false; else media.volume = 1;
      }
    };
  }, [on, src, hasMix, duck, videoRef, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function TalkAudio({ talk, talkId, videoRef, audioMode, setAudioMode, onAudioLang, setAudioOverride, spokenLang }) {
  const { t, call, user } = useApp();
  const [d, setD] = useState(null);
  const [lang, setLang] = useState('orig');
  const [msg, setMsg] = useState('');
  const token = talk?.playbackToken || '';
  const load = useRef(null);
  load.current = () => call(`/talks/${talkId}/dub${token ? `?t=${encodeURIComponent(token)}` : ''}`).then((r) => setD(r.ok ? r.data : false));
  useEffect(() => { load.current(); }, [talkId, token, Boolean(user)]); // eslint-disable-line react-hooks/exhaustive-deps

  const playable = Boolean(d && d.available && d.urls);
  const hasMix = Boolean(d?.hasMix && d?.urls?.mix);
  // Langue mémorisée sur cet appareil
  useEffect(() => {
    if (!playable) return;
    let saved = 'fr';
    try { saved = localStorage.getItem('mj-dub-lang') || 'fr'; } catch { /* ignoré */ }
    setLang(saved === 'orig' ? 'orig' : 'fr');
  }, [playable]);
  const fr = playable && lang === 'fr';
  // Mode audio seul + version française (vidéo envoyée) : le lecteur lit directement la piste « mix ».
  const asAudio = fr && hasMix && audioMode;
  useEffect(() => { setAudioOverride?.(fr && hasMix ? d.urls.mix : null); }, [fr, hasMix, d]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onAudioLang?.(fr ? 'fr' : 'orig'); }, [fr]); // eslint-disable-line react-hooks/exhaustive-deps
  useDubSync({ videoRef, src: hasMix ? d?.urls?.mix : d?.urls?.voice, on: fr && !asAudio, hasMix, duck: d?.duck ?? 15, deps: [audioMode] });

  const pick = (l) => { setLang(l); try { localStorage.setItem('mj-dub-lang', l); } catch { /* ignoré */ } };
  const request = async (on) => {
    const r = await call(`/talks/${talkId}/dub/request`, { method: on ? 'POST' : 'DELETE' });
    if (r.ok) { setD({ ...d, ...r.data }); setMsg(on ? t('dbReqSent') : ''); } else setMsg(r.data?.error || t('dbError'));
  };

  if (!d) return null;
  if (!d.available) {
    // Rien à proposer pour une conférence déjà en français.
    if (String(spokenLang || '').startsWith('fr')) return null;
    return (
      <section className="dub-card dub-missing" aria-labelledby="dub-miss-h">
        <div>
          <h2 id="dub-miss-h">{t('dbNoFrenchTitle')}</h2>
          <p className="meta">{t('dbNoFrenchText')}</p>
          {d.requests > 0 && <p className="meta small">{tf(t(d.requests === 1 ? 'dbReqCount1' : 'dbReqCount'), { n: d.requests })}</p>}
          {msg && <p className="meta small" role="status">{msg}</p>}
        </div>
        <div className="dub-missing-act">
          {d.requested
            ? <><span className="dub-done">✓ {t('dbReqDone')}</span><button type="button" className="link" onClick={() => request(false)}>{t('dbReqUndo')}</button></>
            : d.canRequest
              ? <button type="button" className="btn" onClick={() => request(true)}>{t('dbReqBtn')}</button>
              : d.signedIn
                ? <Link className="btn ghost" href="/pricing">{t('dbReqSubscribers')}</Link>
                : <Link className="btn ghost" href={`/login?next=/talks/${talkId}`}>{t('dbReqLogin')}</Link>}
        </div>
      </section>
    );
  }
  return (
    <section className="dub-card" aria-labelledby="dub-h">
      <h2 id="dub-h">{t('dbAudioLang')}</h2>
      <div className="dub-opts" role="radiogroup" aria-labelledby="dub-h">
        <button type="button" role="radio" aria-checked={fr} disabled={!playable} className={`dub-opt${fr ? ' on' : ''}`} onClick={() => pick('fr')}>
          <span className="dub-dot" aria-hidden="true" />
          <span><strong>{t('dbAudioFr')}</strong><small>{t(d.hasMix ? 'dbFrSubMix' : 'dbFrSubVoice')}</small></span>
        </button>
        <button type="button" role="radio" aria-checked={!fr} className={`dub-opt${!fr ? ' on' : ''}`} onClick={() => pick('orig')}>
          <span className="dub-dot" aria-hidden="true" />
          <span><strong>{t('dbOrigVoice')}</strong><small>{t('dbOrigSub')}</small></span>
        </button>
      </div>
      {!playable && <p className="meta small">{t('dbFrLocked')}</p>}
      <p className="dub-note">{t('dbVersesNote')}</p>
      {hasMix && (
        <div className="dub-row">
          <span>{t('dbAudioOnly')}</span>
          <button type="button" className="link" aria-pressed={audioMode} onClick={() => setAudioMode?.(!audioMode)}>{audioMode ? t('dbAudioOnlyOff') : t('dbAudioOnlyOn')}</button>
        </div>
      )}
    </section>
  );
}
