'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import VideoPlayer from '../../../components/VideoPlayer';
import CastButton from '../../../components/CastButton';
import { castableTalk } from '../../../lib/cast';
import ExternalPlayer from '../../../components/ExternalPlayer';
import ModulePanels from '../../../components/ModulePanels';
import Transcript, { langName } from '../../../components/Transcript';
import BooksBlock from '../../../components/BooksBlock';
import Insights from '../../../components/Insights';
import { thumbOf, posterHue } from '../../../components/TalkCard';
import { posterArt } from '../../../lib/thumb';
import { pricingPath } from '../../../lib/nav';
import SaleBox, { SaleOwned } from '../../../components/SaleBox'; // étape C-2 : contenu payant à l'unité
import { levelLabel } from '../../../lib/levels';
import NotesPanel from '../../../components/NotesPanel';
import AskPanel from '../../../components/AskPanel';
import Quiz from '../../../components/Quiz';
import PracticeBlock from '../../../components/PracticeBlock';
import ReportButton from '../../../components/ReportButton';
import ListButton from '../../../components/ListButton';
import Crumbs from '../../../components/Crumbs';
import FollowButton from '../../../components/FollowButton';
import { ActionTile, MoreMenu, PlayerSettings, ICONS } from '../../../components/WatchBar';
import { useTalkStats } from '../../../lib/stats';
import { getResult, saveResult, addPending, removePending, getPending } from '../../../lib/quizLocal';
import InviteCard from '../../../components/InviteCard';
import { BlocksView } from '../../../components/PageBlocks';
import { WatchCtx } from '../../../components/WatchCtx';

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

