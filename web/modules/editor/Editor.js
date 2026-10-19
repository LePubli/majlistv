'use client';
// Studio → Éditeur → un projet (étape E1, maquette « Studio v2 », écran 4) : éditeur multipiste plein écran.
//   En-tête : retour Studio, titre, « Version N · enregistré automatiquement », aperçu 360p, Annuler, Rétablir, Versions,
//             Rendre la vidéo (étape E4).
//   Gauche  : Ajouter (musique de fond : étape E2 ; titres, bandeau, logo, intro / fin, transitions : étape E3), modèles.
//   Centre  : aperçu 360p qui suit le montage. Droite : réglages de la piste sélectionnée.
//   Bas     : outils (Couper, Supprimer le passage, Aimanter, Zoom) et timeline.
// Une seule personne modifie (verrou renouvelé toutes les 25 s) ; les autres voient le projet en lecture seule, mis à jour
// toutes les 10 s. Chaque changement est enregistré tout seul ~1 s après.
// Étape E2 : le document de travail est { clips, audio } ; réglages du son dans le panneau de droite (AudioPanel.js),
// bibliothèque de musiques (MusicLibrary.js), formes d'onde et niveaux mesurés par l'API.
// Étape E3 : le document est { clips, audio, dress } ; habillage (DressPanel.js, DressOverlay.js sur l'aperçu), logos (LogoLibrary.js),
// modèles de chaîne (Templates.js), « Voir l'image finale » (FrameView.js, composée par FFmpeg côté API).
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import Preview from './Preview';
import Timeline from './Timeline';
import Versions from './Versions';
import AudioPanel from './AudioPanel';
import MusicLibrary from './MusicLibrary';
import DressPanel from './DressPanel';
import DressOverlay from './DressOverlay';
import LogoLibrary from './LogoLibrary';
import FrameView from './FrameView';
import Templates from './Templates';
import { layout, locate, total, splitAt, removeClip, moveClip, trimClip, mapItems, snap, snapTargets, fmtTime, parseTime,
  withAudio, mixAt, dubSpans, speechSpans, joins, decodePeaks, addMusic, withDress, addItem, dressEmpty, fillVars, setTransition } from './ops';
import { ago } from '../../lib/format';

