'use client';
// Studio → fiche d'un ouvrage : informations, publication, couverture, PDF par langue (droits confirmés), liens boutique, rattachements.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '../../../../components/Providers';
import { langName } from '../../../../components/Transcript';

const LANGS = ['fr', 'ar', 'en', 'es', 'de', 'tr', 'ur', 'id', 'ru'];
const size = (n) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1048576).toFixed(1).replace(/\.0$/, '')} Mo`);

// Couverture réduite à 600 px de large au plus (JPEG).
function resizeCover(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 600 / img.width, 900 / img.height);
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad')); };
    img.src = url;
  });
}
// Envoi du PDF directement vers le stockage, avec la progression.
const put = (url, file, onProgress) => new Promise((resolve, reject) => {
  const x = new XMLHttpRequest();
  x.open('PUT', url); x.setRequestHeader('Content-Type', 'application/pdf');
  x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
  x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`HTTP ${x.status}`)));
  x.onerror = () => reject(new Error('network'));
  x.send(file);
});

export default function StudioBook() {
  const { id } = useParams();
  const router = useRouter();
  const { t, call, locale } = useApp();
  const [b, setB] = useState(undefined);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const [targets, setTargets] = useState({ talks: [], series: [] });
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState({ talks: new Set(), series: new Set() });
  const [pdf, setPdf] = useState({ lang: 'fr', rights: false, progress: null, err: null });
  const [lk, setLk] = useState({ lang: 'fr', label: '', url: '' });
  const [coverMsg, setCoverMsg] = useState(null);
  const fileRef = useRef(null); const coverRef = useRef(null);

  const apply = useCallback((d) => { setB(d); setF((v) => v || { title: d.title, author: d.author, description: d.description }); setSel({ talks: new Set(d.talks.map((x) => x.id)), series: new Set(d.series.map((x) => x.id)) }); }, []);
  const load = useCallback(async () => { const r = await call(`/studio/books/${id}`); if (r.ok) apply(r.data); else setB(null); }, [call, id, apply]);
  useEffect(() => { load(); call('/studio/books-targets').then((r) => r.ok && setTargets(r.data)); }, [load, call]);
  if (b === undefined || !f) return null;
  if (b === null) return <main className="studio-page"><p>{t('bkMissing')}</p><Link href="/studio/books">{t('bkNav')}</Link></main>;

  const fail = (r) => setMsg({ ok: false, text: r.data?.code === 'no_edition' ? t('bkNeedEdition') : (r.data?.error || t('errGeneric')) });
  const patch = async (body, okText) => {
    setMsg(null);
    const r = await call(`/studio/books/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (!r.ok) { fail(r); return false; }
    apply(r.data); if (okText) setMsg({ ok: true, text: okText }); return true;
  };
  const dirty = f.title !== b.title || f.author !== b.author || f.description !== b.description;
  const saveInfo = (e) => { e.preventDefault(); patch({ title: f.title, author: f.author, description: f.description }, t('saved')); };
  const toggle = (kind, key) => setSel((s) => { const n = new Set(s[kind]); n.has(key) ? n.delete(key) : n.add(key); return { ...s, [kind]: n }; });
  const saveTargets = () => patch({ talkIds: [...sel.talks], seriesIds: [...sel.series] }, t('saved'));

  const cover = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setCoverMsg(t('thumbBad')); return; }
    setCoverMsg(null);
    try {
      const image = await resizeCover(file);
      const r = await call(`/studio/books/${id}/cover`, { method: 'POST', body: JSON.stringify({ image }) });
      if (!r.ok) setCoverMsg(r.data?.error || t('errGeneric')); else load();
    } catch { setCoverMsg(t('thumbBad')); }
  };

  const sendPdf = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setPdf((p) => ({ ...p, err: null, progress: 0 }));
    try {
      const u = await call(`/studio/books/${id}/pdf/${pdf.lang}/upload-url`, { method: 'POST', body: JSON.stringify({ size: file.size }) });
      if (!u.ok) throw new Error(u.data?.code === 'too_big' ? t('bkTooBig') : (u.data?.error || t('errGeneric')));
      await put(u.data.url, file, (n) => setPdf((p) => ({ ...p, progress: n })));
      const c = await call(`/studio/books/${id}/pdf/${pdf.lang}/confirm`, { method: 'POST', body: JSON.stringify({ key: u.data.key, fileName: file.name, rightsConfirmed: pdf.rights }) });
      if (!c.ok) throw new Error(c.data?.code === 'rights_required' ? t('bkRightsNeeded') : (c.data?.error || t('errGeneric')));
      apply(c.data); fileRef.current.value = '';
      setPdf((p) => ({ ...p, rights: false, progress: null }));
    } catch (err) { setPdf((p) => ({ ...p, progress: null, err: err.message })); }
  };
  const setRights = async (lang, on) => { const r = await call(`/studio/books/${id}/pdf/${lang}`, { method: 'PATCH', body: JSON.stringify({ rightsConfirmed: on }) }); if (r.ok) apply(r.data); else fail(r); };
  const delPdf = async (lang) => { if (!window.confirm(t('bkDelPdfConfirm'))) return; await call(`/studio/books/${id}/pdf/${lang}`, { method: 'DELETE' }); load(); };
  const addLink = async (e) => {
    e.preventDefault(); setMsg(null);
    const r = await call(`/studio/books/${id}/links`, { method: 'POST', body: JSON.stringify(lk) });
    if (!r.ok) { fail(r); return; }
    setLk({ ...lk, label: '', url: '' }); load();
  };
  const delLink = async (lid) => { await call(`/studio/books/${id}/links/${lid}`, { method: 'DELETE' }); load(); };
  const del = async () => { if (!window.confirm(t('bkDelConfirm'))) return; await call(`/studio/books/${id}`, { method: 'DELETE' }); router.push('/studio/books'); };

  const match = (x) => !filter.trim() || x.title.toLowerCase().includes(filter.trim().toLowerCase());
  const pill = (on, label, onClick) => <button type="button" aria-pressed={on} className={on ? 'pill on' : 'pill'} onClick={onClick}>{label}</button>;
  const langSelect = (value, onChange) => <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('bkLang')}>{LANGS.map((l) => <option key={l} value={l}>{langName(l, locale)}</option>)}</select>;

  return (
    <main className="studio-page">
      <div className="studio-head"><div><Link href="/studio/books" className="back">← {t('bkNav')}</Link><h1 className="studio-title">{b.title}</h1></div>
        {b.published && <Link className="btn ghost" href={`/books/${b.id}`} target="_blank">{t('bkView')}</Link>}</div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}

      <form className="panel" onSubmit={saveInfo}>
        <h2 className="panel-title">{t('sectInfo')}</h2>
        <div className="fld" role="group" aria-label={t('bkPublished')}>
          <div className="pills">{pill(b.published, t('srPub'), () => patch({ published: true }))}{pill(!b.published, t('srDraft'), () => patch({ published: false }))}</div>
          <span className="meta small">{t('bkPublishHelp')}</span>
        </div>
        <label className="fld"><span>{t('bkName')}</span><input required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="fld"><span>{t('bkAuthor')}</span><input maxLength={200} value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} /></label>
        <label className="fld"><span>{t('bkDesc')}</span><textarea rows={6} maxLength={5000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="panel-actions"><button className="btn" disabled={!dirty}>{dirty ? t('save') : t('nothingToSave')}</button></div>
      </form>

      <section className="panel">
        <h2 className="panel-title">{t('bkCover')}</h2>
        <div className="bk-coveredit">
          <span className="bk-cover" style={b.coverUrl ? { backgroundImage: `url(${b.coverUrl})` } : undefined} aria-hidden="true">{!b.coverUrl && <span>📖</span>}</span>
          <div><button type="button" className="btn ghost" onClick={() => coverRef.current?.click()}>{t('bkCoverUpload')}</button>
            <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={cover} />
            {coverMsg && <p className="error" role="alert">{coverMsg}</p>}</div>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">{t('bkPdf')}</h2>
        <p className="meta small">{t('bkPdfHelp')}</p>
        {b.files.length > 0 && (
          <ul className="bk-files">{b.files.map((x) => (
            <li key={x.lang}>
              <b>{langName(x.lang, locale)}</b> <span className="meta small">{x.fileName} · {t('bkPages').replace('{n}', x.pages)} · {size(x.sizeBytes)}</span>
              <span className={`rm-tag ${x.rightsConfirmed ? 'approved' : 'draft'}`}>{x.rightsConfirmed ? t('bkRightsOn') : t('bkRightsOff')}</span>
              <button type="button" className="link u small" onClick={() => setRights(x.lang, !x.rightsConfirmed)}>{x.rightsConfirmed ? t('bkRightsRemove') : t('bkRightsRestore')}</button>
              <button type="button" className="link u small" onClick={() => delPdf(x.lang)}>{t('delete')}</button>
            </li>))}</ul>
        )}
        <form className="bk-upload" onSubmit={sendPdf}>
          <div className="rm-row">{langSelect(pdf.lang, (lang) => setPdf({ ...pdf, lang }))}<input ref={fileRef} type="file" accept="application/pdf" required aria-label={t('bkPdfPick')} /></div>
          <label className="bk-rights"><input type="checkbox" checked={pdf.rights} onChange={(e) => setPdf({ ...pdf, rights: e.target.checked })} /> {t('bkRights')}</label>
          {pdf.err && <p className="error" role="alert">{pdf.err}</p>}
          {pdf.progress !== null && <div className="qp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pdf.progress}><span style={{ width: `${pdf.progress}%` }} /></div>}
          <div><button className="btn" disabled={!pdf.rights || pdf.progress !== null}>{pdf.progress !== null ? t('bkSending') : t('bkSend')}</button></div>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel-title">{t('bkLinks')}</h2>
        <p className="meta small">{t('bkLinksHelp')}</p>
        {b.links.length > 0 && <ul className="bk-files">{b.links.map((l) => (
          <li key={l.id}><b>{langName(l.lang, locale)}</b> <a href={l.url} target="_blank" rel="noopener noreferrer nofollow">{l.label}</a> <span className="meta small bk-url">{l.url}</span>
            <button type="button" className="link u small" onClick={() => delLink(l.id)}>{t('delete')}</button></li>))}</ul>}
        <form className="bk-upload" onSubmit={addLink}>
          <div className="rm-row">{langSelect(lk.lang, (lang) => setLk({ ...lk, lang }))}
            <input required maxLength={80} value={lk.label} onChange={(e) => setLk({ ...lk, label: e.target.value })} placeholder={t('bkLinkLabel')} aria-label={t('bkLinkLabel')} /></div>
          <div className="rm-row"><input required type="url" maxLength={1000} value={lk.url} onChange={(e) => setLk({ ...lk, url: e.target.value })} placeholder="https://…" aria-label={t('bkLinkUrl')} />
            <button className="btn ghost">{t('bkLinkAdd')}</button></div>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel-title">{t('bkTargets')}</h2>
        <p className="meta small">{t('bkTargetsHelp')}</p>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('bkFilter')} aria-label={t('bkFilter')} />
        <div className="bk-targets">
          <fieldset><legend>{t('bkTargetSeries')}</legend>{targets.series.filter(match).map((x) => <label key={x.id}><input type="checkbox" checked={sel.series.has(x.id)} onChange={() => toggle('series', x.id)} /> {x.title}</label>)}</fieldset>
          <fieldset><legend>{t('bkTargetTalks')}</legend>{targets.talks.filter(match).slice(0, 80).map((x) => <label key={x.id}><input type="checkbox" checked={sel.talks.has(x.id)} onChange={() => toggle('talks', x.id)} /> {x.title}</label>)}</fieldset>
        </div>
        <div className="panel-actions"><button type="button" className="btn" onClick={saveTargets}>{t('save')}</button></div>
      </section>

      <div className="panel-actions"><button type="button" className="link u danger" onClick={del}>{t('bkDelete')}</button></div>
    </main>
  );
}
