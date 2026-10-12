'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';

const fill = (text, n) => text.replace('{n}', n);

// Page des formules : les montants viennent de Stripe (aucun prix écrit dans le code).
export default function Pricing() {
  const { t, locale, user, ready, call } = useApp();
  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [waiver, setWaiver] = useState(false);
  const canceled = useSearchParams().get('canceled');

  useEffect(() => { call('/billing/plans').then((r) => setInfo(r.ok ? r.data : { enabled: false, plans: [] })); }, [call]);
  useEffect(() => { if (user) call('/billing/status').then((r) => r.ok && setStatus(r.data)); }, [user, call]);

  const money = (p) => new Intl.NumberFormat(locale, { style: 'currency', currency: p.currency.toUpperCase(), minimumFractionDigits: p.amount % 100 ? 2 : 0 }).format(p.amount / 100);
  const go = async (path, body, key) => {
    setBusy(key); setErr('');
    const r = await call(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
    if (r.ok && r.data.url) { window.location.href = r.data.url; return; }
    setErr(r.data.error || t('errGeneric')); setBusy('');
  };

  if (!info || !ready) return null;
  const month = info.plans.find((p) => p.interval === 'month');
  const year = info.plans.find((p) => p.interval === 'year');
  const saving = month && year ? Math.round(100 - (year.amount / (month.amount * 12)) * 100) : 0;
  // Mois offerts par la formule annuelle (ex. 6,99 € × 12 = 83,88 € contre 69,99 € → 2 mois).
  const freeMonths = month && year ? Math.floor((month.amount * 12 - year.amount) / month.amount + 0.05) : 0;
  const active = status?.active;

  return (
    <main className="page pricing">
      <h1>{t('pricingTitle')}</h1>
      {canceled && <p className="meta">{t('billingCanceled')}</p>}
      {!info.enabled && <p className="soon">{t('billingUnavailable')}</p>}
      {info.enabled && info.trialDays > 0 && !active && <p className="meta">{fill(t('trialNote'), info.trialDays)}</p>}
      {err && <p className="error">{err}</p>}
      {info.enabled && (
        <div className="plans">
          {[['month', month], ['year', year]].filter(([, p]) => p).map(([interval, p]) => (
            <section key={interval} className={`plan ${interval === 'year' ? 'best' : ''}`}>
              <h2>{t(interval === 'year' ? 'yearly' : 'monthly')}</h2>
              <p className="price">{money(p)} <span>{t(interval === 'year' ? 'perYear' : 'perMonth')}</span></p>
              {interval === 'year' && freeMonths >= 1 && <p className="plan-save">{fill(t('freeMonths'), freeMonths)}</p>}
              {interval === 'year' && freeMonths < 1 && saving > 0 && <p className="plan-save">{fill(t('saveN'), saving)}</p>}
              {active ? (
                <button className="btn" disabled={busy !== ''} onClick={() => go('/billing/portal', null, 'portal')}>{t('manageSub')}</button>
              ) : user ? (
                <button className="btn" disabled={busy !== '' || !waiver} title={waiver ? undefined : t('waiverFirst')} onClick={() => go('/billing/checkout', { interval, waiver: true }, interval)}>
                  {info.trialDays > 0 ? fill(t('startTrial'), info.trialDays) : t('subscribe')}
                </button>
              ) : (
                <Link className="btn" href="/login">{t('loginToSubscribe')}</Link>
              )}
            </section>
          ))}
        </div>
      )}
      {info.enabled && user && !active && (
        <label className="waiver">
          <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} />
          <span>{t('waiverText')} <Link href="/legal/cgv" target="_blank">{t('legalTerms')}</Link></span>
        </label>
      )}
      {info.enabled && <p className="meta small">{t('pricingFooter')}</p>}
    </main>
  );
}