const HISTORY = 200;
// Historique des gestes. present = { clips, audio }. Un réglage tiré au curseur (même « key » à moins de 1,5 s) ne compte
// que pour un seul geste à annuler.
function historyReducer(st, a) {
  switch (a.type) {
    case 'reset': return { past: [], present: a.doc, future: [], key: null, at: 0 };
    case 'commit': {
      const now = Date.now();
      if (a.key && st.key === a.key && now - st.at < 1500) return { ...st, present: a.doc, future: [], at: now };
      return { past: [...st.past, st.present].slice(-HISTORY), present: a.doc, future: [], key: a.key || null, at: now };
    }
    case 'undo': return st.past.length ? { past: st.past.slice(0, -1), present: st.past.at(-1), future: [st.present, ...st.future], key: null, at: 0 } : st;
    case 'redo': return st.future.length ? { past: [...st.past, st.present], present: st.future[0], future: st.future.slice(1), key: null, at: 0 } : st;
    default: return st;
  }
}
function tabSession(id) {
  const k = `mt-session-${id}`;
  try {
    const old = sessionStorage.getItem(k);
    if (old) return old;
    const s = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(k, s);
    return s;
  } catch { return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
}
const ZOOM_STEPS = 100;

export default function Editor({ id }) {
  const { t, call, locale } = useApp();
  const session = useMemo(() => (typeof window === 'undefined' ? 'ssr-session' : tabSession(id)), [id]);
  const [data, setData] = useState(null); // { project, media, editable }
  const [error, setError] = useState(null);
  const [h, dispatch] = useReducer(historyReducer, { past: [], present: { clips: [], audio: withAudio(null), dress: withDress(null) }, future: [], key: null, at: 0 });
  const doc = h.present;
  const clips = doc.clips;
  const audio = doc.audio;
  const dress = doc.dress;
  const [waves, setWaves] = useState({ orig: null, dub: null });
  const [musicInfo, setMusicInfo] = useState({}); // id → { title, url, durationS, peaks, stepMs, status, lufs }
  const [showMusic, setShowMusic] = useState(false);
  const [showLogos, setShowLogos] = useState(false);
  const [logos, setLogos] = useState([]);   // logos importés visibles par moi
  const [card, setCard] = useState(null);    // 'intro' | 'outro' : écran montré dans l'aperçu
  const [frameAt, setFrameAt] = useState(null); // instant (ou 'intro' / 'outro') de l'image finale demandée
  const [mode, setMode] = useState('loading'); // loading | edit | read
  const [lock, setLock] = useState(null);
  const [notice, setNotice] = useState(null);
  const [save, setSave] = useState({ state: 'saved', at: null, version: 1 });
  const [T, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState({ track: 'video', id: null });
  const [zoomStep, setZoomStep] = useState(0);
  const [magnet, setMagnet] = useState(true);
  const [showVersions, setShowVersions] = useState(false);
  const [, tick] = useState(0);
  const rev = useRef(1);
  const savedClips = useRef(null);
  const saving = useRef(false);
  const modeRef = useRef(mode); modeRef.current = mode;
  const docRef = useRef(doc); docRef.current = doc;

  const duration = data?.project?.timeline?.duration || 0;
  const totalS = total(clips);
  const maxZoom = Math.max(1, totalS / 20);
  const zoom = Math.exp((zoomStep / ZOOM_STEPS) * Math.log(maxZoom));
  const cues = data?.media?.subtitles?.cues || [];
  const dub = data?.media?.dub || null;

  // --- Chargement, verrou
  const defaultsRef = useRef(null);
  const toDoc = (tl) => ({ clips: tl.clips, audio: withAudio(tl.audio, defaultsRef.current), dress: withDress(tl.dress) });
  const applyProject = useCallback((p) => {
    rev.current = p.rev;
    const d = toDoc(p.timeline);
    savedClips.current = JSON.stringify(d);
    dispatch({ type: 'reset', doc: d });
    setSave({ state: 'saved', at: p.updatedAt, version: p.versionNumber });
    if (p.timeline.ui?.magnet === false) setMagnet(false);
  }, []);

  const load = useCallback(async () => {
    const r = await call(`/studio/editor/projects/${id}?session=${session}`);
    if (!r.ok) { setError(r.data?.code === 'module_off' ? t('mtModuleOff') : r.data?.error || t('dbError')); return null; }
    if (r.data.media?.audioDefaults) defaultsRef.current = r.data.media.audioDefaults;
    setData(r.data);
    return r.data;
  }, [call, id, session, t]);

  const tryLock = useCallback(async () => {
    const r = await call(`/studio/editor/projects/${id}/lock`, { method: 'POST', body: JSON.stringify({ session }) });
    if (!r.ok) return false;
    setLock(r.data.lock);
    setMode(r.data.acquired ? 'edit' : 'read');
    return r.data.acquired;
  }, [call, id, session]);

  useEffect(() => {
    (async () => {
      const d = await load();
      if (!d) return;
      applyProject(d.project);
      setSel({ track: 'video', id: d.project.timeline.clips[0]?.id || null });
      if (!d.editable) { setMode('read'); setLock(d.project.lock); return; }
      await tryLock();
    })();
  }, [load, applyProject, tryLock]);

  // --- Sauvegarde automatique
  const doSave = useCallback(async ({ keepalive = false } = {}) => {
    const now = docRef.current;
    const body = JSON.stringify(now);
    if (modeRef.current !== 'edit' || body === savedClips.current || saving.current) return;
    saving.current = true;
    setSave((s) => ({ ...s, state: 'saving' }));
    const tl = { v: 1, duration, clips: now.clips, audio: now.audio, dress: now.dress, ui: { magnet } };
    const r = await call(`/studio/editor/projects/${id}`, { method: 'PUT', keepalive, body: JSON.stringify({ timeline: tl, rev: rev.current, session }) });
    saving.current = false;
    if (r.ok) {
      rev.current = r.data.rev; savedClips.current = body;
      setSave({ state: JSON.stringify(docRef.current) === body ? 'saved' : 'dirty', at: r.data.savedAt, version: r.data.versionNumber });
      return;
    }
    if (r.status === 409 || r.status === 423) {
      // Quelqu'un d'autre écrit : lecture seule avec le montage à jour (nos changements non enregistrés restent annulables : non).
      setMode('read');
      setNotice({ kind: 'warn', text: r.status === 409 ? t('mtConflict') : t('mtLost').replace('{n}', r.data?.lock?.by || '—') });
      const d = await load();
      if (d) { applyProject(d.project); setLock(d.project.lock); }
      return;
    }
    setSave((s) => ({ ...s, state: 'error' }));
    setNotice({ kind: 'err', text: r.data?.error || t('mtSaveError') });
  }, [call, duration, id, load, applyProject, magnet, session, t]);

  useEffect(() => {
    if (mode !== 'edit') return undefined;
    if (JSON.stringify(doc) === savedClips.current) return undefined;
    setSave((s) => (s.state === 'saving' ? s : { ...s, state: 'dirty' }));
    const h1 = setTimeout(() => doSave(), 1000);
    return () => clearTimeout(h1);
  }, [doc, mode, doSave]);
  // Un enregistrement est arrivé pendant qu'on modifiait encore : on renvoie la suite.
  useEffect(() => { if (save.state === 'dirty' && !saving.current && mode === 'edit') { const h2 = setTimeout(() => doSave(), 1000); return () => clearTimeout(h2); } return undefined; }, [save.state, mode, doSave]);

  // --- Verrou renouvelé (édition) / montage rafraîchi (lecture seule)
  useEffect(() => {
    if (mode === 'edit') {
      const hb = setInterval(async () => {
        const r = await call(`/studio/editor/projects/${id}/lock`, { method: 'POST', body: JSON.stringify({ session }) });
        if (r.ok && !r.data.acquired) {
          setMode('read'); setLock(r.data.lock);
          setNotice({ kind: 'warn', text: t('mtLost').replace('{n}', r.data.lock.by || '—') });
          const d = await load(); if (d) applyProject(d.project);
        }
      }, 25000);
      return () => clearInterval(hb);
    }
    if (mode === 'read' && data?.editable) {
      const poll = setInterval(async () => {
        const d = await load();
        if (!d) return;
        setLock(d.project.lock);
        if (d.project.rev !== rev.current) applyProject(d.project);
      }, 10000);
      return () => clearInterval(poll);
    }
    return undefined;
  }, [mode, call, id, session, load, applyProject, data?.editable, t]);

  // Fermeture de l'onglet ou retour au Studio : dernier enregistrement puis on rend la main.
  const doSaveRef = useRef(doSave); doSaveRef.current = doSave;
  useEffect(() => {
    const leave = () => {
      if (modeRef.current !== 'edit') return;
      doSaveRef.current({ keepalive: true });
      call(`/studio/editor/projects/${id}/unlock`, { method: 'POST', keepalive: true, body: JSON.stringify({ session }) });
    };
    window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('pagehide', leave); leave(); };
  }, [call, id, session]);

  useEffect(() => { const h3 = setInterval(() => tick((x) => x + 1), 15000); return () => clearInterval(h3); }, []);

  // --- Étape E2 : formes d'onde et niveaux mesurés (l'API les calcule ; on revient voir toutes les 4 s tant que ce n'est pas prêt)
  const loadAudio = useCallback(async () => {
    const r = await call(`/studio/editor/projects/${id}/audio`);
    if (!r.ok) return true;
    const w = (x) => (x ? { ...x, peaks: decodePeaks(x.peaks) } : null);
    setWaves({ orig: w(r.data.orig), dub: w(r.data.dub), ffmpeg: r.data.ffmpeg });
    setMusicInfo((old) => {
      const n = { ...old };
      for (const [k, m] of Object.entries(r.data.music || {})) n[k] = { ...m, peaks: decodePeaks(m.wave?.peaks), stepMs: m.wave?.stepMs || 100, status: m.status };
      return n;
    });
    const pending = (x) => x && ['queued', 'running'].includes(x.status);
    return !(pending(r.data.orig) || pending(r.data.dub));
  }, [call, id]);
  useEffect(() => {
    if (!data?.editable) return undefined;
    let alive = true; let h4 = null;
    const go = async () => { const done = await loadAudio(); if (alive && !done) h4 = setTimeout(go, 4000); };
    go();
    return () => { alive = false; clearTimeout(h4); };
  }, [data?.editable, loadAudio]);
  // Une musique du montage pas encore connue (ajoutée, ou version restaurée) : on lit sa fiche et sa forme d'onde.
  const fetchMusic = useCallback(async (mid) => {
    const r = await call(`/studio/editor/music/${mid}`);
    setMusicInfo((old) => ({ ...old, [mid]: r.ok ? { ...r.data.music, peaks: decodePeaks(r.data.music.wave?.peaks), stepMs: r.data.music.wave?.stepMs || 100 } : { missing: true, title: '?' } }));
    return r.ok && r.data.music.status !== 'ready';
  }, [call]);
  useEffect(() => {
    const missing = audio.music.map((m) => m.asset).filter((a, i, all) => all.indexOf(a) === i && !musicInfo[a]);
    for (const a of missing) fetchMusic(a);
  }, [audio.music, musicInfo, fetchMusic]);

  // Contexte du mixage (aperçu et courbe de volume).
  const hasDub = Boolean(data?.media?.dub?.track && data?.media?.dub?.voiceUrl);
  const mixCtx = useMemo(() => ({ hasDub, dubSp: dubSpans(clips, data?.media?.dub?.segments), speechSp: speechSpans(clips, data?.media?.subtitles?.cues), joins: joins(clips).map((j) => j.t) }),
    [clips, hasDub, data?.media?.dub?.segments, data?.media?.subtitles?.cues]);
  const getMix = useCallback((tt) => mixAt(tt, audio, mixCtx), [audio, mixCtx]);
  const sound = useMemo(() => ({
    getMix,
    dubUrl: hasDub ? data.media.dub.voiceUrl : null,
    music: audio.music.filter((m) => musicInfo[m.asset]?.url).map((m) => ({ item: m, url: musicInfo[m.asset].url, assetDur: musicInfo[m.asset].durationS || 0 })),
  }), [getMix, hasDub, data?.media?.dub?.voiceUrl, audio.music, musicInfo]);

  // --- Étape E3 : habillage
  const vars = data?.media?.dress?.vars || {};
  const channel = data?.media?.dress?.channel || null;
  useEffect(() => {
    if (!data?.editable) return;
    call('/studio/editor/logos').then((r) => { if (r.ok) setLogos(r.data.logos); });
  }, [data?.editable, call]);
  const logoUrl = dress.logo.asset === 'channel' ? channel?.avatarUrl || null : logos.find((l) => l.id === dress.logo.asset)?.url || null;
  const durationFinal = totalS + (dress.intro.on ? dress.intro.len : 0) + (dress.outro.on ? dress.outro.len : 0);
  useEffect(() => { if (playing) setCard(null); }, [playing]);
  useEffect(() => { setCard(null); }, [T]);

  const takeOver = async () => {
    if (lock && !lock.otherTab && !window.confirm(t('mtTakeConfirm').replace('{n}', lock.by || '—'))) return;
    const r = await call(`/studio/editor/projects/${id}/takeover`, { method: 'POST', body: JSON.stringify({ session }) });
    if (!r.ok) { setNotice({ kind: 'err', text: r.data?.error || t('dbError') }); return; }
    const d = await load(); if (d) applyProject(d.project);
    setLock(r.data.lock); setMode('edit'); setNotice(null);
  };
  const editHere = async () => { const got = await tryLock(); if (got) { setNotice(null); const d = await load(); if (d) applyProject(d.project); } };

  // --- Gestes de montage
  const canEdit = mode === 'edit';
  const commit = useCallback((next) => { if (canEdit) dispatch({ type: 'commit', doc: { ...docRef.current, clips: next } }); }, [canEdit]);
  const setAudio = useCallback((next, key) => { if (canEdit) dispatch({ type: 'commit', doc: { ...docRef.current, audio: next }, key }); }, [canEdit]);
  const setDress = useCallback((next, key) => { if (canEdit) dispatch({ type: 'commit', doc: { ...docRef.current, dress: next }, key }); }, [canEdit]);
  const selIndex = clips.findIndex((c) => c.id === sel.id);
  const targets = useMemo(() => snapTargets(clips, cues), [clips, cues]);

  const doCut = () => {
    const at = magnet ? snap(T, targets, 0.25) : T;
    const r = splitAt(clips, at);
    if (!r.done) { setNotice({ kind: 'info', text: t('mtCutEdge') }); return; }
    commit(r.clips); setSel({ track: 'video', id: r.clips[r.index].id }); setT(at); setNotice(null);
  };
  const doDelete = () => {
    const i = selIndex >= 0 ? selIndex : locate(clips, T)?.index ?? -1;
    const r = removeClip(clips, i);
    if (!r.done) { setNotice({ kind: 'info', text: t('mtLastClip') }); return; }
    const start = layout(clips)[i].start;
    commit(r.clips); setT(Math.min(start, total(r.clips))); setSel({ track: 'video', id: r.clips[Math.min(i, r.clips.length - 1)].id }); setNotice(null);
  };
  const doMove = (from, to) => { const r = moveClip(clips, from, to); if (r.done) { commit(r.clips); setT(layout(r.clips)[r.index].start); } };
  const doTrim = (i, edge, value) => { const r = trimClip(clips, i, edge, value, duration); if (r.done) commit(r.clips); };
  const addMusicAt = (m) => {
    setMusicInfo((old) => ({ ...old, [m.id]: { ...m, peaks: decodePeaks(m.wave?.peaks), stepMs: m.wave?.stepMs || 100 } }));
    const r = addMusic(audio.music, m.id, Math.min(T, Math.max(0, totalS - 1)), m.durationS || 0, totalS);
    setAudio({ ...audio, music: r.items });
    setSel({ track: 'music', id: r.id }); setShowMusic(false);
  };
  const addItemAt = (kind) => {
    const r = addItem(dress.items, kind, Math.min(T, Math.max(0, totalS - 0.5)), totalS);
    setDress({ ...dress, items: r.items }); setSel({ track: 'item', id: r.id }); setNotice(null);
  };
  const addLogo = () => {
    const hasChannel = Boolean(channel?.avatarUrl);
    setDress({ ...dress, logo: { ...dress.logo, on: true, asset: dress.logo.asset === 'channel' && !hasChannel && logos.length ? logos[0].id : dress.logo.asset } });
    setSel({ track: 'logo', id: null });
    if (!hasChannel && !logos.length) setShowLogos(true);
  };
  const addCards = () => {
    const i = dress.intro; const o = dress.outro;
    setDress({ ...dress, intro: { ...i, on: true, title: i.title || '{titre}', sub: i.sub || '{intervenant}' }, outro: { ...o, on: true, title: o.title || t('mtdOutroTitle') } });
    setSel({ track: 'cards', id: null });
  };
  const addTransition = () => {
    if (clips.length < 2) { setNotice({ kind: 'info', text: t('mtdNeedCut') }); return; }
    setNotice(null);
    if (!dress.transitions.all) setDress(setTransition(dress, 'all', { type: 'dip', len: 0.8 }));
    setSel({ track: 'join', id: 'all' });
  };
  const applyTemplate = (d) => {
    const x = withDress(d);
    setDress({ ...x, transitions: { all: x.transitions.all, byClip: dress.transitions.byClip } });
    setSel({ track: 'titles', id: null });
  };
  const getTimeline = () => ({ v: 1, duration, clips: docRef.current.clips, audio: docRef.current.audio, dress: docRef.current.dress, ui: { magnet } });
  const showFrame = (at) => setFrameAt({ at, n: Date.now() });
  const undo = () => canEdit && dispatch({ type: 'undo' });
  const redo = () => canEdit && dispatch({ type: 'redo' });

  // Raccourcis clavier (hors champs de saisie).
  useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || showVersions || showMusic || showLogos || frameAt) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod) return;
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1);
        if (e.altKey && canEdit && selIndex >= 0) { doMove(selIndex, selIndex + (d > 0 ? 1 : -1)); return; }
        setT((x) => Math.max(0, Math.min(totalS, x + d)));
        return;
      }
      if (!canEdit) return;
      if (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 's') { e.preventDefault(); doCut(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (sel.track === 'music' && sel.id) { setAudio({ ...audio, music: audio.music.filter((m) => m.id !== sel.id) }); setSel({ track: 'music', id: null }); }
        else if (sel.track === 'item' && sel.id) { setDress({ ...dress, items: dress.items.filter((i) => i.id !== sel.id) }); setSel({ track: 'titles', id: null }); }
        else doDelete();
      }
      else if (e.key.toLowerCase() === 'm') setMagnet((m) => !m);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  if (error) return <main className="studio-page"><p className="error" role="alert">{error}</p><Link href="/studio/editor" className="btn ghost">{t('mtBack')}</Link></main>;
  if (!data) return <main className="studio-page"><p className="meta">{t('dbLoading')}</p></main>;

  const p = data.project;
  const loc = locate(clips, T);
  const caption = mapItems(clips, cues).find((m) => T >= m.ts && T < m.te)?.text || '';
  const statusText = mode === 'read' ? t('mtReadOnly')
    : save.state === 'saving' ? t('mtSaving') : save.state === 'dirty' ? t('mtDirty') : save.state === 'error' ? t('mtSaveError')
      : t('mtSavedAgo').replace('{d}', ago(save.at || p.updatedAt, locale));
  const cutS = Math.max(0, duration - totalS);
  const selClip = selIndex >= 0 ? layout(clips)[selIndex] : null;

  return (
    <div className="mt-editor-wrap">
      <div className="mt-small">
        <p>{t('mtDesktopOnly')}</p>
        <Link href="/studio/editor" className="btn ghost">{t('mtBack')}</Link>
      </div>
      <div className="mt-editor">
        <header className="mt-top">
          <Link href="/studio/editor" className="btn ghost mt-backbtn"><span aria-hidden="true" className="mt-chev">‹</span> {t('dbStudio')}</Link>
          <div className="mt-titles">
            <h1 dir="auto">{p.talk.title}</h1>
            <small className="meta" role="status">{t('mtVersionN').replace('{n}', save.version)} · {statusText}</small>
          </div>
          <span className="mt-badge">{t('mtPreviewBadge')}</span>
          <div className="mt-top-actions">
            <button type="button" className="btn ghost sd-pill" onClick={undo} disabled={!canEdit || !h.past.length} title="Ctrl+Z">{t('mtUndo')}</button>
            <button type="button" className="btn ghost sd-pill" onClick={redo} disabled={!canEdit || !h.future.length} title="Ctrl+Maj+Z">{t('mtRedo')}</button>
            <button type="button" className="btn ghost sd-pill mt-gold" onClick={async () => { await doSave(); setShowVersions(true); }}>{t('mtVersions')}</button>
            <button type="button" className="btn sd-pill" disabled title={t('mtRenderSoon')} aria-describedby="mt-render-note">{t('mtRender')}</button>
            <span id="mt-render-note" className="sr-only">{t('mtRenderSoon')}</span>
          </div>
        </header>

        {mode === 'read' && (
          <div className="mt-readonly" role="status">
            <span>{!data.editable ? t('mtNotEditable') : lock?.active ? (lock.otherTab ? t('mtOtherTab') : t('mtLockedBySince').replace('{n}', lock.by || '—').replace('{d}', ago(lock.since, locale))) : t('mtFree')}</span>
            {data.editable && lock?.active && lock.canTake && <button type="button" className="btn sd-pill" onClick={takeOver}>{lock.otherTab ? t('mtEditHere') : t('mtTakeOver')}</button>}
            {data.editable && !lock?.active && <button type="button" className="btn sd-pill" onClick={editHere}>{t('mtEdit')}</button>}
          </div>
        )}
        {notice && <p className={`mt-notice ${notice.kind}`} role={notice.kind === 'err' ? 'alert' : 'status'}>{notice.text}</p>}

        <div className="mt-main">
          <aside className="mt-left" aria-label={t('mtAdd')}>
            <h2 className="mt-cap">{t('mtAdd')}</h2>
            {[['mtAddTitle', () => addItemAt('title')], ['mtAddBanner', () => addItemAt('banner')], ['mtAddLogo', addLogo], ['mtAddMusic', () => setShowMusic(true)],
              ['mtAddIntro', addCards], ['mtAddTransition', addTransition]].map(([k, fn]) => (
              <button key={k} type="button" className="mt-add on" onClick={fn} disabled={!data.editable || (!canEdit && k !== 'mtAddMusic')} data-add={k}><span>{t(k)}</span><b aria-hidden="true">+</b></button>
            ))}
            <h2 className="mt-cap">{t('mtTemplates')}</h2>
            <Templates projectId={id} canEdit={canEdit} dress={dress} onApply={applyTemplate} channelName={channel?.name} />
          </aside>

          <section className="mt-center" aria-label={t('mtPreview')}>
            {data.media
              ? <Preview src={`/api${data.media.preview.hls}`} clips={clips} T={T} onTime={setT} playing={playing} setPlaying={setPlaying} caption={caption} poster={p.talk.posterUrl} sound={sound} hideCaption={dress.subs.burn}>
                <DressOverlay dress={dress} T={T} totalS={totalS} clips={clips} vars={vars} logoUrl={logoUrl} caption={caption} card={card} cardText={card ? dress[card] : null} />
              </Preview>
              : <p className="meta">{t('mtNotEditable')}</p>}
          </section>

          <aside className="mt-right" aria-labelledby="mt-sel-title">
            <h2 className="mt-cap">{t('mtSelTrack')}</h2>
            {['orig', 'dub', 'music'].includes(sel.track)
              ? <AudioPanel {...{ sel, setSel, audio, setAudio, canEdit, dub, hasDub, waves, musicInfo, T, setT, totalS, projectId: id, srcAt: loc ? loc.src : 0, onAddMusic: () => setShowMusic(true) }} />
              : ['titles', 'item', 'logo', 'cards', 'join', 'subs'].includes(sel.track)
                ? <DressPanel {...{ sel, setSel, dress, setDress, canEdit, clips, totalS, T, setT, vars, channel, logos, durationFinal, onPickLogo: () => setShowLogos(true), onShowCard: setCard, onFrame: showFrame, onAddItem: addItemAt,
                  subsInfo: cues.length ? t('mtSubsHint').replace('{l}', String(data.media?.subtitles?.lang || '').toUpperCase()).replace('{n}', mapItems(clips, cues).length).replace('{c}', cues.length) : t('mtNoSubsHint') }} />
              : <TrackPanel {...{ t, sel, selClip, selIndex, clips, totalS, cutS, cues, canEdit, doTrim, doDelete, setT, locale, subsLang: data.media?.subtitles?.lang }} />}
          </aside>
        </div>

        <div className="mt-bottom">
          <div className="mt-tools">
            <button type="button" className="btn ghost sd-pill" onClick={doCut} disabled={!canEdit} title="C">{t('mtCut')}</button>
            <button type="button" className="btn ghost sd-pill" onClick={doDelete} disabled={!canEdit || clips.length < 2} title={t('mtDeleteKey')}>{t('mtDelete')}</button>
            <button type="button" className={`btn ghost sd-pill${magnet ? ' mt-on' : ''}`} aria-pressed={magnet} onClick={() => setMagnet((m) => !m)} title="M">{t('mtMagnet')}</button>
            <span className="mt-sum meta small">{t('mtSum').replace('{e}', fmtTime(totalS)).replace('{s}', fmtTime(duration)).replace('{n}', clips.length)}{loc ? ` · ${t('mtAtSource').replace('{s}', fmtTime(loc.src, { tenths: true }))}` : ''}</span>
            <label className="mt-zoom">
              <span>{t('mtZoom')}</span>
              <input type="range" min={0} max={ZOOM_STEPS} value={zoomStep} onChange={(e) => setZoomStep(Number(e.target.value))} aria-valuetext={`× ${zoom.toFixed(1)}`} />
            </label>
          </div>
          <Timeline clips={clips} duration={duration} T={T} onSeek={(v) => { setT(v); }} sel={sel} onSelect={setSel} onMove={doMove} onTrim={doTrim}
            cues={cues} dub={dub} zoom={zoom} magnet={magnet} readOnly={!canEdit} subsLang={data.media?.subtitles?.lang ? data.media.subtitles.lang.toUpperCase() : ''} titlesCount={0} dress={dress} vars={vars} onItems={(items) => setDress({ ...dress, items })}
            audio={audio} waves={waves} musicInfo={musicInfo} getMix={getMix} onMusic={(items) => setAudio({ ...audio, music: items })} />
        </div>
      </div>
      {showLogos && <LogoLibrary canEdit={canEdit} current={dress.logo.asset} onClose={() => setShowLogos(false)} onChanged={setLogos}
        onPick={(l) => { setDress({ ...dress, logo: { ...dress.logo, on: true, asset: l.id } }); setShowLogos(false); setSel({ track: 'logo', id: null }); }} />}
      {frameAt && <FrameView key={frameAt.n} projectId={id} getTimeline={getTimeline} at={frameAt.at} onClose={() => setFrameAt(null)} />}
      {showMusic && <MusicLibrary canEdit={canEdit} onClose={() => setShowMusic(false)} onAdd={addMusicAt} atLabel={fmtTime(Math.min(T, Math.max(0, totalS - 1)))} />}
      {showVersions && <Versions projectId={id} session={session} canEdit={canEdit} onClose={() => setShowVersions(false)} beforeAction={() => doSave()}
        onRestored={(res, version) => {
          if (res) { rev.current = res.rev; const d = toDoc(res.timeline); savedClips.current = JSON.stringify(d); dispatch({ type: 'reset', doc: d }); setT(0); setSel({ track: 'video', id: res.timeline.clips[0]?.id }); }
          setSave((s) => ({ ...s, state: 'saved', at: res?.savedAt || s.at, version }));
        }} />}
    </div>
  );
}

