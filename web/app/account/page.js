'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';

const date = (d, locale) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

function Billing() {
  const { t, locale, call } = useApp();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const justPaid = useSearchParams().get('billing') === 'success';

  // Après le paiement, l'activation arrive par webhook : on interroge quelques secondes.
  useEffect(() => {
    let n = 0;
    let timer;
    const tick = () => call('/billing/status').then((r) => {
      if (!r.ok) return;
      setSt(r.data);
      if (justPaid && !r.data.active && n++ < 10) timer = setTimeout(tick, 2000);
    });
    tick();
    return () => clearTimeout(timer);
  }, [call, justPaid]);

  const portal = async () => {
    setBusy(true);
    const r = await call('/billing/portal', { method: 'POST' });
    if (r.ok && r.data.url) window.location.href = r.data.url; else setBusy(false);
  };
  if (!st || !st.enabled) return null;
  const sub = st.subscription;
  let line = t('subNone');
  if (st.active && sub) {
    if (sub.status === 'trialing' && sub.trialEnd) line = `${t('subTrial')} ${date(sub.trialEnd, locale)}`;
    else if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) line = `${t('subEnds')} ${date(sub.currentPeriodEnd, locale)}`;
    else line = `${t('subActive')}${sub.currentPeriodEnd ? ` · ${t('subRenews')} ${date(sub.currentPeriodEnd, locale)}` : ''}`;
    if (sub.status === 'past_due') line += ` · ${t('subPastDue')}`;
  }
  return (
    <section className="billing">
      <h2>{t('subscription')}</h2>
      {justPaid && !st.active && <p className="meta">{t('billingSuccess')}</p>}
      <p><strong>{line}</strong></p>
      {sub ? <button className="btn" disabled={busy} onClick={portal}>{t('manageSub')}</button>
        : <Link className="btn" href="/pricing">{t('subscribe')}</Link>}
    </section>
  );
}

export default function Account() {
  const { user, ready, t } = useApp();
  const router = useRouter();
  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  if (!user) return null;
  return (
    <main className="card">
      <h1>{t('hello')} {user.name}</h1>
      <p>{user.email}</p>
      <p>{t('role')} : <strong>{user.role}</strong></p>
      <Suspense fallback={null}><Billing /></Suspense>
    </main>
  );
}
