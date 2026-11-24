'use client';
// Éditeur visuel du site (étape 2) — un écran plein écran pour composer les pages sans toucher au code.
//
//   Barre du haut : page, annuler / rétablir, taille d'écran, langue, panneaux, état, Historique, Publier.
//   Gauche        : « Blocs » (à glisser sur la page), « Plan » (liste ordonnée, à réordonner), « Pages », « Style » (thème).
//   Centre        : la vraie page du site, à la largeur de l'appareil choisi (cadre /pb-preview). On clique un bloc pour le choisir,
//                   on le déplace avec sa poignée, on dépose un nouveau bloc où l'on veut.
//   Droite        : réglages du bloc choisi (contenu, affichage, style) ou de la page.
//
// Enregistrement : un brouillon, une seconde après la dernière modification (comme Admin → Pages) ; rien n'est visible des visiteurs
// avant « Publier ». Annuler / rétablir : jusqu'à 100 étapes (Ctrl+Z, Ctrl+Maj+Z). Les opérations sur les blocs sont dans lib/editorOps.js.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../Providers';
import { BlockEditor, TextField, MediaField, LANG_NAMES } from '../PageFields';
import NavEditor from '../NavAdmin';
import { MediaPicker, SeoCheck } from '../PagesAdmin';
import { ThemePanel } from '../AppearanceAdmin';
import { ZONES, ZONE_LABELS, BLOCK_TYPES, TYPE_ORDER, DATA_TYPES, DEVICE_LABELS, AUDIENCES, LANGS, newBlock, newId, blockSummary, MAX_BLOCKS_PER_ZONE } from '../../lib/blocks';
import { TEMPLATES } from '../../lib/blockTemplates';
import { clone, isColZone, getList, setList, findBlock, insertBlock, removeBlock, moveBlock, nudgeBlock, duplicateBlock, dropTarget, newHistory, pushHistory, undoHistory, redoHistory } from '../../lib/editorOps';

const DEVICES = [{ id: 390, label: 'Téléphone', glyph: '▯' }, { id: 768, label: 'Tablette', glyph: '▭' }, { id: 1024, label: 'Petit écran', glyph: '▬' }, { id: 1440, label: 'Ordinateur', glyph: '▬▬' }];
const KNOWN_PATHS = [
  ['/', 'Accueil'], ['/library', 'Ma bibliothèque'], ['/learning', 'Apprentissage'], ['/account', 'Mon compte'], ['/chaines', 'Chaînes'],
  ['/collections', 'Collections'], ['/pricing', 'Tarifs'], ['/series', 'Séries'], ['/books', 'Ouvrages'], ['/login', 'Connexion'], ['/register', 'Inscription'],
  ['/lists', 'Mes listes'], ['/themes', 'Thèmes'], ['/gift', 'Offrir un abonnement'], ['/redeem', 'Activer une carte cadeau'],
  ['/legal/mentions-legales', 'Mentions légales'], ['/legal/cgv', 'Conditions générales de vente'], ['/legal/confidentialite', 'Confidentialité'],
];
const GLYPH = { hero: '▣', heading: 'H', text: '¶', image: '▨', button: '▭', cards: '▦', talks: '▶', quote: '❝', faq: '?', video: '▷', featured: '★', mine: '◔', channels: '☰', shorts: '▮', collections: '❖', dayquote: '❞', series: '☷', catrows: '≣', kids: '☺', columns: '▥', spacer: '↕', divider: '―' };
const fmtDate = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const typing = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

