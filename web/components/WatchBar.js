'use client';
// Fiche vidéo (proposition B validée par Epok le 20/10) : barre d'actions en icônes avec leur nom (Favori, Ma liste, Partager,
// Marque-page, Plus) et menu « Plus » (vitesse, écoute sans l'image, mode cinéma, épisodes, signaler).
import { useEffect, useRef, useState } from 'react';

const S = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
export const ICONS = {
  heart: <svg {...S}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>,
  heartOn: <svg {...S} fill="currentColor"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>,
  plus: <svg {...S}><path d="M12 5v14M5 12h14" /></svg>,
  share: <svg {...S}><path d="M7 17L17 7M9 7h8v8" /></svg>,
  bookmark: <svg {...S}><path d="M6 4h12v16l-6-4-6 4z" /></svg>,
  more: <svg {...S} fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>,
  headphones: <svg {...S}><path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z" /></svg>,
  cinema: <svg {...S}><rect x="2.5" y="6" width="19" height="12" rx="2" /></svg>,
  speed: <svg {...S}><path d="M12 13l4-4M4.5 18a9 9 0 1 1 15 0" /></svg>,
  prev: <svg {...S}><path d="M15 6l-6 6 6 6" /></svg>,
  next: <svg {...S}><path d="M9 6l6 6-6 6" /></svg>,
  gear: <svg {...S}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>,
};

// Une action : rond avec l'icône, nom dessous (≥ 44 px de cible).
export function ActionTile({ icon, label, onClick, pressed, expanded, act, title, disabled }) {
  return (
    <button type="button" className={`wb-act${pressed ? ' on' : ''}`} onClick={onClick} aria-pressed={pressed} aria-expanded={expanded} title={title} disabled={disabled} data-act={act}>
      <span className="wb-ico">{icon}</span>
      <span className="wb-lbl">{label}</span>
    </button>
  );
}

// « Plus » : petit menu qui se ferme au clic à l'extérieur ou avec Échap.
export function MoreMenu({ label, children }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="wb-more" ref={box}>
      <ActionTile icon={ICONS.more} label={label} expanded={open} onClick={() => setOpen((v) => !v)} act="more" />
      {open && <div className="wb-menu" role="dialog" aria-label={label}>{children}</div>}
    </div>
  );
}

// Réglages de lecture posés SUR le lecteur (coin haut, côté fin de ligne), comme sur la maquette B : vitesse, écoute sans l'image.
// Les contrôles du lecteur (lecture, son, plein écran, sous-titres) restent ceux du navigateur.
export function PlayerSettings({ label, rateLabel, children }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className={`wb-pset${open ? ' open' : ''}`} ref={box}>
      <button type="button" className="wb-pset-btn" aria-expanded={open} aria-label={`${label} : ${rateLabel}`} onClick={() => setOpen((v) => !v)} data-act="player-settings">
        {ICONS.gear}<span>{rateLabel}</span>
      </button>
      {open && <div className="wb-pset-menu" role="dialog" aria-label={label}>{children}</div>}
    </div>
  );
}
