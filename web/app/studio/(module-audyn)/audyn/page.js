'use client';
// Studio → Audyn : liste des contenus audio (livres audio adultes, histoires du soir enfants), création, journal des attestations de droits.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../../../components/Providers';
import StudioTabs from '../../../../components/StudioTabs';

export const AUDIENCE_KEY = { kids: 'ayAudKids', adults: 'ayAudAdults', both: 'ayAudBoth' };
export const clock = (sec) => { const s = Math.round(sec || 0); const h = Math.floor(s / 3600); return `${h ? h + ' h ' : ''}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')} min`; };

export default function StudioAudyn() {
  const { t, call, locale } = useApp();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [rights, setRights] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', audience: 'adults' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { call('/studio/audyn').then((r) => setData(r.ok ? r.data : { items: [], storage: true, limits: {} })); }, [call]);
  const create = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await call('/studio/audyn', { method: 'POST', body: JSON.stringify(f) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    router.push(`/studio/audyn/${r.data.id}`);
  };
  const showRights = async () => { const r = await call('/studio/audyn-rights'); setRights(r.ok ? r.data : []); };
  const date = (d) => new Date(d).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <main className="studio-page">
      <div className="studio-head">
        <h1 className="studio-title">{t('ayNav')}</h1>
        <button className="btn" onClick={() => setOpen((v) => !v)}>{t('ayNew')}</button>
      </div>
      <StudioTabs />
      <p className="meta">{t('ayIntro')}</p>
      {data && !data.storage && <p className="error" role="alert">{t('ayNoStorage')}</p>}
      {open && (
        <form className="panel ay-form" onSubmit={create}>
          <label className="fld"><span>{t('ayTitleF')}</span><input required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="fld"><span>{t('ayAudience')}</span>
            <select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
              {['adults', 'kids', 'both'].map((a) => <option key={a} value={a}>{t(AUDIENCE_KEY[a])}</option>)}
            </select>
          </label>
          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn" disabled={busy || !f.title.trim()}>{t('ayCreate')}</button>
        </form>
      )}
      {!data ? <p className="meta">{t('ayLoading')}</p> : data.items.length === 0 ? <p className="meta">{t('ayEmpty')}</p> : (
        <ul className="ay-list">
          {data.items.map((i) => (
            <li key={i.id} className="panel ay-row">
              <div>
                <Link className="link u" href={`/studio/audyn/${i.id}`}><b>{i.title}</b></Link>
                <p className="meta">{[i.narrator, t(AUDIENCE_KEY[i.audience]), i.category, `${i.chapters} ${t('ayChaptersN')}`, i.durationSeconds ? clock(i.durationSeconds) : ''].filter(Boolean).join(' · ')}</p>
              </div>
              <span className={`ay-badge ${i.status === 'published' ? 'on' : ''}`}>{i.status === 'published' ? t('ayPublished') : t('ayDraft')}</span>
            </li>
          ))}
        </ul>
      )}
      <h2 className="ay-h2">{t('ayRightsTitle')}</h2>
      {rights === null ? <button className="btn ghost sm" onClick={showRights}>{t('ayRightsShow')}</button> : rights.length === 0 ? <p className="meta">{t('ayRightsNone')}</p> : (
        <div className="ay-wrap">
          <table className="ay-table">
            <thead><tr><th>{t('ayRightsWhen')}</th><th>{t('ayRightsItem')}</th><th>{t('ayRightsFile')}</th><th>{t('ayRightsBy')}</th></tr></thead>
            <tbody>{rights.map((r) => <tr key={r.id}><td>{date(r.at)}</td><td>{r.itemTitle}</td><td>{r.filename}</td><td>{r.by}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}
