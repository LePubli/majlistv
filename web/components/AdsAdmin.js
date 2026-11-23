'use client';
// Admin → Publicités (étape 24c) : publicités plein écran montrées au lancement de l'application (photo ou courte vidéo).
// Plusieurs publicités peuvent être actives : l'application les fait tourner (une différente à chaque lancement) ;
// chacune peut avoir une date et une heure de début et de fin. Les réglages (abonnés payants, nombre à la suite, durées) sont dans
// Admin → Paramètres → « Publicité au lancement », l'interrupteur général dans Admin → Fonctions.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';
import { Page, Metrics, Panel, Cols, Table, Tabs, Line, Switch, Btn, Badge, Meta, c } from './backoffice/Kit';

const EMPTY = { advertiser: '', title: '', sentence: '', ctaLabel: 'En savoir plus', linkUrl: '', active: true, startsAt: '', endsAt: '', languages: [] };
const LANGS = [['fr', 'Français'], ['en', 'Anglais'], ['ar', 'Arabe']];
const langNames = (l) => (l && l.length ? l.map((x) => (LANGS.find((y) => y[0] === x) || [x, x])[1]).join(', ') : 'toutes les langues');
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
    ? <video className="camp-thumb" src={ad.mediaUrl} muted playsInline preload="metadata" controls />
    // eslint-disable-next-line @next/next/no-img-element
    : <img className="camp-thumb" src={ad.mediaUrl} alt="" loading="lazy" />;
}

