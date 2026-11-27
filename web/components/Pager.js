'use client';
// Pagination commune des listes et tableaux (Studio, Admin, Catalogue…).
// RÈGLE DU PROJET : aucune liste de plus de PAGE_SIZE lignes n'est affichée d'un bloc. Tout tableau passe par usePaged + <Pager>
// (ou par le composant Table du back-office, qui le fait tout seul). Le test web/tests/test_lists_bounded.mjs le vérifie.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from './Providers';

export const PAGE_SIZE = 25;
export const PAGE_SIZES = [25, 50, 100];

/** Découpe une liste en pages. `resetKey` : quand il change (filtre, recherche), on revient à la page 1. */
export function usePaged(rows, initialSize = PAGE_SIZE, resetKey = '') {
  const [size, setSize] = useState(initialSize);
  const [page, setPage] = useState(0);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => { setPage(0); }, [resetKey, size]);
  const cur = Math.min(page, pages - 1);
  const slice = useMemo(() => rows.slice(cur * size, cur * size + size), [rows, cur, size]);
  return { slice, page: cur, setPage, size, setSize, total, pages, from: total ? cur * size + 1 : 0, to: Math.min(total, cur * size + size) };
}

/** Barre « 1–25 sur 355 · Précédent · Suivant · Par page ». Invisible si tout tient sur une page de la taille minimale. */
export default function Pager({ p, className = '' }) {
  const { t } = useApp();
  if (!p || p.total <= PAGE_SIZES[0]) return null;
  return (
    <nav className={`pg-bar ${className}`.trim()} aria-label={t('pgLabel')}>
      <span className="pg-range">{t('pgRange').replace('{a}', p.from).replace('{b}', p.to).replace('{n}', p.total)}</span>
      <span className="pg-ctrl">
        <button type="button" className="pg-btn" onClick={() => p.setPage(p.page - 1)} disabled={p.page <= 0}>‹ {t('pgPrev')}</button>
        <span className="pg-num">{p.page + 1} / {p.pages}</span>
        <button type="button" className="pg-btn" onClick={() => p.setPage(p.page + 1)} disabled={p.page >= p.pages - 1}>{t('pgNext')} ›</button>
        <label className="pg-size">{t('pgSize')} <select value={p.size} onChange={(e) => p.setSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </span>
    </nav>
  );
}
