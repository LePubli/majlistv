'use client';
// Étape B — Gabarit commun de l'espace membre : menu latéral à gauche (ordinateur), barre de 5 entrées en bas (téléphone).
// Le menu suit les interrupteurs de fonctions (Admin → Fonctions) : une fonction coupée disparaît du menu.
// Visiteurs, Studio/Administration (leur propre menu), Kids et pages d'entrée de compte : aucun changement.
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useApp } from './Providers';
import { memberShellOn, NO_SHELL } from '../lib/shell';
import NavLink from './NavLink';
import { resolveList, withHid } from '../lib/menus';
import { MENUS } from '../lib/navcfg';
import { NAV_ICON_PATHS } from '../lib/navicons';
import { tx } from '../lib/blocks';

const ICONS = {
  shorts: 'M8 3h8a2 2 0 012 2v14a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zM10.5 9.5l4 2.5-4 2.5z',
  home: 'M4 11l8-7 8 7v9H4z', series: 'M4 6h16M4 12h16M4 18h10', col: 'M12 3L3 8l9 5 9-5-9-5zM3 12.5l9 5 9-5', books: 'M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM8 20v-3',
  people: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  learn: 'M3 9l9-5 9 5-9 5zM7 12v4c2.5 2 7.5 2 10 0v-4', lib: 'M6 3h12v18l-6-4-6 4z', bilan: 'M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  kids: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  cat: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
  note: 'M6 3h9l3 3v15H6zM9 11h6M9 15h6', bell: 'M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 21h4', gift: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13', tag: 'M3 12l9-9h9v9l-9 9z',
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
  const { t, user, kid, feat, hasSeries, hasBooks, locale, layout, cats } = useApp();
  const path = usePathname();
  const params = useSearchParams();
  const [col, toggle] = useCollapsed();
  const member = memberShellOn(path, user, kid);
  // Visiteur : pas de menu latéral, mais la même barre du bas sur téléphone (Accueil · Catalogue · Séries · Apprendre · Kids).
  const visitorBar = !user && !kid && !NO_SHELL.test(path || '/');
  if (!member && !visitorBar) return children;

  const tab = params.get('tab');
  const catParam = params.get('cat');
  const fmtParam = params.get('format');
  // Une entrée « /learning?tab=bilan » n'est active que sur cet onglet ; « /learning » seulement quand aucun onglet n'est choisi
  // (idem /library, /account, /catalogue : « ?cat=… » et « ?format=… » ont leur propre entrée).
  const isOn = (href) => {
    const [p, q] = href.split('?');
    if (p === '/') return path === '/';
    if (!(path === p || path.startsWith(p + '/'))) return false;
    const qq = new URLSearchParams(q || '');
    if (qq.get('tab')) return tab === qq.get('tab');
    if (qq.get('cat')) return catParam === qq.get('cat');
    if (['/learning', '/library', '/account', '/catalogue'].includes(p)) return !tab && !catParam && !fmtParam;
    return true;
  };
  // La barre du bas marque l'espace entier (ex. « Apprendre » reste allumé sur tous les onglets de /learning).
  const isOnBar = (href) => { const p = href.split('?')[0]; return p === '/' ? path === '/' : path === p || path.startsWith(p + '/'); };
  const manager = Boolean(user) && ['organizer', 'moderator', 'admin'].includes(user.role);
  const modOnly = user?.role === 'moderator';

  // Menus d'origine, avec leurs conditions ; l'ordre, la visibilité, les textes et les liens ajoutés viennent des réglages
  // de Admin → Pages → En-tête, menus et pied de page (étape I4). Sans réglage : exactement le menu d'origine.
  const cfg = layout?.nav?.menus;
  const opts = { user, lang: locale };
  const learn = feat('learning');
  const D = {
    home: { key: 'home', href: '/', label: t('home'), icon: ICONS.home, on: true },
    catalogue: { key: 'catalogue', href: '/catalogue', label: t('navCatalogue'), icon: ICONS.cat, on: true },
    series: { key: 'series', href: '/series', label: t('seriesNav'), icon: ICONS.series, on: hasSeries },
    collections: { key: 'collections', href: '/collections', label: t('colNav'), icon: ICONS.col, on: feat('collections') },
    books: { key: 'books', href: '/books', label: t('bkNav'), icon: ICONS.books, on: hasBooks },
    channels: { key: 'channels', href: '/chaines', label: t('spTitle'), icon: ICONS.people, on: feat('channels') },
    shorts: { key: 'shorts', href: '/shorts', label: t('shrTitle'), icon: ICONS.shorts, on: feat('shorts') },
    learning: { key: 'learning', href: '/learning', label: t('msPath'), icon: ICONS.learn, on: learn },
    quiz: { key: 'quiz', href: '/learning?tab=rev', label: t('msQuiz'), icon: ICONS.bilan, on: learn && feat('revision') },
    practice: { key: 'practice', href: '/learning?tab=commit', label: t('msPractice'), icon: ICONS.note, on: learn },
    bilan: { key: 'bilan', href: '/learning?tab=bilan', label: t('msBilan'), icon: ICONS.tag, on: learn && feat('selfcheck') },
    library: { key: 'library', href: '/library', label: t('library'), icon: ICONS.lib, on: feat('favorites') || feat('lists') },
    favs: { key: 'favs', href: '/library?tab=favs', label: t('tbFavs'), icon: ICONS.heart, on: feat('favorites') },
    lists: { key: 'lists', href: '/library?tab=lists', label: t('tbLists'), icon: ICONS.lib, on: feat('lists') },
    notes: { key: 'notes', href: '/library?tab=notes', label: t('tbNotes'), icon: ICONS.note, on: feat('notes') },
    follows: { key: 'follows', href: '/library?tab=follows', label: t('tbFollows'), icon: ICONS.people, on: feat('follow') && feat('channels') },
    kids: { key: 'kids', href: '/kids', label: t('kdNav'), icon: ICONS.kids, on: feat('kids') },
    account: { key: 'account', href: '/account', label: t('msProfile'), icon: ICONS.user, on: true },
    gifts: { key: 'gifts', href: '/account?tab=gifts', label: t('tbGifts'), icon: ICONS.gift, on: feat('gifts') },
    mails: { key: 'mails', href: '/account?tab=emails', label: t('msNotif'), icon: ICONS.bell, on: true },
    studio: { key: 'studio', href: modOnly ? '/studio/moderation' : '/studio', label: modOnly ? t('modNav') : t('studioNav'), icon: ICONS.studio, on: manager },
    admin: { key: 'admin', href: '/admin', label: t('adminNav'), icon: ICONS.admin, on: user?.role === 'admin' },
  };
  const GROUP_TITLE = { discover: t('hmDiscover'), space: t('navLearn'), library: t('library'), account: t('msMyAccount'), manage: t('hmManage') };
  const groups = MENUS.side.groups.map(([g]) => ({
    key: g,
    title: tx(cfg?.side?.titles?.[g], locale) || GROUP_TITLE[g],
    items: resolveList(cfg?.side?.[g], MENUS.side.builtin[g].map(([k]) => D[k]), opts),
  })).filter((g) => g.items.length);
  // Groupe « Catégories » : rempli tout seul depuis Admin → Catégories (mêmes noms partout), juste après « Découvrir ».
  if (cats?.length) {
    const at = groups.findIndex((g) => g.key === 'discover');
    groups.splice(at + 1, 0, { key: 'cats', title: t('msCats'), items: cats.map((c) => ({ key: 'c' + c.id, href: `/catalogue?cat=${c.id}`, label: c.name, icon: ICONS.tag, cls: '' })) });
  }
  const iconOf = (it) => (it.custom ? NAV_ICON_PATHS[it.icon] || NAV_ICON_PATHS.link : it.icon);

  // Barre du bas (téléphone) : 5 entrées au plus ; le reste reste dans le menu ☰ de l'en-tête.
  // D'origine : Accueil · Catalogue · Séries · Apprendre · Kids (sans série en bibliothèque, « Collections » remplace « Séries »).
  const barD = { ...D, series: hasSeries ? D.series : { ...D.collections, key: 'series' }, learning: { ...D.learning, label: t('msLearnShort') } };
  const barItems = resolveList(cfg?.bar, withHid(MENUS.bar.builtin, barD), opts).slice(0, 5);
  const bar = (
    <nav className="ms-bar" aria-label={member ? t('msBar') : t('barVisitor')}>
      {barItems.map((it) => (
        <NavLink key={it.key} href={it.href} className={[isOnBar(it.href) ? 'on' : '', it.cls].filter(Boolean).join(' ')} aria-current={isOnBar(it.href) ? 'page' : undefined}><Ico d={iconOf(it)} /><span>{it.label}</span></NavLink>
      ))}
    </nav>
  );
  if (!member) return <>{children}{bar}</>;

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
      {bar}
    </div>
  );
}
