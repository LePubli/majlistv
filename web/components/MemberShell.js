'use client';
// Étape B — Gabarit commun de l'espace membre : menu latéral à gauche (ordinateur), barre de 5 entrées en bas (téléphone).
// Le menu suit les interrupteurs de fonctions (Admin → Fonctions) : une fonction coupée disparaît du menu.
// Visiteurs, Studio/Administration (leur propre menu), Kids et pages d'entrée de compte : aucun changement.
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useApp } from './Providers';
import { memberShellOn } from '../lib/shell';
import NavLink from './NavLink';
import { resolveList } from '../lib/menus';
import { MENUS } from '../lib/navcfg';
import { NAV_ICON_PATHS } from '../lib/navicons';
import { tx } from '../lib/blocks';

const ICONS = {
  home: 'M4 11l8-7 8 7v9H4z', series: 'M4 6h16M4 12h16M4 18h10', col: 'M12 3L3 8l9 5 9-5-9-5zM3 12.5l9 5 9-5', books: 'M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM8 20v-3',
  people: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  learn: 'M3 9l9-5 9 5-9 5zM7 12v4c2.5 2 7.5 2 10 0v-4', lib: 'M6 3h12v18l-6-4-6 4z', bilan: 'M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  kids: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  studio: 'M3 7a3 3 0 013-3h12a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3zM10 9.5l5 2.5-5 2.5z', admin: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z',
};
const Ico = ({ d }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

const KEY = 'ms-collapsed';
// Hook partagé avec le Studio : état replié mémorisé (localStorage, avec try/catch), défaut selon la largeur d'écran.
export function useCollapsed() {
  const [col, setCol] = useState(false);
  useEffect(() => {
    let v = null;
    try { v = localStorage.getItem(KEY); } catch {}
    setCol(v === null ? window.innerWidth < 1280 : v === '1');
  }, []);
  const toggle = () => setCol((c) => { try { localStorage.setItem(KEY, c ? '0' : '1'); } catch {} return !c; });
  return [col, toggle];
}
export const ChevIco = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
);

export default function MemberShell({ children }) {
  const { t, user, kid, feat, hasSeries, hasBooks, locale, layout } = useApp();
  const path = usePathname();
  const params = useSearchParams();
  const [col, toggle] = useCollapsed();
  if (!memberShellOn(path, user, kid)) return children;

  const tab = params.get('tab');
  // Une entrée « /learning?tab=bilan » n'est active que sur cet onglet ; « /learning » sur tous les autres.
  const isOn = (href) => {
    const [p, q] = href.split('?');
    if (p === '/') return path === '/';
    if (!(path === p || path.startsWith(p + '/'))) return false;
    const want = q ? new URLSearchParams(q).get('tab') : null;
    if (want) return tab === want;
    return !(p === '/learning' && tab === 'bilan');
  };
  const manager = ['organizer', 'moderator', 'admin'].includes(user.role);
  const modOnly = user.role === 'moderator';

  // Menus d'origine, avec leurs conditions ; l'ordre, la visibilité, les textes et les liens ajoutés viennent des réglages
  // de Admin → Pages → En-tête, menus et pied de page (étape I4). Sans réglage : exactement le menu d'origine.
  const cfg = layout?.nav?.menus;
  const opts = { user, lang: locale };
  const D = {
    home: { key: 'home', href: '/', label: t('home'), icon: ICONS.home, on: true },
    series: { key: 'series', href: '/series', label: t('seriesNav'), icon: ICONS.series, on: hasSeries },
    collections: { key: 'collections', href: '/collections', label: t('colNav'), icon: ICONS.col, on: feat('collections') },
    books: { key: 'books', href: '/books', label: t('bkNav'), icon: ICONS.books, on: hasBooks },
    channels: { key: 'channels', href: '/chaines', label: t('spTitle'), icon: ICONS.people, on: feat('channels') },
    learning: { key: 'learning', href: '/learning', label: t('lrNav'), icon: ICONS.learn, on: feat('learning') },
    library: { key: 'library', href: '/library', label: t('library'), icon: ICONS.lib, on: feat('favorites') || feat('lists') },
    bilan: { key: 'bilan', href: '/learning?tab=bilan', label: t('msBilan'), icon: ICONS.bilan, on: feat('learning') && feat('selfcheck') },
    kids: { key: 'kids', href: '/kids', label: t('kdNav'), icon: ICONS.kids, on: feat('kids') },
    account: { key: 'account', href: '/account', label: t('account'), icon: ICONS.user, on: true },
    studio: { key: 'studio', href: modOnly ? '/studio/moderation' : '/studio', label: modOnly ? t('modNav') : t('studioNav'), icon: ICONS.studio, on: manager },
    admin: { key: 'admin', href: '/admin', label: t('adminNav'), icon: ICONS.admin, on: user.role === 'admin' },
  };
  const GROUP_TITLE = { discover: t('hmDiscover'), space: t('msSpace'), account: t('msAccount'), manage: t('hmManage') };
  const groups = MENUS.side.groups.map(([g]) => ({
    key: g,
    title: tx(cfg?.side?.titles?.[g], locale) || GROUP_TITLE[g],
    items: resolveList(cfg?.side?.[g], MENUS.side.builtin[g].map(([k]) => D[k]), opts),
  })).filter((g) => g.items.length);
  const iconOf = (it) => (it.custom ? NAV_ICON_PATHS[it.icon] || NAV_ICON_PATHS.link : it.icon);

  // Barre du bas (téléphone) : 5 entrées au plus, les plus utiles ; le reste reste dans le menu ☰ de l'en-tête.
  // D'origine : « Séries » si la bibliothèque en compte, sinon « Collections » ; texte court pour « Apprentissage ».
  const barDefaults = [
    D.home,
    hasSeries ? D.series : { ...D.collections, on: feat('collections') },
    { ...D.learning, label: t('msLearnShort') },
    D.library,
    D.account,
  ];
  const barKeys = ['home', 'series', 'learning', 'library', 'account', 'collections', 'books', 'channels', 'kids'];
  const barItems = (Array.isArray(cfg?.bar)
    ? resolveList(cfg.bar, barKeys.map((k) => (k === 'learning' ? { ...D.learning, label: t('msLearnShort') } : D[k])), opts)
    : resolveList(undefined, barDefaults, opts)).slice(0, 5);

  return (
    <div className={`ms${col ? ' col' : ''}`}>
      <aside className="ms-side">
        <button type="button" className="ms-toggle" onClick={toggle} aria-expanded={!col} aria-label={col ? t('msExpand') : t('msCollapse')} title={col ? t('msExpand') : t('msCollapse')}><ChevIco /><span>{t('msCollapse')}</span></button>
        <nav aria-label={t('msSide')}>
          {groups.map((g) => (
            <div key={g.key} className="ms-group">
              <div className="ms-title">{g.title}</div>
              {g.items.map((it) => (
                <NavLink key={it.key} href={it.href} title={col ? it.label : undefined} className={[isOn(it.href) ? 'on' : '', it.cls].filter(Boolean).join(' ')} aria-current={isOn(it.href) ? 'page' : undefined}><Ico d={iconOf(it)} /><span>{it.label}</span></NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="ms-main">{children}</div>
      <nav className="ms-bar" aria-label={t('msBar')}>
        {barItems.map((it) => (
          <NavLink key={it.key} href={it.href} className={[isOn(it.href) ? 'on' : '', it.cls].filter(Boolean).join(' ')} aria-current={isOn(it.href) ? 'page' : undefined}><Ico d={iconOf(it)} /><span>{it.label}</span></NavLink>
        ))}
      </nav>
    </div>
  );
}
