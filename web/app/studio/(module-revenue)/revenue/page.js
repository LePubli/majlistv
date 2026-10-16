'use client';
// Studio → Revenus (étape D) : estimation du mois en cours et relevés des mois clôturés, pour les chaînes de l'organisateur.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../../components/Providers';

export default function StudioRevenue() {
  const { t, call, user, locale } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => { if (user) call('/studio/revenue').then((r) => setD(r.ok ? r.data : { error: true })); }, [user, call]);
  if (!d) return null;
  if (d.error) return <main className="studio-page"><p className="error">{t('errGeneric')}</p></main>;
  const nf = new Intl.NumberFormat(locale, { style: 'currency', currency: d.currency.toUpperCase() });
  const money = (c) => nf.format(c / 100);
  const hours = (s) => (s / 3600).toLocaleString(locale, { maximumFractionDigits: 1 });
  const monthLabel = (m) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const total = d.estimate.reduce((a, e) => a + (e.amountCents || 0), 0);
  return (
    <main className="studio-page rv-page">
      <h1>{t('rvTitle')}</h1>
      <p className="meta">{t('rvIntro').replace('{p}', d.sharePct)}</p>
      {d.channels === 0 && <p className="soon">{t('rvNoChannel')} <Link className="link u" href="/studio/channel">{t('chNav')}</Link></p>}
      {d.channels > 0 && (
        <>
          <section className="rv-cards" aria-label={t('rvThisMonth')}>
            <div className="rv-card"><span className="meta">{t('rvThisMonth')} · {monthLabel(d.month)}</span>
              <strong>{d.showEstimate ? money(total) : `${hours(d.estimate.reduce((a, e) => a + e.seconds, 0))} h`}</strong>
              <small className="meta">{d.showEstimate ? t('rvEstimate') : t('rvHoursOnly')}</small></div>
            <div className="rv-card"><span className="meta">{t('rvCarried')}</span><strong>{money(d.carriedCents)}</strong>
              <small className="meta">{t('rvMin').replace('{m}', money(d.minPayoutCents))}</small></div>
          </section>
          <h2>{t('rvByChannel')}</h2>
          {d.estimate.length === 0 ? <p className="soon">{t('rvNoWatch')}</p> : (
            <div className="st-tablewrap"><table className="st-table">
              <thead><tr><th>{t('rvChannel')}</th><th>{t('rvHours')}</th>{d.showEstimate && <th>{t('rvAmount')}</th>}</tr></thead>
              <tbody>{d.estimate.map((e) => <tr key={e.slug}><td>{e.name}</td><td>{hours(e.seconds)}</td>{d.showEstimate && <td>{money(e.amountCents)}</td>}</tr>)}</tbody>
            </table></div>
          )}
        </>
      )}
      <h2>{t('rvHistory')}</h2>
      {d.history.length === 0 ? <p className="soon">{t('rvNoHistory')}</p> : (
        <div className="st-tablewrap"><table className="st-table">
          <thead><tr><th>{t('rvMonth')}</th><th>{t('rvChannel')}</th><th>{t('rvHours')}</th><th>{t('rvEarned')}</th><th>{t('rvTotal')}</th><th>{t('rvStatus')}</th></tr></thead>
          <tbody>{d.history.map((h) => (
            <tr key={h.month + h.slug}><td>{monthLabel(h.month)}</td><td>{h.name}</td><td>{hours(h.seconds)}</td><td>{money(h.amountCents)}</td>
              <td>{money(h.amountCents + h.carriedInCents)}</td><td><span className={`rv-st rv-${h.status}`}>{t('rvSt_' + h.status)}</span></td></tr>
          ))}</tbody>
        </table></div>
      )}
      <p className="meta rv-note">{t('rvNote')}</p>
    </main>
  );
}
