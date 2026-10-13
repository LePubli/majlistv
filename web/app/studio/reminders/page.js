'use client';
// Studio → Rappels : bibliothèque de rappels INDÉPENDANTE des quiz et des conférences.
//  - saisie à la main (hadith, verset, citation) avec sa source obligatoire ;
//  - pour l'administrateur : citations automatiques (versets du Coran et hadiths) choisies par l'IA dans un corpus importé.
//    L'IA ne rédige jamais le texte : elle choisit des références, le texte affiché est celui de la source.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../components/Providers';
import { Item } from '../../../components/RemindersEditor';

function Citations({ t, call, onChange }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => { const r = await call('/admin/citations'); if (r.ok) setD(r.data); }, [call]);
  useEffect(() => { load(); }, [load]);
  // Tant qu'un import ou une génération est en cours, on rafraîchit.
  const busy = d && (d.corpus.status === 'running' || ['pending', 'processing'].includes(d.stock.job?.status));
  useEffect(() => { if (!busy) return undefined; const i = setInterval(() => { load(); onChange(); }, 3000); return () => clearInterval(i); }, [busy, load, onChange]);
  if (!d) return null;
  const act = async (path, body, okText) => {
    setMsg(null);
    const r = await call(path, { method: 'POST', body: JSON.stringify(body || {}) });
    if (!r.ok) setMsg({ ok: false, text: r.data?.code === 'no_corpus' ? t('citzNoCorpus') : (r.data?.error || t('errGeneric')) });
    else setMsg({ ok: true, text: okText ? okText(r.data) : '' });
    load(); onChange();
  };
  const c = d.corpus, job = d.stock.job;
  const ready = c.status === 'ready' && c.items > 0;
  return (
    <section className="panel rm-panel" aria-labelledby="ct-title">
      <h2 className="panel-title" id="ct-title">{t('citzTitle')}</h2>
      <p className="meta small">{t('citzIntro')}</p>
      <dl className="ct-stats">
        <div><dt>{t('citzCorpus')}</dt><dd>{c.status === 'running' ? c.message : ready ? `${c.items.toLocaleString()} · ${c.collections.map((x) => `${x.collection} ${x.n}`).join(', ')}` : c.status === 'failed' ? c.message : t('citzNotImported')}</dd></div>
        <div><dt>{t('citzPublished')}</dt><dd>{d.stock.approved} / {d.minStock}</dd></div>
        <div><dt>{t('citzDrafts')}</dt><dd>{d.stock.draft}</dd></div>
        <div><dt>{t('citzMode')}</dt><dd>{d.auto ? t('citzAuto') : t('citzManual')} · {d.review ? t('citzReview') : t('citzDirect')}</dd></div>
        {job && <div><dt>{t('citzLastRun')}</dt><dd>{job.status === 'ready' ? t('citzRunOk').replace('{n}', job.produced).replace('{d}', job.dropped) : job.status === 'failed' ? `${t('citzRunFail')} ${job.error || ''}` : t('citzRunning')}</dd></div>}
      </dl>
      <div className="rm-actions">
        <button type="button" className="btn ghost" disabled={c.status === 'running'} onClick={() => act('/admin/citations/import', {}, () => t('citzImportStarted'))}>{ready ? t('citzReimport') : t('citzImport')}</button>
        <button type="button" className="btn" disabled={!ready || busy} onClick={() => act('/admin/citations/generate', {}, () => t('citzGenStarted'))}>{t('citzGenerate')}</button>
        {d.stock.draft > 0 && <button type="button" className="btn ghost" onClick={() => act('/admin/citations/approve-all', {}, (x) => t('citzApproved').replace('{n}', x.approved))}>{t('citzApproveAll').replace('{n}', d.stock.draft)}</button>}
        <Link className="link u small" href="/admin?tab=settings">{t('citzSettings')}</Link>
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
    </section>
  );
}

export default function StudioReminders() {
  const { t, call, user } = useApp();
  const [f, setF] = useState({ origin: 'all', status: 'all', q: '', page: 1 });
  const [d, setD] = useState(null);
  const [man, setMan] = useState({ text: '', textAr: '', attribution: '' });
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    const qs = new URLSearchParams({ origin: f.origin, status: f.status, q: f.q, page: String(f.page) });
    const r = await call(`/studio/reminders?${qs}`); if (r.ok) setD(r.data);
  }, [call, f]);
  useEffect(() => { load(); }, [load]);
  const add = async (e) => {
    e.preventDefault(); setMsg(null);
    const r = await call('/studio/reminders', { method: 'POST', body: JSON.stringify(man) });
    if (!r.ok) { setMsg(r.data?.error || t('errGeneric')); return; }
    setMan({ text: '', textAr: '', attribution: '' }); load();
  };
  const pages = d ? Math.max(1, Math.ceil(d.total / d.perPage)) : 1;
  return (
    <main className="studio-page">
      <div className="studio-head"><h1 className="studio-title">{t('rmNav')}</h1></div>
      <p className="meta">{t('rmLibIntro')}</p>
      {user?.role === 'admin' && <Citations t={t} call={call} onChange={load} />}
      <form className="panel rm-form" onSubmit={add}>
        <h2 className="panel-title">{t('rmManual')}</h2>
        <textarea rows={3} maxLength={800} required value={man.text} onChange={(e) => setMan({ ...man, text: e.target.value })} placeholder={t('rmTextPh')} aria-label={t('rmText')} dir="auto" />
        <textarea rows={2} maxLength={1600} value={man.textAr} onChange={(e) => setMan({ ...man, textAr: e.target.value })} placeholder={t('rmArPh')} aria-label={t('rmArLabel')} dir="rtl" lang="ar" />
        <input required minLength={3} maxLength={300} value={man.attribution} onChange={(e) => setMan({ ...man, attribution: e.target.value })} placeholder={t('rmSourcePh')} aria-label={t('rmSource')} />
        {msg && <p className="error" role="alert">{msg}</p>}
        <div className="rm-actions"><button className="btn">{t('rmAdd')}</button><span className="meta small">{t('rmFreeHelp')}</span></div>
      </form>
      <section className="panel rm-panel">
        <div className="rm-filters">
          <select value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value, page: 1 })} aria-label={t('rmFilterOrigin')}>
            {['all', 'corpus', 'manual', 'transcript', 'quiz'].filter((o) => o !== 'corpus' || user?.role === 'admin').map((o) => <option key={o} value={o}>{o === 'all' ? t('rmAllOrigins') : t(`rmOrigin_${o}`)}</option>)}
          </select>
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })} aria-label={t('rmFilterStatus')}>
            <option value="all">{t('rmAllStatus')}</option><option value="draft">{t('rmDraft')}</option><option value="approved">{t('rmApproved')}</option>
          </select>
          <input type="search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} placeholder={t('rmSearch')} aria-label={t('rmSearch')} />
        </div>
        {!d ? null : d.reminders.length === 0 ? <p className="meta">{t('rmNone')}</p> : (
          <ul className="rm-list">{d.reminders.map((r) => <Item key={r.id + r.status + r.text + r.attribution} r={r} t={t} call={call} onChange={load} />)}</ul>
        )}
        {pages > 1 && (
          <div className="rm-actions">
            <button type="button" className="btn ghost" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>←</button>
            <span className="meta small">{f.page} / {pages}</span>
            <button type="button" className="btn ghost" disabled={f.page >= pages} onClick={() => setF({ ...f, page: f.page + 1 })}>→</button>
          </div>
        )}
      </section>
    </main>
  );
}
