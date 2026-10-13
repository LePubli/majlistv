'use client';
// Studio → Nouvelle conférence, en 2 étapes :
//   1. Vidéo : glisser-déposer un fichier (l'envoi démarre aussitôt) ou coller un lien YouTube / Vimeo / archive.org.
//   2. Informations : titre, intervenant, langue, catégorie, accès… avec l'aperçu de la carte telle qu'elle apparaîtra.
// Pendant l'envoi du fichier, on remplit déjà les informations ; « Publier » attend la fin de l'envoi.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import { uploadFile } from '../../../lib/upload';
import { langName } from '../../../components/Transcript';
import ImportPanel from '../../../components/ImportPanel';
import { LEVELS, levelLabel } from '../../../lib/levels';

// Langues de sous-titres proposées (doit correspondre à api/src/langs.js).
const TR_LANGS = ['ar', 'de', 'en', 'es', 'fr', 'id', 'it', 'nl', 'pt', 'ru', 'tr', 'ur'];
const QUICK_LANGS = ['fr', 'ar', 'en'];
const base = (c) => String(c || '').split('-')[0].toLowerCase();

// Reconnaît le lien et renvoie { source, ref } (même logique que l'API, qui revérifie de toute façon).
function parseLink(raw) {
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  const host = u.hostname.replace(/^(www|m)\./, '');
  if (host === 'youtu.be') return /^[\w-]{11}$/.test(u.pathname.slice(1)) ? { source: 'youtube', ref: u.pathname.slice(1) } : null;
  if (host === 'youtube.com') {
    const m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})/);
    const id = m ? m[1] : u.searchParams.get('v');
    return id && /^[\w-]{11}$/.test(id) ? { source: 'youtube', ref: id } : null;
  }
  if (host === 'vimeo.com') return /^\/\d+/.test(u.pathname) ? { source: 'vimeo', ref: u.pathname.slice(1).split('/')[0] } : null;
  if (host === 'archive.org') return /^\/details\/[^/]+/.test(u.pathname) ? { source: 'archive', ref: u.pathname.split('/')[2] } : null;
  return null;
}
const cleanName = (name) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

// Image de la vidéo envoyée (une image prise à 2 s), uniquement pour l'aperçu local.
function frameOf(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.preload = 'metadata'; v.src = url;
    const done = (img) => { URL.revokeObjectURL(url); resolve(img); };
    const timer = setTimeout(() => done(null), 6000);
    v.onloadedmetadata = () => { v.currentTime = Math.min(2, (v.duration || 2) / 2); };
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 480; c.height = Math.round((480 * (v.videoHeight || 9)) / (v.videoWidth || 16));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        clearTimeout(timer); done(c.toDataURL('image/jpeg', 0.7));
      } catch { clearTimeout(timer); done(null); }
    };
    v.onerror = () => { clearTimeout(timer); done(null); };
  });
}

