'use client';
// Étape B — Gabarit commun de l'espace membre : menu latéral à gauche (ordinateur), barre de 5 entrées en bas (téléphone).
// Le menu suit les interrupteurs de fonctions (Admin → Fonctions) : une fonction coupée disparaît du menu.
// Visiteurs, Studio/Administration (leur propre menu), Kids et pages d'entrée de compte : aucun changement.
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useApp } from './Providers';
import { memberShellOn, NO_SHELL, WATCH_PATH } from '../lib/shell';
import { sectionOf } from './SectionTabs';
import NavLink from './NavLink';
import { defaultList, resolveMenu, withHid } from '../lib/menus';
import { MENUS } from '../lib/navcfg';
import { NAV_ICON_PATHS } from '../lib/navicons';
import AppPromo from './AppPromo';
import { KidsPendingBadge } from './KidsPending';

const ICONS = {
  prayer: 'M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z',
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
  // Groupes ouverts ou fermés à la main (clé du groupe → vrai / faux) ; sans choix, seul le groupe de la page est ouvert.
  const [openG, setOpenG] = useState({});
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
  const SECTION_HOME = { '/catalogue': 'catalogue', '/pratique': 'pratique' };
  const isOnBar = (href) => { const p = href.split('?')[0]; return p === '/' ? path === '/' : path === p || path.startsWith(p + '/') || (SECTION_HOME[p] ? sectionOf(path) === SECTION_HOME[p] : false); };
  const manager = Boolean(user) && ['organizer', 'moderator', 'admin'].includes(user.role);
  const modOnly = user?.role === 'moderator';

  // Menus d'origine, avec leurs conditions ; un menu affecté dans Admin → Menus les remplace.
  const opts = { user, lang: locale };
  const learn = feat('learning');
  const D = {
    home: { key: 'home', href: '/', label: t('home'), icon: ICONS.home, on: true },
    catalogue: { key: 'catalogue', href: '/catalogue', label: t('navCatalogue'), icon: ICONS.cat, on: true },
    series: { key: 'series', href: '/series', label: t('seriesNav'), icon: ICONS.series, on: hasSeries },
    collections: { key: 'collections', href: '/collections', label: t('colNav'), icon: ICONS.col, on: feat('collections') },
    ramadan: { key: 'ramadan', href: '/ramadan', label: t('rzNav'), icon: ICONS.tag, on: feat('ramadan') },
    prayer: { key: 'prayer', href: '/priere', label: t('pqNav'), icon: ICONS.prayer, on: feat('prayer') },
    quran: { key: 'quran', href: '/coran', label: t('qrNav'), icon: ICONS.books, on: feat('quran') },
    events: { key: 'events', href: '/events', label: t('evnNav'), icon: ICONS.bell, on: feat('events') || feat('livetv') },
    audyn: { key: 'audyn', href: '/audyn', label: t('awNav'), icon: ICONS.books, on: feat('audyn') },
    athkar: { key: 'athkar', href: '/adhkar', label: t('atTab'), icon: ICONS.bilan, on: feat('athkar') },
    pratique: { key: 'pratique', href: '/pratique', label: t('pqHub'), icon: ICONS.prayer, on: feat('prayer') || feat('quran') || feat('athkar') || feat('ramadan') },
    quranlearn: { key: 'quranlearn', href: '/coran', label: t('qrNav'), icon: ICONS.books, on: feat('quran') },
    books: { key: 'books', href: '/books', label: t('bkNav'), icon: ICONS.books, on: hasBooks },
    channels: { key: 'channels', href: '/chaines', label: t('spTitle'), icon: ICONS.people, on: feat('channels') },
    shorts: { key: 'shorts', href: '/shorts', label: t('shrTitle'), icon: ICONS.shorts, on: feat('shorts') },
    // Audit 11/2026 (lot C) : même mot que l'onglet sur lequel on arrive (« Aujourd'hui »), et non « Mon parcours » (qui est un sous-onglet de « Vidéos »).
    learning: { key: 'learning', href: '/learning', label: t('lgGToday'), icon: ICONS.learn, on: learn },
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
  // Navigation de novembre 2026 (lot F) : un groupe par destination ; le titre du groupe remplace les anciens liens en double
  // (Accueil, Catalogue, Séries étaient à la fois en haut et ici). Dans le groupe « Catalogue », l'entrée /catalogue s'appelle « Vidéos ».
  const GROUP_TITLE = { catalogue: t('navCatalogue'), space: t('navLearn'), pratique: t('pqHub'), library: t('library'), account: t('msMyAccount'), manage: t('hmManage') };
  const sideD = { ...D, catalogue: { ...D.catalogue, label: t('stVideos') }, audyn: { ...D.audyn, label: t('stAudio') }, events: { ...D.events, label: t('stLive') } };
  // Projet Menus : un menu affecté à « Site — menu latéral » (Admin → Menus) remplace le menu d'origine. Chaque « Titre de groupe »
  // ouvre un groupe ; les liens qui portent un sous-menu sont suivis de leurs sous-liens (en retrait).
  const customSide = layout?.menus?.web_side;
  let groups;
  if (customSide) {
    groups = [];
    let cur = null;
    const flush = () => { if (cur && cur.items.length) groups.push(cur); cur = null; };
    const add = (it, sub) => { if (!cur) cur = { key: `g${groups.length}`, title: '', items: [] }; cur.items.push(sub ? { ...it, cls: `${it.cls || ''} ms-sub`.trim() } : it); };
    for (const it of resolveMenu(customSide, Object.values(D), { user, lang: locale, keepHeadings: true })) {
      if (it.heading) { flush(); cur = { key: it.key, title: it.label, items: [] }; (it.children || []).forEach((c) => { add(c); (c.children || []).forEach((cc) => add(cc, true)); }); continue; }
      add(it); (it.children || []).forEach((c) => add(c, true));
    }
    flush();
  } else {
    groups = MENUS.side.groups.map(([g]) => ({
      key: g,
      title: GROUP_TITLE[g],
      items: defaultList(withHid(MENUS.side.builtin[g], sideD)),
    })).filter((g) => g.items.length);
    // Groupe « Catégories » : rempli tout seul depuis Admin → Catégories (mêmes noms partout), juste après « Catalogue ».
    if (cats?.length) {
      const at = groups.findIndex((g) => g.key === 'catalogue');
      groups.splice(at + 1, 0, { key: 'cats', title: t('msCats'), items: cats.map((c) => ({ key: 'c' + c.id, href: `/catalogue?cat=${c.id}`, label: c.name, icon: ICONS.tag, cls: '' })) });
    }
  }
  const iconOf = (it) => (it.custom ? NAV_ICON_PATHS[it.icon] || NAV_ICON_PATHS.link : it.icon);

  // Barre du bas (téléphone) : 5 entrées au plus ; le reste reste dans le menu ☰ de l'en-tête.
  // D'origine : Accueil · Catalogue · Séries · Apprendre · Kids (sans série en bibliothèque, « Collections » remplace « Séries »).
  const barD = { ...D, series: hasSeries ? D.series : { ...D.collections, key: 'series' }, learning: { ...D.learning, label: t('msLearnShort') }, library: { ...D.library, label: t('msLibShort') } };
  const customBar = layout?.menus?.web_bar;
  const barItems = (customBar ? resolveMenu(customBar, Object.values(barD), opts) : defaultList(withHid(MENUS.bar.builtin, barD))).slice(0, 5);
  const bar = (
    <nav className="ms-bar" aria-label={member ? t('msBar') : t('barVisitor')}>
      {barItems.map((it) => (
        <NavLink key={it.key} href={it.href} className={[isOnBar(it.href) ? 'on' : '', it.cls].filter(Boolean).join(' ')} aria-current={isOnBar(it.href) ? 'page' : undefined}><Ico d={iconOf(it)} /><span>{it.label}</span>{it.key === 'kids' && <KidsPendingBadge />}</NavLink>
      ))}
    </nav>
  );
  // Page d'une vidéo : pas de menu latéral, le lecteur prend toute la largeur (la barre du bas du téléphone reste).
  if (!member || WATCH_PATH.test(path || '/')) return <>{children}{bar}</>;

  // Menu latéral en accordéon : seul le groupe qui contient la page courante est ouvert (à défaut, le premier) ; un clic sur
  // un titre ouvre ou ferme son groupe. Menu réduit aux icônes : tout reste visible.
  const hasCurrent = (g) => g.items.some((it) => isOn(it.href)) || (g.key === 'cats' && Boolean(catParam));
  const sec = sectionOf(path || '/');
  const SEC_GROUP = { catalogue: 'catalogue', pratique: 'pratique' };
  const curKey = (groups.find(hasCurrent) || groups.find((g) => g.key === SEC_GROUP[sec]) || (path.startsWith('/learning') ? groups.find((g) => g.key === 'space') : null) || (path.startsWith('/library') ? groups.find((g) => g.key === 'library') : null) || (path.startsWith('/account') ? groups.find((g) => g.key === 'account') : null) || groups[0] || {}).key;
  const isOpen = (g) => col || !g.title || (g.key in openG ? openG[g.key] : g.key === curKey);

  return (
    <div className={`ms${col ? ' col' : ''}`}>
      <aside className="ms-side">
        <button type="button" className="ms-toggle" onClick={toggle} aria-expanded={!col} aria-label={col ? t('msExpand') : t('msCollapse')} title={col ? t('msExpand') : t('msCollapse')}><ChevIco /><span>{t('msCollapse')}</span></button>
        <nav aria-label={t('msSide')}>
          {groups.map((g) => (
            <div key={g.key} className={`ms-group${isOpen(g) ? '' : ' shut'}`}>
              {g.title && <button type="button" className="ms-title" aria-expanded={isOpen(g)} onClick={() => setOpenG((o) => ({ ...o, [g.key]: !isOpen(g) }))}><span>{g.title}</span><i aria-hidden="true" /></button>}
              {isOpen(g) && g.items.map((it) => (
                <NavLink key={it.key} href={it.href} title={col ? it.label : undefined} className={[isOn(it.href) ? 'on' : '', it.cls].filter(Boolean).join(' ')} aria-current={isOn(it.href) ? 'page' : undefined}><Ico d={iconOf(it)} /><span>{it.label}</span>{it.key === 'kids' && <KidsPendingBadge />}</NavLink>
              ))}
            </div>
          ))}
        </nav>
        <AppPromo variant="side" />
      </aside>
      <div className="ms-main">{children}</div>
      {bar}
    </div>
  );
}
