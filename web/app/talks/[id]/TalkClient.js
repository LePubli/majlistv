'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import VideoPlayer from '../../../components/VideoPlayer';
import ExternalPlayer from '../../../components/ExternalPlayer';
import Transcript, { langName } from '../../../components/Transcript';
import BooksBlock from '../../../components/BooksBlock';
import Insights from '../../../components/Insights';
import { thumbOf } from '../../../components/TalkCard';
import { pricingPath } from '../../../lib/nav';
import { levelLabel } from '../../../lib/levels';
import NotesPanel from '../../../components/NotesPanel';
import Quiz from '../../../components/Quiz';
import { getResult, saveResult, addPending, removePending, getPending } from '../../../lib/quizLocal';

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

// `initial` : titre, intervenant et description lus côté serveur. Ils sont dans le HTML dès le premier octet (moteurs de recherche,
// partage de lien) et affichés pendant le chargement de la page complète, sans jamais montrer l'invitation « premium » par erreur.
export default function TalkPage({ initial = null, talkId = null }) {
  const params = useParams();
  const id = talkId || params.id; // /conferences/<slug> fournit l'identifiant ; /talks/<identifiant> le lit dans l'adresse
  const { call, t, locale, user, trialDays, prefs } = useApp();
  const router = useRouter();
  const [talk, setTalk] = useState(undefined);
  const [fav, setFav] = useState(false);
  const [resumeMs, setResumeMs] = useState(0);
  const [previewEnded, setPreviewEnded] = useState(false);
  const [similar, setSimilar] = useState([]);
  const [rate, setRate] = useState(1);              // vitesse de lecture (mémorisée sur cet appareil)
  const [audioMode, setAudioMode] = useState(false); // lecture audio seule (écran éteint)
  useEffect(() => {
    try {
      const r = Number(localStorage.getItem('mj-speed'));
      if (SPEEDS.includes(r)) setRate(r);
      setAudioMode(localStorage.getItem('mj-audio') === '1');
    } catch { /* stockage indisponible */ }
  }, []);
  const pickRate = (r) => { setRate(r); try { localStorage.setItem('mj-speed', String(r)); } catch { /* ignoré */ } };
  const pickAudio = (on) => { setAudioMode(on); try { localStorage.setItem('mj-audio', on ? '1' : '0'); } catch { /* ignoré */ } };
  const [notes, setNotes] = useState([]);           // marque-pages et notes de l'utilisateur sur cette conférence
  const [bmFlash, setBmFlash] = useState(false);
  const [tab, setTab] = useState('about');          // onglet affiché sous le lecteur
  const [ins, setIns] = useState({ summary: false, chapters: false }); // ce que contient l'analyse (résumé, chapitres)
  const [ctx, setCtx] = useState(null);            // contexte de série (saison, numéro, précédent / suivant, épisodes)
  const [upNext, setUpNext] = useState(null);      // compte à rebours avant l'épisode suivant (secondes), null = pas affiché
  const [quizOpen, setQuizOpen] = useState(false);   // panneau du quiz ouvert sous le lecteur
  const [quizOffer, setQuizOffer] = useState(false); // invitation affichée sur le lecteur à la fin de la vidéo
  const [qres, setQres] = useState(null);            // dernier résultat connu : { percent, passed }
  const [pending, setPending] = useState([]);        // quiz laissés de côté, rappelés par la bannière
  const [pendingHidden, setPendingHidden] = useState(false);
  const quizRef = useRef(null);
  const [shared, setShared] = useState(null);       // retour visuel du bouton Partager (secondes du lien, -1 = lien simple)
  // ?t=SECONDES (lien depuis un résultat de recherche) : ouvre la vidéo à ce passage, prioritaire sur la reprise.
  const qs = useSearchParams();
  const tParam = Number(qs.get('t'));
  const autoplay = qs.get('autoplay') === '1'; // arrivée depuis « épisode suivant » : la lecture démarre seule
  const jumpMs = Number.isFinite(tParam) && tParam > 0 ? Math.floor(tParam * 1000) : 0;
  const videoRef = useRef(null);

  // Changement de conférence (ex. épisode suivant) : tout repart de zéro, y compris la position de reprise.
  useEffect(() => { setTalk(undefined); setResumeMs(0); setPreviewEnded(false); setUpNext(null); setCtx(null); setQuizOpen(false); setQuizOffer(false); setQres(getResult(id)); setPending(getPending(id)); setPendingHidden(false); startMs.current = 0; }, [id]);

  // Rechargé quand la session change : un propriétaire/admin obtient le lien des vidéos premium.
  useEffect(() => {
    call('/talks/' + id).then((r) => {
      setTalk(r.ok ? r.data : null);
      if (r.ok) { setFav(Boolean(r.data.favorite)); setResumeMs(r.data.resumeMs || 0); }
    });
  }, [id, call]);

  // Série : numéro d'épisode, précédent / suivant et liste des épisodes (avancement du compte connecté).
  useEffect(() => { call(`/talks/${id}/series`).then((r) => setCtx(r.ok ? r.data.series : null)); }, [id, call]);

  useEffect(() => { setSimilar([]); call(`/talks/${id}/similar`, {}, null).then((r) => r.ok && setSimilar(r.data)); }, [id, call]);

  // Arrivée avec ?t= (clic sur un résultat de recherche) : on ouvre la transcription, là où se trouve le passage.
  const hasTracks = Boolean(talk && talk.tracks && talk.tracks.length);
  useEffect(() => { setTab('about'); }, [id]);
  useEffect(() => {
    setNotes([]);
    if (user) call(`/talks/${id}/notes`).then((r) => r.ok && setNotes(r.data));
  }, [id, user, call]);
  const curSec = () => Math.max(0, Math.floor(videoRef.current?.currentTime || 0));
  const addNote = async (body) => {
    const r = await call(`/talks/${id}/notes`, { method: 'POST', body: JSON.stringify({ positionMs: curSec() * 1000, body }) });
    if (!r.ok) return false;
    setNotes((l) => [...l.filter((x) => x.id !== r.data.id), r.data].sort((a, b) => a.positionMs - b.positionMs));
    if (!body) { setBmFlash(true); setTimeout(() => setBmFlash(false), 1800); }
    return true;
  };
  const saveNote = async (nid, body) => {
    const r = await call(`/me/notes/${nid}`, { method: 'PATCH', body: JSON.stringify({ body }) });
    if (r.ok) setNotes((l) => l.map((x) => (x.id === nid ? r.data : x)));
  };
  const dropNote = async (nid) => { setNotes((l) => l.filter((x) => x.id !== nid)); await call(`/me/notes/${nid}`, { method: 'DELETE' }); };
  useEffect(() => { if (jumpMs && hasTracks) setTab('transcript'); }, [jumpMs, hasTracks, id]);

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

  // Fin de lecture : si la conférence a un quiz pas encore réussi, on le propose d'abord ; sinon (ou « Plus tard »),
  // dans une série, compte à rebours de 8 s avant l'épisode suivant (annulable).
  const next = ctx && ctx.next;
  const canChain = Boolean(next && talk && !talk.locked && (talk.hlsPath || external));
  const quizOn = Boolean(talk && !talk.locked && talk.quiz && talk.quiz.available);
  const quizPassed = Boolean(qres && qres.passed);
  useEffect(() => {
    if (!canChain && !quizOn) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;
    const onEnd = () => { if (quizOn && !quizPassed) setQuizOffer(true); else if (canChain) setUpNext(8); };
    video.addEventListener('ended', onEnd);
    return () => video.removeEventListener('ended', onEnd);
  }, [canChain, quizOn, quizPassed, id]);
  useEffect(() => {
    if (upNext === null || !next) return undefined;
    if (upNext <= 0) { router.push(`/talks/${next.id}?autoplay=1`); return undefined; }
    const timer = setTimeout(() => setUpNext((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [upNext, next, router]);
  // Dernier résultat du membre (autre appareil compris) ; ?quiz=1 ouvre le quiz tout de suite (lien « Quiz à rattraper »).
  useEffect(() => {
    if (!quizOn || !user) return;
    call(`/talks/${id}/quiz`).then((r) => { if (r.ok && r.data.last) setQres({ percent: r.data.last.best ?? r.data.last.percent, passed: Boolean(r.data.last.everPassed) }); });
  }, [quizOn, user, id, call]);
  const wantQuiz = qs.get('quiz') === '1';
  useEffect(() => { if (quizOn && wantQuiz) openQuiz(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [quizOn, wantQuiz, id]);
  const openQuiz = () => {
    setQuizOffer(false); setQuizOpen(true);
    setTimeout(() => quizRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const laterQuiz = () => {
    addPending({ id, title: talk.title }); setPending(getPending(id));
    setQuizOffer(false);
    if (canChain) setUpNext(8);
  };
  const onQuizResult = (res) => { setQres(saveResult(id, res)); if (res.passed) removePending(id); };
  // « Revoir à mm:ss » : le lecteur se place sur le passage qui justifie la réponse.
  const seekTo = (sec) => {
    const v = videoRef.current;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (v) { try { v.currentTime = sec; v.play && v.play(); } catch { /* lecteur pas prêt */ } }
  };
  // Liste des épisodes : l'épisode en cours est amené dans la zone visible de la colonne.
  const sideRef = useRef(null);
  useEffect(() => {
    const box = sideRef.current;
    const cur = box && box.querySelector('[aria-current="true"]');
    if (box && cur) box.scrollTop = Math.max(0, cur.offsetTop - box.offsetTop - 60);
  }, [ctx]);

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

  if (talk === undefined) {
    if (!initial) return null;
    return (
      <main className="page watch">
        <div className="watch-grid">
          <div className="watch-main">
            <header className="talk-head">
              {initial.category && <p className="eyebrow">{initial.category}</p>}
              <h1>{initial.title}</h1>
              {initial.speaker && <p className="meta">{initial.speaker}</p>}
            </header>
            {initial.description && <p className="about-text">{initial.description}</p>}
          </div>
        </div>
      </main>
    );
  }
  if (talk === null) return <main className="page"><p>{t('noTalks')}</p></main>;
  const audioLang = String(talk.language || '').split('-')[0].toLowerCase();
  // Sous-titres affichés d'office : la langue de l'interface si elle existe et n'est pas celle de la parole.
  // Langue des sous-titres : celle choisie dans « Mes préférences », sinon celle du site (si elle existe et diffère de la langue parlée).
  const wanted = [prefs?.subLang, locale].find((l) => l && (talk.tracks || []).includes(l) && l !== audioLang);
  const subLang = wanted || null;
  const tracks = (talk.tracks || []).map((lang) => ({
    lang, isDefault: lang === subLang, label: langName(lang, locale), src: `/api/talks/${id}/subs/${lang}.vtt?t=${encodeURIComponent(talk.playbackToken)}`,
  }));

  let player;
  if (talk.source === 'archive') {
    player = talk.fileUrl
      ? (
        <div className="player">
          <VideoPlayer rate={rate} title={talk.title} src={talk.fileUrl} poster={talk.posterUrl} tracks={tracks} videoRef={videoRef} startSeconds={(jumpMs || resumeMs) / 1000} autoPlay={autoplay}
            previewSeconds={talk.preview ? talk.previewSeconds : 0} onPreviewEnd={() => setPreviewEnded(true)} />
        </div>
      )
      : <p className="soon">{talk.playerError || t('playerUnavailable')}</p>;
  } else if (embed) {
    // YouTube / Vimeo : lecteur piloté (transcription cliquable, chapitres, reprise, sous-titres traduits superposés).
    player = (
      <div className="player">
        <ExternalPlayer source={talk.source} videoId={talk.video_ref} title={talk.title} startSeconds={(jumpMs || resumeMs) / 1000} autoPlay={autoplay} rate={rate}
          previewSeconds={talk.preview ? talk.previewSeconds : 0} onPreviewEnd={() => setPreviewEnded(true)} tracks={tracks} videoRef={videoRef} t={t} />
      </div>
    );
  } else if (talk.hlsPath) {
    player = <div className="player"><VideoPlayer rate={rate} title={talk.title} audioSrc={talk.audioPath ? '/api' + talk.audioPath : ''} audioMode={audioMode} src={'/api' + talk.hlsPath} poster={talk.posterUrl} tracks={tracks} videoRef={videoRef} startSeconds={(jumpMs || resumeMs) / 1000} autoPlay={autoplay}
      previewSeconds={talk.preview ? talk.previewSeconds : 0} onPreviewEnd={() => setPreviewEnded(true)} /></div>;
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

  // Invitation à s'abonner : visiteur → essai gratuit (inscription puis formules) ; connecté sans abonnement → formules.
  const lock = talk.locked ? (
    <div className="lock">
      <h2>{t('lkTitle')}</h2>
      <p>{talk.preview ? t('lkIntro') : t('premiumOnly')}</p>
      {talk.preview && <ul className="lock-list"><li>{t('lkB1')}</li><li>{t('lkB2')}</li><li>{t('lkB3')}</li></ul>}
      <div className="lock-cta">
        {user
          ? <Link className="btn btn-lg" href={pricingPath('/talks/' + id)}>{trialDays > 0 ? t('lkTrial').replace('{n}', trialDays) : t('subscribe')}</Link>
          : (
            <>
              <Link className="btn btn-lg" href={`/register?next=${encodeURIComponent(pricingPath('/talks/' + id))}`}>{trialDays > 0 ? t('lkTrial').replace('{n}', trialDays) : t('register')}</Link>
              <Link className="btn ghost btn-lg" href={`/login?next=${encodeURIComponent('/talks/' + id)}`}>{t('lkHave')}</Link>
            </>
          )}
        {user && <Link className="link" href={pricingPath('/talks/' + id)}>{t('lkPlans')}</Link>}
      </div>
      <p className="meta small">{trialDays > 0 ? `${t('lkCancel')}` : ''}</p>
    </div>
  ) : null;

  const hasPlayer = Boolean(talk.hlsPath || external);
  const showTranscript = hasPlayer && tracks.length > 0;
  const transcribing = hasPlayer && !talk.locked && !tracks.length && ['pending', 'processing'].includes(talk.transcriptStatus);
  const hasInsights = hasPlayer && Boolean(talk.playbackToken);

  // Partage : lien vers la conférence, à la minute en cours si la lecture est avancée.
  const share = async () => {
    const sec = Math.floor(videoRef.current?.currentTime || 0);
    const url = `${window.location.origin}/talks/${id}${sec > 5 ? `?t=${sec}` : ''}`;
    try { if (navigator.share) { await navigator.share({ title: talk.title, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); setShared(sec > 5 ? sec : -1); setTimeout(() => setShared(null), 2600); } catch { /* copie refusée : rien à faire */ }
  };
  const clockS = (sec) => clock(sec * 1000);

  // Onglets : seuls ceux qui ont du contenu apparaissent (À propos est toujours là).
  const tabs = [
    { key: 'about', label: t('tabAbout') },
    ...(hasInsights && ins.chapters ? [{ key: 'chapters', label: t('chapters') }] : []),
    ...(showTranscript ? [{ key: 'transcript', label: t('transcript') }] : []),
    ...(hasInsights && ins.summary ? [{ key: 'summary', label: t('summary') }] : []),
    ...(user && hasPlayer && !talk.locked ? [{ key: 'notes', label: `${t('ntTab')}${notes.length ? ` (${notes.length})` : ''}` }] : []),
  ];
  const current = tabs.some((x) => x.key === tab) ? tab : 'about';
  const onTabKey = (e) => {
    const i = tabs.findIndex((x) => x.key === current);
    const dir = getComputedStyle(e.currentTarget).direction === 'rtl' ? -1 : 1;
    let n = -1;
    if (e.key === 'ArrowRight') n = i + dir; else if (e.key === 'ArrowLeft') n = i - dir; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = tabs.length - 1;
    if (n < 0) return;
    e.preventDefault();
    const target = tabs[(n + tabs.length) % tabs.length];
    setTab(target.key);
    document.getElementById(`tab-${target.key}`)?.focus();
  };

  const minutes = talk.durationSeconds ? `${Math.max(1, Math.round(talk.durationSeconds / 60))} ${t('minutes')}` : '';
  const details = [
    [t('dSpeaker'), talk.speaker], [t('dCategory'), talk.category], [t('lvLabel'), levelLabel(talk.level, t)], [t('dLang'), audioLang ? langName(audioLang, locale) : ''],
    [t('dDuration'), minutes], [t('dAccess'), t(talk.access)], [t('dSubs'), (talk.tracks || []).map((l) => langName(l, locale)).join(' · ')],
  ].filter(([, v]) => v);

  return (
    <main className="page watch">
      <div className="watch-grid">
        <div className="watch-main">
          <div className="player-wrap">
            {player}
            {(talk.hlsPath || talk.fileUrl || embed) && (
              <div className="speed-bar" role="group" aria-label={t('spdLabel')}>
                <span className="meta">{t('spdLabel')}</span>
                {SPEEDS.map((r) => (
                  <button key={r} type="button" className={'speed-pill' + (rate === r ? ' on' : '')} aria-pressed={rate === r} onClick={() => pickRate(r)}>{r}×</button>
                ))}
                {user && hasPlayer && !talk.locked && (
                  <button type="button" className="speed-pill bm-btn" onClick={() => addNote('')} title={t('ntBookmarkHelp')}>🔖 {bmFlash ? t('ntBookmarked') : t('ntBookmark')}</button>
                )}
                {talk.audioPath && (
                  <button type="button" className={'speed-pill audio-toggle' + (audioMode ? ' on' : '')} aria-pressed={audioMode} onClick={() => pickAudio(!audioMode)} title={t('audHelp')}>
                    🎧 {audioMode ? t('audBackVideo') : t('audMode')}
                  </button>
                )}
              </div>
            )}
            {talk.locked && talk.preview && !previewEnded && <span className="preview-tag">{t('pvTag').replace('{n}', Math.max(1, Math.round((talk.previewSeconds || 120) / 60)))}</span>}
            {upNext !== null && next && (
              <div className="upnext" role="status" aria-live="polite">
                <p className="meta">{t('upNextIn').replace('{n}', Math.max(0, upNext))}</p>
                <strong>{next.seasonNumber ? `${t('seasonN').replace('{n}', next.seasonNumber)} · ` : ''}{t('epN').replace('{n}', next.number)} — {next.title}</strong>
                <div className="upnext-btns">
                  <button type="button" className="btn" onClick={() => setUpNext(0)}>{t('playNow')}</button>
                  <button type="button" className="btn ghost" onClick={() => setUpNext(null)}>{t('cancelBtn')}</button>
                </div>
              </div>
            )}
            {quizOffer && (
              <div className="upnext quiz-offer" role="status" aria-live="polite">
                <strong>{t('qpOfferTitle')}</strong>
                <p className="meta">{t('qpOfferText').replace('{n}', talk.quiz.count).replace('{m}', Math.max(1, Math.round(talk.quiz.count / 2)))}</p>
                <div className="upnext-btns">
                  <button type="button" className="btn" onClick={openQuiz}>{t('qpStart')}</button>
                  <button type="button" className="btn ghost" onClick={laterQuiz}>{t('qpLater')}</button>
                </div>
              </div>
            )}
            {talk.locked && previewEnded && <div className="preview-end" role="status"><strong>{t('lkEndTitle')}</strong>{lock}</div>}
          </div>
          {!previewEnded && lock}
          {talk.visible === false && (
            <p className="notice" role="status">
              {talk.publication === 'scheduled' && talk.publishAt
                ? t('schedBanner').replace('{d}', new Date(talk.publishAt).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' }))
                : t('draftBanner')}
            </p>
          )}

          {pending.length > 0 && !pendingHidden && (
            <p className="quiz-banner" role="status">
              <span>{t('qpBanner').replace('{title}', pending[0].title)}</span>
              <Link className="link u" href={`/talks/${pending[0].id}?quiz=1`}>{t('qpBannerGo')}</Link>
              <button type="button" className="link" onClick={() => setPendingHidden(true)} aria-label={t('qpClose')}>✕</button>
            </p>
          )}
          {quizOn && (
            <div className="quiz-slot" ref={quizRef}>
              {quizOpen ? (
                <Quiz talkId={id} t={t} call={call} user={user} onResult={onQuizResult} onSeek={seekTo} onClose={() => setQuizOpen(false)}
                  nextHref={canChain ? `/talks/${next.id}?autoplay=1` : null} onNext={(res) => { if (!res.passed) addPending({ id, title: talk.title }); }} />
              ) : (
                <div className="quiz-card">
                  <div>
                    <strong>{t('qpTitle')}</strong>
                    <p className="meta small">{t('qpIntro').replace('{n}', talk.quiz.count)}{qres ? ` · ${qres.passed ? t('qpPassedChip') : t('qpToRevise')} ${qres.percent} %` : ''}</p>
                  </div>
                  <button type="button" className={qres && qres.passed ? 'btn ghost' : 'btn'} onClick={openQuiz}>{qres ? t('qpRetry') : t('qpStart')}</button>
                </div>
              )}
            </div>
          )}

          <header className="talk-head">
            {ctx
              ? (
                <p className="eyebrow">
                  <Link href={`/series/${ctx.id}`}>{ctx.title}</Link>
                  {ctx.season ? ` · ${t('seasonN').replace('{n}', ctx.season.number)}` : ''}{ctx.number ? ` · ${t('epN').replace('{n}', ctx.number)}` : ''}
                </p>
              )
              : talk.category && <p className="eyebrow">{talk.category}</p>}
            <h1>{talk.title}</h1>
            <p className="meta">{talk.level && <span className={`lvl ${talk.level}`}>{levelLabel(talk.level, t)}</span>}{talk.speaker && talk.speakerSlug && <><Link href={`/intervenants/${talk.speakerSlug}`} className="link u">{talk.speaker}</Link>{' · '}</>}{[talk.speakerSlug ? '' : talk.speaker, audioLang ? langName(audioLang, locale) : '', t(talk.access), minutes].filter(Boolean).join(' · ')}</p>
            <div className="talk-actions">
              <button type="button" className={`fav${fav ? ' on' : ''}`} onClick={toggleFav} aria-pressed={fav} title={fav ? t('removeFav') : t('addFav')}>
                <span aria-hidden="true">{fav ? '♥' : '♡'}</span> {fav ? t('inFavorites') : t('addFav')}
              </button>
              {ctx && ctx.prev && <Link className="fav" href={`/talks/${ctx.prev.id}`}><span aria-hidden="true">{locale === 'ar' ? '→' : '←'}</span> {t('prevEp')}</Link>}
              {ctx && ctx.next && <Link className="fav next" href={`/talks/${ctx.next.id}`}>{t('nextEp')} <span aria-hidden="true">{locale === 'ar' ? '←' : '→'}</span></Link>}
              <button type="button" className="fav" onClick={share}><span aria-hidden="true">↗</span> {t('shareBtn')}</button>
              <span className="share-note" role="status" aria-live="polite">{shared === null ? '' : shared > 0 ? t('shareCopiedAt').replace('{t}', clockS(shared)) : t('shareCopied')}</span>
            </div>
            {trackable && resumeMs > 0 && !jumpMs && (
              <p className="meta resume">{t('resumedAt')} {clock(resumeMs)} · <button type="button" className="link" onClick={fromStart}>{t('fromStart')}</button></p>
            )}
            {transcribing && <p className="meta">{t('transcribing')}{talk.transcriptStatus === 'processing' ? ` ${talk.transcriptProgress} %` : ''}</p>}
            {hasPlayer && talk.insightsPending && <p className="meta">{t('insightsWaiting')}</p>}
          </header>

          <div className="talk-tabs">
            <div className="tablist" role="tablist" aria-label={t('tabsLabel')} onKeyDown={onTabKey}>
              {tabs.map((x) => (
                <button key={x.key} id={`tab-${x.key}`} type="button" role="tab" className={x.key === current ? 'tab on' : 'tab'} aria-selected={x.key === current}
                  aria-controls={`panel-${x.key === 'chapters' || x.key === 'summary' ? 'insights' : x.key}`} tabIndex={x.key === current ? 0 : -1} onClick={() => setTab(x.key)}>{x.label}</button>
              ))}
            </div>
            <div id="panel-about" role="tabpanel" aria-labelledby="tab-about" hidden={current !== 'about'} className="tpanel">
              {talk.description && <p className="about-text">{talk.description}</p>}
              {details.length > 0 && <dl className="details">{details.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
            </div>
            {user && hasPlayer && !talk.locked && (
              <div id="panel-notes" role="tabpanel" aria-labelledby="tab-notes" hidden={current !== 'notes'} className="tpanel">
                <NotesPanel notes={notes} onAdd={addNote} onSave={saveNote} onDelete={dropNote} onSeek={seekTo} getPos={() => curSec() * 1000} t={t} />
              </div>
            )}
            {hasInsights && (
              <div id="panel-insights" role="tabpanel" aria-labelledby={`tab-${current}`} hidden={current !== 'chapters' && current !== 'summary'} className="tpanel">
                <Insights key={`${(talk.tracks || []).join()}-${talk.insightsPending}`} talkId={id} token={talk.playbackToken} preferredLang={locale} videoRef={videoRef} locale={locale} t={t}
                  tab={current === 'summary' ? 'summary' : 'chapters'} onData={setIns} />
              </div>
            )}
            {showTranscript && (
              <div id="panel-transcript" role="tabpanel" aria-labelledby="tab-transcript" hidden={current !== 'transcript'} className="tpanel">
                <Transcript key={talk.tracks.join()} talkId={id} token={talk.playbackToken} langs={talk.tracks} defaultLang={talk.tracks.includes(locale) ? locale : (talk.tracks.includes(audioLang) ? audioLang : talk.tracks[0])} videoRef={videoRef} locale={locale} t={t} />
              </div>
            )}
          </div>
        </div>

        {(ctx || similar.length > 0) && (
          <aside className="watch-side" aria-labelledby="side-title" ref={sideRef}>
            {ctx && (
              <section className="side-series">
                <div className="side-head">
                  <h2 id="side-title"><Link href={`/series/${ctx.id}`}>{ctx.title}</Link></h2>
                  <span className="meta small">{t('epOf').replace('{n}', ctx.number || '').replace('{total}', ctx.total)}</span>
                </div>
                <ul className="side-list">
                  {ctx.episodes.map((x, i) => {
                    const pct = x.durationSeconds && x.positionMs ? Math.min(100, Math.round((x.positionMs / 1000 / x.durationSeconds) * 100)) : 0;
                    const startsSeason = x.seasonNumber && (i === 0 || ctx.episodes[i - 1].seasonNumber !== x.seasonNumber);
                    return (
                      <li key={x.id}>
                        {startsSeason && <p className="side-season">{t('seasonN').replace('{n}', x.seasonNumber)}</p>}
                        <Link href={`/talks/${x.id}`} className={`side-item${x.current ? ' on' : ''}`} aria-current={x.current ? 'true' : undefined}>
                          <span className="side-thumb" style={x.posterUrl ? { backgroundImage: `url(${x.posterUrl})` } : undefined}>
                            {(pct > 0 || x.completed) && <span className="progress"><span style={{ width: `${x.completed ? 100 : pct}%` }} /></span>}
                          </span>
                          <span className="side-info">
                            <strong>{x.number}. {x.title}</strong>
                            <span className="meta">{[x.durationSeconds > 0 ? `${Math.max(1, Math.round(x.durationSeconds / 60))} ${t('minutes')}` : '', x.current ? t('nowPlaying') : x.completed ? `✓ ${t('watched')}` : '', x.access === 'premium' ? t('premium') : ''].filter(Boolean).join(' · ')}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {similar.length > 0 && (
              <section className="side-similar">
                <h2 id={ctx ? undefined : 'side-title'}>{ctx ? t('sameVein') : t('nextTitle')}</h2>
                <ul className="side-list">
                  {similar.slice(0, ctx ? 4 : 8).map((x) => {
                    const th = thumbOf(x);
                    return (
                      <li key={x.id}>
                        <Link href={`/talks/${x.id}`} className="side-item">
                          <span className="side-thumb" style={th ? { backgroundImage: `url(${th})` } : undefined}>
                            {x.durationSeconds > 0 && <span className="side-dur">{Math.max(1, Math.round(x.durationSeconds / 60))} {t('minutes')}</span>}
                          </span>
                          <span className="side-info"><strong>{x.title}</strong><span className="meta">{[x.speaker, t(x.access)].filter(Boolean).join(' · ')}</span></span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </aside>
        )}
      </div>
      <BooksBlock kind="talks" id={id} />
    </main>
  );
}
