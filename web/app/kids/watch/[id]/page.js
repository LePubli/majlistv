'use client';
// Lecteur de l'espace enfant : la vidéo, un grand bouton retour, et c'est tout. La reprise est propre à l'enfant.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '../../../../components/Providers';
import VideoPlayer from '../../../../components/VideoPlayer';
import ExternalPlayer from '../../../../components/ExternalPlayer';
import { langName } from '../../../../components/Transcript';
import KidsQuiz from '../../../../components/KidsQuiz';

export default function KidsWatch() {
  const { id } = useParams();
  const { t, call, kid, locale } = useApp();
  const [talk, setTalk] = useState(undefined);
  const videoRef = useRef(null);
  const [quiz, setQuiz] = useState(false);
  useEffect(() => { if (kid) call(`/talks/${id}`).then((r) => setTalk(r.ok ? r.data : null)); }, [kid, id, call]);

  // Reprise : on enregistre la position toutes les 10 s, à la pause et à la fermeture (progression de l'enfant, pas celle du parent).
  const startMs = useRef(0);
  useEffect(() => { startMs.current = talk?.resumeMs || 0; }, [talk]);
  useEffect(() => {
    if (!talk) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;
    const save = () => {
      const pos = Math.round((video.currentTime || 0) * 1000);
      if (pos < 5000) return;
      const dur = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      call(`/kids/progress/${id}`, { method: 'PUT', body: JSON.stringify({ positionMs: pos, durationMs: dur }), keepalive: true });
    };
    const timer = setInterval(() => { if (!video.paused && !video.ended) save(); }, 10000);
    const finished = () => { save(); setQuiz(true); }; // fin de la vidéo : on propose le quiz
    video.addEventListener('pause', save); video.addEventListener('ended', finished); window.addEventListener('pagehide', save);
    return () => { clearInterval(timer); save(); video.removeEventListener('pause', save); video.removeEventListener('ended', finished); window.removeEventListener('pagehide', save); };
  }, [talk, id, call]);

  if (!kid) return null;
  if (talk === undefined) return <main className="page kd-page" />;
  const back = <p><Link className="btn kd-back" href="/kids">{t('kdBack')}</Link></p>;
  if (talk === null || talk.locked) return <main className="page kd-page">{back}<p className="soon">{t('kdUnavailableTalk')}</p></main>;
  const tracks = (talk.tracks || []).map((lang) => ({ lang, isDefault: lang === locale && lang !== String(talk.language || '').split('-')[0], label: langName(lang, locale), src: `/api/talks/${id}/subs/${lang}.vtt?t=${encodeURIComponent(talk.playbackToken)}` }));
  const start = (talk.resumeMs || 0) / 1000;
  let player = <p className="soon">{t('playerUnavailable')}</p>;
  if (talk.source === 'archive' && talk.fileUrl) player = <VideoPlayer src={talk.fileUrl} poster={talk.posterUrl} tracks={tracks} videoRef={videoRef} startSeconds={start} />;
  else if (talk.source === 'youtube' || talk.source === 'vimeo') player = <ExternalPlayer source={talk.source} videoId={talk.video_ref} title={talk.title} startSeconds={start} tracks={tracks} videoRef={videoRef} t={t} />;
  else if (talk.hlsPath) player = <VideoPlayer src={'/api' + talk.hlsPath} poster={talk.posterUrl} tracks={tracks} videoRef={videoRef} startSeconds={start} />;
  return (
    <main className="page kd-page kd-watch">
      {back}
      <h1 className="kd-watch-title">{talk.title}</h1>
      <div className="player">{player}</div>
      {talk.quiz?.available && (quiz
        ? <KidsQuiz talkId={id} onClose={() => setQuiz(false)} />
        : <p><button type="button" className="btn kd-quiz-btn" onClick={() => setQuiz(true)}>🎯 {t('kdQuizBtn')}</button></p>)}
      {talk.description && <p className="about-text">{talk.description}</p>}
    </main>
  );
}
