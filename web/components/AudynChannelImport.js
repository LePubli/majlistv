'use client';
// Studio → Audyn → « Importer une chaîne ou une playlist » : un contenu audio par vidéo.
// 1. l'adresse est lue par le serveur (liste des vidéos, sans rien télécharger) ;
// 2. on coche les vidéos (celles déjà dans Audyn sont grisées), on peut voir le DÉTAIL de chacune (description, chaîne, date,
//    chapitres, langues audio — lu par le serveur à la demande) et lui donner sa PROPRE catégorie (sinon celle de toute la liste) ;
//    on règle public, catégorie de la liste, accès, langue, voix française, découpage par chapitres, publication ;
// 3. chaque vidéo devient un contenu Audyn (titre de la vidéo ; auteur, description, couverture et chapitres repris de la vidéo
//    pendant la récupération du son), suivi sur la page de chaque contenu.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from './Providers';
import { AudynCategoryPicker, useAudynCategories } from './AudynCategories';

const AUDIENCE_KEY = { kids: 'ayAudKids', adults: 'ayAudAdults', both: 'ayAudBoth' };
const LANGS = ['fr', 'en', 'ar'];
const LIST = '__list__'; // catégorie de la vidéo = celle de toute la liste
const NEW = '__new__';
const mmss = (s) => { const n = Math.round(Number(s) || 0); const h = Math.floor(n / 3600); const m = Math.floor((n % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; };
const clock = (s) => { const n = Math.max(0, Math.round(Number(s) || 0)); const h = Math.floor(n / 3600); const m = Math.floor((n % 3600) / 60); const x = n % 60; return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(x).padStart(2, '0')}`; };
const MAX_DETAILS = 50;

// Catégorie d'une vidéo : « comme la liste » (d'origine), « Sans catégorie », une catégorie, ou une nouvelle tapée.
function RowCategory({ id, value, onChange, names, t }) {
  const [typing, setTyping] = useState(false);
  const known = value === undefined || value === '' || names.some((n) => n.toLowerCase() === value.toLowerCase());
  const free = typing || !known;
  const sel = value === undefined ? LIST : free ? NEW : value === '' ? '' : names.find((n) => n.toLowerCase() === value.toLowerCase());
  return (
    <span className="ay-ch-cat">
      <select aria-label={t('ayChRowCat')} id={`ay-ch-cat-${id}`} value={sel} onChange={(e) => {
        const v = e.target.value;
        if (v === NEW) { setTyping(true); onChange(''); return; }
        setTyping(false); onChange(v === LIST ? undefined : v);
      }}>
        <option value={LIST}>{t('ayChRowCatList')}</option>
        <option value="">{t('ayCgNone')}</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
        <option value={NEW}>{t('ayCgNewOpt')}</option>
      </select>
      {free && <input maxLength={80} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={t('ayCgNewPh')} aria-label={t('ayCgNewPh')} dir="auto" autoFocus={typing} />}
    </span>
  );
}

function Detail({ x, t, onRetry }) {
  const d = x.detail;
  if (!d || d.status === 'wanted') return <p className="meta" role="status">{t('ayChDetailLoading')}</p>;
  if (d.status === 'failed') {
    return (
      <p className="error" role="alert">{t('ayChDetailFailed')} <button type="button" className="btn ghost sm" onClick={onRetry}>{t('ayChDetailRetry')}</button></p>
    );
  }
  const langs = d.audioLangs || [];
  return (
    <div className="ay-ch-detail">
      <p className="meta">
        {[d.uploader, d.date, d.duration ? mmss(d.duration) : null].filter(Boolean).join(' · ')}
        {x.url && <> · <a href={x.url} target="_blank" rel="noopener noreferrer">{t('ayChDetailOpen')}</a></>}
      </p>
      {langs.length > 1 && (
        <p className="meta">{t('ayChDetailLangs')} : <bdi>{langs.join(', ')}</bdi>{langs.includes('fr') && <> · <b className="ay-ch-fr">{t('ayChDetailFr')}</b></>}</p>
      )}
      {d.chapters?.length > 0 ? (
        <details>
          <summary>{t('ayChDetailChapters').replace('{n}', d.chapters.length)}</summary>
          <ol className="ay-ch-chap">
            {d.chapters.map((c, i) => <li key={i}><span className="meta small">{clock(c.start)}</span> <span dir="auto">{c.title}</span></li>)}
          </ol>
        </details>
      ) : <p className="meta">{t('ayChDetailNoChapters')}</p>}
      {d.description ? <div className="ay-ch-desc" dir="auto">{d.description}</div> : <p className="meta">{t('ayChDetailNoDesc')}</p>}
    </div>
  );
}

export default function AudynChannelImport({ onDone }) {
  const { t, call } = useApp();
  const [cats] = useAudynCategories();
  const names = useMemo(() => (cats || []).map((c) => c.name), [cats]);
  const [url, setUrl] = useState('');
  const [lid, setLid] = useState(null);
  const [list, setList] = useState(null);   // réponse de GET /studio/audyn/listings/:lid
  const [sel, setSel] = useState(new Set());
  const [rowCat, setRowCat] = useState({}); // catégorie propre à une vidéo
  const [open, setOpen] = useState(new Set()); // détails dépliés
  const [o, setO] = useState({ audience: 'adults', category: '', access: 'learning', language: 'fr', fr: true, split: true, publish: false, rights: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [ping, setPing] = useState(0); // relance du suivi (détails demandés)

  // Suivi toutes les 3 secondes tant que le serveur lit la liste ou des détails demandés.
  useEffect(() => {
    if (!lid) return undefined;
    let alive = true; let timer = null; let first = list === null;
    const tick = async () => {
      const r = await call(`/studio/audyn/listings/${lid}`);
      if (!alive) return;
      if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
      setList(r.data);
      if (r.data.status !== 'listing' && first) { first = false; setSel(new Set(r.data.entries.filter((e) => !e.inAudyn).map((e) => e.id))); }
      const waiting = r.data.status === 'listing' || r.data.entries.some((e) => e.detail?.status === 'wanted');
      if (waiting) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [lid, call, t, ping]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = async (e) => {
    e.preventDefault();
    setErr(''); setDone(''); setList(null); setSel(new Set()); setRowCat({}); setOpen(new Set());
    const r = await call('/studio/audyn/listings', { method: 'POST', body: JSON.stringify({ url: url.trim() }) });
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    setLid(r.data.id);
  };
  const free = useMemo(() => (list?.entries || []).filter((x) => !x.inAudyn), [list]);
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = (on) => setSel(on ? new Set(free.map((x) => x.id)) : new Set());

  const askDetails = useCallback(async (ids, again = false) => {
    if (!ids.length) return;
    const r = await call(`/studio/audyn/listings/${lid}/details`, { method: 'POST', body: JSON.stringify({ ids: ids.slice(0, MAX_DETAILS), again }) });
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    // Affiché tout de suite « en cours », le suivi reprend.
    setList((l) => l && ({ ...l, entries: l.entries.map((e) => (ids.includes(e.id) && (!e.detail || again) ? { ...e, detail: { status: 'wanted' } } : e)) }));
    setPing((p) => p + 1);
  }, [call, lid, t]);
  const showDetail = (x) => {
    setOpen((s) => { const n = new Set(s); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; });
    if (!x.detail) askDetails([x.id]);
  };
  const detailsOfChecked = () => {
    const ids = [...sel].filter((id) => !list.entries.find((e) => e.id === id)?.detail);
    setOpen((s) => new Set([...s, ...sel]));
    askDetails(ids);
  };

  const confirm = async () => {
    if (!o.rights) { setErr(t('ayLinkNeedRights')); return; }
    setBusy(true); setErr('');
    const categories = Object.fromEntries(Object.entries(rowCat).filter(([id, v]) => sel.has(id) && v !== undefined).map(([id, v]) => [id, v.trim()]));
    const r = await call(`/studio/audyn/listings/${lid}/confirm`, { method: 'POST', body: JSON.stringify({
      ids: [...sel], audience: o.audience, category: o.category.trim(), categories, access: o.access, language: o.language,
      audioLang: o.fr ? 'fr' : 'original', split: o.split, publish: o.publish, rights: true,
    }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    setDone(t('ayChDone').replace('{n}', r.data.created) + (r.data.skipped ? ` ${t('ayChSkipped').replace('{n}', r.data.skipped)}` : ''));
    setLid(null); setList(null); setSel(new Set()); setRowCat({}); setOpen(new Set()); setUrl('');
    onDone?.();
  };
  const set = (k) => (e) => setO({ ...o, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <section className="panel ay-form" data-testid="audyn-channel">
      <h2 className="ay-h2">{t('ayChTitle')}</h2>
      <p className="meta">{t('ayChHelp')}</p>
      <form className="ay-link-row" onSubmit={read}>
        <input type="url" inputMode="url" dir="ltr" required maxLength={500} value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/@chaine" aria-label={t('ayChTitle')} />
        <button className="btn" disabled={!url.trim() || list?.status === 'listing'}>{t('ayChRead')}</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {done && <p className="meta" role="status">{done}</p>}
      {list?.status === 'listing' && <p className="meta" role="status">{t('ayChListing')}</p>}
      {list?.status === 'failed' && <p className="error" role="alert">{list.error || t('errGeneric')}</p>}
      {list && ['listed', 'imported'].includes(list.status) && (
        <>
          <p className="meta"><b dir="auto">{list.title || list.url}</b> · {t('ayChFound').replace('{n}', list.entries.length)}</p>
          {list.entries.length > 0 && (
            <div className="ay-ch-tools">
              <button type="button" className="btn ghost sm" onClick={() => all(true)}>{t('ayChAll')}</button>
              <button type="button" className="btn ghost sm" onClick={() => all(false)}>{t('ayChNone')}</button>
              <button type="button" className="btn ghost sm" disabled={sel.size === 0} onClick={detailsOfChecked}>{t('ayChDetailsChecked')}</button>
              <span className="meta">{t('ayChSelected').replace('{n}', sel.size)}</span>
            </div>
          )}
          <ul className="ay-ch-list">
            {list.entries.map((x) => (
              <li key={x.id} className={x.inAudyn ? 'off' : ''}>
                <label className="ay-ch-row">
                  <input type="checkbox" disabled={x.inAudyn} checked={sel.has(x.id)} onChange={() => toggle(x.id)} />
                  {x.thumb ? <img src={x.thumb} alt="" width="96" height="54" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ay-ch-ph" aria-hidden="true">🎧</span>}
                  <span className="ay-ch-t" dir="auto">{x.title}</span>
                  <span className="meta small">{x.inAudyn ? t('ayChAlready') : x.duration ? <bdi>{mmss(x.duration)}</bdi> : ''}</span>
                </label>
                {!x.inAudyn && (
                  <div className="ay-ch-ctl">
                    <RowCategory id={x.id} value={rowCat[x.id]} names={names} t={t}
                      onChange={(v) => setRowCat((m) => { const n = { ...m }; if (v === undefined) delete n[x.id]; else n[x.id] = v; return n; })} />
                    <button type="button" className="btn ghost sm" aria-expanded={open.has(x.id)} onClick={() => showDetail(x)}>
                      {open.has(x.id) ? t('ayChDetailHide') : t('ayChDetail')}
                    </button>
                  </div>
                )}
                {open.has(x.id) && <Detail x={x} t={t} onRetry={() => askDetails([x.id], true)} />}
              </li>
            ))}
          </ul>
          {free.length > 0 && (
            <div className="ay-ch-opts">
              <label className="fld"><span>{t('ayAudience')}</span>
                <select value={o.audience} onChange={set('audience')}>{['adults', 'kids', 'both'].map((a) => <option key={a} value={a}>{t(AUDIENCE_KEY[a])}</option>)}</select>
              </label>
              <AudynCategoryPicker id="ay-ch-cat" value={o.category} onChange={(v) => setO((x) => ({ ...x, category: v }))} />
              <p className="meta small">{t('ayChListCatHelp')}</p>
              <label className="fld"><span>{t('ayAccess')}</span>
                <select value={o.access} onChange={set('access')}><option value="learning">{t('ayAccLearning')}</option><option value="free">{t('ayAccFree')}</option></select>
              </label>
              <label className="fld"><span>{t('ayLang')}</span><select value={o.language} onChange={set('language')}>{LANGS.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
              <label className="chk"><input type="checkbox" checked={o.fr} onChange={set('fr')} /> <span>{t('ayLinkFr')}</span></label>
              <label className="chk"><input type="checkbox" checked={o.split} onChange={set('split')} /> <span>{t('ayLinkSplit')}</span></label>
              <label className="chk"><input type="checkbox" checked={o.publish} onChange={set('publish')} /> <span>{t('ayChPublish')}</span></label>
              <label className="chk"><input type="checkbox" checked={o.rights} onChange={set('rights')} /> <span>{t('ayChRights')}</span></label>
              <button type="button" className="btn" disabled={busy || sel.size === 0 || !o.rights} onClick={confirm}>{t('ayChImport').replace('{n}', sel.size)}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
