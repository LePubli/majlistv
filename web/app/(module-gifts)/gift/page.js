'use client';
// Étape 21 — Offrir un abonnement : carte cadeau de 1, 3 ou 12 mois, payée par Stripe (paiement unique).
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import MyGifts from '../../../components/MyGifts';
import { authPath } from '../../../lib/nav';

const LABEL = { 1: 'gfM1', 3: 'gfM3', 12: 'gfM12' };

function Gift() {
  const { t, locale, user, ready, call } = useApp();
  const qs = useSearchParams();
  const [info, setInfo] = useState(null);
  const [months, setMonths] = useState(null);
  const [form, setForm] = useState({ recipientName: '', recipientEmail: '', message: '' });
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { call('/gifts/options', {}, null).then((r) => { const d = r.ok ? r.data : { enabled: false, options: [] }; setInfo(d); setMonths(d.options.find((o) => o.months === 12)?.months ?? d.options[0]?.months ?? null); }); }, [call]);
  const money = (cents) => new Intl.NumberFormat(locale, { style: 'currency', currency: String(info?.currency || 'eur').toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const body = { months, terms, ...(form.recipientEmail.trim() ? { recipientEmail: form.recipientEmail.trim() } : {}), ...(form.recipientName.trim() ? { recipientName: form.recipientName.trim() } : {}), ...(form.message.trim() ? { message: form.message.trim() } : {}) };
    const r = await call('/gifts/checkout', { method: 'POST', body: JSON.stringify(body) });
    if (r.ok && r.data.url) { window.location.href = r.data.url; return; }
    setErr(r.data?.error || t('errGeneric')); setBusy(false);
  };
  if (!info || !ready) return null;
  const chosen = info.options.find((o) => o.months === months);
  const paid = qs.get('paid') === '1';
  return (
    <main className="page gf-page">
      <h1>{t('gfTitle')}</h1>
      {paid && <p className="soon" role="status">{t('gfThanks')}</p>}
      {qs.get('canceled') && <p className="meta">{t('gfCanceled')}</p>}
      {!info.enabled ? <p className="soon">{t('gfOff')}</p> : (
        <>
          <p className="th-lead">{t('gfLead')}</p>
          {!user ? (
            <p><Link className="btn" href={authPath('login', '/gift')}>{t('gfLogin')}</Link></p>
          ) : (
            <form onSubmit={submit} className="gf-form">
              <fieldset className="gf-opts">
                <legend>{t('gfDuration')}</legend>
                {info.options.map((o) => (
                  <label key={o.months} className={`gf-opt ${months === o.months ? 'on' : ''}`}>
                    <input type="radio" name="months" value={o.months} checked={months === o.months} onChange={() => setMonths(o.months)} />
                    <b>{t(LABEL[o.months])}</b><span>{money(o.amount)}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="gf-who">
                <legend>{t('gfRecipient')}</legend>
                <label className="fld"><span>{t('gfRecName')}</span><input value={form.recipientName} maxLength={100} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} /></label>
                <label className="fld"><span>{t('gfRecMail')}</span><input type="email" value={form.recipientEmail} maxLength={254} autoComplete="off" onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} /></label>
                <p className="meta small">{t('gfRecHelp')}</p>
                <label className="fld"><span>{t('gfMsg')}</span><textarea rows={3} maxLength={300} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></label>
              </fieldset>
              <label className="waiver">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                <span>{info.termsText?.[locale] || info.termsText?.fr} <Link href="/legal/cgv" target="_blank">{t('legalTerms')}</Link></span>
              </label>
              {err && <p className="error" role="alert">{err}</p>}
              <button className="btn btn-lg" disabled={busy || !terms || !chosen}>{t('gfBuy').replace('{price}', chosen ? money(chosen.amount) : '')}</button>
            </form>
          )}
        </>
      )}
      {user && <MyGifts poll={paid} />}
      {user && <p className="meta small"><Link className="link u" href="/redeem">{t('gfRedeemLink')}</Link></p>}
    </main>
  );
}

export default function GiftPage() { return <Suspense fallback={null}><Gift /></Suspense>; }