// Panneau de droite : réglages de la piste ou de l'extrait sélectionné.
function TrackPanel({ t, sel, selClip, selIndex, clips, totalS, cutS, cues, canEdit, doTrim, doDelete, setT, subsLang }) {
  const [inV, setInV] = useState(''); const [outV, setOutV] = useState('');
  useEffect(() => { if (selClip) { setInV(fmtTime(selClip.in, { tenths: true })); setOutV(fmtTime(selClip.out, { tenths: true })); } }, [selClip?.id, selClip?.in, selClip?.out]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = (edge, str) => { const v = parseTime(str); if (Number.isNaN(v)) return; doTrim(selIndex, edge, v); };
  const inMontage = mapItems(clips, cues).length;

  if (sel.track === 'video' && selClip) {
    return (
      <div className="mt-panel">
        <h3 id="mt-sel-title">{t('mtTrVideo')}</h3>
        <p className="meta">{t('mtClipN').replace('{n}', selIndex + 1).replace('{c}', clips.length)}</p>
        <div className="mt-field">
          <label htmlFor="mt-in">{t('mtClipIn')}</label>
          <input id="mt-in" dir="ltr" value={inV} disabled={!canEdit} onChange={(e) => setInV(e.target.value)} onBlur={(e) => apply('in', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') apply('in', e.currentTarget.value); }} />
        </div>
        <div className="mt-field">
          <label htmlFor="mt-out">{t('mtClipOut')}</label>
          <input id="mt-out" dir="ltr" value={outV} disabled={!canEdit} onChange={(e) => setOutV(e.target.value)} onBlur={(e) => apply('out', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') apply('out', e.currentTarget.value); }} />
        </div>
        <div className="mt-kv"><span>{t('mtClipLen')}</span><b dir="ltr">{fmtTime(selClip.out - selClip.in, { tenths: true })}</b></div>
        <div className="mt-kv"><span>{t('mtClipAt')}</span><b dir="ltr">{fmtTime(selClip.start, { tenths: true })}</b></div>
        <div className="mt-actions">
          <button type="button" className="btn ghost sd-pill" onClick={() => setT(selClip.start)}>{t('mtGoStart')}</button>
          <button type="button" className="btn ghost sd-pill" onClick={doDelete} disabled={!canEdit || clips.length < 2}>{t('mtDelete')}</button>
        </div>
        <p className="mt-hint">{t('mtVideoHint').replace('{e}', fmtTime(totalS)).replace('{c}', fmtTime(cutS))}</p>
      </div>
    );
  }
  const blocks = {
    titles: [t('mtTrTitles'), t('mtTitlesHint'), null],
    subs: [t('mtTrSubs'), cues.length ? t('mtSubsHint').replace('{l}', String(subsLang || '').toUpperCase()).replace('{n}', inMontage).replace('{c}', cues.length) : t('mtNoSubsHint'), t('mtSubsBurn')],
    video: [t('mtTrVideo'), t('mtPickClip'), null],
  }[sel.track] || [t('mtTrVideo'), t('mtPickClip'), null];
  return (
    <div className="mt-panel">
      <h3 id="mt-sel-title">{blocks[0]}</h3>
      <p className="mt-hint">{blocks[1]}</p>
      {blocks[2] && <p className="meta small">{blocks[2]}</p>}
    </div>
  );
}
