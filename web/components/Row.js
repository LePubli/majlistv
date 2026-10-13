'use client';
// Rangée horizontale de vignettes (défilement tactile ou flèches sur ordinateur), compatible droite-à-gauche.
import { useCallback, useEffect, useRef, useState } from 'react';
import TalkCard from './TalkCard';

export default function Row({ title, talks, t, onSeeAll, progressOf, id, badge }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth - 2;
    const pos = Math.abs(el.scrollLeft); // négatif en RTL selon le navigateur
    setEdge({ start: pos <= 2, end: pos >= max });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, talks]);
  const go = (dir) => {
    const el = ref.current;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.85, behavior: 'smooth' });
  };
  if (!talks?.length) return null;
  return (
    <section className="row" aria-labelledby={id}>
      <div className="row-head">
        <h2 id={id}>{title}{badge && <span className="row-badge">{badge}</span>}</h2>
        {onSeeAll && <button type="button" className="link" onClick={onSeeAll}>{t('rowSeeAll')} ›</button>}
      </div>
      <div className="row-wrap">
        <button type="button" className="row-arrow prev" onClick={() => go(-1)} disabled={edge.start} aria-label={t('rowPrev')}>‹</button>
        <div className="row-rail" ref={ref} onScroll={measure}>
          {talks.map((x) => <div className="row-item" key={x.id}><TalkCard talk={x} t={t} progress={progressOf ? progressOf(x) : 0} /></div>)}
        </div>
        <button type="button" className="row-arrow next" onClick={() => go(1)} disabled={edge.end} aria-label={t('rowNext')}>›</button>
      </div>
    </section>
  );
}
