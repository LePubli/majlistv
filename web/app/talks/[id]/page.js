'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import VideoPlayer from '../../../components/VideoPlayer';
import ExternalPlayer from '../../../components/ExternalPlayer';
import Transcript, { langName } from '../../../components/Transcript';
import Insights from '../../../components/Insights';
import { thumbOf } from '../../../components/TalkCard';
import { pricingPath } from '../../../lib/nav';

export default function TalkPage() {
  const { id } = useParams();
  const { call, t, locale, user, trialDays, prefs } = useApp();
  const router = useRouter();
  const [talk, setTalk] = useState(undefined);
  const [fav, setFav] = useState(false);
  const [resumeMs, setResumeMs] = useState(0);
  const [previewEnded, setPreviewEnded] = useState(false);
  const [similar, setSimilar] = useState([]);
  const [tab, setTab] = useState('about');          // onglet affiché sous le lecteur
  const [ins, setIns] = useState({ summary: false, chapters: false }); // ce que contient l'analyse (résumé, chapitres)
  const [shared, setShared] = useState(null);       // retour visuel du bouton Partager (secondes du lien, -1 = lien simple)
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

  useEffect(() => { setSimilar([]); call(`/talks/${id}/similar`, {}, null).then((r) => r.ok && setSimilar(r.data)); }, [id, call]);

  // Arrivée avec ?t= (clic sur un résultat de recherche) : on ouvre la transcription, là où se trouve le passage.
  const hasTracks = Boolean(talk && talk.tracks && talk.tracks.length);
  useEffect(() => { setTab('about'); }, [id]);
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
    player = <div className="player"><VideoPlayer src={'/api' + talk.hlsPath} poster={talk.posterUrl} tracks={tracks} videoRef={videoRef} startSeconds={(jumpMs || resumeMs) / 1000}
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
    [t('dSpeaker'), talk.speaker], [t('dCategory'), talk.category], [t('dLang'), audioLang ? langName(audioLang, locale) : ''],
    [t('dDuration'), minutes], [t('dAccess'), t(talk.access)], [t('dSubs'), (talk.tracks || []).map((l) => langName(l, locale)).join(' · ')],
  ].filter(([, v]) => v);

  return (
    <main className="page watch">
      <div className="watch-grid">
        <div className="watch-main">
          <div className="player-wrap">
            {player}
            {talk.locked && talk.preview && !previewEnded && <span className="preview-tag">{t('pvTag').replace('{n}', Math.max(1, Math.round((talk.previewSeconds || 120) / 60)))}</span>}
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

          <header className="talk-head">
            {talk.category && <p className="eyebrow">{talk.category}</p>}
            <h1>{talk.title}</h1>
            <p className="meta">{[talk.speaker, audioLang ? langName(audioLang, locale) : '', t(talk.access), minutes].filter(Boolean).join(' · ')}</p>
            <div className="talk-actions">
              <button type="button" className={`fav${fav ? ' on' : ''}`} onClick={toggleFav} aria-pressed={fav} title={fav ? t('removeFav') : t('addFav')}>
                <span aria-hidden="true">{fav ? '♥' : '♡'}</span> {fav ? t('inFavorites') : t('addFav')}
              </button>
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

        {similar.length > 0 && (
          <aside className="watch-side" aria-labelledby="side-title">
            <h2 id="side-title">{t('nextTitle')}</h2>
            <ul className="side-list">
              {similar.slice(0, 8).map((x) => {
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
          </aside>
        )}
      </div>
    </main>
  );
}
