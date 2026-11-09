'use client';
// Admin → Menus (projet « Menus », étape 1) : créer, modifier, supprimer des menus nommés, y mettre des liens
// (page du site, adresse externe, conférence, série, collection, chaîne, page créée dans Admin → Pages, écran de l'application),
// avec un niveau de sous-menus déroulants, puis choisir quel menu s'affiche à quel emplacement (haut, latéral, barre du bas,
// pied de page, menu ☰ et onglets de l'application). Un emplacement sans menu affecté garde le menu d'origine du site.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './Providers';
import { MENUS, NAV_ICONS, NAV_ICON_LABELS, NAV_AUDIENCES } from '../lib/navcfg';

const BUILTIN_LABEL = (() => {
  const m = {};
  [MENUS.main.builtin, MENUS.bar.builtin, MENUS.footer.builtin, ...Object.values(MENUS.side.builtin)].forEach((l) => l.forEach(([k, n]) => { m[k] = m[k] || n; }));
  return m;
})();
const DEVICES = [['m', 'Téléphone'], ['t', 'Tablette'], ['d', 'Ordinateur']];
const LANGS = [['fr', 'Français'], ['en', 'Anglais'], ['ar', 'Arabe']];
const KIND_ICON = { builtin: '◆', url: '↗', talk: '▶', series: '☰', collection: '▣', channel: '☺', page: '▤', appscreen: '▭', heading: 'H' };
const rid = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 40);
const clone = (x) => JSON.parse(JSON.stringify(x));

// Résumé lisible d'un élément (texte + cible).
function summary(it, spec) {
  const label = it.label?.fr || '';
  switch (it.kind) {
    case 'builtin': return { title: label || BUILTIN_LABEL[it.ref] || it.ref, sub: `Lien d’origine · ${it.ref}` };
    case 'url': return { title: label, sub: it.ref };
    case 'appscreen': return { title: label || spec.appScreens.find(([k]) => k === it.ref)?.[1] || it.ref, sub: `Écran de l’application · ${it.ref}` };
    case 'heading': return { title: label, sub: it.children?.length ? 'Titre avec sous-menu' : 'Titre de groupe' };
    default: return { title: label || '(texte repris du contenu)', sub: `${spec.kinds.find(([k]) => k === it.kind)?.[1] || it.kind} · ${it.ref}` };
  }
}

