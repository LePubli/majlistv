'use client';
// Studio → Ouvrages : liste et création d'un ouvrage.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../../../components/Providers';
import { langName } from '../../../../components/Transcript';

export default function StudioBooks() {
  const { t, call, locale } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', author: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { call('/studio/books').then((r) => setRows(r.ok ? r.data : [])); }, [call]);
  const create = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await call('/studio/books', { method: 'POST', body: JSON.stringify(f) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    router.push(`/studio/books/${r.data.id}`);
  };
  const date = (d) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <main className="studio-page">
      <div className="studio-head">
        <h1 className="studio-title">{t('bkNav')}</h1>
        <button type="button" className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>+ {t('bkNew')}</button>
      </div>
      {open && (
        <form className="panel" onSubmit={create}>
          <h2 className="panel-title">{t('bkNew')}</h2>
          <label className="fld"><span>{t('bkName')}</span><input required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></label>
          <label className="fld"><span>{t('bkAuthor')}</span><input maxLength={200} value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} /></label>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="panel-actions"><button className="btn" disabled={busy || !f.title.trim()}>{t('bkCreate')}</button></div>
        </form>
      )}
      {rows && rows.length === 0 && !open && <div className="studio-empty"><p>{t('bkEmpty')}</p><button type="button" className="btn" onClick={() => setOpen(true)}>+ {t('bkNew')}</button></div>}
      {rows && rows.length > 0 && (
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead><tr><th>{t('bkColBook')}</th><th>{t('colState')}</th><th>{t('bkColLangs')}</th><th>{t('bkColDl')}</th><th>{t('srColUpdated')}</th><th><span className="sr-only">{t('colActions')}</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/studio/books/${r.id}`} className="studio-talk"><span className="studio-thumb" style={r.coverUrl ? { backgroundImage: `url(${r.coverUrl})` } : undefined} /><span className="studio-talk-text"><b>{r.title}</b><small>{r.author}</small></span></Link></td>
                  <td><span className={`state ${r.published ? 'state-live' : 'state-draft'}`}><i aria-hidden="true" />{r.published ? t('srPub') : t('srDraft')}</span></td>
                  <td>{r.langs.map((l) => langName(l, locale)).join(', ') || '—'}</td>
                  <td>{r.downloads}</td>
                  <td className="muted">{date(r.updatedAt)}</td>
                  <td className="end"><Link href={`/studio/books/${r.id}`} className="manage">{t('manage')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
