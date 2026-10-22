'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';
import Steps from '../../components/Steps';
import EmailPrefs from '../../components/EmailPrefs';
import MyGifts from '../../components/MyGifts';
import PrayerSettings from '../../components/PrayerSettings';
import { safePath } from '../../lib/nav';
import Crumbs from '../../components/Crumbs';
import { TabBar, TabPanel, useTab } from '../../components/Tabs';
import { LOCALES } from '../../lib/i18n';

const date = (d, locale) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

function Billing() {
  const { t, locale, call } = useApp();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const qs = useSearchParams();
  const justPaid = qs.get('billing') === 'success';
  const back = safePath(qs.get('next')); // conférence qui a donné envie de s'abonner

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
  let line = st.complimentaryUntil ? `${t('subEnds')} ${date(st.complimentaryUntil, locale)} (offert)` : t('subNone');
  if (st.active && sub) {
    if (sub.status === 'trialing' && sub.trialEnd) line = `${t('subTrial')} ${date(sub.trialEnd, locale)}`;
    else if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) line = `${t('subEnds')} ${date(sub.currentPeriodEnd, locale)}`;
    else line = `${t('subActive')}${sub.currentPeriodEnd ? ` · ${t('subRenews')} ${date(sub.currentPeriodEnd, locale)}` : ''}`;
    if (sub.status === 'past_due') line += ` · ${t('subPastDue')}`;
  }
  return (
    <section className="billing">
      <h2>{t('subscription')}</h2>
      {justPaid && <Steps current={st.active ? 4 : 3} t={t} />}
      {justPaid && !st.active && <p className="meta">{t('billingSuccess')}</p>}
      {justPaid && back && <Link className="btn btn-lg resume-btn" href={back}>▶ {t('resumeTalk')}</Link>}
      <p><strong>{line}</strong></p>
      {st.active && st.tier && <p className="meta">{t('tierYours')} : <b>{st.tier === 'learning' ? t('tierLearn') : t('tierStd')}</b>{st.learning && <> · <Link className="link u" href="/learning">{t('lrOpen')}</Link></>}</p>}
      {sub ? <button className="btn" disabled={busy} onClick={portal}>{t('manageSub')}</button>
        : <Link className="btn" href="/pricing">{t('subscribe')}</Link>}
    </section>
  );
}

export default function Account() {
  const { user, ready, t, feat, locale } = useApp();
  const router = useRouter();
  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  const tabs = [
    { id: 'profile', label: t('tbProfile') },
    { id: 'billing', label: t('tbSub') },
    { id: 'emails', label: t('tbMails') },
    ...(feat('prayer') ? [{ id: 'prayer', label: t('pryTabLabel') }] : []),
    ...(feat('gifts') ? [{ id: 'gifts', label: t('tbGifts') }] : []),
  ];
  const qs = useSearchParams();
  const [tab, go] = useTab(tabs, qs.get('billing') ? 'billing' : undefined); // retour du paiement : on arrive sur Abonnement
  if (!user) return null;
  const setLocale = (e) => { document.cookie = `locale=${e.target.value};path=/;max-age=31536000;samesite=lax`; router.refresh(); };
  return (
    <main className="page acct">
      <Crumbs items={[[null, t('msAccount')], [null, t('acSpace')]]} />
      <h1>{t('hello')} {user.name}</h1>
      <div className="tabs-layout">
        <TabBar tabs={tabs} current={tab} onChange={go} label={t('tbLabel')} vertical />
        <div className="tabs-body">
          <TabPanel id="profile" current={tab}>
            <section className="card-lite">
              <p>{user.email}</p>
              <p>{t('role')} : <strong>{user.role}</strong></p>
              <p><Link href="/welcome?edit=1">{t('myPrefs')}</Link></p>
              <label className="fld"><span>{t('acLang')}</span>
                <select value={locale} onChange={setLocale}>{Object.entries(LOCALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <p className="meta small">{t('acLangHelp')}</p>
            </section>
          </TabPanel>
          <TabPanel id="billing" current={tab}><Suspense fallback={null}><Billing /></Suspense></TabPanel>
          <TabPanel id="emails" current={tab}><EmailPrefs /></TabPanel>
          <TabPanel id="prayer" current={tab}><PrayerSettings /></TabPanel>
          <TabPanel id="gifts" current={tab}>
            <MyGifts />
            <p className="gf-links"><Link className="link u" href="/gift">{t('gfOffer')}</Link> · <Link className="link u" href="/redeem">{t('gfRedeemLink')}</Link></p>
          </TabPanel>
        </div>
      </div>
    </main>
  );
}
