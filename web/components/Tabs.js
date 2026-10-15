'use client';
// Étape B — Onglets accessibles (rôles tablist/tab/tabpanel, flèches du clavier), pilotés par ?tab=
// pour que chaque onglet ait son adresse (retour du navigateur, partage, lien depuis le menu).
import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Onglet courant : celui de l'adresse s'il existe dans la liste, sinon le premier.
export function useTab(tabs, def) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const ids = tabs.map((x) => x.id);
  const want = params.get('tab');
  const start = ids.includes(def) ? def : ids[0]; // onglet d'arrivée (ex. Abonnement au retour du paiement)
  const current = ids.includes(want) ? want : start;
  const go = useCallback((id) => {
    const q = new URLSearchParams(params.toString());
    if (id === start && !def) q.delete('tab'); else q.set('tab', id);
    const s = q.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  }, [params, router, path, start, def, ids.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return [current, go];
}

// Barre d'onglets. `vertical` : liste à gauche (Mon compte) ; sur téléphone elle redevient horizontale.
export function TabBar({ tabs, current, onChange, label, vertical = false }) {
  const onKey = (e) => {
    const keys = vertical ? ['ArrowDown', 'ArrowUp'] : ['ArrowRight', 'ArrowLeft'];
    const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    let step = 0;
    if (e.key === keys[0]) step = vertical || !rtl ? 1 : -1;
    else if (e.key === keys[1]) step = vertical || !rtl ? -1 : 1;
    else if (e.key === 'Home') step = -999;
    else if (e.key === 'End') step = 999;
    else return;
    e.preventDefault();
    const i = tabs.findIndex((x) => x.id === current);
    const j = Math.max(0, Math.min(tabs.length - 1, Math.abs(step) > 1 ? (step < 0 ? 0 : tabs.length - 1) : (i + step + tabs.length) % tabs.length));
    onChange(tabs[j].id);
    requestAnimationFrame(() => document.getElementById(`tab-${tabs[j].id}`)?.focus());
  };
  return (
    <div className={`tabs${vertical ? ' tabs-v' : ''}`} role="tablist" aria-label={label} aria-orientation={vertical ? 'vertical' : 'horizontal'} onKeyDown={onKey}>
      {tabs.map((x) => (
        <button key={x.id} type="button" role="tab" id={`tab-${x.id}`} aria-selected={current === x.id} aria-controls={`panel-${x.id}`} tabIndex={current === x.id ? 0 : -1}
          className={current === x.id ? 'on' : ''} onClick={() => onChange(x.id)}>{x.label}</button>
      ))}
    </div>
  );
}

// Contenu d'un onglet (n'est rendu que s'il est le courant).
export function TabPanel({ id, current, children }) {
  if (current !== id) return null;
  return <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={-1} className="tab-panel">{children}</div>;
}
