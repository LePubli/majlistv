'use client';
// Studio → Audyn → un contenu : informations, couverture, chapitres (envoi, ordre, titres), publication.
// « Ajouter depuis un lien » : le serveur récupère le son seul d'une vidéo (YouTube, archive.org…) et l'ajoute comme chapitre ;
// une playlist donne un chapitre par vidéo. L'image de la vidéo peut devenir la couverture (carrée, image entière sur fond flou).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../../../../components/Providers';
import StudioTabs from '../../../../../components/StudioTabs';
import { AudynCategoryPicker } from '../../../../../components/AudynCategories';
import { uploadFile } from '../../../../../lib/upload';
import { AUDIENCE_KEY, clock } from '../page';

const LANGS = ['fr', 'en', 'ar'];

// Durée d'un fichier audio lue par le navigateur (0 si illisible : le contenu reste utilisable, sans durée affichée).
const audioDuration = (file) => new Promise((resolve) => {
  const a = new Audio(); const url = URL.createObjectURL(file);
  const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
  a.preload = 'metadata'; a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration) : 0); a.onerror = () => done(0); a.src = url;
});

export default function StudioAudynItem() {
  const { id } = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const { t, call } = useApp();
  const [it, setIt] = useState(null);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [rights, setRights] = useState(false);
  const [queue, setQueue] = useState([]); // { name, pct, error }
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const coverRef = useRef(null);
  const [link, setLink] = useState('');
  const [frLink, setFrLink] = useState(true); // voix française de la vidéo si elle en propose une
  const [splitLink, setSplitLink] = useState(true); // un chapitre par chapitre de la vidéo (repères de l'auteur)
  const [jobs, setJobs] = useState([]);       // demandes « depuis un lien » (en cours + 24 dernières heures)
  const running = useRef(new Set());

  const load = useCallback(async () => {
    const r = await call(`/studio/audyn/${id}`);
    if (!r.ok) { setErr(t('errGeneric')); return; }
    setIt(r.data);
    setF({ title: r.data.title, narrator: r.data.narrator, author: r.data.author, description: r.data.description, audience: r.data.audience, category: r.data.category, language: r.data.language, access: r.data.access });
  }, [call, id, t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const e = search?.get('linkError'); if (e) setErr(e); }, [search]);

  // Demandes « depuis un lien » : suivies toutes les 4 secondes tant que l'une est en cours ; un chapitre fini recharge la page.
  const loadJobs = useCallback(async () => {
    const r = await call(`/studio/audyn/${id}/link-imports`);
    if (!r.ok) return;
    const list = r.data.imports || [];
    const now = new Set(list.filter((j) => j.active).map((j) => j.id));
    const ended = [...running.current].some((x) => !now.has(x));
    running.current = now;
    setJobs(list);
    if (ended) load();
  }, [call, id, load]);
  useEffect(() => { loadJobs(); }, [loadJobs]);
  const anyActive = jobs.some((j) => j.active);
  useEffect(() => {
    if (!anyActive) return undefined;
    const timer = setInterval(loadJobs, 4000);
    return () => clearInterval(timer);
  }, [anyActive, loadJobs]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const patch = async (body, ok) => {
    setErr('');
    const r = await call(`/studio/audyn/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return false; }
    await load(); flash(ok || t('saved')); return true;
  };

  const addFiles = async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length || !rights) return;
    setBusy(true); setErr('');
    setQueue(files.map((x) => ({ name: x.name, pct: 0 })));
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const upd = (p) => setQueue((q) => q.map((x, j) => (j === i ? { ...x, ...p } : x)));
      try {
        const durationSeconds = await audioDuration(file);
        await uploadFile(file, call, (p) => upd({ pct: Math.round(p * 100) }), {
          startPath: `/studio/audyn/${id}/uploads`,
          startBody: { filename: file.name, size: file.size, contentType: file.type || (/\.m4a$/i.test(file.name) ? 'audio/mp4' : 'audio/mpeg'), durationSeconds, rights: true },
          abortPath: (uid) => `/studio/audyn/uploads/${uid}`,
          completePath: (uid) => `/studio/audyn/uploads/${uid}/complete`,
        });
        upd({ pct: 100, done: true });
      } catch (x) { upd({ error: x.message === 'tooBig' ? t('ayTooBig') : t('ayUploadErr') }); }
    }
    setBusy(false); await load();
  };

  const setCover = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    setErr('');
    const u = await call(`/studio/audyn/${id}/cover-url`, { method: 'POST', body: JSON.stringify({ contentType: file.type, size: file.size }) });
    if (!u.ok) { setErr(u.data?.error || t('errGeneric')); return; }
    const put = await fetch(u.data.url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) { setErr(t('ayUploadErr')); return; }
    const r = await call(`/studio/audyn/${id}/cover`, { method: 'POST', body: JSON.stringify({ key: u.data.key }) });
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    await load(); flash(t('saved'));
  };

  const addLink = async (e) => {
    e.preventDefault();
    if (!link.trim()) return;
    if (!rights) { setErr(t('ayLinkNeedRights')); return; }
    setErr('');
    const r = await call(`/studio/audyn/${id}/link-imports`, { method: 'POST', body: JSON.stringify({ url: link.trim(), rights: true, audioLang: frLink ? 'fr' : 'original', split: splitLink }) });
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    setLink(''); flash(t('ayLinkQueued')); loadJobs();
  };
  // « Redécouper » : le chapitre (un long fichier importé d'une vidéo) est remplacé, à sa place, par un chapitre par chapitre de la vidéo.
  const resplit = async (c) => {
    if (!rights) { setErr(t('ayLinkNeedRights')); return; }
    if (!confirm(t('ayResplitConfirm'))) return;
    setErr('');
    const r = await call(`/studio/audyn/${id}/chapters/${c.id}/resplit`, { method: 'POST', body: JSON.stringify({ rights: true }) });
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    flash(t('ayResplitQueued')); loadJobs();
  };
  const cancelJob = async (j) => { await call(`/studio/audyn/link-imports/${j.id}/cancel`, { method: 'POST' }); loadJobs(); };
  const retryJob = async (j) => { await call(`/studio/audyn/link-imports/${j.id}/retry`, { method: 'POST' }); loadJobs(); };
  const coverFromLink = async () => {
    setErr('');
    const r = await call(`/studio/audyn/${id}/cover-from-link`, { method: 'POST', body: JSON.stringify({}) });
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    flash(t('ayCoverQueued')); loadJobs();
  };
  const jobLabel = (j) => {
    if (j.status === 'downloading') return t('ayLinkStRun').replace('{n}', j.progress);
    if (j.status === 'done' && j.added) return t('ayLinkList').replace('{n}', j.added);
    if (j.status === 'done' && j.kind === 'cover') return t('ayLinkCoverDone');
    if (j.status === 'done' && j.kind === 'meta') return t('ayMetaDone');
    if (j.status === 'done' && j.replaceChapter) return t('ayResplitDone').replace('{n}', j.parts);
    if (j.status === 'done' && j.parts > 1) return t(j.audioUsed === 'fr' ? 'ayLinkPartsFr' : 'ayLinkParts').replace('{n}', j.parts);
    if (j.status === 'done') return j.audioUsed === 'fr' ? t('ayLinkDoneFr') : t('ayLinkStDone');
    return t({ pending: 'ayLinkStPending', failed: 'ayLinkStFailed', canceled: 'ayLinkStCanceled' }[j.status] || 'ayLinkStPending');
  };

  const rename = async (c, title) => { if (title.trim() && title !== c.title) { await call(`/studio/audyn/${id}/chapters/${c.id}`, { method: 'PATCH', body: JSON.stringify({ title }) }); await load(); } };
  const move = async (i, d) => {
    const ids = it.chapters.map((c) => c.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await call(`/studio/audyn/${id}/chapters-order`, { method: 'PUT', body: JSON.stringify({ ids }) }); await load();
  };
  const del = async (c) => { if (!confirm(t('ayDelChapter'))) return; await call(`/studio/audyn/${id}/chapters/${c.id}`, { method: 'DELETE' }); await load(); };
  const delAll = async () => { if (!confirm(t('ayDelItem'))) return; const r = await call(`/studio/audyn/${id}`, { method: 'DELETE' }); if (r.ok) router.push('/studio/audyn'); };

  if (!it || !f) return <main className="studio-page"><p className="meta">{err || t('ayLoading')}</p></main>;
  const field = (k, label, props = {}) => <label className="fld"><span>{label}</span><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} /></label>;
  return (
    <main className="studio-page">
      <div className="studio-head">
        <h1 className="studio-title">{it.title}</h1>
        <Link className="btn ghost" href="/studio/audyn">{t('ayBack')}</Link>
      </div>
      <StudioTabs />
      {err && <p className="error" role="alert">{err}</p>}
      {msg && <p className="meta" role="status">{msg}</p>}

      <section className="panel ay-form">
        <h2 className="ay-h2">{t('ayInfos')}</h2>
        {field('title', t('ayTitleF'), { maxLength: 200 })}
        {field('narrator', t('ayNarrator'), { maxLength: 200 })}
        {field('author', t('ayAuthor'), { maxLength: 200 })}
        <label className="fld"><span>{t('ayDesc')}</span><textarea rows={4} maxLength={4000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="fld"><span>{t('ayAudience')}</span>
          <select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{['adults', 'kids', 'both'].map((a) => <option key={a} value={a}>{t(AUDIENCE_KEY[a])}</option>)}</select>
        </label>
        <AudynCategoryPicker id="ay-item-cat" value={f.category} onChange={(v) => setF({ ...f, category: v })} />
        <label className="fld"><span>{t('ayLang')}</span><select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>{LANGS.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
        <label className="fld"><span>{t('ayAccess')}</span>
          <select value={f.access} onChange={(e) => setF({ ...f, access: e.target.value })}>
            <option value="learning">{t('ayAccLearning')}</option><option value="free">{t('ayAccFree')}</option>
          </select>
        </label>
        <button className="btn" onClick={() => patch(f)}>{t('save')}</button>
      </section>

      <section className="panel ay-form">
        <h2 className="ay-h2">{t('ayCover')}</h2>
        {it.coverUrl ? <img className="ay-cover" src={it.coverUrl} alt="" /> : <p className="meta">{t('ayNoCover')}</p>}
        <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={setCover} aria-label={t('ayCover')} />
        {it.canCoverFromLink && (
          <div className="ay-sub">
            <button type="button" className="btn ghost sm" onClick={coverFromLink}>{t('ayCoverFromLink')}</button>
            <p className="meta">{t('ayCoverFromLinkHelp')}</p>
          </div>
        )}
      </section>

      <section className="panel ay-form">
        <h2 className="ay-h2">{t('ayChapters')} ({it.chapters.length}{it.durationSeconds ? ` · ${clock(it.durationSeconds)}` : ''})</h2>
        <ol className="ay-chapters">
          {it.chapters.map((c, i) => (
            <li key={c.id} className="ay-chapter">
              <input defaultValue={c.title} maxLength={200} aria-label={t('ayChapterTitle')} onBlur={(e) => rename(c, e.target.value)} />
              <span className="meta">{c.durationSeconds ? clock(c.durationSeconds) : '—'} · {(c.size / 1048576).toFixed(1)} Mo</span>
              <button className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('ayUp')}>↑</button>
              <button className="btn ghost sm" disabled={i === it.chapters.length - 1} onClick={() => move(i, 1)} aria-label={t('ayDown')}>↓</button>
              {c.sourceUrl && <button className="btn ghost sm" onClick={() => resplit(c)} title={t('ayResplitTitle')}>{t('ayResplit')}</button>}
              <button className="btn ghost sm" onClick={() => del(c)}>{t('ayDelete')}</button>
            </li>
          ))}
        </ol>
        <label className="chk"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} /> <span>{t('ayRightsOk')}</span></label>
        <input ref={fileRef} type="file" multiple accept="audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a" disabled={!rights || busy} onChange={addFiles} aria-label={t('ayAddFiles')} />
        <p className="meta">{t('ayFormats')}</p>
        {queue.map((q, i) => <p key={i} className={q.error ? 'error' : 'meta'}>{q.name} — {q.error || (q.done ? t('ayDone') : `${q.pct} %`)}</p>)}

        <form className="ay-sub ay-link" onSubmit={addLink} data-testid="audyn-link">
          <h3 className="ay-h3">{t('ayLinkTitle')}</h3>
          <p className="meta">{t('ayLinkHelp')}</p>
          <div className="ay-link-row">
            <input type="url" inputMode="url" dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" aria-label={t('ayLinkTitle')} maxLength={1000} />
            <button className="btn" disabled={!link.trim() || !rights}>{t('ayLinkAdd')}</button>
          </div>
          <label className="chk"><input type="checkbox" checked={frLink} onChange={(e) => setFrLink(e.target.checked)} /> <span>{t('ayLinkFr')}</span></label>
          <label className="chk"><input type="checkbox" checked={splitLink} onChange={(e) => setSplitLink(e.target.checked)} /> <span>{t('ayLinkSplit')}</span></label>
          {!rights && <p className="meta">{t('ayLinkNeedRights')}</p>}
        </form>
        {jobs.length > 0 && (
          <ul className="ay-jobs" aria-live="polite">
            {jobs.map((j) => (
              <li key={j.id} className={j.status === 'failed' ? 'bad' : ''}>
                <span className="ay-job-t" dir="auto">{j.kind === 'cover' ? t('ayLinkCoverJob') : j.kind === 'meta' ? t('ayMetaJob') : j.replaceChapter ? `${t('ayResplitJob')} : ${j.title}` : (j.title || j.url)}</span>
                <span className="meta">{jobLabel(j)}</span>
                {j.active && <button type="button" className="btn ghost sm" onClick={() => cancelJob(j)}>{t('ayLinkCancel')}</button>}
                {j.status === 'failed' && <button type="button" className="btn ghost sm" onClick={() => retryJob(j)}>{t('ayRetry')}</button>}
                {j.error && <span className="error small">{j.error}</span>}
                {j.note && <span className="meta small">{j.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel ay-form">
        <h2 className="ay-h2">{t('ayPublish')}</h2>
        <p className="meta">{it.status === 'published' ? t('ayIsPublished') : t('ayIsDraft')}</p>
        {it.status === 'published'
          ? <button className="btn ghost" onClick={() => patch({ status: 'draft' }, t('ayUnpublished'))}>{t('ayUnpublish')}</button>
          : <button className="btn" disabled={!it.chapters.length} onClick={() => patch({ status: 'published' }, t('ayPublishedMsg'))}>{t('ayPublishBtn')}</button>}
        <button className="btn ghost" onClick={delAll}>{t('ayDeleteItem')}</button>
      </section>
    </main>
  );
}
