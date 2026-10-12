'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import VideoPlayer from '../../../components/VideoPlayer';
import Transcript, { langName } from '../../../components/Transcript';
import Insights from '../../../components/Insights';

export default function TalkPage() {
  const { id } = useParams();
  const { call, t, locale } = useApp();
  const [talk, setTalk] = useState(undefined);
  const videoRef = useRef(null);

  // Rechargé quand la session change : un propriétaire/admin obtient le lien des vidéos premium.
  useEffect(() => { call('/talks/' + id).then((r) => setTalk(r.ok ? r.data : null)); }, [id, call]);

  // Pendant la conversion ou la transcription, la page se met à jour toute seule.
  const waiting = talk && talk.source === 'upload' && !talk.locked
    && (['pending', 'processing'].includes(talk.status) || ['pending', 'processing'].includes(talk.transcriptStatus) || talk.translating || talk.insightsPending);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => call('/talks/' + id).then((r) => {
      // Ne remplace pas la vidéo en cours de lecture : met à jour seulement les infos de transcription.
      if (r.ok) setTalk((old) => (old && old.hlsPath && r.data.hlsPath ? { ...old, tracks: r.data.tracks, transcriptStatus: r.data.transcriptStatus, translating: r.data.translating, insightsPending: r.data.insightsPending } : r.data));
    }), 8000);
    return () => clearInterval(timer);
  }, [waiting, id, call]);

  if (talk === undefined) return null;
  if (talk === null) return <main className="page"><p>{t('noTalks')}</p></main>;
  const embed = talk.source === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${talk.video_ref}`
    : `https://player.vimeo.com/video/${talk.video_ref}`;
  const audioLang = String(talk.language || '').split('-')[0].toLowerCase();
  // Sous-titres affichés d'office : la langue de l'interface si elle existe et n'est pas celle de la parole.
  const subLang = (talk.tracks || []).includes(locale) && locale !== audioLang ? locale : null;
  const tracks = (talk.tracks || []).map((lang) => ({
    lang, isDefault: lang === subLang, label: langName(lang, locale), src: `/api/talks/${id}/subs/${lang}.vtt?t=${encodeURIComponent(talk.playbackToken)}`,
  }));

  let player;
  if (talk.source !== 'upload') {
    player = <div className="player"><iframe src={embed} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={talk.title} /></div>;
  } else if (talk.locked) {
    player = <p className="soon">{t('locked')}</p>;
  } else if (talk.hlsPath) {
    player = <div className="player"><VideoPlayer src={'/api' + talk.hlsPath} poster={talk.posterUrl} tracks={tracks} videoRef={videoRef} /></div>;
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

  const showTranscript = talk.hlsPath && tracks.length > 0;
  const transcribing = talk.hlsPath && !tracks.length && ['pending', 'processing'].includes(talk.transcriptStatus);
  return (
    <main className="page watch">
      {player}
      <h1>{talk.title}</h1>
      <p className="meta">{talk.speaker} · {talk.language}{talk.category ? ` · ${talk.category}` : ''} · {t(talk.access)}
        {talk.durationSeconds ? ` · ${Math.max(1, Math.round(talk.durationSeconds / 60))} ${t('minutes')}` : ''}</p>
      <p>{talk.description}</p>
      {transcribing && <p className="meta">{t('transcribing')}{talk.transcriptStatus === 'processing' ? ` ${talk.transcriptProgress} %` : ''}</p>}
      {talk.hlsPath && talk.insightsPending && <p className="meta">{t('insightsWaiting')}</p>}
      {talk.hlsPath && talk.playbackToken && (
        <Insights key={`${talk.tracks.join()}-${talk.insightsPending}`} talkId={id} token={talk.playbackToken} preferredLang={locale} videoRef={videoRef} locale={locale} t={t} />
      )}
      {showTranscript && (
        <Transcript key={talk.tracks.join()} talkId={id} token={talk.playbackToken} langs={talk.tracks} defaultLang={talk.tracks.includes(locale) ? locale : (talk.tracks.includes(audioLang) ? audioLang : talk.tracks[0])} videoRef={videoRef} locale={locale} t={t} />
      )}
    </main>
  );
}