function AdForm({ ad, limits, onDone, onCancel }) {
  const { call } = useApp();
  const [o, setO] = useState(ad ? { advertiser: ad.advertiser, title: ad.title, sentence: ad.sentence, ctaLabel: ad.ctaLabel, linkUrl: ad.linkUrl, active: ad.active, startsAt: toLocal(ad.startsAt), endsAt: toLocal(ad.endsAt), languages: ad.languages || [] } : EMPTY);
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
        const u = await call('/admin/campaigns/upload-url', { method: 'POST', body: JSON.stringify({ contentType: type, size: file.size }) });
        if (!u.ok) throw new Error(u.data?.error || "Le serveur n'a pas donné de lien d'envoi.");
        setPct(0);
        const put = await putFile(u.data.url, file, type, setPct);
        if (!put.ok) throw new Error(putError(put.status));
        key = u.data.key;
      }
      setPct(null);
      const body = { advertiser: o.advertiser, title: o.title, sentence: o.sentence, ctaLabel: o.ctaLabel || 'En savoir plus', linkUrl: o.linkUrl, active: o.active, startsAt: toIso(o.startsAt), endsAt: toIso(o.endsAt), languages: o.languages, ...(key ? { mediaKey: key } : {}) };
      const r = ad ? await call(`/admin/campaigns/${ad.id}`, { method: 'PATCH', body: JSON.stringify(body) }) : await call('/admin/campaigns', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok) throw new Error(r.data?.error || 'Enregistrement impossible.');
      onDone();
    } catch (ex) {
      setErr(ex instanceof TypeError ? "La requête n'a pas abouti (réseau coupé, ou extension du navigateur qui bloque la page : essayez en navigation privée ou sans bloqueur de publicités)." : ex?.message || 'Une erreur est survenue : réessayez.');
    } finally { setBusy(false); setPct(null); }
  };

  return (
    <form className="form camp-form card" onSubmit={submit}>
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
      <fieldset className="check-group">
        <legend>Langues de l’application visées</legend>
        {LANGS.map(([k, name]) => (
          <label key={k} className="check"><input type="checkbox" checked={o.languages.includes(k)} onChange={(e) => setO((x) => ({ ...x, languages: e.target.checked ? [...x.languages, k] : x.languages.filter((y) => y !== k) }))} /> {name}</label>
        ))}
        <small className="meta">Aucune case cochée = montrée dans toutes les langues. Une application ancienne, qui n’envoie pas sa langue, voit toutes les publicités.</small>
      </fieldset>
      <small className="meta">Sans date : la publicité est montrée dès l’enregistrement et jusqu’à ce que vous la mettiez en pause. Les heures sont celles de cet ordinateur.</small>
      <label className="check"><input type="checkbox" role="switch" checked={o.active} onChange={set('active')} /> Active</label>
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
  const { call, locale, skin } = useApp();
  const [selId, setSelId] = useState(null);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null); // null | 'new' | annonce en modification
  const [msg, setMsg] = useState(null);
  const [tab, setTab] = useState('crea'); // Premium : crea | target | report
  const load = useCallback(() => call('/admin/campaigns').then((r) => setData(r.ok ? r.data : { error: r.data?.error || 'Chargement impossible.' })), [call]);
  useEffect(() => { load(); }, [load]);
  const flash = (ok, text) => setMsg({ ok, text });
  const act = async (path, opts, okText) => {
    const r = await call(path, opts);
    if (r.ok) { if (okText) flash(true, okText); load(); } else flash(false, r.data?.error || 'Action impossible.');
  };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const reportUrl = (a) => `${origin}/rapport-annonceur/${a.reportToken}`;
  const makeLink = async (a) => {
    if (a.reportToken && !window.confirm('Renouveler le lien ? L’ancien lien cessera de fonctionner (l’annonceur devra recevoir le nouveau).')) return;
    await act(`/admin/campaigns/${a.id}/report-link`, { method: 'POST' }, a.reportToken ? 'Nouveau lien de suivi créé.' : 'Lien de suivi créé : copiez-le pour l’annonceur.');
  };
  const copyLink = async (a) => {
    try { await navigator.clipboard.writeText(reportUrl(a)); flash(true, 'Lien copié.'); } catch { flash(false, 'Copie impossible : sélectionnez le lien et copiez-le à la main.'); }
  };
  const remove = (a) => { if (window.confirm(`Supprimer la publicité « ${a.title} » (${a.advertiser}) ? Son visuel et ses compteurs seront effacés.`)) act(`/admin/campaigns/${a.id}`, { method: 'DELETE' }, 'Publicité supprimée.'); };

  if (!data) return <p className="meta">Chargement…</p>;
  if (data.error) return <p className="error">{data.error}</p>;
  const ads = data.ads;
  if (skin === 'premium') {
    const sum = (k) => ads.reduce((n, a) => n + (a[k] || 0), 0);
    const imp = sum('impressions'); const clk = sum('clicks');
    const sel = ads.find((a) => a.id === selId) || ads[0] || null;
    const tone = { live: 'green', scheduled: 'blue', paused: 'amber', ended: 'gray' };
    return (
      <Page title="Publicités & partenariats" sub="Publicités plein écran du lancement de l’application : campagnes, visuels, langues et chiffres."
        actions={!form ? <Btn disabled={!data.storage} onClick={() => { setMsg(null); setForm('new'); }}>Nouvelle campagne</Btn> : null}>
        <Metrics items={[
          { icon: 'eye', label: 'Affichages', value: imp.toLocaleString('fr-FR') },
          { icon: 'target', tone: 'green', label: 'Clics', value: clk.toLocaleString('fr-FR'), note: imp ? `CTR ${(Math.round((clk / imp) * 1000) / 10).toLocaleString('fr-FR')} %` : '' },
          { icon: 'megaphone', label: 'En cours', value: ads.filter((a) => a.status === 'live').length },
          { icon: 'clock', tone: 'amber', label: 'Programmées', value: ads.filter((a) => a.status === 'scheduled').length },
        ]} />
        {!data.storage && <p className="error">Le stockage vidéo n’est pas configuré : l’envoi des visuels est impossible.</p>}
        {msg && <p className={msg.ok ? 'meta ok' : 'error'} role="status">{msg.text}</p>}
        <Tabs value={tab} onChange={(t) => { setTab(t); setForm(null); }} names={[['crea', 'Créations'], ['target', 'Ciblage'], ['report', 'Rapports']]} />
        {tab === 'target' && (
          <Panel title="Ciblage des campagnes" extra={`${ads.length}`}>
            <Table headers={['Campagne', 'Français', 'Anglais', 'Arabe', 'Période', 'État']} empty="Aucune publicité pour l’instant."
              rows={ads.map((a) => {
                const all = !a.languages || !a.languages.length;
                const toggle = (k) => {
                  const cur = all ? LANGS.map((l) => l[0]) : a.languages;
                  const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
                  if (!next.length) { flash(false, 'Gardez au moins une langue : pour tout montrer, cochez-les toutes.'); return; }
                  act(`/admin/campaigns/${a.id}`, { method: 'PATCH', body: JSON.stringify({ languages: next.length === LANGS.length ? [] : next }) });
                };
                return [<span key="t"><b>{a.title}</b><br /><small>{a.advertiser} — {langNames(a.languages)}</small></span>,
                  ...LANGS.map(([k, n]) => <Switch key={k} on={all || a.languages.includes(k)} label={`${a.title} : ${n}`} onChange={() => toggle(k)} />),
                  a.startsAt || a.endsAt ? `${a.startsAt ? `du ${when(a.startsAt, locale)}` : ''}${a.endsAt ? ` jusqu’au ${when(a.endsAt, locale)}` : ''}` : 'Sans date',
                  <Badge key="s" tone={tone[a.status] || 'gray'}>{(STATUS[a.status] || [''])[0]}</Badge>];
              })} />
            <p className="meta" style={{ padding: '0 14px 14px' }}>Le ciblage porte sur la langue de l’application (toutes les langues cochées ou aucune = montrée à tous ; une application ancienne qui n’envoie pas sa langue voit tout) et sur la période (modifiable depuis « Créations »). Règles fixes : jamais dans l’espace Kids, jamais pendant l’heure de prière, montrée ou non aux abonnés payants selon le réglage « Publicité au lancement » (Admin → Paramètres). Le site n’a pas d’autre critère (pays, âge, appareil) : il n’est pas mesuré.</p>
          </Panel>
        )}
        {tab === 'report' && (() => {
          const L = (k) => ads.reduce((n, a) => n + (a.byLang?.[k]?.impressions || 0), 0);
          const langs = [['fr', 'Français'], ['en', 'Anglais'], ['ar', 'Arabe'], ['none', 'Sans langue (anciennes versions)']];
          const tot = langs.reduce((n, [k]) => n + L(k), 0);
          const daily = data.daily || [];
          return (
            <>
              <Cols kind="two-main">
                <Panel title="Affichages des 30 derniers jours" extra={`${daily.reduce((n, d) => n + d.impressions, 0).toLocaleString('fr-FR')} affichages · ${daily.reduce((n, d) => n + d.clicks, 0).toLocaleString('fr-FR')} clics`}>
                  {daily.some((d) => d.impressions) ? <Line values={daily.map((d) => d.impressions)} labels={daily.map((d) => d.day.slice(5).split('-').reverse().join('/'))} /> : <p style={{ padding: 14, color: 'var(--muted)' }}>Aucun affichage sur les 30 derniers jours.</p>}
                </Panel>
                <Panel title="Par langue de l’application">
                  <div style={{ padding: '0 14px 14px' }}>
                    {tot ? <Meta items={langs.map(([k, n]) => [n, `${L(k).toLocaleString('fr-FR')} affichage(s) — ${Math.round((L(k) / tot) * 100)} %`])} /> : <p style={{ color: 'var(--muted)' }}>Pas encore de chiffres par langue.</p>}
                  </div>
                </Panel>
              </Cols>
              <Panel title="Résultats par campagne" extra={`${ads.length}`}>
                <Table headers={['Campagne', 'Affichages', 'Clics', 'CTR', '« Passer »', '7 jours', 'Rapport annonceur']} empty="Aucune publicité pour l’instant."
                  rows={ads.map((a) => [<span key="t"><b>{a.title}</b><br /><small>{a.advertiser}</small></span>, a.impressions, a.clicks, `${a.ctr} %`, a.skips, `${a.impressions7} aff. / ${a.clicks7} clic(s)`,
                    <span key="r" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {a.reportToken ? <><a href={reportUrl(a)} target="_blank" rel="noopener noreferrer">Ouvrir</a><Btn primary={false} onClick={() => copyLink(a)}>Copier</Btn><Btn primary={false} onClick={() => makeLink(a)}>Renouveler</Btn><Btn primary={false} onClick={() => act(`/admin/campaigns/${a.id}/report-link`, { method: 'DELETE' }, 'Lien de suivi désactivé.')}>Désactiver</Btn></> : <Btn primary={false} onClick={() => makeLink(a)}>Créer le lien</Btn>}
                    </span>])} />
                <p className="meta" style={{ padding: '0 14px 14px' }}>Le lien de suivi est secret et sans compte : il donne à l’annonceur sa page de résultats et un PDF. Les chiffres comptent les affichages, clics et « Passer » enregistrés par l’application ; ni durée de visionnage ni conversion ne sont mesurées.</p>
              </Panel>
            </>
          );
        })()}
        {tab === 'crea' && (
        <Cols kind="two-main">
          <Panel title="Campagnes" extra={`${ads.length}`}>
            <Table headers={['Campagne', 'Langues', 'État', 'Affichages', 'Clics']} onRow={(i) => { setForm(null); setSelId(ads[i].id); }}
              empty="Aucune publicité pour l’instant."
              rows={ads.map((a) => [<span key="t"><b>{a.title}</b><br /><small>{a.advertiser}</small></span>, langNames(a.languages), <Badge key="s" tone={tone[a.status] || 'gray'}>{(STATUS[a.status] || [''])[0]}</Badge>, a.impressions, `${a.clicks} (${a.ctr} %)`])} />
            <p className="meta" style={{ padding: '0 14px 14px' }}>Jamais dans l’espace Kids, jamais pendant l’heure de prière. Réglages : Admin → Paramètres → « Publicité au lancement ».</p>
          </Panel>
          {form ? (
            <Panel title={form === 'new' ? 'Nouvelle publicité' : 'Modifier la publicité'}>
              <div className="bm-form" style={{ padding: '0 14px 14px' }}>
                <AdForm ad={form === 'new' ? null : form} limits={data.limits} onCancel={() => setForm(null)} onDone={() => { setForm(null); flash(true, 'Publicité enregistrée.'); load(); }} />
              </div>
            </Panel>
          ) : sel ? (
            <Panel title="Aperçu créatif">
              <div className={c('ax-ad-preview')}>
                {sel.mediaUrl && (sel.mediaKind === 'video' ? <video src={sel.mediaUrl} muted playsInline preload="metadata" /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={sel.mediaUrl} alt="" loading="lazy" />)}
                <div><span>{sel.advertiser}</span><h2>{sel.title}</h2><Btn href={sel.linkUrl} target="_blank" rel="noopener noreferrer">{sel.ctaLabel}</Btn></div>
              </div>
              <div style={{ padding: '0 14px 14px' }}>
                <Meta items={[
                  ['Visuel', sel.mediaKind === 'video' ? 'Vidéo' : 'Photo'],
                  ['Période', sel.startsAt || sel.endsAt ? `${sel.startsAt ? `du ${when(sel.startsAt, locale)}` : ''}${sel.endsAt ? ` jusqu’au ${when(sel.endsAt, locale)}` : ''}` : 'Sans date'],
                  ['7 derniers jours', `${sel.impressions7} affichage(s), ${sel.clicks7} clic(s)`],
                  ['« Passer »', sel.skips],
                  ['Rapport annonceur', sel.reportToken ? <a key="r" href={reportUrl(sel)} target="_blank" rel="noopener noreferrer">Ouvrir le lien</a> : 'Aucun lien'],
                ]} />
                {sel.byLang && <p className="meta small">Par langue — {[['fr', 'FR'], ['en', 'EN'], ['ar', 'AR'], ['none', 'sans langue']].map(([k, n]) => `${n} : ${sel.byLang[k].impressions} aff. / ${sel.byLang[k].clicks} clic(s)`).join(' · ')}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Btn onClick={() => { setMsg(null); setForm(sel); }}>Modifier</Btn>
                  <Btn primary={false} onClick={() => act(`/admin/campaigns/${sel.id}`, { method: 'PATCH', body: JSON.stringify({ active: !sel.active }) })}>{sel.active ? 'Mettre en pause' : 'Reprendre'}</Btn>
                  <Btn primary={false} onClick={() => makeLink(sel)}>{sel.reportToken ? 'Renouveler le lien' : 'Créer le lien de suivi'}</Btn>
                  {sel.reportToken && <Btn primary={false} onClick={() => copyLink(sel)}>Copier le lien</Btn>}
                  {sel.reportToken && <Btn primary={false} onClick={() => act(`/admin/campaigns/${sel.id}/report-link`, { method: 'DELETE' }, 'Lien de suivi désactivé.')}>Désactiver le lien</Btn>}
                  <Btn primary={false} onClick={() => remove(sel)}>Supprimer</Btn>
                </div>
              </div>
            </Panel>
          ) : <Panel title="Aperçu créatif"><p style={{ padding: 14, color: 'var(--muted)' }}>Créez une première campagne.</p></Panel>}
        </Cols>
        )}
      </Page>
    );
  }
  return (
    <section className="camp-admin">
      <p className="meta">Publicités plein écran, passables, montrées au lancement de l’application (jamais dans l’espace Kids, jamais pendant l’heure de prière). S’il y en a plusieurs en cours, elles tournent : une différente à chaque lancement. Réglages (abonnés payants, nombre à la suite, durées) : Admin → Paramètres → « Publicité au lancement ».</p>
      {!data.storage && <p className="error">Le stockage vidéo n’est pas configuré : l’envoi des visuels est impossible.</p>}
      {form ? (
        <AdForm ad={form === 'new' ? null : form} limits={data.limits} onCancel={() => setForm(null)} onDone={() => { setForm(null); flash(true, 'Publicité enregistrée.'); load(); }} />
      ) : (
        <button type="button" className="btn" onClick={() => { setMsg(null); setForm('new'); }} disabled={!data.storage}>Nouvelle publicité</button>
      )}
      {msg && <p className={msg.ok ? 'meta ok' : 'error'} role="status">{msg.text}</p>}
      {ads.length === 0 && !form && <p className="meta">Aucune publicité pour l’instant.</p>}
      <ul className="camp-list">
        {ads.map((a) => {
          const [label, cls] = STATUS[a.status] || ['', 'meta'];
          return (
            <li key={a.id} className="card camp-item">
              <Preview ad={a} />
              <div className="camp-info">
                <b>{a.title}</b>
                <small className="meta">{a.advertiser}{a.sentence ? ` · ${a.sentence}` : ''}</small>
                <small className={cls}>{label}{a.startsAt ? ` · du ${when(a.startsAt, locale)}` : ''}{a.endsAt ? ` · jusqu’au ${when(a.endsAt, locale)}` : ''}</small>
                <small className="meta"><a href={a.linkUrl} target="_blank" rel="noopener noreferrer">{a.ctaLabel}</a> · {a.mediaKind === 'video' ? 'vidéo' : 'photo'}</small>
                <small className="meta">{a.impressions} affichage(s) · {a.clicks} clic(s) ({a.ctr} %) · {a.skips} « passer » — 7 derniers jours : {a.impressions7} affichage(s), {a.clicks7} clic(s)</small>
                <small className="meta">Langues visées : {langNames(a.languages)}</small>
                {a.byLang ? <small className="meta">Par langue — {[['fr', 'FR'], ['en', 'EN'], ['ar', 'AR'], ['none', 'sans langue']].map(([k, n]) => `${n} : ${a.byLang[k].impressions} aff. / ${a.byLang[k].clicks} clic(s)`).join(' · ')}</small> : null}
                <small className="meta adr-link">Rapport annonceur : {a.reportToken ? <a href={reportUrl(a)} target="_blank" rel="noopener noreferrer">{reportUrl(a)}</a> : 'aucun lien (désactivé)'}</small>
                <div className="studio-tools">
                  <button type="button" className="btn ghost" onClick={() => makeLink(a)}>{a.reportToken ? 'Renouveler le lien de suivi' : 'Créer le lien de suivi'}</button>
                  {a.reportToken && <button type="button" className="btn ghost" onClick={() => copyLink(a)}>Copier le lien</button>}
                  {a.reportToken && <button type="button" className="btn ghost" onClick={() => act(`/admin/campaigns/${a.id}/report-link`, { method: 'DELETE' }, 'Lien de suivi désactivé.')}>Désactiver le lien</button>}
                  <button type="button" className="btn ghost" onClick={() => { setMsg(null); setForm(a); window.scrollTo?.({ top: 0 }); }}>Modifier</button>
                  <button type="button" className="btn ghost" onClick={() => act(`/admin/campaigns/${a.id}`, { method: 'PATCH', body: JSON.stringify({ active: !a.active }) })}>{a.active ? 'Mettre en pause' : 'Reprendre'}</button>
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
