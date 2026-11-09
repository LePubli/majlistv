'use client';
// Projet Menus — sous-menu déroulant d'un menu du site.
//   <MenuDropdown item />  : en-tête (ordinateur) : bouton + liste qui s'ouvre au clic, au survol et au clavier ; Échap ou un clic ailleurs la ferme.
//   <MenuAccordion item /> : tiroir ☰ et menu latéral : le titre déplie / replie ses liens (la page courante ouvre son groupe).
import { useEffect, useRef, useState } from 'react';
import NavLink from './NavLink';

const Chevron = ({ open }) => (
  <svg className="mn-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none' }}><path d="m6 9 6 6 6-6" /></svg>
);

export function MenuLink({ it, current, className, onNavigate, children }) {
  const props = { href: it.href, className, onClick: onNavigate, 'aria-current': current ? 'page' : undefined };
  // « Nouvel onglet » demandé sur une page du site : lien ordinaire ouvert à part.
  if (it.newTab && it.href.startsWith('/')) return <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>;
  return <NavLink {...props}>{children}</NavLink>;
}

export function MenuDropdown({ item, isCurrent, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timer = useRef(null);
  const anyOn = (item.children || []).some((c) => isCurrent(c.href));
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const enter = () => { clearTimeout(timer.current); setOpen(true); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 160); };
  return (
    <div className={`mn-dd ${item.cls || ''}`.trim()} ref={ref} onMouseEnter={enter} onMouseLeave={leave}>
      <button type="button" className={`mn-dd-btn${anyOn ? ' on' : ''}`} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {item.label}<Chevron open={open} />
      </button>
      {open && (
        <ul className="mn-dd-list">
          {item.children.map((c) => (
            <li key={c.key} className={c.cls || undefined}>
              <MenuLink it={c} current={isCurrent(c.href)} onNavigate={() => { setOpen(false); onNavigate?.(); }}>{c.label}</MenuLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MenuAccordion({ item, isCurrent, onNavigate, linkClass }) {
  const anyOn = (item.children || []).some((c) => isCurrent(c.href));
  const [open, setOpen] = useState(anyOn);
  return (
    <div className={`mn-acc ${item.cls || ''}`.trim()}>
      <button type="button" className={`mn-acc-btn${anyOn ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{item.label}</span><Chevron open={open} />
      </button>
      {open && (
        <div className="mn-acc-list">
          {item.children.map((c) => (
            <MenuLink key={c.key} it={c} current={isCurrent(c.href)} className={[linkClass, c.cls].filter(Boolean).join(' ') || undefined} onNavigate={onNavigate}>{c.label}</MenuLink>
          ))}
        </div>
      )}
    </div>
  );
}
