'use client';
// Studio → Shorts → Importer depuis YouTube.
//   1. coller l'adresse de la page « Shorts » d'une chaîne YouTube (ou d'une liste de lecture) : la liste est lue par le serveur ;
//   2. cocher les shorts voulus, choisir « copier chez nous » ou « lire depuis YouTube », le public, les catégories ;
//   3. cocher la case des droits (obligatoire), importer.
// Dessous : les shorts autonomes déjà importés (état de la copie, classement, publication, suppression).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import CategoryPicker from '../../components/CategoryPicker';
import { mmss } from '../../components/ShortsRail';

const BANDS = ['3-5', '6-8', '9-12', '13-15'];
const MAX_EXTRA = 8;

function Classify({ s, cats, t, onSave, busy }) {
  const [f, setF] = useState({ categoryId: s.categoryId ? String(s.categoryId) : '', extra: (s.categoryIds || []).filter((x) => x !== s.categoryId), catalogue: s.catalogue, bands: s.kidsBands || [], author: s.credit || '', description: s.description || '' });
  const toggleBand = (b) => setF((v) => ({ ...v, bands: v.bands.includes(b) ? v.bands.filter((x) => x !== b) : [...v.bands, b] }));
  return (
    <div className="sd-card" style={{ marginTop: 10 }}>
      <label style={{ display: 'grid', gap: 4 }}><span className="meta">{t('shiAuthor')}</span>
        <input value={f.author} maxLength={120} onChange={(e) => setF({ ...f, author: e.target.value })} /></label>
      <CategoryPicker cats={cats} mode="single" value={f.categoryId} onChange={(v) => setF({ ...f, categoryId: v })} t={t} label={t('category')} />
      <CategoryPicker cats={cats} mode="multi" max={MAX_EXTRA} value={f.extra} exclude={f.categoryId} onChange={(v) => setF({ ...f, extra: v })} t={t} label={t('txExtra')} />
      <fieldset style={{ border: 0, padding: 0, margin: '10px 0' }}>
        <legend className="meta">{t('shiAudience')}</legend>
        <label><input type="radio" name={`aud-${s.id}`} checked={f.catalogue === 'adult'} onChange={() => setF({ ...f, catalogue: 'adult' })} /> {t('shiAdults')}</label>{' '}
        <label><input type="radio" name={`aud-${s.id}`} checked={f.catalogue === 'kids'} onChange={() => setF({ ...f, catalogue: 'kids' })} /> {t('shiKids')}</label>
        {f.catalogue === 'kids' && <div style={{ marginTop: 6 }}><span className="meta">{t('shiBands')} </span>{BANDS.map((b) => <label key={b} style={{ marginInlineEnd: 10 }}><input type="checkbox" checked={f.bands.includes(b)} onChange={() => toggleBand(b)} /> {b}</label>)}</div>}
      </fieldset>
      <button type="button" className="btn" disabled={busy} onClick={() => onSave({ categoryId: f.categoryId ? Number(f.categoryId) : null, categoryIds: f.extra, catalogue: f.catalogue, kidsBands: f.catalogue === 'kids' ? f.bands : [], author: f.author, description: f.description })}>{t('save')}</button>
    </div>
  );
}