// Formulaire d'un élément (création ou modification).
function ItemForm({ initial, spec, allowed, isChild, canHaveChildren, onSave, onCancel }) {
  const { call } = useApp();
  const [it, setIt] = useState(() => initial || { id: rid(), kind: allowed[0], ref: '', label: {} });
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [err, setErr] = useState('');
  const set = (patch) => setIt((x) => ({ ...x, ...patch }));
  const setLabel = (lang, v) => setIt((x) => ({ ...x, label: { ...(x.label || {}), [lang]: v } }));
  const lookupKind = ['talk', 'series', 'collection', 'channel', 'page'].includes(it.kind) ? it.kind : null;
  const timer = useRef(null);
  useEffect(() => {
    if (!lookupKind) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await call(`/admin/menus/lookup?kind=${lookupKind}&q=${encodeURIComponent(q)}`);
      setFound(r.ok ? r.data.results : []);
    }, 250);
    return () => clearTimeout(timer.current);
  }, [lookupKind, q, call]);
  const changeKind = (kind) => { setIt((x) => ({ ...x, kind, ref: '', newTab: undefined })); setQ(''); setFound([]); };
  const devices = it.devices || ['m', 't', 'd'];
  const toggleDevice = (d) => { const n = devices.includes(d) ? devices.filter((x) => x !== d) : [...devices, d]; set({ devices: n.length === 3 ? undefined : n }); };
  const submit = (e) => {
    e.preventDefault();
    if (it.kind !== 'heading' && !it.ref) { setErr('Choisissez la cible du lien.'); return; }
    if ((it.kind === 'url' || it.kind === 'heading') && !it.label?.fr?.trim()) { setErr('Le texte en français est obligatoire.'); return; }
    const out = { ...it };
    if (out.kind === 'heading') delete out.ref;
    for (const k of ['icon', 'audience', 'devices', 'newTab']) if (!out[k] || out[k] === 'all') delete out[k];
    if (out.label) { out.label = Object.fromEntries(Object.entries(out.label).map(([l, v]) => [l, String(v || '').trim()]).filter(([, v]) => v)); if (!Object.keys(out.label).length) delete out.label; }
    onSave(out);
  };
  return (
    <form className="card mn-form" onSubmit={submit}>
      <h3>{initial ? 'Modifier l’élément' : isChild ? 'Nouvel élément du sous-menu' : 'Nouvel élément'}</h3>
      <div className="form-grid">
        <label>Type<select value={it.kind} onChange={(e) => changeKind(e.target.value)}>{spec.kinds.filter(([k]) => allowed.includes(k)).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        {it.kind === 'builtin' && <label>Lien d’origine<select value={it.ref} onChange={(e) => set({ ref: e.target.value })}><option value="">— choisir —</option>{spec.builtinAll.map((k) => <option key={k} value={k}>{BUILTIN_LABEL[k] || k}</option>)}</select></label>}
        {it.kind === 'url' && <label>Adresse<input value={it.ref} maxLength={500} placeholder="/catalogue  ou  https://exemple.org" onChange={(e) => set({ ref: e.target.value.trim() })} /></label>}
        {it.kind === 'appscreen' && <label>Écran de l’application<select value={it.ref} onChange={(e) => set({ ref: e.target.value })}><option value="">— choisir —</option>{spec.appScreens.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>}
      </div>
      {lookupKind && (
        <div className="mn-find">
          <label>Chercher {{ talk: 'une conférence', series: 'une série', collection: 'une collection', channel: 'une chaîne', page: 'une page' }[lookupKind]}<input value={q} placeholder="Tapez quelques lettres…" onChange={(e) => setQ(e.target.value)} /></label>
          {it.ref && <p className="meta ok">Choisi : <code>{it.ref}</code></p>}
          <ul className="mn-found">
            {found.map((f) => <li key={f.ref}><button type="button" className={`btn ghost${it.ref === f.ref ? ' on' : ''}`} onClick={() => set({ ref: f.ref, label: it.label?.fr ? it.label : {} })}>{f.label}{f.sub ? <small> · {f.sub}</small> : null}</button></li>)}
            {!found.length && <li className="meta">Aucun résultat.</li>}
          </ul>
          <p className="meta small">Laissez le texte vide pour reprendre automatiquement le titre du contenu. Si le contenu est supprimé ou dépublié, le lien disparaît tout seul du site.</p>
        </div>
      )}
      <fieldset className="xp-var"><legend>Texte affiché{it.kind === 'url' || it.kind === 'heading' ? ' (français obligatoire)' : ' (facultatif)'}</legend>
        <div className="form-grid">{LANGS.map(([l, n]) => <label key={l}>{n}<input value={it.label?.[l] || ''} maxLength={60} dir={l === 'ar' ? 'rtl' : undefined} onChange={(e) => setLabel(l, e.target.value)} /></label>)}</div>
      </fieldset>
      <div className="form-grid">
        <label>Public<select value={it.audience || 'all'} onChange={(e) => set({ audience: e.target.value })}>{NAV_AUDIENCES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Icône (menu latéral et ☰)<select value={it.icon || ''} onChange={(e) => set({ icon: e.target.value })}><option value="">Par défaut</option>{NAV_ICONS.map((k) => <option key={k} value={k}>{NAV_ICON_LABELS[k]}</option>)}</select></label>
      </div>
      <div className="mn-checks">
        <span>Afficher sur :</span>{DEVICES.map(([d, n]) => <label key={d} className="mn-check"><input type="checkbox" checked={devices.includes(d)} onChange={() => toggleDevice(d)} />{n}</label>)}
        {it.kind === 'url' && <label className="mn-check"><input type="checkbox" checked={Boolean(it.newTab)} onChange={(e) => set({ newTab: e.target.checked })} />Ouvrir dans un nouvel onglet</label>}
        <label className="mn-check"><input type="checkbox" checked={Boolean(it.hidden)} onChange={(e) => set({ hidden: e.target.checked })} />Masqué (gardé dans le menu, non affiché)</label>
      </div>
      <p className="meta small">Le public et les appareils règlent l’affichage seulement : ce n’est pas une protection d’accès (les pages réservées restent protégées par leurs propres règles).{canHaveChildren ? '' : ''}</p>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="studio-tools"><button className="btn">{initial ? 'Valider' : 'Ajouter'}</button><button type="button" className="btn ghost" onClick={onCancel}>Annuler</button></div>
    </form>
  );
}

// Éditeur d'un menu : arbre à un niveau de sous-menus, enregistré d'un bloc.
function Editor({ menu, spec, assigned, onClose, onSaved }) {
  const { call } = useApp();
  const [items, setItems] = useState(() => clone(menu.items));
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState(null); // { at: [i] | [i, j] | null, parent: i | null }
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  // Types permis : l'intersection de ce qu'acceptent les emplacements où ce menu est affecté (tous, s'il n'est affecté nulle part).
  const locs = assigned.length ? assigned : Object.keys(spec.locations);
  const anyApp = locs.some((l) => l.startsWith('app_'));
  const anyWeb = locs.some((l) => l.startsWith('web_'));
  const allowedKinds = spec.kinds.map(([k]) => k).filter((k) => (k !== 'builtin' || anyWeb) && (k !== 'appscreen' || anyApp || !assigned.length));
  const canChildren = locs.every((l) => spec.locations[l].children);
  const mutate = (fn) => { setItems((cur) => { const n = clone(cur); fn(n); return n; }); setDirty(true); setOk(''); };
  const move = (path, d) => mutate((n) => { const list = path.length === 1 ? n : n[path[0]].children; const i = path[path.length - 1]; const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; });
  const remove = (path) => { if (!window.confirm('Retirer cet élément du menu ?')) return; mutate((n) => { if (path.length === 1) n.splice(path[0], 1); else { n[path[0]].children.splice(path[1], 1); if (!n[path[0]].children.length) delete n[path[0]].children; } }); };
  const saveItem = (out) => {
    mutate((n) => {
      if (form.at) { if (form.at.length === 1) n[form.at[0]] = { ...out, ...(n[form.at[0]].children ? { children: n[form.at[0]].children } : {}) }; else n[form.at[0]].children[form.at[1]] = out; }
      else if (form.parent != null) { n[form.parent].children = [...(n[form.parent].children || []), out]; }
      else n.push(out);
    });
    setForm(null);
  };
  const save = async () => {
    setErr(''); setOk(''); setBusy(true);
    const r = await call(`/admin/menus/${menu.id}`, { method: 'PATCH', body: JSON.stringify({ items }) });
    setBusy(false);
    if (r.ok) { setDirty(false); setOk('Menu enregistré. Le site le reprend en quelques secondes.'); onSaved(); } else setErr(r.data?.error || 'Enregistrement impossible.');
  };
  const close = () => { if (!dirty || window.confirm('Quitter sans enregistrer vos changements ?')) onClose(); };
  const editing = form?.at ? (form.at.length === 1 ? items[form.at[0]] : items[form.at[0]].children[form.at[1]]) : null;
  const childKinds = allowedKinds.filter((k) => k !== 'heading');
  const row = (it, path) => {
    const s = summary(it, spec);
    const list = path.length === 1 ? items : items[path[0]].children;
    const i = path[path.length - 1];
    return (
      <li key={it.id} className={`mn-row${path.length > 1 ? ' mn-child' : ''}${it.hidden ? ' mn-off' : ''}`}>
        <span className="mn-kind" aria-hidden="true">{KIND_ICON[it.kind]}</span>
        <span className="mn-txt"><b>{s.title}</b>{it.hidden ? ' (masqué)' : ''}<small>{s.sub}{it.audience ? ` · ${NAV_AUDIENCES.find(([k]) => k === it.audience)?.[1]}` : ''}{it.devices ? ` · ${it.devices.map((d) => DEVICES.find(([k]) => k === d)[1]).join(', ')}` : ''}</small></span>
        <span className="mn-acts">
          <button type="button" className="btn ghost" onClick={() => move(path, -1)} disabled={i === 0} aria-label="Monter">↑</button>
          <button type="button" className="btn ghost" onClick={() => move(path, 1)} disabled={i === list.length - 1} aria-label="Descendre">↓</button>
          <button type="button" className="btn ghost" onClick={() => setForm({ at: path })}>Modifier</button>
          {path.length === 1 && canChildren && <button type="button" className="btn ghost" onClick={() => setForm({ at: null, parent: path[0] })}>+ Sous-élément</button>}
          <button type="button" className="btn ghost danger" onClick={() => remove(path)}>Retirer</button>
        </span>
      </li>
    );
  };
  return (
    <section className="card mn-editor">
      <div className="adm-row adm-between"><h2>Menu « {menu.name} »</h2><button type="button" className="btn ghost" onClick={close}>Fermer</button></div>
      <p className="meta">{assigned.length ? `Affecté à : ${assigned.map((l) => spec.locations[l].label).join(' ; ')}.` : 'Pas encore affecté : choisissez son emplacement plus haut pour qu’il s’affiche.'} {canChildren ? 'Un élément peut contenir un sous-menu déroulant (un seul niveau).' : 'Cet emplacement n’accepte pas de sous-menus.'}</p>
      {!items.length && <p className="meta">Menu vide : ajoutez un premier élément.</p>}
      <ul className="mn-list">{items.map((it, i) => <li key={it.id} className="mn-item"><ul className="mn-list">{row(it, [i])}{(it.children || []).map((c, j) => row(c, [i, j]))}</ul></li>)}</ul>
      {form
        ? <ItemForm key={form.at ? form.at.join('-') : `new-${form.parent}`} initial={editing} spec={{ ...spec, builtinAll: [...new Set(Object.values(spec.locations).flatMap((l) => l.builtin))] }} allowed={form.parent != null || form.at?.length === 2 ? childKinds : allowedKinds} isChild={form.parent != null || form.at?.length === 2} canHaveChildren={canChildren} onSave={saveItem} onCancel={() => setForm(null)} />
        : <button type="button" className="btn ghost" onClick={() => setForm({ at: null, parent: null })}>+ Ajouter un élément</button>}
      {err && <p className="error" role="alert">{err}</p>}
      {ok && <p className="meta ok" role="status">{ok}</p>}
      <div className="studio-tools"><button type="button" className="btn" disabled={busy || !dirty} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer le menu'}</button>{dirty && <small className="meta">Modifications non enregistrées</small>}</div>
    </section>
  );
}

export default function MenusAdmin() {
  const { call } = useApp();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [edit, setEdit] = useState(null); // id du menu ouvert
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const load = useCallback(() => call('/admin/menus').then((r) => setData(r.ok ? r.data : { error: r.data?.error || 'Chargement impossible.' })), [call]);
  useEffect(() => { load(); }, [load]);
  const byId = useMemo(() => new Map((data?.menus || []).map((m) => [m.id, m])), [data]);
  if (!data) return <p className="meta">Chargement…</p>;
  if (data.error) return <p className="error">{data.error}</p>;
  const { spec } = data;
  const assignedTo = (id) => Object.entries(data.locations).filter(([, v]) => v === id).map(([k]) => k);
  const flash = (ok, text) => setMsg({ ok, text });
  const assign = async (loc, id) => {
    const r = await call('/admin/menus/locations', { method: 'PUT', body: JSON.stringify({ [loc]: id || null }) });
    if (r.ok) flash(true, id ? `« ${byId.get(id).name} » s’affiche maintenant à l’emplacement « ${spec.locations[loc].label} ».` : `L’emplacement « ${spec.locations[loc].label} » reprend le menu d’origine du site.`);
    else flash(false, r.data?.error || 'Affectation impossible.');
    load();
  };
  const create = async (e) => {
    e.preventDefault();
    const r = await call('/admin/menus', { method: 'POST', body: JSON.stringify({ name, ...(from ? { from } : {}) }) });
    if (r.ok) { setCreating(false); setName(''); setFrom(''); flash(true, 'Menu créé.'); await load(); setEdit(r.data.id); } else flash(false, r.data?.error || 'Création impossible.');
  };
  const rename = async (m) => {
    const n = window.prompt('Nouveau nom du menu', m.name);
    if (!n || n.trim() === m.name) return;
    const r = await call(`/admin/menus/${m.id}`, { method: 'PATCH', body: JSON.stringify({ name: n.trim() }) });
    flash(r.ok, r.ok ? 'Menu renommé.' : r.data?.error || 'Renommage impossible.'); load();
  };
  const duplicate = async (m) => {
    const r = await call('/admin/menus', { method: 'POST', body: JSON.stringify({ name: `${m.name} (copie)`.slice(0, 80), from: `copy:${m.id}` }) });
    flash(r.ok, r.ok ? 'Menu copié.' : r.data?.error || 'Copie impossible.'); load();
  };
  const del = async (m) => {
    const where = assignedTo(m.id).map((l) => spec.locations[l].label);
    if (!window.confirm(`Supprimer le menu « ${m.name} » ?${where.length ? ` Il est affecté à : ${where.join(' ; ')} — ces emplacements reprendront le menu d’origine du site.` : ''}`)) return;
    const r = await call(`/admin/menus/${m.id}`, { method: 'DELETE' });
    if (edit === m.id) setEdit(null);
    flash(r.ok, r.ok ? 'Menu supprimé.' : r.data?.error || 'Suppression impossible.'); load();
  };
  const opened = edit ? byId.get(edit) : null;
  return (
    <section className="mn-admin">
      <p className="meta">Créez vos menus, puis choisissez où ils s’affichent. Un emplacement sans menu choisi garde le <b>menu d’origine</b> du site (rien ne change tant que vous n’affectez rien). Réservé aux administrateurs.</p>
      {msg && <p className={msg.ok ? 'meta ok' : 'error'} role="status">{msg.text}</p>}

      <h2>Emplacements</h2>
      <ul className="mn-locs">
        {Object.entries(spec.locations).map(([k, l]) => (
          <li key={k} className="card mn-loc">
            <label><b>{l.label}</b>
              <select value={data.locations[k] || ''} onChange={(e) => assign(k, e.target.value)}>
                <option value="">Menu d’origine du site</option>
                {data.menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <small className="meta">{l.hint}</small>
          </li>
        ))}
      </ul>

      <h2>Mes menus</h2>
      {creating
        ? (
          <form className="card mn-form" onSubmit={create}>
            <h3>Nouveau menu</h3>
            <div className="form-grid">
              <label>Nom<input required maxLength={80} value={name} placeholder="Ex. Menu d’été" onChange={(e) => setName(e.target.value)} /></label>
              <label>Point de départ
                <select value={from} onChange={(e) => setFrom(e.target.value)}>
                  <option value="">Menu vide</option>
                  {Object.entries(spec.locations).filter(([k]) => !k.startsWith('app_')).map(([k, l]) => <option key={k} value={`current:${k}`}>Comme le menu actuel : {l.label}</option>)}
                  {data.menus.map((m) => <option key={m.id} value={`copy:${m.id}`}>Copie de « {m.name} »</option>)}
                </select>
              </label>
            </div>
            <div className="studio-tools"><button className="btn">Créer</button><button type="button" className="btn ghost" onClick={() => setCreating(false)}>Annuler</button></div>
          </form>
        )
        : <button type="button" className="btn" onClick={() => { setMsg(null); setCreating(true); }}>Nouveau menu</button>}
      {!data.menus.length && !creating && <p className="meta">Aucun menu pour l’instant.</p>}
      <ul className="xp-list">
        {data.menus.map((m) => {
          const where = assignedTo(m.id);
          return (
            <li key={m.id} className="card xp-item">
              <div className="adm-row adm-between"><b>{m.name}</b><small className="meta">{m.items.length} élément{m.items.length > 1 ? 's' : ''}</small></div>
              <small className="meta">{where.length ? `Affiché : ${where.map((l) => spec.locations[l].label).join(' ; ')}` : 'Pas affecté'}</small>
              <div className="studio-tools">
                <button type="button" className="btn ghost" onClick={() => setEdit(edit === m.id ? null : m.id)}>{edit === m.id ? 'Fermer' : 'Modifier les éléments'}</button>
                <button type="button" className="btn ghost" onClick={() => rename(m)}>Renommer</button>
                <button type="button" className="btn ghost" onClick={() => duplicate(m)}>Dupliquer</button>
                <button type="button" className="btn ghost danger" onClick={() => del(m)}>Supprimer</button>
              </div>
              {opened?.id === m.id && <Editor key={m.id} menu={m} spec={spec} assigned={where} onClose={() => setEdit(null)} onSaved={load} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
