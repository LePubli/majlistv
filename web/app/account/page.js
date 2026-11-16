'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';
import Steps from '../../components/Steps';
import EmailPrefs from '../../components/EmailPrefs';
import MyGifts from '../../components/MyGifts';
import MyPurchases from '../../components/MyPurchases'; // étape C-2
import MyReferral from '../../components/MyReferral';
import MyData from '../../components/MyData';
import TwoFactor from '../../components/TwoFactor';
import { safePath } from '../../lib/nav';
import Crumbs from '../../components/Crumbs';
import { TabBar, TabPanel, useTab, useScrollToSec } from '../../components/Tabs';

// Étape N5 (16/11) : 3 onglets — Profil (avec sécurité et mes données) · Abonnement et achats · Notifications.
// Les réglages de la prière sont sur la page Prière. Anciens onglets → [nouvel onglet, section].
export const LEGACY_TABS = {
  emails: ['notifs'], security: ['profile', 'security'], data: ['profile', 'data'],
  purchases: ['billing', 'purchases'], gifts: ['billing', 'gifts'], referral: ['billing', 'referral'],
};
import { LOCALES } from '../../lib/locales';

const date = (d, locale) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

function Billing() {
  const { t, locale, call } = useApp();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const qs = useSearchParams();
  const justPaid = qs.get('billing') === 'success';
  const back = safePath(qs.get('next')); // vidéo qui a donné envie de s'abonner

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
    { id: 'billing', label: t('acTabBilling') },
    { id: 'notifs', label: t('msNotif') },
  ];
  const qs = useSearchParams();
  const [tab, go, sec] = useTab(tabs, qs.get('billing') ? 'billing' : undefined, LEGACY_TABS); // retour du paiement : on arrive sur Abonnement
  useScrollToSec(sec, Boolean(user));
  const wantPrayer = qs.get('tab') === 'prayer';
  useEffect(() => { if (wantPrayer) router.replace('/priere?tab=settings'); }, [wantPrayer, router]);
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
            <section className="card-lite acct-sec" id="sec-profile">
              <p>{user.email}</p>
              <p>{t('role')} : <strong>{user.role}</strong></p>
              <p><Link href="/welcome?edit=1">{t('myPrefs')}</Link></p>
              <label className="fld"><span>{t('acLang')}</span>
                <select value={locale} onChange={setLocale}>{Object.entries(LOCALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <p className="meta small">{t('acLangHelp')}</p>
              {feat('prayer') && <p className="acct-prayer-link"><Link className="link u" href="/priere?tab=settings">{t('acPrayerLink')}</Link></p>}
            </section>
            <div className="acct-sec" id="sec-security"><TwoFactor /></div>
            <div className="acct-sec" id="sec-data"><MyData /></div>
          </TabPanel>
          <TabPanel id="billing" current={tab}>
            <div className="acct-sec" id="sec-sub"><Suspense fallback={null}><Billing /></Suspense></div>
            {feat('sales') && <section className="acct-sec" id="sec-purchases"><h2>{t('mpTitle')}</h2><MyPurchases /></section>}
            {feat('gifts') && (
              <div className="acct-sec" id="sec-gifts">
                <MyGifts />
                <p className="gf-links"><Link className="link u" href="/gift">{t('gfOffer')}</Link> · <Link className="link u" href="/redeem">{t('gfRedeemLink')}</Link></p>
              </div>
            )}
            {feat('referral') && <div className="acct-sec" id="sec-referral"><MyReferral /></div>}
          </TabPanel>
          <TabPanel id="notifs" current={tab}><EmailPrefs /></TabPanel>
        </div>
      </div>
    </main>
  );
}
