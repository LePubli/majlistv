'use client';
// Page vidéo de l'espace enfant : lecteur (le quiz s'y superpose), infos, carte « Teste-toi », « De quoi ça parle ? » et « Et ensuite ? ».
// La reprise et les étoiles sont propres à l'enfant.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '../../../../../components/Providers';
import VideoPlayer from '../../../../../components/VideoPlayer';
import ExternalPlayer from '../../../../../components/ExternalPlayer';
import { langName } from '../../../../../components/Transcript';
import KidsQuiz from '../../../../../components/KidsQuiz';
import { KidCard } from '../../../../../components/KidsHome';
import { Stars, bandLabel } from '../../../../../lib/kids';
import { useKidTime, leftMin } from '../../../../../lib/kidTime';
import { useTalkStats } from '../../../../../lib/stats';

export default function KidsWatch() {
  const { id } = useParams();
  const { t, call, kid, locale, statsOn } = useApp();
  const [talk, setTalk] = useState(undefined);
  const videoRef = useRef(null);
  const [quiz, setQuiz] = useState(false);
  const [list, setList] = useState([]);   // vidéos de l'âge de l'enfant (étoiles, « et ensuite ? »)
  const [sum, setSum] = useState(null);
  const [gotStars, setGotStars] = useState(null);
  useEffect(() => {
    if (!kid) return;
    call('/kids/talks').then((r) => r.ok && setList(r.data.talks || []));
    call('/kids/summary').then((r) => r.ok && setSum(r.data));
  }, [kid, id, call]);
  useEffect(() => { if (kid) call(`/talks/${id}`).then((r) => setTalk(r.ok ? r.data : r.data?.code === 'kid_time_up' ? { timeUp: true } : null)); }, [kid, id, call]);
  const time = useKidTime(call, kid, null);
  // Statistiques anonymes (compteurs par vidéo, aucun profil identifiable).
  useTalkStats({ videoRef, talkId: id, call, kids: true, active: Boolean(talk && !talk.timeUp && !talk.locked), playing: Boolean(talk && !talk.timeUp && !talk.locked), statsOn });
  // Durée du jour écoulée pendant la lecture : on arrête la vidéo avec douceur.
  useEffect(() => { if (time?.timeUp) videoRef.current?.pause?.(); }, [time]);

  // Reprise : on enregistre la position toutes les 10 s, à la pause et à la fermeture (progression de l'enfant, pas celle du parent).
  const hasQuizRef = useRef(false);
  useEffect(() => { hasQuizRef.current = Boolean(talk?.quiz?.available); }, [talk]);
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
    const finished = () => { save(); if (hasQuizRef.current) { video.pause?.(); setQuiz(true); } }; // fin de la vidéo : on propose le quiz
    video.addEventListener('pause', save); video.addEventListener('ended', finished); window.addEventListener('pagehide', save);
    return () => { clearInterval(timer); save(); video.removeEventListener('pause', save); video.removeEventListener('ended', finished); window.removeEventListener('pagehide', save); };
  }, [talk, id, call]);

  if (!kid) return null;
  if (talk === undefined) return <main className="page kd-page" />;
  const back = <p><Link className="btn kd-back" href="/kids">{t('kdBack')}</Link></p>;
  if (talk?.timeUp || time?.timeUp) return (
    <main className="page kd-page"><section className="kd-timeup" role="status"><p className="kd-moon" aria-hidden="true">🌙</p><h2>{t('kdTimeUpTitle')}</h2><p>{t('kdTimeUpText')}</p>{back}</section></main>
  );
  if (talk === null || talk.locked) return <main className="page kd-page">{back}<p className="soon">{t('kdUnavailableTalk')}</p></main>;
  const tracks = (talk.tracks || []).map((lang) => ({ lang, isDefault: lang === locale && lang !== String(talk.language || '').split('-')[0], label: langName(lang, locale), src: `/api/talks/${id}/subs/${lang}.vtt?t=${encodeURIComponent(talk.playbackToken)}` }));
  const start = (talk.resumeMs || 0) / 1000;
  let player = <p className="soon">{t('playerUnavailable')}</p>;
  if (talk.source === 'archive' && talk.fileUrl) player = <VideoPlayer src={talk.fileUrl} poster={talk.posterUrl} tracks={tracks} videoRef={videoRef} startSeconds={start} />;
  else if (talk.source === 'youtube' || talk.source === 'vimeo' || talk.source === 'dailymotion') player = <ExternalPlayer source={talk.source} videoId={talk.video_ref} title={talk.title} startSeconds={start} tracks={tracks} videoRef={videoRef} t={t} />;
  else if (talk.hlsPath) player = <VideoPlayer src={'/api' + talk.hlsPath} poster={talk.posterUrl} tracks={tracks} videoRef={videoRef} startSeconds={start} />;
  const me = list.find((x) => x.id === id);
  const stars = Math.max(gotStars || 0, me?.stars || 0);
  const next = list.filter((x) => x.id !== id).slice(0, 8);
  const openQuiz = () => { try { videoRef.current?.pause?.(); } catch { /* lecteur pas prêt */ } setQuiz(true); document.getElementById('kd-stage')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  return (
    <main className="page kd-page kd-watch">
      <div className="kd-topbar">
        <Link className="btn kd-back" href="/kids">{t('kdBack')}</Link>
        {sum && <span className="kd-chip kd-chip-stars"><span aria-hidden="true">⭐</span> {t('kdStarsTotal').replace('{n}', sum.stars)}</span>}
      </div>
      {leftMin(time) != null && leftMin(time) <= 5 && <p className="kd-timeleft low" role="status"><span aria-hidden="true">⏳</span> {t('kdTimeLow').replace('{n}', leftMin(time))}</p>}
      <div id="kd-stage" className={quiz ? 'kd-stage quiz-on' : 'kd-stage'}>
        <div className="player">{player}</div>
        {quiz && (
          <div className="quiz-overlay kd-overlay">
            <KidsQuiz talkId={id} onClose={() => setQuiz(false)} onDone={(r) => setGotStars(r.stars)} />
          </div>
        )}
      </div>
      <h1 className="kd-watch-title">{talk.title}</h1>
      <p className="kd-chips">
        {talk.speaker && <span className="kd-chip">🎤 {talk.speaker}</span>}
        {talk.durationSeconds ? <span className="kd-chip">⏱ {Math.max(1, Math.round(talk.durationSeconds / 60))} min</span> : null}
        {me?.kidsBands?.[0] && <span className="kd-chip">🎈 {bandLabel(me.kidsBands[0], t)}</span>}
        {stars > 0 && <span className="kd-chip kd-chip-stars" aria-label={`${stars} / 3`}><Stars n={stars} /></span>}
      </p>
      {talk.quiz?.available && !quiz && (
        <section className="kd-quizcard" aria-labelledby="kd-qc">
          <span className="kd-quizcard-ico" aria-hidden="true">🎯</span>
          <div>
            <h2 id="kd-qc">{t('kdQuizCardTitle')}</h2>
            <p>{stars > 0 ? t('kdQuizCardMore') : t('kdQuizCardText')}</p>
          </div>
          <button type="button" className="btn kd-quiz-btn" onClick={openQuiz}>{stars > 0 ? t('kdReplay') : t('kdQuizPlay')}</button>
        </section>
      )}
      {talk.description && (
        <section className="kd-about" aria-labelledby="kd-ab"><h2 id="kd-ab">💡 {t('kdAbout')}</h2><p className="about-text">{talk.description}</p></section>
      )}
      {next.length > 0 && (
        <section aria-labelledby="kd-nx"><h2 id="kd-nx">{t('kdNext')}</h2><ul className="kd-grid">{next.map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul></section>
      )}
    </main>
  );
}
