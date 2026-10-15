'use client';
// Étape B — Gabarit commun de l'espace membre : menu latéral à gauche (ordinateur), barre de 5 entrées en bas (téléphone).
// Le menu suit les interrupteurs de fonctions (Admin → Fonctions) : une fonction coupée disparaît du menu.
// Visiteurs, Studio/Administration (leur propre menu), Kids et pages d'entrée de compte : aucun changement.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useApp } from './Providers';
import { memberShellOn } from '../lib/shell';

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
  const { t, user, kid, feat, hasSeries, hasBooks } = useApp();
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

  const groups = [
    { title: t('hmDiscover'), items: [
      ['/', t('home'), ICONS.home, true],
      ['/series', t('seriesNav'), ICONS.series, hasSeries],
      ['/collections', t('colNav'), ICONS.col, feat('collections')],
      ['/books', t('bkNav'), ICONS.books, hasBooks],
      ['/chaines', t('spTitle'), ICONS.people, feat('channels')],
    ] },
    { title: t('msSpace'), items: [
      ['/learning', t('lrNav'), ICONS.learn, feat('learning')],
      ['/library', t('library'), ICONS.lib, feat('favorites') || feat('lists')],
      ['/learning?tab=bilan', t('msBilan'), ICONS.bilan, feat('learning') && feat('selfcheck')],
    ] },
    { title: t('msAccount'), items: [
      ['/kids', t('kdNav'), ICONS.kids, feat('kids')],
      ['/account', t('account'), ICONS.user, true],
    ] },
    ...(manager ? [{ title: t('hmManage'), items: [
      [modOnly ? '/studio/moderation' : '/studio', modOnly ? t('modNav') : t('studioNav'), ICONS.studio, true],
      ['/admin', t('adminNav'), ICONS.admin, user.role === 'admin'],
    ] }] : []),
  ].map((g) => ({ ...g, items: g.items.filter((x) => x[3]) })).filter((g) => g.items.length);

  // Barre du bas (téléphone) : 5 entrées au plus, les plus utiles ; le reste reste dans le menu ☰ de l'en-tête.
  const barItems = [
    ['/', t('home'), ICONS.home, true],
    hasSeries ? ['/series', t('seriesNav'), ICONS.series, true] : ['/collections', t('colNav'), ICONS.col, feat('collections')],
    ['/learning', t('msLearnShort'), ICONS.learn, feat('learning')],
    ['/library', t('library'), ICONS.lib, feat('favorites') || feat('lists')],
    ['/account', t('account'), ICONS.user, true],
  ].filter((x) => x[3]);

  return (
    <div className={`ms${col ? ' col' : ''}`}>
      <aside className="ms-side">
        <button type="button" className="ms-toggle" onClick={toggle} aria-expanded={!col} aria-label={col ? t('msExpand') : t('msCollapse')} title={col ? t('msExpand') : t('msCollapse')}><ChevIco /><span>{t('msCollapse')}</span></button>
        <nav aria-label={t('msSide')}>
          {groups.map((g) => (
            <div key={g.title} className="ms-group">
              <div className="ms-title">{g.title}</div>
              {g.items.map(([href, label, d]) => (
                <Link key={href} href={href} title={col ? label : undefined} className={isOn(href) ? 'on' : ''} aria-current={isOn(href) ? 'page' : undefined}><Ico d={d} /><span>{label}</span></Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="ms-main">{children}</div>
      <nav className="ms-bar" aria-label={t('msBar')}>
        {barItems.map(([href, label, d]) => (
          <Link key={href} href={href} className={isOn(href) ? 'on' : ''} aria-current={isOn(href) ? 'page' : undefined}><Ico d={d} /><span>{label}</span></Link>
        ))}
      </nav>
    </div>
  );
}
