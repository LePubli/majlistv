'use client';
// En-tête du thème Premium : reproduction de l'en-tête de la maquette V20 (classes « v20-… » de /premium/v20.css).
// Menu de la maquette : Accueil, Catalogue, Séries, Apprendre, Kids (chacun seulement si la rubrique est active), puis
// loupe, cloche (réglages des notifications) et avatar. « Pratique », « Ma bibliothèque », compte, studio et
// déconnexion sont dans le menu de l'avatar. Sur l'accueil, l'en-tête est posé sur l'image de la une (comme la maquette).
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../Providers';
import SearchPanel from '../SearchPanel';
import SkinPicker from '../SkinPicker';
import { LOCALES } from '../../lib/locales';
import { BrandWord } from './PmBrand';

const SearchIco = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.7" cy="10.7" r="6.7" /><path d="m15.8 15.8 5 5" /></svg>;
const BellIco = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8.5a6 6 0 0 0-12 0c0 7-2.4 8.3-2.4 9h16.8c0-.7-2.4-2-2.4-9ZM10 21h4" /></svg>;

/** Liens du menu principal (même liste pour l'en-tête et le menu ☰ du téléphone). */
export function usePmNav() {
  const { t, feat, hasSeries } = useApp();
  return [
    { href: '/', label: t('home'), on: true },
    { href: '/catalogue', label: t('navCatalogue'), on: true },
    { href: '/series', label: t('seriesNav'), on: hasSeries },
    { href: '/learning', label: t('navLearn'), on: feat('learning') },
    { href: '/kids', label: t('kdNav'), on: feat('kids') },
  ].filter((x) => x.on);
}

export function isPmActive(path, href) {
  if (href === '/') return path === '/';
  if (href === '/catalogue') return path.startsWith('/catalogue') || path.startsWith('/talks');
  return path === href || path.startsWith(`${href}/`);
}

export default function PmHeader() {
  const { appName, t, locale, user, ready, logout, feat } = useApp();
  const path = usePathname() || '/';
  const router = useRouter();
  const nav = usePmNav();
  const [open, setOpen] = useState(false);      // menu ☰ (téléphone)
  const [search, setSearch] = useState(false);
  const [menu, setMenu] = useState(false);      // menu de l'avatar
  const menuRef = useRef(null);
  useEffect(() => { setOpen(false); setMenu(false); }, [path]);
  useEffect(() => {
    if (!menu) return undefined;
    const off = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [menu]);
  if (path.startsWith('/studio') || path.startsWith('/admin')) return null; // ils ont leur propre menu
  const overlay = path === '/' || path === '/learning' || /^\/series\/[^/]+$/.test(path); // comme la maquette : posé sur l'image (accueil, Apprendre, fiche série)
  const manager = user && ['organizer', 'moderator', 'admin'].includes(user.role);
  const modOnly = user && user.role === 'moderator';
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  const setLocale = (e) => {
    document.cookie = `locale=${e.target.value};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };
  const logoutNow = () => { logout(); setMenu(false); router.push('/'); };
  const pratique = feat('prayer') || feat('quran') || feat('athkar') || feat('ramadan');
  return (
    <div className="v20-app v20-part">
      <header className={`v20-topbar v20-exact-header${overlay ? ' v20-is-overlay' : ''}`}>
        <div className="v20-shell v20-topbar-inner">
          <Link href="/" className="v20-brand v20-exact-brand" aria-label={`${appName} — ${t('home')}`}>
            <img src="/brand/emblem-bleu-s.png" alt="" width="37" height="40" />
            <strong><BrandWord name={appName} /></strong>
          </Link>
          <nav className={`v20-nav v20-exact-nav${open ? ' v20-open' : ''}`} id="pm-nav" aria-label={t('mainNav')}>
            {nav.map((it) => {
              const on = isPmActive(path, it.href);
              return <Link key={it.href} href={it.href} className={on ? 'v20-active' : undefined} aria-current={on ? 'page' : undefined}>{it.label}</Link>;
            })}
          </nav>
          <div className="v20-header-actions v20-exact-actions">
            <button type="button" className="v20-iconbtn v20-exact-icon" onClick={() => setSearch(true)} aria-label={t('hmSearch')} aria-haspopup="dialog"><SearchIco /></button>
            {user && <Link href="/account?tab=notifs" className="v20-iconbtn v20-exact-icon v20-exact-bell" aria-label={t('msNotif')}><BellIco /></Link>}
            {!ready ? <span className="v20-iconbtn v20-avatar v20-exact-avatar" aria-hidden="true" /> : !user ? (
              <Link href="/login" className="v20-iconbtn v20-avatar v20-exact-avatar pm-avatar-guest" aria-label={t('login')} title={t('login')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c.5-5 4-7 8-7s7.5 2 8 7" /></svg>
              </Link>
            ) : (
              <span className="pm-account" ref={menuRef}>
                <button type="button" className="v20-iconbtn v20-avatar v20-exact-avatar" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu} aria-label={t('account')}>
                  <span aria-hidden="true">{initial}</span>
                </button>
                {menu && (
                  <div className="pm-menu" role="menu">
                    <div className="pm-menu-who"><b>{user.name || user.email}</b><small>{user.email}</small></div>
                    {pratique && <Link href="/pratique" role="menuitem">{t('pqHub')}</Link>}
                    {(feat('favorites') || feat('lists')) && <Link href="/library" role="menuitem">{t('library')}</Link>}
                    <Link href="/account" role="menuitem">{t('account')}</Link>
                    <Link href="/pricing" role="menuitem">{t('pricing')}</Link>
                    {manager && <Link href={modOnly ? '/studio/moderation' : '/studio'} role="menuitem">{modOnly ? t('modNav') : t('studioNav')}</Link>}
                    {user.role === 'admin' && <Link href="/admin" role="menuitem">{t('adminNav')}</Link>}
                    <div className="pm-menu-opts">
                      <select value={locale} onChange={setLocale} aria-label={t('languageMenu')}>
                        {Object.entries(LOCALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <SkinPicker />
                    </div>
                    <button type="button" role="menuitem" className="pm-menu-out" onClick={logoutNow}>{t('logout')}</button>
                  </div>
                )}
              </span>
            )}
            <button type="button" className="v20-iconbtn v20-menu-toggle v20-exact-menu-toggle" onClick={() => setOpen((v) => !v)} aria-label={t('hmMenu')} aria-expanded={open} aria-controls="pm-nav">☰</button>
          </div>
        </div>
      </header>
      {search && <SearchPanel onClose={() => setSearch(false)} />}
    </div>
  );
}
