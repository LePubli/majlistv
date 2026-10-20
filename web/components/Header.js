'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KidsWord } from './KidsBanner';
import SearchPanel from './SearchPanel';
import { useApp } from './Providers';
import { AVATAR_EMOJI } from '../lib/kids';
import { LOCALES } from '../lib/i18n';
import { memberShellOn } from '../lib/shell';
import NavLink from './NavLink';
import { resolveList, audienceOk, deviceClass, withHid } from '../lib/menus';
import { defaultHeader, MENUS } from '../lib/navcfg';
import { tx } from '../lib/blocks';
import { NAV_ICON_PATHS } from '../lib/navicons';

// En-tête Mejliss TV : emblème + logotype, navigation, langue, compte.
// Espace enfant : en-tête réduit ; on n'en sort qu'avec le code parental du parent.
function KidHeader() {
  const { appName, t, kid, call, login } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const leave = async (e) => {
    e.preventDefault(); setErr('');
    const r = await call('/kids/exit', { method: 'POST', body: JSON.stringify({ code }) });
    if (!r.ok) {
      setCode('');
      setErr(r.data?.code === 'locked' ? t('kdExitLocked').replace('{n}', (r.data.error.match(/\d+/) || ['10'])[0]) : r.data?.code === 'bad_pin' ? t('kdExitBad').replace('{n}', r.data.left ?? '') : (r.data?.error || t('errGeneric')));
      return;
    }
    login(r.data.token, r.data.user);
    router.push('/kids');
  };
  return (
    <header className="header kd-header">
      <Link href="/kids" className="logo" aria-label={appName}>
        <img className="logo-emblem" src="/brand/emblem.png" alt="" width="37" height="40" />
        <span className="kd-brand"><span className="kd-brand-name">{appName}</span> <KidsWord /></span>
      </Link>
      <nav aria-label={t('mainNav')}>
        <span className="kd-me"><span aria-hidden="true">{AVATAR_EMOJI[kid.avatar] || '🦁'}</span> {kid.name}</span>
        <button type="button" className="btn ghost" onClick={() => { setOpen(true); setErr(''); setCode(''); }}>{t('kdLeave')}</button>
      </nav>
      {open && createPortal(
        <div className="kd-modal" role="dialog" aria-modal="true" aria-labelledby="kd-exit-title">
          <form className="kd-modal-box" onSubmit={leave}>
            <h2 id="kd-exit-title">{t('kdExitTitle')}</h2>
            <p className="meta">{t('kdExitHelp')}</p>
            <input type="password" inputMode="numeric" autoComplete="off" pattern="\d{4,6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} aria-label={t('kdExitTitle')} />
            {err && <p className="error" role="alert">{err}</p>}
            <div className="panel-actions"><button className="btn">{t('kdOk')}</button><button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('kdCancel')}</button></div>
          </form>
        </div>,
        document.body
      )}
    </header>
  );
}

export default function Header() {
  const { kid } = useApp();
  return kid ? <KidHeader /> : <MainHeader />;
}

