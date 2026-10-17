'use client';
// Éditeur de montage (étape E1) — timeline multipiste (maquette « Studio v2 », écran 4).
//   Vidéo · Voix d'origine · Voix française · Musique · Titres et logo · Sous-titres
// La piste Vidéo porte les extraits ; les autres pistes en dépendent (pistes liées) et suivent chaque coupe et déplacement.
// Gestes : clic = tête de lecture ; clic sur un extrait = sélection ; glisser un extrait = le déplacer ; glisser un bord =
// raccourcir / rallonger ; l'aimant colle la tête de lecture et les bords aux raccords et aux phrases.
// La timeline se lit toujours de gauche à droite, y compris en arabe (le temps avance vers la droite).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../components/Providers';
import { layout, joins, mapItems, snap, snapSource, rulerStep, fmtTime, trimClip, moveClip } from './ops';

const HEAD = 168; // largeur de la colonne des noms de pistes (px)
const SNAP_PX = 8;

export default function Timeline({ clips, duration, T, onSeek, sel, onSelect, onMove, onTrim, cues, dub, zoom, magnet, readOnly, subsLang, titlesCount }) {
  const { t } = useApp();
  const scroller = useRef(null);
  const [width, setWidth] = useState(900);
  const [view, setView] = useState({ left: 0, w: 900 });
  const [drag, setDrag] = useState(null); // { kind: 'move'|'in'|'out'|'seek', index, clips (aperçu), to }
  const live = drag?.clips || clips;
  const L = useMemo(() => layout(live), [live]);
  const totalS = L.at(-1)?.end || 0;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => { setWidth(el.clientWidth); setView({ left: el.scrollLeft, w: el.clientWidth }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const laneW = Math.max(200, width - HEAD - 16);
  const pps = (laneW / Math.max(1, totalS || duration)) * zoom; // pixels par seconde
  const contentW = Math.max(laneW, totalS * pps);
  const x = (s) => s * pps;
  const tAt = (clientX) => {
    const el = scroller.current;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(totalS, (clientX - r.left - HEAD + el.scrollLeft) / pps));
  };

  // La tête de lecture reste visible pendant la lecture.
  useEffect(() => {
    const el = scroller.current;
    if (!el || drag) return;
    const px = x(T) + HEAD;
    if (px < el.scrollLeft + HEAD || px > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, px - HEAD - 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [T, pps]);

  const mapped = useMemo(() => mapItems(live, cues || []), [live, cues]);
  const dubMapped = useMemo(() => mapItems(live, dub?.segments || []), [live, dub]);
  const J = useMemo(() => joins(live), [live]);
  const targets = useMemo(() => {
    const set = new Set([0]);
    for (const c of L) { set.add(c.start); set.add(c.end); }
    for (const m of mapped) { set.add(m.ts); set.add(m.te); }
    return [...set];
  }, [L, mapped]);
  const snapT = (v) => (magnet ? snap(v, targets, SNAP_PX / pps) : v);

  // Seuls les éléments visibles sont dessinés (une conférence d'une heure compte des milliers de phrases).
  const v0 = view.left / pps - 30; const v1 = (view.left + view.w) / pps + 30;
  const visible = (it) => it.te > v0 && it.ts < v1;

  // --- Gestes à la souris / au doigt (pointer events)
  const startSeek = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    onSeek(snapT(tAt(e.clientX)));
    setDrag({ kind: 'seek' });
    const move = (ev) => onSeek(snapT(tAt(ev.clientX)));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setDrag(null); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const startClip = (e, index, kind) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    onSelect({ track: 'video', id: clips[index].id });
    if (readOnly) { onSeek(tAt(e.clientX)); return; }
    const x0 = e.clientX; const base = clips; const c = base[index];
    let moved = false; let last = null;
    const move = (ev) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 4) return;
      moved = true;
      if (kind === 'move') {
        // Place de dépôt : avant le premier extrait dont le milieu est après le pointeur.
        const others = layout(base.filter((_, i) => i !== index));
        const tp = tAt(ev.clientX);
        let to = others.findIndex((o) => (o.start + o.end) / 2 > tp);
        if (to < 0) to = others.length;
        last = { kind, index, id: c.id, to, clips: moveClip(base, index, to).clips };
      } else {
        const ds = dx / pps;
        let val = kind === 'in' ? c.in + ds : c.out + ds;
        if (magnet) val = snapSource(val, cues || [], SNAP_PX / pps);
        last = { kind, index, clips: trimClip(base, index, kind, val, duration).clips };
      }
      setDrag(last);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setDrag(null);
      if (!moved) { onSeek(snapT(tAt(ev.clientX))); return; }
      if (!last) return;
      if (last.kind === 'move') onMove(index, last.to);
      else onTrim(index, last.kind, last.clips[index][last.kind]);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // --- Règle
  const step = rulerStep(pps);
  const ticks = [];
  for (let s = Math.max(0, Math.floor(v0 / step) * step); s <= Math.min(totalS, v1); s += step) ticks.push(s);

  const tracks = [
    { key: 'video', name: t('mtTrVideo'), info: t('mtTrVisible') },
    { key: 'orig', name: t('mtTrOrig'), info: t('mtTrLinked') },
    { key: 'dub', name: t('mtTrDub'), info: dub ? t('mtTrLinked') : t('mtTrNone'), hot: Boolean(dub) },
    { key: 'music', name: t('mtTrMusic'), info: t('mtStepE2') },
    { key: 'titles', name: t('mtTrTitles'), info: t('mtItems').replace('{n}', titlesCount || 0) },
    { key: 'subs', name: t('mtTrSubs'), info: subsLang || t('mtTrNone') },
  ];
  const selected = (k) => sel?.track === k;

  const clipLabel = (c, i) => t('mtClipAria').replace('{n}', i + 1).replace('{a}', fmtTime(c.in, { tenths: true })).replace('{b}', fmtTime(c.out, { tenths: true }));

  return (
    <div className="mt-tl" dir="ltr">
      <div className="mt-tl-scroll" ref={scroller} onScroll={(e) => setView({ left: e.currentTarget.scrollLeft, w: e.currentTarget.clientWidth })}>
        <div className="mt-tl-inner" style={{ width: contentW + HEAD + 16 }}>
          {/* Règle */}
          <div className="mt-row mt-ruler-row">
            <div className="mt-head mt-head-ruler" />
            <div className="mt-lane mt-ruler" style={{ width: contentW }} onPointerDown={startSeek} role="slider" tabIndex={-1}
              aria-label={t('mtPlayhead')} aria-valuemin={0} aria-valuemax={Math.round(totalS)} aria-valuenow={Math.round(T)} aria-valuetext={fmtTime(T)}>
              {ticks.map((s) => <span key={s} className="mt-tick" style={{ left: x(s) }}>{fmtTime(s)}</span>)}
            </div>
          </div>

          {tracks.map((tr) => (
            <div key={tr.key} className={`mt-row mt-row-${tr.key}${selected(tr.key) ? ' on' : ''}`}>
              <button type="button" className={`mt-head${tr.hot ? ' hot' : ''}`} onClick={() => onSelect({ track: tr.key, id: tr.key === 'video' ? sel?.id : null })} aria-pressed={selected(tr.key)}>
                <b>{tr.name}</b><small>{tr.info}</small>
              </button>
              <div className="mt-lane" style={{ width: contentW }} onPointerDown={startSeek}>
                {tr.key === 'video' && L.map((c, i) => (
                  <div key={c.id} className={`mt-clip${sel?.id === c.id ? ' sel' : ''}${drag?.kind === 'move' && drag.id === c.id ? ' dragging' : ''}`}
                    style={{ left: x(c.start), width: Math.max(2, x(c.end - c.start)) }}>
                    <button type="button" className="mt-clip-body" onPointerDown={(e) => startClip(e, i, 'move')} aria-label={clipLabel(c, i)}
                      onClick={(e) => e.preventDefault()} onFocus={() => onSelect({ track: 'video', id: c.id })} data-clip={c.id}>
                      {x(c.end - c.start) > 70 && <span dir="ltr">{fmtTime(c.in)} → {fmtTime(c.out)}</span>}
                    </button>
                    {!readOnly && x(c.end - c.start) > 18 && <>
                      <span className="mt-handle in" onPointerDown={(e) => startClip(e, i, 'in')} aria-hidden="true" title={t('mtTrimIn')} />
                      <span className="mt-handle out" onPointerDown={(e) => startClip(e, i, 'out')} aria-hidden="true" title={t('mtTrimOut')} />
                    </>}
                  </div>
                ))}
                {tr.key === 'video' && J.map((j) => <span key={`j${j.t}`} className={`mt-join${j.moved ? ' moved' : ''}`} style={{ left: x(j.t) - 4 }} title={j.moved ? t('mtJoinMoved') : t('mtJoinCut').replace('{s}', fmtTime(j.removed, { tenths: true }))} />)}
                {tr.key === 'orig' && L.map((c) => <div key={c.id} className="mt-block orig" style={{ left: x(c.start), width: Math.max(2, x(c.end - c.start)) }} />)}
                {tr.key === 'dub' && (dub
                  ? dubMapped.filter(visible).map((m, i) => <div key={`${m.clipId}-${m.s}-${i}`} className={`mt-block dub${m.keep ? ' keep' : ''}`} style={{ left: x(m.ts), width: Math.max(2, x(m.te - m.ts) - 2) }} title={m.keep ? t('mtLegendKeep') : undefined} />)
                  : <span className="mt-empty">{t('mtNoDub')}</span>)}
                {tr.key === 'music' && <span className="mt-empty">{t('mtSoonMusic')}</span>}
                {tr.key === 'titles' && <span className="mt-empty">{t('mtSoonTitles')}</span>}
                {tr.key === 'subs' && (mapped.length
                  ? mapped.filter(visible).map((m, i) => <div key={`${m.clipId}-${m.s}-${i}`} className={`mt-block sub${m.part ? ' part' : ''}`} style={{ left: x(m.ts), width: Math.max(2, x(m.te - m.ts)) }} title={m.text} />)
                  : <span className="mt-empty">{t('mtNoSubs')}</span>)}
              </div>
            </div>
          ))}
          {drag?.kind === 'move' && <span className="mt-drop" style={{ left: HEAD + x(layout(live)[drag.to]?.start ?? totalS) }} aria-hidden="true" />}
          <span className="mt-playhead" style={{ left: HEAD + x(Math.min(T, totalS)) }} aria-hidden="true" />
        </div>
      </div>
      <p className="mt-legend meta small" dir="auto">
        <span><i className="mt-sw dub" />{t('mtLegendDub')}</span>
        <span><i className="mt-sw keep" />{t('mtLegendKeep')}</span>
        <span><i className="mt-sw cut" />{t('mtLegendCut')}</span>
        <span className="mt-keys">{t('mtKeys')}</span>
      </p>
    </div>
  );
}
