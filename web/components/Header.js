'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { KidsWord } from './KidsBanner';
import { useApp } from './Providers';
import { AVATAR_EMOJI } from '../lib/kids';
import { LOCALES } from '../lib/i18n';

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

function MainHeader() {
  const { appName, t, locale, user, ready, logout, hasSeries, hasBooks } = useApp();
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
        {hasSeries && <Link href="/series" aria-current={cur('/series')}>{t('seriesNav')}</Link>}
        {hasBooks && <Link href="/books" aria-current={cur('/books')}>{t('bkNav')}</Link>}
        <Link href="/pricing" aria-current={cur('/pricing')}>{t('pricing')}</Link>
        {ready && (user ? (
          <>
            {['organizer', 'admin'].includes(user.role) && <Link href="/studio">{t('studioNav')}</Link>}
            <Link href="/library" aria-current={cur('/library')}>{t('library')}</Link>
            <Link href="/learning" aria-current={cur('/learning')}>{t('lrNav')}</Link>
            <Link href="/kids" aria-current={cur('/kids')}>{t('kdNav')}</Link>
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
