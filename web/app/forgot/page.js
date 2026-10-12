'use client';
// Mot de passe oublié : envoie un lien de réinitialisation (réponse identique que le compte existe ou non).
import { useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';

export default function Forgot() {
  const { t, call } = useApp();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await call('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }, null);
    setBusy(false);
    if (r.ok) setSent(true); else setErr(r.status === 429 ? t('errTooMany') : t('errGeneric'));
  };
  return (
    <main className="card">
      <h1>{t('forgotTitle')}</h1>
      {sent ? (
        <>
          <p>{t('forgotSent')}</p>
          <Link href="/login">{t('backToLogin')}</Link>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="meta">{t('forgotHelp')}</p>
          <label>{t('email')}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {err && <p className="error">{err}</p>}
          <button className="btn" disabled={busy}>{t('forgotSend')}</button>
          <Link href="/login" className="small">{t('backToLogin')}</Link>
        </form>
      )}
    </main>
  );
}
