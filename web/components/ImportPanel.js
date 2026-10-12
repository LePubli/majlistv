'use client';
// Import d'une playlist, d'une chaîne ou d'un album YouTube / Vimeo :
// 1) analyse de l'adresse (le serveur liste les vidéos), 2) choix des vidéos et des réglages communs, 3) création.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';
import { langName } from './Transcript';

const TR_LANGS = ['ar', 'de', 'en', 'es', 'fr', 'id', 'it', 'nl', 'pt', 'ru', 'tr', 'ur'];
const dur = (s) => (s ? `${Math.floor(s / 60)} min` : '');

export default function ImportPanel({ cats, onImported }) {
  const { t, call, locale } = useApp();
  const [url, setUrl] = useState('');
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [o, setO] = useState({ language: 'fr', categoryId: '', access: 'free', speaker: '', translateTo: [], rightsConfirmed: false });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(() => call('/imports').then((r) => r.ok && setHistory(r.data)), [call]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const open = useCallback(async (id) => {
    const r = await call('/imports/' + id);
    if (!r.ok) return;
    setJob(r.data);
    if (r.data.status === 'listed') setPicked(new Set(r.data.entries.filter((e) => !e.already).map((e) => e.id)));
  }, [call]);

  // Pendant l'analyse, on interroge le serveur toutes les 2 secondes.
  useEffect(() => {
    if (!job || job.status !== 'listing') return undefined;
    const id = setInterval(() => open(job.id), 2000);
    return () => clearInterval(id);
  }, [job, open]);

  const analyse = async (e) => {
    e.preventDefault();
    setMsg(null); setBusy(true);
    const r = await call('/imports', { method: 'POST', body: JSON.stringify({ url }) });
    setBusy(false);
    if (r.ok) { setJob(r.data); setUrl(''); loadHistory(); } else setMsg({ ok: false, text: r.data.error || t('errGeneric') });
  };
  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectable = job?.entries?.filter((e) => !e.already) || [];
  const allOn = selectable.length > 0 && selectable.every((e) => picked.has(e.id));
  const toggleLang = (c) => setO({ ...o, translateTo: o.translateTo.includes(c) ? o.translateTo.filter((x) => x !== c) : [...o.translateTo, c] });

  const confirm = async () => {
    setBusy(true); setMsg(null);
    const body = { ...o, ids: [...picked], categoryId: o.categoryId ? Number(o.categoryId) : null, translateTo: o.rightsConfirmed ? o.translateTo : [] };
    const r = await call(`/imports/${job.id}/confirm`, { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: t('importDone').replace('{n}', r.data.created) + (r.data.skipped ? ' ' + t('importSkipped').replace('{n}', r.data.skipped) : '') });
      setJob(null); loadHistory(); onImported?.();
    } else setMsg({ ok: false, text: r.data.error || t('errGeneric') });
  };
  const retry = async (id) => { await call(`/imports/${id}/retry`, { method: 'POST' }); open(id); loadHistory(); };

  return (
    <section className="form import">
      <h2>{t('importTitle')}</h2>
      <p className="meta">{t('importHelp')}</p>
      <form onSubmit={analyse} className="import-row">
        <input type="url" required placeholder="youtube.com/@chaine, /playlist?list=…, vimeo.com/album/…, archive.org/details/…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label={t('importUrl')} />
        <button className="btn" disabled={busy}>{t('importAnalyse')}</button>
      </form>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'}>{msg.text}</p>}

      {job && job.status === 'listing' && <p className="meta">{t('importListing')}</p>}
      {job && job.status === 'failed' && <p className="error">{job.error} <button className="link" onClick={() => retry(job.id)}>{t('retryTr')}</button></p>}
      {job && job.status === 'listed' && (
        <div className="import-list">
          <div className="import-head">
            <strong>{job.title || job.url}</strong> · {job.count} {t('importVideos')}
            {selectable.length > 0 && <button className="link" onClick={() => setPicked(allOn ? new Set() : new Set(selectable.map((e) => e.id)))}>{allOn ? t('importNone') : t('importAll')}</button>}
          </div>
          <ul>
            {job.entries.map((e) => (
              <li key={e.source + e.id} className={e.already ? 'already' : ''}>
                <label>
                  <input type="checkbox" disabled={e.already} checked={!e.already && picked.has(e.id)} onChange={() => toggle(e.id)} />
                  <span className="imp-thumb" style={{ backgroundImage: `url(${e.thumb || (e.source === 'youtube' ? `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg` : '')})` }} />
                  <span className="imp-title">{e.title}</span>
                  <span className="meta">{e.already ? t('importAlready') : dur(e.duration)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="import-opts">
            <label>{t('language')}<input required pattern="[a-z]{2}(-[A-Z]{2})?" value={o.language} onChange={(e) => setO({ ...o, language: e.target.value })} /></label>
            <label>{t('speaker')}<input value={o.speaker} onChange={(e) => setO({ ...o, speaker: e.target.value })} /></label>
            <label>{t('category')}
              <select value={o.categoryId} onChange={(e) => setO({ ...o, categoryId: e.target.value })}>
                <option value="">—</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>{t('access')}
              <select value={o.access} onChange={(e) => setO({ ...o, access: e.target.value })}>
                <option value="free">{t('free')}</option>
                <option value="premium">{t('premium')}</option>
              </select>
            </label>
          </div>
          <label className="check rights"><input type="checkbox" checked={o.rightsConfirmed} onChange={(e) => setO({ ...o, rightsConfirmed: e.target.checked })} /> {t('rightsConfirm')}</label>
          {o.rightsConfirmed && (
            <fieldset className="langs">
              <legend>{t('translateTo')}</legend>
              {TR_LANGS.filter((c) => c !== o.language.split('-')[0]).map((c) => (
                <label key={c} className="check"><input type="checkbox" checked={o.translateTo.includes(c)} onChange={() => toggleLang(c)} /> {langName(c, locale)}</label>
              ))}
            </fieldset>
          )}
          <button className="btn" disabled={busy || picked.size === 0} onClick={confirm}>{t('importConfirm').replace('{n}', picked.size)}</button>
        </div>
      )}

      {history.length > 0 && (
        <details className="import-history">
          <summary>{t('importHistory')}</summary>
          <ul>
            {history.map((h) => (
              <li key={h.id}>
                <button className="link" onClick={() => open(h.id)}>{h.title || h.url}</button>
                <span className="meta"> · {t('importStatus_' + h.status)}{h.imported ? ` · ${h.imported} ${t('importVideos')}` : ''}</span>
                {h.status === 'failed' && <button className="link" onClick={() => retry(h.id)}> {t('retryTr')}</button>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
