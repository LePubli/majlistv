'use client';
// Studio → Audyn → « Importer une chaîne ou une playlist » : un contenu audio par vidéo.
// 1. l'adresse est lue par le serveur (liste des vidéos, sans rien télécharger) ;
// 2. on coche les vidéos (celles déjà dans Audyn sont grisées) et on règle public, catégorie, accès, langue, voix française,
//    découpage par chapitres, publication ;
// 3. chaque vidéo devient un contenu Audyn (titre de la vidéo ; auteur, description, couverture et chapitres repris de la vidéo
//    pendant la récupération du son), suivi sur la page de chaque contenu.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from './Providers';

const AUDIENCE_KEY = { kids: 'ayAudKids', adults: 'ayAudAdults', both: 'ayAudBoth' };
const LANGS = ['fr', 'en', 'ar'];
const mmss = (s) => { const n = Math.round(Number(s) || 0); const h = Math.floor(n / 3600); const m = Math.floor((n % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; };

export default function AudynChannelImport({ onDone }) {
  const { t, call } = useApp();
  const [url, setUrl] = useState('');
  const [lid, setLid] = useState(null);
  const [list, setList] = useState(null);   // réponse de GET /studio/audyn/listings/:lid
  const [sel, setSel] = useState(new Set());
  const [o, setO] = useState({ audience: 'adults', category: '', access: 'learning', language: 'fr', fr: true, split: true, publish: false, rights: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  // Lecture de la liste : suivie toutes les 3 secondes tant que le serveur la lit.
  useEffect(() => {
    if (!lid) return undefined;
    let alive = true; let timer = null;
    const tick = async () => {
      const r = await call(`/studio/audyn/listings/${lid}`);
      if (!alive) return;
      if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
      setList(r.data);
      if (r.data.status === 'listing') { timer = setTimeout(tick, 3000); return; }
      setSel(new Set(r.data.entries.filter((e) => !e.inAudyn).map((e) => e.id)));
    };
    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [lid, call, t]);

  const read = async (e) => {
    e.preventDefault();
    setErr(''); setDone(''); setList(null); setSel(new Set());
    const r = await call('/studio/audyn/listings', { method: 'POST', body: JSON.stringify({ url: url.trim() }) });
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    setLid(r.data.id);
  };
  const free = useMemo(() => (list?.entries || []).filter((x) => !x.inAudyn), [list]);
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = (on) => setSel(on ? new Set(free.map((x) => x.id)) : new Set());
  const confirm = async () => {
    if (!o.rights) { setErr(t('ayLinkNeedRights')); return; }
    setBusy(true); setErr('');
    const r = await call(`/studio/audyn/listings/${lid}/confirm`, { method: 'POST', body: JSON.stringify({
      ids: [...sel], audience: o.audience, category: o.category.trim(), access: o.access, language: o.language,
      audioLang: o.fr ? 'fr' : 'original', split: o.split, publish: o.publish, rights: true,
    }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    setDone(t('ayChDone').replace('{n}', r.data.created) + (r.data.skipped ? ` ${t('ayChSkipped').replace('{n}', r.data.skipped)}` : ''));
    setLid(null); setList(null); setSel(new Set()); setUrl('');
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
                  <span className="meta small">{x.inAudyn ? t('ayChAlready') : x.duration ? mmss(x.duration) : ''}</span>
                </label>
              </li>
            ))}
          </ul>
          {free.length > 0 && (
            <div className="ay-ch-opts">
              <label className="fld"><span>{t('ayAudience')}</span>
                <select value={o.audience} onChange={set('audience')}>{['adults', 'kids', 'both'].map((a) => <option key={a} value={a}>{t(AUDIENCE_KEY[a])}</option>)}</select>
              </label>
              <label className="fld"><span>{t('ayCategory')}</span><input maxLength={80} value={o.category} onChange={set('category')} /></label>
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
