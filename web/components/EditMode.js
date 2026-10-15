'use client';
// Étape I5 — Mode édition sur la page (administrateur seulement).
//
// Un bouton « Modifier cette page » active le mode : on clique un BLOC (bannière, texte, cartes…) pour changer son contenu,
// son affichage et son style dans un panneau à côté de la page ; on clique un TEXTE du site (menu, bouton, titre…) pour le
// réécrire en français, anglais et arabe. Les blocs s'enregistrent en brouillon (rien n'est visible des visiteurs avant
// « Publier ») ; les textes du site s'appliquent à l'enregistrement, comme dans Admin → Textes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';
import { BlockEditor, LANG_NAMES } from './PageFields';
import { MediaPicker } from './PagesAdmin';
import { LANGS } from '../lib/blocks';

const HIDDEN = [/^\/admin/, /^\/studio/, /^\/kids/, /^\/pb-preview/, /^\/login/, /^\/register/];
const clone = (x) => JSON.parse(JSON.stringify(x));
const holes = (s) => [...new Set(String(s).match(/\{[^}]*\}/g) || [])].sort().join('');

/* Ce qui se trouve sous la souris : un bloc de page, ou un texte connu du site. */
function textAt(e) {
  let node = null; let off = 0;
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(e.clientX, e.clientY); if (p) { node = p.offsetNode; off = p.offset; } }
  else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(e.clientX, e.clientY); if (r) { node = r.startContainer; off = r.startOffset; } }
  if (!node || node.nodeType !== 3) return null;
  // le point doit être réellement sur le texte (et pas dans une marge à côté)
  const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, node.nodeValue.length);
  const hit = [...range.getClientRects()].some((r) => e.clientX >= r.left - 2 && e.clientX <= r.right + 2 && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2);
  void off;
  return hit ? { value: node.nodeValue.trim(), el: node.parentElement } : null;
}

