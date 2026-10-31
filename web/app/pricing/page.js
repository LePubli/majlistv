'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';
import Steps from '../../components/Steps';
import { safePath, pricingPath, authPath } from '../../lib/nav';
import { COUNTRY_CODES, countryName, guessCountry } from '../../lib/countries';

const fill = (text, n) => text.replace('{n}', n);

// Page des formules : les montants viennent de Stripe (aucun prix écrit dans le code).
export default function Pricing() {
  const { t, locale, user, ready, call } = useApp();
  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [waiver, setWaiver] = useState(false);
  const [gifts, setGifts] = useState(false);
  const [country, setCountry] = useState(null); // null = pas encore lu (localStorage) ; '' = non choisi
  const qs = useSearchParams();
  const canceled = qs.get('canceled');
  const from = safePath(qs.get('from')); // page d'origine (ex. la conférence verrouillée)

  // Pays : dernier choix du membre, sinon pays de la langue du navigateur. Il ne sert qu'à choisir le tarif (groupes de Admin → Tarifs par pays).
  useEffect(() => {
    let c = '';
    try { c = localStorage.getItem('pay_country') || ''; } catch { /* stockage indisponible */ }
    setCountry(c || guessCountry());
  }, []);
  useEffect(() => {
    if (country === null) return;
    call(`/billing/plans${country ? `?country=${country}` : ''}`).then((r) => setInfo(r.ok ? r.data : { enabled: false, plans: [], methods: ['card'] }));
  }, [call, country]);
  const pickCountry = (e) => {
    setCountry(e.target.value);
    try { localStorage.setItem('pay_country', e.target.value); } catch { /* stockage indisponible */ }
  };
  useEffect(() => { call('/gifts/options', {}, null).then((r) => setGifts(Boolean(r.ok && r.data.enabled))); }, [call]);
  useEffect(() => { if (user) call('/billing/status').then((r) => r.ok && setStatus(r.data)); }, [user, call]);

  const money = (p) => new Intl.NumberFormat(locale, { style: 'currency', currency: p.currency.toUpperCase(), minimumFractionDigits: p.amount % 100 ? 2 : 0 }).format(p.amount / 100);
  const go = async (path, body, key) => {
    setBusy(key); setErr('');
    const r = await call(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
    if (r.ok && r.data.url) { window.location.href = r.data.url; return; }
    setErr(r.data.error || t('errGeneric')); setBusy('');
  };

  if (!info || !ready) return null;
  const active = status?.active;
  // Deux paliers : « Mejliss » (visionnage) et « Mejliss Apprentissage » (score, badges, courbe, attestations).
  const learnPlans = info.learning?.plans || [];
  const tiers = [
    { key: 'standard', title: t('tierStd'), tag: t('tierStdTag'), plans: info.plans, enabled: info.enabled, bullets: ['planB1', 'planB2', 'planB3', 'planB4'] },
    ...(learnPlans.length ? [{ key: 'learning', title: t('tierLearn'), tag: t('tierLearnTag'), plans: learnPlans, enabled: Boolean(info.learning?.enabled), bullets: ['planL0', 'planL1', 'planL2', 'planL3', 'planL4'] }] : []),
  ];
  const anyPlans = tiers.some((x) => x.plans.length > 0);

  return (
    <main className="page pricing">
      {from && <Link className="link small back" href={from}>← {t('backTo')}</Link>}
      {!active && <Steps current={user ? 2 : 1} t={t} />}
      <h1>{t('pricingTitle')}</h1>
      {canceled && <p className="meta">{t('billingCanceled')}</p>}
      {!info.enabled && <p className="soon">{anyPlans ? t('pricingSoon') : t('billingUnavailable')}</p>}
      {info.enabled && info.trialDays > 0 && !active && <p className="meta">{fill(t(info.trialNoCard ? 'trialNoCardNote' : 'trialNote'), info.trialDays)}</p>}
      {info.regionalPricing && (
        <p className="pay-country">
          <label>{t('payCountry')}{' '}
            <select value={country || ''} onChange={pickCountry}>
              <option value="">{t('payCountryPick')}</option>
              {COUNTRY_CODES.map((c) => [c, countryName(c, locale)]).sort((a, b) => a[1].localeCompare(b[1], locale)).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
          {info.region && <span className="meta small"> {fill(t('payRegionNote'), info.region.name)}</span>}
        </p>
      )}
      {err && <p className="error">{err}</p>}
      {tiers.map((tier) => {
        const month = tier.plans.find((p) => p.interval === 'month');
        const year = tier.plans.find((p) => p.interval === 'year');
        const saving = month && year ? Math.round(100 - (year.amount / (month.amount * 12)) * 100) : 0;
        // Mois offerts par la formule annuelle (ex. 6,99 € × 12 = 83,88 € contre 69,99 € → 2 mois).
        const freeMonths = month && year ? Math.floor((month.amount * 12 - year.amount) / month.amount + 0.05) : 0;
        if (!tier.plans.length) return null;
        const current = active && status?.tier === tier.key;
        return (
          <section key={tier.key} className={`tier tier-${tier.key}`} aria-labelledby={`tier-${tier.key}`}>
            <div className="tier-head">
              <h2 id={`tier-${tier.key}`}>{tier.title}</h2>
              {current && <span className="tier-current">{t('tierCurrent')}</span>}
            </div>
            <p className="meta tier-tag">{tier.tag}</p>
            <div className="plans">
              {[['month', month], ['year', year]].filter(([, p]) => p).map(([interval, p]) => (
                <section key={interval} className={`plan ${interval === 'year' ? 'best' : ''}`}>
                  <h3>{t(interval === 'year' ? 'yearly' : 'monthly')}</h3>
                  <p className="price">{money(p)} <span>{t(interval === 'year' ? 'perYear' : 'perMonth')}</span></p>
                  {interval === 'year' && freeMonths >= 1 && <p className="plan-save">{fill(t('freeMonths'), freeMonths)}</p>}
                  {interval === 'year' && freeMonths < 1 && saving > 0 && <p className="plan-save">{fill(t('saveN'), saving)}</p>}
                  <ul className="plan-list">{tier.bullets.map((k) => <li key={k}>{t(k)}</li>)}</ul>
                  {!tier.enabled ? (
                    <button className="btn" disabled>{t('soonBtn')}</button>
                  ) : active ? (
                    <button className="btn" disabled={busy !== ''} onClick={() => go('/billing/portal', null, 'portal')}>{current ? t('manageSub') : t('changePlan')}</button>
                  ) : user ? (
                    <button className="btn" disabled={busy !== '' || !waiver} title={waiver ? undefined : t('waiverFirst')} onClick={() => go('/billing/checkout', { interval, tier: tier.key, waiver: true, ...(from ? { returnTo: from } : {}), ...(info.regionalPricing && country ? { country } : {}) }, `${tier.key}-${interval}`)}>
                      {info.trialDays > 0 ? fill(t('startTrial'), info.trialDays) : t('subscribe')}
                    </button>
                  ) : (
                    <Link className="btn" href={authPath('register', pricingPath(from))}>{info.trialDays > 0 ? fill(t('startTrial'), info.trialDays) : t('register')}</Link>
                  )}
                </section>
              ))}
            </div>
          </section>
        );
      })}
      {anyPlans && (
        <p className="pay-methods" aria-label={t('payMethods')}>
          <span>{t('payMethods')}</span>
          <span className="pay-chip">{t('payCard')}</span>
          {info.wallets && <span className="pay-chip">Apple Pay</span>}
          {info.wallets && <span className="pay-chip">Google Pay</span>}
          {(info.methods || []).includes('paypal') && <span className="pay-chip">PayPal</span>}
          {(info.methods || []).includes('sepa_debit') && <span className="pay-chip">{t('paySepa')}</span>}
          {(info.methods || []).includes('bancontact') && <span className="pay-chip">Bancontact</span>}
          {(info.methods || []).includes('ideal') && <span className="pay-chip">iDEAL</span>}
          {(info.methods || []).includes('link') && <span className="pay-chip">Link</span>}
        </p>
      )}
      {info.enabled && user && !active && (
        <label className="waiver">
          <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} />
          <span>{t('waiverText')} <Link href="/legal/cgv" target="_blank">{t('legalTerms')}</Link></span>
        </label>
      )}
      {info.enabled && !user && <p className="meta small"><Link className="link u" href={authPath('login', pricingPath(from))}>{t('haveAccount')}</Link></p>}
      {gifts && <p className="gf-offer"><Link className="btn ghost" href="/gift">🎁 {t('gfOffer')}</Link></p>}
      {anyPlans && <p className="meta small">{t('pricingFooter')}</p>}
    </main>
  );
}
