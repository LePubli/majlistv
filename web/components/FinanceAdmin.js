'use client';
// Administration → « Revenus & abonnements » : ce qui est réellement encaissé (abonnements, ventes à l'unité, cartes cadeaux).
// Données : GET /admin/finance. Rien n'est inventé : pas de « partenariats », pas de revenu récurrent annuel, pas de prévision.
import { useEffect, useState } from 'react';
import { useApp } from './Providers';
import { saleMoney } from './SaleBox';
import { Page, Metrics, Panel, Cols, Table, Badge, Meta, Donut, Line, c } from './backoffice/Kit';

const delta = (cur, prev) => {
  if (!prev) return cur > 0 ? '↗' : '';
  const p = Math.round((100 * (cur - prev)) / prev);
  return p === 0 ? '0 %' : `${p > 0 ? '↗ +' : '↘ '}${p} %`;
};

export default function FinanceAdmin() {
  const { t, call, locale, skin } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => { call('/admin/finance').then((r) => setD(r.ok ? r.data : false)); }, [call]);
  if (d === false) return <p className="error">{t('errGeneric')}</p>;
  if (!d) return <p className="meta">…</p>;

  const money = (cents) => saleMoney(Math.round(cents || 0), d.currency, locale);
  const dateFmt = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' });
  const T = d.totals;
  const S = d.subscribers;
  const KIND = { subscription: t('fnSrcSubs'), sale: t('fnSrcSales'), gift: t('fnSrcGifts') };
  const stateBadge = (s) => (s === 'refunded' ? <Badge tone="amber">{t('fnRefunded')}</Badge> : s === 'partial' ? <Badge tone="amber">{t('fnPartial')}</Badge> : <Badge tone="green">{t('fnPaid')}</Badge>);
  const labels = d.series.map((r) => monthFmt.format(new Date(r.month + '-01T12:00:00')));
  const totals = d.series.map((r) => (r.subscriptions + r.sales + r.gifts) / 100);
  const share = T.all > 0 ? Math.round((100 * T.subscriptions) / T.all) : 0;
  const sources = [[t('fnSrcSubs'), T.subscriptions], [t('fnSrcSales'), T.sales], [t('fnSrcGifts'), T.gifts]];
  const noHistory = d.invoicesRecorded.count === 0;
  const notes = [
    noHistory ? t('fnNoHistory') : t('fnSince').replace('{d}', dateFmt.format(new Date(d.invoicesRecorded.since))),
    t('fnTaxNote'),
    d.otherCurrencyCount > 0 ? t('fnOtherCur').replace('{n}', d.otherCurrencyCount) : null,
  ].filter(Boolean);
  const txRows = d.transactions.map((x) => [
    <code key="r" className={c('ax-code')}>{x.ref.length > 16 ? `${x.ref.slice(0, 16)}…` : x.ref}</code>,
    <span key="a" dir="auto">{x.account || '—'}</span>,
    KIND[x.kind],
    money(x.amount),
    dateFmt.format(new Date(x.at)),
    stateBadge(x.state),
  ]);
  const heads = [t('fnColRef'), t('fnColAccount'), t('fnColType'), t('fnColAmount'), t('fnColDate'), t('fnColState')];

  if (skin !== 'premium') {
    return (
      <section>
        <div className="admin-cards">
          <div className="admin-card kpi"><strong>{money(T.last30)}</strong><span>{t('fnRev30')}</span></div>
          <div className="admin-card kpi"><strong>{d.mrr ? money(d.mrr.amount) : '—'}</strong><span>{t('fnMrr')}</span></div>
          <div className="admin-card kpi"><strong>{S.paying}</strong><span>{t('fnPaying')}</span></div>
          <div className="admin-card kpi"><strong>{S.pastDue}</strong><span>{t('fnLate')}</span></div>
        </div>
        <h2>{t('fnTx')}</h2>
        {txRows.length === 0 ? <p className="meta">{t('fnNoTx')}</p> : (
          <div className="st-tablewrap"><table className="st-table"><thead><tr>{heads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{txRows.map((r, i) => <tr key={i}>{r.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>
        )}
        {notes.map((n) => <p key={n} className="meta small">{n}</p>)}
      </section>
    );
  }

  return (
    <Page title={t('fnTitle')} sub={t('fnSub')}>
      <Metrics items={[
        { icon: 'wallet', tone: 'green', label: t('fnRev30'), value: money(T.last30), note: delta(T.last30, T.prev30) },
        { icon: 'chart', label: t('fnMrr'), value: d.mrr ? money(d.mrr.amount) : '—', note: d.mrr ? t('fnMrrNote') : t('fnMrrOff') },
        { icon: 'users', tone: 'green', label: t('fnPaying'), value: S.paying, note: `${S.trialing} ${t('fnTrialing').toLowerCase()}` },
        { icon: 'clock', tone: S.pastDue ? 'amber' : 'blue', label: t('fnLate'), value: S.pastDue, note: S.pastDue ? t('fnLateSome') : t('fnLateNone') },
      ]} />
      <Cols kind="two-main">
        <Panel title={t('fnChart')}>
          {T.all > 0 ? <Line values={totals} labels={labels} unit={` ${d.currency === 'eur' ? '€' : d.currency.toUpperCase()}`} /> : <p style={{ padding: 14, color: 'var(--muted)' }}>{t('fnNoTx')}</p>}
        </Panel>
        <Panel title={t('fnSplit')}>
          <div className={c('donut-wrap')} style={{ padding: 14 }}>
            <Donut value={share} label={`${share} %`} sub={t('fnSrcSubs')} />
            <div>{sources.map(([l, v]) => <p key={l}>● {l} — {money(v)}</p>)}<p><b>{t('fnAll12')} — {money(T.all)}</b></p></div>
          </div>
        </Panel>
      </Cols>
      <Cols kind="two-main">
        <Panel title={t('fnTx')}><Table headers={heads} rows={txRows} empty={t('fnNoTx')} /></Panel>
        <Panel title={t('fnSubsPanel')}>
          <Meta items={[[t('fnMonthly'), S.monthly], [t('fnYearly'), S.yearly], [t('fnTrialing'), S.trialing], [t('fnCancelling'), S.cancelling]]} />
          <div style={{ padding: '0 14px 14px', display: 'grid', gap: 6 }}>{notes.map((n) => <p key={n} style={{ color: 'var(--muted)', fontSize: 12 }}>{n}</p>)}</div>
        </Panel>
      </Cols>
    </Page>
  );
}
