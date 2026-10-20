'use client';
// Éditeur de montage (étape E3) — habillage dessiné par-dessus l'aperçu : titres, bandeau de nom, logo, fondu des transitions,
// sous-titres incrustés et écrans d'intro / de fin. Toutes les tailles suivent les mêmes proportions que le rendu final
// (image de 1080 px de haut : « u » = hauteur de l'aperçu / 1080) ; le dessin des lettres vient du navigateur, le vrai rendu
// (FFmpeg, bouton « Voir l'image finale ») utilise la police DejaVu Sans : les largeurs peuvent différer un peu.
// Étape E6b : les titres, bandeaux, le logo et les sous-titres incrustés se placent à la souris directement sur l'image
// (ou aux flèches du clavier, Maj = plus vite). Position libre en % de l'image, mêmes repères que le rendu :
// titre = centre ; bandeau = bord gauche, milieu ; logo = coin haut-gauche ; sous-titres = milieu (hauteur seule).
// Aimant : centre de l'image pour les titres et sous-titres, marges pour les bandeaux et le logo (repères dorés pendant le glissé).
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../components/Providers';
import { activeItems, logoOn, dipAt, fillVars, isFree, placeAt } from './ops';

const GOLD = '#E6A739';

// Rectangle réellement occupé par le texte (un titre en position prédéfinie occupe toute la largeur : on mesure ses lignes).
function inkRect(el) {
  const kids = [...el.children];
  if (!kids.length) return el.getBoundingClientRect();
  const rs = kids.map((k) => k.getBoundingClientRect());
  const left = Math.min(...rs.map((r) => r.left)); const right = Math.max(...rs.map((r) => r.right));
  const top = Math.min(...rs.map((r) => r.top)); const bottom = Math.max(...rs.map((r) => r.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

// Repère (en % de l'image) de l'élément tel qu'il est affiché, selon son type.
function anchorOf(kind, r, B) {
  const px = (v) => ((v - B.left) / B.width) * 100;
  const py = (v) => ((v - B.top) / B.height) * 100;
  const box = { w: (r.width / B.width) * 100, h: (r.height / B.height) * 100 };
  if (kind === 'title') return { x: px(r.left + r.width / 2), y: py(r.top + r.height / 2), box };
  if (kind === 'banner') return { x: px(r.left), y: py(r.top + r.height / 2), box };
  if (kind === 'subs') return { x: 50, y: py(r.top + r.height / 2), box };
  return { x: px(r.left), y: py(r.top), box }; // logo
}

export default function DressOverlay({ dress, T, totalS, clips, vars, logoUrl, caption, card, cardText, editable = false, sel, onSelect, onPlace }) {
  const { t } = useApp();
  const box = useRef(null);
  const [u, setU] = useState(0.4);
  const [live, setLive] = useState(null); // { key, x, y, guides } pendant un glissé
  useEffect(() => {
    const el = box.current?.parentElement;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setU(el.clientHeight / 1080));
    ro.observe(el); setU(el.clientHeight / 1080);
    return () => ro.disconnect();
  }, []);
  const px = (n) => `${(n * u).toFixed(2)}px`;
  const items = card ? [] : activeItems(dress, T, totalS);
  const dip = card ? { alpha: 0 } : dipAt(dress, clips, T);
  const showLogo = card ? dress.logo.on && logoUrl : logoOn(dress, T) && logoUrl;
  const canDrag = editable && !card;

  // Position à dessiner : celle du glissé en cours, sinon la position libre enregistrée, sinon null (position prédéfinie).
  const posOf = (key, o) => (live?.key === key ? live : isFree(o) ? { x: o.x, y: o.y } : null);
  const isSel = (key) => (key === 'logo' ? sel?.track === 'logo' : key === 'subs' ? sel?.track === 'subs' : sel?.track === 'item' && `item:${sel.id}` === key);
  const select = (key) => {
    if (!onSelect) return;
    if (key === 'logo') onSelect({ track: 'logo', id: null });
    else if (key === 'subs') onSelect({ track: 'subs', id: null });
    else onSelect({ track: 'item', id: key.slice(5) });
  };

  const startDrag = (e, key, kind) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    select(key);
    if (!canDrag || !onPlace) return;
    const el = e.currentTarget; const B = box.current.getBoundingClientRect();
    const a = anchorOf(kind, kind === 'title' ? inkRect(el) : el.getBoundingClientRect(), B);
    const x0 = e.clientX; const y0 = e.clientY;
    let moved = false; let last = null;
    el.setPointerCapture?.(e.pointerId);
    const move = (ev) => {
      const dx = ev.clientX - x0; const dy = ev.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      const p = placeAt(kind, a.x + (dx / B.width) * 100, a.y + (dy / B.height) * 100, a.box);
      last = p; setLive({ key, ...p });
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      setLive(null);
      if (moved && last) onPlace(key, { x: last.x, y: last.y });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  const nudge = (e, key, kind) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || !canDrag || !onPlace) return;
    e.preventDefault(); e.stopPropagation(); // la timeline n'avance pas
    const step = e.shiftKey ? 5 : 0.5;
    const a = anchorOf(kind, kind === 'title' ? inkRect(e.currentTarget) : e.currentTarget.getBoundingClientRect(), box.current.getBoundingClientRect());
    const p = placeAt(kind, a.x + d[0] * step, a.y + d[1] * step, a.box, 0);
    onPlace(key, { x: p.x, y: p.y });
  };
  const handlers = (key, kind, label) => (canDrag
    ? { onPointerDown: (e) => startDrag(e, key, kind), onKeyDown: (e) => nudge(e, key, kind), onFocus: () => select(key), tabIndex: 0, role: 'button',
      'aria-label': t('mtpDragAria').replace('{n}', label), 'data-drag': key }
    : {});
  const cls = (base, key) => `${base}${canDrag ? ' drag' : ''}${canDrag && isSel(key) ? ' sel' : ''}${live?.key === key ? ' moving' : ''}`;

  return (
    <div className={`mt-dress${canDrag ? ' editable' : ''}`} ref={box} aria-hidden={canDrag ? undefined : 'true'} data-testid="dress-overlay">
      {dip.alpha > 0.001 && <div className="mt-dress-dip" data-dip={dip.alpha.toFixed(2)} style={{ background: dip.color, opacity: dip.alpha }} />}
      {items.map(({ item: it, alpha }) => {
        const main = fillVars(it.text, vars); const sub = fillVars(it.sub, vars); const k = it.scale / 100;
        if (!main && !sub) return null;
        const key = `item:${it.id}`; const p = posOf(key, it);
        if (it.kind === 'banner') {
          const right = it.side === 'right' && !p;
          const place = p ? { left: `${p.x}%`, top: `${p.y}%`, transform: 'translateY(-50%)' } : { [right ? 'right' : 'left']: px(90), bottom: px(150) };
          return (
            <div key={it.id} className={cls(`mt-dress-banner${right ? ' right' : ''}${p ? ' free' : ''}`, key)} data-item={it.id} style={{ opacity: alpha, ...place }} {...handlers(key, 'banner', main || sub)}>
              {main && <b dir="auto" style={{ fontSize: px(54 * k), padding: `${px(8)} ${px(20)}` }}>{main}</b>}
              {sub && <span dir="auto" style={{ fontSize: px(38 * k), padding: `${px(6)} ${px(20)}` }}>{sub}</span>}
            </div>
          );
        }
        const place = p ? { left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }
          : it.pos === 'top' ? { top: px(110) } : it.pos === 'bottom' ? { bottom: px(190) } : { top: '50%', transform: 'translateY(-50%)' };
        return (
          <div key={it.id} className={cls(`mt-dress-title${p ? ' free' : ''}`, key)} data-item={it.id} style={{ opacity: alpha, ...place }} {...handlers(key, 'title', main || sub)}>
            {main && <b dir="auto" style={{ fontSize: px(96 * k) }}>{main}</b>}
            {sub && <span dir="auto" style={{ fontSize: px(46 * k) }}>{sub}</span>}
          </div>
        );
      })}
      {!card && dress.subs.burn && caption && (() => {
        const p = live?.key === 'subs' ? live : dress.subs.y != null ? { y: dress.subs.y } : null;
        const top = dress.subs.pos === 'top';
        const place = p ? { top: `${p.y}%`, transform: dress.subs.box ? 'translate(-50%, -50%)' : 'translateY(-50%)' } : { [top ? 'top' : 'bottom']: px(60) };
        return (
          <p className={cls(`mt-dress-subs${dress.subs.box ? ' box' : ''}${top && !p ? ' top' : ''}${p ? ' free' : ''}`, 'subs')} dir="auto" data-burn="1"
            style={{ fontSize: px(50 * dress.subs.scale / 100), padding: dress.subs.box ? `${px(10)} ${px(14)}` : 0, ...place }} {...handlers('subs', 'subs', t('mtpSubs'))}>{caption}</p>
        );
      })()}
      {showLogo && !card && (() => {
        const p = posOf('logo', dress.logo);
        const place = p ? { left: `${p.x}%`, top: `${p.y}%` }
          : { [dress.logo.pos[1] === 'r' ? 'right' : 'left']: '2.1%', [dress.logo.pos[0] === 't' ? 'top' : 'bottom']: `${2.1 * 16 / 9}%` };
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={canDrag ? t('mtpLogo') : ''} className={cls('mt-dress-logo', 'logo')} data-logo="1" draggable={false}
            style={{ width: `${dress.logo.size}%`, opacity: dress.logo.opacity / 100, ...place }} {...handlers('logo', 'logo', t('mtpLogo'))} />
        );
      })()}
      {live && <div className="mt-safe" aria-hidden="true" />}
      {live?.guides?.map((g) => <i key={`${g.axis}${g.at}`} className={`mt-guide ${g.axis}`} style={g.axis === 'x' ? { left: `${g.at}%` } : { top: `${g.at}%` }} aria-hidden="true" data-guide={`${g.axis}${g.at}`} />)}
      {card && (
        <div className="mt-dress-card" data-card={card}>
          <div className="mt-dress-card-in">
            {cardText.title && <b dir="auto" style={{ fontSize: px(104) }}>{fillVars(cardText.title, vars)}</b>}
            <i style={{ width: px(160 * 1.5), height: px(6) }} />
            {cardText.sub && <span dir="auto" style={{ fontSize: px(48) }}>{fillVars(cardText.sub, vars)}</span>}
          </div>
          {showLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="mt-dress-logo" style={{ width: '14%', left: '43%', top: '18%', opacity: 1 }} />
          )}
        </div>
      )}
    </div>
  );
}
export { GOLD };
