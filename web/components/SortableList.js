'use client';
// Liste ordonnée par glisser-déposer (souris, doigt ou stylo) : on attrape la poignée ⠿ d'une ligne et on la dépose ailleurs ;
// la page défile toute seule près des bords. Les boutons ↑ ↓ et la saisie d'une position restent possibles (clavier, accessibilité).
import { useEffect, useRef, useState } from 'react';
import { moveItem, byTitle } from '../lib/sortOrder';

export { moveItem, byTitle };

// items : tableau d'éléments ayant un `id` ; onChange(nouveauTableau) ; render(item, index, { handle, move }) renvoie le contenu de la ligne.
export default function SortableList({ items, onChange, render, className = '', disabled = false }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null); // { from, over }
  const state = useRef(null);
  const raf = useRef(0);

  const rows = () => Array.from(ref.current?.children || []);
  const overIndex = (y) => {
    const r = rows();
    for (let i = 0; i < r.length; i++) { const b = r[i].getBoundingClientRect(); if (y < b.top + b.height / 2) return i; }
    return Math.max(0, r.length - 1);
  };
  const stop = () => { cancelAnimationFrame(raf.current); state.current = null; setDrag(null); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Défilement automatique de la page quand le doigt / la souris approche du haut ou du bas de l'écran.
  const autoScroll = () => {
    const s = state.current;
    if (!s) return;
    const h = window.innerHeight; const edge = 90;
    let dy = 0;
    if (s.y < edge) dy = -Math.ceil((edge - s.y) / 6); else if (s.y > h - edge) dy = Math.ceil((s.y - (h - edge)) / 6);
    if (dy) { window.scrollBy(0, dy); const o = overIndex(s.y); if (o !== s.over) { s.over = o; setDrag({ from: s.from, over: o }); } }
    raf.current = requestAnimationFrame(autoScroll);
  };

  const begin = (i) => (e) => {
    if (disabled || (e.button != null && e.button !== 0)) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    state.current = { from: i, over: i, y: e.clientY };
    setDrag({ from: i, over: i });
    raf.current = requestAnimationFrame(autoScroll);
  };
  const moveTo = (e) => {
    const s = state.current;
    if (!s) return;
    s.y = e.clientY;
    const o = overIndex(e.clientY);
    if (o !== s.over) { s.over = o; setDrag({ from: s.from, over: o }); }
  };
  const end = (cancel) => () => {
    const s = state.current;
    stop();
    if (s && !cancel && s.over !== s.from) onChange(moveItem(items, s.from, s.over));
  };

  return (
    <ol ref={ref} className={`sortable ${className}${drag ? ' sorting' : ''}`}>
      {items.map((x, i) => {
        const cls = drag ? (drag.from === i ? ' is-dragged' : drag.over === i ? (drag.from < i ? ' drop-after' : ' drop-before') : '') : '';
        const handle = (
          <button type="button" className="sort-handle" aria-label="Glisser pour déplacer" title="Glisser pour déplacer" disabled={disabled}
            onPointerDown={begin(i)} onPointerMove={moveTo} onPointerUp={end(false)} onPointerCancel={end(true)}>⠿</button>
        );
        return <li key={x.id} className={`sort-row${cls}`}>{render(x, i, { handle, move: (to) => onChange(moveItem(items, i, to)) })}</li>;
      })}
    </ol>
  );
}
