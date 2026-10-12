'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { uploadFile } from '../../lib/upload';
import { langName } from '../../components/Transcript';
import ImportPanel from '../../components/ImportPanel';

// Langues de sous-titres proposées (doit correspondre à api/src/langs.js).
const TR_LANGS = ['ar', 'de', 'en', 'es', 'fr', 'id', 'it', 'nl', 'pt', 'ru', 'tr', 'ur'];

const empty = { title: '', description: '', speaker: '', language: 'fr', categoryId: '', access: 'free', videoUrl: '', translateTo: [], rightsConfirmed: false };

// Espace organisateur : ajout (lien YouTube/Vimeo ou fichier vidéo) et suppression de ses conférences.
export default function Organizer() {
  const { user, ready, t, call, locale } = useApp();
  const router = useRouter();
  const [f, setF] = useState(empty);
  const [mode, setMode] = useState('link');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [cats, setCats] = useState([]);
  const [mine, setMine] = useState([]);
  const [err, setErr] = useState('');
  const allowed = !!user && ['organizer', 'admin'].includes(user.role);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleLang = (code) => setF({ ...f, translateTo: f.translateTo.includes(code) ? f.translateTo.filter((c) => c !== code) : [...f.translateTo, code] });
  const srcLang = (code) => String(code || '').split('-')[0].toLowerCase();
  const load = useCallback(() => call('/me/talks').then((r) => r.ok && setMine(r.data)), [call]);

  // Rafraîchit la liste tant qu'une conversion est en cours.
  const busyTr = (x) => (x.translations || []).some((tr) => ['pending', 'processing'].includes(tr.status))
    || (x.insights || []).some((i) => ['pending', 'processing'].includes(i.status));
  const converting = mine.some((x) => ['pending', 'processing'].includes(x.status)
    || (x.status === 'ready' && ['pending', 'processing'].includes(x.transcriptStatus))
    || (x.transcriptStatus === 'ready' && busyTr(x)));
  useEffect(() => {
    if (!converting) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [converting, load]);
  const statusLabel = (x) => (x.status === 'pending' ? t('queued')
    : x.status === 'processing' ? `${t('converting')} ${x.progress} %`
    : x.status === 'failed' ? t('convFailed')
    : x.transcriptStatus === 'pending' ? `${t('transcribingList')} : ${t('queued').toLowerCase()}`
    : x.transcriptStatus === 'processing' ? `${t('transcribing')} ${x.transcriptProgress} %`
    : x.transcriptStatus === 'failed' ? t('transcriptFailed') : '');

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  useEffect(() => {
    if (!allowed) return;
    load();
    call('/categories', {}, null).then((r) => r.ok && setCats(r.data));
  }, [allowed, load, call]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const body = { ...f, categoryId: f.categoryId ? Number(f.categoryId) : undefined };
    if (mode !== 'file') {
      // Lien YouTube / Vimeo : transcription et traductions seulement avec l'accord de l'auteur.
      body.translateTo = f.rightsConfirmed ? f.translateTo.filter((c) => c !== srcLang(f.language)) : [];
    } else delete body.rightsConfirmed;
    try {
      if (mode === 'file') {
        if (!file) return;
        delete body.videoUrl;
        body.translateTo = f.translateTo.filter((c) => c !== srcLang(f.language));
        setProgress(0);
        body.uploadId = await uploadFile(file, call, setProgress);
      }
      const r = await call('/talks', { method: 'POST', body: JSON.stringify(body) });
      if (r.ok) { setF(empty); setFile(null); load(); } else setErr(r.status === 409 ? t('errDuplicate') : t('errVideo'));
    } catch (e2) {
      setErr(e2.message === 'tooBig' ? t('errTooBig') : t('errUpload'));
    }
    setProgress(null);
  };
  const remove = async (id) => { await call('/talks/' + id, { method: 'DELETE' }); load(); };
  const addTr = async (id, lang) => { if (lang) { await call(`/talks/${id}/translations`, { method: 'POST', body: JSON.stringify({ lang }) }); load(); } };
  const removeTr = async (id, lang) => { await call(`/talks/${id}/translations/${lang}`, { method: 'DELETE' }); load(); };
  // YouTube / Vimeo déjà ajoutée : activer (ou relancer) la transcription, avec l'accord de l'auteur.
  const transcribe = async (x) => {
    if (x.source !== 'upload' && !x.rightsConfirmed && !window.confirm(t('rightsConfirm'))) return;
    await call(`/talks/${x.id}/transcribe`, { method: 'POST', body: JSON.stringify({ rightsConfirmed: x.source !== 'upload' }) });
    load();
  };
  const regenInsights = async (id) => { await call(`/talks/${id}/insights/regenerate`, { method: 'POST' }); load(); };
  const insState = (x) => { const l = x.insights || []; return l.some((i) => i.status === 'failed') ? 'failed' : l.some((i) => ['pending', 'processing'].includes(i.status)) ? 'processing' : l.length ? 'ready' : 'pending'; };
  const trState = (tr) => (tr.status === 'ready' ? '✓' : tr.status === 'processing' ? `${tr.progress} %` : tr.status === 'failed' ? '⚠' : t('trWaiting'));

  if (!user) return null;
  if (!allowed) return <main className="card"><p>{t('noAccess')}</p></main>;
  const busy = progress !== null;
  return (
    <main className="page">
      <h1>{t('myTalks')}</h1>
      <form onSubmit={submit} className="form">
        <h2>{t('addTalk')}</h2>
        <label>{t('talkTitle')}<input required maxLength={200} value={f.title} onChange={set('title')} /></label>
        <label>{t('source')}
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="link">{t('linkMode')}</option>
            <option value="file">{t('fileMode')}</option>
          </select>
        </label>
        {mode === 'link'
          ? <label>{t('videoUrl')}<input required type="url" value={f.videoUrl} onChange={set('videoUrl')} /></label>
          : <label>{t('videoFile')}<input required type="file" accept="video/*" onChange={(e) => setFile(e.target.files[0] || null)} /></label>}
        <label>{t('speaker')}<input value={f.speaker} onChange={set('speaker')} /></label>
        <label>{t('description')}<textarea rows={4} value={f.description} onChange={set('description')} /></label>
        <label>{t('language')}<input required pattern="[a-z]{2}(-[A-Z]{2})?" value={f.language} onChange={set('language')} /></label>
        <label>{t('category')}
          <select value={f.categoryId} onChange={set('categoryId')}>
            <option value="">—</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>{t('access')}
          <select value={f.access} onChange={set('access')}>
            <option value="free">{t('free')}</option>
            <option value="premium">{t('premium')}</option>
          </select>
        </label>
        {mode === 'link' && (
          <label className="check rights"><input type="checkbox" checked={f.rightsConfirmed} onChange={(e) => setF({ ...f, rightsConfirmed: e.target.checked })} /> {t('rightsConfirm')}</label>
        )}
        {(mode === 'file' || f.rightsConfirmed) && (
          <fieldset className="langs">
            <legend>{t('translateTo')}</legend>
            {TR_LANGS.filter((c) => c !== srcLang(f.language)).map((c) => (
              <label key={c} className="check"><input type="checkbox" checked={f.translateTo.includes(c)} onChange={() => toggleLang(c)} /> {langName(c, locale)}</label>
            ))}
            <p className="meta">{t('translateHint')}</p>
          </fieldset>
        )}
        {busy && <><progress value={progress} max="1" /><p className="meta">{t('uploading')} {Math.round(progress * 100)} %</p></>}
        {err && <p className="error">{err}</p>}
        <button className="btn" disabled={busy}>{t('publish')}</button>
      </form>
      <ImportPanel cats={cats} onImported={load} />
      {mine.length === 0 && <p className="soon">{t('noTalks')}</p>}
      <ul className="mine">
        {mine.map((x) => (
          <li key={x.id}>
            <div className="mine-main">
              <Link href={`/talks/${x.id}`}>{x.title}</Link>
              {statusLabel(x) && <span className={`status ${x.status === 'failed' || x.transcriptStatus === 'failed' ? 'failed' : ''}`}>{statusLabel(x)}</span>}
              {x.transcriptStatus === 'failed' && x.transcriptError && <p className="meta small error">{x.transcriptError} <button className="link" onClick={() => transcribe(x)}>{t('retryTr')}</button></p>}
              {x.source !== 'upload' && !x.rightsConfirmed && (
                <p className="meta small">{t('externalNoTranscript')} <button className="link" onClick={() => transcribe(x)}>{t('enableTranscript')}</button></p>
              )}
              {(x.source === 'upload' ? x.status === 'ready' : x.rightsConfirmed) && x.transcriptStatus !== 'unavailable' && x.transcriptStatus !== 'failed' && (
                <div className="chips">
                  {(x.translations || []).map((tr) => (
                    <span key={tr.lang} className={`chip ${tr.status}`}>
                      {langName(tr.lang, locale)} · {trState(tr)}
                      {tr.status === 'failed' && <button className="link" onClick={() => addTr(x.id, tr.lang)}>{t('retryTr')}</button>}
                      {['ready', 'failed'].includes(tr.status) && <button className="link" aria-label={t('removeTr')} title={t('removeTr')} onClick={() => removeTr(x.id, tr.lang)}>×</button>}
                    </span>
                  ))}
                  <span className={`chip ${insState(x)}`} title={(x.insights || []).map((i) => i.error).filter(Boolean).join(' / ') || undefined}>
                    {t('insightsLabel')} · {{ ready: '✓', failed: '⚠', processing: '…', pending: t('trWaiting') }[insState(x)]}
                    {['ready', 'failed'].includes(insState(x)) && <button className="link" onClick={() => regenInsights(x.id)}>{t('regenInsights')}</button>}
                  </span>
                  <select value="" onChange={(e) => addTr(x.id, e.target.value)} aria-label={t('addLang')}>
                    <option value="">{t('addLang')}</option>
                    {TR_LANGS.filter((c) => c !== srcLang(x.transcriptLanguage || x.language) && !(x.translations || []).some((tr) => tr.lang === c))
                      .map((c) => <option key={c} value={c}>{langName(c, locale)}</option>)}
                  </select>
                </div>
              )}
            </div>
            <button className="link" onClick={() => remove(x.id)}>{t('delete')}</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
