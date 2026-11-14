'use client';
// Étape C-2 — Mon compte → Mes achats : contenus achetés (pour toujours) ou loués (jusqu'à une date), remboursés.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { saleMoney } from './SaleBox';

export default function MyPurchases() {
  const { t, call, locale } = useApp();
  const [list, setList] = useState(null);
  useEffect(() => { call('/me/purchases').then((r) => setList(r.ok ? r.data : [])); }, [call]);
  if (!list) return <p className="meta">…</p>;
  if (!list.length) return <p className="meta">{t('mpEmpty')}</p>;
  const date = (d, time) => new Intl.DateTimeFormat(locale, time ? { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));
  const state = (p) => {
    if (p.status === 'refunded') return t('mpRefunded');
    if (p.mode === 'buy') return t('slOwned');
    return p.active ? t('slRentedUntil').replace('{d}', date(p.expiresAt, true)) : t('mpRentEnded');
  };
  return (
    <ul className="mp-list">
      {list.map((p) => (
        <li key={p.id} className={p.active ? 'on' : ''}>
          <span className="mp-kind" aria-hidden="true">{p.kind === 'talk' ? '🎬' : '🎧'}</span>
          <span className="mp-main">
            {p.active ? <Link href={p.kind === 'talk' ? `/talks/${p.itemId}` : `/audyn/${p.itemId}`}>{p.title}</Link> : <span>{p.title}</span>}
            <span className="meta small">{p.mode === 'buy' ? t('slBuy') : t('mpRent')} · {saleMoney(p.amount, p.currency, locale)} · {p.paidAt ? date(p.paidAt) : ''}</span>
          </span>
          <span className={`mp-state${p.active ? ' ok' : ''}`}>{state(p)}</span>
        </li>
      ))}
    </ul>
  );
}
