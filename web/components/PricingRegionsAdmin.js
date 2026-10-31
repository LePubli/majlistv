'use client';
// Admin → Tarifs par pays (étape 44) : groupes de pays avec leurs propres prix Stripe. Le membre choisit son pays sur la page Abonnement.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';
import { countryName } from '../lib/countries';

const EMPTY = { name: '', countries: '', priceMonthly: '', priceYearly: '', priceLearnMonthly: '', priceLearnYearly: '', enabled: true };

export default function PricingRegionsAdmin() {
  const { t, locale, call } = useApp();
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null); // { id?, ...champs } quand on crée ou modifie
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await call('/admin/pricing-regions');
    if (r.ok) { setList(r.data); setErr(''); }
    else setErr(r.status === 404 ? 'Cette fonction est coupée (Admin → Fonctions → « Tarifs par pays »).' : (r.data?.error || t('errGeneric')));
  }, [call, t]);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    const { id, ...body } = form;
    const r = await call(id ? `/admin/pricing-regions/${id}` : '/admin/pricing-regions', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || (r.data?.details ? r.data.details.map((d) => d.message).join(' ; ') : t('errGeneric'))); return; }
    setForm(null); setMsg(t('regSaved')); load();
  };
  const del = async (g) => {
    if (!window.confirm(t('regConfirmDelete'))) return;
    const r = await call(`/admin/pricing-regions/${g.id}`, { method: 'DELETE' });
    if (r.ok) load(); else setErr(r.data?.error || t('errGeneric'));
  };

  if (err && !list) return <p className="error" role="alert">{err}</p>;
  if (!list) return null;
  return (
    <section>
      <h2>{t('regTitle')}</h2>
      <p className="meta">{t('regIntro')}</p>
      {msg && <p className="meta" role="status">✓ {msg}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {!form && <p><button type="button" className="btn" onClick={() => { setForm({ ...EMPTY }); setMsg(''); setErr(''); }}>{t('regNew')}</button></p>}
      {form && (
        <form className="reg-form" onSubmit={save}>
          <label>{t('regName')}<input required minLength={2} maxLength={80} value={form.name} onChange={set('name')} /></label>
          <label>{t('regCountries')}<input required value={Array.isArray(form.countries) ? form.countries.join(', ') : form.countries} onChange={set('countries')} dir="ltr" placeholder="MA, DZ, TN" /></label>
          <label>{t('regPM')}<input required value={form.priceMonthly} onChange={set('priceMonthly')} dir="ltr" /></label>
          <label>{t('regPY')}<input required value={form.priceYearly} onChange={set('priceYearly')} dir="ltr" /></label>
          <label>{t('regPLM')}<input value={form.priceLearnMonthly || ''} onChange={set('priceLearnMonthly')} dir="ltr" /></label>
          <label>{t('regPLY')}<input value={form.priceLearnYearly || ''} onChange={set('priceLearnYearly')} dir="ltr" /></label>
          <p className="meta small">{t('regLearnNote')}</p>
          <label><input type="checkbox" checked={form.enabled} onChange={set('enabled')} /> {t('regEnabled')}</label>
          <p><button className="btn" disabled={busy}>{t('regSave')}</button>{' '}<button type="button" className="btn ghost" onClick={() => { setForm(null); setErr(''); }}>{t('regCancel')}</button></p>
        </form>
      )}
      {list.length === 0 ? <p className="meta">{t('regNone')}</p> : (
        <ul className="reg-list">
          {list.map((g) => (
            <li key={g.id} className="reg-card">
              <p><strong>{g.name}</strong> {!g.enabled && <span className="meta">(inactif)</span>}</p>
              <p className="meta small">{g.countries.map((c) => `${c} ${countryName(c, locale)}`).join(' · ')}</p>
              <p className="meta small" dir="ltr">{g.priceMonthly} · {g.priceYearly}{g.priceLearnMonthly ? ` · ${g.priceLearnMonthly} · ${g.priceLearnYearly}` : ''}</p>
              <p><button type="button" className="btn ghost small" onClick={() => { setForm({ ...g, countries: g.countries.join(', '), priceLearnMonthly: g.priceLearnMonthly || '', priceLearnYearly: g.priceLearnYearly || '' }); setMsg(''); setErr(''); }}>{t('regEdit')}</button>{' '}
                <button type="button" className="btn ghost small" onClick={() => del(g)}>{t('regDelete')}</button></p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
