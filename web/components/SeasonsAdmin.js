'use client';
// Admin → Saisons (étape 45) : Ramadan, Hajj, Mawlid, Achoura. Pour chaque saison : activer, choisir une collection,
// régler les jours d'annonce, personnaliser les textes (FR / EN / AR) et la notification. Décalage de date : Paramètres → Saisons.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

const L = [['fr', 'Français'], ['en', 'English'], ['ar', 'العربية']];
const day = (s) => (s ? new Date(`${s}T12:00:00Z`).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '—');

function SeasonCard({ s, collections, onSaved }) {
  const { t, call } = useApp();
  const [f, setF] = useState({ enabled: s.enabled, collectionId: s.collectionId || '', leadDays: s.leadDays ?? '', notify: s.notify, title: { ...s.title }, text: { ...s.text } });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    const body = { enabled: f.enabled, collectionId: f.collectionId || null, leadDays: f.leadDays === '' ? null : Number(f.leadDays), notify: f.notify, title: f.title, text: f.text };
    const r = await call(`/admin/seasons/${s.id}`, { method: 'PUT', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || (r.data?.details ? r.data.details.map((d) => d.message).join(' ; ') : t('errGeneric'))); return; }
    setMsg(t('seasonSaved')); onSaved();
  };
  const test = async () => {
    setErr(''); setMsg('');
    const r = await call(`/admin/seasons/${s.id}/test-push`, { method: 'POST' });
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    setMsg(r.data.sent > 0 ? t('seasonTestSent') : t('seasonTestNone'));
  };
  const st = s.state;
  return (
    <form className="ss-card" onSubmit={save}>
      <h3>{s.name} <span className="meta">{st.active ? (s.enabled ? '· visible maintenant' : '· période en cours (désactivée)') : ''}</span></h3>
      <p className="meta">Prochaine période : {day(st.startsOn)} → {day(st.endsOn)} (année {st.hijriYear}). Annonce {s.leadDays ?? s.defaultLead} jour(s) avant.
        {s.lastNotifiedYear ? ` Notification déjà envoyée pour l'année ${s.lastNotifiedYear}.` : ''}</p>
      <label className="chk"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> {t('seasonEnabled')}</label>
      <label>{t('seasonCollection')}
        <select value={f.collectionId} onChange={(e) => setF({ ...f, collectionId: e.target.value })}>
          <option value="">{t('seasonNoCollection')}</option>
          {collections.map((c) => <option key={c.id} value={c.id}>{c.title}{c.published ? '' : ' (non publiée)'}</option>)}
        </select>
      </label>
      <label>{t('seasonLead')} ({s.defaultLead} par défaut)
        <input type="number" min="0" max="60" value={f.leadDays} onChange={(e) => setF({ ...f, leadDays: e.target.value })} dir="ltr" />
      </label>
      {L.map(([k, name]) => (
        <fieldset key={k} className="ss-lang">
          <legend>{name}</legend>
          <label>{t('seasonTitleLbl')}<input maxLength={300} value={f.title[k]} placeholder={s.defaults.title[k]} dir={k === 'ar' ? 'rtl' : 'ltr'} onChange={(e) => setF({ ...f, title: { ...f.title, [k]: e.target.value } })} /></label>
          <label>{t('seasonTextLbl')}<input maxLength={300} value={f.text[k]} placeholder={s.defaults.text[k]} dir={k === 'ar' ? 'rtl' : 'ltr'} onChange={(e) => setF({ ...f, text: { ...f.text, [k]: e.target.value } })} /></label>
        </fieldset>
      ))}
      <label className="chk"><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} /> {t('seasonNotify')}</label>
      {msg && <p className="meta" role="status">✓ {msg}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      <p><button className="btn" disabled={busy}>{t('seasonSave')}</button>{' '}<button type="button" className="btn ghost" onClick={test}>{t('seasonTest')}</button></p>
    </form>
  );
}

export default function SeasonsAdmin() {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await call('/admin/seasons');
    if (r.ok) { setD(r.data); setErr(''); } else setErr(r.status === 404 ? 'Cette fonction est coupée (Admin → Fonctions → « Pages de saison »).' : (r.data?.error || t('errGeneric')));
  }, [call, t]);
  useEffect(() => { load(); }, [load]);
  if (err) return <p className="error" role="alert">{err}</p>;
  if (!d) return null;
  return (
    <section>
      <h2>{t('seasonTitle')}</h2>
      <p className="meta">{t('seasonIntro')}</p>
      <p className="meta">Aujourd’hui : {d.today.date} = <strong>{d.today.text}</strong> (calendrier Umm al-Qura, décalage {d.offset >= 0 ? '+' : ''}{d.offset} jour — <Link className="link u" href="/admin?tab=settings">Paramètres → Saisons</Link>).</p>
      <div className="ss-cards">{d.seasons.map((s) => <SeasonCard key={s.id} s={s} collections={d.collections} onSaved={load} />)}</div>
    </section>
  );
}
