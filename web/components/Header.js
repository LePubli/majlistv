'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from './Providers';
import { LOCALES } from '../lib/i18n';

export default function Header() {
  const { appName, t, locale, user, ready, logout } = useApp();
  const router = useRouter();
  const setLocale = (e) => {
    document.cookie = `locale=${e.target.value};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };
  return (
    <header className="header">
      <Link href="/" className="logo">{appName}</Link>
      <nav>
        <select value={locale} onChange={setLocale} aria-label="Language">
          {Object.entries(LOCALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Link href="/pricing">{t('pricing')}</Link>
        {ready && (user ? (
          <>
            {['organizer', 'admin'].includes(user.role) && <Link href="/organizer">{t('myTalks')}</Link>}
            <Link href="/account">{t('account')}</Link>
            <button className="link" onClick={() => { logout(); router.push('/'); }}>{t('logout')}</button>
          </>
        ) : (
          <>
            <Link href="/login">{t('login')}</Link>
            <Link href="/register" className="btn">{t('register')}</Link>
          </>
        ))}
      </nav>
    </header>
  );
}
