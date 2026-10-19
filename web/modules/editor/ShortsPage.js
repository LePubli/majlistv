'use client';
// Studio → Éditeur → « Extraits 9:16 » (étape E5b) : de courts extraits verticaux (1080 × 1920) pour les réseaux sociaux.
//   - on choisit le passage (début / fin, ou en cliquant dans le texte de la conférence) ;
//   - un cadre vertical glissable sur la vidéo choisit la partie de l'image gardée ;
//   - sous-titres courts (5 mots au plus), titre en haut pendant les premières secondes, voix française en option ;
//   - réglages enregistrés tout seuls ; le rendu est fait par le serveur (RenderPanel, mode vertical), téléchargeable en MP4.
// Adresse : /studio/editor/<montage>/shorts?s=<extrait>
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { fmtTime } from './ops';
import RenderPanel from './RenderPanel';

const FRAME = 9 / 16; // largeur du cadre vertical = hauteur × 9/16
const NOOP = () => {};
const num = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 10) / 10 : null; };

export default function ShortsPage({ projectId }) {
  const { t, call } = useApp();
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null); // id de l'extrait ouvert
  const [data, setData] = useState(null); // { short, media, editable }
  const [form, setForm] = useState(null);
  const [save, setSave] = useState('idle'); // idle | saving | saved | error
  const [msg, setMsg] = useState(null);
  const [showRender, setShowRender] = useState(false);
  const [words, setWords] = useState(null);
  const [pick, setPick] = useState('start');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [vw, setVw] = useState({ w: 16, h: 9 });
  const rev = useRef(0); const timer = useRef(null); const video = useRef(null); const canvas = useRef(null); const stage = useRef(null);
  const formRef = useRef(null); formRef.current = form;

  const loadList = useCallback(async () => {
    const r = await call(`/studio/editor/projects/${projectId}/shorts`);
    if (r.ok) setList(r.data); else setMsg({ ok: false, text: r.data?.error || t('dbError') });
    return r;
  }, [call, projectId, t]);
  useEffect(() => {
    loadList().then((r) => {
      const s = new URLSearchParams(window.location.search).get('s');
      if (r.ok) setSel(s && r.data.shorts.some((x) => x.id === s) ? s : r.data.shorts[0]?.id || null);
    });
  }, [loadList]);

  const apply = useCallback((s) => {
    rev.current = s.rev;
    setForm({ title: s.title, from: s.from, to: s.to, cropX: s.cropX, captions: s.captions, lang: s.lang, dub: s.dub, showTitle: s.showTitle });
  }, []);
  useEffect(() => {
    if (!sel) { setData(null); setForm(null); return; }
    let alive = true;
    call(`/studio/editor/shorts/${sel}`).then((r) => { if (!alive) return; if (r.ok) { setData(r.data); apply(r.data.short); setSave('idle'); setMsg(null); } else setMsg({ ok: false, text: r.data?.error || t('dbError') }); });
    window.history.replaceState(null, '', `?s=${sel}`);
    return () => { alive = false; };
  }, [sel, call, apply, t]);
  useEffect(() => {
    call(`/studio/editor/projects/${projectId}/words`).then((r) => { if (r.ok) setWords(r.data); });
  }, [call, projectId]);

  // Enregistrement automatique (0,7 s après le dernier réglage).
  const flush = useCallback(async () => {
    clearTimeout(timer.current); timer.current = null;
    const f = formRef.current; if (!f || !sel) return true;
    setSave('saving');
    const r = await call(`/studio/editor/shorts/${sel}`, { method: 'PUT', body: JSON.stringify({ rev: rev.current, ...f }) });
    if (r.ok) { rev.current = r.data.short.rev; setData((d) => ({ ...d, short: r.data.short })); setSave('saved'); setList((l) => l && ({ ...l, shorts: l.shorts.map((x) => (x.id === sel ? r.data.short : x)) })); return true; }
    if (r.status === 409 && r.data?.short) { apply(r.data.short); setData((d) => ({ ...d, short: r.data.short })); }
    setSave('error'); setMsg({ ok: false, text: r.data?.error || t('dbError') });
    return false;
  }, [call, sel, apply, t]);
  const change = (patch) => {
    if (!data?.editable) return;
    setForm((f) => ({ ...f, ...patch })); setSave('dirty'); setMsg(null);
    clearTimeout(timer.current); timer.current = setTimeout(flush, 700);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // Lecture 16:9 (hls.js) du passage.
  const src = data?.media?.preview?.hls ? `/api${data.media.preview.hls}` : null;
  useEffect(() => {
    const v = video.current; if (!v || !src) return undefined;
    let hls = null; let alive = true;
    const meta = () => alive && setVw({ w: v.videoWidth || 16, h: v.videoHeight || 9 });
    v.addEventListener('loadedmetadata', meta);
    if (v.canPlayType('application/vnd.apple.mpegurl')) v.src = src;
    else import('hls.js').then(({ default: Hls }) => { if (!alive || !Hls.isSupported()) return; hls = new Hls({ maxBufferLength: 20 }); hls.loadSource(src); hls.attachMedia(v); }).catch(() => {});
    return () => { alive = false; v.removeEventListener('loadedmetadata', meta); if (hls) hls.destroy(); };
  }, [src]);
  // Suivi du temps, boucle sur le passage, aperçu vertical dessiné dans un canvas.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = video.current; const f = formRef.current; const c = canvas.current;
      if (v && f) {
        if (!v.paused && (v.currentTime >= f.to || v.currentTime < f.from - 0.5)) v.currentTime = f.from;
        setTime((o) => (Math.abs(o - v.currentTime) > 0.09 ? v.currentTime : o));
        if (c && v.videoWidth) {
          const g = c.getContext('2d'); const cw = Math.min(v.videoWidth, v.videoHeight * FRAME); const x = (v.videoWidth - cw) * (f.cropX / 100);
          g.drawImage(v, x, 0, cw, v.videoHeight, 0, 0, c.width, c.height);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const toggle = () => {
    const v = video.current; if (!v || !form) return;
    if (v.paused) { if (v.currentTime < form.from || v.currentTime >= form.to) v.currentTime = form.from; v.play().catch(() => {}); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };
  const seek = (s) => { const v = video.current; if (v) { try { v.currentTime = s; } catch { /* pas prêt */ } setTime(s); } };

  // Cadre vertical : glisser sur la vidéo.
  const dragging = useRef(false);
  const frameShare = Math.min(1, (vw.h * FRAME) / vw.w);
  const moveFrame = (e) => {
    const r = stage.current.getBoundingClientRect(); const share = frameShare;
    const centre = ((e.clientX - r.left) / r.width);
    const free = 1 - share;
    change({ cropX: free <= 0 ? 50 : Math.round(Math.max(0, Math.min(100, ((centre - share / 2) / free) * 100))) });
  };
  const frameKey = (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); change({ cropX: Math.max(0, Math.min(100, form.cropX + (e.key === 'ArrowLeft' ? -2 : 2) * (e.shiftKey ? 5 : 1))) }); } };

  const create = async () => {
    const dur = list?.talk?.duration || 60; const at = Math.min(Math.max(0, Math.floor(time)), Math.max(0, dur - 1));
    const r = await call(`/studio/editor/projects/${projectId}/shorts`, { method: 'POST', body: JSON.stringify({ from: at, to: Math.min(dur, at + 30) }) });
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || t('dbError') }); return; }
    await flush(); await loadList(); setSel(r.data.short.id);
  };
  const remove = async () => {
    if (!window.confirm(t('mtsDelConfirm'))) return;
    const r = await call(`/studio/editor/shorts/${sel}`, { method: 'DELETE' });
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || t('dbError') }); return; }
    const l = await loadList(); setSel(l.data?.shorts?.[0]?.id || null);
  };
  const pickWord = (s, e) => {
    if (pick === 'start') { change({ from: Math.round(s * 10) / 10, to: Math.min(list?.talk?.duration || 1e9, Math.round(Math.max(s + 1, form.to > s ? form.to : s + 30) * 10) / 10) }); setPick('end'); seek(s); }
    else { change({ to: Math.round(Math.max(e, form.from + 1) * 10) / 10 }); setPick('start'); }
  };

  const closeRender = useCallback(() => setShowRender(false), []);
  const lim = list?.limits || { min: 1, max: 180, count: 30 };
  const len = form ? Math.round((form.to - form.from) * 10) / 10 : 0;
  const chunk = data?.short?.chunks?.find((c) => time >= c.s && time < c.e);
  const stText = { saving: t('mtsSaving'), saved: t('mtsSaved'), dirty: t('mtsDirty'), error: t('mtsSaveError'), idle: '' }[save];
  const editable = Boolean(data?.editable);
  const wordsSegs = (words?.segments || []).filter((s) => form && s.e >= form.from - 20 && s.s <= form.to + 20);

  return (
    <div className="mts" data-page="shorts">
      <div className="sd-card-head">
        <div>
          <h1>{t('mtsTitle')}</h1>
          <p className="meta" dir="auto">{list?.talk?.title}</p>
        </div>
        <div className="mt-actions">
          <Link href={`/studio/editor/${projectId}`} className="btn ghost sd-pill" data-act="back-editor">{t('mtsBack')}</Link>
          <button type="button" className="btn sd-pill" onClick={create} disabled={!list?.editable || (list?.shorts?.length || 0) >= lim.count} data-act="short-new">{t('mtsNew')}</button>
        </div>
      </div>
      <p className="meta small">{t('mtsIntro').replace('{min}', lim.min).replace('{max}', Math.round(lim.max / 60))}</p>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      {!list && <p className="meta">{t('dbLoading')}</p>}
      {list && !list.shorts.length && <p className="mts-empty" data-empty>{t('mtsEmpty')}</p>}

      {list?.shorts?.length > 0 && (
        <ul className="mts-tabs" aria-label={t('mtsListLabel')}>
          {list.shorts.map((s) => (
            <li key={s.id}>
              <button type="button" className={`mts-tab${s.id === sel ? ' on' : ''}`} aria-current={s.id === sel} onClick={async () => { await flush(); setSel(s.id); setPlaying(false); }} data-short={s.id}>
                <b dir="auto">{s.title}</b><small className="meta">{fmtTime(s.from)} → {fmtTime(s.to)} · {fmtTime(s.length)}</small>
              </button>
            </li>
          ))}
        </ul>
      )}

      {form && data && (
        <div className="mts-main">
          <section className="mts-video" aria-label={t('mtsSource')}>
            <div className="mts-stage" ref={stage}
              onPointerDown={(e) => { if (!editable || e.target.closest('.mts-frame') === null) return; dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerMove={(e) => { if (dragging.current) moveFrame(e); }}
              onPointerUp={() => { dragging.current = false; }}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={video} className="mts-src" playsInline muted preload="auto" onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} onLoadedMetadata={() => seek(form.from)} />
              <div className="mts-shade" style={{ insetInlineStart: 0, width: `${(1 - frameShare) * form.cropX}%` }} />
              <div className="mts-shade" style={{ insetInlineEnd: 0, width: `${(1 - frameShare) * (100 - form.cropX)}%` }} />
              <div className="mts-frame" role="slider" tabIndex={0} aria-label={t('mtsFrame')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={form.cropX} onKeyDown={frameKey} data-crop={form.cropX}
                style={{ width: `${frameShare * 100}%`, insetInlineStart: `${(1 - frameShare) * form.cropX}%` }} />
            </div>
            <p className="meta small">{t('mtsFrameHelp')}</p>
            <div className="mts-transport">
              <button type="button" className="btn sd-pill" onClick={toggle} data-act="short-play">{playing ? t('mtsPause') : t('mtsPlay')}</button>
              <input type="range" min={form.from} max={form.to} step="0.1" value={Math.min(form.to, Math.max(form.from, time))} onChange={(e) => seek(Number(e.target.value))} aria-label={t('mtsSeek')} />
              <small className="meta mts-clock">{fmtTime(Math.max(0, time - form.from), { tenths: true })} / {fmtTime(len)}</small>
            </div>
          </section>

          <section className="mts-phone" aria-label={t('mtsPhone')}>
            <div className="mts-screen" data-preview="vertical">
              <canvas ref={canvas} width={270} height={480} />
              {form.showTitle && time - form.from < 4 && <div className="mts-title" dir="auto">{form.title}</div>}
              {form.captions && chunk && <div className="mts-cap" dir="auto">{chunk.text}</div>}
            </div>
            <small className="meta">{t('mtsPhoneHelp')}</small>
          </section>

          <section className="mts-form">
            <label>{t('mtsName')}
              <input type="text" value={form.title} maxLength={80} disabled={!editable} onChange={(e) => change({ title: e.target.value })} dir="auto" data-f="title" />
            </label>
            <div className="mts-times">
              <label>{t('mtsFrom')}
                <input type="number" step="0.1" min="0" value={form.from} disabled={!editable} onChange={(e) => { const n = num(e.target.value); if (n != null) change({ from: n }); }} data-f="from" />
              </label>
              <label>{t('mtsTo')}
                <input type="number" step="0.1" min="0" value={form.to} disabled={!editable} onChange={(e) => { const n = num(e.target.value); if (n != null) change({ to: n }); }} data-f="to" />
              </label>
              <span className={`mts-len${len < lim.min || len > lim.max ? ' bad' : ''}`} data-len>{t('mtsLen').replace('{n}', fmtTime(len))}</span>
            </div>
            <label className="mts-check"><input type="checkbox" checked={form.showTitle} disabled={!editable} onChange={(e) => change({ showTitle: e.target.checked })} data-f="showTitle" /> {t('mtsShowTitle')}</label>
            <label className="mts-check"><input type="checkbox" checked={form.captions} disabled={!editable} onChange={(e) => change({ captions: e.target.checked })} data-f="captions" /> {t('mtsCaptions')}</label>
            {form.captions && words?.langs?.length > 1 && (
              <label>{t('mtsCapLang')}
                <select value={form.lang || ''} disabled={!editable} onChange={(e) => change({ lang: e.target.value || null })} data-f="lang">
                  <option value="">{t('mtsCapSpoken')}</option>
                  {words.langs.filter((l) => l !== words.origin).map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                </select>
              </label>
            )}
            {data.media?.hasDub && <label className="mts-check"><input type="checkbox" checked={form.dub} disabled={!editable} onChange={(e) => change({ dub: e.target.checked })} data-f="dub" /> {t('mtsDub')}</label>}
            <div className="mt-actions">
              <button type="button" className="btn sd-pill" disabled={!editable || len < lim.min || len > lim.max} onClick={async () => { if (await flush()) setShowRender(true); }} data-act="short-render">{t('mtsRender')}</button>
              <button type="button" className="btn ghost sd-pill" disabled={!editable} onClick={remove} data-act="short-delete">{t('mtsDelete')}</button>
              <small className="meta mt-status" role="status">{stText}</small>
            </div>
            {!editable && <p className="meta small">{t('mtsReadOnly')}</p>}
          </section>

          <section className="mts-text" aria-label={t('mtsPickText')}>
            <h2>{t('mtsPickText')}</h2>
            <p className="meta small" role="status">{pick === 'start' ? t('mtsPickStart') : t('mtsPickEnd')}</p>
            {!words?.segments?.length && <p className="meta">{t('mtsNoText')}</p>}
            <ol className="mts-segs">
              {wordsSegs.map((s) => {
                const inside = s.s >= form.from - 0.05 && s.e <= form.to + 0.05;
                return (
                  <li key={s.idx}>
                    <button type="button" className={`mts-seg${inside ? ' in' : ''}`} disabled={!editable} onClick={() => pickWord(s.s, s.e)} dir="auto" data-seg={s.idx}>
                      <small className="meta">{fmtTime(s.s)}</small> {s.text}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}
      {showRender && sel && <RenderPanel projectId={sel} getRev={() => rev.current} beforeAction={flush} durationFinal={len} readOnly={!editable} readOnlyReplace vertical onClose={closeRender} onChange={NOOP} />}
    </div>
  );
}
