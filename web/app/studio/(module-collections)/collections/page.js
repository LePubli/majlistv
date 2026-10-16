'use client';
// Étape 19 — Collections éditoriales (modérateurs et administrateurs) : créer, ordonner, publier. Écran interne, en français.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../../components/Providers';

const KINDS = { cycle: 'Cycle', speaker: "Série d'un intervenant", theme: 'Thème du moment' };

function Editor({ id, call, onChanged, onClose }) {
  const [c, setC] = useState(null);
  const [talks, setTalks] = useState([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [msg, setMsg] = useState(null);
  const [dirty, setDirty] = useState(false);
  const load = useCallback(async () => { const r = await call(`/studio/collections/${id}`); if (r.ok) { setC(r.data); setTalks(r.data.talks); setDirty(false); } }, [call, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return undefined; }
    const h = setTimeout(async () => { const r = await call(`/talks?q=${encodeURIComponent(q.trim())}&limit=12`, {}, null); if (r.ok) setHits(r.data); }, 300);
    return () => clearTimeout(h);
  }, [q, call]);
  if (!c) return <p className="meta">…</p>;
  const set = (k) => (e) => setC({ ...c, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const saveInfo = async () => {
    const r = await call(`/studio/collections/${id}`, { method: 'PATCH', body: JSON.stringify({ title: c.title, description: c.description, kind: c.kind, published: c.published, pinned: c.pinned }) });
    setMsg(r.ok ? { ok: true, text: 'Enregistré' } : { ok: false, text: r.data?.error || 'Erreur' }); if (r.ok) onChanged();
  };
  const saveItems = async () => {
    const r = await call(`/studio/collections/${id}/items`, { method: 'PUT', body: JSON.stringify({ talkIds: talks.map((x) => x.id) }) });
    setMsg(r.ok ? { ok: true, text: `Conférences enregistrées (${r.data.count})` } : { ok: false, text: r.data?.error || 'Erreur' }); if (r.ok) { setDirty(false); onChanged(); }
  };
  const move = (i, d) => { const a = [...talks]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setTalks(a); setDirty(true); };
  const add = (x) => { if (talks.some((y) => y.id === x.id) || talks.length >= c.max) return; setTalks([...talks, { ...x, visible: true }]); setDirty(true); };
  const remove = async () => { if (!window.confirm('Supprimer cette collection ?')) return; const r = await call(`/studio/collections/${id}`, { method: 'DELETE' }); if (r.ok) { onChanged(); onClose(); } };
  return (
    <section className="panel co-editor">
      <h2 className="panel-title">{c.title}</h2>
      <label className="fld"><span>Titre</span><input value={c.title} maxLength={120} onChange={set('title')} /></label>
      <label className="fld"><span>Présentation</span><textarea rows={3} maxLength={1000} value={c.description} onChange={set('description')} /></label>
      <label className="fld"><span>Type</span><select value={c.kind} onChange={set('kind')}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="rv-email"><input type="checkbox" checked={c.published} onChange={set('published')} /> <span>Publiée (visible sur le site, au moins une conférence visible)</span></label>
      <label className="rv-email"><input type="checkbox" checked={c.pinned} onChange={set('pinned')} /> <span>Épinglée en tête de la liste</span></label>
      <div className="panel-actions"><button type="button" className="btn" onClick={saveInfo}>Enregistrer les informations</button></div>

      <h3>Conférences ({talks.length}/{c.max})</h3>
      <ol className="co-items">
        {talks.map((x, i) => (
          <li key={x.id}>
            <span className="co-title">{x.title}{x.visible === false && <small className="muted"> — pas encore visible du public</small>}<small className="muted"> · {x.speaker}</small></span>
            <span className="co-btns">
              <button type="button" className="btn ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">↑</button>
              <button type="button" className="btn ghost" disabled={i === talks.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">↓</button>
              <button type="button" className="btn ghost" onClick={() => { setTalks(talks.filter((y) => y.id !== x.id)); setDirty(true); }} aria-label="Retirer">×</button>
            </span>
          </li>
        ))}
      </ol>
      <label className="fld"><span>Ajouter une conférence (recherche par titre, intervenant ou texte)</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Au moins 2 lettres…" /></label>
      {hits.length > 0 && (
        <ul className="co-hits">
          {hits.map((x) => <li key={x.id}><span>{x.title}<small className="muted"> · {x.speaker}</small></span><button type="button" className="btn ghost" disabled={talks.some((y) => y.id === x.id)} onClick={() => add(x)}>{talks.some((y) => y.id === x.id) ? 'Déjà ajoutée' : 'Ajouter'}</button></li>)}
        </ul>
      )}
      <div className="panel-actions">
        <button type="button" className="btn" disabled={!dirty} onClick={saveItems}>Enregistrer les conférences</button>
        <button type="button" className="btn ghost" onClick={onClose}>Fermer</button>
        <button type="button" className="link u small" onClick={remove}>Supprimer la collection</button>
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
    </section>
  );
}

export default function StudioCollections() {
  const { call, user, ready } = useApp();
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState(null);
  const staff = user && ['moderator', 'admin'].includes(user.role);
  const load = useCallback(async () => { const r = await call('/studio/collections'); if (r.ok) setList(r.data); }, [call]);
  useEffect(() => { if (staff) load(); }, [staff, load]);
  if (!ready || !user) return null;
  if (!staff) return <main className="studio-page"><p>Cette page est réservée à l'équipe.</p></main>;
  const create = async (e) => {
    e.preventDefault(); setErr(null);
    const r = await call('/studio/collections', { method: 'POST', body: JSON.stringify({ title }) });
    if (!r.ok) { setErr(r.data?.error || 'Titre : 3 caractères au moins'); return; }
    setTitle(''); await load(); setSel(r.data.id);
  };
  return (
    <main className="studio-page studio-narrow">
      <h1 className="studio-title">Collections</h1>
      <p className="meta">Des sélections éditoriales : cycles, séries d'un intervenant, thèmes du moment. <Link href="/collections" className="link u" target="_blank">Voir la page publique</Link></p>
      <form className="ls-new" onSubmit={create}>
        <label className="fld"><span>Nouvelle collection</span><input value={title} maxLength={120} placeholder="Ex. Le mois de Ramadan" onChange={(e) => setTitle(e.target.value)} /></label>
        <button className="btn" disabled={title.trim().length < 3}>Créer</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {list && list.length === 0 && <p className="meta">Aucune collection pour l'instant.</p>}
      <ul className="co-list">
        {(list || []).map((c) => (
          <li key={c.id}>
            <button type="button" className={sel === c.id ? 'co-row on' : 'co-row'} onClick={() => setSel(sel === c.id ? null : c.id)} aria-expanded={sel === c.id}>
              <b>{c.title}</b>
              <span className="meta small">{KINDS[c.kind]} · {c.items} conférence(s) · {c.published ? 'publiée' : 'brouillon'}{c.pinned ? ' · épinglée' : ''}</span>
            </button>
            {sel === c.id && <Editor id={c.id} call={call} onChanged={load} onClose={() => setSel(null)} />}
          </li>
        ))}
      </ul>
    </main>
  );
}
