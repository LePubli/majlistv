'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from './Providers';
import { LOCALES } from '../lib/i18n';

// En-tête Mejliss TV : emblème + logotype, navigation, langue, compte.
export default function Header() {
  const { appName, t, locale, user, ready, logout } = useApp();
  const router = useRouter();
  const path = usePathname();
  const setLocale = (e) => {
    document.cookie = `locale=${e.target.value};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };
  // Studio et administration ont leur propre menu (components/StudioShell.js).
  if (path.startsWith('/studio') || path.startsWith('/admin')) return null;
  const cur = (href) => (path === href || (href !== '/' && path.startsWith(href)) ? 'page' : undefined);
  return (
    <header className="header">
      <Link href="/" className="logo" aria-label={appName}>
        <img className="logo-emblem" src="/brand/emblem.png" alt="" width="37" height="40" />
        <img className="logo-word" src="/brand/wordmark.png" alt={appName} width="108" height="22" />
      </Link>
      <nav aria-label={t('mainNav')}>
        <Link href="/" aria-current={cur('/')}>{t('home')}</Link>
        <Link href="/pricing" aria-current={cur('/pricing')}>{t('pricing')}</Link>
        {ready && (user ? (
          <>
            {['organizer', 'admin'].includes(user.role) && <Link href="/studio">{t('studioNav')}</Link>}
            <Link href="/library" aria-current={cur('/library')}>{t('library')}</Link>
            {user.role === 'admin' && <Link href="/admin" aria-current={cur('/admin')}>{t('adminNav')}</Link>}
            <Link href="/account" aria-current={cur('/account')}>{t('account')}</Link>
            <button className="link" onClick={() => { logout(); router.push('/'); }}>{t('logout')}</button>
          </>
        ) : (
          <>
            <Link href="/login" aria-current={cur('/login')}>{t('login')}</Link>
            <Link href="/register" className="btn">{t('register')}</Link>
          </>
        ))}
        <select value={locale} onChange={setLocale} aria-label={t('languageMenu')}>
          {Object.entries(LOCALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </nav>
    </header>
  );
}
