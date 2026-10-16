'use client';
// Étape 21 — Activer une carte cadeau avec son code (page non indexée ; le lien reçu par e-mail préremplit le code).
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import { authPath } from '../../../lib/nav';

function Redeem() {
  const { t, locale, user, ready, call } = useApp();
  const qs = useSearchParams();
  const initial = (qs.get('code') || '').slice(0, 20);
  const [code, setCode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  useEffect(() => { setCode(initial); }, [initial]);
  if (!ready) return null;
  const here = `/redeem${initial ? `?code=${encodeURIComponent(initial)}` : ''}`;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await call('/gifts/redeem', { method: 'POST', body: JSON.stringify({ code }) });
    if (r.ok) setDone(r.data); else setErr(r.data?.error || t('errGeneric'));
    setBusy(false);
  };
  const until = done && new Date(done.premiumUntil).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <main className="page gf-page">
      <meta name="robots" content="noindex" />
      <h1>{t('rdTitle')}</h1>
      {done ? (
        <>
          <p className="soon" role="status">{t('rdOk').replace('{date}', until)}</p>
          {done.hasSubscription && <p className="meta">{t('rdSub')}</p>}
          <p><Link className="btn" href="/">{t('rdWatch')}</Link></p>
        </>
      ) : !user ? (
        <>
          <p className="th-lead">{t('rdLogin')}</p>
          <p className="gf-actions"><Link className="btn" href={authPath('login', here)}>{t('login')}</Link> <Link className="btn ghost" href={authPath('register', here)}>{t('register')}</Link></p>
        </>
      ) : (
        <form onSubmit={submit} className="gf-form">
          <p className="th-lead">{t('rdLead')}</p>
          <label className="fld"><span>{t('rdCode')}</span>
            <input value={code} dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} placeholder="ABCD-EFGH-JKLM" onChange={(e) => setCode(e.target.value)} />
          </label>
          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn btn-lg" disabled={busy || code.replace(/[^a-z0-9]/gi, '').length < 12}>{t('rdBtn')}</button>
        </form>
      )}
    </main>
  );
}

export default function RedeemPage() { return <Suspense fallback={null}><Redeem /></Suspense>; }