const Ico = ({ d, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICONS = {
  home: 'M4 11l8-7 8 7v9H4z', series: 'M4 6h16M4 12h16M4 18h10', books: 'M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM8 20v-3',
  learn: 'M3 9l9-5 9 5-9 5zM7 12v4c2.5 2 7.5 2 10 0v-4', lib: 'M6 3h12v18l-6-4-6 4z', price: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  studio: 'M3 7a3 3 0 013-3h12a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3zM10 9.5l5 2.5-5 2.5z', admin: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  shorts: 'M8 3h8a2 2 0 012 2v14a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zM10.5 9.5l4 2.5-4 2.5z',
};

// En-tête du site : pages principales, loupe (recherche en panneau), compte. Sur téléphone : menu latéral.
function MainHeader() {
  const { appName, t, locale, user, ready, logout, hasSeries, hasBooks, feat, layout, cats } = useApp();
  const router = useRouter();
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const setLocale = (e) => {
    document.cookie = `locale=${e.target.value};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };
  // Changement de page : les menus se referment.
  useEffect(() => { setDrawer(false); setMenu(false); }, [path]);
  // Menu du compte : clic à côté ou Échap pour fermer.
  useEffect(() => {
    if (!menu) return undefined;
    const off = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [menu]);
  // Studio et administration ont leur propre menu (components/StudioShell.js).
  if (path.startsWith('/studio') || path.startsWith('/admin')) return null;
  const cur = (href) => (path === href || (href !== '/' && path.startsWith(href)) ? 'page' : undefined);
  const manager = user && ['organizer', 'moderator', 'admin'].includes(user.role);
  const modOnly = user && user.role === 'moderator';
  // Menu principal : éléments d'origine (avec leurs conditions) mis dans l'ordre et au gré des réglages de Admin → Pages (étape I4).
  const nav = layout?.nav;
  const mainD = {
    home: { key: 'home', href: '/', label: t('home'), icon: ICONS.home, on: true },
    catalogue: { key: 'catalogue', href: '/catalogue', label: t('navCatalogue'), icon: ICONS.series, on: true },
    shorts: { key: 'shorts', href: '/shorts', label: t('shrTitle'), icon: ICONS.shorts, on: feat('shorts') },
    series: { key: 'series', href: '/series', label: t('seriesNav'), icon: ICONS.series, on: hasSeries },
    collections: { key: 'collections', href: '/collections', label: t('colNav'), icon: ICONS.series, on: feat('collections') },
    books: { key: 'books', href: '/books', label: t('bkNav'), icon: ICONS.books, on: hasBooks },
    learning: { key: 'learning', href: '/learning', label: t('navLearn'), icon: ICONS.learn, on: feat('learning') },
    library: { key: 'library', href: '/library', label: t('library'), icon: ICONS.lib, on: Boolean(user) && (feat('favorites') || feat('lists')) },
    kids: { key: 'kids', href: '/kids', label: t('kdNav'), icon: ICONS.price, on: feat('kids'), kids: true },
  };
  const pages = resolveList(nav?.menus?.main, withHid(MENUS.main.builtin, mainD), { user, lang: locale });
  const iconOf = (it) => (it.custom ? NAV_ICON_PATHS[it.icon] || NAV_ICON_PATHS.link : it.icon);
  const hz = nav?.header || defaultHeader();
  const logoutNow = () => { logout(); setMenu(false); setDrawer(false); router.push('/'); };
  const langSelect = (
    <select value={locale} onChange={setLocale} aria-label={t('languageMenu')}>
      {Object.entries(LOCALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  // Éléments de l'en-tête (étape I4) : chacun peut être placé à gauche, au centre ou à droite.
  const accountEl = !ready ? null : !user ? <Link href="/login" className="hd-login">{t('login')}</Link> : (
    <div className="hd-account" ref={menuRef}>
      <button type="button" className="hd-avatar-btn" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu} aria-label={t('account')}>
        <span className="hd-avatar" aria-hidden="true">{initial}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {menu && (
        <div className="hd-menu" role="menu">
          <div className="hd-menu-who"><span className="hd-avatar" aria-hidden="true">{initial}</span><div><b>{user.name || user.email}</b><small>{user.email}</small></div></div>
          <Link href="/account" role="menuitem" aria-current={cur('/account')}>{t('account')}</Link>
          <Link href="/pricing" role="menuitem">{t('pricing')}</Link>
          {manager && (
            <>
              <p className="hd-menu-title">{t('hmManage')}</p>
              <Link href={modOnly ? '/studio/moderation' : '/studio'} role="menuitem">{modOnly ? t('modNav') : t('studioNav')}</Link>
              {user.role === 'admin' && <Link href="/admin" role="menuitem">{t('adminNav')}</Link>}
            </>
          )}
          <div className="hd-menu-lang">{langSelect}</div>
          <button type="button" role="menuitem" className="hd-menu-out" onClick={logoutNow}>{t('logout')}</button>
        </div>
      )}
    </div>
  );
  const renderEl = (el) => {
    if (el.hidden || !audienceOk(el.show?.audience, user)) return null;
    switch (el.key || el.type) {
      case 'logo': return (
        <Link href="/" className="logo" aria-label={appName}>
          <img className="logo-emblem" src="/brand/emblem.png" alt="" width="37" height="40" />
          <img className="logo-word" src="/brand/wordmark.png" alt={appName} width="108" height="22" />
        </Link>
      );
      case 'menu': return (
        <nav className="hd-nav" aria-label={t('mainNav')}>
          {pages.map((it) => <NavLink key={it.key} href={it.href} aria-current={cur(it.href)} className={[it.kids && 'hd-kids', it.cls].filter(Boolean).join(' ') || undefined}>{it.label}</NavLink>)}
        </nav>
      );
      case 'search': return (
        <button type="button" className="hd-icon hd-round" onClick={() => setSearch(true)} aria-label={t('hmSearch')} aria-haspopup="dialog">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        </button>
      );
      case 'lang': return ready ? <span className="hd-lang">{langSelect}</span> : null;
      case 'account': return accountEl;
      case 'cta': return ready && !user ? <Link href="/pricing" className="btn hd-cta">{t('hmSubscribe')}</Link> : null;
      case 'link': { const l = tx(el.label, locale); return l && el.url ? <NavLink href={el.url} className="hd-link">{l}</NavLink> : null; }
      case 'button': { const l = tx(el.label, locale); return l && el.url ? <NavLink href={el.url} className={`btn hd-cta hd-x${el.buttonKind === 'ghost' ? ' ghost' : ''}`}>{l}</NavLink> : null; }
      default: return null;
    }
  };
  const zone = (name) => (hz[name] || []).map((el) => { const n = renderEl(el); return n ? <div key={el.id} className={`hd-el ${deviceClass(el.show)}`.trim()}>{n}</div> : null; });
  return (
    <header className={`header hd${memberShellOn(path, user, null) ? ' hd-side' : ''}`}>
      <button type="button" className="hd-icon hd-burger" onClick={() => setDrawer(true)} aria-label={t('hmMenu')} aria-expanded={drawer}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <div className="hd-left">{zone('left')}</div>
      <div className="hd-center">{zone('center')}</div>
      <div className="hd-right">{zone('right')}</div>
      {search && <SearchPanel onClose={() => setSearch(false)} />}
      {drawer && createPortal(
        <div className="dr-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(false); }}>
          <aside className="dr" role="dialog" aria-modal="true" aria-label={t('hmMenu')} onKeyDown={(e) => { if (e.key === 'Escape') setDrawer(false); }}>
            <div className="dr-top">
              <Link href="/" className="logo" aria-label={appName}><img className="logo-emblem" src="/brand/emblem.png" alt="" width="37" height="40" /><img className="logo-word" src="/brand/wordmark.png" alt={appName} width="108" height="22" /></Link>
              <button type="button" className="hd-icon" autoFocus onClick={() => setDrawer(false)} aria-label={t('hmClose')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {user && <div className="dr-who"><span className="hd-avatar" aria-hidden="true">{initial}</span><div><b>{user.name || user.email}</b><small>{user.email}</small></div></div>}
            <nav aria-label={t('mainNav')} className="dr-nav">
              <p className="hd-menu-title">{t('hmDiscover')}</p>
              {pages.map((it) => <NavLink key={it.key} href={it.href} aria-current={cur(it.href)} className={[it.kids && 'dr-kids', it.cls].filter(Boolean).join(' ') || undefined}><Ico d={iconOf(it)} />{it.label}</NavLink>)}
              {cats?.length > 0 && (
                <>
                  <p className="hd-menu-title dr-sep">{t('msCats')}</p>
                  {cats.map((c) => <NavLink key={c.id} href={`/catalogue?cat=${c.id}`}>{c.name}</NavLink>)}
                </>
              )}
              {manager && (
                <>
                  <p className="hd-menu-title dr-sep">{t('hmManage')}</p>
                  <Link href={modOnly ? '/studio/moderation' : '/studio'}><Ico d={ICONS.studio} />{modOnly ? t('modNav') : t('studioNav')}</Link>
                  {user.role === 'admin' && <Link href="/admin"><Ico d={ICONS.admin} />{t('adminNav')}</Link>}
                </>
              )}
            </nav>
            <div className="dr-foot">
              {user ? (
                <>
                  <Link href="/account"><Ico d={ICONS.user} />{t('account')}</Link>
                  <Link href="/pricing"><Ico d={ICONS.price} />{t('pricing')}</Link>
                  <button type="button" className="hd-menu-out" onClick={logoutNow}>{t('logout')}</button>
                </>
              ) : (
                <>
                  <Link href="/login"><Ico d={ICONS.user} />{t('login')}</Link>
                  <Link href="/pricing" className="btn">{t('hmSubscribe')}</Link>
                </>
              )}
              <div className="dr-lang">{langSelect}</div>
            </div>
          </aside>
        </div>,
        document.body
      )}
    </header>
  );
}