/* ------------------------------------------------------------------ Panneau : modifier un texte du site */
function TextPanel({ sel, onClose }) {
  const { call, locale, dict, textPatch, setTextPatch } = useApp();
  const [keys, setKeys] = useState(() => Object.fromEntries(sel.keys.map((k) => [k, true])));
  const [vals, setVals] = useState(null);     // { fr, en, ar } affichés
  const [start, setStart] = useState(null);   // valeurs de départ, pour n'envoyer que ce qui change
  const [orig, setOrig] = useState(null);     // textes d'origine du code : { fr: {...}, en: {...}, ar: {...} }
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const first = sel.keys[0];

  useEffect(() => {
    let dead = false;
    (async () => {
      const [{ DICT }, r] = await Promise.all([import('../lib/i18n'), call('/texts')]);
      if (dead) return;
      const over = r.ok ? r.data.texts || {} : {};
      const v = {};
      for (const l of LANGS) v[l] = (l === locale ? (textPatch[first] || dict[first]) : (over[l]?.[first] ?? DICT[l]?.[first])) ?? '';
      setOrig(DICT); setVals(v); setStart(clone(v));
    })();
    return () => { dead = true; };
  }, [call, first, locale, dict, textPatch]);

  if (!vals) return <p className="meta" role="status">Chargement…</p>;
  const chosen = sel.keys.filter((k) => keys[k]);
  const save = async (restore) => {
    setMsg('');
    const changes = [];
    for (const k of chosen) for (const l of LANGS) {
      if (restore) changes.push({ key: k, lang: l, value: null });
      else if (vals[l] !== start[l]) {
        const o = orig[l]?.[k] ?? '';
        if (holes(vals[l]) !== holes(o)) { setMsg(`Langue ${LANG_NAMES[l]} : gardez les mots entre accolades ${[...new Set(String(o).match(/\{[^}]*\}/g) || [])].join(' ')} tels quels.`); return; }
        if (!vals[l].trim()) { setMsg(`Langue ${LANG_NAMES[l]} : le texte est vide.`); return; }
        changes.push({ key: k, lang: l, value: vals[l] });
      }
    }
    if (!changes.length) { setMsg('Rien n’a changé.'); return; }
    setBusy(true);
    const r = await call('/admin/texts', { method: 'PUT', body: JSON.stringify({ changes }) });
    setBusy(false);
    if (!r.ok) { setMsg(r.data?.error || 'Enregistrement impossible.'); return; }
    const patch = { ...textPatch };
    for (const k of chosen) { const nv = restore ? orig[locale]?.[k] : vals[locale]; if (nv !== undefined && nv !== '') patch[k] = nv; }
    setTextPatch(patch);
    onClose(restore ? 'Texte d’origine rétabli.' : 'Texte enregistré.');
  };
  return (
    <div className="em-body">
      <p className="meta small">Ce texte est modifiable pour les trois langues. Il change sur tout le site là où il est utilisé ; les visiteurs le voient au plus tard 10 secondes après.</p>
      {LANGS.map((l) => (
        <label key={l} className="pe-f"><span className="pe-lab">{LANG_NAMES[l]}</span>
          <textarea rows={Math.min(6, Math.max(2, Math.ceil(vals[l].length / 40)))} value={vals[l]} dir={l === 'ar' ? 'rtl' : 'ltr'} onChange={(e) => setVals({ ...vals, [l]: e.target.value })} /></label>
      ))}
      {sel.keys.length > 1 && (
        <fieldset className="pe-f"><legend className="pe-lab">Ce texte sert à plusieurs endroits : modifier</legend>
          {sel.keys.map((k) => <label key={k} className="em-key"><input type="checkbox" checked={Boolean(keys[k])} onChange={(e) => setKeys({ ...keys, [k]: e.target.checked })} /> <code>{k}</code></label>)}
        </fieldset>
      )}
      {sel.keys.length === 1 && <p className="meta small">Repère : <code>{first}</code></p>}
      {msg && <p className="pe-err" role="alert">{msg}</p>}
      <div className="em-actions">
        <button type="button" className="btn" disabled={busy || !chosen.length} onClick={() => save(false)}>Enregistrer</button>
        <button type="button" className="btn ghost" disabled={busy || !chosen.length} onClick={() => { if (window.confirm('Rétablir le texte d’origine (3 langues) ?')) save(true); }}>Rétablir l’original</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Panneau : modifier un bloc */
function BlockPanel({ sel }) {
  const { call, locale, setBlockEdits, blockEdits } = useApp();
  const [lang, setLang] = useState(LANGS.includes(locale) ? locale : 'fr');
  const [state, setState] = useState({ phase: 'load' }); // load | ready | error
  const [block, setBlock] = useState(null);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');   // '' | pending | saving | saved | error
  const [msg, setMsg] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const [mediaCb, setMediaCb] = useState(null);
  const page = useRef(null);   // { id, content }
  const timer = useRef(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const list = await call('/admin/pages');
      const meta = list.ok ? list.data.find((p) => p.path === sel.pagePath) : null;
      if (!meta) { if (!dead) setState({ phase: 'error', text: 'Cette zone n’appartient à aucune page modifiable ici. Ouvrez Admin → Pages.' }); return; }
      const r = await call(`/admin/pages/${meta.id}`);
      if (dead) return;
      if (!r.ok) { setState({ phase: 'error', text: r.data?.error || 'Page introuvable.' }); return; }
      const content = clone(r.data.content);
      const b = Object.values(content.zones || {}).flat().find((x) => x.id === sel.id);
      if (!b) { setState({ phase: 'error', text: 'Ce bloc n’est pas dans la version à modifier (il est peut-être déjà supprimé). Rechargez la page.' }); return; }
      page.current = { id: meta.id, content, title: meta.title };
      setHasDraft(Boolean(r.data.hasDraft)); setBlock(clone(blockEdits[sel.id] || b)); setState({ phase: 'ready' });
    })();
    return () => { dead = true; clearTimeout(timer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, sel.id, sel.pagePath]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current); timer.current = null;
    if (!page.current) return false;
    setStatus('saving');
    const r = await call(`/admin/pages/${page.current.id}/draft`, { method: 'PUT', body: JSON.stringify({ content: page.current.content }) });
    if (r.ok) { setErrors({}); setStatus('saved'); setHasDraft(true); setMsg(''); return true; }
    const e = {};
    for (const [path, m] of Object.entries(r.data?.errors || {})) {
      const x = path.match(/^zones\.(\w+)\.(\d+)\.(?:props|show|style)\.(\w+)/);
      const b = x && page.current.content.zones?.[x[1]]?.[Number(x[2])];
      if (b?.id === sel.id) e[x[3]] = m;
    }
    setErrors(e); setStatus('error'); setMsg(r.data?.error || 'Enregistrement impossible.');
    return false;
  }, [call, sel.id]);

  const change = (nb) => {
    setBlock(nb); setBlockEdits((cur) => ({ ...cur, [sel.id]: nb }));
    for (const z of Object.keys(page.current.content.zones)) page.current.content.zones[z] = page.current.content.zones[z].map((x) => (x.id === sel.id ? nb : x));
    setStatus('pending'); clearTimeout(timer.current); timer.current = setTimeout(flush, 1000);
  };
  const publish = async () => {
    if (!(await flush())) return;
    const r = await call(`/admin/pages/${page.current.id}/publish`, { method: 'POST' });
    if (r.ok) { setHasDraft(false); setStatus(''); setMsg('Publié : visible des visiteurs au plus tard dans 10 secondes.'); }
    else { setStatus('error'); setMsg(r.data?.error || 'Publication impossible : ouvrez Admin → Pages pour voir le détail.'); }
  };

  if (state.phase === 'load') return <p className="meta" role="status">Chargement…</p>;
  if (state.phase === 'error') return <p className="pe-err" role="alert">{state.text}</p>;
  const label = { pending: 'Modifications en attente…', saving: 'Enregistrement…', saved: 'Brouillon enregistré', error: 'Non enregistré' }[status];
  return (
    <div className="em-body">
      <div className="pe-langbar">
        <span className="pe-lab">Langue des textes</span>
        <div className="ap-seg" role="group" aria-label="Langue d'édition">
          {LANGS.map((l) => <button key={l} type="button" className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>{LANG_NAMES[l]}</button>)}
        </div>
      </div>
      <BlockEditor block={block} lang={lang} errors={errors} onChange={change} onPickMedia={(cb) => setMediaCb(() => cb)} />
      <p className="ap-status" role="status" aria-live="polite">{label && <span className={`ap-save ${status}`}>{label}</span>}{hasDraft && !label && <span>Brouillon en cours, pas encore publié</span>}</p>
      {msg && <p className={status === 'error' ? 'pe-err' : 'meta small'} role="alert">{msg}</p>}
      <div className="em-actions">
        <button type="button" className="btn" disabled={!hasDraft && status !== 'pending'} onClick={publish}>Publier</button>
        <a className="btn ghost" href="/admin?tab=pages">Admin → Pages</a>
      </div>
      <p className="meta small">« Publier » met en ligne tout le brouillon de la page « {page.current.title} », pas seulement ce bloc.</p>
      {mediaCb && <MediaPicker call={call} onClose={() => setMediaCb(null)} onPick={(id) => { mediaCb(id); setMediaCb(null); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Barre + écouteurs */
export default function EditMode() {
  const { user, ready, dict, textPatch } = useApp();
  const path = usePathname() || '/';
  const [on, setOn] = useState(false);
  const [sel, setSel] = useState(null);      // { kind: 'block', id, pagePath } | { kind: 'text', keys } | { kind: 'unknown', value }
  const [note, setNote] = useState('');
  const hover = useRef(null);
  const allowed = ready && user?.role === 'admin' && !HIDDEN.some((re) => re.test(path));

  // texte affiché → clés du site qui le portent (les textes à variables {n} ne sont pas reconnus ici)
  const rev = useMemo(() => {
    if (!on) return null;
    const m = new Map();
    for (const k of Object.keys(dict)) { const v = String(textPatch[k] || dict[k]).trim(); if (!v) continue; if (!m.has(v)) m.set(v, []); m.get(v).push(k); }
    return m;
  }, [on, dict, textPatch]);

  const inspect = useCallback((e) => {
    const bl = e.target.closest?.('[data-block]');
    const zone = bl?.closest('[data-pbpath]');
    if (bl && zone) return { kind: 'block', id: bl.dataset.block, pagePath: zone.dataset.pbpath, el: bl };
    const t = textAt(e);
    if (!t || !t.value) return null;
    const keys = rev?.get(t.value);
    return keys?.length ? { kind: 'text', keys, el: t.el, value: t.value } : { kind: 'unknown', value: t.value, el: t.el };
  }, [rev]);

  useEffect(() => {
    if (!on || !allowed) return undefined;
    document.body.classList.add('edit-on');
    let raf = 0;
    const clear = () => { hover.current?.classList.remove('em-hover'); hover.current = null; };
    const onMove = (e) => {
      if (e.target.closest?.('.em-ui')) { clear(); return; }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = inspect(e); const el = r && r.kind !== 'unknown' ? r.el : null;
        if (el !== hover.current) { clear(); if (el) { el.classList.add('em-hover'); hover.current = el; } }
      });
    };
    const onClick = (e) => {
      if (e.target.closest?.('.em-ui')) return;
      e.preventDefault(); e.stopPropagation();
      const r = inspect(e);
      if (!r) { setNote('Cliquez sur un bloc ou sur un texte du site.'); return; }
      setNote('');
      setSel(r.kind === 'block' ? { kind: 'block', id: r.id, pagePath: r.pagePath } : r.kind === 'text' ? { kind: 'text', keys: r.keys } : { kind: 'unknown', value: r.value });
    };
    const onKey = (e) => { if (e.key === 'Escape') setSel(null); };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf); clear(); document.body.classList.remove('edit-on');
      document.removeEventListener('mousemove', onMove, true); document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey);
    };
  }, [on, allowed, inspect]);
  useEffect(() => { setSel(null); setNote(''); }, [path]);

  if (!allowed) return null;
  const close = (m) => { setSel(null); setNote(typeof m === 'string' ? m : ''); };
  return (
    <div className="em-ui">
      <div className={`em-bar${on ? ' on' : ''}`} role="region" aria-label="Mode édition">
        {on ? (
          <>
            <span className="em-hint">{note || 'Mode édition : cliquez un bloc ou un texte'}</span>
            <button type="button" className="btn pe-mini" onClick={() => { setOn(false); setSel(null); setNote(''); }}>Terminer</button>
          </>
        ) : <button type="button" className="btn pe-mini" onClick={() => setOn(true)}>✎ Modifier cette page</button>}
      </div>
      {on && sel && (
        <aside className="em-panel" role="dialog" aria-label={sel.kind === 'block' ? 'Modifier le bloc' : 'Modifier le texte'} dir="ltr" lang="fr">
          <div className="em-head">
            <strong>{sel.kind === 'block' ? 'Modifier le bloc' : sel.kind === 'text' ? 'Modifier le texte' : 'Texte non modifiable ici'}</strong>
            <button type="button" className="btn ghost pe-mini" onClick={() => close()} aria-label="Fermer le panneau">✕</button>
          </div>
          {sel.kind === 'block' && <BlockPanel key={sel.id} sel={sel} />}
          {sel.kind === 'text' && <TextPanel key={sel.keys.join('|')} sel={sel} onClose={close} />}
          {sel.kind === 'unknown' && (
            <div className="em-body">
              <p>« {sel.value} »</p>
              <p className="meta small">Ce texte ne vient pas de la liste des textes du site (il change selon la personne ou le contenu : nom, date, titre d’une conférence…). Les textes avec des variables se modifient dans Admin → Textes ; le contenu des conférences, dans Studio.</p>
              <a className="btn ghost" href="/admin?tab=texts">Ouvrir Admin → Textes</a>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