// `initial` : titre, intervenant et description lus côté serveur. Ils sont dans le HTML dès le premier octet (moteurs de recherche,
// partage de lien) et affichés pendant le chargement de la page complète, sans jamais montrer l'invitation « premium » par erreur.
// `extra` : bloc « Chapitres et extrait » préparé côté serveur (moteurs de recherche), placé au-dessus de « À suivre ».
export default function TalkPage({ initial = null, talkId = null, extra = null }) {
  const params = useParams();
  const id = talkId || params.id; // /conferences/<slug> fournit l'identifiant ; /talks/<identifiant> le lit dans l'adresse
  const { call, t, locale, user, trialDays, prefs, statsOn, feat, formatName, inMyList, toggleMyList, skin, appName } = useApp();
  const pm = skin === 'premium'; // thème Premium : mise en page de la maquette V22 (barre du haut, titre, panneau d'épisodes)
  const [laterMsg, setLaterMsg] = useState('');
  useEffect(() => { if (!laterMsg) return undefined; const k = setTimeout(() => setLaterMsg(''), 3500); return () => clearTimeout(k); }, [laterMsg]);
  const router = useRouter();
  // Étape 6b : fiche vidéo recomposée dans l'éditeur (adresse interne /_watch). undefined = on vérifie, null = pas de fiche en blocs : la fiche d'origine s'affiche.
  const { ready } = useApp();
  const [watchPage, setWatchPage] = useState(undefined);
  useEffect(() => {
    if (!ready) return undefined;
    let dead = false;
    call('/pages/view?path=%2F_watch').then((r) => { if (!dead) setWatchPage(r.ok && r.data?.zones?.main ? r.data : null); }).catch(() => { if (!dead) setWatchPage(null); });
    return () => { dead = true; };
  }, [call, ready, user?.id]);
  const [talk, setTalk] = useState(undefined);
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
  const [dubLang, setDubLang] = useState('orig');      // étape D2 : langue de l'audio écoutée (« fr » = version française du module Doublage)
  const [dubAudio, setDubAudio] = useState(null);      // piste française à lire en mode audio seul (fournie par le module)
  const dubLangRef = useRef('orig');
  dubLangRef.current = dubLang;
  const pickAudio = (on) => { setAudioMode(on); try { localStorage.setItem('mj-audio', on ? '1' : '0'); } catch { /* ignoré */ } };
  const [notes, setNotes] = useState([]);           // marque-pages et notes de l'utilisateur sur cette vidéo
  const [bmFlash, setBmFlash] = useState(false);
  // Étape N6 (16/11) : 3 onglets sous le lecteur — À propos (résumé, chapitres, description, transcription) · Mes notes · Questions.
  const [tab, setTab] = useState('about');
  const [trOpen, setTrOpen] = useState(false);      // transcription dépliée dans « À propos »
  const [cinema, setCinema] = useState(false); // mode cinéma : lecteur pleine largeur, menus masqués (Échap pour sortir)
  const [, setIns] = useState({ summary: false, chapters: false, list: [] }); // ce que contient l’analyse (résumé, chapitres) ; plus utilisé pour les onglets depuis N6
  const [ctx, setCtx] = useState(null);            // contexte de série (saison, numéro, précédent / suivant, épisodes)
  const [upNext, setUpNext] = useState(null);      // compte à rebours avant l'épisode suivant (secondes), null = pas affiché
  const [quizOpen, setQuizOpen] = useState(false);   // panneau du quiz ouvert sous le lecteur
  const [quizOffer, setQuizOffer] = useState(false); // invitation affichée sur le lecteur à la fin de la vidéo
  const [qres, setQres] = useState(null);            // dernier résultat connu : { percent, passed }
  const [pending, setPending] = useState([]);        // quiz laissés de côté, rappelés par la bannière
  const [pendingHidden, setPendingHidden] = useState(false);
  const quizRef = useRef(null);
  const practiceRef = useRef(null);
  const [practiceOpen, setPracticeOpen] = useState(false); // étape C : la mise en pratique s'ouvre SUR la vidéo (comme le quiz)
  const [practiceOffer, setPracticeOffer] = useState(false); // invitation « Et maintenant, que faire ? » à la fin de la vidéo
  const [practiceHl, setPracticeHl] = useState(false);
  const stageRef = useRef(null); // zone du lecteur : le quiz s'y affiche en superposition
  const [shared, setShared] = useState(null);       // retour visuel du bouton Partager (secondes du lien, -1 = lien simple)
  // ?t=SECONDES (lien depuis un résultat de recherche) : ouvre la vidéo à ce passage, prioritaire sur la reprise.
  const qs = useSearchParams();
  const tParam = Number(qs.get('t'));
  const autoplay = qs.get('autoplay') === '1'; // arrivée depuis « épisode suivant » : la lecture démarre seule
  const jumpMs = Number.isFinite(tParam) && tParam > 0 ? Math.floor(tParam * 1000) : 0;
  const videoRef = useRef(null);

  // Changement de vidéo (ex. épisode suivant) : tout repart de zéro, y compris la position de reprise.
  useEffect(() => { setTalk(undefined); setResumeMs(0); setPreviewEnded(false); setUpNext(null); setCtx(null); setQuizOpen(false); setQuizOffer(false); setPracticeOffer(false); setPracticeOpen(false); setQres(getResult(id)); setPending(getPending(id)); setPendingHidden(false); startMs.current = 0; }, [id]);

  // Rechargé quand la session change : un propriétaire/admin obtient le lien des vidéos premium.
  useEffect(() => {
    call('/talks/' + id).then((r) => {
      setTalk(r.ok ? r.data : null);
      if (r.ok) setResumeMs(r.data.resumeMs || 0);
    });
  }, [id, call]);

  // Retour du paiement d'un contenu à l'unité : relecture de la fiche (l'accès arrive avec la confirmation de Stripe).
  const reloadTalk = useCallback(() => call('/talks/' + id).then((r) => { if (r.ok) setTalk(r.data); }), [call, id]);

  // Série : numéro d'épisode, précédent / suivant et liste des épisodes (avancement du compte connecté).
  useEffect(() => { call(`/talks/${id}/series`).then((r) => setCtx(r.ok ? r.data.series : null)); }, [id, call]);

  useEffect(() => { setSimilar([]); call(`/talks/${id}/similar`, {}, null).then((r) => r.ok && setSimilar(r.data)); }, [id, call]);
  // Mode cinéma : la classe sur <body> masque les menus et élargit le lecteur ; Échap en sort ; on en sort aussi en quittant la page.
  useEffect(() => {
    document.body.classList.toggle('cinema-on', cinema);
    if (!cinema) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setCinema(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [cinema]);
  useEffect(() => () => document.body.classList.remove('cinema-on'), []);

  // Arrivée avec ?t= (clic sur un résultat de recherche) : on ouvre la transcription, là où se trouve le passage.
  const hasTracks = Boolean(talk && talk.tracks && talk.tracks.length);
  useEffect(() => { setTab('about'); setTrOpen(false); }, [id]);
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
  useEffect(() => { if (jumpMs && hasTracks) { setTab('about'); setTrOpen(true); } }, [jumpMs, hasTracks, id]);

  // Étape N6 (16/11) : un seul bouton « Ma liste » (favoris et « plus tard » réunis, voir Providers.toggleMyList).
  const mine = Boolean(inMyList(id));
  const onMine = async () => { if (!user) { router.push('/login'); return; } const was = mine; const err = await toggleMyList(id); setLaterMsg(err ? (err === 'error' ? t('errGeneric') : err) : (was ? t('mlRemoved') : t('mlAdded'))); };

  // Reprise de lecture + enregistrement de la position (vidéos envoyées, hors aperçu premium).
  const external = Boolean(talk && talk.source !== 'upload');
  // archive.org : fichier vidéo lu avec le lecteur Mejliss TV (pas de lecteur ni de publicité de la plateforme).
  const embed = Boolean(talk && ['youtube', 'vimeo', 'dailymotion'].includes(talk.source));
  const trackable = Boolean(user && talk && (talk.hlsPath || external) && !talk.locked);
  // Statistiques d'audience anonymes : ouverture, lecture, temps regardé, quartiles, fin (l'aperçu d'une vidéo premium ne compte que comme ouverture).
  useTalkStats({ videoRef, talkId: id, call, active: Boolean(talk && talk.id), playing: Boolean(talk && !talk.locked && (talk.hlsPath || external)), statsOn });
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
      call(`/me/progress/${id}`, { method: 'PUT', body: JSON.stringify({ positionMs: pos, durationMs: dur, audioLang: dubLangRef.current }), keepalive: true });
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

  // Fin de lecture : si la vidéo a un quiz pas encore réussi, on le propose d'abord ; sinon (ou « Plus tard »),
  // dans une série, compte à rebours de 8 s avant l'épisode suivant (annulable).
  const next = ctx && ctx.next;
  const canChain = Boolean(next && talk && !talk.locked && (talk.hlsPath || external));
  const quizOn = Boolean(talk && !talk.locked && talk.quiz && talk.quiz.available);
  const quizPassed = Boolean(qres && qres.passed);
  const practiceOn = Boolean(talk && !talk.locked && talk.practice && talk.practice.available);
  useEffect(() => {
    if (!canChain && !quizOn && !practiceOn) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;
    // Étape N6 (16/11) : toujours le même ordre — quiz, puis « que faire maintenant ? », puis l'épisode suivant.
    const onEnd = () => { if (quizOn && !quizPassed) setQuizOffer(true); else if (practiceOn) setPracticeOffer(true); else if (canChain) setUpNext(8); };
    video.addEventListener('ended', onEnd);
    return () => video.removeEventListener('ended', onEnd);
  }, [canChain, quizOn, quizPassed, practiceOn, id]);
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
    try { videoRef.current?.pause?.(); } catch { /* lecteur pas prêt */ }
    setTimeout(() => stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };
  const laterQuiz = () => {
    addPending({ id, title: talk.title }); setPending(getPending(id));
    setQuizOffer(false);
    if (practiceOn) setPracticeOffer(true); else if (canChain) setUpNext(8);
  };
  // « Et maintenant, que faire ? » : on referme le quiz, on descend jusqu'à l'écran de mise en pratique et on le met en évidence un instant.
  const goPractice = () => {
    setPracticeOffer(false); setQuizOpen(false); setQuizOffer(false);
    if (hasPlayer && !talk.locked) { setPracticeOpen(true); stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; } // sur la vidéo
    setTimeout(() => {
      practiceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      practiceRef.current?.focus({ preventScroll: true });
      setPracticeHl(true); setTimeout(() => setPracticeHl(false), 2500);
    }, 60);
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
        {extra}
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
    // YouTube / Vimeo / Dailymotion : lecteur piloté (transcription cliquable, chapitres, reprise, sous-titres traduits superposés).
    player = (
      <div className="player">
        <ExternalPlayer source={talk.source} videoId={talk.video_ref} title={talk.title} startSeconds={(jumpMs || resumeMs) / 1000} autoPlay={autoplay} rate={rate}
          previewSeconds={talk.preview ? talk.previewSeconds : 0} onPreviewEnd={() => setPreviewEnded(true)} tracks={tracks} videoRef={videoRef} t={t} />
      </div>
    );
  } else if (talk.hlsPath) {
    player = <div className="player"><VideoPlayer rate={rate} title={talk.title} audioSrc={dubAudio || (talk.audioPath ? '/api' + talk.audioPath : '')} audioMode={audioMode} src={'/api' + talk.hlsPath} poster={talk.posterUrl} tracks={tracks} videoRef={videoRef} startSeconds={(jumpMs || resumeMs) / 1000} autoPlay={autoplay}
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
  const lock = talk.locked && talk.sale ? (
    <SaleBox kind="talk" id={id} sale={talk.sale} onPaid={reloadTalk} />
  ) : talk.locked ? (
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

  // Partage : lien vers la vidéo, à la minute en cours si la lecture est avancée.
  const share = async () => {
    const sec = Math.floor(videoRef.current?.currentTime || 0);
    const url = `${window.location.origin}/talks/${id}${sec > 5 ? `?t=${sec}` : ''}`;
    try { if (navigator.share) { await navigator.share({ title: talk.title, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); setShared(sec > 5 ? sec : -1); setTimeout(() => setShared(null), 2600); } catch { /* copie refusée : rien à faire */ }
  };
  const clockS = (sec) => clock(sec * 1000);

  // Étape N6 (16/11) : 3 onglets au plus — À propos (toujours là : résumé et chapitres de l'IA, description, détails, transcription
  // repliée) · Mes notes · Questions (assistant). Les anciens onglets Résumé, Chapitres et Transcription sont des parties d'« À propos ».
  const notesTab = feat('notes') && user && hasPlayer && !talk.locked;
  const askTab = feat('ask') && user && hasPlayer && !talk.locked && talk.tracks?.length > 0;
  const tabs = [
    { key: 'about', label: t('tabAbout') },
    ...(notesTab ? [{ key: 'notes', label: `${t('ntTab')}${notes.length ? ` (${notes.length})` : ''}` }] : []),
    ...(askTab ? [{ key: 'ask', label: t('tpQuestions') }] : []),
  ];
  const current = tabs.some((x) => x.key === tab) ? tab : tabs[0].key;
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

  // Fiche vidéo, proposition B (validée par Epok le 20/10) : lecteur sur un bandeau sombre, barre d'actions en icônes,
  // carte « Apprendre avec cette vidéo » (comprendre, retenir, agir), onglets réduits, « À suivre » en rangée de vignettes.
  const learnOn = quizOn || practiceOn;
  const notesOn = feat('notes') && user && hasPlayer && !talk.locked;
  const revisionOn = Boolean(user && feat('revision'));
  // Phase 6 (20/11) : la fiche relie le programme à Apprendre quand il a des ressources (quiz, mise en pratique) : leçon suivante de la
  // série et bilan personnel s'ajoutent aux étapes existantes. Même progression qu'avant : rien de nouveau n'est suivi ici, on ouvre les écrans existants.
  const nextLesson = learnOn && next ? next : null;
  const bilanOn = Boolean(learnOn && user && feat('selfcheck'));
  const stepOrder = [quizOn && 'quiz', quizOn && revisionOn && 'revision', practiceOn && 'practice', nextLesson && 'next', bilanOn && 'bilan'].filter(Boolean);
  const stepNo = (k) => String(stepOrder.indexOf(k) + 1);
  const openNotes = () => { setTab('notes'); setTimeout(() => document.getElementById('tab-notes')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 40); };

  const stageSec = (
    <>
      {pm ? (
        <div className="pm-wtop">
          <Link className="wb-back" href={ctx ? `/series/${ctx.id}` : '/catalogue'}><span aria-hidden="true">{locale === 'ar' ? '→' : '←'}</span> {ctx ? t('wbBackSeries') : t('wbBack')}</Link>
          <Crumbs items={[['/', appName], ...(talk.format ? [[`/catalogue?format=${talk.format}`, formatName(talk.format)]] : [['/catalogue', t('navCatalogue')]]), [null, t('pmPlayerCrumb')]]} />
          {hasPlayer ? <button type="button" className="pm-wmode" aria-pressed={cinema} onClick={() => setCinema((v) => !v)} title={cinema ? t('cnOff') : t('cnOn')} data-act="cinema">{ICONS.cinema}<span>{t('wbCinema')}</span></button> : <span />}
        </div>
      ) : (
        <>
          <Link className="wb-back" href={ctx ? `/series/${ctx.id}` : '/catalogue'}><span aria-hidden="true">{locale === 'ar' ? '→' : '←'}</span> {ctx ? t('wbBackSeries') : t('wbBack')}</Link>
          <Crumbs items={[['/catalogue', t('navCatalogue')], ...(talk.format ? [[`/catalogue?format=${talk.format}`, formatName(talk.format)]] : []), [null, talk.title]]} />
        </>
      )}

      <section className="wb-hero" aria-label={t('wbStage')} style={thumbOf(talk) ? { '--amb': `url(${thumbOf(talk)})` } : undefined}>
        <div className="player-wrap" ref={stageRef}>
          <div className={quizOpen || practiceOpen ? 'player-stage quiz-on' : 'player-stage'}>
            {player}
            {(talk.hlsPath || talk.fileUrl || embed) && !quizOpen && !practiceOpen && (
              <PlayerSettings label={t('wbPlayerSettings')} rateLabel={`${String(rate).replace('.', locale === 'fr' ? ',' : '.')}×`}>
                <div className="wb-speeds" role="group" aria-label={t('spdLabel')}>
                  <span className="meta small">{t('spdLabel')}</span>
                  <div>{SPEEDS.map((r) => <button key={r} type="button" className={'speed-pill' + (rate === r ? ' on' : '')} aria-pressed={rate === r} onClick={() => pickRate(r)}>{r}×</button>)}</div>
                </div>
                {(talk.audioPath || dubAudio) && (
                  <button type="button" className={`wb-item${audioMode ? ' on' : ''}`} aria-pressed={audioMode} onClick={() => pickAudio(!audioMode)} title={t('audHelp')} data-act="audio">{ICONS.headphones}<span>{audioMode ? t('audBackVideo') : t('audMode')}</span></button>
                )}
                <p className="meta small wb-pset-note">{t('wbSubsHint')}</p>
              </PlayerSettings>
            )}
            {castableTalk(talk) && !quizOpen && !practiceOpen && (
              <CastButton videoRef={videoRef} src={'/api' + talk.hlsPath} title={talk.title} poster={talk.posterUrl} duration={talk.durationSeconds || 0} t={t} />
            )}
            {practiceOpen && practiceOn && (
              <div className="quiz-overlay" role="dialog" aria-modal="false" aria-label={t('pzTitle')}>
                <div>
                  <PracticeBlock talkId={id} t={t} call={call} user={user} onSeek={(sec) => { setPracticeOpen(false); seekTo(sec); }} />
                  <p className="pz-over-close"><button type="button" className="btn ghost" onClick={() => setPracticeOpen(false)}>{t('hmClose')}</button></p>
                </div>
              </div>
            )}
            {quizOpen && (
              <div className="quiz-overlay" role="dialog" aria-modal="false" aria-label={t('qpTitle')}>
                <Quiz talkId={id} t={t} call={call} user={user} onResult={onQuizResult} onSeek={(sec) => { setQuizOpen(false); seekTo(sec); }} onPractice={practiceOn ? goPractice : undefined} onClose={() => setQuizOpen(false)}
                  nextHref={canChain ? `/talks/${next.id}?autoplay=1` : null} onNext={(res) => { if (!res.passed) addPending({ id, title: talk.title }); }} />
              </div>
            )}
          </div>
          {dubLang === 'fr' && <span className="dub-badge">{t('dbBadge')}</span>}
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
          {practiceOffer && (
            <div className="upnext quiz-offer" role="status" aria-live="polite">
              <strong>{t('pzTitle')}</strong>
              <p className="meta">{t('pzOfferText')}</p>
              <div className="upnext-btns">
                <button type="button" className="btn" onClick={goPractice}>{t('pzOfferBtn')}</button>
                <button type="button" className="btn ghost" onClick={() => { setPracticeOffer(false); if (canChain) setUpNext(8); }}>{t('qpLater')}</button>
              </div>
            </div>
          )}
          {talk.locked && previewEnded && <div className="preview-end" role="status"><strong>{t('lkEndTitle')}</strong>{lock}<InviteCard context="preview" next="/coran" compact /></div>}
        </div>

        <div className="wb-info">
          <header className="talk-head">
            {pm && (talk.format || ctx || talk.category) && (
              <p className="eyebrow pm-weyebrow">{[talk.format ? formatName(talk.format) : '', ctx ? `${t('epN').replace('{n}', ctx.number || '')}${ctx.total ? ` / ${ctx.total}` : ''}` : talk.category].filter(Boolean).join(' · ')}</p>
            )}
            {!pm && (talk.format || ctx || talk.category) && (
              <p className="eyebrow">
                {talk.format && <span className="fmt-chip">{formatName(talk.format)}</span>}
                {ctx ? (
                  <>
                    <Link href={`/series/${ctx.id}`}>{ctx.title}</Link>
                    {ctx.season ? ` · ${t('seasonN').replace('{n}', ctx.season.number)}` : ''}{ctx.number ? ` · ${t('epN').replace('{n}', ctx.number)}` : ''}
                  </>
                ) : talk.category}
              </p>
            )}
            <h1>{talk.title}</h1>
            {pm && talk.description && <p className="pm-wsub">{String(talk.description).replace(/\s+/g, ' ').trim().slice(0, 140)}{String(talk.description).length > 140 ? '…' : ''}</p>}
            {talk.sale?.owned && <p className="sale-owned-line"><SaleOwned sale={talk.sale} /></p>}
            {/* Étape D3 (17/11) : les mêmes informations en étiquettes (thème « Mejliss bleu ») : thème, durée, langue, sous-titres, quiz, accès. */}
            <ul className="wb-chips" aria-label={t('wbInfos')}>
              {ctx && talk.category && <li>{talk.category}</li>}
              {minutes && <li className="plain">{minutes}</li>}
              {audioLang && <li className="plain">{langName(audioLang, locale)}</li>}
              {(talk.tracks || []).length > 0 && <li className="plain">{t('wbSubs')} {(talk.tracks || []).map((l) => String(l).split('-')[0].toUpperCase()).join(' · ')}</li>}
              {pm && talk.level && <li className="plain">{levelLabel(talk.level, t)}</li>}
              {quizOn && <li>{t('wbQuizChip').replace('{n}', talk.quiz.count)}</li>}
              <li className={talk.access === 'premium' ? 'prem' : 'plain'}>{t(talk.access)}</li>
            </ul>
            <p className="meta">{talk.level && <span className={`lvl ${talk.level}`}>{levelLabel(talk.level, t)}</span>}<span className="wb-meta-base">{[audioLang ? langName(audioLang, locale) : '', t(talk.access), minutes].filter(Boolean).join(' · ')}</span>{trackable && resumeMs > 0 && !jumpMs && <> · {t('resumedAt')} {clock(resumeMs)} · <button type="button" className="link" onClick={fromStart}>{t('fromStart')}</button></>}</p>
            {talk.speaker && (
              <div className="wb-channel">
                {talk.speakerSlug ? <Link href={`/chaines/${talk.speakerSlug}`} className="wb-chan-name">{talk.speaker}</Link> : <span className="wb-chan-name">{talk.speaker}</span>}
                {talk.speakerSlug && <FollowButton slug={talk.speakerSlug} t={t} call={call} user={user} />}
              </div>
            )}
          </header>

          <div className="wb-bar" role="toolbar" aria-label={t('wbActions')}>
            {(feat('favorites') || feat('watchlater')) && <ActionTile icon={mine ? ICONS.check : ICONS.plus} label={t('lbMyList')} pressed={mine} onClick={onMine} title={mine ? t('mlRemove') : t('mlAdd')} act="mylist" />}
            {feat('lists') && user && <ListButton talkId={id} t={t} call={call} user={user} tile={({ open, toggle }) => <ActionTile icon={ICONS.lists} label={t('wbList')} expanded={open} onClick={toggle} act="list" />} />}
            {laterMsg && <span className="wl-msg" role="status">{laterMsg}</span>}
            {hasPlayer && !pm && <ActionTile icon={ICONS.cinema} label={t('wbCinema')} pressed={cinema} onClick={() => setCinema((v) => !v)} title={cinema ? t('cnOff') : t('cnOn')} act="cinema" />}
            <MoreMenu label={t('wbMore')}>
              <button type="button" className="wb-item" onClick={share} data-act="share" data-close>{ICONS.share}<span>{t('wbShare')}</span></button>
              {user && hasPlayer && !talk.locked && <button type="button" className="wb-item" onClick={() => addNote('')} title={t('ntBookmarkHelp')} data-act="bookmark" data-close>{ICONS.bookmark}<span>{bmFlash ? t('ntBookmarked') : t('wbBookmark')}</span></button>}
              {ctx && ctx.prev && <Link className="wb-item" href={`/talks/${ctx.prev.id}`}>{locale === 'ar' ? ICONS.next : ICONS.prev}<span>{t('prevEp')}</span></Link>}
              {ctx && ctx.next && <Link className="wb-item" href={`/talks/${ctx.next.id}`}>{locale === 'ar' ? ICONS.prev : ICONS.next}<span>{t('nextEp')}</span></Link>}
              {!talk.locked && <Link className="wb-item" href={`/fiche/${id}`} data-act="fiche" data-close>{ICONS.doc}<span>{t('fcOpen')}</span></Link>}
              <ReportButton talkId={id} t={t} call={call} />
            </MoreMenu>
            <span className="share-note" role="status" aria-live="polite">{shared === null ? '' : shared > 0 ? t('shareCopiedAt').replace('{t}', clockS(shared)) : t('shareCopied')}</span>
          </div>
        </div>
      </section>

    </>
  );
  const noticesSec = (
    <>
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
      {transcribing && <p className="meta">{t('transcribing')}{talk.transcriptStatus === 'processing' ? ` ${talk.transcriptProgress} %` : ''}</p>}
      {hasPlayer && talk.insightsPending && <p className="meta">{t('insightsWaiting')}</p>}

    </>
  );
  const gridSec = (side = 'right') => (
    <>
      <div className={`wb-grid wb-side-${side}`}>
        <div className="wb-main">
          {quizOn && (
            <aside className="wb-banner" aria-label={t('wbBannerTitle')}>
              <span className="wb-banner-text"><b>{t('wbBannerTitle')}</b><span>{t('wbBannerSub')}</span></span>
              <button type="button" className="btn sm" onClick={openQuiz} data-act="quiz-banner">{t('wbBannerCta')} <span aria-hidden="true">{locale === 'ar' ? '↖' : '↗'}</span></button>
            </aside>
          )}
          {/* Panneaux des modules (étape D2 : « Langue de l'audio » du module Doublage) */}
          {hasPlayer && !talk.locked && <ModulePanels talk={talk} talkId={id} videoRef={videoRef} audioMode={audioMode} setAudioMode={pickAudio} onAudioLang={setDubLang} setAudioOverride={setDubAudio} spokenLang={audioLang} />}
          {talk.themes?.length > 0 && <p className="th-chips"><span className="meta small">{t('thOnTalk')}</span> {talk.themes.map((x) => <Link key={x.id} href={`/themes/${x.id}`} className="th-chip">{x.title}</Link>)}</p>}
          <div className="talk-tabs">
            {tabs.length > 1 && <div className="tablist" role="tablist" aria-label={t('tabsLabel')} onKeyDown={onTabKey}>
              {tabs.map((x) => (
                <button key={x.key} id={`tab-${x.key}`} type="button" role="tab" className={x.key === current ? 'tab on' : 'tab'} aria-selected={x.key === current}
                  aria-controls={`panel-${x.key}`} tabIndex={x.key === current ? 0 : -1} onClick={() => setTab(x.key)}>{x.label}</button>
              ))}
            </div>}
            <div id="panel-about" role={tabs.length > 1 ? 'tabpanel' : undefined} aria-labelledby={tabs.length > 1 ? 'tab-about' : undefined} hidden={current !== 'about'} className="tpanel">
              {hasInsights && (
                <Insights key={`${(talk.tracks || []).join()}-${talk.insightsPending}`} talkId={id} token={talk.playbackToken} preferredLang={locale} videoRef={videoRef} locale={locale} t={t}
                  tab="all" onData={setIns} />
              )}
              {talk.description && <p className="about-text">{talk.description}</p>}
              {details.length > 0 && <dl className="details">{details.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
              {showTranscript && (
                <details className="tp-transcript" id="tp-transcript" open={trOpen} onToggle={(e) => setTrOpen(e.currentTarget.open)}>
                  <summary>{trOpen ? t('transcript') : t('tpTranscriptShow')}</summary>
                  <Transcript key={talk.tracks.join()} canSuggest={!talk.locked} shareInfo={talk.locked ? null : { title: talk.title, speaker: initial?.speaker || talk.speaker }} talkId={id} token={talk.playbackToken} langs={talk.tracks} defaultLang={talk.tracks.includes(locale) ? locale : (talk.tracks.includes(audioLang) ? audioLang : talk.tracks[0])} videoRef={videoRef} locale={locale} t={t} />
                </details>
              )}
            </div>
            {current === 'ask' && (
              <div id="panel-ask" role="tabpanel" aria-labelledby="tab-ask" className="tpanel">
                <AskPanel talkId={id} t={t} call={call} onSeek={seekTo} />
              </div>
            )}
            {notesOn && (
              <div id="panel-notes" role="tabpanel" aria-labelledby="tab-notes" hidden={current !== 'notes'} className="tpanel">
                <NotesPanel notes={notes} onAdd={addNote} onSave={saveNote} onDelete={dropNote} onSeek={seekTo} getPos={() => curSec() * 1000} t={t} />
              </div>
            )}
          </div>
          {/* Sans lecteur (vidéo non disponible), la mise en pratique reste affichée sous les onglets ; avec lecteur, elle s'ouvre sur la vidéo. */}
          {practiceOn && !practiceOpen && !hasPlayer && <PracticeBlock ref={practiceRef} talkId={id} t={t} call={call} user={user} highlight={practiceHl} onSeek={hasPlayer ? seekTo : undefined} />}
        </div>

        {side !== 'hidden' && (learnOn || notesOn || ctx) && (
          <aside className="wb-side" aria-label={t('wbSide')} ref={sideRef}>
            {(learnOn || notesOn) && (
              <section className="wb-learn" aria-labelledby="wb-learn-title" ref={quizRef}>
                <h2 id="wb-learn-title">{t('wbLearn')}</h2>
                {quizOn && (
                  <div className="wb-step" data-step="quiz">
                    <span className={`wb-num${quizPassed ? ' done' : ''}`} aria-hidden="true">{quizPassed ? '✓' : stepNo('quiz')}</span>
                    <span className="wb-txt"><b>{t('wbStep1')}</b><span>{t('wbStep1Sub').replace('{n}', talk.quiz.count)}{qres ? ` · ${qres.percent} %` : ''}</span></span>
                    <button type="button" className={quizPassed ? 'btn ghost sm' : 'btn sm'} onClick={openQuiz} data-act="quiz">{qres ? t('qpRetry') : t('wbStart')}</button>
                  </div>
                )}
                {quizOn && revisionOn && (
                  <div className="wb-step" data-step="revision">
                    <span className="wb-num" aria-hidden="true">{stepNo('revision')}</span>
                    <span className="wb-txt"><b>{t('wbStep2')}</b><span>{t('wbStep2Sub')}</span></span>
                    <Link className="btn ghost sm" href="/learning?tab=rev">{t('wbStep2Go')}</Link>
                  </div>
                )}
                {practiceOn && (
                  <div className="wb-step" data-step="practice">
                    <span className="wb-num" aria-hidden="true">{stepNo('practice')}</span>
                    <span className="wb-txt"><b>{t('wbStep3')}</b><span>{t('wbStep3Sub')}</span></span>
                    <button type="button" className="btn ghost sm" onClick={goPractice} data-act="practice">{t('wbStep3Go')}</button>
                  </div>
                )}
                {nextLesson && (
                  <div className="wb-step" data-step="next">
                    <span className="wb-num" aria-hidden="true">{stepNo('next')}</span>
                    <span className="wb-txt"><b>{t('wbStepNext')}</b><span>{nextLesson.title}</span></span>
                    <Link className="btn ghost sm" href={`/talks/${nextLesson.id}`}>{t('wbStepNextGo')}</Link>
                  </div>
                )}
                {bilanOn && (
                  <div className="wb-step" data-step="bilan">
                    <span className="wb-num" aria-hidden="true">{stepNo('bilan')}</span>
                    <span className="wb-txt"><b>{t('wbStepBilan')}</b><span>{t('wbStepBilanSub')}</span></span>
                    <Link className="btn ghost sm" href="/learning?tab=progress&s=bilan">{t('wbStepBilanGo')}</Link>
                  </div>
                )}
                {notesOn && <button type="button" className="link wb-notes" onClick={openNotes} data-act="notes">{t('wbNotes').replace('{n}', notes.length)} →</button>}
              </section>
            )}
            {ctx && (
              <section className="side-series">
                {pm ? (
                  <div className="side-head pm-side-head">
                    <h2 id="side-title"><Link href={`/series/${ctx.id}`}>{ctx.season ? t('seasonN').replace('{n}', ctx.season.number) : ctx.title}</Link></h2>
                    <span className="meta small">{t('episodeCount').replace('{n}', ctx.total)}</span>
                  </div>
                ) : (
                  <div className="side-head">
                    <h2 id="side-title"><Link href={`/series/${ctx.id}`}>{ctx.title}</Link></h2>
                    <span className="meta small">{t('epOf').replace('{n}', ctx.number || '').replace('{total}', ctx.total)}</span>
                  </div>
                )}
                <ul className="side-list">
                  {ctx.episodes.map((x, i) => {
                    const pct = x.durationSeconds && x.positionMs ? Math.min(100, Math.round((x.positionMs / 1000 / x.durationSeconds) * 100)) : 0;
                    const startsSeason = x.seasonNumber && (i === 0 || ctx.episodes[i - 1].seasonNumber !== x.seasonNumber);
                    return (
                      <li key={x.id}>
                        {startsSeason && <p className="side-season">{t('seasonN').replace('{n}', x.seasonNumber)}</p>}
                        <Link href={`/talks/${x.id}`} className={`side-item${x.current ? ' on' : ''}`} aria-current={x.current ? 'true' : undefined}>
                          <span className="side-thumb" style={x.posterUrl ? { backgroundImage: `url(${x.posterUrl})` } : undefined}>
                            {pm && <span className="pm-side-num" aria-hidden="true">{x.current ? '▶' : String(x.number || i + 1).padStart(2, '0')}</span>}
                            {(pct > 0 || x.completed) && <span className="progress"><span style={{ width: `${x.completed ? 100 : pct}%` }} /></span>}
                          </span>
                          <span className="side-info">
                            {pm && <small className="pm-side-ep">{t('epN').replace('{n}', String(x.number || i + 1).padStart(2, '0')).toUpperCase()}</small>}
                            <strong>{pm ? '' : `${x.number}. `}{x.title}</strong>
                            <span className="meta">{[x.durationSeconds > 0 ? `${Math.max(1, Math.round(x.durationSeconds / 60))} ${t('minutes')}` : '', x.current ? t('nowPlaying') : x.completed ? `✓ ${t('watched')}` : '', x.access === 'premium' ? t('premium') : ''].filter(Boolean).join(' · ')}</span>
                          </span>
                          {pm && x.completed && <span className="pm-side-ok" aria-hidden="true">✓</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {pm && feat('learning') && !learnOn && (
              <section className="pm-journey" aria-labelledby="pm-journey-t">
                <span className="pm-journey-k">✦ {t('pmJourneyKicker')}</span>
                <h2 id="pm-journey-t" className="pm-journey-h">{t('pmJourneyTitle')}</h2>
                <p>{t('pmJourneySub')}</p>
                <Link href="/learning" className="pm-journey-cta">{t('pmJourneyCta')} <span aria-hidden="true">{locale === 'ar' ? '↖' : '↗'}</span></Link>
              </section>
            )}
          </aside>
        )}
      </div>

    </>
  );
  const nextSec = (max = 8) => (
    <>
      {similar.length > 0 && (
        <section className="wb-next" aria-labelledby="wb-next-title">
          <h2 id="wb-next-title">{pm ? t('pmNextTitle') : ctx ? t('sameVein') : t('nextTitle')}</h2>
          <ul className="wb-row">
            {similar.slice(0, max).map((x) => {
              const th = thumbOf(x);
              return (
                <li key={x.id}>
                  <Link href={`/talks/${x.id}`} className="wb-card">
                    <span className={th ? 'wb-thumb' : 'wb-thumb no-img'} style={th ? { backgroundImage: `url(${th})` } : { '--ph-h': posterHue(x.id), '--ph-art': posterArt(x.id) }}>
                      {x.durationSeconds > 0 && <span className="side-dur">{Math.max(1, Math.round(x.durationSeconds / 60))} {t('minutes')}</span>}
                    </span>
                    <strong>{x.title}</strong>
                    <span className="meta small">{(pm ? [x.category, x.durationSeconds > 0 ? `${Math.max(1, Math.round(x.durationSeconds / 60))} ${t('minutes')}` : ''] : [x.speaker, t(x.access)]).filter(Boolean).join(' · ')}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
  const booksSec = <BooksBlock kind="talks" id={id} />;
  // Fiche en blocs publiée : chaque bloc « Fiche : … » dessine la section correspondante (même code que la fiche d'origine), entre les blocs libres.
  if (watchPage) {
    const sections = { w_stage: () => stageSec, w_notices: () => noticesSec, w_grid: (p) => gridSec(p.side || 'right'), w_next: (p) => nextSec(Math.min(8, Math.max(2, Number(p.max) || 8))), w_books: () => booksSec };
    return (
      <main className="page watch watch-b watch-blocks">
        <WatchCtx.Provider value={{ sections }}>
          <BlocksView blocks={watchPage.zones.main} locale={locale} />
        </WatchCtx.Provider>
        {extra}
      </main>
    );
  }
  return (
    <main className="page watch watch-b">
      {stageSec}
      {noticesSec}
      {gridSec()}
      {extra}
      {nextSec(pm ? 3 : 8)}
      {booksSec}
    </main>
  );
}
