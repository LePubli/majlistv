'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from './Providers';
import { safePath } from '../lib/nav';

// Formulaire partagé : mode = 'login' ou 'register'.
export default function AuthForm({ mode }) {
  const { t, locale, call, login, trialDays } = useApp();
  const router = useRouter();
  // ?next=/chemin : retour à la page d'où l'on vient (chemin du site uniquement, jamais un lien externe).
  const qs = useSearchParams();
  const isReg = mode === 'register';
  // Après une inscription on passe par l'accueil (/welcome), puis vers la formule si un essai est proposé.
  const next = safePath(qs.get('next'), isReg ? (trialDays > 0 ? '/pricing' : '/') : '/account');
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const body = isReg ? { email: f.email, password: f.password, locale } : { email: f.email, password: f.password };
    const r = await call(isReg ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(body) }, null);
    setBusy(false);
    if (r.ok) { login(r.data.token, r.data.user); router.push(isReg ? `/welcome?next=${encodeURIComponent(next)}` : next); return; }
    setErr(r.status === 401 ? t('errInvalid') : r.status === 409 ? t('errExists') : t('errGeneric'));
  };

  return (
    <main className="card">
      <h1>{isReg ? t('register') : t('login')}</h1>
      <form onSubmit={submit}>
        <label>{t('email')}<input type="email" required value={f.email} onChange={set('email')} /></label>
        <label>{t('password')}<input type="password" required minLength={8} value={f.password} onChange={set('password')} /></label>
        {err && <p className="error">{err}</p>}
        {isReg && <p className="meta small">{t('registerLegal')} <Link href="/legal/cgv">{t('legalTerms')}</Link> · <Link href="/legal/confidentialite">{t('legalPrivacy')}</Link></p>}
        <button className="btn" disabled={busy}>{t('submit')}</button>
        {!isReg && <Link href="/forgot" className="small">{t('forgotLink')}</Link>}
        {isReg && <Link href={`/login?next=${encodeURIComponent(next)}`} className="small">{t('haveAccount')}</Link>}
      </form>
    </main>
  );
}
