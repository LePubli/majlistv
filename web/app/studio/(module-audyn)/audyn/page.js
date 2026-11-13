'use client';
// Studio → Audyn : liste des contenus audio (livres audio adultes, histoires du soir enfants), création, journal des attestations de droits.
// Création depuis un lien (facultatif) : titre, auteur et description repris de la vidéo ; le son devient le premier chapitre et
// l'image de la vidéo la couverture (le travail se fait ensuite sur le serveur, suivi sur la page du contenu).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../../../components/Providers';
import StudioTabs from '../../../../components/StudioTabs';
import AudynChannelImport from '../../../../components/AudynChannelImport';
import { AudynCategoryManager, AudynCategoryPicker } from '../../../../components/AudynCategories';

export const AUDIENCE_KEY = { kids: 'ayAudKids', adults: 'ayAudAdults', both: 'ayAudBoth' };
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
        <ul className="ay-list">
          {data.items.map((i) => (
            <li key={i.id} className="panel ay-row">
              <div>
                <Link className="link u" href={`/studio/audyn/${i.id}`}><b>{i.title}</b></Link>
                <p className="meta">{[i.narrator, t(AUDIENCE_KEY[i.audience]), i.category, `${i.chapters} ${t('ayChaptersN')}`, i.durationSeconds ? clock(i.durationSeconds) : ''].filter(Boolean).join(' · ')}</p>
              </div>
              <span className={`ay-badge ${i.status === 'published' ? 'on' : ''}`}>{i.status === 'published' ? t('ayPublished') : t('ayDraft')}</span>
            </li>
          ))}
        </ul>
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
