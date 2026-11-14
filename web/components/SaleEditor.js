'use client';
// Étape C-2 — Studio : vendre un contenu à l'unité (vidéo ou Audyn). Prix d'achat et/ou de location, durée de location,
// réduction pour les abonnés. Réservé à l'administrateur et à l'organisateur responsable du contenu (le serveur vérifie).
import { useEffect, useState } from 'react';
import { useApp } from './Providers';
import { saleMoney, rentLabel } from './SaleBox';

const euros = (cents) => (cents ? String((cents / 100).toFixed(2)).replace('.', ',') : '');

export default function SaleEditor({ kind, id }) {
  const { t, call, feat, locale } = useApp();
  const [d, setD] = useState(null);       // { offer, currency, sold }
  const [f, setF] = useState({ buy: '', rent: '', hours: 48, pct: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);   // { ok, text }
  const on = feat('sales');
  const load = () => call(`/studio/sales/${kind}/${id}`).then((r) => {
    if (!r.ok) { setD(false); return; }
    setD(r.data);
    const o = r.data.offer;
    setF(o ? { buy: euros(o.buyCents), rent: euros(o.rentCents), hours: o.rentHours, pct: o.memberDiscountPct } : { buy: '', rent: '', hours: 48, pct: 0 });
  });
  useEffect(() => { if (on) load(); }, [on, kind, id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!on || d === false || d === null) return null;
  const money = (c) => saleMoney(c, d.currency, locale);
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await call(`/studio/sales/${kind}/${id}`, { method: 'PUT', body: JSON.stringify({ buyPrice: f.buy.trim() || null, rentPrice: f.rent.trim() || null, rentHours: Number(f.hours) || 48, memberDiscountPct: Number(f.pct) || 0 }) });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: t('seSaved') }); load(); } else setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  const remove = async () => {
    if (!window.confirm(t('seRemoveAsk'))) return;
    setBusy(true); setMsg(null);
    const r = await call(`/studio/sales/${kind}/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: t('seRemoved') }); load(); } else setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  const o = d.offer;
  return (
    <section className="panel se-panel">
      <h2 className="panel-title">{t('seTitle')}</h2>
      <p className="meta">{o ? t('seOn') : t('seOff')}</p>
      {o && (
        <p className="se-sum">
          {o.buyCents ? <span>{t('slBuy')} : <strong>{money(o.buyCents)}</strong>{o.memberDiscountPct ? ` (${t('seMembers')} ${money(o.memberBuyCents)})` : ''}</span> : null}
          {o.rentCents ? <span>{t('slRent').replace('{d}', rentLabel(o.rentHours, t))} : <strong>{money(o.rentCents)}</strong>{o.memberDiscountPct ? ` (${t('seMembers')} ${money(o.memberRentCents)})` : ''}</span> : null}
          <span>{t('seSold').replace('{n}', d.sold.n).replace('{m}', money(d.sold.total))}</span>
        </p>
      )}
      <form className="se-form" onSubmit={save}>
        <label className="fld"><span>{t('seBuyPrice')}</span><input inputMode="decimal" placeholder="4,99" value={f.buy} maxLength={10} onChange={(e) => setF({ ...f, buy: e.target.value })} /></label>
        <label className="fld"><span>{t('seRentPrice')}</span><input inputMode="decimal" placeholder="1,99" value={f.rent} maxLength={10} onChange={(e) => setF({ ...f, rent: e.target.value })} /></label>
        <label className="fld"><span>{t('seRentHours')}</span>
          <select value={f.hours} onChange={(e) => setF({ ...f, hours: Number(e.target.value) })}>
            {[24, 48, 72, 168, 720].map((h) => <option key={h} value={h}>{rentLabel(h, t)}</option>)}
            {![24, 48, 72, 168, 720].includes(Number(f.hours)) && <option value={f.hours}>{rentLabel(Number(f.hours), t)}</option>}
          </select>
        </label>
        <label className="fld"><span>{t('seDiscount')}</span><input type="number" min="0" max="90" step="5" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></label>
        <p className="meta small se-help">{t('seHelp').replace('{min}', money(d.limits.minCents)).replace('{max}', money(d.limits.maxCents))}</p>
        {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
        <div className="panel-actions">
          <button className="btn" disabled={busy}>{o ? t('seUpdate') : t('sePut')}</button>
          {o && <button type="button" className="btn ghost" disabled={busy} onClick={remove}>{t('seRemove')}</button>}
        </div>
      </form>
    </section>
  );
}
