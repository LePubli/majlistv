'use client';
// Étape 19 — Collections éditoriales (modérateurs et administrateurs) : créer, ordonner, publier. Écran interne, en français.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../../components/Providers';
import StudioTabs from '../../../../components/StudioTabs';
import SortableList, { moveItem, byTitle } from '../../../../components/SortableList';
import ImageSlot from '../../../../components/ImageSlot';
import { Page as BmPage, Btn as BmBtn, Badge as BmBadge, Metrics as BmMetrics, Panel as BmPanel, Cols as BmCols, SelectList as BmSelectList, c as bmc } from '../../../../components/backoffice/Kit';

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


function Editor({ id, call, onChanged, onClose, pm }) {
  const [c, setC] = useState(null);
  const [talks, setTalks] = useState([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [cats, setCats] = useState([]);
  const [pv, setPv] = useState(null);
  const load = useCallback(async () => { const r = await call(`/studio/collections/${id}`); if (r.ok) { setC(r.data); setTalks(r.data.talks); setDirty(false); } }, [call, id]);
  useEffect(() => { load(); }, [load]);
  const catalogue = c?.catalogue;
  useEffect(() => { if (catalogue) call(`/categories?catalogue=${catalogue}`, {}, null).then((r) => setCats(r.ok ? r.data : [])); }, [call, catalogue]);
  // Recherche : toutes les vidéos (même pas encore visibles), 200 par page, tri « naturel » (Épisode 2 avant Épisode 10).
  useEffect(() => {
    if (q.trim().length < 1) { setHits([]); setTotal(0); return undefined; }
    const h = setTimeout(async () => {
      const r = await call(`/studio/collections-search?q=${encodeURIComponent(q.trim())}`);
      if (r.ok) { setHits([...r.data.items].sort(byTitle)); setTotal(r.data.total); }
    }, 300);
    return () => clearTimeout(h);
  }, [q, call]);
  if (!c) return <p className="meta">…</p>;
  const linked = Boolean(c.seriesId); // collection tenue à jour par une série : titre, images, vidéos et publication viennent de la série
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
  const reorder = (a) => { setTalks(a); setDirty(true); };
  const move = (i, d) => { const j = i + d; if (j >= 0 && j < talks.length) reorder(moveItem(talks, i, j)); };
  const have = new Set(talks.map((y) => y.id));
  const add = (x) => { if (have.has(x.id) || talks.length >= c.max) return; reorder([...talks, { ...x, visible: x.visible !== false }]); };
  const free = hits.filter((x) => !have.has(x.id));
  const addAll = () => {
    const room = c.max - talks.length;
    const take = free.slice(0, Math.max(0, room));
    if (!take.length) return;
    reorder([...talks, ...take.map((x) => ({ ...x, visible: x.visible !== false }))]);
    setMsg({ ok: true, text: `${take.length} vidéo(s) ajoutée(s)${free.length > take.length ? ` — limite de ${c.max} atteinte` : ''}. Pensez à enregistrer les vidéos.` });
  };
  const more = async () => {
    setLoadingMore(true);
    const r = await call(`/studio/collections-search?q=${encodeURIComponent(q.trim())}&offset=${hits.length}`);
    if (r.ok) setHits((h) => [...h, ...r.data.items].sort(byTitle));
    setLoadingMore(false);
  };
  const remove = async () => { if (!window.confirm('Supprimer cette collection ?')) return; const r = await call(`/studio/collections/${id}`, { method: 'DELETE' }); if (r.ok) { onChanged(); onClose(); } };
  const upload = (kind) => async (image) => { const r = await call(`/studio/collections/${id}/${kind}`, { method: 'POST', body: JSON.stringify({ image }) }); if (r.ok) { setC((x) => ({ ...x, [kind === 'poster' ? 'posterUrl' : 'coverUrl']: r.data[kind === 'poster' ? 'posterUrl' : 'coverUrl'] })); onChanged(); return { ok: true }; } return { ok: false, error: r.data?.error }; };
  const unload = (kind) => async () => { const r = await call(`/studio/collections/${id}/${kind}`, { method: 'DELETE' }); if (r.ok) { setC((x) => ({ ...x, [kind === 'poster' ? 'posterUrl' : 'coverUrl']: null })); onChanged(); return { ok: true }; } return { ok: false, error: r.data?.error }; };

  const fields = (
    <>
      {linked && (
        <div className="co-linked" role="note">
          Cette collection suit la série <b>« {c.seriesTitle} »</b> : titre, présentation, images, vidéos (dans l'ordre de la série) et publication se règlent dans la série.{' '}
          <Link href={`/studio/series/${c.seriesId}`} className="link u">Ouvrir la série</Link>
        </div>
      )}
      <label className="fld"><span>Titre</span><input value={c.title} maxLength={120} onChange={set('title')} disabled={linked} /></label>
      <label className="fld"><span>Présentation</span><textarea rows={3} maxLength={1000} value={c.description} onChange={set('description')} disabled={linked} /></label>
      <ImageSlot kind="poster" title="Image de présentation" help="Vignette de la collection dans les listes (format 16:9, recadrée au centre). JPEG, PNG ou WebP, 2,5 Mo max." url={c.posterUrl}
        onUpload={upload('poster')} onRemove={unload('poster')} disabled={linked} />
      <ImageSlot kind="cover" title="Image de couverture" help="Grand bandeau en haut de la page de la collection (format 21:9, recadrée au centre). Sans couverture, l'affiche d'une vidéo sert de fond." url={c.coverUrl}
        onUpload={upload('cover')} onRemove={unload('cover')} disabled={linked} />
      <label className="fld"><span>Type</span><select value={c.kind} onChange={set('kind')}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="fld"><span>Fonctionnement</span><select value={c.mode} disabled={linked} onChange={(e) => { setC({ ...c, mode: e.target.value, rule: {}, season: null }); setPv(null); }}>{Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="fld"><span>Catalogue</span><select value={c.catalogue} disabled={linked} onChange={(e) => { setC({ ...c, catalogue: e.target.value, rule: {} }); setPv(null); }}><option value="adult">Adultes</option><option value="kids">Mejliss TV Kids</option></select></label>
      {c.mode === 'seasonal' && <label className="fld"><span>Saison</span><select value={c.season || ''} onChange={(e) => setC({ ...c, season: e.target.value || null })}><option value="">— choisir —</option>{Object.entries(SEASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
      <RuleForm c={c} setC={setC} cats={cats} />
      {c.mode !== 'manual' && <div className="panel-actions"><button type="button" className="btn ghost" onClick={preview}>Voir ce que la collection afficherait</button></div>}
      {pv && (pv.error ? <p className="error" role="alert">{pv.error}</p> : (
        <div className="co-preview" role="status"><b>{pv.count} vidéo(s)</b>{c.mode === 'personal' && <small className="muted"> (exemple avec votre compte)</small>}
          <ol>{pv.talks.map((x) => <li key={x.id}>{x.title}<small className="muted"> · {x.speaker}</small></li>)}</ol></div>))}
      <label className="rv-email"><input type="checkbox" checked={Boolean(c.onHome)} onChange={set('onHome')} /> <span>Afficher en rangée sur l'accueil</span></label>
      {c.onHome && <label className="fld"><span>Place sur l'accueil (petit nombre = plus haut)</span><input type="number" min="0" max="999" value={c.homeOrder ?? 100} onChange={set('homeOrder')} /></label>}
      <label className="rv-email"><input type="checkbox" checked={c.published} disabled={linked} onChange={set('published')} /> <span>Publiée (visible sur le site, au moins une vidéo visible)</span></label>
      <label className="rv-email"><input type="checkbox" checked={c.pinned} onChange={set('pinned')} /> <span>Épinglée en tête de la liste</span></label>
      <div className="panel-actions"><button type="button" className="btn" onClick={saveInfo}>Enregistrer les informations</button></div>

      <h3>{c.mode === 'manual' || c.mode === 'seasonal' ? 'Vidéos' : 'Vidéos choisies à la main (ignorées tant que des règles existent)'} ({talks.length}/{c.max})</h3>
      {!linked && talks.length > 1 && (
        <div className="co-bar">
          <span className="meta small">Glissez une ligne par la poignée ⠿ pour la déplacer, ou tapez sa nouvelle place dans la case.</span>
          <button type="button" className="btn ghost" onClick={() => reorder([...talks].sort(byTitle))}>Trier par titre (1, 2, 3… 10)</button>
        </div>
      )}
      <SortableList items={talks} onChange={reorder} disabled={linked} className="co-items"
        render={(x, i, { handle, move: to }) => (
          <>
            {handle}
            <input className="sort-pos" type="number" min="1" max={talks.length} defaultValue={i + 1} key={`${x.id}-${i}`} disabled={linked} aria-label={`Place de « ${x.title} »`}
              onBlur={(e) => { const n = Number(e.target.value); if (n >= 1 && n !== i + 1) to(n - 1); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            <span className="co-title">{x.title}{x.visible === false && <small className="muted"> — pas encore visible du public</small>}<small className="muted"> · {x.speaker}</small></span>
            {!linked && (
              <span className="co-btns">
                <button type="button" className="btn ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">↑</button>
                <button type="button" className="btn ghost" disabled={i === talks.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">↓</button>
                <button type="button" className="btn ghost" onClick={() => reorder(talks.filter((y) => y.id !== x.id))} aria-label="Retirer">×</button>
              </span>
            )}
          </>
        )} />
      {!linked && (
        <>
          <label className="fld"><span>Ajouter des vidéos (recherche par titre ou intervenant — toutes les vidéos, y compris celles pas encore publiées)</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex. Omar" /></label>
          {total > 0 && (
            <div className="co-bar">
              <span className="meta small">{total} résultat(s){hits.length < total ? ` — ${hits.length} affichés` : ''}{free.length < hits.length ? ` · ${hits.length - free.length} déjà dans la collection` : ''}</span>
              <button type="button" className="btn" disabled={!free.length || talks.length >= c.max} onClick={addAll}>Tout ajouter ({free.length})</button>
              {hits.length < total && <button type="button" className="btn ghost" disabled={loadingMore} onClick={more}>{loadingMore ? '…' : `Voir la suite (${total - hits.length})`}</button>}
            </div>
          )}
          {hits.length > 0 && (
            <ul className="co-hits scroll">
              {hits.map((x) => <li key={x.id}><span>{x.title}{x.visible === false && <small className="muted"> — pas encore visible</small>}<small className="muted"> · {x.speaker}</small></span><button type="button" className="btn ghost" disabled={have.has(x.id)} onClick={() => add(x)}>{have.has(x.id) ? 'Déjà ajoutée' : 'Ajouter'}</button></li>)}
            </ul>
          )}
        </>
      )}
      <div className="panel-actions">
        <button type="button" className="btn" disabled={!dirty || linked} onClick={saveItems}>Enregistrer les vidéos</button>
        <button type="button" className="btn ghost" onClick={onClose}>Fermer</button>
        <button type="button" className="link u small" onClick={remove}>Supprimer la collection</button>
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
    </>
  );
  return pm
    ? <BmPanel title={c.title}><div className="bm-form" style={{ padding: '0 18px 18px' }}>{fields}</div></BmPanel>
    : <section className="panel co-editor"><h2 className="panel-title">{c.title}</h2>{fields}</section>;
}

export default function StudioCollections() {
  const { call, user, ready, skin } = useApp();
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
  if (skin === 'premium') {
    const mode = (c) => `${MODE_SHORT[c.mode] || 'manuelle'}${c.seriesId ? ' · série' : ''}${c.catalogue === 'kids' ? ' · Kids' : ''}${c.season ? ` · ${SEASONS[c.season] || c.season}` : ''}`;
    return (
      <main className="studio-page">
        <BmPage title="Collections" sub="Des sélections éditoriales : cycles, séries d'un intervenant, thèmes du moment."
          actions={<BmBtn primary={false} href="/collections">Voir la page publique</BmBtn>}>
          <BmMetrics cols="three" items={list ? [
            { icon: 'layers', label: 'Collections', value: list.length },
            { icon: 'check', tone: 'green', label: 'Publiées', value: list.filter((c) => c.published).length },
            { icon: 'home', label: 'Sur l’accueil', value: list.filter((c) => c.onHome).length },
          ] : []} />
          <StudioTabs group="contents" />
          <BmCols kind="two-main">
            <BmPanel title="Collections" extra={list ? `${list.length}` : ''}>
              <form className={bmc('form')} style={{ padding: '0 14px 12px' }} onSubmit={create}>
                <label className={bmc('field')}><span>Nouvelle collection</span><input value={title} maxLength={120} placeholder="Ex. Le mois de Ramadan" onChange={(e) => setTitle(e.target.value)} /></label>
                <div className={bmc('btn-row')}><button className="btn" disabled={title.trim().length < 3}>Créer</button></div>
              </form>
              {err && <p className="error" role="alert" style={{ padding: '0 14px' }}>{err}</p>}
              <BmSelectList empty="Aucune collection pour l'instant." value={sel} onSelect={(id) => setSel(sel === id ? null : id)}
                items={(list || []).map((c) => ({ id: c.id, title: c.title, sub: mode(c), tail: <BmBadge tone={c.published ? 'green' : 'amber'}>{c.published ? 'Publiée' : 'Brouillon'}</BmBadge> }))} />
            </BmPanel>
            {sel ? <Editor key={sel} id={sel} call={call} onChanged={load} onClose={() => setSel(null)} pm />
              : <BmPanel title="Collection sélectionnée"><p style={{ padding: '0 18px 18px', color: 'var(--muted)' }}>Choisissez une collection à gauche pour la modifier.</p></BmPanel>}
          </BmCols>
        </BmPage>
      </main>
    );
  }
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
