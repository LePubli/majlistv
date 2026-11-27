'use client';
// Import d'une playlist, d'une chaîne ou d'un album YouTube / Vimeo / Dailymotion / archive.org :
// 1) analyse de l'adresse (le serveur liste les vidéos), 2) choix des vidéos (grille avec recherche) et des réglages communs :
//    public (adultes / enfants), catégories (les mêmes / automatiques / une par une), chaîne (avec création), accès, droits, traduction ; 3) création.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './Providers';
import CategoryPicker from './CategoryPicker';
import ChannelPicker from './ChannelPicker';
import { langName } from './Transcript';
import { BANDS, bandLabel } from '../lib/kids';

const TR_LANGS = ['ar', 'de', 'en', 'es', 'fr', 'id', 'it', 'nl', 'pt', 'ru', 'tr', 'ur'];
const PAGE = 48; // cartes affichées d'un coup (les listes de plus de 150 vidéos restent fluides)
const dur = (s) => {
  if (!s) return '';
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${Math.max(1, m)} min`;
};
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function ImportPanel({ cats, onImported, presetUrl = '' }) {
  const { t, call, locale } = useApp();
  const [url, setUrl] = useState('');
  const [job, setJob] = useState(null);
  const [history, setHistory] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [q, setQ] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [per, setPer] = useState({}); // catégorie choisie vidéo par vidéo
  const [bulkCat, setBulkCat] = useState('');
  const [o, setO] = useState({
    language: 'fr', audience: 'adult', kidsBands: [], categoryMode: 'same', categoryId: '', extraCategoryIds: [],
    access: 'free', speaker: '', translateTo: [], rightsConfirmed: false,
  });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const top = useRef(null);

  const loadHistory = useCallback(() => call('/imports').then((r) => r.ok && setHistory(r.data)), [call]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const open = useCallback(async (id) => {
    const r = await call('/imports/' + id);
    if (!r.ok) return;
    setJob(r.data);
    if (r.data.status === 'listed') { setPicked(new Set(r.data.entries.filter((e) => !e.already).map((e) => e.id))); setPer({}); setShown(PAGE); setQ(''); }
  }, [call]);

  // Pendant l'analyse, on interroge le serveur toutes les 2 secondes.
  useEffect(() => {
    if (!job || job.status !== 'listing') return undefined;
    const id = setInterval(() => open(job.id), 2000);
    return () => clearInterval(id);
  }, [job, open]);

  const start = useCallback(async (address) => {
    setMsg(null); setBusy(true);
    const r = await call('/imports', { method: 'POST', body: JSON.stringify({ url: address }) });
    setBusy(false);
    if (r.ok) { setJob(r.data); setUrl(''); loadHistory(); } else setMsg({ ok: false, text: r.data.error || t('errGeneric') });
  }, [call, loadHistory, t]);
  const analyse = (e) => { e.preventDefault(); start(url); };
  // Adresse de liste collée dans « Coller un lien » de la page : elle arrive ici et l'analyse démarre.
  useEffect(() => {
    if (!presetUrl) return;
    setUrl(presetUrl); start(presetUrl);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetUrl]);

  const entries = job?.entries || [];
  const visible = useMemo(() => {
    const nq = norm(q.trim());
    return entries.filter((e) => (!hideDone || !e.already) && (!nq || norm(e.title).includes(nq)));
  }, [entries, q, hideDone]);
  const selectable = visible.filter((e) => !e.already);
  const allOn = selectable.length > 0 && selectable.every((e) => picked.has(e.id));
  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setPicked((p) => { const n = new Set(p); selectable.forEach((e) => (allOn ? n.delete(e.id) : n.add(e.id))); return n; });
  const toggleLang = (c) => setO({ ...o, translateTo: o.translateTo.includes(c) ? o.translateTo.filter((x) => x !== c) : [...o.translateTo, c] });
  const kids = o.audience !== 'adult';
  const toggleBand = (b) => setO((x) => ({ ...x, kidsBands: BANDS.filter((y) => (y === b ? !x.kidsBands.includes(b) : x.kidsBands.includes(y))) }));
  const setAudience = (a) => setO((x) => ({ ...x, audience: a, kidsBands: a === 'adult' ? [] : (x.kidsBands.length ? x.kidsBands : [...BANDS]) }));
  const applyBulk = () => { if (!bulkCat) return; setPer((p) => { const n = { ...p }; picked.forEach((id) => { n[id] = bulkCat; }); return n; }); };

  const confirm = async () => {
    setBusy(true); setMsg(null);
    const ids = [...picked];
    const perVideo = {};
    if (o.categoryMode === 'each') ids.forEach((id) => { if (per[id]) perVideo[id] = Number(per[id]); });
    const body = {
      ids, language: o.language, access: o.access, speaker: o.speaker, audience: o.audience, kidsBands: kids ? o.kidsBands : [],
      categoryMode: o.categoryMode, perVideo,
      categoryId: o.categoryMode === 'same' && o.categoryId ? Number(o.categoryId) : null,
      extraCategoryIds: o.categoryMode === 'same' ? o.extraCategoryIds.filter((id) => String(id) !== String(o.categoryId)) : [],
      rightsConfirmed: o.rightsConfirmed, translateTo: o.rightsConfirmed ? o.translateTo : [],
    };
    const r = await call(`/imports/${job.id}/confirm`, { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) {
      const extra = [
        r.data.skipped ? t('importSkipped').replace('{n}', r.data.skipped) : '',
        r.data.created ? t('imp2DescNote').replace('{n}', r.data.created) : '',
        o.categoryMode === 'auto' && r.data.created ? (r.data.autoSkipped ? t('imp2AutoOff') : t('imp2AutoNote')) : '',
      ].filter(Boolean).join(' ');
      setMsg({ ok: true, text: `${t('importDone').replace('{n}', r.data.created)} ${extra}`.trim() });
      setJob(null); loadHistory(); onImported?.(r.data);
    } else setMsg({ ok: false, text: r.data.error || t('errGeneric') });
  };
  const retry = async (id) => { await call(`/imports/${id}/retry`, { method: 'POST' }); open(id); loadHistory(); };
  const needBands = kids && o.kidsBands.length === 0;

  return (
    <section className="form import" ref={top}>
      <h2>{t('importTitle')}</h2>
      <p className="meta">{t('importHelp')}</p>
      <form onSubmit={analyse} className="import-row">
        <input type="url" required placeholder="youtube.com/@chaine, /playlist?list=…, vimeo.com/album/…, dailymotion.com/<compte>, archive.org/details/…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label={t('importUrl')} />
        <button className="btn" disabled={busy}>{t('importAnalyse')}</button>
      </form>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}{msg.ok && <> <a className="link u" href="/studio/contents">{t('imp2SeeContents')}</a></>}</p>}

      {job && job.status === 'listing' && <p className="meta" role="status">{t('importListing')}</p>}
      {job && job.status === 'failed' && <p className="error" role="alert">{job.error} <button type="button" className="link" onClick={() => retry(job.id)}>{t('retryTr')}</button></p>}

      {job && job.status === 'listed' && (
        <div className="imp">
          <div className="imp-bar">
            <div className="imp-bar-top">
              <strong className="imp-name">{job.title || job.url}</strong>
              <span className="imp-count"><b>{picked.size}</b> / {entries.filter((e) => !e.already).length} {t('imp2Checked')}</span>
            </div>
            <div className="imp-tools">
              <input type="search" className="imp-search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder={t('imp2Search')} aria-label={t('imp2Search')} />
              <button type="button" className="btn ghost" onClick={toggleAll} disabled={!selectable.length}>{allOn ? t('importNone') : t('importAll')} ({selectable.length})</button>
              {entries.some((e) => e.already) && (
                <label className="check imp-hide"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> {t('imp2HideDone')}</label>
              )}
            </div>
          </div>

          {visible.length === 0 ? <p className="meta">{t('imp2NoMatch')}</p> : (
            <ul className="imp-grid">
              {visible.slice(0, shown).map((e) => {
                const on = !e.already && picked.has(e.id);
                const thumb = e.thumb || (e.source === 'youtube' ? `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg` : '');
                return (
                  <li key={e.source + e.id} className={`imp-card${on ? ' on' : ''}${e.already ? ' already' : ''}`}>
                    <label className="imp-pick">
                      <input type="checkbox" disabled={e.already} checked={on} onChange={() => toggle(e.id)} aria-label={e.title} />
                      <span className="imp-thumb">
                        {thumb ? <img src={thumb} alt="" loading="lazy" /> : null}
                        {e.duration ? <span className="imp-dur">{dur(e.duration)}</span> : null}
                        {e.already && <span className="imp-done">{t('importAlready')}</span>}
                      </span>
                      <span className="imp-title">{e.title}</span>
                    </label>
                    {o.categoryMode === 'each' && !e.already && (
                      <div className="imp-cat">
                        <CategoryPicker cats={cats} mode="single" value={per[e.id] || ''} onChange={(v) => setPer((p) => ({ ...p, [e.id]: v }))} t={t} label={t('category')} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {visible.length > shown && <div className="imp-more"><button type="button" className="btn ghost" onClick={() => setShown((n) => n + PAGE)}>{t('imp2More').replace('{n}', Math.min(PAGE, visible.length - shown))}</button></div>}

          <div className="imp-secs">
            <fieldset className="imp-sec">
              <legend>{t('imp2Audience')}</legend>
              <div className="pills">
                {[['adult', t('imp2Adult')], ['kids', t('imp2Kids')], ['both', t('imp2Both')]].map(([k, label]) => (
                  <button key={k} type="button" className={o.audience === k ? 'pill on' : 'pill'} aria-pressed={o.audience === k} onClick={() => setAudience(k)}>{label}</button>
                ))}
              </div>
              {kids && (
                <>
                  <span className="meta small">{t('imp2Bands')}</span>
                  <div className="pills">
                    {BANDS.map((b) => { const on = o.kidsBands.includes(b); return <button key={b} type="button" className={on ? 'pill on' : 'pill'} aria-pressed={on} onClick={() => toggleBand(b)}>{on ? '✓ ' : ''}{bandLabel(b, t)}</button>; })}
                  </div>
                  {needBands && <p className="error" role="alert">{t('imp2BandsNeeded')}</p>}
                  <span className="meta small">{o.audience === 'kids' ? t('imp2KidsOnly') : t('imp2KidsBoth')}</span>
                </>
              )}
            </fieldset>

            <fieldset className="imp-sec">
              <legend>{t('category')}</legend>
              <div className="imp-modes" role="radiogroup" aria-label={t('category')}>
                {[['same', t('imp2CatSame'), t('imp2CatSameHelp')], ['auto', t('imp2CatAuto'), t('imp2CatAutoHelp')], ['each', t('imp2CatEach'), t('imp2CatEachHelp')]].map(([k, label, help]) => (
                  <label key={k} className={`imp-mode${o.categoryMode === k ? ' on' : ''}`}>
                    <input type="radio" name="imp-catmode" checked={o.categoryMode === k} onChange={() => setO({ ...o, categoryMode: k })} />
                    <span><b>{label}</b><small className="meta">{help}</small></span>
                  </label>
                ))}
              </div>
              {o.categoryMode === 'same' && (
                <>
                  <div className="fld" role="group" aria-label={t('category')}>
                    <span>{t('category')}</span>
                    <CategoryPicker cats={cats} mode="single" value={o.categoryId} onChange={(v) => setO({ ...o, categoryId: v })} t={t} label={t('category')} />
                  </div>
                  <div className="fld" role="group" aria-label={t('txExtra')}>
                    <span>{t('txExtra')}</span>
                    <CategoryPicker cats={cats} mode="multi" max={20} value={o.extraCategoryIds} exclude={o.categoryId} onChange={(v) => setO({ ...o, extraCategoryIds: v })} t={t} label={t('txExtra')} />
                    <span className="meta small">{t('txExtraHelp')}</span>
                  </div>
                </>
              )}
              {o.categoryMode === 'each' && (
                <div className="fld imp-bulk" role="group" aria-label={t('imp2ApplyTo').replace('{n}', picked.size)}>
                  <span>{t('imp2ApplyTo').replace('{n}', picked.size)}</span>
                  <CategoryPicker cats={cats} mode="single" value={bulkCat} onChange={setBulkCat} t={t} label={t('category')} />
                  <button type="button" className="btn ghost" disabled={!bulkCat || picked.size === 0} onClick={applyBulk}>{t('imp2ApplyAll')}</button>
                  <span className="meta small">{t('imp2EachCount').replace('{n}', [...picked].filter((id) => per[id]).length).replace('{m}', picked.size)}</span>
                </div>
              )}
            </fieldset>

            <fieldset className="imp-sec">
              <legend>{t('imp2Sec3')}</legend>
              <div className="imp-opts">
                <label>{t('language')}<input required pattern="[a-z]{2}(-[A-Z]{2})?" value={o.language} onChange={(e) => setO({ ...o, language: e.target.value })} /></label>
                <label>{t('access')}
                  <select value={o.access} onChange={(e) => setO({ ...o, access: e.target.value })}>
                    <option value="free">{t('free')}</option>
                    <option value="premium">{t('premium')}</option>
                  </select>
                </label>
              </div>
              <ChannelPicker value={o.speaker} onChange={(v) => setO({ ...o, speaker: v })} t={t} call={call} />
              <label className="fld"><span>{t('speaker')}</span><input value={o.speaker} onChange={(e) => setO({ ...o, speaker: e.target.value })} /></label>
            </fieldset>

            <fieldset className="imp-sec">
              <legend>{t('imp2Sec4')}</legend>
              <label className="check rights"><input type="checkbox" checked={o.rightsConfirmed} onChange={(e) => setO({ ...o, rightsConfirmed: e.target.checked })} /> {t('rightsConfirm')}</label>
              {o.rightsConfirmed && (
                <div className="langs">
                  <span className="meta small">{t('translateTo')}</span>
                  <div className="pills">
                    {TR_LANGS.filter((c) => c !== o.language.split('-')[0]).map((c) => (
                      <label key={c} className="check"><input type="checkbox" checked={o.translateTo.includes(c)} onChange={() => toggleLang(c)} /> {langName(c, locale)}</label>
                    ))}
                  </div>
                </div>
              )}
              <p className="meta small">{t('imp2DescInfo')}</p>
            </fieldset>
          </div>

          <div className="imp-actions">
            <button type="button" className="btn" disabled={busy || picked.size === 0 || needBands} onClick={confirm}>{t('importConfirm').replace('{n}', picked.size)}</button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <details className="import-history">
          <summary>{t('importHistory')}</summary>
          <ul>
            {history.map((h) => (
              <li key={h.id}>
                <button type="button" className="link" onClick={() => open(h.id)}>{h.title || h.url}</button>
                <span className="meta"> · {t('importStatus_' + h.status)}{h.imported ? ` · ${h.imported} ${t('importVideos')}` : ''}</span>
                {h.status === 'failed' && <button type="button" className="link" onClick={() => retry(h.id)}> {t('retryTr')}</button>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
