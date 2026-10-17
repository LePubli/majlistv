'use client';
// Habillage commun des espaces de gestion (Studio et Administration) : menu latéral repliable, pied (site, langue, compte).
// Étape D : le Studio et l'Administration ont chacun leur menu (StudioShell.js, AdminShell.js) mais partagent cet habillage.
// Sur téléphone, le menu devient une barre en haut qui défile horizontalement.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from './Providers';
import { LOCALES } from '../lib/i18n';
import { useCollapsed, ChevIco } from './MemberShell';

export const ICONS = {
  list: 'M4 6h16M4 12h16M4 18h10',
  plus: 'M12 5v14M5 12h14',
  dash: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4h6v4h-6zM4 20h6v-3H4z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.4-1.4M5.6 18.4 7 17M17 17l1.4 1.4M5.6 5.6 7 7',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  tag: 'M3 12V4h8l9 9-8 8zM7.5 8.5h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  check: 'M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  bell: 'M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0',
  layers: 'M12 3 3 8l9 5 9-5-9-5zM3 12.5l9 5 9-5',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  mic: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  sub: 'M4 5h16v12H9l-5 4zM8 10h8M8 13h5',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M16 9h4M4 15h4M16 15h4',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  back: 'M10 6l-6 6 6 6M4 12h16',
  brush: 'M14.5 4.5l5 5L10 19H5v-5zM12.5 6.5l5 5M5 19l-2 2',
};
export const Icon = ({ d }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

// space : 'studio' | 'admin' ; groups : [{ key, title, items: [[href, libellé, icône, pastille?]] }] ;
// links : liens du pied [{ href, label, icon }] ; isOn(href) : l'entrée est-elle la page courante ? ; extra : encart au-dessus du pied (facultatif)
export default function ManageShell({ space, groups, links, isOn, extra, children }) {
  const { t, user, logout, locale } = useApp();
  const router = useRouter();
  const [col, toggle] = useCollapsed();
  const setLocale = (e) => { document.cookie = `locale=${e.target.value};path=/;max-age=31536000;samesite=lax`; router.refresh(); };
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  const home = space === 'admin' ? '/admin' : '/studio';
  const label = space === 'admin' ? t('adminNav') : 'STUDIO';
  return (
    <div className={`studio studio-${space}${col ? ' col' : ''}`}>
      <aside className="studio-side">
        <button type="button" className="ms-toggle studio-toggle" onClick={toggle} aria-expanded={!col} aria-label={col ? t('msExpand') : t('msCollapse')} title={col ? t('msExpand') : t('msCollapse')}><ChevIco /><span>{t('msCollapse')}</span></button>
        <Link href={home} className="studio-brand" aria-label={`Mejliss TV ${label}`}>
          <img src="/brand/emblem.png" alt="" width="35" height="38" />
          <span><img src="/brand/wordmark.png" alt="Mejliss TV" width="78" height="16" /><b>{space === 'admin' ? 'ADMIN' : 'STUDIO'}</b></span>
        </Link>
        <nav className="studio-nav" aria-label={space === 'admin' ? t('adminNav') : t('studioNav')}>
          {groups.map((g) => (
            <div key={g.key} className="studio-group">
              {g.title && <div className="studio-group-title">{g.title}</div>}
              {g.items.map(([href, text, d, soon]) => (
                <Link key={href} href={href} title={col ? text : undefined} className={isOn(href) ? 'on' : ''} aria-current={isOn(href) ? 'page' : undefined}>
                  <Icon d={d} /><span>{text}</span>{soon && <em className="studio-soon">{soon}</em>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="studio-foot">
          {extra /* étape S3 : encart « Stockage » du Studio */}
          {links.map((l) => <Link key={l.href} href={l.href} className="studio-link" aria-label={l.label}><Icon d={l.icon} /><span>{l.label}</span></Link>)}
          <select value={locale} onChange={setLocale} aria-label={t('languageMenu')}>
            {Object.entries(LOCALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="studio-user">
            <span className="studio-avatar" aria-hidden="true">{initial}</span>
            <span className="studio-who"><b>{user.name || user.email}</b><small>{t('role_' + user.role)}</small></span>
            <button className="link studio-out" title={t('logout')} aria-label={t('logout')} onClick={() => { logout(); router.push('/'); }}><Icon d={ICONS.out} /></button>
          </div>
        </div>
      </aside>
      <div className="studio-main">{children}</div>
    </div>
  );
}
