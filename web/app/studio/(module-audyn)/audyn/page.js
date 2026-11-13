'use client';
// Studio → Audyn : liste des contenus audio (livres audio adultes, histoires du soir enfants), création, journal des attestations de droits.
// Création depuis un lien (facultatif) : titre, auteur et description repris de la vidéo ; le son devient le premier chapitre et
// l'image de la vidéo la couverture (le travail se fait ensuite sur le serveur, suivi sur la page du contenu).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../../../components/Providers';
import StudioTabs from '../../../../components/StudioTabs';
import AudynChannelImport from '../../../../components/AudynChannelImport';
import { AudynCategoryManager, AudynCategoryPicker } from '../../../../components/AudynCategories';

export const AUDIENCE_KEY = { kids: 'ayAudKids', adults: 'ayAudAdults', both: 'ayAudBoth' };
const FILTERS = ['all', 'published', 'draft', 'noaudio', 'importing', 'failed'];
// État d'un contenu dans la liste : récupération du son en cours ou en échec d'abord, puis publié / brouillon / sans son.
export function itemState(i) {
  if (i.importStatus === 'pending' || i.importStatus === 'downloading') return ['importing', 'run', 'ayStImporting'];
  if (i.importStatus === 'failed' && !i.chapters) return ['failed', 'err', 'ayStFailed'];
  if (i.status === 'published') return ['published', 'ok', 'ayPublished'];
  if (!i.chapters) return ['noaudio', 'muted', 'ayStNoAudio'];
  return ['draft', 'muted', 'ayDraft'];
}
export const clock = (sec) => { const s = Math.round(sec || 0); const h = Math.floor(s / 3600); return `${h ? h + ' h ' : ''}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')} min`; };

