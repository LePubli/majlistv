'use client';
// Espace de gestion (Studio + Administration) : menu latéral selon le rôle, contenu à droite.
// Sur mobile, le menu devient une barre en haut qui défile horizontalement.
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useApp } from './Providers';
import { LOCALES } from '../lib/i18n';

const ICONS = {
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
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
};
const Icon = ({ d }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

export default function StudioShell({ children }) {
  const { t, user, ready, logout, locale } = useApp();
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') || 'dashboard';

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  if (!ready || !user) return null;
  if (!['organizer', 'admin'].includes(user.role)) return <main className="card"><p>{t('noAccess')}</p></main>;

  const isAdmin = user.role === 'admin';
  const on = (href) => {
    if (href.startsWith('/admin')) {
      const want = new URL(href, 'http://x').searchParams.get('tab') || 'dashboard';
      return path === '/admin' && tab === want;
    }
    if (href === '/studio/series') return path.startsWith('/studio/series');
    if (href === '/studio/quiz') return path.startsWith('/studio/quiz');
    if (href === '/studio/books') return path.startsWith('/studio/books');
    if (href === '/studio/reminders') return path.startsWith('/studio/reminders');
    if (href === '/studio/stats') return path.startsWith('/studio/stats');
    return href === '/studio' ? path === '/studio' || (path.startsWith('/studio/') && path !== '/studio/new' && !path.startsWith('/studio/series') && !path.startsWith('/studio/quiz') && !path.startsWith('/studio/books') && !path.startsWith('/studio/reminders') && !path.startsWith('/studio/stats')) : path === href;
  };
  const groups = [
    { title: t('studioNav'), items: [['/studio', t('myTalks'), ICONS.list], ['/studio/new', t('newTalk'), ICONS.plus], ['/studio/series', t('srNav'), ICONS.layers], ['/studio/quiz', t('qzNav'), ICONS.check], ['/studio/books', t('bkNav'), ICONS.doc], ['/studio/reminders', t('rmNav'), ICONS.bell], ['/studio/stats', t('stNav'), ICONS.chart]] },
    ...(isAdmin ? [{ title: t('adminNav'), items: [
      ['/admin', t('admDashboard'), ICONS.dash], ['/admin?tab=users', t('admUsers'), ICONS.users],
      ['/admin?tab=stats', t('stNav'), ICONS.chart], ['/admin?tab=categories', t('admCategories'), ICONS.tag], ['/admin?tab=speakers', t('spTitle'), ICONS.users], ['/admin?tab=settings', t('admSettings'), ICONS.gear], ['/admin?tab=legal', t('admLegal'), ICONS.doc],
    ] }] : []),
  ];
  const setLocale = (e) => { document.cookie = `locale=${e.target.value};path=/;max-age=31536000;samesite=lax`; router.refresh(); };
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="studio">
      <aside className="studio-side">
        <Link href="/studio" className="studio-brand" aria-label="Mejliss TV Studio">
          <img src="/brand/emblem.png" alt="" width="35" height="38" />
          <span><img src="/brand/wordmark.png" alt="Mejliss TV" width="78" height="16" /><b>STUDIO</b></span>
        </Link>
        <nav className="studio-nav" aria-label={t('studioNav')}>
          {groups.map((g) => (
            <div key={g.title} className="studio-group">
              <div className="studio-group-title">{g.title}</div>
              {g.items.map(([href, label, d]) => (
                <Link key={href} href={href} className={on(href) ? 'on' : ''} aria-current={on(href) ? 'page' : undefined}>
                  <Icon d={d} /><span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="studio-foot">
          <Link href="/" className="studio-link"><Icon d={ICONS.eye} /><span>{t('viewSite')}</span></Link>
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
