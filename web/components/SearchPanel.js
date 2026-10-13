'use client';
// Recherche en panneau central : la loupe du header l'ouvre, le site s'assombrit derrière.
// Mots-clés, catégorie et niveau ; résultats en direct (conférences, séries, passages horodatés). Échap ou clic à côté : on ferme.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useApp } from './Providers';
import SearchHit from './SearchHit';
import { LEVELS, levelLabel } from '../lib/levels';

export default function SearchPanel({ onClose }) {
  const { t, call } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [level, setLevel] = useState('');
  const [cats, setCats] = useState([]);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  useEffect(() => { call('/categories', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);
  useEffect(() => { input.current?.focus(); }, []);
  // Bloque le défilement du site derrière le panneau et gère Échap.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  useEffect(() => {
    if (!q.trim()) { setRes(null); setBusy(false); return undefined; }
    setBusy(true);
    let stale = false;
    const timer = setTimeout(() => {
      const p = new URLSearchParams({ q: q.trim() });
      if (cat) p.set('category', cat);
      if (level) p.set('level', level);
      call('/search?' + p, {}, null).then((r) => { if (!stale) { setRes(r.ok ? r.data : { hits: [], total: 0, series: [] }); setBusy(false); } });
    }, 250);
    return () => { stale = true; clearTimeout(timer); };
  }, [q, cat, level, call]);

  // Un clic sur un lien de résultat ferme le panneau (la navigation se fait normalement).
  const onBodyClick = (e) => { if (e.target.closest('a')) onClose(); };
  return createPortal(
    <div className="sp-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sp-panel" role="dialog" aria-modal="true" aria-label={t('hmSearch')}>
        <div className="sp-bar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} aria-label={t('search')} />
          <button type="button" className="sp-esc" onClick={onClose} aria-label={t('hmClose')}>{t('hmEsc')}</button>
        </div>
        <div className="sp-filters">
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('allCategories')}>
            <option value="">{t('allCategories')}</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.fullName || c.name}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label={t('lvAll')}>
            <option value="">{t('lvAll')}</option>
            {LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l, t)}</option>)}
          </select>
        </div>
        <div className="sp-body" onClick={onBodyClick} aria-live="polite">
          {!q.trim() && <p className="meta sp-hint">{t('hmSearchHint')}</p>}
          {q.trim() && res && !busy && (
            <p className="meta">{res.total || (res.series || []).length ? t('nResults').replace('{n}', res.total) : t('noResults')}</p>
          )}
          {res && q.trim() && (res.series || []).length > 0 && (
            <ul className="sp-series">
              {res.series.map((s) => <li key={s.id}><Link href={`/series/${s.id}`}>{s.title}</Link></li>)}
            </ul>
          )}
          {res && q.trim() && res.hits.map((h) => <SearchHit key={h.id} hit={h} t={t} markers={res.markers} />)}
        </div>
      </section>
    </div>,
    document.body
  );
}
