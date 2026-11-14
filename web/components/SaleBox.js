'use client';
// Étape C-2 — Contenu payant à l'unité (vidéo ou Audyn) : encart « Acheter / Louer » à la place de l'invitation à s'abonner,
// ou pastille « Acheté » / « Loué jusqu'au … » quand la personne y a déjà accès.
// Après le paiement (retour de Stripe avec ?paid=1), l'accès est confirmé par le webhook : on relit la fiche quelques fois.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from './Providers';

export const saleMoney = (cents, currency, locale) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: String(currency || 'eur').toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format((cents || 0) / 100);

/** Libellé de durée de location : « 48 h », « 3 jours ». */
export const rentLabel = (hours, t) => (hours >= 48 && hours % 24 === 0 ? t('slDays').replace('{n}', hours / 24) : t('slHours').replace('{n}', hours));

/** Pastille d'accès : achat (pour toujours) ou location (date et heure de fin). */
export function SaleOwned({ sale }) {
  const { t, locale } = useApp();
  if (!sale?.owned) return null;
  if (sale.owned.mode === 'buy') return <span className="sale-owned">✓ {t('slOwned')}</span>;
  const until = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(sale.owned.expiresAt));
  return <span className="sale-owned rent">⏳ {t('slRentedUntil').replace('{d}', until)}</span>;
}

export default function SaleBox({ kind, id, sale, onPaid, next }) {
  const { t, locale, user, call } = useApp();
  const qs = useSearchParams();
  const paid = qs.get('paid') === '1';
  const canceled = qs.get('canceled') === '1';
  const [mode, setMode] = useState(sale?.buy ? 'buy' : 'rent');
  const [terms, setTerms] = useState(false);
  const [text, setText] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tries, setTries] = useState(0);
  useEffect(() => { call('/sales/terms', {}, null).then((r) => r.ok && setText(r.data.text)); }, [call]);
  // Retour de Stripe : le paiement est confirmé par Stripe quelques secondes plus tard ; on relit la fiche (10 fois au plus).
  useEffect(() => {
    if (!paid || sale?.owned || tries >= 10 || !onPaid) return undefined;
    const h = setTimeout(() => { onPaid(); setTries((n) => n + 1); }, 3000);
    return () => clearTimeout(h);
  }, [paid, sale?.owned, tries, onPaid]);
  if (!sale || sale.owned) return null;
  const opt = mode === 'buy' ? sale.buy : sale.rent;
  const money = (c) => saleMoney(c, sale.currency, locale);
  const back = next || (kind === 'talk' ? `/talks/${id}` : `/audyn/${id}`);
  const pay = async () => {
    setBusy(true); setErr('');
    const r = await call('/sales/checkout', { method: 'POST', body: JSON.stringify({ kind, id, mode, terms }) });
    if (r.ok && r.data.url) { window.location.href = r.data.url; return; }
    setErr(r.data?.error || t('errGeneric')); setBusy(false);
  };
  const option = (m, o) => (
    <label key={m} className={`sale-opt${mode === m ? ' on' : ''}`}>
      <input type="radio" name={`sale-${id}`} checked={mode === m} onChange={() => setMode(m)} />
      <span className="sale-opt-t">{m === 'buy' ? t('slBuy') : t('slRent').replace('{d}', rentLabel(o.hours, t))}</span>
      <span className="sale-opt-p">
        {o.yourPrice !== o.price && <s>{money(o.price)}</s>} <strong>{money(o.yourPrice)}</strong>
      </span>
      <span className="sale-opt-h">{m === 'buy' ? t('slBuyHelp') : t('slRentHelp').replace('{d}', rentLabel(o.hours, t))}</span>
    </label>
  );
  const memberHint = !sale.member && sale.memberDiscountPct > 0;
  return (
    <section className="lock sale-box" aria-labelledby={`sale-h-${id}`}>
      <h2 id={`sale-h-${id}`}>{t('slTitle')}</h2>
      <p>{t('slLead')}</p>
      {paid && <p className="soon" role="status">{tries >= 10 ? t('slPaidLate') : t('slPaidWait')}</p>}
      {canceled && <p className="meta">{t('slCanceled')}</p>}
      <div className="sale-opts" role="radiogroup" aria-label={t('slTitle')}>
        {sale.buy && option('buy', sale.buy)}
        {sale.rent && option('rent', sale.rent)}
      </div>
      {sale.member && sale.memberDiscountPct > 0 && <p className="meta small">{t('slMemberApplied').replace('{n}', sale.memberDiscountPct)}</p>}
      {memberHint && <p className="meta small">{t('slMemberHint').replace('{n}', sale.memberDiscountPct)} <Link className="link u" href="/pricing">{t('slSeePlans')}</Link></p>}
      {user ? (
        <>
          <label className="waiver">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>{text?.[locale] || text?.fr || '…'} <Link href="/legal/cgv" target="_blank">{t('legalTerms')}</Link></span>
          </label>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="lock-cta">
            <button type="button" className="btn btn-lg" disabled={busy || !terms || !opt} onClick={pay}>{t('gfBuy').replace('{price}', opt ? money(opt.yourPrice) : '')}</button>
          </div>
        </>
      ) : (
        <div className="lock-cta">
          <Link className="btn btn-lg" href={`/login?next=${encodeURIComponent(back)}`}>{t('slLogin')}</Link>
          <Link className="btn ghost btn-lg" href={`/register?next=${encodeURIComponent(back)}`}>{t('register')}</Link>
        </div>
      )}
    </section>
  );
}
