'use client';
// Étape 19 — Collections éditoriales (modérateurs et administrateurs) : créer, ordonner, publier. Écran interne, en français.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../../components/Providers';
import StudioTabs from '../../../../components/StudioTabs';

const KINDS = { cycle: 'Cycle', speaker: "Série d'un intervenant", theme: 'Thème du moment' };
// Phase 6 (cahier du 20/11, § 11) : une collection est manuelle, automatique (règles), saisonnière ou personnelle.
const MODES = { manual: 'Manuelle (liste choisie à la main)', auto: 'Automatique (règles)', seasonal: 'Saisonnière (selon la saison)', personal: 'Personnalisée (propre à chaque membre)' };
const MODE_SHORT = { manual: 'manuelle', auto: 'automatique', seasonal: 'saisonnière', personal: 'personnalisée' };
const SEASONS = { ramadan: 'Ramadan', hajj: 'Hajj', mawlid: 'Mawlid', ashura: 'Achoura', eid_fitr: 'Aïd el-Fitr', rajab: 'Rajab' };
const PERSONAL = { continue: 'Continuer à regarder', path: 'Reprendre mon parcours (prochains épisodes)', foryou: 'Recommandations (selon favoris et « plus tard »)', later: 'À regarder plus tard' };
const LEVELS = { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé' };
const SORTS = { recent: 'Plus récentes', alpha: 'Ordre alphabétique', shortest: 'Plus courtes', longest: 'Plus longues' };

// Règles d'une collection automatique ou saisonnière ; « personnelle » : un seul choix (le type).
function RuleForm({ c, setC, cats }) {
  const rule = c.rule || {};
  const put = (k, v) => { const r = { ...rule }; if (v === '' || v === undefined || v === null || v === false) delete r[k]; else r[k] = v; setC({ ...c, rule: r }); };
  const num = (k) => (e) => put(k, e.target.value === '' ? '' : Number(e.target.value));
  if (c.mode === 'personal') {
    const kids = c.catalogue === 'kids';
    return (
      <label className="fld"><span>Type de collection personnelle</span>
        <select value={rule.type || ''} onChange={(e) => setC({ ...c, rule: { ...rule, type: e.target.value || undefined } })}>
          <option value="">— choisir —</option>
          {Object.entries(PERSONAL).filter(([k]) => !kids || k === 'continue').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
    );
  }
  if (c.mode === 'manual') return null;
  return (
    <fieldset className="co-rule">
      <legend>Règles (toutes facultatives ; elles se cumulent)</legend>
      <label className="fld"><span>Catégorie (les sous-catégories comptent)</span>
        <select value={rule.category || ''} onChange={(e) => put('category', e.target.value)}>
          <option value="">— toutes —</option>
          {cats.map((x) => <option key={x.id} value={x.slug || ''} disabled={!x.slug}>{x.depth ? '— ' : ''}{x.fullName || x.name}</option>)}
        </select>
      </label>
      <label className="fld"><span>Intervenant (nom exact)</span><input value={rule.speaker || ''} maxLength={120} onChange={(e) => put('speaker', e.target.value)} /></label>
      <label className="fld"><span>Niveau</span><select value={rule.level || ''} onChange={(e) => put('level', e.target.value)}><option value="">— tous —</option>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="fld"><span>Langue (fr, en, ar…)</span><input value={rule.language || ''} maxLength={3} onChange={(e) => put('language', e.target.value.toLowerCase())} /></label>
      <label className="fld"><span>Durée minimale (minutes)</span><input type="number" min="0" max="1440" value={rule.minSeconds != null ? Math.round(rule.minSeconds / 60) : ''} onChange={(e) => put('minSeconds', e.target.value === '' ? '' : Number(e.target.value) * 60)} /></label>
      <label className="fld"><span>Durée maximale (minutes)</span><input type="number" min="1" max="1440" value={rule.maxSeconds != null ? Math.round(rule.maxSeconds / 60) : ''} onChange={(e) => put('maxSeconds', e.target.value === '' ? '' : Number(e.target.value) * 60)} /></label>
      <label className="rv-email"><input type="checkbox" checked={Boolean(rule.featured)} onChange={(e) => put('featured', e.target.checked)} /> <span>Seulement les vidéos « à la une »</span></label>
      <label className="rv-email"><input type="checkbox" checked={Boolean(rule.withQuiz)} onChange={(e) => put('withQuiz', e.target.checked)} /> <span>Seulement les vidéos avec un quiz</span></label>
      <label className="fld"><span>Ordre</span><select value={rule.sort || 'recent'} onChange={(e) => put('sort', e.target.value === 'recent' ? '' : e.target.value)}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="fld"><span>Nombre de vidéos (1 à 50)</span><input type="number" min="1" max="50" value={rule.limit || ''} placeholder="12" onChange={num('limit')} /></label>
      {c.mode === 'seasonal' && <p className="meta small">Sans aucune règle, la collection saisonnière montre la liste choisie à la main ci-dessous.</p>}
    </fieldset>
  );
}


function Editor({ id, call, onChanged, onClose }) {
  const [c, setC] = useState(null);
  const [talks, setTalks] = useState([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [msg, setMsg] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [cats, setCats] = useState([]);
  const [pv, setPv] = useState(null);
  const load = useCallback(async () => { const r = await call(`/studio/collections/${id}`); if (r.ok) { setC(r.data); setTalks(r.data.talks); setDirty(false); } }, [call, id]);
  useEffect(() => { load(); }, [load]);
  const catalogue = c?.catalogue;
  useEffect(() => { if (catalogue) call(`/categories?catalogue=${catalogue}`, {}, null).then((r) => setCats(r.ok ? r.data : [])); }, [call, catalogue]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return undefined; }
    const h = setTimeout(async () => { const r = await call(`/talks?q=${encodeURIComponent(q.trim())}&limit=12`, {}, null); if (r.ok) setHits(r.data); }, 300);
    return () => clearTimeout(h);
  }, [q, call]);
  if (!c) return <p className="meta">…</p>;
  const set = (k) => (e) => setC({ ...c, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const saveInfo = async () => {
    const r = await call(`/studio/collections/${id}`, { method: 'PATCH', body: JSON.stringify({ title: c.title, description: c.description, kind: c.kind, published: c.published, pinned: c.pinned, mode: c.mode, catalogue: c.catalogue, rule: c.rule || {}, season: c.mode === 'seasonal' ? c.season : null, onHome: Boolean(c.onHome), homeOrder: Number(c.homeOrder) || 0 }) });
    setMsg(r.ok ? { ok: true, text: 'Enregistré' } : { ok: false, text: r.data?.error || 'Erreur' }); if (r.ok) onChanged();
  };
  const preview = async () => {
    const r = await call('/studio/collections/preview', { method: 'POST', body: JSON.stringify({ id, mode: c.mode, catalogue: c.catalogue, rule: c.rule || {}, season: c.mode === 'seasonal' ? c.season : null }) });
    setPv(r.ok ? r.data : { error: r.data?.error || 'Erreur' });
  };
  const saveItems = async () => {
    const r = await call(`/studio/collections/${id}/items`, { method: 'PUT', body: JSON.stringify({ talkIds: talks.map((x) => x.id) }) });
    setMsg(r.ok ? { ok: true, text: `Vidéos enregistrées (${r.data.count})` } : { ok: false, text: r.data?.error || 'Erreur' }); if (r.ok) { setDirty(false); onChanged(); }
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
      <label className="fld"><span>Fonctionnement</span><select value={c.mode} onChange={(e) => { setC({ ...c, mode: e.target.value, rule: {}, season: null }); setPv(null); }}>{Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="fld"><span>Catalogue</span><select value={c.catalogue} onChange={(e) => { setC({ ...c, catalogue: e.target.value, rule: {} }); setPv(null); }}><option value="adult">Adultes</option><option value="kids">Mejliss TV Kids</option></select></label>
      {c.mode === 'seasonal' && <label className="fld"><span>Saison</span><select value={c.season || ''} onChange={(e) => setC({ ...c, season: e.target.value || null })}><option value="">— choisir —</option>{Object.entries(SEASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
      <RuleForm c={c} setC={setC} cats={cats} />
      {c.mode !== 'manual' && <div className="panel-actions"><button type="button" className="btn ghost" onClick={preview}>Voir ce que la collection afficherait</button></div>}
      {pv && (pv.error ? <p className="error" role="alert">{pv.error}</p> : (
        <div className="co-preview" role="status"><b>{pv.count} vidéo(s)</b>{c.mode === 'personal' && <small className="muted"> (exemple avec votre compte)</small>}
          <ol>{pv.talks.map((x) => <li key={x.id}>{x.title}<small className="muted"> · {x.speaker}</small></li>)}</ol></div>))}
      <label className="rv-email"><input type="checkbox" checked={Boolean(c.onHome)} onChange={set('onHome')} /> <span>Afficher en rangée sur l'accueil</span></label>
      {c.onHome && <label className="fld"><span>Place sur l'accueil (petit nombre = plus haut)</span><input type="number" min="0" max="999" value={c.homeOrder ?? 100} onChange={set('homeOrder')} /></label>}
      <label className="rv-email"><input type="checkbox" checked={c.published} onChange={set('published')} /> <span>Publiée (visible sur le site, au moins une vidéo visible)</span></label>
      <label className="rv-email"><input type="checkbox" checked={c.pinned} onChange={set('pinned')} /> <span>Épinglée en tête de la liste</span></label>
      <div className="panel-actions"><button type="button" className="btn" onClick={saveInfo}>Enregistrer les informations</button></div>

      <h3>{c.mode === 'manual' || c.mode === 'seasonal' ? 'Vidéos' : 'Vidéos choisies à la main (ignorées tant que des règles existent)'} ({talks.length}/{c.max})</h3>
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
      <label className="fld"><span>Ajouter une vidéo (recherche par titre, intervenant ou texte)</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Au moins 2 lettres…" /></label>
      {hits.length > 0 && (
        <ul className="co-hits">
          {hits.map((x) => <li key={x.id}><span>{x.title}<small className="muted"> · {x.speaker}</small></span><button type="button" className="btn ghost" disabled={talks.some((y) => y.id === x.id)} onClick={() => add(x)}>{talks.some((y) => y.id === x.id) ? 'Déjà ajoutée' : 'Ajouter'}</button></li>)}
        </ul>
      )}
      <div className="panel-actions">
        <button type="button" className="btn" disabled={!dirty} onClick={saveItems}>Enregistrer les vidéos</button>
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
      <StudioTabs group="contents" />
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
              <span className="meta small">{MODE_SHORT[c.mode] || 'manuelle'}{c.catalogue === 'kids' ? ' · Kids' : ''}{c.season ? ` · ${SEASONS[c.season] || c.season}` : ''} · {c.mode === 'manual' ? `${c.items} vidéo(s) · ` : ''}{c.published ? 'publiée' : 'brouillon'}{c.onHome ? ' · accueil' : ''}{c.pinned ? ' · épinglée' : ''}</span>
            </button>
            {sel === c.id && <Editor id={c.id} call={call} onChanged={load} onClose={() => setSel(null)} />}
          </li>
        ))}
      </ul>
    </main>
  );
}
