'use client';
// Studio → fiche d'une série : informations, image, accès, saisons, épisodes (glisser-déposer ou boutons), ajout de vidéos.
import AudienceCats, { audienceBody, bandsMissing } from '../../../../../components/AudienceCats';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '../../../../../components/Providers';
import { Page as BmPage, Btn as BmBtn, Metrics as BmMetrics, Panel as BmPanel, Cols as BmCols, Meta as BmMeta, Badge as BmBadge, HeroArt as BmHeroArt } from '../../../../../components/backoffice/Kit';
import ChannelPicker from '../../../../../components/ChannelPicker';
import ImageSlot from '../../../../../components/ImageSlot';
import { byTitle } from '../../../../../components/SortableList';
import { LEVELS, levelLabel } from '../../../../../lib/levels';

const clock = (s) => {
  if (!s) return '';
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${Math.max(1, m)} min`;
};

// Ce qui part au serveur : ordre, saison et accès de chaque épisode.
const layoutOf = (eps, hasSeasons) => eps.map((e) => ({ talkId: e.id, seasonId: hasSeasons ? e.seasonId : null, access: e.access }));

export default function SeriesEditor() {
  const { id } = useParams();
  const { t, call, skin } = useApp();
  const router = useRouter();
  const [s, setS] = useState(null);          // série enregistrée
  const [f, setF] = useState(null);          // formulaire « informations »
  const [seasons, setSeasons] = useState([]);
  const [eps, setEps] = useState([]);
  const [snap, setSnap] = useState('[]');    // dernière disposition enregistrée
  const [cats, setCats] = useState([]);
  const [a, setA] = useState(null);         // public et catégories (appliqués aux épisodes, enregistrés à part)
  const [amsg, setAmsg] = useState(null);
  const [asaving, setAsaving] = useState(false);
  const [others, setOthers] = useState([]);   // autres séries, pour choisir les prérequis
  const [msg, setMsg] = useState(null);
  const [lmsg, setLmsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [cand, setCand] = useState([]);
  const [candTotal, setCandTotal] = useState(0);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState([]);
  const [target, setTarget] = useState('');

  const load = useCallback(async () => {
    const r = await call(`/series/${id}/manage`);
    if (!r.ok) { setS(false); return; }
    const d = r.data;
    setS(d);
    setF({
      title: d.title, speaker: d.speaker, description: d.description, access: d.access,
      hasSeasons: d.hasSeasons, asCollection: Boolean(d.asCollection), level: d.level || '', prerequisites: (d.prerequisites || []).map((x) => x.id),
    });
    setA({ audience: d.audience || 'adult', bands: d.kidsBands || [], categoryMode: d.categoryMode || 'manual', categoryId: d.categoryId ? String(d.categoryId) : '', extra: (d.extraCategoryIds || []).map(String) });
    setSeasons(d.seasons.map((z) => ({ id: z.id, title: z.title })));
    const list = d.episodes.map((e) => ({ ...e, access: e.accessOverride || 'inherit' }));
    setEps(list);
    setSnap(JSON.stringify(layoutOf(list, d.hasSeasons)));
  }, [call, id]);
  useEffect(() => {
    load();
    call('/categories?catalogue=all', {}, null).then((r) => r.ok && setCats(r.data));
    call('/studio/series').then((r) => r.ok && setOthers(r.data));
  }, [load, call]);

  const dirty = s && JSON.stringify(layoutOf(eps, s.hasSeasons)) !== snap;
  const savedPrereq = (s?.prerequisites || []).map((x) => x.id).join();
  const infoDirty = s && f && (f.title !== s.title || f.speaker !== s.speaker || f.description !== s.description || f.access !== s.access
    || f.hasSeasons !== s.hasSeasons
    || Boolean(f.asCollection) !== Boolean(s.asCollection) || (f.level || '') !== (s.level || '') || f.prerequisites.join() !== savedPrereq);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Vidéos que l'on peut encore ajouter (celles déjà ajoutées ici, même non enregistrées, sont masquées).
  useEffect(() => {
    if (!addOpen) return undefined;
    const timer = setTimeout(() => call(`/studio/series-candidates?q=${encodeURIComponent(q)}`).then((r) => { if (r.ok) { setCand([...r.data.items].sort(byTitle)); setCandTotal(r.data.total); } }), 250);
    return () => clearTimeout(timer);
  }, [addOpen, q, call, s]);
  const inSeries = useMemo(() => new Set(eps.map((e) => e.id)), [eps]);
  const candidates = cand.filter((c) => !inSeries.has(c.id));

  if (s === null || !f) return null;
  if (s === false) return <main className="studio-page"><Link href="/studio/series" className="back">← {t('srBack')}</Link><p>{t('srNotFound')}</p></main>;

  const hasSeasons = s.hasSeasons;
  const groups = hasSeasons ? seasons.map((z, i) => ({ ...z, number: i + 1, list: eps.filter((e) => e.seasonId === z.id) })) : [{ id: null, number: 0, title: '', list: eps }];
  const firstSeason = seasons[0]?.id || null;

  // ----- informations -----
  const saveInfo = async (e) => {
    e.preventDefault();
    if (!infoDirty || saving) return;
    if (f.hasSeasons !== s.hasSeasons && dirty) { setMsg({ ok: false, text: t('srSaveFirst') }); return; }
    setSaving(true); setMsg(null);
    const body = {
      title: f.title, speaker: f.speaker, description: f.description, access: f.access,
      hasSeasons: f.hasSeasons, asCollection: Boolean(f.asCollection), level: f.level || null, prerequisites: f.prerequisites,
    };
    const r = await call(`/series/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || t('errGeneric') }); return; }
    setMsg({ ok: true, text: t('saved') });
    if (f.hasSeasons !== s.hasSeasons) await load();
    else if (Boolean(f.asCollection) !== Boolean(s.asCollection)) { setS({ ...s, ...body, prerequisites: f.prerequisites.map((x) => others.find((o) => o.id === x) || { id: x, title: '' }) }); call(`/series/${id}/manage`).then((r) => r.ok && setS((x) => ({ ...x, collectionId: r.data.collectionId }))); }
    else setS({ ...s, ...body, prerequisites: f.prerequisites.map((x) => others.find((o) => o.id === x) || { id: x, title: '' }) });
  };
  const saveAudience = async (apply) => {
    if (!a || asaving || bandsMissing(a)) return;
    if (apply && eps.length && !window.confirm?.(t('saNoteApply'))) return;
    setAsaving(true); setAmsg(null);
    const r = await call(`/series/${id}`, { method: 'PATCH', body: JSON.stringify({ ...audienceBody(a), applyToEpisodes: apply }) });
    setAsaving(false);
    if (!r.ok) { setAmsg({ ok: false, text: r.data?.error || t('errGeneric') }); return; }
    const ap = r.data?.applied;
    setAmsg({ ok: true, text: apply ? t('saDone').replace('{n}', ap?.episodes ?? 0) + (ap?.autoQueued ? t('saDoneAuto').replace('{n}', ap.autoQueued) : '') : t('saSavedOnly') });
    setS((x) => ({ ...x, audience: a.audience, kidsBands: a.bands, categoryMode: a.categoryMode, categoryId: a.categoryId ? Number(a.categoryId) : null, extraCategoryIds: a.extra.map(Number) }));
  };
  const audienceBlock = a && (
    <div className="panel-sub" aria-label={t('saTitle')}>
      <h3 className="panel-subtitle">{t('saTitle')}</h3>
      <AudienceCats value={a} onChange={setA} cats={cats} t={t} />
      <p className="meta small">{t('saNoteApply')}</p>
      <div className="panel-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={asaving || bandsMissing(a)} onClick={() => saveAudience(true)}>{t('saApply').replace('{n}', eps.length)}</button>
        <button type="button" className="btn ghost" disabled={asaving || bandsMissing(a)} onClick={() => saveAudience(false)}>{t('saSaveOnly')}</button>
      </div>
      {amsg && <p className={amsg.ok ? 'meta' : 'error'} role="status">{amsg.text}</p>}
    </div>
  );
  const togglePublish = async () => {
    const r = await call(`/series/${id}`, { method: 'PATCH', body: JSON.stringify({ published: !s.published }) });
    if (r.ok) setS({ ...s, published: !s.published }); else setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  const removeSeries = async () => {
    if (!window.confirm(t('srDeleteConfirm'))) return;
    const r = await call(`/series/${id}`, { method: 'DELETE' });
    if (r.ok) router.push('/studio/series'); else setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  // Deux images : présentation (affiche, vignettes) et couverture (bandeau de la page). Chaque envoi renvoie l'adresse de l'image.
  const upImage = (kind) => async (image) => {
    const r = await call(`/series/${id}/${kind}`, { method: 'POST', body: JSON.stringify({ image }) });
    if (!r.ok) return { ok: false, error: r.data?.error || t('errGeneric') };
    setS((x) => ({ ...x, [kind === 'poster' ? 'posterUrl' : 'coverUrl']: r.data[kind === 'poster' ? 'posterUrl' : 'coverUrl'] }));
    return { ok: true };
  };
  const delImage = (kind) => async () => {
    const r = await call(`/series/${id}/${kind}`, { method: 'DELETE' });
    if (!r.ok) return { ok: false, error: r.data?.error || t('errGeneric') };
    setS((x) => ({ ...x, [kind === 'poster' ? 'posterUrl' : 'coverUrl']: null }));
    return { ok: true };
  };
  const imgLabels = { fallback: t('imgDefault'), choose: t('srImageChoose'), change: t('srImageChange'), remove: t('srImageRemove'), bad: t('thumbBad'), done: t('thumbDone'), none: t('srImageNone') };
  const firstThumb = (eps.find((e) => e.posterUrl) || {}).posterUrl || null; // image par défaut : celle de la première vidéo
  const images = (
    <>
      <ImageSlot kind="poster" title={t('srImgPoster')} help={t('srImgPosterHelp')} url={s.posterUrl} fallbackUrl={firstThumb} onUpload={upImage('poster')} onRemove={delImage('poster')} labels={imgLabels} />
      <ImageSlot kind="cover" title={t('srImgCover')} help={t('srImgCoverHelp')} url={s.coverUrl} fallbackUrl={s.posterUrl || firstThumb} onUpload={upImage('cover')} onRemove={delImage('cover')} labels={imgLabels} />
    </>
  );
  // Case « Aussi une collection » (enregistrée avec les informations).
  const asColl = (
    <label className="check sr-ascoll">
      <input type="checkbox" checked={Boolean(f.asCollection)} onChange={(e) => setF({ ...f, asCollection: e.target.checked })} />
      <span><b>{t('srAsCollection')}</b> <small className="meta">{t('srAsCollectionHelp')}</small>
        {s.collectionId && !infoDirty && <> <Link href="/studio/collections" className="link u">{t('srOpenCollections')}</Link></>}</span>
    </label>
  );

  // ----- saisons (enregistrées tout de suite) -----
  const addSeason = async () => {
    const r = await call(`/series/${id}/seasons`, { method: 'POST', body: JSON.stringify({}) });
    if (r.ok) setSeasons([...seasons, { id: r.data.id, title: '' }]); else setLmsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  const renameSeason = async (sid, title) => {
    const cur = seasons.find((z) => z.id === sid);
    if (!cur || cur.title === title) return;
    const r = await call(`/series/${id}/seasons/${sid}`, { method: 'PATCH', body: JSON.stringify({ title }) });
    if (r.ok) setSeasons(seasons.map((z) => (z.id === sid ? { ...z, title } : z))); else setLmsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  const moveSeason = async (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= seasons.length) return;
    const next = [...seasons]; [next[i], next[j]] = [next[j], next[i]];
    const r = await call(`/series/${id}/seasons-order`, { method: 'PUT', body: JSON.stringify({ ids: next.map((z) => z.id) }) });
    if (r.ok) setSeasons(next); else setLmsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  const deleteSeason = async (sid) => {
    if (eps.some((e) => e.seasonId === sid)) { setLmsg({ ok: false, text: t('srSeasonNotEmpty') }); return; }
    const r = await call(`/series/${id}/seasons/${sid}`, { method: 'DELETE' });
    if (r.ok) { setSeasons(seasons.filter((z) => z.id !== sid)); setLmsg(null); } else setLmsg({ ok: false, text: r.status === 409 ? t('srSaveFirst') : (r.data?.error || t('errGeneric')) });
  };

  // ----- épisodes (enregistrés avec le bouton « Enregistrer les épisodes ») -----
  const place = (talkId, seasonId, beforeId) => {
    const moving = eps.find((e) => e.id === talkId);
    if (!moving || talkId === beforeId) return;
    const rest = eps.filter((e) => e.id !== talkId);
    const item = { ...moving, seasonId };
    const at = beforeId ? rest.findIndex((e) => e.id === beforeId) : -1;
    if (at >= 0) rest.splice(at, 0, item); else rest.push(item);
    setEps(rest);
  };
  const step = (talkId, dir) => {
    const e = eps.find((x) => x.id === talkId);
    const same = eps.filter((x) => x.seasonId === e.seasonId);
    const k = same.findIndex((x) => x.id === talkId) + dir;
    if (k < 0 || k >= same.length) return;
    const a = eps.indexOf(e); const b = eps.indexOf(same[k]);
    const next = [...eps]; [next[a], next[b]] = [next[b], next[a]];
    setEps(next);
  };
  const setAccess = (talkId, access) => setEps(eps.map((e) => (e.id === talkId ? { ...e, access } : e)));
  const removeEp = (talkId) => setEps(eps.filter((e) => e.id !== talkId));
  const addPicked = () => {
    const seasonId = hasSeasons ? (target || firstSeason) : null;
    const add = candidates.filter((c) => pick.includes(c.id)).map((c) => ({ ...c, seasonId, access: 'inherit', accessOverride: null, visible: c.publication === 'published' }));
    setEps([...eps, ...add]); setPick([]);
  };
  const saveLayout = async () => {
    setSaving(true); setLmsg(null);
    const r = await call(`/series/${id}/episodes`, { method: 'PUT', body: JSON.stringify({ episodes: layoutOf(eps, hasSeasons) }) });
    setSaving(false);
    if (!r.ok) { setLmsg({ ok: false, text: r.data?.error || t('errGeneric') }); return; }
    setLmsg({ ok: true, text: t('saved') });
    await load();
  };
  const pill = (on, label, onClick) => <button type="button" aria-pressed={on} className={on ? 'pill on' : 'pill'} onClick={onClick}>{label}</button>;
  const inheritLabel = t('srInherit').replace('{a}', t(s.access));

  if (skin === 'premium') {
    return (
      <main className="studio-page">
        <BmPage title={s.title} sub={[s.speaker, t(s.access)].filter(Boolean).join(' · ')} actions={<>
          <BmBtn primary={false} href="/studio/series">{t('srBack')}</BmBtn>
          <BmBtn primary={!s.published} onClick={togglePublish}>{s.published ? t('srUnpublish') : t('srPublish')}</BmBtn>
        </>}>
          <BmMetrics cols="three" items={[
            { icon: 'film', tone: s.published ? 'green' : 'amber', label: t('colState'), value: s.published ? t('srPub') : t('srDraft') },
            { icon: 'layers', label: hasSeasons ? t('srSeasonCount').replace('{n}', seasons.length) : t('srNoSeasons'), value: hasSeasons ? seasons.length : null },
            { icon: 'video', label: t('srEpCount').replace('{n}', eps.length), value: eps.length },
          ]} />
          <div className="bm-form">
        <p className="meta small">{s.published ? t('srPublishedHelp') : t('srDraftHelp')}</p>
          </div>
          <BmCols kind="detail-layout">
            <div className="ay-stack">
              <BmPanel title={t('srEpisodes')} extra={hasSeasons ? t('srSeasonCount').replace('{n}', seasons.length) : t('srEpCount').replace('{n}', eps.length)}>
                <div className="bm-form" style={{ padding: '0 18px 18px' }}>
              {lmsg && <p className={lmsg.ok ? 'ok-msg' : 'error'} role="status">{lmsg.text}</p>}
              {groups.map((g, gi) => (
                <section key={g.id || 'all'} className="sr-season" onDragOver={(e) => { if (drag) e.preventDefault(); }} onDrop={() => { if (drag) { place(drag, g.id, null); setDrag(null); setOver(null); } }}>
                  {hasSeasons && (
                    <header className="sr-season-head">
                      <b>{t('srSeason').replace('{n}', g.number)}</b>
                      <input className="sr-season-title" defaultValue={g.title} maxLength={120} placeholder={t('srSeasonTitle')} aria-label={t('srSeasonTitle')} onBlur={(e) => renameSeason(g.id, e.target.value.trim())} />
                      <span className="sr-season-tools">
                        <button type="button" className="icon-btn" onClick={() => moveSeason(gi, -1)} disabled={gi === 0} aria-label={t('srUp')} title={t('srUp')}>↑</button>
                        <button type="button" className="icon-btn" onClick={() => moveSeason(gi, 1)} disabled={gi === groups.length - 1} aria-label={t('srDown')} title={t('srDown')}>↓</button>
                        <button type="button" className="icon-btn" onClick={() => deleteSeason(g.id)} aria-label={t('srDelSeason')} title={t('srDelSeason')}>✕</button>
                      </span>
                    </header>
                  )}
                  {g.list.length === 0 && <p className="meta small sr-empty">{t('srEmptySeason')}</p>}
                  <ul className="sr-eps">
                    {g.list.map((e, i) => (
                      <li key={e.id} className={`sr-ep${over === e.id ? ' over' : ''}${drag === e.id ? ' dragging' : ''}`} draggable
                        onDragStart={() => setDrag(e.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
                        onDragOver={(ev) => { if (drag) { ev.preventDefault(); setOver(e.id); } }}
                        onDrop={(ev) => { ev.stopPropagation(); if (drag) { place(drag, g.id, e.id); setDrag(null); setOver(null); } }}>
                        <span className="sr-handle" aria-hidden="true" title={t('srDrag')}>⠿</span>
                        <span className="sr-num">{i + 1}</span>
                        <span className="studio-thumb" style={e.posterUrl ? { backgroundImage: `url(${e.posterUrl})` } : undefined}><span className="dur">{clock(e.durationSeconds)}</span></span>
                        <span className="sr-ep-text">
                          <Link href={`/studio/${e.id}`}><b>{e.title}</b></Link>
                          <small>{[e.speaker, e.status !== 'ready' ? t('srProcessing') : !e.visible ? t('srNotPublic') : ''].filter(Boolean).join(' · ')}</small>
                        </span>
                        <select className="sr-access" value={e.access} onChange={(ev) => setAccess(e.id, ev.target.value)} aria-label={t('access')}>
                          <option value="inherit">{inheritLabel}</option>
                          <option value="free">{t('free')}</option>
                          <option value="premium">{t('premium')}</option>
                        </select>
                        {hasSeasons && seasons.length > 1 && (
                          <select className="sr-move" value="" onChange={(ev) => ev.target.value && place(e.id, ev.target.value, null)} aria-label={t('srMoveTo')}>
                            <option value="">{t('srMoveTo')}…</option>
                            {seasons.filter((z) => z.id !== e.seasonId).map((z) => <option key={z.id} value={z.id}>{t('srSeason').replace('{n}', seasons.indexOf(z) + 1)}</option>)}
                          </select>
                        )}
                        <span className="sr-tools">
                          <button type="button" className="icon-btn" onClick={() => step(e.id, -1)} disabled={i === 0} aria-label={t('srUp')} title={t('srUp')}>↑</button>
                          <button type="button" className="icon-btn" onClick={() => step(e.id, 1)} disabled={i === g.list.length - 1} aria-label={t('srDown')} title={t('srDown')}>↓</button>
                          <button type="button" className="icon-btn" onClick={() => removeEp(e.id)} aria-label={t('srRemove')} title={t('srRemove')}>✕</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {hasSeasons && <button type="button" className="btn ghost sr-addseason" onClick={addSeason}>{t('srAddSeason')}</button>}
                </div>
              </BmPanel>
              <BmPanel title={t('srAddTalks')} extra={<button type="button" className="btn ghost" aria-expanded={addOpen} aria-label={t('srAddTalks')} onClick={() => setAddOpen(!addOpen)}>{addOpen ? '−' : '+'}</button>}>
                <div className="bm-form" style={{ padding: '0 18px 18px' }}>
                {addOpen && (
                  <>
                    <input type="search" placeholder={t('srSearchTalks')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('srSearchTalks')} />
                    {candidates.length === 0 && <p className="meta small">{t('srNoCandidates')}</p>}
                    {candidates.length > 0 && (
                      <div className="co-bar">
                        <span className="meta small">{t('srCandCount').replace('{n}', candTotal)}</span>
                        <button type="button" className="btn ghost" onClick={() => setPick(pick.length === candidates.length ? [] : candidates.map((c) => c.id))}>{pick.length === candidates.length ? t('srSelNone') : t('srSelAll').replace('{n}', candidates.length)}</button>
                      </div>
                    )}
                    <ul className="sr-cands">
                      {candidates.map((c) => (
                        <li key={c.id}>
                          <label className="check"><input type="checkbox" checked={pick.includes(c.id)} onChange={() => setPick(pick.includes(c.id) ? pick.filter((x) => x !== c.id) : [...pick, c.id])} />
                            <span><b>{c.title}</b> <small className="meta">{[c.speaker, t(c.access), clock(c.durationSeconds)].filter(Boolean).join(' · ')}</small></span></label>
                        </li>
                      ))}
                    </ul>
                    {pick.length > 0 && (
                      <div className="sr-addbar">
                        {hasSeasons && (
                          <select value={target || firstSeason || ''} onChange={(e) => setTarget(e.target.value)} aria-label={t('srAddTo')}>
                            {seasons.map((z, i) => <option key={z.id} value={z.id}>{t('srAddTo')} {t('srSeason').replace('{n}', i + 1)}</option>)}
                          </select>
                        )}
                        <button type="button" className="btn" onClick={addPicked} disabled={hasSeasons && seasons.length === 0}>{t('srAddSel').replace('{n}', pick.length)}</button>
                      </div>
                    )}
                  </>
                )}
      
                </div>
              </BmPanel>
            </div>
            <div className="ay-stack">
              <BmPanel title={t('srInfo')} extra={<BmBadge tone={s.published ? 'green' : 'amber'}>{s.published ? t('srPub') : t('srDraft')}</BmBadge>}>
                <BmHeroArt src={s.posterUrl} title={s.title} />
                <div className="bm-form" style={{ padding: '0 18px 18px' }}>
                  <BmMeta items={[
                    [t('srStructure'), hasSeasons ? t('srSeasonCount').replace('{n}', seasons.length) : t('srNoSeasons')],
                    [t('srEpisodes'), eps.length],
                    [t('srAccess'), t(s.access)],
                  ]} />
                  {images}
                  <form onSubmit={saveInfo}>
                            <label className="fld"><span>{t('srName')}</span><input required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
                            <ChannelPicker value={f.speaker} onChange={(v) => setF({ ...f, speaker: v })} t={t} call={call} />
                            <label className="fld"><span>{t('speaker')}</span><input maxLength={200} value={f.speaker} onChange={(e) => setF({ ...f, speaker: e.target.value })} /></label>
                            <label className="fld"><span>{t('srDesc')}</span><textarea rows={4} maxLength={5000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
                            {audienceBlock}
                            <div className="fld" role="group" aria-label={t('srAccess')}>
                              <span>{t('srAccess')}</span>
                              <div className="pills">{pill(f.access === 'free', t('free'), () => setF({ ...f, access: 'free' }))}{pill(f.access === 'premium', t('premium'), () => setF({ ...f, access: 'premium' }))}</div>
                              <span className="meta small">{t('srAccessHelp')}</span>
                            </div>
                            <div className="fld" role="group" aria-label={t('lvLabel')}>
                              <span>{t('lvLabel')}</span>
                              <div className="pills">
                                {pill(!f.level, t('lvNone'), () => setF({ ...f, level: '' }))}
                                {LEVELS.map((l) => pill(f.level === l, levelLabel(l, t), () => setF({ ...f, level: l })))}
                              </div>
                              <span className="meta small">{t('lvHelp')}</span>
                            </div>
                            <div className="fld" role="group" aria-label={t('srPrereq')}>
                              <span>{t('srPrereq')}</span>
                              {others.filter((o) => o.id !== id).length === 0
                                ? <span className="meta small">{t('srPrereqNone')}</span>
                                : (
                                  <div className="pills">
                                    {others.filter((o) => o.id !== id).map((o) => pill(f.prerequisites.includes(o.id), o.title, () => setF({
                                      ...f,
                                      prerequisites: f.prerequisites.includes(o.id) ? f.prerequisites.filter((x) => x !== o.id) : [...f.prerequisites, o.id].slice(0, 5),
                                    })))}
                                  </div>
                                )}
                              <span className="meta small">{t('srPrereqHelp')}</span>
                            </div>
                            <div className="fld" role="group" aria-label={t('srStructure')}>
                              <span>{t('srStructure')}</span>
                              <div className="pills">{pill(f.hasSeasons, t('srWithSeasons'), () => setF({ ...f, hasSeasons: true }))}{pill(!f.hasSeasons, t('srNoSeasons'), () => setF({ ...f, hasSeasons: false }))}</div>
                              <span className="meta small">{t('srStructureHelp')}</span>
                            </div>
{asColl}
                            {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
                            <div className="panel-actions"><button className="btn" disabled={!infoDirty || saving}>{infoDirty ? t('save') : t('nothingToSave')}</button></div>
      
                  </form>
                </div>
              </BmPanel>
            </div>
          </BmCols>

      {dirty && (
        <div className="savebar" role="region" aria-label={t('srUnsaved')}>
          <span>{t('srUnsaved')}</span>
          <span className="sr-savebtns">
            <button type="button" className="btn ghost" onClick={load} disabled={saving}>{t('srDiscard')}</button>
            <button type="button" className="btn" onClick={saveLayout} disabled={saving}>{saving ? t('saving') : t('srSaveEpisodes')}</button>
          </span>
        </div>
      )}

      <div className="sr-danger"><button type="button" className="link u" onClick={removeSeries}>{t('srDelete')}</button></div>
        </BmPage>
      </main>
    );
  }
  return (
    <main className="studio-page">
      <Link href="/studio/series" className="back">← {t('srBack')}</Link>
      <div className="manage-head">
        <span className="studio-thumb big" style={s.posterUrl ? { backgroundImage: `url(${s.posterUrl})` } : undefined} />
        <div className="manage-title">
          <h1 className="studio-title">{s.title}</h1>
          <p className="meta">{[s.speaker, hasSeasons ? t('srSeasonCount').replace('{n}', seasons.length) : t('srNoSeasons'), t('srEpCount').replace('{n}', eps.length), t(s.access)].filter(Boolean).join(' · ')}</p>
          <span className={`state ${s.published ? 'state-live' : 'state-draft'}`}><i aria-hidden="true" />{s.published ? t('srPub') : t('srDraft')}</span>
        </div>
        <div className="manage-actions">
          <button type="button" className={s.published ? 'btn ghost' : 'btn'} onClick={togglePublish}>{s.published ? t('srUnpublish') : t('srPublish')}</button>
        </div>
      </div>
      <p className="meta small">{s.published ? t('srPublishedHelp') : t('srDraftHelp')}</p>

      <form className="panel" onSubmit={saveInfo}>
        <h2 className="panel-title">{t('srInfo')}</h2>
        <label className="fld"><span>{t('srName')}</span><input required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <ChannelPicker value={f.speaker} onChange={(v) => setF({ ...f, speaker: v })} t={t} call={call} />
        <label className="fld"><span>{t('speaker')}</span><input maxLength={200} value={f.speaker} onChange={(e) => setF({ ...f, speaker: e.target.value })} /></label>
        <label className="fld"><span>{t('srDesc')}</span><textarea rows={4} maxLength={5000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        {audienceBlock}
        <div className="fld" role="group" aria-label={t('srAccess')}>
          <span>{t('srAccess')}</span>
          <div className="pills">{pill(f.access === 'free', t('free'), () => setF({ ...f, access: 'free' }))}{pill(f.access === 'premium', t('premium'), () => setF({ ...f, access: 'premium' }))}</div>
          <span className="meta small">{t('srAccessHelp')}</span>
        </div>
        <div className="fld" role="group" aria-label={t('lvLabel')}>
          <span>{t('lvLabel')}</span>
          <div className="pills">
            {pill(!f.level, t('lvNone'), () => setF({ ...f, level: '' }))}
            {LEVELS.map((l) => pill(f.level === l, levelLabel(l, t), () => setF({ ...f, level: l })))}
          </div>
          <span className="meta small">{t('lvHelp')}</span>
        </div>
        <div className="fld" role="group" aria-label={t('srPrereq')}>
          <span>{t('srPrereq')}</span>
          {others.filter((o) => o.id !== id).length === 0
            ? <span className="meta small">{t('srPrereqNone')}</span>
            : (
              <div className="pills">
                {others.filter((o) => o.id !== id).map((o) => pill(f.prerequisites.includes(o.id), o.title, () => setF({
                  ...f,
                  prerequisites: f.prerequisites.includes(o.id) ? f.prerequisites.filter((x) => x !== o.id) : [...f.prerequisites, o.id].slice(0, 5),
                })))}
              </div>
            )}
          <span className="meta small">{t('srPrereqHelp')}</span>
        </div>
        <div className="fld" role="group" aria-label={t('srStructure')}>
          <span>{t('srStructure')}</span>
          <div className="pills">{pill(f.hasSeasons, t('srWithSeasons'), () => setF({ ...f, hasSeasons: true }))}{pill(!f.hasSeasons, t('srNoSeasons'), () => setF({ ...f, hasSeasons: false }))}</div>
          <span className="meta small">{t('srStructureHelp')}</span>
        </div>
{asColl}
        {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
        <div className="panel-actions"><button className="btn" disabled={!infoDirty || saving}>{infoDirty ? t('save') : t('nothingToSave')}</button></div>
      </form>

      <section className="panel">
        <h2 className="panel-title">{t('srImage')}</h2>
        {images}
      </section>

      <h2 className="panel-title outside">{t('srEpisodes')}</h2>
      {lmsg && <p className={lmsg.ok ? 'ok-msg' : 'error'} role="status">{lmsg.text}</p>}
      {groups.map((g, gi) => (
        <section key={g.id || 'all'} className="sr-season" onDragOver={(e) => { if (drag) e.preventDefault(); }} onDrop={() => { if (drag) { place(drag, g.id, null); setDrag(null); setOver(null); } }}>
          {hasSeasons && (
            <header className="sr-season-head">
              <b>{t('srSeason').replace('{n}', g.number)}</b>
              <input className="sr-season-title" defaultValue={g.title} maxLength={120} placeholder={t('srSeasonTitle')} aria-label={t('srSeasonTitle')} onBlur={(e) => renameSeason(g.id, e.target.value.trim())} />
              <span className="sr-season-tools">
                <button type="button" className="icon-btn" onClick={() => moveSeason(gi, -1)} disabled={gi === 0} aria-label={t('srUp')} title={t('srUp')}>↑</button>
                <button type="button" className="icon-btn" onClick={() => moveSeason(gi, 1)} disabled={gi === groups.length - 1} aria-label={t('srDown')} title={t('srDown')}>↓</button>
                <button type="button" className="icon-btn" onClick={() => deleteSeason(g.id)} aria-label={t('srDelSeason')} title={t('srDelSeason')}>✕</button>
              </span>
            </header>
          )}
          {g.list.length === 0 && <p className="meta small sr-empty">{t('srEmptySeason')}</p>}
          <ul className="sr-eps">
            {g.list.map((e, i) => (
              <li key={e.id} className={`sr-ep${over === e.id ? ' over' : ''}${drag === e.id ? ' dragging' : ''}`} draggable
                onDragStart={() => setDrag(e.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
                onDragOver={(ev) => { if (drag) { ev.preventDefault(); setOver(e.id); } }}
                onDrop={(ev) => { ev.stopPropagation(); if (drag) { place(drag, g.id, e.id); setDrag(null); setOver(null); } }}>
                <span className="sr-handle" aria-hidden="true" title={t('srDrag')}>⠿</span>
                <span className="sr-num">{i + 1}</span>
                <span className="studio-thumb" style={e.posterUrl ? { backgroundImage: `url(${e.posterUrl})` } : undefined}><span className="dur">{clock(e.durationSeconds)}</span></span>
                <span className="sr-ep-text">
                  <Link href={`/studio/${e.id}`}><b>{e.title}</b></Link>
                  <small>{[e.speaker, e.status !== 'ready' ? t('srProcessing') : !e.visible ? t('srNotPublic') : ''].filter(Boolean).join(' · ')}</small>
                </span>
                <select className="sr-access" value={e.access} onChange={(ev) => setAccess(e.id, ev.target.value)} aria-label={t('access')}>
                  <option value="inherit">{inheritLabel}</option>
                  <option value="free">{t('free')}</option>
                  <option value="premium">{t('premium')}</option>
                </select>
                {hasSeasons && seasons.length > 1 && (
                  <select className="sr-move" value="" onChange={(ev) => ev.target.value && place(e.id, ev.target.value, null)} aria-label={t('srMoveTo')}>
                    <option value="">{t('srMoveTo')}…</option>
                    {seasons.filter((z) => z.id !== e.seasonId).map((z) => <option key={z.id} value={z.id}>{t('srSeason').replace('{n}', seasons.indexOf(z) + 1)}</option>)}
                  </select>
                )}
                <span className="sr-tools">
                  <button type="button" className="icon-btn" onClick={() => step(e.id, -1)} disabled={i === 0} aria-label={t('srUp')} title={t('srUp')}>↑</button>
                  <button type="button" className="icon-btn" onClick={() => step(e.id, 1)} disabled={i === g.list.length - 1} aria-label={t('srDown')} title={t('srDown')}>↓</button>
                  <button type="button" className="icon-btn" onClick={() => removeEp(e.id)} aria-label={t('srRemove')} title={t('srRemove')}>✕</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hasSeasons && <button type="button" className="btn ghost sr-addseason" onClick={addSeason}>{t('srAddSeason')}</button>}

      <section className="panel">
        <button type="button" className="sr-toggle" aria-expanded={addOpen} onClick={() => setAddOpen(!addOpen)}><h2 className="panel-title">{addOpen ? '−' : '+'} {t('srAddTalks')}</h2></button>
        {addOpen && (
          <>
            <input type="search" placeholder={t('srSearchTalks')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('srSearchTalks')} />
            {candidates.length === 0 && <p className="meta small">{t('srNoCandidates')}</p>}
                    {candidates.length > 0 && (
                      <div className="co-bar">
                        <span className="meta small">{t('srCandCount').replace('{n}', candTotal)}</span>
                        <button type="button" className="btn ghost" onClick={() => setPick(pick.length === candidates.length ? [] : candidates.map((c) => c.id))}>{pick.length === candidates.length ? t('srSelNone') : t('srSelAll').replace('{n}', candidates.length)}</button>
                      </div>
                    )}
            <ul className="sr-cands">
              {candidates.map((c) => (
                <li key={c.id}>
                  <label className="check"><input type="checkbox" checked={pick.includes(c.id)} onChange={() => setPick(pick.includes(c.id) ? pick.filter((x) => x !== c.id) : [...pick, c.id])} />
                    <span><b>{c.title}</b> <small className="meta">{[c.speaker, t(c.access), clock(c.durationSeconds)].filter(Boolean).join(' · ')}</small></span></label>
                </li>
              ))}
            </ul>
            {pick.length > 0 && (
              <div className="sr-addbar">
                {hasSeasons && (
                  <select value={target || firstSeason || ''} onChange={(e) => setTarget(e.target.value)} aria-label={t('srAddTo')}>
                    {seasons.map((z, i) => <option key={z.id} value={z.id}>{t('srAddTo')} {t('srSeason').replace('{n}', i + 1)}</option>)}
                  </select>
                )}
                <button type="button" className="btn" onClick={addPicked} disabled={hasSeasons && seasons.length === 0}>{t('srAddSel').replace('{n}', pick.length)}</button>
              </div>
            )}
          </>
        )}
      </section>

      {dirty && (
        <div className="savebar" role="region" aria-label={t('srUnsaved')}>
          <span>{t('srUnsaved')}</span>
          <span className="sr-savebtns">
            <button type="button" className="btn ghost" onClick={load} disabled={saving}>{t('srDiscard')}</button>
            <button type="button" className="btn" onClick={saveLayout} disabled={saving}>{saving ? t('saving') : t('srSaveEpisodes')}</button>
          </span>
        </div>
      )}

      <div className="sr-danger"><button type="button" className="link u" onClick={removeSeries}>{t('srDelete')}</button></div>
    </main>
  );
}
