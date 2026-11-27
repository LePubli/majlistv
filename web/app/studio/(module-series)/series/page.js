'use client';
// Studio → Mes séries : liste, et création d'une série (titre, intervenant, avec ou sans saisons).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../../../components/Providers';
import ChannelPicker from '../../../../components/ChannelPicker';
import AudienceCats, { AUDIENCE_DEFAULT, audienceBody, bandsMissing } from '../../../../components/AudienceCats';
import StudioTabs from '../../../../components/StudioTabs';
import { Page as BmPage, Btn as BmBtn, Badge as BmBadge, Metrics as BmMetrics, Panel as BmPanel, Table as BmTable, c as bmc } from '../../../../components/backoffice/Kit';

export default function StudioSeries() {
  const { t, call, locale, user, skin } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', speaker: '', hasSeasons: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [a, setA] = useState(AUDIENCE_DEFAULT);   // public et catégories de la nouvelle série
  const [cats, setCats] = useState([]);
  useEffect(() => { call('/studio/series').then((r) => setRows(r.ok ? r.data : [])); }, [call]);
  useEffect(() => { if (open && !cats.length) call('/categories?catalogue=all', {}, null).then((r) => r.ok && setCats(r.data)); }, [open, cats.length, call]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await call('/series', { method: 'POST', body: JSON.stringify({ title: f.title, speaker: f.speaker, hasSeasons: f.hasSeasons, ...audienceBody(a) }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    router.push(`/studio/series/${r.data.id}`);
  };
  const date = (d) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const pill = (on, label, onClick) => <button type="button" aria-pressed={on} className={on ? 'pill on' : 'pill'} onClick={onClick}>{label}</button>;

  if (skin === 'premium') {
    return (
      <main className="studio-page">
        <BmPage title={t('srTitle')} sub={t('srEmpty')} actions={<><BmBtn primary={false} href="/studio/series/import">{t('sriImportBtn')}</BmBtn><BmBtn onClick={() => setOpen((v) => !v)}>+ {t('srNew')}</BmBtn></>}>
          <BmMetrics cols="three" items={rows ? [
            { icon: 'film', label: t('srColSeries'), value: rows.length },
            { icon: 'check', tone: 'green', label: t('srPub'), value: rows.filter((r) => r.published).length },
            { icon: 'video', label: t('srColContent'), value: rows.reduce((n, r) => n + (r.episodeCount || 0), 0) },
          ] : []} />
          <StudioTabs group="contents" />
          {open && (
            <BmPanel title={t('srCreateTitle')}>
              <form className={bmc('form')} style={{ padding: '0 18px 18px' }} onSubmit={create}>
                <label className={bmc('field')}><span>{t('srName')}</span><input required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></label>
                <ChannelPicker value={f.speaker} onChange={(v) => setF({ ...f, speaker: v })} t={t} call={call} />
                <label className={bmc('field')}><span>{t('speaker')}</span><input maxLength={200} value={f.speaker} onChange={(e) => setF({ ...f, speaker: e.target.value })} /></label>
                <div className="fld" role="group" aria-label={t('srStructure')}>
                  <span>{t('srStructure')}</span>
                  <div className="pills">{pill(f.hasSeasons, t('srWithSeasons'), () => setF({ ...f, hasSeasons: true }))}{pill(!f.hasSeasons, t('srNoSeasons'), () => setF({ ...f, hasSeasons: false }))}</div>
                  <span className="meta small">{f.hasSeasons ? t('srWithHelp') : t('srNoHelp')}</span>
                </div>
                <AudienceCats value={a} onChange={setA} cats={cats} t={t} />
                <p className="meta small">{t('saCreateNote')}</p>
                {err && <p className="error" role="alert">{err}</p>}
                <div className={bmc('btn-row')}><button className="btn" disabled={busy || !f.title.trim() || bandsMissing(a)}>{t('srCreate')}</button></div>
              </form>
            </BmPanel>
          )}
          <BmPanel title={t('srTitle')} extra={rows ? `${rows.length}` : ''}>
            <BmTable empty={rows ? t('srEmpty') : '…'} onRow={(i) => router.push(`/studio/series/${rows[i].id}`)}
              headers={[t('srColSeries'), t('colState'), t('srColContent'), t('access'), t('srColUpdated')]}
              rows={(rows || []).map((r) => [
                <span key="a"><b dir="auto">{r.title}</b><br /><small>{[r.speaker, user?.role === 'admin' ? r.ownerName : ''].filter(Boolean).join(' · ')}</small></span>,
                <BmBadge key="b" tone={r.published ? 'green' : 'amber'}>{r.published ? t('srPub') : t('srDraft')}</BmBadge>,
                `${t('srEpCount').replace('{n}', r.episodeCount)}${r.hasSeasons ? ` · ${t('srSeasonCount').replace('{n}', r.seasonCount)}` : ''}`,
                t(r.access),
                date(r.updatedAt),
              ])} />
          </BmPanel>
        </BmPage>
      </main>
    );
  }
  return (
    <main className="studio-page">
      <div className="studio-head">
        <h1 className="studio-title">{t('srTitle')}</h1>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Link href="/studio/series/import" className="btn ghost">{t('sriImportBtn')}</Link>
        <button type="button" className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>+ {t('srNew')}</button></span>
      </div>
      <StudioTabs group="contents" />

      {open && (
        <form className="panel" onSubmit={create}>
          <h2 className="panel-title">{t('srCreateTitle')}</h2>
          <label className="fld"><span>{t('srName')}</span><input required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></label>
          <ChannelPicker value={f.speaker} onChange={(v) => setF({ ...f, speaker: v })} t={t} call={call} />
          <label className="fld"><span>{t('speaker')}</span><input maxLength={200} value={f.speaker} onChange={(e) => setF({ ...f, speaker: e.target.value })} /></label>
          <div className="fld" role="group" aria-label={t('srStructure')}>
            <span>{t('srStructure')}</span>
            <div className="pills">{pill(f.hasSeasons, t('srWithSeasons'), () => setF({ ...f, hasSeasons: true }))}{pill(!f.hasSeasons, t('srNoSeasons'), () => setF({ ...f, hasSeasons: false }))}</div>
            <span className="meta small">{f.hasSeasons ? t('srWithHelp') : t('srNoHelp')}</span>
          </div>
          <AudienceCats value={a} onChange={setA} cats={cats} t={t} />
          <p className="meta small">{t('saCreateNote')}</p>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="panel-actions"><button className="btn" disabled={busy || !f.title.trim() || bandsMissing(a)}>{t('srCreate')}</button></div>
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
