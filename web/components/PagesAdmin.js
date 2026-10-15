'use client';
// Étape I3 — Administration → Pages : créer des pages et composer chaque page avec des blocs, sans toucher au code.
//
// Deux sortes de pages : les pages créées ici (adresse /p/<nom>) et les « blocs ajoutés avant / après » une page
// existante du site (Tarifs, Bibliothèque…). Comme pour l'apparence : un brouillon enregistré tout seul, un aperçu
// (une vraie page du site, à la largeur de l'appareil choisi), puis « Publier ».
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './Providers';
import { BlockEditor, TextField, LANG_NAMES } from './PageFields';
import { ZONES, ZONE_LABELS, BLOCK_TYPES, TYPE_ORDER, DEVICE_LABELS, AUDIENCES, LANGS, newBlock, newId, blockSummary, MAX_BLOCKS_PER_ZONE } from '../lib/blocks';

const DEVICE_SIZES = [{ id: 390, label: 'Téléphone' }, { id: 768, label: 'Tablette' }, { id: 1024, label: 'Petit écran' }, { id: 1440, label: 'Grand écran' }];
const KNOWN_PATHS = [
  ['/', 'Accueil'], ['/library', 'Ma bibliothèque'], ['/learning', 'Apprentissage'], ['/account', 'Mon compte'], ['/chaines', 'Chaînes'],
  ['/collections', 'Collections'], ['/pricing', 'Tarifs'], ['/series', 'Séries'], ['/books', 'Ouvrages'], ['/login', 'Connexion'], ['/register', 'Inscription'],
  ['/lists', 'Mes listes'], ['/themes', 'Thèmes'], ['/gift', 'Offrir un abonnement'], ['/redeem', 'Activer une carte cadeau'],
  ['/legal/mentions-legales', 'Mentions légales'], ['/legal/cgv', 'Conditions générales de vente'], ['/legal/confidentialite', 'Confidentialité'],
];
const fmtDate = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const readAsDataUrl = (file) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(file); });
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ------------------------------------------------------------------ Bibliothèque d'images */
function MediaPicker({ call, onPick, onClose }) {
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const load = useCallback(async () => { const r = await call('/admin/page-media'); if (r.ok) setList(r.data); else setMsg('Impossible de charger les images.'); }, [call]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const upload = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setMsg('Image trop lourde (3 Mo maximum).'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await call('/admin/page-media', { method: 'POST', body: JSON.stringify({ name: file.name.slice(0, 120), file: await readAsDataUrl(file) }) });
      if (!r.ok) setMsg(r.data?.error || 'Envoi impossible.'); else { await load(); onPick(r.data.id); return; }
    } catch { setMsg('Envoi impossible.'); }
    setBusy(false);
  };
  const remove = async (m) => {
    if (!window.confirm(`Supprimer l’image « ${m.name} » ?`)) return;
    const r = await call(`/admin/page-media/${m.id}`, { method: 'DELETE' });
    setMsg(r.ok ? '' : (r.data?.error || 'Suppression impossible.')); load();
  };
  return (
    <div className="pe-modal" role="dialog" aria-modal="true" aria-label="Choisir une image" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pe-modal-box">
        <div className="pe-modal-head">
          <h2>Images du site</h2>
          <span className="pe-btns">
            <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Envoi…' : 'Envoyer une image'}</button>
            <button type="button" className="btn ghost" onClick={onClose}>Fermer</button>
          </span>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={upload} />
        </div>
        <p className="meta small">PNG, JPEG, WebP ou GIF, 3 Mo maximum.</p>
        {msg && <p className="ap-msg" role="alert">{msg}</p>}
        {!list ? <p className="meta">Chargement…</p> : list.length === 0 ? <p className="meta">Aucune image pour l’instant : envoyez-en une.</p> : (
          <ul className="pe-gallery">
            {list.map((m) => (
              <li key={m.id}>
                <button type="button" className="pe-thumb" onClick={() => onPick(m.id)} aria-label={`Choisir ${m.name}`}><img src={m.url} alt="" loading="lazy" /></button>
                <span className="pe-thumb-name" title={m.name}>{m.name}</span>
                <button type="button" className="link u small" onClick={() => remove(m)}>Supprimer</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Aperçu */
function Preview({ zones, lang, pickedId, onPick }) {
  const frame = useRef(null);
  const box = useRef(null);
  const [device, setDevice] = useState(1440);
  const [boxW, setBoxW] = useState(800);
  const [viewH, setViewH] = useState(900);
  const [ready, setReady] = useState(false);
  const payload = useRef(null);
  payload.current = { type: 'pb-content', zones, locale: lang, pickedId };

  useEffect(() => {
    if (!box.current) return undefined;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(box.current);
    const onResize = () => setViewH(window.innerHeight);
    onResize();
    if (window.innerWidth < 700) setDevice(390);
    window.addEventListener('resize', onResize);
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'pb-ready') setReady(true);
      if (e.data?.type === 'pb-pick') onPick(e.data.id);
    };
    window.addEventListener('message', onMsg);
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize); window.removeEventListener('message', onMsg); };
  }, [onPick]);
  useEffect(() => {
    if (!ready) return undefined;
    const id = setTimeout(() => frame.current?.contentWindow?.postMessage(payload.current, window.location.origin), 120);
    return () => clearTimeout(id);
  }, [ready, zones, lang, pickedId]);

  const scale = Math.min(1, boxW / device);
  const boxH = Math.max(420, Math.min(1100, viewH - 190));
  return (
    <section className="ap-preview" aria-label="Aperçu">
      <div className="ap-preview-bar">
        <div className="ap-seg" role="group" aria-label="Taille d'écran">
          {DEVICE_SIZES.map((d) => <button key={d.id} type="button" className={device === d.id ? 'on' : ''} aria-pressed={device === d.id} onClick={() => setDevice(d.id)}>{d.label}<small>{d.id}</small></button>)}
        </div>
      </div>
      <div className="ap-frame-box" ref={box} style={{ height: boxH }}>
        <iframe ref={frame} title="Aperçu de la page" src="/pb-preview"
          style={{ width: device, height: Math.round(boxH / scale), transform: `scale(${scale})` }} />
      </div>
      <p className="meta small">L’aperçu montre tous les publics (une étiquette indique les blocs limités) ; cliquez sur un bloc pour le modifier.</p>
    </section>
  );
}

/* ------------------------------------------------------------------ Éditeur d'une page */
function Editor({ pageId, onBack, pages }) {
  const { call } = useApp();
  const [page, setPage] = useState(null);
  const [content, setContent] = useState(null);
  const [lang, setLang] = useState('fr');
  const [picked, setPicked] = useState(null);       // bloc ouvert
  const [errors, setErrors] = useState({});         // chemin → message (réponse de l'API)
  const [save, setSave] = useState('');             // '' | pending | saving | saved | error
  const [msg, setMsg] = useState('');
  const [versions, setVersions] = useState(null);
  const [adding, setAdding] = useState(null);       // zone où l'on ajoute un bloc
  const [mediaCb, setMediaCb] = useState(null);     // fonction à appeler avec l'image choisie
  const timer = useRef(null);
  const latest = useRef(null);
  latest.current = content;

  const load = useCallback(async () => {
    const r = await call(`/admin/pages/${pageId}`);
    if (!r.ok) { setMsg(r.data?.error || 'Page introuvable.'); return; }
    setPage(r.data); setContent(clone(r.data.content));
  }, [call, pageId]);
  useEffect(() => { load(); }, [load]);

  // Enregistrement du brouillon (une seconde après la dernière modification).
  const flush = useCallback(async () => {
    clearTimeout(timer.current); timer.current = null;
    if (!latest.current) return true;
    setSave('saving');
    const r = await call(`/admin/pages/${pageId}/draft`, { method: 'PUT', body: JSON.stringify({ content: latest.current }) });
    if (r.ok) { setErrors({}); setPage((p) => ({ ...p, hasDraft: true, updatedAt: r.data.updatedAt })); setSave('saved'); return true; }
    setErrors(r.data?.errors || {}); setSave('error'); setMsg(r.data?.error || 'Enregistrement impossible.');
    return false;
  }, [call, pageId]);
  const change = useCallback((next) => {
    setContent(next); latest.current = next; setSave('pending'); setMsg('');
    clearTimeout(timer.current); timer.current = setTimeout(flush, 1000);
  }, [flush]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const onLeave = (e) => { if (timer.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  // Erreurs de l'API rangées par bloc : { idDuBloc: { champ: message } } + erreurs de la page.
  const byBlock = useMemo(() => {
    const out = {}; const rest = [];
    for (const [path, m] of Object.entries(errors)) {
      const x = path.match(/^zones\.(\w+)\.(\d+)\.(props|show|style)\.(\w+)/) || path.match(/^zones\.(\w+)\.(\d+)\.(type|id)()/);
      const b = x && content?.zones?.[x[1]]?.[Number(x[2])];
      if (b) { (out[b.id] ||= {})[x[4] || x[3]] = m; } else rest.push(`${path ? `${path} : ` : ''}${m}`);
    }
    return { out, rest };
  }, [errors, content]);

  const setZone = (zone, list) => change({ ...content, zones: { ...content.zones, [zone]: list } });
  const setBlock = (zone, i, b) => setZone(zone, content.zones[zone].map((x, j) => (j === i ? b : x)));
  const move = (zone, i, d) => { const l = [...content.zones[zone]]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setZone(zone, l); };
  const dup = (zone, i) => { const l = [...content.zones[zone]]; if (l.length >= MAX_BLOCKS_PER_ZONE) return; const c = clone(l[i]); c.id = newId(); l.splice(i + 1, 0, c); setZone(zone, l); setPicked(c.id); };
  const del = (zone, i) => { if (!window.confirm('Supprimer ce bloc ?')) return; setZone(zone, content.zones[zone].filter((_, j) => j !== i)); setPicked(null); };
  const add = (zone, type) => { const b = newBlock(type); setZone(zone, [...content.zones[zone], b]); setPicked(b.id); setAdding(null); };
  const setMeta = (k, v) => { const meta = { ...(content.meta || {}) }; if (v === undefined) delete meta[k]; else meta[k] = v; change({ ...content, meta }); };

  const publish = async () => {
    if (!(await flush())) return;
    const r = await call(`/admin/pages/${pageId}/publish`, { method: 'POST' });
    if (r.ok) { setPage(r.data); setContent(clone(r.data.content)); setMsg('Page publiée : elle est visible sur le site (au plus tard 10 secondes).'); setSave(''); setErrors({}); }
    else { setErrors(r.data?.errors || {}); setMsg(r.data?.error || 'Publication impossible.'); }
  };
  const discard = async () => {
    if (!window.confirm('Abandonner le brouillon et revenir à la version publiée ?')) return;
    clearTimeout(timer.current); timer.current = null;
    const r = await call(`/admin/pages/${pageId}/draft`, { method: 'DELETE' });
    if (r.ok) { setPage(r.data); setContent(clone(r.data.content)); setSave(''); setErrors({}); setMsg('Brouillon abandonné.'); setPicked(null); }
  };
  const setLive = async (live) => {
    const r = await call(`/admin/pages/${pageId}/live`, { method: 'PUT', body: JSON.stringify({ live }) });
    if (r.ok) { setPage((p) => ({ ...p, live: r.data.live })); setMsg(live ? 'Page remise en ligne.' : 'Page mise hors ligne : les visiteurs ne la voient plus.'); } else setMsg(r.data?.error || 'Échec.');
  };
  const rename = async () => {
    const title = window.prompt('Nom de la page (usage interne)', page.title); if (!title) return;
    let slug;
    if (page.kind === 'custom') { slug = window.prompt('Adresse de la page : /p/…  (lettres minuscules, chiffres, tirets)', page.path.replace('/p/', '')); if (!slug) return; }
    const r = await call(`/admin/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ title, ...(slug ? { slug } : {}) }) });
    if (r.ok) setPage((p) => ({ ...p, title: r.data.title, path: r.data.path })); else setMsg(r.data?.error || 'Échec.');
  };
  const remove = async () => {
    if (!window.confirm(`Supprimer définitivement la page « ${page.title} » et tous ses blocs ?`)) return;
    const r = await call(`/admin/pages/${pageId}`, { method: 'DELETE' });
    if (r.ok) onBack(); else setMsg(r.data?.error || 'Échec.');
  };
  const showVersions = async () => {
    if (versions) { setVersions(null); return; }
    const r = await call(`/admin/pages/${pageId}/versions`); if (r.ok) setVersions(r.data);
  };
  const restore = async (v) => {
    if (!window.confirm('Recopier cette version dans le brouillon ? Le brouillon actuel sera remplacé.')) return;
    clearTimeout(timer.current); timer.current = null;
    const r = await call(`/admin/pages/${pageId}/versions/${v.id}/restore`, { method: 'POST' });
    if (r.ok) { setPage(r.data); setContent(clone(r.data.content)); setVersions(null); setMsg('Version recopiée dans le brouillon : vérifiez puis publiez.'); setPicked(null); }
  };

  if (!page || !content) return <p className="meta" role="status">{msg || 'Chargement de la page…'}</p>;
  const zones = ZONES[page.kind];
  const saveLabel = { pending: 'Modifications en attente…', saving: 'Enregistrement…', saved: 'Brouillon enregistré', error: 'Non enregistré' }[save];
  const urlSuggestions = [...KNOWN_PATHS.map(([p]) => p), ...pages.filter((p) => p.kind === 'custom').map((p) => p.path)];

  return (
    <section className="pe" lang="fr" dir="ltr">
      <datalist id="pe-urls">{urlSuggestions.map((u) => <option key={u} value={u} />)}</datalist>
      <div className="ap-top">
        <div>
          <button type="button" className="link u" onClick={async () => { if (timer.current) await flush(); onBack(); }}>← Toutes les pages</button>
          <h2 className="pe-title">{page.title} <code>{page.path}</code></h2>
        </div>
        <div className="ap-actions">
          <button type="button" className="btn" onClick={publish} disabled={!page.hasDraft && save !== 'pending'}>Publier</button>
          <button type="button" className="btn ghost" onClick={discard} disabled={!page.hasDraft}>Abandonner le brouillon</button>
          <button type="button" className="btn ghost" onClick={showVersions} aria-expanded={Boolean(versions)}>Historique</button>
          <details className="ap-more">
            <summary className="btn ghost">Plus</summary>
            <div className="ap-more-menu">
              <button type="button" onClick={rename}>Renommer{page.kind === 'custom' ? ' / changer l’adresse' : ''}</button>
              {page.publishedAt && <button type="button" onClick={() => setLive(!page.live)}>{page.live ? 'Mettre hors ligne' : 'Remettre en ligne'}</button>}
              {page.live && <a className="pe-menu-link" href={page.path} target="_blank" rel="noopener noreferrer">Voir la page sur le site ↗</a>}
              <button type="button" className="danger" onClick={remove}>Supprimer la page</button>
            </div>
          </details>
        </div>
      </div>
      <p className="ap-status" role="status" aria-live="polite">
        {page.live ? <span className="ap-pill on">En ligne</span> : <span className="ap-pill">{page.publishedAt ? 'Hors ligne' : 'Jamais publiée'}</span>}
        {page.publishedAt && <span>Publiée le {fmtDate(page.publishedAt)}</span>}
        {page.hasDraft && <span>Brouillon en cours</span>}
        {saveLabel && <span className={`ap-save ${save}`}>{saveLabel}</span>}
      </p>
      {msg && <p className="ap-msg" role="alert">{msg}</p>}
      {byBlock.rest.length > 0 && <div className="ap-issues" role="alert"><b>À corriger</b><ul>{byBlock.rest.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}

      {versions && (
        <div className="panel ap-versions">
          <h3 className="panel-title">Historique des publications</h3>
          {versions.length === 0 ? <p className="meta">Aucune publication pour l’instant.</p> : (
            <ul>{versions.map((v, i) => (
              <li key={v.id}><span>{fmtDate(v.createdAt)}{v.by ? ` · ${v.by}` : ''} · {v.blocks} bloc(s){i === 0 ? ' · version en ligne' : ''}</span>
                <button type="button" className="btn ghost ap-mini" onClick={() => restore(v)}>Recopier dans le brouillon</button></li>
            ))}</ul>
          )}
        </div>
      )}

      <div className="ap-layout pe-layout">
        <div className="pe-editor">
          <div className="pe-langbar">
            <span className="pe-lab">Langue des textes à modifier</span>
            <div className="ap-seg" role="group" aria-label="Langue d'édition">
              {LANGS.map((l) => <button key={l} type="button" className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>{LANG_NAMES[l]}</button>)}
            </div>
          </div>

          {page.kind === 'custom' && (
            <details className="pe-meta">
              <summary>Titre et description de la page (affichés sur Google et dans l’onglet du navigateur)</summary>
              <TextField f={{ k: 'title', label: 'Titre de la page', kind: 't', max: 120 }} value={content.meta?.title} lang={lang} onChange={(v) => setMeta('title', v)} error={errors['meta.title']} />
              <TextField f={{ k: 'description', label: 'Description (une ou deux phrases)', kind: 't', max: 300 }} value={content.meta?.description} lang={lang} onChange={(v) => setMeta('description', v)} error={errors['meta.description']} />
            </details>
          )}

          {zones.map((zone) => {
            const list = content.zones[zone] || [];
            return (
              <section key={zone} className="pe-zone" aria-label={ZONE_LABELS[zone]}>
                <h3>{ZONE_LABELS[zone]} <span className="meta small">({list.length})</span></h3>
                {page.kind === 'slot' && zone === 'before' && <p className="meta small">Ces blocs s’affichent tout en haut de la page, avant son contenu habituel.</p>}
                {list.length === 0 && <p className="meta">Aucun bloc : ajoutez-en un ci-dessous.</p>}
                <ol className="pe-blocks">
                  {list.map((b, i) => {
                    const def = BLOCK_TYPES[b.type];
                    const open = picked === b.id;
                    const errs = byBlock.out[b.id];
                    const flags = [
                      ...((b.show?.devices || []).length < 3 ? [(b.show.devices || []).map((d) => DEVICE_LABELS[d]).join(', ')] : []),
                      ...((b.show?.audience || 'all') !== 'all' ? [AUDIENCES.find(([a]) => a === b.show.audience)?.[1]] : []),
                    ];
                    return (
                      <li key={b.id} className={`pe-block${open ? ' open' : ''}${errs ? ' bad' : ''}`} data-block-row={b.id}>
                        <div className="pe-block-head">
                          <button type="button" className="pe-block-main" aria-expanded={open} onClick={() => setPicked(open ? null : b.id)}>
                            <strong>{def.label}</strong>
                            <span className="pe-sum">{blockSummary(b, lang)}</span>
                            {flags.map((f) => <span key={f} className="ap-tag">{f}</span>)}
                          </button>
                          <span className="pe-btns">
                            <button type="button" aria-label={`${def.label} ${i + 1} : monter`} disabled={i === 0} onClick={() => move(zone, i, -1)}>↑</button>
                            <button type="button" aria-label={`${def.label} ${i + 1} : descendre`} disabled={i === list.length - 1} onClick={() => move(zone, i, 1)}>↓</button>
                            <button type="button" aria-label={`${def.label} ${i + 1} : dupliquer`} onClick={() => dup(zone, i)}>⧉</button>
                            <button type="button" aria-label={`${def.label} ${i + 1} : supprimer`} onClick={() => del(zone, i)}>✕</button>
                          </span>
                        </div>
                        {errs && !open && <p className="pe-err" role="alert">{Object.values(errs).join(' · ')}</p>}
                        {open && <BlockEditor block={b} lang={lang} errors={errs} onChange={(nb) => setBlock(zone, i, nb)} onPickMedia={(cb) => setMediaCb(() => cb)} />}
                      </li>
                    );
                  })}
                </ol>
                {adding === zone ? (
                  <div className="pe-types" role="group" aria-label="Choisir un type de bloc">
                    {TYPE_ORDER.map((t) => <button key={t} type="button" onClick={() => add(zone, t)}><strong>{BLOCK_TYPES[t].label}</strong><span>{BLOCK_TYPES[t].hint}</span></button>)}
                    <button type="button" className="link u" onClick={() => setAdding(null)}>Annuler</button>
                  </div>
                ) : (
                  <button type="button" className="btn ghost" disabled={list.length >= MAX_BLOCKS_PER_ZONE} onClick={() => setAdding(zone)}>+ Ajouter un bloc</button>
                )}
              </section>
            );
          })}
        </div>
        <Preview zones={content.zones} lang={lang} pickedId={picked} onPick={(id) => { setPicked(id); setTimeout(() => document.querySelector(`[data-block-row="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50); }} />
      </div>
      {mediaCb && <MediaPicker call={call} onClose={() => setMediaCb(null)} onPick={(id) => { mediaCb(id); setMediaCb(null); }} />}
    </section>
  );
}

/* ------------------------------------------------------------------ Liste des pages */
export default function PagesAdmin() {
  const { call } = useApp();
  const [pages, setPages] = useState(null);
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slotPath, setSlotPath] = useState('/pricing');
  const [slotOther, setSlotOther] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await call('/admin/pages');
    if (r.ok) setPages(r.data); else setMsg(r.data?.error || 'Impossible de charger les pages.');
  }, [call]);
  useEffect(() => { load(); }, [load]);

  const create = async (body) => {
    setMsg('');
    const r = await call('/admin/pages', { method: 'POST', body: JSON.stringify(body) });
    if (r.ok) { setTitle(''); setSlug(''); setEditing(r.data.id); load(); } else setMsg(r.data?.error || 'Création impossible.');
  };

  if (!pages) return <p className="meta" role="status">{msg || 'Chargement…'}</p>;
  if (editing) return <Editor pageId={editing} pages={pages} onBack={() => { setEditing(null); load(); }} />;

  const custom = pages.filter((p) => p.kind === 'custom');
  const slots = pages.filter((p) => p.kind === 'slot');
  const free = KNOWN_PATHS.filter(([p]) => !slots.some((s) => s.path === p));
  const status = (p) => (p.live ? <span className="ap-pill on">En ligne</span> : <span className="ap-pill">{p.publishedAt ? 'Hors ligne' : 'Jamais publiée'}</span>);

  return (
    <section className="pe-list-view" lang="fr" dir="ltr">
      <p className="meta">Créez de nouvelles pages et composez-les avec des blocs (bannière, titre, texte, image, cartes, conférences, questions…), ou ajoutez des blocs avant ou après une page existante du site. Chaque bloc peut être réservé à un appareil ou à un public, et avoir ses propres couleurs.</p>
      {msg && <p className="ap-msg" role="alert">{msg}</p>}

      <div className="panel">
        <h2 className="panel-title">Nouvelle page</h2>
        <form className="pe-new" onSubmit={(e) => { e.preventDefault(); create({ kind: 'custom', title, ...(slug ? { slug } : {}) }); }}>
          <label>Titre de la page<input type="text" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Ramadan 2027" /></label>
          <label>Adresse (facultatif)<span className="pe-slug"><span aria-hidden="true">/p/</span><input type="text" value={slug} maxLength={60} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="ramadan-2027" pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Lettres minuscules, chiffres et tirets" /></span></label>
          <button type="submit" className="btn">Créer et modifier</button>
        </form>
      </div>

      <div className="panel">
        <h2 className="panel-title">Pages créées ({custom.length})</h2>
        {custom.length === 0 ? <p className="meta">Aucune page pour l’instant.</p> : (
          <ul className="pe-pages">
            {custom.map((p) => (
              <li key={p.id}>
                <div><strong>{p.title}</strong> <code>{p.path}</code><br />{status(p)} {p.hasDraft && <span className="ap-tag">brouillon en cours</span>} <span className="meta small">modifiée le {fmtDate(p.updatedAt)}</span></div>
                <span className="pe-btns">
                  {p.live && <a className="btn ghost pe-mini" href={p.path} target="_blank" rel="noopener noreferrer">Voir ↗</a>}
                  <button type="button" className="btn pe-mini" onClick={() => setEditing(p.id)}>Modifier</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h2 className="panel-title">Blocs sur les pages existantes ({slots.length})</h2>
        <p className="meta small">Ajoutez des blocs avant ou après le contenu d’une page du site (Accueil, Tarifs, Bibliothèque…). Le contenu habituel de la page reste en place. Les pages d’administration, le Studio et l’espace Kids ne peuvent pas être modifiés.</p>
        <form className="pe-new" onSubmit={(e) => { e.preventDefault(); const sp = slotPath === '*' || free.some(([p]) => p === slotPath) ? slotPath : (free[0]?.[0] ?? '*'); create({ kind: 'slot', path: sp === '*' ? slotOther.trim() : sp, title: KNOWN_PATHS.find(([p]) => p === sp)?.[1] }); }}>
          <label>Page<select value={slotPath === '*' || free.some(([p]) => p === slotPath) ? slotPath : (free[0]?.[0] ?? '*')} onChange={(e) => setSlotPath(e.target.value)}>
            {free.map(([p, l]) => <option key={p} value={p}>{l} ({p})</option>)}
            <option value="*">Autre adresse…</option>
          </select></label>
          {(slotPath === '*' || free.length === 0) && <label>Adresse exacte<input type="text" required value={slotOther} onChange={(e) => setSlotOther(e.target.value)} placeholder="/series/ma-serie" maxLength={100} /></label>}
          <button type="submit" className="btn">Ajouter des blocs</button>
        </form>
        {slots.length > 0 && (
          <ul className="pe-pages">
            {slots.map((p) => (
              <li key={p.id}>
                <div><strong>{p.title}</strong> <code>{p.path}</code><br />{status(p)} {p.hasDraft && <span className="ap-tag">brouillon en cours</span>} <span className="meta small">modifiée le {fmtDate(p.updatedAt)}</span></div>
                <span className="pe-btns">
                  {p.live && <a className="btn ghost pe-mini" href={p.path} target="_blank" rel="noopener noreferrer">Voir ↗</a>}
                  <button type="button" className="btn pe-mini" onClick={() => setEditing(p.id)}>Modifier</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
