'use client';
// Barre du haut du back-office (thème Premium, maquette « Admin et Studio ») :
//   menu (téléphone) · fil d'Ariane · recherche « Chercher une vue… Ctrl K » · cloche d'alertes · applications · compte.
// Rien n'est inventé : la cloche ne liste que de vrais compteurs (voir BoBell.js), les liens sont ceux du site.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../Providers';
import BoBell from './BoBell';
import { Ico } from './BoIcon';

const P = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  down: 'M6 9l6 6 6-6',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
};
// Petit menu déroulant : se ferme par un clic à côté ou Échap.
function useDrop() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return [open, setOpen, ref];
}

export default function BoTop({ space, crumb, search, onMenu, menuOpen }) {
  const { t, user, logout } = useApp();
  const router = useRouter();
  const [appsOpen, setApps, appsRef] = useDrop();
  const [meOpen, setMe, meRef] = useDrop();
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  const isAdmin = user.role === 'admin';
  const canStudio = ['organizer', 'moderator', 'admin'].includes(user.role);
  return (
    <header className="bo-top">
      <button type="button" className="bo-burger" onClick={onMenu} aria-expanded={menuOpen} aria-controls="studio-menu" aria-label={t('menuOpen')}><Ico d={P.menu} size={21} /></button>
      <div className="bo-crumb" aria-label={space === 'admin' ? t('adminNav') : t('studioNav')}>
        <Ico d={P.home} size={15} />
        <span className="bo-crumb-space">/ {space === 'admin' ? t('adminNav') : t('studioNav')} /</span>
        <strong dir="auto">{crumb}</strong>
      </div>
      <div className="bo-spacer" />
      <div className="bo-search-slot">{search}</div>
      <BoBell space={space} />
      <div className="bo-drop" ref={appsRef}>
        <button type="button" className="bo-icon" onClick={() => setApps((o) => !o)} aria-expanded={appsOpen} aria-haspopup="true" aria-label={t('boApps')} title={t('boApps')}><Ico d={P.grid} size={19} /></button>
        {appsOpen && (
          <div className="bo-pop bo-apps" role="menu" onClick={() => setApps(false)}>
            {canStudio && <Link href="/studio" role="menuitem"><b>Studio</b><small>{t('boAppStudio')}</small></Link>}
            {isAdmin && <Link href="/admin" role="menuitem"><b>{t('adminNav')}</b><small>{t('boAppAdmin')}</small></Link>}
            <Link href="/" role="menuitem"><b>{t('viewSite')}</b><small>{t('boAppSite')}</small></Link>
          </div>
        )}
      </div>
      <div className="bo-drop" ref={meRef}>
        <button type="button" className="bo-user" onClick={() => setMe((o) => !o)} aria-expanded={meOpen} aria-haspopup="true" aria-label={user.name || user.email}>
          <span className="bo-avatar" aria-hidden="true">{initial}</span>
          <span className="bo-user-name" dir="auto">{(user.name || user.email || '').split(' ')[0]}</span>
          <Ico d={P.down} size={14} />
        </button>
        {meOpen && (
          <div className="bo-pop bo-me" role="menu" onClick={() => setMe(false)}>
            <div className="bo-me-id"><b dir="auto">{user.name || user.email}</b><small>{t('role_' + user.role)}</small></div>
            <Link href="/account" role="menuitem">{t('boAccount')}</Link>
            <Link href="/" role="menuitem">{t('viewSite')}</Link>
            <button type="button" role="menuitem" onClick={() => { logout(); router.push('/'); }}><Ico d={P.out} size={16} />{t('logout')}</button>
          </div>
        )}
      </div>
    </header>
  );
}