export default function ImportShorts() {
  const { t, call, locale } = useApp();
  const [cats, setCats] = useState([]);
  const [url, setUrl] = useState('');
  const [job, setJob] = useState(null);
  const [sel, setSel] = useState([]);
  const [mode, setMode] = useState('copy');
  const [opt, setOpt] = useState({ author: '', catalogue: 'adult', bands: [], categoryId: '', extra: [], status: 'draft' });
  const [rights, setRights] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [mine, setMine] = useState([]);
  const [open, setOpen] = useState(null);
  const poll = useRef(null);

  useEffect(() => { call('/categories?catalogue=all', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);
  const loadMine = useCallback(async () => {
    const r = await call('/studio/shorts');
    if (r.ok) setMine((r.data.shorts || []).filter((s) => s.standalone));
  }, [call]);
  useEffect(() => { loadMine(); }, [loadMine]);
  // Copies en cours : la liste se rafraîchit toute seule.
  const copying = mine.some((s) => s.copy && ['pending', 'downloading'].includes(s.copy.status));
  useEffect(() => { if (!copying) return undefined; const id = setInterval(loadMine, 5000); return () => clearInterval(id); }, [copying, loadMine]);

  // Lecture de la liste : on interroge le serveur jusqu'à ce qu'elle soit prête.
  const watch = useCallback((id) => {
    clearInterval(poll.current);
    const tick = async () => {
      const r = await call(`/studio/shorts/import/${id}`);
      if (!r.ok) { clearInterval(poll.current); setMsg({ err: true, text: r.data?.error || t('dbError') }); return; }
      setJob(r.data);
      if (r.data.status !== 'listing') {
        clearInterval(poll.current);
        if (r.data.status === 'listed') {
          setSel(r.data.entries.filter((e) => !e.already && e.source === 'youtube').map((e) => String(e.id)));
          setOpt((o) => ({ ...o, author: o.author || String(r.data.title || '').replace(/\s*[-–]\s*Shorts$/i, '') }));
        }
      }
    };
    tick(); poll.current = setInterval(tick, 3000);
  }, [call, t]);
  useEffect(() => () => clearInterval(poll.current), []);

  const analyse = async (e) => {
    e.preventDefault(); setMsg(null); setBusy('list');
    const r = await call('/studio/shorts/import', { method: 'POST', body: JSON.stringify({ url }) });
    setBusy('');
    if (!r.ok) { setMsg({ err: true, text: r.data?.error || t('dbError') }); return; }
    setJob(r.data); setSel([]); watch(r.data.id);
  };
  const toggle = (id) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const toggleBand = (b) => setOpt((o) => ({ ...o, bands: o.bands.includes(b) ? o.bands.filter((x) => x !== b) : [...o.bands, b] }));

  const start = async () => {
    setMsg(null); setBusy('start');
    const r = await call(`/studio/shorts/import/${job.id}/start`, { method: 'POST', body: JSON.stringify({
      ids: sel, mode, rights, categoryId: opt.categoryId ? Number(opt.categoryId) : null, categoryIds: opt.extra, catalogue: opt.catalogue,
      kidsBands: opt.catalogue === 'kids' ? opt.bands : [], author: opt.author, status: opt.status }) });
    setBusy('');
    if (!r.ok) { setMsg({ err: true, text: (r.data?.error || t('dbError')) + (r.data?.details?.length ? ` (${r.data.details.slice(0, 2).map((d) => `${(d.path || []).join('.')} : ${d.message}`).join(' ; ')})` : '') }); return; }
    setMsg({ text: t('shiStarted').replace('{n}', r.data.created) + (r.data.skipped?.length ? ` ${t('shiSkipped').replace('{n}', r.data.skipped.length)}` : '') });
    setJob(null); setSel([]); setRights(false); setUrl(''); loadMine();
  };

  const act = async (key, path, opts, ok) => {
    setBusy(key); setMsg(null);
    const r = await call(path, opts);
    setBusy('');
    if (r.ok) { if (ok) setMsg({ text: ok }); await loadMine(); } else setMsg({ err: true, text: r.data?.error || t('dbError') });
    return r;
  };
  const stateLabel = (s) => (s.copy?.status === 'pending' || s.copy?.status === 'downloading' ? t('shiCopying') : s.copy?.status === 'failed' ? t('shiFailed')
    : s.status === 'published' ? t('shrStatePublished') : s.status === 'pending' ? t('shrStatePending') : t('shrStateDraft'));

  const entries = job?.entries || [];
  const ready = job?.status === 'listed';
  const canStart = ready && sel.length > 0 && rights && busy !== 'start';

  return (
    <main className="page studio-shorts">
      <p className="meta"><Link href="/studio/shorts">← {t('shrSdNav')}</Link></p>
      <h1>{t('shiTitle')}</h1>
      <p className="meta">{t('shiIntro')}</p>
      {msg && <p role={msg.err ? 'alert' : 'status'} className={msg.err ? 'error' : 'ok'}>{msg.text}</p>}

      <section className="sd-card" aria-labelledby="shi-list">
        <h2 id="shi-list">{t('shiStep1')}</h2>
        <form onSubmit={analyse} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/@chaine/shorts" aria-label={t('shiUrl')} style={{ flex: '1 1 320px', minWidth: 0 }} />
          <button className="btn" disabled={busy === 'list' || job?.status === 'listing'}>{t('shiAnalyse')}</button>
        </form>
        {job?.status === 'listing' && <p className="meta" role="status">{t('shiReading')}</p>}
        {job?.status === 'failed' && <p className="error" role="alert">{job.error || t('dbError')}</p>}
      </section>

      {ready && (
        <>
          <section className="sd-card" aria-labelledby="shi-pick">
            <h2 id="shi-pick">{t('shiStep2').replace('{n}', entries.length)}{job.title ? ` — ${job.title}` : ''}</h2>
            <p>
              <button type="button" className="btn ghost" onClick={() => setSel(entries.filter((e) => !e.already && e.source === 'youtube').map((e) => String(e.id)))}>{t('shiAll')}</button>{' '}
              <button type="button" className="btn ghost" onClick={() => setSel([])}>{t('shiNone')}</button>{' '}
              <span className="meta">{t('shiSelected').replace('{n}', sel.length)}</span>
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {entries.map((e) => {
                const id = String(e.id); const dis = e.already || e.source !== 'youtube';
                return (
                  <li key={id} style={{ opacity: dis ? 0.55 : 1 }}>
                    <label style={{ display: 'grid', gap: 6, cursor: dis ? 'default' : 'pointer' }}>
                      <span style={{ position: 'relative', display: 'block', aspectRatio: '9 / 16', borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2)', backgroundImage: e.thumb ? `url("${e.thumb}")` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                        <input type="checkbox" checked={sel.includes(id)} disabled={dis} onChange={() => toggle(id)} aria-label={e.title} style={{ position: 'absolute', top: 8, insetInlineStart: 8, width: 20, height: 20 }} />
                        {e.duration ? <span className="meta" style={{ position: 'absolute', bottom: 6, insetInlineEnd: 6, background: 'rgba(0,0,0,.65)', padding: '1px 6px', borderRadius: 4 }}>{mmss(e.duration)}</span> : null}
                      </span>
                      <span dir="auto" style={{ fontSize: 13, lineHeight: 1.25 }}>{e.title}{e.already && <><br /><small className="meta">{t('shiAlready')}</small></>}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="sd-card" aria-labelledby="shi-opt">
            <h2 id="shi-opt">{t('shiStep3')}</h2>
            <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
              <legend className="meta">{t('shiMode')}</legend>
              <label style={{ display: 'block' }}><input type="radio" name="mode" checked={mode === 'copy'} onChange={() => setMode('copy')} /> <b>{t('shiModeCopy')}</b> <span className="meta">— {t('shiModeCopyHint')}</span></label>
              <label style={{ display: 'block' }}><input type="radio" name="mode" checked={mode === 'youtube'} onChange={() => setMode('youtube')} /> <b>{t('shiModeYt')}</b> <span className="meta">— {t('shiModeYtHint')}</span></label>
            </fieldset>
            <label style={{ display: 'grid', gap: 4, marginBottom: 12 }}><span className="meta">{t('shiAuthor')}</span>
              <input value={opt.author} maxLength={120} onChange={(e) => setOpt({ ...opt, author: e.target.value })} /></label>
            <CategoryPicker cats={cats} mode="single" value={opt.categoryId} onChange={(v) => setOpt({ ...opt, categoryId: v })} t={t} label={t('category')} />
            <CategoryPicker cats={cats} mode="multi" max={MAX_EXTRA} value={opt.extra} exclude={opt.categoryId} onChange={(v) => setOpt({ ...opt, extra: v })} t={t} label={t('txExtra')} />
            <fieldset style={{ border: 0, padding: 0, margin: '12px 0' }}>
              <legend className="meta">{t('shiAudience')}</legend>
              <label><input type="radio" name="aud" checked={opt.catalogue === 'adult'} onChange={() => setOpt({ ...opt, catalogue: 'adult' })} /> {t('shiAdults')}</label>{' '}
              <label><input type="radio" name="aud" checked={opt.catalogue === 'kids'} onChange={() => setOpt({ ...opt, catalogue: 'kids' })} /> {t('shiKids')}</label>
              {opt.catalogue === 'kids' && <div style={{ marginTop: 6 }}><span className="meta">{t('shiBands')} </span>{BANDS.map((b) => <label key={b} style={{ marginInlineEnd: 10 }}><input type="checkbox" checked={opt.bands.includes(b)} onChange={() => toggleBand(b)} /> {b}</label>)}</div>}
            </fieldset>
            <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
              <legend className="meta">{t('shiPublish')}</legend>
              <label><input type="radio" name="st" checked={opt.status === 'draft'} onChange={() => setOpt({ ...opt, status: 'draft' })} /> {t('shiDraft')}</label>{' '}
              <label><input type="radio" name="st" checked={opt.status === 'published'} onChange={() => setOpt({ ...opt, status: 'published' })} /> {t('shiPublished')}</label>
            </fieldset>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '14px 0', padding: 12, border: '1px solid var(--line)', borderRadius: 8 }}>
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} style={{ marginTop: 4 }} />
              <span>{mode === 'copy' ? t('shiRightsCopy') : t('shiRightsPlay')}</span>
            </label>
            <button type="button" className="btn" disabled={!canStart} onClick={start}>{t('shiImport').replace('{n}', sel.length)}</button>
            {!rights && sel.length > 0 && <p className="meta">{t('shiNeedRights')}</p>}
          </section>
        </>
      )}

      <section className="sd-card" aria-labelledby="shi-mine">
        <h2 id="shi-mine">{t('shiMine')}</h2>
        {mine.length === 0 ? <p className="meta">{t('shiNoneYet')}</p> : (
          <ul className="sh-list">
            {mine.map((s) => (
              <li key={s.id} className="sh-li" data-short={s.id}>
                {s.videoUrl ? <video className="sh-thumb" src={s.videoUrl} poster={s.posterUrl || undefined} preload="metadata" muted playsInline controls aria-label={s.title} />
                  : s.posterUrl ? <img className="sh-thumb" src={s.posterUrl} alt="" width="72" style={{ borderRadius: 6, objectFit: 'cover', aspectRatio: '9 / 16' }} /> : null}
                <div className="sh-li-text">
                  <b dir="auto">{s.title}</b>
                  <span className="meta">{s.credit || '—'}{s.duration != null && ` · ${mmss(s.duration)}`} · {s.play === 'youtube' ? t('shiModeYt') : t('shiModeCopy')} · {s.catalogue === 'kids' ? t('shiKids') : t('shiAdults')} · {t('shrViews').replace('{n}', s.views.toLocaleString(locale))}</span>
                  <span className={`sh-state ${s.status}`}>{stateLabel(s)}</span>
                  {s.copy?.status === 'failed' && <span className="meta small" role="note">{s.copy.error}</span>}
                  {s.importedBy && <span className="meta small">{t('shiBy').replace('{name}', s.importedBy)}</span>}
                </div>
                <div className="sh-li-act">
                  {s.copy?.status === 'failed' && <button type="button" className="btn" disabled={busy === `s${s.id}`} onClick={() => act(`s${s.id}`, `/studio/shorts/${s.id}/copy-retry`, { method: 'POST' }, t('shiRetried'))}>{t('shiRetry')}</button>}
                  {s.status === 'draft'
                    ? <button type="button" className="btn" disabled={busy === `s${s.id}` || s.copy?.status === 'failed'} onClick={() => act(`s${s.id}`, `/studio/shorts/${s.id}`, { method: 'PUT', body: JSON.stringify({ status: 'published' }) }, t('shrPublished'))}>{t('shrPublish')}</button>
                    : <button type="button" className="btn ghost" disabled={busy === `s${s.id}`} onClick={() => act(`s${s.id}`, `/studio/shorts/${s.id}`, { method: 'PUT', body: JSON.stringify({ status: 'draft' }) }, t('shiUnpublished'))}>{t('shrWithdraw')}</button>}
                  <button type="button" className="btn ghost" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>{t('shiClassify')}</button>
                  <button type="button" className="btn ghost danger" disabled={busy === `s${s.id}`} onClick={() => { if (window.confirm(t('shrConfirmDelete'))) act(`s${s.id}`, `/studio/shorts/${s.id}`, { method: 'DELETE' }, t('shrDeleted')); }}>{t('shrDelete')}</button>
                </div>
                {open === s.id && <div style={{ flexBasis: '100%' }}><Classify s={s} cats={cats} t={t} busy={busy === `s${s.id}`} onSave={async (body) => { const r = await act(`s${s.id}`, `/studio/shorts/${s.id}`, { method: 'PUT', body: JSON.stringify(body) }, t('saved')); if (r.ok) setOpen(null); }} /></div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
