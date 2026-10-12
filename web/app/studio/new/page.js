'use client';
// Studio → Nouvelle conférence : lien (YouTube, Vimeo, archive.org) ou fichier vidéo, et import de listes.
// (Formulaire en 2 étapes avec aperçu de la carte : étape 10.3.)
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import { uploadFile } from '../../../lib/upload';
import { langName } from '../../../components/Transcript';
import ImportPanel from '../../../components/ImportPanel';

// Langues de sous-titres proposées (doit correspondre à api/src/langs.js).
const TR_LANGS = ['ar', 'de', 'en', 'es', 'fr', 'id', 'it', 'nl', 'pt', 'ru', 'tr', 'ur'];
const empty = { title: '', description: '', speaker: '', language: 'fr', categoryId: '', access: 'free', videoUrl: '', translateTo: [], rightsConfirmed: false };

export default function NewTalk() {
  const { t, call, locale } = useApp();
  const router = useRouter();
  const [f, setF] = useState(empty);
  const [mode, setMode] = useState('link');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [cats, setCats] = useState([]);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleLang = (code) => setF({ ...f, translateTo: f.translateTo.includes(code) ? f.translateTo.filter((c) => c !== code) : [...f.translateTo, code] });
  const srcLang = (code) => String(code || '').split('-')[0].toLowerCase();
  useEffect(() => { call('/categories', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const body = { ...f, categoryId: f.categoryId ? Number(f.categoryId) : undefined };
    if (mode !== 'file') {
      // Lien YouTube / Vimeo / archive.org : transcription et traductions seulement avec l'accord de l'auteur.
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
      if (r.ok) { router.push(`/studio/${r.data.id}`); return; }
      setErr(r.status === 409 ? t('errDuplicate') : r.data?.code === 'archive' ? r.data.error : t('errVideo'));
    } catch (e2) {
      setErr(e2.message === 'tooBig' ? t('errTooBig') : t('errUpload'));
    }
    setProgress(null);
  };

  const busy = progress !== null;
  return (
    <main className="studio-page studio-narrow">
      <h1 className="studio-title">{t('newTalk')}</h1>
      <form onSubmit={submit} className="form">
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
      <ImportPanel cats={cats} onImported={() => router.push('/studio')} />
    </main>
  );
}
