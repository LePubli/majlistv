'use client';
// Studio → Mes séries : liste, et création d'une série (titre, intervenant, avec ou sans saisons).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../../components/Providers';

export default function StudioSeries() {
  const { t, call, locale, user } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', speaker: '', hasSeasons: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { call('/studio/series').then((r) => setRows(r.ok ? r.data : [])); }, [call]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await call('/series', { method: 'POST', body: JSON.stringify({ title: f.title, speaker: f.speaker, hasSeasons: f.hasSeasons }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    router.push(`/studio/series/${r.data.id}`);
  };
  const date = (d) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const pill = (on, label, onClick) => <button type="button" aria-pressed={on} className={on ? 'pill on' : 'pill'} onClick={onClick}>{label}</button>;

  return (
    <main className="studio-page">
      <div className="studio-head">
        <h1 className="studio-title">{t('srTitle')}</h1>
        <button type="button" className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>+ {t('srNew')}</button>
      </div>

      {open && (
        <form className="panel" onSubmit={create}>
          <h2 className="panel-title">{t('srCreateTitle')}</h2>
          <label className="fld"><span>{t('srName')}</span><input required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></label>
          <label className="fld"><span>{t('speaker')}</span><input maxLength={200} value={f.speaker} onChange={(e) => setF({ ...f, speaker: e.target.value })} /></label>
          <div className="fld" role="group" aria-label={t('srStructure')}>
            <span>{t('srStructure')}</span>
            <div className="pills">{pill(f.hasSeasons, t('srWithSeasons'), () => setF({ ...f, hasSeasons: true }))}{pill(!f.hasSeasons, t('srNoSeasons'), () => setF({ ...f, hasSeasons: false }))}</div>
            <span className="meta small">{f.hasSeasons ? t('srWithHelp') : t('srNoHelp')}</span>
          </div>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="panel-actions"><button className="btn" disabled={busy || !f.title.trim()}>{t('srCreate')}</button></div>
        </form>
      )}

      {rows && rows.length === 0 && !open && (
        <div className="studio-empty"><p>{t('srEmpty')}</p><button type="button" className="btn" onClick={() => setOpen(true)}>+ {t('srNew')}</button></div>
      )}
      {rows && rows.length > 0 && (
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead><tr><th>{t('srColSeries')}</th><th>{t('colState')}</th><th>{t('srColContent')}</th><th>{t('access')}</th><th>{t('srColUpdated')}</th><th><span className="sr-only">{t('colActions')}</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/studio/series/${r.id}`} className="studio-talk"><span className="studio-talk-text"><b>{r.title}</b><small>{[r.speaker, user?.role === 'admin' ? r.ownerName : ''].filter(Boolean).join(' · ')}</small></span></Link></td>
                  <td><span className={`state ${r.published ? 'state-live' : 'state-draft'}`}><i aria-hidden="true" />{r.published ? t('srPub') : t('srDraft')}</span></td>
                  <td>{t('srEpCount').replace('{n}', r.episodeCount)}{r.hasSeasons ? ` · ${t('srSeasonCount').replace('{n}', r.seasonCount)}` : ''}</td>
                  <td>{t(r.access)}</td>
                  <td className="muted">{date(r.updatedAt)}</td>
                  <td className="end"><Link href={`/studio/series/${r.id}`} className="manage">{t('manage')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