export default function StudioAudyn() {
  const { t, call, locale } = useApp();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [rights, setRights] = useState(null);
  const [open, setOpen] = useState(false);
  const [chan, setChan] = useState(false); // « Importer une chaîne ou une playlist »
  const [cats, setCats] = useState(false); // panneau « Catégories »
  const [f, setF] = useState({ title: '', audience: 'adults', author: '', description: '', category: '' });
  const [link, setLink] = useState('');
  const [frLink, setFrLink] = useState(true);
  const [splitLink, setSplitLink] = useState(true);
  const [linkRights, setLinkRights] = useState(false);
  const [info, setInfo] = useState(''); // '' | 'loading' | 'done' | 'none'
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [catF, setCatF] = useState(''); // filtre par catégorie ('' = toutes, '__none__' = sans catégorie)
  const [sel, setSel] = useState(new Set());
  const [bulkCat, setBulkCat] = useState(null); // catégorie à donner aux contenus cochés (null = menu fermé)
  const [flash, setFlash] = useState('');
  const [failed, setFailed] = useState(null); // imports en échec / en attente pour cause de blocage YouTube
  const loadFailed = () => call('/studio/audyn/link-imports/failed').then((r) => setFailed(r.ok ? r.data : null));
  const reload = () => { loadFailed(); return call('/studio/audyn').then((r) => setData(r.ok ? r.data : { items: [], storage: true, limits: {} })); };
  const retryAll = async () => { const r = await call('/studio/audyn/link-imports/retry-failed', { method: 'POST' }); if (r.ok) loadFailed(); };
  useEffect(() => { reload(); }, [call]); // eslint-disable-line react-hooks/exhaustive-deps
  // Lien collé : titre, auteur (nom de la chaîne) et description repris de la vidéo, sans écraser ce qui est déjà tapé.
  const readLink = async () => {
    const url = link.trim();
    if (!/^https?:\/\//i.test(url)) return;
    setInfo('loading');
    const r = await call(`/studio/link-info?url=${encodeURIComponent(url)}&lang=fr`);
    if (!r.ok || !r.data?.found) { setInfo('none'); return; }
    setF((x) => ({ ...x, title: x.title || r.data.title || '', author: x.author || r.data.speaker || '', description: x.description || r.data.description || '' }));
    setInfo('done');
  };
  const create = async (e) => {
    e.preventDefault();
    const url = link.trim();
    if (url && !linkRights) { setErr(t('ayLinkNeedRights')); return; }
    setBusy(true); setErr('');
    const r = await call('/studio/audyn', { method: 'POST', body: JSON.stringify({ ...f, description: (f.description || '').slice(0, 4000) }) });
    if (!r.ok) { setBusy(false); setErr(r.data?.error || t('errGeneric')); return; }
    if (url) {
      const j = await call(`/studio/audyn/${r.data.id}/link-imports`, { method: 'POST', body: JSON.stringify({ url, rights: true, audioLang: frLink ? 'fr' : 'original', cover: 'auto', split: splitLink }) });
      // Le contenu existe déjà : en cas de refus du lien, on ouvre quand même sa page (le message y sera repris).
      if (!j.ok) { setBusy(false); router.push(`/studio/audyn/${r.data.id}?linkError=${encodeURIComponent(j.data?.error || '')}`); return; }
    }
    router.push(`/studio/audyn/${r.data.id}`);
  };
  const items = data?.items || [];
  const catNames = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items]);
  const count = useMemo(() => { const c = {}; for (const i of items) { const k = itemState(i)[0]; c[k] = (c[k] || 0) + 1; } return c; }, [items]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((i) => (filter === 'all' || itemState(i)[0] === filter)
      && (!catF || (catF === '__none__' ? !i.category : i.category === catF))
      && (!s || [i.title, i.author, i.narrator, i.category].some((x) => (x || '').toLowerCase().includes(s))));
  }, [items, q, filter, catF]);
  const allShown = shown.length > 0 && shown.every((i) => sel.has(i.id));
  const toggleAll = () => setSel(allShown ? new Set() : new Set(shown.map((i) => i.id)));
  const toggleOne = (id) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulk = async (action, extra = {}) => {
    const r = await call('/studio/audyn/bulk', { method: 'POST', body: JSON.stringify({ ids: [...sel], action, ...extra }) });
    if (!r.ok) { setFlash(r.data?.error || t('errGeneric')); return; }
    setFlash(t('ayBkDone').replace('{n}', r.data.done) + (r.data.skipped ? ` ${t(action === 'publish' ? 'ayBkSkippedPublish' : 'ayBkSkipped').replace('{n}', r.data.skipped)}` : ''));
    setSel(new Set()); setBulkCat(null); reload();
    setTimeout(() => setFlash(''), 6000);
  };
  // Titre, auteur et description relus depuis la vidéo (en français), pour les contenus jamais modifiés à la main.
  const refreshMeta = async () => {
    const r = await call('/studio/audyn/refresh-meta', { method: 'POST', body: JSON.stringify({ ids: [...sel] }) });
    if (!r.ok) { setFlash(r.data?.error || t('errGeneric')); return; }
    setFlash(t('ayBkMetaDone').replace('{n}', r.data.queued) + (r.data.skipped ? ` ${t('ayBkMetaSkipped').replace('{n}', r.data.skipped)}` : ''));
    setSel(new Set()); reload(); setTimeout(() => setFlash(''), 8000);
  };
  const showRights = async () => { const r = await call('/studio/audyn-rights'); setRights(r.ok ? r.data : []); };
  const date = (d) => new Date(d).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <main className="studio-page">
      <div className="studio-head">
        <h1 className="studio-title">{t('ayNav')}</h1>
        <div className="ay-head-btns">
          <button className="btn ghost" onClick={() => setCats((v) => !v)} aria-expanded={cats}>{t('ayCgOpen')}</button>
          <button className="btn ghost" onClick={() => setChan((v) => !v)} aria-expanded={chan}>{t('ayChOpen')}</button>
          <button className="btn" onClick={() => setOpen((v) => !v)}>{t('ayNew')}</button>
        </div>
      </div>
      <StudioTabs />
      <p className="meta">{t('ayIntro')}</p>
      {data && !data.storage && <p className="error" role="alert">{t('ayNoStorage')}</p>}
      {failed?.waiting > 0 && <p className="error" role="alert">{t('ayBlockedWait').replace('{n}', failed.waiting)}</p>}
      {failed?.count > 0 && (
        <div className="panel ay-failed" role="status">
          <p>{t('ayFailedN').replace('{n}', failed.count)}{failed.blocked > 0 ? ` ${t('ayFailedBlocked').replace('{n}', failed.blocked)}` : ''}</p>
          <button type="button" className="btn" onClick={retryAll}>{t('ayRetryAll').replace('{n}', failed.count)}</button>
        </div>
      )}
      {cats && <AudynCategoryManager onChange={reload} />}
      {chan && <AudynChannelImport onDone={reload} />}
      {open && (
        <form className="panel ay-form" onSubmit={create}>
          <label className="fld"><span>{t('ayNewFromLink')}</span>
            <input type="url" inputMode="url" dir="ltr" maxLength={1000} value={link} placeholder="https://www.youtube.com/watch?v=…"
              onChange={(e) => { setLink(e.target.value); setInfo(''); }} onBlur={readLink} />
          </label>
          {link.trim() && <p className="meta small">{info === 'loading' ? t('ayLinkReading') : info === 'none' ? t('ayLinkNoInfo') : t('ayNewFromLinkHelp')}</p>}
          <label className="fld"><span>{t('ayTitleF')}</span><input required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          {link.trim() && <label className="fld"><span>{t('ayAuthor')}</span><input maxLength={200} value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} /></label>}
          <label className="fld"><span>{t('ayAudience')}</span>
            <select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
              {['adults', 'kids', 'both'].map((a) => <option key={a} value={a}>{t(AUDIENCE_KEY[a])}</option>)}
            </select>
          </label>
          <AudynCategoryPicker id="ay-new-cat" value={f.category} onChange={(v) => setF({ ...f, category: v })} />
          {link.trim() && (
            <>
              <label className="chk"><input type="checkbox" checked={frLink} onChange={(e) => setFrLink(e.target.checked)} /> <span>{t('ayLinkFr')}</span></label>
              <label className="chk"><input type="checkbox" checked={splitLink} onChange={(e) => setSplitLink(e.target.checked)} /> <span>{t('ayLinkSplit')}</span></label>
              <label className="chk"><input type="checkbox" checked={linkRights} onChange={(e) => setLinkRights(e.target.checked)} /> <span>{t('ayLinkRights')}</span></label>
            </>
          )}
          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn" disabled={busy || !f.title.trim() || (link.trim() && !linkRights)}>{t('ayCreate')}</button>
        </form>
      )}
      {!data ? <p className="meta">{t('ayLoading')}</p> : data.items.length === 0 ? <p className="meta">{t('ayEmpty')}</p> : (
        <>
          <div className="studio-tools">
            <label className="studio-search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <span className="sr-only">{t('search')}</span>
              <input type="search" placeholder={t('aySearchStudio')} value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <div className="pills" role="group" aria-label={t('filterBy')}>
              {FILTERS.filter((k) => k === 'all' || count[k]).map((k) => (
                <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? 'pill on' : 'pill'} onClick={() => setFilter(k)}>
                  {t('ayF_' + k)}{k !== 'all' ? ` (${count[k]})` : ` (${data.items.length})`}
                </button>
              ))}
            </div>
            {catNames.length > 0 && (
              <select className="ay-cat-filter" value={catF} onChange={(e) => setCatF(e.target.value)} aria-label={t('ayCategory')}>
                <option value="">{t('ayAllCats')}</option>
                {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__none__">{t('ayCgNone')}</option>
              </select>
            )}
          </div>
          {flash && <p className="notice" role="status">{flash}</p>}
          {sel.size > 0 && (
            <div className="bk-bar" role="region" aria-label={t('bkEdit')}>
              <strong>{t('ayBkSelected').replace('{n}', sel.size)}</strong>
              <button type="button" className="btn" onClick={() => bulk('publish')}>{t('ayBkPublish')}</button>
              <button type="button" className="btn ghost" onClick={() => bulk('draft')}>{t('ayBkDraft')}</button>
              <button type="button" className="btn ghost" onClick={refreshMeta}>{t('ayBkMeta')}</button>
              {bulkCat === null ? (
                <button type="button" className="btn ghost" onClick={() => setBulkCat('')}>{t('ayBkCategory')}</button>
              ) : (
                <span className="ay-bk-cat">
                  <AudynCategoryPicker id="ay-bk-cat" value={bulkCat} onChange={setBulkCat} />
                  <button type="button" className="btn sm" onClick={() => bulk('category', { category: bulkCat.trim() })}>{t('ayBkApply')}</button>
                </span>
              )}
              <button type="button" className="btn ghost ay-bk-del" onClick={() => { if (confirm(t('ayBkDeleteAsk').replace('{n}', sel.size))) bulk('delete'); }}>{t('bkRemove')}</button>
              <button type="button" className="btn ghost" onClick={() => { setSel(new Set()); setBulkCat(null); }}>{t('bkClear')}</button>
            </div>
          )}
          {shown.length === 0 ? <p className="meta">{t('noResults')}</p> : (
            <div className="studio-table-wrap">
              <table className="studio-table ay-table-list">
                <thead>
                  <tr>
                    <th className="bk-col"><input type="checkbox" checked={allShown} onChange={toggleAll} aria-label={t('bkAll')} /></th>
                    <th>{t('ayColItem')}</th><th>{t('ayAudience')}</th><th>{t('ayColAudio')}</th><th>{t('ayColState')}</th>
                    <th><span className="sr-only">{t('colActions')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => {
                    const [, tone, label] = itemState(i);
                    return (
                      <tr key={i.id} className={sel.has(i.id) ? 'bk-sel' : undefined}>
                        <td className="bk-col"><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggleOne(i.id)} aria-label={i.title} /></td>
                        <td>
                          <Link href={`/studio/audyn/${i.id}`} className="studio-talk">
                            <span className="studio-thumb ay-sthumb" style={i.coverUrl ? { backgroundImage: `url(${i.coverUrl})` } : undefined}>{!i.coverUrl && '🎧'}</span>
                            <span className="studio-talk-text">
                              <b dir="auto">{i.title}</b>
                              <small dir="auto">{[i.author || i.narrator, i.category].filter(Boolean).join(' · ') || '—'}</small>
                            </span>
                          </Link>
                        </td>
                        <td className="ay-aud">{t(AUDIENCE_KEY[i.audience])}</td>
                        <td className="ay-audio">{i.chapters ? <>{i.chapters === 1 ? t('awChapter1') : t('awChapters').replace('{n}', i.chapters)}<small>{i.durationSeconds ? clock(i.durationSeconds) : ''}</small></> : '—'}</td>
                        <td><span className={`pd-label ${tone}`}>{t(label)}</span></td>
                        <td className="end"><Link href={`/studio/audyn/${i.id}`} className="manage">{t('manage')}</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <h2 className="ay-h2">{t('ayRightsTitle')}</h2>
      {rights === null ? <button className="btn ghost sm" onClick={showRights}>{t('ayRightsShow')}</button> : rights.length === 0 ? <p className="meta">{t('ayRightsNone')}</p> : (
        <div className="ay-wrap">
          <table className="ay-table">
            <thead><tr><th>{t('ayRightsWhen')}</th><th>{t('ayRightsItem')}</th><th>{t('ayRightsFile')}</th><th>{t('ayRightsBy')}</th></tr></thead>
            <tbody>{rights.map((r) => <tr key={r.id}><td>{date(r.at)}</td><td>{r.itemTitle}</td><td>{r.filename}</td><td>{r.by}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}