/* ------------------------------------------------------------------ Page choisie : chargement, brouillon, historique */
function usePageDoc(pageId, call) {
  const [page, setPage] = useState(null);
  const [content, setContentState] = useState(null);
  const [errors, setErrors] = useState({});
  const [save, setSave] = useState('');           // '' | pending | saving | saved | error
  const [msg, setMsg] = useState('');
  const [rev, setRev] = useState({ past: 0, future: 0 });
  const timer = useRef(null);
  const latest = useRef(null);
  const hist = useRef(newHistory());

  useEffect(() => {
    let dead = false;
    setPage(null); setContentState(null); latest.current = null; hist.current = newHistory(); setRev({ past: 0, future: 0 }); setErrors({}); setSave(''); setMsg('');
    if (!pageId) return undefined;
    call(`/admin/pages/${pageId}`).then((r) => {
      if (dead) return;
      if (!r.ok) { setMsg(r.data?.error || 'Page introuvable.'); return; }
      setPage(r.data); latest.current = clone(r.data.content); setContentState(latest.current);
    });
    return () => { dead = true; clearTimeout(timer.current); };
  }, [call, pageId]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current); timer.current = null;
    if (!latest.current || !pageId) return true;
    setSave('saving');
    const r = await call(`/admin/pages/${pageId}/draft`, { method: 'PUT', body: JSON.stringify({ content: latest.current }) });
    if (r.ok) { setErrors({}); setPage((p) => (p ? { ...p, hasDraft: true, updatedAt: r.data.updatedAt } : p)); setSave('saved'); return true; }
    setErrors(r.data?.errors || {}); setSave('error'); setMsg(r.data?.error || 'Enregistrement impossible.');
    return false;
  }, [call, pageId]);

  // Applique un nouveau contenu : historique, brouillon à enregistrer. key = champ en cours de frappe (modifications fusionnées).
  const commit = useCallback((next, key = null) => {
    if (!next || next === latest.current) return;
    hist.current = pushHistory(hist.current, latest.current, key);
    latest.current = next; setContentState(next);
    setRev({ past: hist.current.past.length, future: 0 });
    setSave('pending'); setMsg('');
    clearTimeout(timer.current); timer.current = setTimeout(flush, 1000);
  }, [flush]);
  const applyHistory = useCallback((res) => {
    if (!res) return;
    hist.current = res.history; latest.current = res.state; setContentState(res.state);
    setRev({ past: res.history.past.length, future: res.history.future.length });
    setSave('pending'); clearTimeout(timer.current); timer.current = setTimeout(flush, 1000);
  }, [flush]);
  const undo = useCallback(() => applyHistory(undoHistory(hist.current, latest.current)), [applyHistory]);
  const redo = useCallback(() => applyHistory(redoHistory(hist.current, latest.current)), [applyHistory]);
  // Remplace tout le contenu sans passer par l'historique (publication, restauration, abandon du brouillon).
  const reset = useCallback((p) => {
    clearTimeout(timer.current); timer.current = null;
    setPage(p); latest.current = clone(p.content); setContentState(latest.current);
    hist.current = newHistory(); setRev({ past: 0, future: 0 }); setErrors({}); setSave('');
  }, []);

  useEffect(() => {
    const onLeave = (e) => { if (timer.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  return { page, setPage, content, commit, undo, redo, reset, flush, errors, setErrors, save, msg, setMsg, canUndo: rev.past > 0, canRedo: rev.future > 0 };
}

/* ------------------------------------------------------------------ Panneau « Blocs » */
function Palette({ onAdd, onDragStart, onDragEnd, disabled }) {
  const own = TYPE_ORDER.filter((t) => !DATA_TYPES.includes(t));
  const data = TYPE_ORDER.filter((t) => DATA_TYPES.includes(t));
  const item = (t) => (
    <li key={t}>
      <button type="button" className="ed-pal-item" draggable={!disabled} disabled={disabled}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', `block:${t}`); e.dataTransfer.effectAllowed = 'copy'; onDragStart({ kind: 'new', type: t }); }}
        onDragEnd={onDragEnd} onClick={() => onAdd(t)} title={BLOCK_TYPES[t].hint}>
        <span className="ed-pal-glyph" aria-hidden="true">{GLYPH[t] || '▫'}</span>
        <span>{BLOCK_TYPES[t].label}</span>
      </button>
    </li>
  );
  return (
    <div className="ed-pal">
      <p className="meta small">Glissez un bloc sur la page, ou cliquez pour l’ajouter après le bloc choisi.</p>
      <h3>Contenu écrit par vous</h3>
      <ul className="ed-pal-grid">{own.map(item)}</ul>
      <h3>Données du site <span className="meta small">(se mettent à jour seules)</span></h3>
      <ul className="ed-pal-grid">{data.map(item)}</ul>
    </div>
  );
}

/* ------------------------------------------------------------------ Panneau « Plan » : blocs par zone, à réordonner */
function Layers({ content, zones, selected, onSelect, lang, drag, onDragStart, onDragEnd, onDrop, onNudge, onDup, onDel, errorsByBlock }) {
  const [over, setOver] = useState(null); // { zone, index }
  const hover = (e, zone, i0) => {
    if (!drag.current) return;
    if (isColZone(zone) && (drag.current.kind === 'new' ? drag.current.type === 'columns' : findBlock(content, drag.current.id)?.block.type === 'columns')) return;
    e.preventDefault(); e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setOver({ zone, index: e.clientY > r.top + r.height / 2 ? i0 + 1 : i0 });
  };
  const renderList = (zone) => {
    const list = getList(content, zone);
    return (
      <ol>
        {list.map((b, i) => {
          const def = BLOCK_TYPES[b.type];
          const bad = errorsByBlock[b.id];
          return (
            <li key={b.id} className={`ed-layer${selected === b.id ? ' on' : ''}${bad ? ' bad' : ''}${over?.zone === zone && over.index === i ? ' drop-before' : ''}${over?.zone === zone && over.index === i + 1 && i === list.length - 1 ? ' drop-after' : ''}`}
              draggable onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', `move:${b.id}`); e.dataTransfer.effectAllowed = 'move'; onDragStart({ kind: 'move', id: b.id }); }}
              onDragEnd={() => { setOver(null); onDragEnd(); }} onDragOver={(e) => hover(e, zone, i)}>
              <div className="ed-layer-row">
                <button type="button" className="ed-layer-main" onClick={() => onSelect(b.id)} aria-pressed={selected === b.id}
                  onKeyDown={(e) => { if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); onNudge(b.id, -1); } if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); onNudge(b.id, 1); } }}>
                  <span className="ed-pal-glyph" aria-hidden="true">{GLYPH[b.type] || '▫'}</span>
                  <span className="ed-layer-txt"><strong>{def.label}</strong><small>{def.container ? `${(b.cols || []).length} colonne(s)` : blockSummary(b, lang)}</small></span>
                  {(b.show?.devices || []).length < 3 && <span className="ap-tag">{(b.show.devices || []).map((d) => DEVICE_LABELS[d]).join(', ')}</span>}
                  {(b.show?.audience || 'all') !== 'all' && <span className="ap-tag">{AUDIENCES.find(([a]) => a === b.show.audience)?.[1]}</span>}
                </button>
                <span className="ed-layer-btns">
                  <button type="button" aria-label={`${def.label} ${i + 1} : monter`} disabled={i === 0} onClick={() => onNudge(b.id, -1)}>↑</button>
                  <button type="button" aria-label={`${def.label} ${i + 1} : descendre`} disabled={i === list.length - 1} onClick={() => onNudge(b.id, 1)}>↓</button>
                  <button type="button" aria-label={`${def.label} ${i + 1} : dupliquer`} onClick={() => onDup(b.id)}>⧉</button>
                  <button type="button" aria-label={`${def.label} ${i + 1} : supprimer`} onClick={() => onDel(b.id)}>✕</button>
                </span>
              </div>
              {def.container && (b.cols || []).map((_, n) => {
                const cz = `${b.id}:${n}`;
                const cl = getList(content, cz);
                return (
                  <div key={n} className="ed-layer-col" role="group" aria-label={`Colonne ${n + 1}`}
                    onDragOver={(e) => { if (!cl.length) hover(e, cz, 0); }}>
                    <h4>Colonne {n + 1}</h4>
                    {cl.length === 0 && <p className={`ed-layer-empty${over?.zone === cz ? ' drop' : ''}`}>Vide — glissez un bloc ici.</p>}
                    {renderList(cz)}
                  </div>
                );
              })}
            </li>
          );
        })}
      </ol>
    );
  };
  return (
    <div className="ed-layers">
      {zones.map((zone) => {
        const list = content.zones[zone] || [];
        return (
          <section key={zone} aria-label={ZONE_LABELS[zone]}
            onDragOver={(e) => { if (drag.current && !list.length) { e.preventDefault(); setOver({ zone, index: 0 }); } }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (over) onDrop(over.zone, over.index); setOver(null); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}>
            <h3>{ZONE_LABELS[zone]} <span className="meta small">({list.length})</span></h3>
            {list.length === 0 && <p className={`ed-layer-empty${over?.zone === zone ? ' drop' : ''}`}>Aucun bloc — glissez-en un ici.</p>}
            {renderList(zone)}
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Panneau « Modèles » */
function Templates({ onUse, disabled }) {
  return (
    <div className="ed-tpl">
      <p className="meta small">Des sections toutes prêtes : cliquez pour les ajouter après le bloc choisi, puis modifiez les textes, les images et les couleurs.</p>
      <ul>
        {TEMPLATES.map((t) => (
          <li key={t.id}><button type="button" className="ed-tpl-item" disabled={disabled} onClick={() => onUse(t)}><strong>{t.label}</strong><small>{t.hint}</small></button></li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ Panneau « Pages » */
function PagesList({ pages, pageId, onOpen, reload, call }) {
  const [title, setTitle] = useState('');
  const [slotPath, setSlotPath] = useState('/pricing');
  const [slotOther, setSlotOther] = useState('');
  const [msg, setMsg] = useState('');
  const create = async (body) => {
    setMsg('');
    const r = await call('/admin/pages', { method: 'POST', body: JSON.stringify(body) });
    if (r.ok) { setTitle(''); await reload(); onOpen(r.data.id); } else setMsg(r.data?.error || 'Création impossible.');
  };
  const home = pages.find((p) => p.kind === 'home');
  const layoutPage = pages.find((p) => p.kind === 'layout');
  const custom = pages.filter((p) => p.kind === 'custom');
  const slots = pages.filter((p) => p.kind === 'slot');
  const free = KNOWN_PATHS.filter(([p]) => !slots.some((s) => s.path === p));
  const row = (p, label) => (
    <li key={p.id}>
      <button type="button" className={`ed-page-row${p.id === pageId ? ' on' : ''}`} onClick={() => onOpen(p.id)}>
        <strong>{label || p.title}</strong>
        <small>{p.path || ''}</small>
        <span className={`ap-pill${p.live ? ' on' : ''}`}>{p.live ? 'En ligne' : p.publishedAt ? 'Hors ligne' : 'Jamais publiée'}</span>
        {p.hasDraft && <span className="ap-tag">brouillon</span>}
      </button>
    </li>
  );
  const sp = slotPath === '*' || free.some(([p]) => p === slotPath) ? slotPath : (free[0]?.[0] ?? '*');
  return (
    <div className="ed-pages">
      {msg && <p className="ap-msg" role="alert">{msg}</p>}
      <h3>Pages du site</h3>
      <ul>
        {home ? row(home, 'Accueil des membres') : <li><button type="button" className="btn ghost ed-wide" onClick={() => create({ kind: 'home' })}>+ Créer l’accueil à partir du modèle</button></li>}
        {layoutPage ? row(layoutPage, 'En-tête et pied de page') : <li><button type="button" className="btn ghost ed-wide" onClick={() => create({ kind: 'layout' })}>+ Personnaliser l’en-tête et le pied de page</button></li>}
      </ul>
      <h3>Pages créées ({custom.length})</h3>
      <ul>{custom.map((p) => row(p))}</ul>
      <form className="ed-new" onSubmit={(e) => { e.preventDefault(); create({ kind: 'custom', title }); }}>
        <label>Nouvelle page<input type="text" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Ramadan 2027" /></label>
        <button type="submit" className="btn">Créer</button>
      </form>
      <h3>Blocs sur une page existante ({slots.length})</h3>
      <ul>{slots.map((p) => row(p))}</ul>
      <form className="ed-new" onSubmit={(e) => { e.preventDefault(); create({ kind: 'slot', path: sp === '*' ? slotOther.trim() : sp }); }}>
        <label>Ajouter des blocs sur
          <select value={sp} onChange={(e) => setSlotPath(e.target.value)}>
            {free.map(([p, l]) => <option key={p} value={p}>{l} ({p})</option>)}
            <option value="*">Autre adresse…</option>
          </select>
        </label>
        {sp === '*' && <input type="text" required value={slotOther} onChange={(e) => setSlotOther(e.target.value)} placeholder="/series/ma-serie" maxLength={200} aria-label="Adresse exacte" />}
        <button type="submit" className="btn">Ajouter</button>
      </form>
      <p className="meta small">Menus : <a href="/admin?tab=menus">Admin → Menus</a> · Textes : <a href="/admin?tab=texts">Admin → Textes</a>.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ Canvas : aperçu réel + surcouche (sélection, glisser-déposer) */
function Canvas({ doc, zones, lang, device, selected, onSelect, drag, onDropAt, themeCss, canDrop, tools }) {
  const frame = useRef(null);
  const box = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [ready, setReady] = useState(false);
  const [metrics, setMetrics] = useState({ rects: [], zones: [], scrollY: 0, docH: 0 });
  const [dropAt, setDropAt] = useState(null);
  const payload = useRef(null);
  const layout = doc.page.kind === 'layout';
  payload.current = layout
    ? { type: 'pb-layout', nav: doc.content.nav, zones: doc.content.zones, locale: lang, viewAs: null, pickedId: selected }
    : { type: 'pb-content', editor: true, zones: doc.content.zones, locale: lang, pickedId: selected };

  useEffect(() => {
    if (!box.current) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(box.current);
    const onMsg = (e) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === 'pb-ready') setReady(true);
      else if (e.data?.type === 'pb-pick') onSelect(e.data.id);
      else if (e.data?.type === 'pb-rects') setMetrics({ rects: e.data.rects || [], zones: e.data.zones || [], scrollY: e.data.scrollY || 0, docH: e.data.docH || 0 });
    };
    window.addEventListener('message', onMsg);
    return () => { ro.disconnect(); window.removeEventListener('message', onMsg); };
  }, [onSelect]);

  // Le contenu part dans l'aperçu à chaque modification (légèrement différé pour grouper les frappes).
  useEffect(() => {
    if (!ready) return undefined;
    const id = setTimeout(() => frame.current?.contentWindow?.postMessage(payload.current, window.location.origin), 80);
    return () => clearTimeout(id);
  }, [ready, doc.content.zones, doc.content.nav, lang, selected, layout]);

  // Thème en cours de modification : injecté dans la page de l'aperçu.
  const inject = useCallback(() => {
    try {
      const d = frame.current?.contentDocument;
      if (!d || themeCss == null) return;
      let el = d.getElementById('theme-vars');
      if (!el) { el = d.createElement('style'); el.id = 'theme-vars'; d.body?.prepend(el); }
      if (el.textContent !== themeCss) el.textContent = themeCss;
    } catch { /* autre origine : rien à faire */ }
  }, [themeCss]);
  useEffect(() => { inject(); }, [inject, ready]);

  // Montrer le bloc choisi (clic dans le plan).
  useEffect(() => { if (ready && selected) frame.current?.contentWindow?.postMessage({ type: 'pb-scrollto', id: selected }, window.location.origin); }, [selected, ready]);

  const scale = Math.min(1, (size.w - 32) / device);
  const frameW = device * scale;
  const frameH = Math.max(300, size.h - 24);
  const left = Math.max(16, (size.w - frameW) / 2);
  const toScreen = (r) => ({ left: r.x * scale, top: (r.y - metrics.scrollY) * scale, width: r.w * scale, height: r.h * scale });
  const sel = metrics.rects.find((r) => r.id === selected);
  const selBox = sel ? toScreen(sel) : null;
  const selVisible = selBox && selBox.top + selBox.height > 0 && selBox.top < frameH;

  const overlayRef = useRef(null);
  const onOver = (e) => {
    if (!drag.current || !canDrop) return;
    e.preventDefault();
    const r = overlayRef.current.getBoundingClientRect();
    const yScreen = e.clientY - r.top;
    const yDoc = yScreen / scale + metrics.scrollY;
    const xDoc = (e.clientX - r.left) / scale;
    const dragsColumns = drag.current.kind === 'new' ? drag.current.type === 'columns' : findBlock(doc.content, drag.current.id)?.block.type === 'columns';
    const t = dropTarget(metrics.rects.filter((x) => !(drag.current.kind === 'move' && x.id === drag.current.id)), metrics.zones.filter((z) => z.zone && !(drag.current.kind === 'move' && z.zone.startsWith(`${drag.current.id}:`))), yDoc, xDoc, !dragsColumns);
    setDropAt(t);
    // Défilement automatique près des bords.
    const edge = 70;
    if (yScreen < edge) frame.current?.contentWindow?.postMessage({ type: 'pb-scrollby', dy: -Math.round((edge - yScreen) / 3 + 4) }, window.location.origin);
    else if (yScreen > r.height - edge) frame.current?.contentWindow?.postMessage({ type: 'pb-scrollby', dy: Math.round((yScreen - (r.height - edge)) / 3 + 4) }, window.location.origin);
  };
  const onDrop = (e) => { e.preventDefault(); if (dropAt) onDropAt(dropAt.zone, dropAt.index); setDropAt(null); };
  const dragging = Boolean(drag.current) && canDrop;
  const lineTop = dropAt ? (dropAt.lineY - metrics.scrollY) * scale : 0;
  const bar = selBox && selVisible ? (selBox.top < 34 ? selBox.top + 4 : selBox.top - 32) : 0;

  return (
    <div className="ed-canvas" ref={box}>
      <div className="ed-stage" style={{ width: frameW, height: frameH, left }}>
        <iframe ref={frame} title="Page en cours d’édition" src="/pb-preview" onLoad={inject}
          style={{ width: device, height: frameH / scale, transform: `scale(${scale})` }} />
        <div ref={overlayRef} className={`ed-overlay${dragging ? ' drag' : ''}`} data-testid="ed-overlay"
          onDragOver={onOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropAt(null); }} onDrop={onDrop}>
          {selVisible && (
            <>
              <div className="ed-sel" style={{ left: selBox.left, top: Math.max(0, selBox.top), width: selBox.width, height: Math.min(selBox.height, frameH) }} />
              <div className="ed-sel-bar" style={{ left: Math.max(0, Math.min(selBox.left, frameW - 250)), top: Math.max(0, bar) }} role="toolbar" aria-label="Bloc choisi">
                <span className="ed-handle" draggable title="Glisser pour déplacer le bloc" aria-label="Déplacer"
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', `move:${selected}`); e.dataTransfer.effectAllowed = 'move'; tools.start({ kind: 'move', id: selected }); }} onDragEnd={tools.end}>⠿</span>
                <b>{BLOCK_TYPES[findBlock(doc.content, selected)?.block.type]?.label}</b>
                <button type="button" aria-label="Monter" onClick={() => tools.nudge(selected, -1)}>↑</button>
                <button type="button" aria-label="Descendre" onClick={() => tools.nudge(selected, 1)}>↓</button>
                <button type="button" aria-label="Dupliquer" onClick={() => tools.dup(selected)}>⧉</button>
                <button type="button" aria-label="Supprimer" onClick={() => tools.del(selected)}>✕</button>
              </div>
            </>
          )}
          {dropAt && dragging && <div className="ed-dropline" style={{ top: lineTop, ...(dropAt.w != null && isColZone(dropAt.zone) ? { insetInlineStart: dropAt.x * scale, insetInlineEnd: 'auto', width: dropAt.w * scale } : {}) }}><span>{isColZone(dropAt.zone) ? `Colonne ${Number(dropAt.zone.split(':')[1]) + 1}` : zones.length > 1 ? ZONE_LABELS[dropAt.zone] : 'Déposer ici'}</span></div>}
        </div>
      </div>
      {!ready && <p className="ed-loading" role="status">Chargement de l’aperçu…</p>}
      {layout && <p className="ed-hint">L’en-tête, les menus et le pied de page sont ceux de votre brouillon ; les blocs se déplacent depuis le Plan.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Éditeur */
export default function SiteEditor() {
  const { call, user, ready } = useApp();
  const [pages, setPages] = useState(null);
  const [pageId, setPageId] = useState(null);
  const doc = usePageDoc(pageId, call);
  const { page, content, commit, undo, redo, errors, save, msg, setMsg } = doc;
  const [selected, setSelected] = useState(null);
  const [lang, setLang] = useState('fr');
  const [device, setDevice] = useState(1440);
  const [leftTab, setLeftTab] = useState('blocks');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [versions, setVersions] = useState(null);
  const [mediaCb, setMediaCb] = useState(null);
  const [themeCss, setThemeCss] = useState(null);
  const [toast, setToast] = useState(null);
  const [, force] = useState(0);
  const drag = useRef(null);
  const toastTimer = useRef(null);

  const say = useCallback((text, action) => { setToast({ text, action }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 5000); }, []);
  const loadPages = useCallback(async () => { const r = await call('/admin/pages'); if (r.ok) { setPages(r.data); return r.data; } return []; }, [call]);

  // Au démarrage : liste des pages, puis la page demandée (?page=12), sinon l'accueil, sinon la première.
  useEffect(() => {
    if (!ready || user?.role !== 'admin') return;
    loadPages().then((list) => {
      const want = Number(new URLSearchParams(window.location.search).get('page'));
      const first = list.find((p) => p.id === want) || list.find((p) => p.kind === 'home') || list[0];
      if (first) setPageId(first.id); else setLeftTab('pages');
    });
  }, [ready, user, loadPages]);
  const openPage = useCallback(async (id) => {
    if (id === pageId) return;
    await doc.flush();
    setSelected(null); setVersions(null); setPageId(id);
    const u = new URL(window.location.href); u.searchParams.set('page', String(id)); window.history.replaceState(null, '', u);
  }, [pageId, doc]);

  // Plein écran : le défilement de la page du site est suspendu pendant l'édition.
  useEffect(() => { document.body.classList.add('ed-open'); return () => document.body.classList.remove('ed-open'); }, []);
  useEffect(() => { if (window.innerWidth < 1100) { setRightOpen(false); setLeftOpen(false); } if (window.innerWidth < 700) setDevice(390); }, []);

  const zones = page ? ZONES[page.kind] : [];
  const canvasDrop = page && page.kind !== 'layout';

  // ---- Opérations sur les blocs
  const addBlock = useCallback((type, zone, index) => {
    if (!content) return;
    const b = newBlock(type);
    const sel = selected ? findBlock(content, selected) : null;
    let z = zone || sel?.zone || zones[0];
    let at = index ?? (sel ? sel.index + 1 : getList(content, z).length);
    if (type === 'columns' && isColZone(z)) { // les colonnes ne s'imbriquent pas : on les pose juste après le bloc Colonnes qui contient la cible
      const parent = findBlock(content, z.split(':')[0]);
      if (!parent) return;
      z = parent.zone; at = parent.index + 1;
    }
    const next = insertBlock(content, z, at, b, MAX_BLOCKS_PER_ZONE);
    if (!next) { say(`Cette zone est pleine (${isColZone(z) ? 20 : MAX_BLOCKS_PER_ZONE} blocs au maximum).`); return; }
    commit(next); setSelected(b.id); setRightOpen(true);
  }, [content, selected, zones, commit, say]);
  const addTemplate = useCallback((t) => {
    if (!content) return;
    const sel = selected ? findBlock(content, selected) : null;
    // Un modèle se pose toujours au niveau de la page (jamais dans une colonne) : après le bloc choisi, ou le bloc Colonnes qui le contient.
    let z = sel?.zone || zones[0]; let at = sel ? sel.index + 1 : (content.zones[z] || []).length;
    if (isColZone(z)) { const parent = findBlock(content, z.split(':')[0]); z = parent.zone; at = parent.index + 1; }
    const blocks = t.make();
    let next = content;
    for (let k = 0; k < blocks.length; k++) { next = insertBlock(next, z, at + k, blocks[k], MAX_BLOCKS_PER_ZONE); if (!next) { say('Cette zone est trop pleine pour ce modèle.'); return; } }
    commit(next); setSelected(blocks[0].id); setRightOpen(true); say(`Modèle « ${t.label} » ajouté.`, { label: 'Annuler', run: undo });
  }, [content, selected, zones, commit, undo, say]);
  const nudge = useCallback((id, d) => commit(nudgeBlock(content, id, d)), [content, commit]);
  const dup = useCallback((id) => {
    const r = duplicateBlock(content, id, newId(), MAX_BLOCKS_PER_ZONE);
    if (!r) { say(`Cette zone contient déjà ${MAX_BLOCKS_PER_ZONE} blocs.`); return; }
    commit(r.content); setSelected(r.id);
  }, [content, commit, say]);
  const del = useCallback((id) => { commit(removeBlock(content, id)); setSelected(null); say('Bloc supprimé.', { label: 'Annuler', run: undo }); }, [content, commit, undo, say]);
  const dropAt = useCallback((zone, index) => {
    const d = drag.current; drag.current = null; force((n) => n + 1);
    if (!d || !content) return;
    if (d.kind === 'new') { addBlock(d.type, zone, index); return; }
    const next = moveBlock(content, d.id, zone, index, MAX_BLOCKS_PER_ZONE);
    if (!next) { say(isColZone(zone) ? 'Les colonnes ne se mettent pas dans une colonne, et une colonne accepte 20 blocs au plus.' : `Cette zone contient déjà ${MAX_BLOCKS_PER_ZONE} blocs.`); return; }
    commit(next);
  }, [content, addBlock, commit, say]);
  const startDrag = useCallback((d) => { setTimeout(() => { drag.current = d; force((n) => n + 1); }, 0); drag.current = d; }, []);
  const endDrag = useCallback(() => { drag.current = null; force((n) => n + 1); }, []);
  const setBlock = (b) => { const f = findBlock(content, b.id); if (!f) return; commit(setList(content, f.zone, getList(content, f.zone).map((x) => (x.id === b.id ? b : x))), `block:${b.id}`); };
  const setMeta = (k, v) => { const meta = { ...(content.meta || {}) }; if (v === undefined) delete meta[k]; else meta[k] = v; commit({ ...content, meta }, `meta:${k}`); };
  const setNav = (nav) => { const c = { ...content }; if (nav === undefined) delete c.nav; else c.nav = nav; commit(c, 'nav'); };

  // ---- Clavier
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); doc.flush(); return; }
      if (typing(document.activeElement)) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (!selected) return;
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); dup(selected); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(selected); }
      else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); nudge(selected, -1); }
      else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); nudge(selected, 1); }
      else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, undo, redo, dup, del, nudge, doc]);

  // ---- Publication, brouillon, historique, page
  const publish = async () => {
    if (!(await doc.flush())) return;
    const r = await call(`/admin/pages/${pageId}/publish`, { method: 'POST' });
    if (r.ok) { doc.reset(r.data); setMsg('Page publiée : elle est visible sur le site (au plus tard 10 secondes).'); loadPages(); } else { doc.setErrors(r.data?.errors || {}); setMsg(r.data?.error || 'Publication impossible.'); }
  };
  const discard = async () => {
    if (!window.confirm('Abandonner le brouillon et revenir à la version publiée ?')) return;
    const r = await call(`/admin/pages/${pageId}/draft`, { method: 'DELETE' });
    if (r.ok) { doc.reset(r.data); setSelected(null); setMsg('Brouillon abandonné.'); loadPages(); }
  };
  const showVersions = async () => { if (versions) { setVersions(null); return; } const r = await call(`/admin/pages/${pageId}/versions`); if (r.ok) setVersions(r.data); };
  const restore = async (v) => {
    if (!window.confirm('Recopier cette version dans le brouillon ? Le brouillon actuel sera remplacé.')) return;
    const r = await call(`/admin/pages/${pageId}/versions/${v.id}/restore`, { method: 'POST' });
    if (r.ok) { doc.reset(r.data); setVersions(null); setSelected(null); setMsg('Version recopiée dans le brouillon : vérifiez puis publiez.'); }
  };
  const setLive = async (live) => {
    const r = await call(`/admin/pages/${pageId}/live`, { method: 'PUT', body: JSON.stringify({ live }) });
    if (r.ok) { doc.setPage((p) => ({ ...p, live: r.data.live })); loadPages(); setMsg(live ? 'Page remise en ligne.' : 'Page mise hors ligne : les visiteurs ne la voient plus.'); } else setMsg(r.data?.error || 'Échec.');
  };
  const rename = async () => {
    const title = window.prompt('Nom de la page (usage interne)', page.title); if (!title) return;
    let slug;
    if (page.kind === 'custom') { slug = window.prompt('Adresse de la page : /p/…  (lettres minuscules, chiffres, tirets)', page.path.replace('/p/', '')); if (!slug) return; }
    const r = await call(`/admin/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ title, ...(slug ? { slug } : {}) }) });
    if (r.ok) { doc.setPage((p) => ({ ...p, title: r.data.title, path: r.data.path })); loadPages(); } else setMsg(r.data?.error || 'Échec.');
  };
  const removePage = async () => {
    if (!window.confirm(page.kind === 'home' ? 'Supprimer l’accueil en blocs ? L’accueil d’origine du site reviendra immédiatement.' : 'Supprimer cette page et son historique ?')) return;
    const r = await call(`/admin/pages/${pageId}`, { method: 'DELETE' });
    if (r.ok) { const list = await loadPages(); setSelected(null); setPageId(list[0]?.id ?? null); } else setMsg(r.data?.error || 'Échec.');
  };

  // Erreurs de l'API rangées par bloc.
  const errorsByBlock = useMemo(() => {
    const out = {}; const rest = [];
    for (const [path, m] of Object.entries(errors || {})) {
      // zones.main.0[.cols.1.2].props.image : on suit le chemin jusqu'au bloc (colonnes comprises)
      const parts = path.split('.');
      let node = null; let k = 0;
      if (parts[0] === 'zones' && content?.zones?.[parts[1]]) {
        node = content.zones[parts[1]][Number(parts[2])]; k = 3;
        while (node && parts[k] === 'cols') { node = node.cols?.[Number(parts[k + 1])]?.[Number(parts[k + 2])]; k += 3; }
      }
      const group = parts[k]; const field = parts[k + 1];
      if (node && ['props', 'show', 'style'].includes(group) && field) (out[node.id] ||= {})[field] = m;
      else if (node && ['type', 'id'].includes(group)) (out[node.id] ||= {})[group] = m;
      else rest.push(`${path ? `${path} : ` : ''}${m}`);
    }
    return { out, rest };
  }, [errors, content]);

  if (!ready) return <div className="ed-root"><p className="ed-center" role="status">Chargement…</p></div>;
  if (user?.role !== 'admin') return <div className="ed-root"><p className="ed-center">L’éditeur du site est réservé aux administrateurs. <a href="/login">Se connecter</a></p></div>;

  const saveLabel = { pending: 'Modifications en attente…', saving: 'Enregistrement…', saved: 'Brouillon enregistré', error: 'Non enregistré' }[save];
  const selBlock = selected && content ? findBlock(content, selected) : null;
  const tools = { start: startDrag, end: endDrag, nudge, dup, del };

  return (
    <div className="ed-root" lang="fr" dir="ltr" data-editor>
      <header className="ed-top">
        <a className="ed-back" href="/admin?tab=pages" title="Quitter l’éditeur">← Admin</a>
        <button type="button" className="ed-page-btn" onClick={() => { setLeftOpen(true); setLeftTab('pages'); }} aria-label="Changer de page">
          <strong>{page?.title || 'Choisir une page'}</strong>{page && page.kind !== 'home' && page.kind !== 'layout' && <code>{page.path}</code>}<span aria-hidden="true">▾</span>
        </button>
        <div className="ed-group" role="group" aria-label="Historique des modifications">
          <button type="button" onClick={undo} disabled={!doc.canUndo} aria-label="Annuler (Ctrl+Z)" title="Annuler (Ctrl+Z)">↶</button>
          <button type="button" onClick={redo} disabled={!doc.canRedo} aria-label="Rétablir (Ctrl+Maj+Z)" title="Rétablir (Ctrl+Maj+Z)">↷</button>
        </div>
        <div className="ed-group ed-devices" role="group" aria-label="Taille d’écran">
          {DEVICES.map((d) => <button key={d.id} type="button" className={device === d.id ? 'on' : ''} aria-pressed={device === d.id} onClick={() => setDevice(d.id)} title={`${d.label} (${d.id} px)`}><span aria-hidden="true">{d.glyph}</span><span className="ed-lab">{d.label}</span></button>)}
        </div>
        <div className="ed-group" role="group" aria-label="Langue">
          {LANGS.map((l) => <button key={l} type="button" className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)} title={LANG_NAMES[l]}>{l.toUpperCase()}</button>)}
        </div>
        <span className="ed-spacer" />
        <span className={`ed-save ${save}`} role="status" aria-live="polite">{saveLabel}</span>
        {page && (page.live ? <span className="ap-pill on">En ligne</span> : <span className="ap-pill">{page.publishedAt ? 'Hors ligne' : 'Jamais publiée'}</span>)}
        <div className="ed-group" role="group" aria-label="Panneaux">
          <button type="button" className={leftOpen ? 'on' : ''} aria-pressed={leftOpen} onClick={() => setLeftOpen((v) => !v)} title="Panneau de gauche">◧</button>
          <button type="button" className={rightOpen ? 'on' : ''} aria-pressed={rightOpen} onClick={() => setRightOpen((v) => !v)} title="Panneau de droite">◨</button>
        </div>
        <button type="button" className="btn ghost ed-mini" onClick={showVersions} disabled={!page} aria-expanded={Boolean(versions)}>Historique</button>
        <button type="button" className="btn ed-publish" onClick={publish} disabled={!page || (!page.hasDraft && save !== 'pending')}>Publier</button>
      </header>

      {(msg || errorsByBlock.rest.length > 0 || Object.keys(errorsByBlock.out).length > 0) && (
        <div className="ed-banner" role="alert">
          {msg && <span>{msg}</span>}
          {Object.keys(errorsByBlock.out).length > 0 && <span>{Object.keys(errorsByBlock.out).length} bloc(s) à corriger (en rouge dans le Plan) : {Object.values(errorsByBlock.out).map((o) => Object.values(o)[0]).slice(0, 3).join(' · ')}</span>}
          {errorsByBlock.rest.map((m, i) => <span key={i}>{m}</span>)}
          <button type="button" aria-label="Fermer" onClick={() => { setMsg(''); doc.setErrors({}); }}>✕</button>
        </div>
      )}

      <div className={`ed-body${leftOpen ? ' left' : ''}${rightOpen ? ' right' : ''}`}>
        {leftOpen && (
          <aside className="ed-left" aria-label="Blocs, plan, pages et style">
            <div className="ed-tabs" role="tablist">
              {[['blocks', 'Blocs'], ['tpl', 'Modèles'], ['layers', 'Plan'], ['pages', 'Pages'], ['style', 'Style']].map(([id, l]) => (
                <button key={id} type="button" role="tab" aria-selected={leftTab === id} className={leftTab === id ? 'on' : ''} onClick={() => setLeftTab(id)}>{l}</button>
              ))}
            </div>
            <div className="ed-panel">
              {leftTab === 'blocks' && <Palette disabled={!content} onAdd={(t) => addBlock(t)} onDragStart={startDrag} onDragEnd={endDrag} />}
              {leftTab === 'tpl' && <Templates disabled={!content} onUse={addTemplate} />}
              {leftTab === 'layers' && content && <Layers content={content} zones={zones} selected={selected} onSelect={(id) => { setSelected(id); setRightOpen(true); }} lang={lang} drag={drag} onDragStart={startDrag} onDragEnd={endDrag} onDrop={dropAt} onNudge={nudge} onDup={dup} onDel={del} errorsByBlock={errorsByBlock.out} />}
              {leftTab === 'layers' && !content && <p className="meta">Choisissez une page.</p>}
              {leftTab === 'pages' && pages && <PagesList pages={pages} pageId={pageId} onOpen={openPage} reload={loadPages} call={call} />}
              {leftTab === 'style' && <ThemePanel onCss={setThemeCss} />}
            </div>
          </aside>
        )}

        <main className="ed-main">
          {page && content ? (
            <Canvas doc={{ page, content }} zones={zones} lang={lang} device={device} selected={selected} onSelect={(id) => { setSelected(id); if (id) setRightOpen(true); }} drag={drag} onDropAt={dropAt} themeCss={themeCss} canDrop={canvasDrop} tools={tools} />
          ) : (
            <p className="ed-center" role="status">{pages && pages.length === 0 ? 'Aucune page : créez-en une dans l’onglet « Pages ».' : msg || 'Chargement de la page…'}</p>
          )}
          {drag.current && canvasDrop && <div className="ed-dragnote" aria-hidden="true">Déposez le bloc sur la page</div>}
        </main>

        {rightOpen && (
          <aside className="ed-right" aria-label="Réglages">
            <div className="ed-panel">
              {!content && <p className="meta">Choisissez une page.</p>}
              {content && selBlock && (
                <>
                  <div className="ed-right-head">
                    <h2>{BLOCK_TYPES[selBlock.block.type].label}</h2>
                    <button type="button" className="link u" onClick={() => setSelected(null)}>Réglages de la page</button>
                  </div>
                  <BlockEditor key={selBlock.block.id} block={selBlock.block} lang={lang} errors={errorsByBlock.out[selBlock.block.id]} onChange={setBlock} onPickMedia={(cb) => setMediaCb(() => cb)} />
                </>
              )}
              {content && !selBlock && (
                <PageSettings page={page} content={content} lang={lang} errors={errors} setMeta={setMeta} setNav={setNav} setMediaCb={setMediaCb}
                  onRename={rename} onLive={setLive} onDiscard={discard} onRemove={removePage} />
              )}
            </div>
          </aside>
        )}
      </div>

      {versions && (
        <div className="ed-modal" role="dialog" aria-label="Historique des publications">
          <div className="ed-modal-box">
            <div className="ed-right-head"><h2>Historique des publications</h2><button type="button" className="link u" onClick={() => setVersions(null)}>Fermer</button></div>
            {versions.length === 0 ? <p className="meta">Aucune publication pour l’instant.</p> : (
              <ul>{versions.map((v, i) => (
                <li key={v.id}><span>{fmtDate(v.createdAt)}{v.by ? ` · ${v.by}` : ''} · {v.blocks} bloc(s){i === 0 ? ' · version en ligne' : ''}</span>
                  <button type="button" className="btn ghost ed-mini" onClick={() => restore(v)}>Recopier dans le brouillon</button></li>
              ))}</ul>
            )}
          </div>
        </div>
      )}
      {toast && <div className="ed-toast" role="status">{toast.text}{toast.action && <button type="button" onClick={() => { toast.action.run(); setToast(null); }}>{toast.action.label}</button>}</div>}
      {mediaCb && <MediaPicker call={call} onClose={() => setMediaCb(null)} onPick={(id) => { mediaCb(id); setMediaCb(null); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Réglages de la page (aucun bloc choisi) */
function PageSettings({ page, content, lang, errors, setMeta, setNav, setMediaCb, onRename, onLive, onDiscard, onRemove }) {
  return (
    <div className="ed-pageset">
      <div className="ed-right-head"><h2>Page</h2></div>
      <p className="meta small">Cliquez un bloc dans la page ou dans le Plan pour le modifier.</p>
      {page.kind === 'home' && <p className="meta small">Cette page remplace l’accueil d’origine pour les membres connectés (et pour tous si la vitrine visiteurs est coupée). Tant qu’elle n’est pas publiée, l’accueil d’origine reste en place. <b>Sur le thème Premium, l’accueil d’origine reste affiché</b> : la recomposition de l’accueil Premium en blocs arrive à l’étape 4.</p>}
      {page.kind === 'layout' && <NavEditor nav={content.nav} onChange={setNav} lang={lang} errors={errors} viewAs={null} onViewAs={() => {}} />}
      {page.kind === 'custom' && (
        <details className="pe-meta" open>
          <summary>Référencement (Google, partages)</summary>
          <TextField f={{ k: 'title', label: 'Titre de la page', kind: 't', max: 120 }} value={content.meta?.title} lang={lang} onChange={(v) => setMeta('title', v)} error={errors['meta.title']} />
          <TextField f={{ k: 'description', label: 'Description (une ou deux phrases)', kind: 't', max: 300 }} value={content.meta?.description} lang={lang} onChange={(v) => setMeta('description', v)} error={errors['meta.description']} />
          <MediaField f={{ label: 'Image de partage' }} value={content.meta?.image} onPick={() => setMediaCb(() => (id) => setMeta('image', id))} onClear={() => setMeta('image', undefined)} />
          <label className="pe-check"><input type="checkbox" checked={Boolean(content.meta?.noindex)} onChange={(e) => setMeta('noindex', e.target.checked ? true : undefined)} /> Ne pas référencer cette page</label>
          <SeoCheck page={page} content={content} lang={lang} />
        </details>
      )}
      <div className="ed-pageset-actions">
        <button type="button" className="btn ghost" onClick={onRename}>Renommer{page.kind === 'custom' ? ' / changer l’adresse' : ''}</button>
        {page.publishedAt && <button type="button" className="btn ghost" onClick={() => onLive(!page.live)}>{page.live ? 'Mettre hors ligne' : 'Remettre en ligne'}</button>}
        {page.live && <a className="btn ghost" href={page.kind === 'home' || page.kind === 'layout' ? '/' : page.path} target="_blank" rel="noopener noreferrer">Voir sur le site ↗</a>}
        <button type="button" className="btn ghost" onClick={onDiscard} disabled={!page.hasDraft}>Abandonner le brouillon</button>
        <button type="button" className="btn ghost ed-danger" onClick={onRemove}>Supprimer la page</button>
      </div>
    </div>
  );
}
