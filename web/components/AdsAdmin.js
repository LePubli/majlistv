'use client';
// Admin → Publicités (étape 24c) : publicités plein écran montrées au lancement de l'application (photo ou courte vidéo).
// Plusieurs publicités peuvent être actives : l'application les fait tourner (une différente à chaque lancement) ;
// chacune peut avoir une date et une heure de début et de fin. Les réglages (abonnés payants, nombre à la suite, durées) sont dans
// Admin → Paramètres → « Publicité au lancement », l'interrupteur général dans Admin → Fonctions.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';

const EMPTY = { advertiser: '', title: '', sentence: '', ctaLabel: 'En savoir plus', linkUrl: '', active: true, startsAt: '', endsAt: '' };
const STATUS = { live: ['En cours', 'ok'], scheduled: ['Programmée', 'meta'], ended: ['Terminée', 'meta'], paused: ['En pause', 'meta'] };
// Valeur d'un champ « date et heure » (heure locale) ⇄ instant ISO.
const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const toIso = (v) => (v ? new Date(v).toISOString() : null);
const when = (d, locale) => (d ? new Date(d).toLocaleString(locale === 'ar' ? 'ar' : locale, { dateStyle: 'short', timeStyle: 'short' }) : '');
const typeOf = (f) => f.type || (/\.png$/i.test(f.name) ? 'image/png' : /\.jpe?g$/i.test(f.name) ? 'image/jpeg' : /\.webp$/i.test(f.name) ? 'image/webp' : /\.mp4$/i.test(f.name) ? 'video/mp4' : /\.webm$/i.test(f.name) ? 'video/webm' : '');

// Envoi direct du fichier vers le stockage, avec progression ; ne reste jamais bloqué (délai maximal 15 min, erreurs expliquées).
function putFile(url, file, type, onProgress) {
  return new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', type);
    x.timeout = 15 * 60 * 1000;
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => resolve({ ok: x.status >= 200 && x.status < 300, status: x.status });
    x.onerror = () => resolve({ ok: false, status: 0 });
    x.ontimeout = () => resolve({ ok: false, status: -1 });
    x.onabort = () => resolve({ ok: false, status: -2 });
    x.send(file);
  });
}
const putError = (status) => (status === 0 ? "Le navigateur n'a pas pu joindre le stockage (réseau, ou le stockage refuse l'origine du site : vérifier CORS et CSP_STORAGE_ORIGINS)." : status === -1 ? "L'envoi a dépassé 15 minutes : essayez un fichier plus léger." : status === 413 ? 'Fichier refusé par le serveur de stockage (trop gros).' : status === 403 ? 'Stockage : accès refusé (lien d’envoi expiré ou clés de stockage incorrectes).' : `Le stockage a répondu une erreur (code ${status}).`);

function Preview({ ad }) {
  if (!ad.mediaUrl) return null;
  return ad.mediaKind === 'video'
    ? <video className="ads-thumb" src={ad.mediaUrl} muted playsInline preload="metadata" controls />
    // eslint-disable-next-line @next/next/no-img-element
    : <img className="ads-thumb" src={ad.mediaUrl} alt="" loading="lazy" />;
}

