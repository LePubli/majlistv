'use client';
// Étape C-2 — Administration → Ventes à l'unité : chiffres, liste des achats et locations, remboursement complet.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { saleMoney } from './SaleBox';

export default function SalesAdmin() {
  const { t, call, feat, locale } = useApp();
  const [status, setStatus] = useState('all');
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => call(`/admin/sales?status=${status}`).then((r) => setD(r.ok ? r.data : false)), [call, status]);
  useEffect(() => { if (feat('sales')) load(); }, [load, feat]);
  if (!feat('sales')) return <p className="meta">{t('saOff')} <Link className="link u" href="/admin?tab=features">{t('admFeatures')}</Link></p>;
  if (d === false) return <p className="error">{t('errGeneric')}</p>;
  if (!d) return <p className="meta">…</p>;
  const money = (c) => saleMoney(c, d.currency, locale);
  const date = (x) => (x ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(x)) : '—');
  const refund = async (p) => {
    if (!window.confirm(t('saRefundAsk').replace('{t}', p.title).replace('{m}', money(p.amount)))) return;
    const r = await call(`/admin/sales/${p.id}/refund`, { method: 'POST' });
    setMsg(r.ok ? { ok: true, text: t('saRefunded') } : { ok: false, text: r.data?.error || t('errGeneric') });
    load();
  };
  return (
    <section className="sa-admin">
      <div className="admin-cards">
        <div className="admin-card kpi"><strong>{money(d.totals.revenue)}</strong><span>{t('saRevenue')}</span></div>
        <div className="admin-card kpi"><strong>{money(d.totals.revenue30)}</strong><span>{t('saRevenue30')}</span></div>
        <div className="admin-card kpi"><strong>{d.totals.paid}</strong><span>{t('saPaid')}</span></div>
        <div className="admin-card kpi"><strong>{d.totals.refunded}</strong><span>{t('saRefundedN')}</span></div>
        <div className="admin-card kpi"><strong>{d.totals.offers}</strong><span>{t('saOffers')}</span></div>
      </div>
      <p className="meta small">{t('saHelp')}</p>
      <label className="fld inline"><span>{t('saFilter')}</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">{t('saAll')}</option><option value="paid">{t('saPaid')}</option><option value="refunded">{t('saRefundedN')}</option>
        </select>
      </label>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
      {d.items.length === 0 ? <p className="meta">{t('saEmpty')}</p> : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>{t('saDate')}</th><th>{t('saBuyer')}</th><th>{t('saItem')}</th><th>{t('saKind')}</th><th>{t('saAmount')}</th><th>{t('saState')}</th><th /></tr></thead>
            <tbody>
              {d.items.map((p) => (
                <tr key={p.id}>
                  <td>{date(p.paidAt)}</td>
                  <td><span dir="auto">{p.userName || '—'}</span><br /><span className="meta small">{p.email}</span></td>
                  <td><Link href={p.kind === 'talk' ? `/talks/${p.itemId}` : `/audyn/${p.itemId}`} dir="auto">{p.title}</Link></td>
                  <td>{p.kind === 'talk' ? '🎬' : '🎧'} {p.mode === 'buy' ? t('slBuy') : t('mpRent')}</td>
                  <td>{money(p.amount)}{p.memberPrice ? <span className="meta small"> · {t('seMembers')}</span> : null}</td>
                  <td>{p.status === 'refunded' ? `${t('mpRefunded')} ${date(p.refundedAt)}` : p.mode === 'rent' ? `${t('saUntil')} ${date(p.expiresAt)}` : t('slOwned')}</td>
                  <td>{p.status === 'paid' && <button type="button" className="btn ghost small" onClick={() => refund(p)}>{t('saRefund')}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
