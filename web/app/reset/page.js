'use client';
// Nouveau mot de passe depuis le lien reçu par e-mail (valable 1 heure, une seule fois).
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';

function ResetForm() {
  const { t, call } = useApp();
  const token = useSearchParams().get('token') || '';
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (pwd !== pwd2) { setErr(t('pwdMismatch')); return; }
    setBusy(true); setErr('');
    const r = await call('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password: pwd }) }, null);
    setBusy(false);
    if (r.ok) setDone(true); else setErr(r.status === 400 ? t('resetInvalid') : t('errGeneric'));
  };
  if (done) return (<><p>{t('resetDone')}</p><Link className="btn" href="/login">{t('login')}</Link></>);
  if (!token) return <p className="error">{t('resetInvalid')}</p>;
  return (
    <form onSubmit={submit}>
      <label>{t('newPassword')}<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></label>
      <label>{t('confirmPassword')}<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} /></label>
      {err && <p className="error">{err} {err === t('resetInvalid') && <Link href="/forgot">{t('forgotAgain')}</Link>}</p>}
      <button className="btn" disabled={busy}>{t('submit')}</button>
    </form>
  );
}

export default function Reset() {
  const { t } = useApp();
  return (
    <main className="card">
      <h1>{t('resetTitle')}</h1>
      <Suspense fallback={null}><ResetForm /></Suspense>
    </main>
  );
}
