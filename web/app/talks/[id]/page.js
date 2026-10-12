'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import VideoPlayer from '../../../components/VideoPlayer';
import ExternalPlayer from '../../../components/ExternalPlayer';
import Transcript, { langName } from '../../../components/Transcript';
import Insights from '../../../components/Insights';

export default function TalkPage() {
  const { id } = useParams();
  const { call, t, locale, user } = useApp();
  const router = useRouter();
  const [talk, setTalk] = useState(undefined);
  const [fav, setFav] = useState(false);
  const [resumeMs, setResumeMs] = useState(0);
  const [previewEnded, setPreviewEnded] = useState(false);
  // ?t=SECONDES (lien depuis un résultat de recherche) : ouvre la vidéo à ce passage, prioritaire sur la reprise.
  const tParam = Number(useSearchParams().get('t'));
  const jumpMs = Number.isFinite(tParam) && tParam > 0 ? Math.floor(tParam * 1000) : 0;
  const videoRef = useRef(null);

  // Rechargé quand la session change : un propriétaire/admin obtient le lien des vidéos premium.
  useEffect(() => {
    call('/talks/' + id).then((r) => {
      setTalk(r.ok ? r.data : null);
      if (r.ok) { setFav(Boolean(r.data.favorite)); setResumeMs(r.data.resumeMs || 0); }
    });
  }, [id, call]);

  // Favori : mise à jour immédiate, annulée si le serveur refuse.
  const toggleFav = async () => {
    if (!user) { router.push('/login'); return; }
    const next = !fav;
    setFav(next);
    const r = await call(`/me/favorites/${id}`, { method: next ? 'PUT' : 'DELETE' });
    if (!r.ok) setFav(!next);
  };

  // Reprise de lecture + enregistrement de la position (vidéos envoyées, hors aperçu premium).
  const external = Boolean(talk && talk.source !== 'upload');
  // archive.org : fichier vidéo lu avec le lecteur Mejliss TV (pas de lecteur ni de publicité de la plateforme).
  const embed = Boolean(talk && ['youtube', 'vimeo'].includes(talk.source));
  const trackable = Boolean(user && talk && (talk.hlsPath || external) && !talk.locked);
  const startMs = useRef(0);
  useEffect(() => { if (jumpMs) startMs.current = jumpMs; else if (resumeMs && !startMs.current) startMs.current = resumeMs; }, [resumeMs, jumpMs]);
  useEffect(() => {
    if (!trackable) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;
    let seeked = false;
    const seek = () => {
      if (seeked || !startMs.current) return;
      const dur = video.duration;
      if (Number.isFinite(dur) && startMs.current / 1000 < dur - 10) { video.currentTime = startMs.current / 1000; seeked = true; }
    };
    const save = () => {
      const pos = Math.round(video.currentTime * 1000);
      // Rien avant d'avoir rejoint la position de reprise (évite d'écraser l'ancienne par 0).
      if (pos < 5000 && !seeked && startMs.current) return;
      if (pos < 5000 && !startMs.current) return;
      const dur = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      call(`/me/progress/${id}`, { method: 'PUT', body: JSON.stringify({ positionMs: pos, durationMs: dur }), keepalive: true });
    };
    const timer = setInterval(() => { if (!video.paused && !video.ended) save(); }, 10000);
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    video.addEventListener('loadedmetadata', seek);
    video.addEventListener('canplay', seek);
    video.addEventListener('pause', save);
    video.addEventListener('ended', save);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    seek();
    return () => {
      clearInterval(timer);
      save();
      video.removeEventListener('loadedmetadata', seek);
      video.removeEventListener('canplay', seek);
      video.removeEventListener('pause', save);
      video.removeEventListener('ended', save);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
    };
  }, [trackable, id, call]);

  const fromStart = () => {
    startMs.current = 0;
    setResumeMs(0);
    if (videoRef.current) videoRef.current.currentTime = 0;
  };
  const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  // Pendant la conversion ou la transcription, la page se met à jour toute seule.
  const waiting = talk && !talk.locked
    && ((talk.source === 'upload' && ['pending', 'processing'].includes(talk.status)) || ['pending', 'processing'].includes(talk.transcriptStatus) || talk.translating || talk.insightsPending);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => call('/talks/' + id).then((r) => {
      // Ne remplace pas la vidéo en cours de lecture : met à jour seulement les infos de transcription.
      if (r.ok) setTalk((old) => (old && ((old.hlsPath && r.data.hlsPath) || old.source !== 'upload') ? { ...old, tracks: r.data.tracks, transcriptStatus: r.data.transcriptStatus, translating: r.data.translating, insightsPending: r.data.insightsPending } : r.data));
    }), 8000);
    return () => clearInterval(timer);
  }, [waiting, id, call]);

  if (talk === undefined) return null;
  if (talk === null) return <main className="page"><p>{t('noTalks')}</p></main>;
  const audioLang = String(talk.language || '').split('-')[0].toLowerCase();
  // Sous-titres affichés d'office : la langue de l'interface si elle existe et n'est pas celle de la parole.
  const subLang = (talk.tracks || []).includes(locale) && locale !== audioLang ? locale : null;
  const tracks = (talk.tracks || []).map((lang) => ({
    lang, isDefault: lang === subLang, label: langName(lang, locale), src: `/api/talks/${id}/subs/${lang}.vtt?t=${encodeURIComponent(talk.playbackToken)}`,
  }));

  let player;
  if (talk.source === 'archive') {
    player = talk.fileUrl
      ? (
        <div className="player">
          <VideoPlayer src={talk.fileUrl} poster={talk.posterUrl} tracks={tracks} videoRef={videoRef} startSeconds={(jumpMs || resumeMs) / 1000}
            previewSeconds={talk.preview ? talk.previewSeconds : 0} onPreviewEnd={() => setPreviewEnded(true)} />
        </div>
      )
      : <p className="soon">{talk.playerError || t('playerUnavailable')}</p>;
  } else if (embed) {
    // YouTube / Vimeo : lecteur piloté (transcription cliquable, chapitres, reprise, sous-titres traduits superposés).
    player = (
      <div className="player">
        <ExternalPlayer source={talk.source} videoId={talk.video_ref} title={talk.title} startSeconds={(jumpMs || resumeMs) / 1000}
          previewSeconds={talk.preview ? talk.previewSeconds : 0} onPreviewEnd={() => setPreviewEnded(true)} tracks={tracks} videoRef={videoRef} t={t} />
      </div>
    );
  } else if (talk.hlsPath) {
    player = <div className="player"><VideoPlayer src={'/api' + talk.hlsPath} poster={talk.posterUrl} tracks={tracks} videoRef={videoRef} startSeconds={(jumpMs || resumeMs) / 1000} /></div>;
  } else if (talk.locked) {
    player = <p className="soon">{t('premiumOnly')}</p>;
  } else if (talk.status === 'failed') {
    player = <p className="soon">{t('convFailed')}</p>;
  } else if (talk.videoUrl) {
    // Propriétaire / admin : aperçu du fichier d'origine pendant la conversion.
    player = (
      <>
        <p className="meta">{t('previewMsg')} {talk.status === 'processing' ? `${talk.progress} %` : ''}</p>
        <div className="player"><video controls controlsList="nodownload" src={talk.videoUrl} /></div>
      </>
    );
  } else {
    player = <p className="soon">{t('processingMsg')}</p>;
  }

  const hasPlayer = Boolean(talk.hlsPath || external);
  const showTranscript = hasPlayer && tracks.length > 0;
  const transcribing = hasPlayer && !talk.locked && !tracks.length && ['pending', 'processing'].includes(talk.transcriptStatus);
  return (
    <main className="page watch">
      {player}
      {talk.locked && (
        <div className="paywall">
          <p>{previewEnded ? t('previewEnded') + ' ' : ''}{talk.preview ? t('previewOnly').replace('{n}', Math.max(1, Math.round((talk.previewSeconds || 120) / 60))) : t('premiumOnly')}</p>
          <Link className="btn" href="/pricing">{t('subscribe')}</Link>
        </div>
      )}
      {trackable && resumeMs > 0 && !jumpMs && (
        <p className="meta resume">{t('resumedAt')} {clock(resumeMs)} · <button type="button" className="link" onClick={fromStart}>{t('fromStart')}</button></p>
      )}
      <div className="title-row">
        <h1>{talk.title}</h1>
        <button type="button" className={`fav${fav ? ' on' : ''}`} onClick={toggleFav} aria-pressed={fav} title={fav ? t('removeFav') : t('addFav')}>
          <span aria-hidden="true">{fav ? '♥' : '♡'}</span> {fav ? t('inFavorites') : t('addFav')}
        </button>
      </div>
      <p className="meta">{[talk.speaker, talk.language, talk.category, t(talk.access),
        talk.durationSeconds ? `${Math.max(1, Math.round(talk.durationSeconds / 60))} ${t('minutes')}` : ''].filter(Boolean).join(' · ')}</p>
      <p>{talk.description}</p>
      {transcribing && <p className="meta">{t('transcribing')}{talk.transcriptStatus === 'processing' ? ` ${talk.transcriptProgress} %` : ''}</p>}
      {hasPlayer && talk.insightsPending && <p className="meta">{t('insightsWaiting')}</p>}
      {hasPlayer && talk.playbackToken && (
        <Insights key={`${(talk.tracks || []).join()}-${talk.insightsPending}`} talkId={id} token={talk.playbackToken} preferredLang={locale} videoRef={videoRef} locale={locale} t={t} />
      )}
      {showTranscript && (
        <Transcript key={talk.tracks.join()} talkId={id} token={talk.playbackToken} langs={talk.tracks} defaultLang={talk.tracks.includes(locale) ? locale : (talk.tracks.includes(audioLang) ? audioLang : talk.tracks[0])} videoRef={videoRef} locale={locale} t={t} />
      )}
    </main>
  );
}