function AdForm({ ad, limits, onDone, onCancel }) {
  const { call } = useApp();
  const [o, setO] = useState(ad ? { advertiser: ad.advertiser, title: ad.title, sentence: ad.sentence, ctaLabel: ad.ctaLabel, linkUrl: ad.linkUrl, active: ad.active, startsAt: toLocal(ad.startsAt), endsAt: toLocal(ad.endsAt) } : EMPTY);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pct, setPct] = useState(null);
  const set = (k) => (e) => setO({ ...o, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!ad && !file) { setErr('Choisissez une photo ou une vidéo.'); return; }
    if (o.startsAt && o.endsAt && new Date(o.endsAt) <= new Date(o.startsAt)) { setErr('La date de fin doit suivre la date de début.'); return; }
    setBusy(true); setPct(null);
    try {
      let key;
      if (file) {
        const type = typeOf(file);
        const isVideo = type.startsWith('video/');
        const max = (isVideo ? limits.videoMb : limits.imageMb) * 1048576;
        if (!type) throw new Error('Format non accepté : photo png, jpeg, webp ou vidéo mp4, webm.');
        if (file.size > max) throw new Error(`Fichier trop lourd (${Math.round(file.size / 1048576)} Mo) : ${isVideo ? limits.videoMb : limits.imageMb} Mo maximum.`);
        const u = await call('/admin/ads/upload-url', { method: 'POST', body: JSON.stringify({ contentType: type, size: file.size }) });
        if (!u.ok) throw new Error(u.data?.error || "Le serveur n'a pas donné de lien d'envoi.");
        setPct(0);
        const put = await putFile(u.data.url, file, type, setPct);
        if (!put.ok) throw new Error(putError(put.status));
        key = u.data.key;
      }
      setPct(null);
      const body = { advertiser: o.advertiser, title: o.title, sentence: o.sentence, ctaLabel: o.ctaLabel || 'En savoir plus', linkUrl: o.linkUrl, active: o.active, startsAt: toIso(o.startsAt), endsAt: toIso(o.endsAt), ...(key ? { mediaKey: key } : {}) };
      const r = ad ? await call(`/admin/ads/${ad.id}`, { method: 'PATCH', body: JSON.stringify(body) }) : await call('/admin/ads', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok) throw new Error(r.data?.error || 'Enregistrement impossible.');
      onDone();
    } catch (ex) {
      setErr(ex?.message || 'Une erreur est survenue : réessayez.');
    } finally { setBusy(false); setPct(null); }
  };

  return (
    <form className="form ads-form card" onSubmit={submit}>
      <h2>{ad ? 'Modifier la publicité' : 'Nouvelle publicité'}</h2>
      <label className="fld"><span>Visuel plein écran {ad ? '(laisser vide pour garder l’actuel)' : ''}</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,.png,.jpg,.jpeg,.webp,.mp4,.webm" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <small className="meta">Photo (png, jpeg, webp — {limits.imageMb} Mo max) ou vidéo (mp4, webm — {limits.videoMb} Mo max). Format vertical 9:16 conseillé (1080 × 1920) : il remplit tout l’écran du téléphone.</small>
      </label>
      <div className="form-grid">
        <label>Nom de l’annonceur<input required maxLength={80} value={o.advertiser} onChange={set('advertiser')} /></label>
        <label>Titre accrocheur<input required maxLength={120} value={o.title} onChange={set('title')} /></label>
        <label>Phrase de présentation<input maxLength={240} value={o.sentence} onChange={set('sentence')} /></label>
        <label>Texte du bouton<input required maxLength={30} value={o.ctaLabel} onChange={set('ctaLabel')} /></label>
        <label>Lien du bouton<input type="url" required maxLength={500} value={o.linkUrl} placeholder="https://…" onChange={set('linkUrl')} /></label>
      </div>
      <div className="form-grid">
        <label>Début (date et heure, facultatif)<input type="datetime-local" value={o.startsAt} onChange={set('startsAt')} /></label>
        <label>Fin (date et heure, facultatif)<input type="datetime-local" value={o.endsAt} onChange={set('endsAt')} /></label>
      </div>
      <small className="meta">Sans date : la publicité est montrée dès l’enregistrement et jusqu’à ce que vous la mettiez en pause. Les heures sont celles de cet ordinateur.</small>
      <label className="check"><input type="checkbox" checked={o.active} onChange={set('active')} /> Active</label>
      {busy && pct != null && <progress value={pct} max="100" style={{ width: '100%' }} aria-label="Progression de l’envoi" />}
      {file && !busy && <small className="meta">Fichier choisi : {file.name} ({(file.size / 1048576).toFixed(1)} Mo)</small>}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="studio-tools">
        <button className="btn" disabled={busy}>{busy ? (pct != null ? `Envoi du fichier… ${pct} %` : 'Enregistrement…') : ad ? 'Enregistrer' : 'Créer la publicité'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

export default function AdsAdmin() {
  const { call, locale } = useApp();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null); // null | 'new' | annonce en modification
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => call('/admin/ads').then((r) => setData(r.ok ? r.data : { error: r.data?.error || 'Chargement impossible.' })), [call]);
  useEffect(() => { load(); }, [load]);
  const flash = (ok, text) => setMsg({ ok, text });
  const act = async (path, opts, okText) => {
    const r = await call(path, opts);
    if (r.ok) { if (okText) flash(true, okText); load(); } else flash(false, r.data?.error || 'Action impossible.');
  };
  const remove = (a) => { if (window.confirm(`Supprimer la publicité « ${a.title} » (${a.advertiser}) ? Son visuel et ses compteurs seront effacés.`)) act(`/admin/ads/${a.id}`, { method: 'DELETE' }, 'Publicité supprimée.'); };

  if (!data) return <p className="meta">Chargement…</p>;
  if (data.error) return <p className="error">{data.error}</p>;
  const ads = data.ads;
  return (
    <section className="ads-admin">
      <p className="meta">Publicités plein écran, passables, montrées au lancement de l’application (jamais dans l’espace Kids, jamais pendant l’heure de prière). S’il y en a plusieurs en cours, elles tournent : une différente à chaque lancement. Réglages (abonnés payants, nombre à la suite, durées) : Admin → Paramètres → « Publicité au lancement ».</p>
      {!data.storage && <p className="error">Le stockage vidéo n’est pas configuré : l’envoi des visuels est impossible.</p>}
      {form ? (
        <AdForm ad={form === 'new' ? null : form} limits={data.limits} onCancel={() => setForm(null)} onDone={() => { setForm(null); flash(true, 'Publicité enregistrée.'); load(); }} />
      ) : (
        <button type="button" className="btn" onClick={() => { setMsg(null); setForm('new'); }} disabled={!data.storage}>Nouvelle publicité</button>
      )}
      {msg && <p className={msg.ok ? 'meta ok' : 'error'} role="status">{msg.text}</p>}
      {ads.length === 0 && !form && <p className="meta">Aucune publicité pour l’instant.</p>}
      <ul className="ads-list">
        {ads.map((a) => {
          const [label, cls] = STATUS[a.status] || ['', 'meta'];
          return (
            <li key={a.id} className="card ads-item">
              <Preview ad={a} />
              <div className="ads-info">
                <b>{a.title}</b>
                <small className="meta">{a.advertiser}{a.sentence ? ` · ${a.sentence}` : ''}</small>
                <small className={cls}>{label}{a.startsAt ? ` · du ${when(a.startsAt, locale)}` : ''}{a.endsAt ? ` · jusqu’au ${when(a.endsAt, locale)}` : ''}</small>
                <small className="meta"><a href={a.linkUrl} target="_blank" rel="noopener noreferrer">{a.ctaLabel}</a> · {a.mediaKind === 'video' ? 'vidéo' : 'photo'}</small>
                <small className="meta">{a.impressions} affichage(s) · {a.clicks} clic(s) ({a.ctr} %) · {a.skips} « passer » — 7 derniers jours : {a.impressions7} affichage(s), {a.clicks7} clic(s)</small>
                <div className="studio-tools">
                  <button type="button" className="btn ghost" onClick={() => { setMsg(null); setForm(a); window.scrollTo?.({ top: 0 }); }}>Modifier</button>
                  <button type="button" className="btn ghost" onClick={() => act(`/admin/ads/${a.id}`, { method: 'PATCH', body: JSON.stringify({ active: !a.active }) })}>{a.active ? 'Mettre en pause' : 'Reprendre'}</button>
                  <button type="button" className="btn ghost" onClick={() => remove(a)}>Supprimer</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
