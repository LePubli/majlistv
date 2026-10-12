'use client';
// Studio → fiche d'une conférence : modifier les informations, la publication (publiée / brouillon / programmée) et la miniature.
import { useEffect, useRef, useState } from 'react';
import { sourceLabel } from '../lib/talkState';

// ISO -> valeur d'un <input type="datetime-local"> (heure locale de l'appareil).
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const initial = (x) => ({
  title: x.title || '', speaker: x.speaker || '', description: x.description || '',
  categoryId: x.category_id ? String(x.category_id) : '', access: x.access,
  publication: x.publication || 'published', publishAt: toLocalInput(x.publishAt),
});

// Réduit l'image choisie à 1280×720 (recadrage centré) et la renvoie en data-URL JPEG.
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const W = 1280; const H = 720;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const k = Math.max(W / img.width, H / img.height);
      const w = img.width * k; const h = img.height * k;
      c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad')); };
    img.src = url;
  });
}

export default function TalkEditor({ x, reload, t, call }) {
  const [f, setF] = useState(() => initial(x));
  const [cats, setCats] = useState([]);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [thumbMsg, setThumbMsg] = useState(null);
  const baseline = useRef(JSON.stringify(initial(x)));
  const fileInput = useRef(null);

  useEffect(() => { call('/categories', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);
  const patch = (o) => { setMsg(null); setF((v) => ({ ...v, ...o })); };
  const dirty = JSON.stringify(f) !== baseline.current;

  const save = async (e) => {
    e.preventDefault();
    if (!dirty || saving) return;
    const sched = f.publication === 'scheduled';
    if (sched && !f.publishAt) { setMsg({ ok: false, text: t('needDate') }); return; }
    if (sched && new Date(f.publishAt).getTime() <= Date.now() + 30000) { setMsg({ ok: false, text: t('errPastDate') }); return; }
    setSaving(true); setMsg(null);
    const body = {
      title: f.title, speaker: f.speaker, description: f.description, access: f.access,
      categoryId: f.categoryId ? Number(f.categoryId) : null,
      publication: f.publication, publishAt: sched ? new Date(f.publishAt).toISOString() : null,
    };
    const r = await call(`/talks/${x.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || t('errGeneric') }); return; }
    baseline.current = JSON.stringify(f);
    setMsg({ ok: true, text: t('saved') });
    reload();
  };

  const choose = async (choice) => {
    setThumbMsg(null);
    const r = await call(`/talks/${x.id}`, { method: 'PATCH', body: JSON.stringify({ posterChoice: choice }) });
    if (!r.ok) setThumbMsg({ ok: false, text: r.data?.error || t('errGeneric') });
    else { setThumbMsg({ ok: true, text: t('thumbDone') }); reload(); }
  };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setThumbMsg({ ok: false, text: t('thumbBad') }); return; }
    setThumbMsg(null);
    try {
      const image = await resizeImage(file);
      const r = await call(`/talks/${x.id}/poster`, { method: 'POST', body: JSON.stringify({ image }) });
      if (!r.ok) setThumbMsg({ ok: false, text: r.data?.error || t('errGeneric') });
      else { setThumbMsg({ ok: true, text: t('thumbDone') }); reload(); }
    } catch { setThumbMsg({ ok: false, text: t('thumbBad') }); }
  };

  const external = x.source !== 'upload';
  const choices = x.posterChoices || [];
  const pill = (on, label, onClick) => (
    <button type="button" aria-pressed={on} className={on ? 'pill on' : 'pill'} onClick={onClick}>{label}</button>
  );

  return (
    <>
      <form className="panel" onSubmit={save}>
        <h2 className="panel-title">{t('sectPublication')}</h2>
        <div className="fld" role="group" aria-label={t('sectPublication')}>
          <div className="pills">
            {pill(f.publication === 'published', t('pubPublished'), () => patch({ publication: 'published' }))}
            {pill(f.publication === 'draft', t('pubDraft'), () => patch({ publication: 'draft' }))}
            {pill(f.publication === 'scheduled', t('pubScheduled'), () => patch({ publication: 'scheduled' }))}
          </div>
          <span className="meta small">{t({ published: 'pubHelpPublished', draft: 'pubHelpDraft', scheduled: 'pubHelpScheduled' }[f.publication])}</span>
          {f.publication === 'scheduled' && (
            <label className="fld"><span>{t('pubDate')}</span>
              <input type="datetime-local" required value={f.publishAt} onChange={(e) => patch({ publishAt: e.target.value })} /></label>
          )}
        </div>

        <h2 className="panel-title">{t('sectInfo')}</h2>
        <label className="fld"><span>{t('talkTitle')}</span>
          <input required maxLength={200} value={f.title} onChange={(e) => patch({ title: e.target.value })} /></label>
        <label className="fld"><span>{t('speaker')}</span>
          <input maxLength={200} value={f.speaker} onChange={(e) => patch({ speaker: e.target.value })} /></label>
        <label className="fld"><span>{t('description')}</span>
          <textarea rows={5} maxLength={5000} value={f.description} onChange={(e) => patch({ description: e.target.value })} /></label>
        <div className="fld" role="group" aria-label={t('category')}>
          <span>{t('category')}</span>
          <div className="pills">
            {pill(!f.categoryId, t('nwNoCat'), () => patch({ categoryId: '' }))}
            {cats.map((c) => pill(String(f.categoryId) === String(c.id), c.name, () => patch({ categoryId: String(c.id) })))}
          </div>
        </div>
        <div className="fld" role="group" aria-label={t('nwAccessQ')}>
          <span>{t('nwAccessQ')}</span>
          <div className="pills">
            {pill(f.access === 'free', t('free'), () => patch({ access: 'free' }))}
            {pill(f.access === 'premium', t('premium'), () => patch({ access: 'premium' }))}
          </div>
          <span className="meta small">{f.access === 'free' ? t('nwFreeHelp') : t('nwPremHelp')}</span>
        </div>

        {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
        <div className="panel-actions">
          <button className="btn" disabled={!dirty || saving}>{saving ? t('saving') : dirty ? t('save') : t('nothingToSave')}</button>
        </div>
      </form>

      <section className="panel">
        <h2 className="panel-title">{t('sectThumb')}</h2>
        <div className="thumbs">
          <figure className="thumb-cur">
            <span className="studio-thumb big" style={x.posterUrl ? { backgroundImage: `url(${x.posterUrl})` } : undefined} />
            <figcaption className="meta small">{t('thumbCurrent')}</figcaption>
          </figure>
          <div className="thumb-opts">
            {choices.length > 0 && (
              <>
                <span className="meta small">{t('thumbPick')}</span>
                <div className="thumb-row">
                  {choices.map((u, i) => (
                    <button key={u} type="button" className={`thumb-opt${x.posterChoice === i ? ' on' : ''}`} aria-pressed={x.posterChoice === i}
                      aria-label={t('thumbFrame').replace('{n}', i + 1)} title={t('thumbFrame').replace('{n}', i + 1)}
                      style={{ backgroundImage: `url(${u})` }} onClick={() => choose(i)} />
                  ))}
                </div>
              </>
            )}
            {!external && choices.length === 0 && <span className="meta small">{t('thumbSoon')}</span>}
            <div className="thumb-actions">
              <button type="button" className="btn ghost" onClick={() => fileInput.current?.click()}>{t('thumbUpload')}</button>
              {external && <button type="button" className="btn ghost" onClick={() => choose(-1)}>{t('thumbPlatform').replace('{s}', sourceLabel(x.source))}</button>}
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} />
            </div>
            {thumbMsg && <p className={thumbMsg.ok ? 'ok-msg' : 'error'} role="status">{thumbMsg.text}</p>}
          </div>
        </div>
      </section>
    </>
  );
}