export default function NewTalk() {
  const { t, call, locale } = useApp();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [link, setLink] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [up, setUp] = useState({ state: 'idle', pct: 0, id: null }); // idle | sending | done | failed
  const [frame, setFrame] = useState(null);
  const [cats, setCats] = useState([]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ title: '', description: '', speaker: '', language: 'fr', categoryId: '', access: 'free', level: '', translateTo: [], rightsConfirmed: false });
  const token = useRef(0);
  const fileInput = useRef(null);
  const parsed = link ? parseLink(link) : null;
  const mode = file ? 'file' : 'link';

  useEffect(() => { call('/categories', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);
  const patch = (o) => setF((x) => ({ ...x, ...o }));

  // Démarre l'envoi dès qu'un fichier est choisi, puis passe à l'étape 2.
  const pick = (files) => {
    const fl = files && files[0];
    if (!fl) return;
    if (!/^video\//.test(fl.type) && !/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(fl.name)) { setLinkErr(t('nwNotVideo')); return; }
    setLinkErr(''); setErr('');
    const mine = ++token.current;
    setFile(fl); setFrame(null); setUp({ state: 'sending', pct: 0, id: null });
    setF((x) => ({ ...x, title: x.title || cleanName(fl.name).slice(0, 200) }));
    setStep(2);
    frameOf(fl).then((img) => mine === token.current && setFrame(img));
    uploadFile(fl, call, (p) => mine === token.current && setUp((u) => ({ ...u, pct: p })))
      .then((id) => mine === token.current && setUp({ state: 'done', pct: 1, id }))
      .catch((e) => {
        if (mine !== token.current) return;
        setUp({ state: 'failed', pct: 0, id: null });
        setErr(e.message === 'tooBig' ? t('errTooBig') : t('nwSendFailed'));
      });
  };
  const useLink = (e) => {
    e.preventDefault();
    if (!parsed) { setLinkErr(t('nwBadLink')); return; }
    setLinkErr(''); setFile(null); setUp({ state: 'idle', pct: 0, id: null }); setStep(2);
  };
  const back = () => { token.current++; setStep(1); setFile(null); setUp({ state: 'idle', pct: 0, id: null }); setErr(''); };

  const toggleLang = (code) => patch({ translateTo: f.translateTo.includes(code) ? f.translateTo.filter((c) => c !== code) : [...f.translateTo, code] });
  const canTranslate = mode === 'file' || f.rightsConfirmed;

  const submit = async (e, publication = 'published') => {
    e?.preventDefault();
    if (saving || (mode === 'file' && up.state !== 'done')) return;
    setErr(''); setSaving(true);
    const body = { ...f, publication, categoryId: f.categoryId ? Number(f.categoryId) : undefined, level: f.level || undefined };
    body.translateTo = canTranslate ? f.translateTo.filter((c) => c !== base(f.language)) : [];
    if (mode === 'file') { body.uploadId = up.id; delete body.rightsConfirmed; } else body.videoUrl = link.trim();
    const r = await call('/talks', { method: 'POST', body: JSON.stringify(body) });
    if (r.ok) { router.push(`/studio/${r.data.id}`); return; }
    setSaving(false);
    setErr(r.status === 409 ? t('errDuplicate') : r.data?.code === 'archive' ? r.data.error : t('errVideo'));
  };

  // Aperçu de la carte (même rendu que le catalogue).
  const thumb = mode === 'file' ? frame : parsed?.source === 'youtube' ? `https://i.ytimg.com/vi/${parsed.ref}/hqdefault.jpg` : null;
  const catName = cats.find((c) => String(c.id) === String(f.categoryId))?.fullName;
  const sendingLabel = t('nwSending').replace('{n}', Math.round(up.pct * 100));

  return (
    <main className="studio-page studio-narrow">
      <h1 className="studio-title">{t('newTalk')}</h1>
      <ol className="wiz" aria-label={t('newTalk')}>
        <li className={step === 1 ? 'on' : 'done'} aria-current={step === 1 ? 'step' : undefined}><b>{step > 1 ? '✓' : '1'}</b>{t('nwStep1')}</li>
        <li className={step === 2 ? 'on' : ''} aria-current={step === 2 ? 'step' : undefined}><b>2</b>{t('nwStep2')}</li>
      </ol>

      {step === 1 && (
        <>
          <div
            className={`dropzone${drag ? ' over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
            <h2>{t('nwDropTitle')}</h2>
            <p className="meta">{t('nwDropHint')}</p>
            <button type="button" className="btn" onClick={() => fileInput.current?.click()}>{t('nwBrowse')}</button>
            <input ref={fileInput} type="file" accept="video/*" hidden onChange={(e) => pick(e.target.files)} />
          </div>
          <p className="wiz-or"><span>{t('nwDropOr')}</span></p>
          <form className="linkbox" onSubmit={useLink}>
            <label>
              <span className="lb-title">{t('nwLinkTitle')}</span>
              <span className="meta small">{t('nwLinkHint')}</span>
              <span className="linkrow">
                <input type="url" inputMode="url" placeholder="https://" value={link} onChange={(e) => { setLink(e.target.value); setLinkErr(''); }} required />
                <button className="btn">{t('nwLinkGo')}</button>
              </span>
            </label>
          </form>
          {linkErr && <p className="error">{linkErr}</p>}
          <ImportPanel cats={cats} onImported={() => router.push('/studio')} />
        </>
      )}

      {step === 2 && (
        <form onSubmit={submit} className="wiz-grid">
          <div className="wiz-form">
            {mode === 'file' && (
              <div className={`upbar up-${up.state}`} role="status">
                <div className="upbar-top">
                  <span className="upname">{file?.name}</span>
                  <span>{up.state === 'sending' ? sendingLabel : up.state === 'done' ? t('nwSent') : t('nwSendFailed')}</span>
                </div>
                <progress value={up.pct} max="1" />
                {up.state === 'failed' && <button type="button" className="link u" onClick={() => pick([file])}>{t('nwRetry')}</button>}
              </div>
            )}
            {mode === 'link' && <p className="meta linkline">{link.trim()}</p>}

            <label className="fld"><span>{t('talkTitle')}</span>
              <input required maxLength={200} placeholder={t('nwTitlePh')} value={f.title} onChange={(e) => patch({ title: e.target.value })} /></label>
            <label className="fld"><span>{t('speaker')}</span>
              <input placeholder={t('nwSpeakerPh')} value={f.speaker} onChange={(e) => patch({ speaker: e.target.value })} /></label>
            <label className="fld"><span>{t('description')}</span>
              <textarea rows={3} placeholder={t('nwDescPh')} value={f.description} onChange={(e) => patch({ description: e.target.value })} /></label>

            <div className="fld" role="group" aria-label={t('nwLangQ')}>
              <span>{t('nwLangQ')}</span>
              <div className="pills">
                {QUICK_LANGS.map((c) => (
                  <button key={c} type="button" aria-pressed={base(f.language) === c} className={base(f.language) === c ? 'pill on' : 'pill'} onClick={() => patch({ language: c })}>{langName(c, locale)}</button>
                ))}
                <select className="pill-select" aria-label={t('nwLangOther')} value={QUICK_LANGS.includes(base(f.language)) ? '' : base(f.language)} onChange={(e) => e.target.value && patch({ language: e.target.value })}>
                  <option value="">{t('nwLangOther')}</option>
                  {TR_LANGS.filter((c) => !QUICK_LANGS.includes(c)).map((c) => <option key={c} value={c}>{langName(c, locale)}</option>)}
                </select>
              </div>
            </div>

            <div className="fld" role="group" aria-label={t('category')}>
              <span>{t('category')}</span>
              <div className="pills">
                <button type="button" aria-pressed={!f.categoryId} className={!f.categoryId ? 'pill on' : 'pill'} onClick={() => patch({ categoryId: '' })}>{t('nwNoCat')}</button>
                {cats.map((c) => (
                  <button key={c.id} type="button" aria-pressed={String(f.categoryId) === String(c.id)} className={String(f.categoryId) === String(c.id) ? 'pill on' : 'pill'} onClick={() => patch({ categoryId: String(c.id) })}>{c.fullName || c.name}</button>
                ))}
              </div>
            </div>

            <div className="fld" role="group" aria-label={t('nwAccessQ')}>
              <span>{t('nwAccessQ')}</span>
              <div className="pills">
                {[['free', t('free'), t('nwFreeHelp')], ['premium', t('premium'), t('nwPremHelp')]].map(([k, label, help]) => (
                  <button key={k} type="button" aria-pressed={f.access === k} className={f.access === k ? 'pill on' : 'pill'} onClick={() => patch({ access: k })}>{label}</button>
                ))}
              </div>
              <span className="meta small">{f.access === 'free' ? t('nwFreeHelp') : t('nwPremHelp')}</span>
            </div>

            <div className="fld" role="group" aria-label={t('lvLabel')}>
              <span>{t('lvLabel')}</span>
              <div className="pills">
                <button type="button" aria-pressed={!f.level} className={!f.level ? 'pill on' : 'pill'} onClick={() => patch({ level: '' })}>{t('lvNone')}</button>
                {LEVELS.map((l) => (
                  <button key={l} type="button" aria-pressed={f.level === l} className={f.level === l ? 'pill on' : 'pill'} onClick={() => patch({ level: l })}>{levelLabel(l, t)}</button>
                ))}
              </div>
              <span className="meta small">{t('lvHelp')}</span>
            </div>

            {mode === 'link' && (
              <label className="check rights"><input type="checkbox" checked={f.rightsConfirmed} onChange={(e) => patch({ rightsConfirmed: e.target.checked })} /> {t('rightsConfirm')}</label>
            )}
            {canTranslate && (
              <fieldset className="langs">
                <legend>{t('translateTo')}</legend>
                {TR_LANGS.filter((c) => c !== base(f.language)).map((c) => (
                  <label key={c} className="check"><input type="checkbox" checked={f.translateTo.includes(c)} onChange={() => toggleLang(c)} /> {langName(c, locale)}</label>
                ))}
                <p className="meta">{t('translateHint')}</p>
              </fieldset>
            )}

            {err && <p className="error">{err}</p>}
            <div className="wiz-actions">
              <button type="button" className="btn ghost" onClick={back}>← {t('nwBack')}</button>
              <span className="wiz-right">
                <button type="button" className="btn ghost" disabled={saving || !f.title.trim() || (mode === 'file' && up.state !== 'done')} onClick={() => submit(null, 'draft')}>{t('nwSaveDraft')}</button>
                <button className="btn" disabled={saving || (mode === 'file' && up.state !== 'done')}>
                  {mode === 'file' && up.state === 'sending' ? t('nwWaitUpload') : t('publish')}
                </button>
              </span>
            </div>
          </div>

          <aside className="wiz-preview" aria-label={t('nwPreview')}>
            <div className="meta small">{t('nwPreview')}</div>
            <div className="talk preview-card">
              <div className="thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
                <span className={`badge ${f.access}`}>{t(f.access)}</span>
              </div>
              <h3>{f.title || t('nwTitlePh')}</h3>
              <p>{[f.speaker, catName].filter(Boolean).join(' · ') || langName(base(f.language), locale)}</p>
            </div>
          </aside>
        </form>
      )}
    </main>
  );
}
