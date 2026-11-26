'use client';
// Studio → Séries → Importer une série (YouTube, Vimeo, Dailymotion, archive.org, ou une liste d'adresses pour tout autre site).
//   1. coller l'adresse d'une liste de lecture / page « série » / album / collection (le serveur lit la liste), ou coller des adresses une par ligne ;
//   2. cocher / ordonner les épisodes, placer les saisons (détectées dans les titres, sinon « la saison N commence à l'épisode X »),
//      choisir les épisodes à COPIER chez nous (les autres restent lus depuis YouTube) ;
//   3. titre, catégorie, accès, brouillon / publié, transcription facultative, case des droits (obligatoire) → créer la série.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import CategoryPicker from '../../components/CategoryPicker';
import { langName } from '../../components/Transcript';

const TR_LANGS = ['ar', 'de', 'en', 'es', 'fr', 'id', 'it', 'nl', 'pt', 'ru', 'tr', 'ur'];
const dur = (s) => (s ? `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)} h ` : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min` : '');

export default function ImportSeries() {
  const { t, call, locale } = useApp();
  const [cats, setCats] = useState([]);
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState('list');        // 'list' : adresse d'une liste ; 'urls' : adresses collées (une par ligne)
  const [lines, setLines] = useState('');
  const [rejected, setRejected] = useState([]);
  const [job, setJob] = useState(null);
  const [items, setItems] = useState([]);          // épisodes dans l'ordre affiché : { ...entrée, on, copy }
  const [useSeasons, setUseSeasons] = useState(false);
  const [seasons, setSeasons] = useState([]);       // [{ title, from }] — from = rang (à partir de 1) parmi les épisodes cochés
  const [o, setO] = useState({ title: '', speaker: '', description: '', categoryId: '', access: 'free', published: false, language: 'fr', transcribe: false, translateTo: [] });
  const [rights, setRights] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const poll = useRef(null);

  useEffect(() => { call('/categories?catalogue=all', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);
  useEffect(() => () => clearInterval(poll.current), []);

  const sel = items.filter((x) => x.on);
  const rankOf = (id) => sel.findIndex((x) => x.id === id) + 1;
  const seasonIndexOf = (rank) => { let k = -1; [...seasons].sort((a, b) => a.from - b.from).forEach((s, i) => { if (rank >= s.from) k = i; }); return k; };

  // Lecture de la liste : on interroge le serveur jusqu'à ce qu'elle soit prête.
  const watch = useCallback((id) => {
    clearInterval(poll.current);
    const tick = async () => {
      const r = await call(`/studio/series/import/${id}`);
      if (!r.ok) { clearInterval(poll.current); setMsg({ err: true, text: r.data?.error || t('dbError') }); return; }
      setJob(r.data);
      if (r.data.status === 'listing') return;
      clearInterval(poll.current);
      if (r.data.status !== 'listed') return;
      const its = r.data.entries.map((e) => ({ ...e, on: !e.inSeries, copy: e.source === 'web' }));
      setItems(its);
      setO((x) => ({ ...x, title: x.title || String(r.data.title || '').replace(/^(Albums? - |Playlist - )/i, '') }));
      // Plan proposé : les départs de saison sont des rangs dans la liste complète ; on les convertit en rangs parmi les épisodes cochés.
      const plan = r.data.plan;
      if (plan?.hasSeasons) {
        const rank = (from) => its.slice(0, from - 1).filter((x) => x.on).length + 1;
        setSeasons(plan.seasons.map((s) => ({ title: s.title || '', from: rank(s.from) })));
        setUseSeasons(true);
      } else { setSeasons([]); setUseSeasons(false); }
    };
    tick(); poll.current = setInterval(tick, 3000);
  }, [call, t]);

  const analyse = async (e) => {
    e.preventDefault(); setMsg(null); setDone(null); setBusy(true);
    const r = await call('/studio/series/import', { method: 'POST', body: JSON.stringify({ url }) });
    setBusy(false);
    if (!r.ok) { setMsg({ err: true, text: r.data?.error || t('dbError') }); return; }
    setJob(r.data); setItems([]); watch(r.data.id);
  };
  const analyseLines = async (e) => {
    e.preventDefault(); setMsg(null); setDone(null); setBusy(true); setRejected([]);
    const r = await call('/studio/series/import-urls', { method: 'POST', body: JSON.stringify({ urls: lines.split('\n').map((x) => x.trim()).filter(Boolean) }) });
    setBusy(false);
    if (!r.ok) { setMsg({ err: true, text: r.data?.error || t('dbError') }); setRejected(r.data?.rejected || []); return; }
    setRejected(r.data.rejected || []); setJob(r.data); setItems([]); watch(r.data.id);
  };
  const retry = async () => { const r = await call(`/studio/series/import/${job.id}/retry`, { method: 'POST' }); if (r.ok) { setJob({ ...job, status: 'listing', error: null }); watch(job.id); } };

  const upd = (id, p) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p, ...(x.source === 'web' ? { copy: x.on || p.on === true } : {}) } : x)));
  const move = (i, d) => setItems((xs) => { const a = [...xs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const reverse = () => setItems((xs) => [...xs].reverse());
  const byTitle = () => setItems((xs) => [...xs].sort((a, b) => String(a.title).localeCompare(String(b.title), locale, { numeric: true })));
  const byNumber = () => setItems((xs) => [...xs].sort((a, b) => ((a.season ?? 0) - (b.season ?? 0)) || ((a.episode ?? 1e6) - (b.episode ?? 1e6))));
  const setAll = (k, v) => setItems((xs) => xs.map((x) => (k === 'on' ? { ...x, on: x.inSeries ? false : v } : { ...x, copy: x.source === 'web' ? x.on : x.on ? v : false })));
  const copyCount = sel.filter((x) => x.copy).length;
  const totalSecs = sel.reduce((n, x) => n + (x.duration || 0), 0);

  const setSeason = (i, p) => setSeasons((xs) => xs.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const addSeason = () => setSeasons((xs) => { const last = Math.max(0, ...xs.map((s) => s.from)); return [...xs, { title: '', from: Math.min(sel.length, last + 1) }]; });
  const removeSeason = (i) => setSeasons((xs) => xs.filter((_, k) => k !== i));
  const toggleSeasons = (on) => { setUseSeasons(on); if (on && !seasons.length) setSeasons([{ title: '', from: 1 }]); };
  const seasonsOk = !useSeasons || (seasons.length > 0 && [...seasons].sort((a, b) => a.from - b.from)[0].from === 1 && new Set(seasons.map((s) => s.from)).size === seasons.length && seasons.every((s) => s.from >= 1 && s.from <= sel.length));
  const toggleLang = (c) => setO((x) => ({ ...x, translateTo: x.translateTo.includes(c) ? x.translateTo.filter((y) => y !== c) : [...x.translateTo, c] }));

  const canStart = job?.status === 'listed' && sel.length > 0 && rights && o.title.trim() && seasonsOk && !busy;
  const start = async () => {
    setMsg(null); setBusy(true);
    const r = await call(`/studio/series/import/${job.id}/start`, { method: 'POST', body: JSON.stringify({
      title: o.title, description: o.description, speaker: o.speaker, categoryId: o.categoryId ? Number(o.categoryId) : null, access: o.access, published: o.published, language: o.language,
      ids: sel.map((x) => x.id), seasons: useSeasons ? seasons.map((s) => ({ title: s.title, from: Number(s.from) })) : [], copyIds: sel.filter((x) => x.copy).map((x) => x.id),
      transcribe: o.transcribe, translateTo: o.transcribe ? o.translateTo : [], rights: true }) });
    setBusy(false);
    if (!r.ok) { setMsg({ err: true, text: r.data?.error || t('dbError') }); return; }
    setDone(r.data); setJob(null); setItems([]); setRights(false);
  };

  const ready = job?.status === 'listed';
  return (
    <main className="studio-page">
      <p className="meta"><Link href="/studio/series">← {t('srTitle')}</Link></p>
      <h1 className="studio-title">{t('sriTitle')}</h1>
      <p className="meta">{t('sriIntro')}</p>
      {msg && <p role={msg.err ? 'alert' : 'status'} className={msg.err ? 'error' : 'ok'}>{msg.text}</p>}
      {done && (
        <section className="sd-card" role="status">
          <h2>{t('sriDoneTitle')}</h2>
          <p>{t('sriDoneText').replace('{n}', done.episodes).replace('{s}', done.seasons).replace('{c}', done.copyQueued)}</p>
          {done.skipped?.length > 0 && <p className="meta">{t('sriSkipped').replace('{n}', done.skipped.length)}</p>}
          {done.copyErrors?.length > 0 && <p className="error">{t('sriCopyErrors').replace('{n}', done.copyErrors.length)}</p>}
          <p><Link className="btn" href={`/studio/series/${done.seriesId}`}>{t('sriOpen')}</Link></p>
        </section>
      )}

      <section className="sd-card" aria-labelledby="sri-s1">
        <h2 id="sri-s1">{t('sriStep1')}</h2>
        <div className="pills" role="group" aria-label={t('sriStep1')} style={{ marginBottom: 10 }}>
          <button type="button" aria-pressed={mode === 'list'} className={mode === 'list' ? 'pill on' : 'pill'} onClick={() => setMode('list')}>{t('sriModeList')}</button>
          <button type="button" aria-pressed={mode === 'urls'} className={mode === 'urls' ? 'pill on' : 'pill'} onClick={() => setMode('urls')}>{t('sriModeUrls')}</button>
        </div>
        {mode === 'list' ? (
          <form onSubmit={analyse} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/playlist?list=… · vimeo.com/showcase/… · archive.org/details/…" aria-label={t('sriUrl')} style={{ flex: '1 1 320px', minWidth: 0 }} />
            <button className="btn" disabled={busy || job?.status === 'listing'}>{t('sriAnalyse')}</button>
          </form>
        ) : (
          <form onSubmit={analyseLines} style={{ display: 'grid', gap: 8 }}>
            <textarea required rows={6} value={lines} onChange={(e) => setLines(e.target.value)} placeholder={'https://exemple.org/cours-1.mp4 | Cours 1\nhttps://exemple.org/cours-2.mp4 | Cours 2'} aria-label={t('sriModeUrls')} dir="ltr" style={{ fontFamily: 'monospace' }} />
            <p className="meta small">{t('sriUrlsHint')}</p>
            <div><button className="btn" disabled={busy || !lines.trim()}>{t('sriUrlsGo')}</button></div>
          </form>
        )}
        {rejected.length > 0 && <p className="error small" role="status">{t('sriRejected').replace('{n}', rejected.length)} {rejected.map((x) => `#${x.line}`).join(', ')}</p>}
        {job?.status === 'listing' && <p className="meta" role="status">{t('sriReading')}</p>}
        {job?.status === 'failed' && <p className="error" role="alert">{job.error || t('dbError')} <button type="button" className="btn ghost" onClick={retry}>{t('sriRetry')}</button></p>}
      </section>

      {ready && (
        <>
          <section className="sd-card" aria-labelledby="sri-s2">
            <h2 id="sri-s2">{t('sriStep2').replace('{n}', items.length)}{job.title ? ` — ${job.title}` : ''}</h2>
            <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn ghost" onClick={() => setAll('on', true)}>{t('sriAll')}</button>
              <button type="button" className="btn ghost" onClick={() => setAll('on', false)}>{t('sriNone')}</button>
              <button type="button" className="btn ghost" onClick={reverse}>{t('sriReverse')}</button>
              <button type="button" className="btn ghost" onClick={byNumber}>{t('sriByNumber')}</button>
              <button type="button" className="btn ghost" onClick={byTitle}>{t('sriByTitle')}</button>
              <span className="meta">{t('sriSelected').replace('{n}', sel.length)}{totalSecs ? ` · ${dur(totalSecs)}` : ''}</span>
            </p>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
              {items.map((x, i) => {
                const rank = x.on ? rankOf(x.id) : 0;
                const si = x.on && useSeasons ? seasonIndexOf(rank) : -1;
                return (
                  <li key={x.id} data-ep={x.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', opacity: x.on ? 1 : 0.55, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 8 }}>
                    <input type="checkbox" checked={x.on} disabled={x.inSeries} onChange={(e) => upd(x.id, { on: e.target.checked, copy: e.target.checked ? x.copy : false })} aria-label={x.title} />
                    <span className="meta" style={{ minWidth: 28, textAlign: 'end' }}>{rank || '–'}</span>
                    {x.thumb ? <img src={x.thumb} alt="" width="64" height="36" style={{ borderRadius: 4, objectFit: 'cover' }} /> : null}
                    <span dir="auto" style={{ flex: '1 1 220px', minWidth: 0 }}>{x.title}
                      <br /><small className="meta">{dur(x.duration)}{(x.season || x.episode) ? ` · ${x.season ? `S${x.season}` : ''}${x.episode ? ` É${x.episode}` : ''}` : ''}{x.source !== 'youtube' ? ` · ${x.source === 'web' ? t('sriWeb') : x.source}` : ''}{x.inSeries ? ` · ${t('sriInSeries')}` : x.already ? ` · ${t('sriAlready')}` : ''}</small></span>
                    {useSeasons && si >= 0 && <span className="pill" aria-label={t('sriSeasonN').replace('{n}', si + 1)}>{t('sriSeasonN').replace('{n}', si + 1)}</span>}
                    <label className="check" style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={x.copy} disabled={!x.on || x.source === 'web'} onChange={(e) => upd(x.id, { copy: e.target.checked })} /> {t('sriCopy')}</label>
                    <span style={{ display: 'flex', gap: 2 }}>
                      <button type="button" className="btn ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('sriUp')}>↑</button>
                      <button type="button" className="btn ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={t('sriDown')}>↓</button>
                    </span>
                  </li>
                );
              })}
            </ol>
            <p style={{ marginTop: 10 }}>
              <button type="button" className="btn ghost" onClick={() => setAll('copy', true)}>{t('sriCopyAll')}</button>{' '}
              <button type="button" className="btn ghost" onClick={() => setAll('copy', false)}>{t('sriCopyNone')}</button>{' '}
              <span className="meta">{t('sriCopyCount').replace('{n}', copyCount)}</span>
            </p>
            <p className="meta small">{t('sriCopyHint')}</p>
          </section>

          <section className="sd-card" aria-labelledby="sri-s3">
            <h2 id="sri-s3">{t('sriStep3')}</h2>
            <p className="meta">{job.plan?.hasSeasons ? t('sriSeasonsDetected').replace('{n}', job.plan.seasons.length) : t('sriSeasonsNone')}</p>
            <div className="pills" role="group" aria-label={t('sriStep3')}>
              <button type="button" aria-pressed={!useSeasons} className={!useSeasons ? 'pill on' : 'pill'} onClick={() => toggleSeasons(false)}>{t('sriNoSeasons')}</button>
              <button type="button" aria-pressed={useSeasons} className={useSeasons ? 'pill on' : 'pill'} onClick={() => toggleSeasons(true)}>{t('sriWithSeasons')}</button>
            </div>
            {useSeasons && (
              <div style={{ display: 'grid', gap: 8, margin: '10px 0' }}>
                {seasons.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <b>{t('sriSeasonN').replace('{n}', i + 1)}</b>
                    <label className="check">{t('sriStartsAt')} <input type="number" min={1} max={Math.max(1, sel.length)} value={s.from} onChange={(e) => setSeason(i, { from: Number(e.target.value) })} style={{ width: 80 }} /></label>
                    <input value={s.title} maxLength={120} placeholder={t('sriSeasonTitle')} aria-label={t('sriSeasonTitle')} onChange={(e) => setSeason(i, { title: e.target.value })} style={{ flex: '1 1 160px', minWidth: 0 }} />
                    {seasons.length > 1 && <button type="button" className="btn ghost danger" onClick={() => removeSeason(i)}>{t('sriRemove')}</button>}
                  </div>
                ))}
                <div><button type="button" className="btn ghost" onClick={addSeason}>+ {t('sriAddSeason')}</button></div>
                {!seasonsOk && <p className="error" role="alert">{t('sriSeasonsBad')}</p>}
              </div>
            )}
          </section>

          <section className="sd-card" aria-labelledby="sri-s4">
            <h2 id="sri-s4">{t('sriStep4')}</h2>
            <label className="fld"><span>{t('srName')}</span><input required maxLength={200} value={o.title} onChange={(e) => setO({ ...o, title: e.target.value })} /></label>
            <label className="fld"><span>{t('speaker')}</span><input maxLength={200} value={o.speaker} onChange={(e) => setO({ ...o, speaker: e.target.value })} /></label>
            <label className="fld"><span>{t('description')}</span><textarea rows={3} maxLength={5000} value={o.description} onChange={(e) => setO({ ...o, description: e.target.value })} /></label>
            <CategoryPicker cats={cats} mode="single" value={o.categoryId} onChange={(v) => setO({ ...o, categoryId: v })} t={t} label={t('category')} />
            <label className="fld"><span>{t('language')}</span><input required pattern="[a-z]{2}(-[A-Z]{2})?" value={o.language} onChange={(e) => setO({ ...o, language: e.target.value })} style={{ maxWidth: 120 }} /></label>
            <fieldset style={{ border: 0, padding: 0, margin: '10px 0' }}>
              <legend className="meta">{t('access')}</legend>
              <label><input type="radio" name="acc" checked={o.access === 'free'} onChange={() => setO({ ...o, access: 'free' })} /> {t('free')}</label>{' '}
              <label><input type="radio" name="acc" checked={o.access === 'premium'} onChange={() => setO({ ...o, access: 'premium' })} /> {t('premium')}</label>
            </fieldset>
            <fieldset style={{ border: 0, padding: 0, margin: '10px 0' }}>
              <legend className="meta">{t('sriPublish')}</legend>
              <label><input type="radio" name="pub" checked={!o.published} onChange={() => setO({ ...o, published: false })} /> {t('sriDraft')}</label>{' '}
              <label><input type="radio" name="pub" checked={o.published} onChange={() => setO({ ...o, published: true })} /> {t('sriPublished')}</label>
            </fieldset>
            <label className="check" style={{ display: 'block', margin: '10px 0' }}><input type="checkbox" checked={o.transcribe} onChange={(e) => setO({ ...o, transcribe: e.target.checked })} /> {t('sriTranscribe')}</label>
            {o.transcribe && (
              <>
                <p className="meta small">{t('sriTranscribeHint').replace('{h}', Math.round(totalSecs / 3600))}</p>
                <fieldset style={{ border: 0, padding: 0 }}>
                  <legend className="meta">{t('translateTo')}</legend>
                  {TR_LANGS.filter((c) => c !== o.language.split('-')[0]).map((c) => <label key={c} className="check" style={{ marginInlineEnd: 10 }}><input type="checkbox" checked={o.translateTo.includes(c)} onChange={() => toggleLang(c)} /> {langName(c, locale)}</label>)}
                </fieldset>
              </>
            )}
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '14px 0', padding: 12, border: '1px solid var(--line)', borderRadius: 8 }}>
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} style={{ marginTop: 4 }} />
              <span>{t('sriRights')}</span>
            </label>
            <button type="button" className="btn" disabled={!canStart} onClick={start}>{t('sriImport').replace('{n}', sel.length)}</button>
            {!rights && sel.length > 0 && <p className="meta">{t('sriNeedRights')}</p>}
            {sel.length > 0 && !o.title.trim() && <p className="meta">{t('sriNeedTitle')}</p>}
          </section>
        </>
      )}
    </main>
  );
}
