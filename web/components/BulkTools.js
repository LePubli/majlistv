'use client';
// Outils d'administration « en lot » : sélection par cases à cocher + barre d'actions (valider, afficher, masquer, dé-valider,
// modifier, supprimer). Utilisés par Admin → Athkar et Admin → Circuit de Ramadan.
import { useCallback, useState } from 'react';

/** Sélection d'identifiants : cases, « tout cocher » sur une liste filtrée, effacement. */
export function useSelection() {
  const [sel, setSel] = useState(() => new Set());
  const toggle = useCallback((id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const setAll = useCallback((ids) => setSel(new Set(ids)), []);
  const clear = useCallback(() => setSel(new Set()), []);
  return { sel, count: sel.size, has: (id) => sel.has(id), toggle, setAll, clear, ids: [...sel] };
}

/** Case « tout sélectionner » d'un en-tête de tableau (visibles = identifiants actuellement affichés). */
export function SelectAll({ visible, selection }) {
  const all = visible.length > 0 && visible.every((id) => selection.has(id));
  return <input type="checkbox" aria-label="Tout sélectionner" checked={all} onChange={() => (all ? selection.clear() : selection.setAll(visible))} />;
}

/** Barre d'actions : n'apparaît que lorsqu'il y a une sélection. `onRun(action, set)` ; `children` = champs de modification en lot. */
export function BulkBar({ count, busy, onRun, onClear, children }) {
  if (!count) return null;
  const run = (action, label, danger) => () => {
    if (danger && !window.confirm(`${label} — ${count} élément${count > 1 ? 's' : ''}. Cette action est définitive. Continuer ?`)) return;
    onRun(action);
  };
  return (
    <div className="adm-bulk" role="region" aria-label="Actions sur la sélection">
      <b>{count} sélectionné{count > 1 ? 's' : ''}</b>
      <button type="button" className="btn small" disabled={busy} onClick={run('publish')}>Valider et afficher</button>
      <button type="button" className="btn ghost small" disabled={busy} onClick={run('validate')}>Valider</button>
      <button type="button" className="btn ghost small" disabled={busy} onClick={run('show')}>Afficher</button>
      <button type="button" className="btn ghost small" disabled={busy} onClick={run('hide')}>Masquer</button>
      <button type="button" className="btn ghost small" disabled={busy} onClick={run('unvalidate')}>Dé-valider</button>
      {children}
      <button type="button" className="btn ghost small adm-bulk-del" disabled={busy} onClick={run('delete', 'Supprimer', true)}>Supprimer</button>
      <button type="button" className="btn ghost small" disabled={busy} onClick={onClear}>Tout désélectionner</button>
    </div>
  );
}
