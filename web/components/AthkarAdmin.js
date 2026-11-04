'use client';
// Admin → Adhkar (étape 45D, refonte 45D2) : les dhikr du compteur (formule Apprentissage). Aucun dhikr n'est affiché d'office.
// Chaque dhikr a une référence (source) ; il n'est montré aux membres qu'une fois RELU (validé par une personne qualifiée) ET affiché.
// Écran : bilan, thèmes avec progression, filtres, une carte par dhikr avec deux interrupteurs (Relu / Affiché), fiche d'édition,
// mode relecture (un dhikr à la fois, avec la note de l'assistant), actions en lot, import JSON, restauration des dhikr fournis.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from './Providers';
import { BulkBar, SelectAll, useSelection } from './BulkTools';

const CATS = [['morning', 'Matin'], ['evening', 'Soir'], ['after_prayer', 'Après la prière'], ['sleep', 'Avant de dormir'], ['general', 'À tout moment']];
const THEME_NAMES = {
  matin_soir: 'Matin et soir', apres_priere: 'Après la prière', sommeil: 'Sommeil et réveil', dans_priere: 'Dans la prière', maison: 'Maison et vie quotidienne',
  voyage: 'Voyage', epreuves: 'Épreuves, peur et maladie', deuil: 'Deuil et défunts', nature: 'Nature, jeûne et repas', relations: 'Relations et comportements',
  pardon: 'Glorification, pardon et pèlerinage',
};
const THEMES = Object.keys(THEME_NAMES);
const EMPTY = { category: 'morning', theme: '', textAr: '', translit: '', trFr: '', trEn: '', reference: '', reviewNote: '', target: 1, position: 0, validated: false, enabled: false };
const STATUS = [['', 'Tous'], ['todo', 'À relire'], ['valid', 'Relus, masqués'], ['shown', 'Affichés']];
const PAGE = 40;
const errOf = (r, t) => r.data?.error || (r.data?.details ? r.data.details.map((d) => d.message).join(' ; ') : t('errGeneric'));
const cut = (s, n) => (s && s.length > n ? `${s.slice(0, n)}…` : s || '');

export default function AthkarAdmin() {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [imp, setImp] = useState(null);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const sel = useSelection();
  const [fTheme, setFTheme] = useState(''); const [fSt, setFSt] = useState(''); const [fCat, setFCat] = useState(''); const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [chg, setChg] = useState({ category: '', theme: '', target: '' });
  const [rv, setRv] = useState(null); // mode relecture : { ids: [...], i: 0 }
  const load = useCallback(async () => {
    const r = await call('/admin/athkar');
    if (r.ok) { setD(r.data); setErr(''); } else setErr(r.status === 404 ? 'Cette fonction est coupée (Admin → Fonctions → « Compteur d’adhkar »).' : errOf(r, t));
  }, [call, t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { sel.clear(); setLimit(PAGE); }, [fTheme, fSt, fCat, q, sel.clear]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const stats = useMemo(() => {
    const items = d?.items || [];
    const per = {};
    for (const th of THEMES) per[th] = { total: 0, valid: 0 };
    for (const x of items) { const p = per[x.theme] || (per[x.theme] = { total: 0, valid: 0 }); p.total++; if (x.validated) p.valid++; }
    return { total: items.length, valid: items.filter((x) => x.validated).length, shown: items.filter((x) => x.enabled).length, todo: items.filter((x) => !x.validated).length, per };
  }, [d]);

  const save = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    const { id, reviewedAt, ...rest } = form;
    const body = { ...rest, theme: rest.theme || undefined, target: Number(rest.target) || 1, position: Number(rest.position) || 0 };
    const r = id ? await call(`/admin/athkar/${id}`, { method: 'PUT', body: JSON.stringify(body) }) : await call('/admin/athkar', { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) { setErr(errOf(r, t)); return; }
    setForm(null); setMsg('Enregistré.'); load();
  };
  const del = async (x) => {
    if (!window.confirm('Supprimer ce dhikr et tous les comptes des membres pour ce dhikr ?')) return;
    const r = await call(`/admin/athkar/${x.id}`, { method: 'DELETE' });
    if (r.ok) load(); else setErr(errOf(r, t));
  };
  const runImport = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    let items;
    try { const j = JSON.parse(imp); items = Array.isArray(j) ? j : j.items; } catch { setErr('JSON illisible.'); return; }
    const r = await call('/admin/athkar/import', { method: 'POST', body: JSON.stringify({ items }) });
    if (!r.ok) { setErr(`${errOf(r, t)}${r.data?.errors?.length ? ` — ${r.data.errors.join(' ; ')}` : ''}`); return; }
    setImp(null); setMsg(`${r.data.created} dhikr importés (non relus, non affichés).${r.data.errors.length ? ` Refusés : ${r.data.errors.join(' ; ')}` : ''}`); load();
  };
  // Action sur des dhikr (interrupteur d'une carte, barre d'actions en lot ou bouton de relecture).
  const act = async (ids, action, set0 = {}, quiet = false) => {
    setErr(''); if (!quiet) setMsg(''); setBusy(true);
    const r = await call('/admin/athkar/bulk', { method: 'POST', body: JSON.stringify({ ids, action, set: set0 }) });
    setBusy(false);
    if (!r.ok) { setErr(errOf(r, t)); return false; }
    if (!quiet) setMsg(`${r.data.done} dhikr traité${r.data.done > 1 ? 's' : ''}${r.data.skipped ? ` · ${r.data.skipped} ignoré${r.data.skipped > 1 ? 's' : ''} (pas encore relus : on ne peut pas les afficher)` : ''}.`);
    if (action === 'delete') sel.clear();
    await load();
    return true;
  };
  const bulk = async (action) => {
    const s = {};
    if (action === 'update') { if (chg.category) s.category = chg.category; if (chg.theme) s.theme = chg.theme; if (chg.target) s.target = Number(chg.target); }
    if (await act(sel.ids, action, s)) setChg({ category: '', theme: '', target: '' });
  };
  const restore = async () => {
    if (!window.confirm('Restaurer les dhikr fournis qui manquent ? Ils reviennent non relus et non affichés ; ceux déjà présents ne sont pas dupliqués.')) return;
    setErr(''); setMsg(''); setBusy(true);
    const r = await call('/admin/athkar/restore-provided', { method: 'POST', body: '{}' });
    setBusy(false);
    if (!r.ok) { setErr(errOf(r, t)); return; }
    setMsg(`${r.data.created} dhikr restauré${r.data.created > 1 ? 's' : ''} sur ${r.data.total} fournis (non relus, non affichés).`); load();
  };
  const readFile = (e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => setImp(String(rd.result || '')); rd.readAsText(f); };

  if (err && !d) return <p className="error" role="alert">{err}</p>;
  if (!d) return null;
  const needle = q.trim().toLowerCase();
  const shown = d.items.filter((x) => (!fTheme || x.theme === fTheme) && (!fCat || x.category === fCat)
    && (!fSt || (fSt === 'todo' ? !x.validated : fSt === 'valid' ? x.validated && !x.enabled : x.enabled))
    && (!needle || x.textAr.includes(q.trim()) || x.trFr.toLowerCase().includes(needle) || x.reference.toLowerCase().includes(needle)));
  const editing = form !== null; const importing = imp !== null;

  // ---- Mode relecture
  const rvItems = rv ? rv.ids.map((id) => d.items.find((x) => x.id === id)).filter(Boolean) : [];
  const cur = rv ? rvItems[rv.i] : null;
  const startReview = () => { const ids = shown.filter((x) => !x.validated).map((x) => x.id); if (!ids.length) return; setRv({ ids, i: 0 }); setForm(null); setImp(null); setMsg(''); setErr(''); };
  const nextRv = () => setRv((r) => (r.i + 1 >= r.ids.length ? null : { ...r, i: r.i + 1 }));
  const reviewAct = async (action) => { if (await act([cur.id], action, {}, true)) { setMsg(action === 'publish' ? 'Relu et affiché.' : 'Relu.'); nextRv(); } };

  // Relecture lancée depuis la bannière : tous les dhikr non relus (sans tenir compte du thème choisi).
  const startReviewFromAll = () => {
    const ids = d.items.filter((x) => !x.validated).map((x) => x.id);
    if (ids.length) { setRv({ ids, i: 0 }); setMsg(''); setErr(''); }
  };
  const kpi = (label, value, sub, warn) => (
    <div className={`aa-kpi${warn ? ' warn' : ''}`}><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>
  );

  if (rv && cur && !editing) {
    return (
      <section className="aa">
        <div className="aa-rvhead">
          <button type="button" className="btn ghost" onClick={() => { setRv(null); load(); }}>← Liste des adhkar</button>
          <div className="aa-rvprog"><div><span>Dhikr à relire</span><b>{rv.i + 1} sur {rv.ids.length}</b></div><div className="aa-bar"><span style={{ width: `${((rv.i + 1) / rv.ids.length) * 100}%` }} /></div></div>
        </div>
        {msg && <p className="meta" role="status">✓ {msg}</p>}
        {err && <p className="error" role="alert">{err}</p>}
        <div className="aa-rv">
          <article className="aa-rvcard" aria-label="Dhikr à relire">
            <p className="aa-tags"><span>n° {cur.id}</span><span>Thème : {THEME_NAMES[cur.theme] || cur.theme}</span><span>Moment : {CATS.find(([k]) => k === cur.category)?.[1]}</span><span>Répétitions : {cur.target}</span><span className="aa-tag-warn">À relire</span></p>
            <h3 className="aa-lbl">Texte arabe</h3>
            <p className="aa-ar aa-ar-big" lang="ar" dir="rtl">{cur.textAr}</p>
            <div className="aa-cols">
              <div><h3 className="aa-lbl">Phonétique</h3><p className="aa-ph" dir="ltr">{cur.translit || '—'}</p></div>
              <div><h3 className="aa-lbl">Traduction française</h3><p>{cur.trFr || '—'}</p></div>
            </div>
            <h3 className="aa-lbl">Référence affichée</h3><p>{cur.reference}</p>
          </article>
          <aside className="aa-rvside">
            {cur.reviewNote && <div className="aa-note"><b>Note de l’assistant</b><p>{cur.reviewNote}</p></div>}
            <ul className="aa-checks" aria-label="À contrôler">
              {['Arabe et voyelles', 'Traduction française', 'Référence et rattachement', 'Répétitions et thème'].map((c) => <li key={c}><label><input type="checkbox" /> {c}</label></li>)}
            </ul>
            <div className="aa-help meta small"><p><b>Valider</b> : marque le dhikr comme relu, il reste masqué.</p><p><b>Valider et afficher</b> : relu et visible dans l’application.</p><p><b>Corriger</b> : ouvre la fiche pour modifier le texte.</p><p><b>Passer</b> : garde le dhikr à relire et passe au suivant.</p></div>
          </aside>
        </div>
        <div className="aa-rvbar">
          <div><button type="button" className="btn ghost" disabled={rv.i === 0} onClick={() => setRv({ ...rv, i: rv.i - 1 })}>Précédent</button>{' '}<button type="button" className="btn ghost" onClick={nextRv}>Passer</button></div>
          <div>
            <button type="button" className="btn ghost" onClick={() => setForm({ ...cur })}>Corriger</button>{' '}
            <button type="button" className="btn ghost" disabled={busy} onClick={() => reviewAct('validate')}>Valider</button>{' '}
            <button type="button" className="btn" disabled={busy} onClick={() => reviewAct('publish')}>Valider et afficher</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="aa">
      <header className="aa-head">
        <div><h2>Dhikr du compteur</h2>
          <p className="meta">Compteur quotidien des membres de la formule Apprentissage (onglet « Adhkar » d’Apprendre). Un dhikr n’est montré qu’une fois <b>relu</b> (validé par une personne qualifiée) <b>et affiché</b>.</p></div>
        {!editing && !importing && (
          <div className="aa-actions">
            <button type="button" className="btn" onClick={() => { setForm({ ...EMPTY }); setMsg(''); setErr(''); }}>Ajouter un dhikr</button>
            <button type="button" className="btn ghost" onClick={() => { setImp(''); setMsg(''); setErr(''); }}>Importer (JSON)</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={restore}>Restaurer les dhikr fournis</button>
          </div>
        )}
      </header>

      <div className="aa-kpis">
        {kpi('Dhikr traités', stats.total)}
        {kpi('Relus', `${stats.valid} / ${stats.total}`)}
        {kpi('Affichés aux membres', stats.shown, 'relus et visibles')}
        {kpi('À relire', stats.todo, null, stats.todo > 0)}
      </div>
      {stats.todo > 0 && !editing && !importing && (
        <div className="aa-banner"><p><b>{stats.todo} dhikr à relire.</b> Ils restent masqués tant qu’ils ne sont pas relus.</p><button type="button" className="btn" onClick={startReviewFromAll}>Commencer la relecture</button></div>
      )}
      {msg && <p className="meta" role="status">✓ {msg}</p>}
      {err && <p className="error" role="alert">{err}</p>}

      {editing && (
        <form className="reg-form aa-form" onSubmit={save}>
          <h3>{form.id ? `Modifier le dhikr n° ${form.id}` : 'Nouveau dhikr'}</h3>
          {form.reviewNote && <div className="aa-note"><b>Note de l’assistant</b><p>{form.reviewNote}</p></div>}
          <div className="aa-grid">
            <label>Thème<select value={form.theme} onChange={set('theme')}><option value="">Automatique (selon le moment et le lot)</option>{THEMES.map((k) => <option key={k} value={k}>{THEME_NAMES[k]}</option>)}</select></label>
            <label>Moment<select value={form.category} onChange={set('category')}>{CATS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <label>Nombre de répétitions<input type="number" min="1" max="1000" value={form.target} onChange={set('target')} dir="ltr" /></label>
            <label>Ordre<input type="number" min="0" max="10000" value={form.position} onChange={set('position')} dir="ltr" /></label>
          </div>
          <label>Texte arabe<textarea required rows={3} value={form.textAr} onChange={set('textAr')} dir="rtl" lang="ar" /></label>
          <label>Phonétique (facultatif)<textarea rows={2} value={form.translit} onChange={set('translit')} dir="ltr" /></label>
          <label>Traduction française<textarea rows={2} value={form.trFr} onChange={set('trFr')} /></label>
          <label>Traduction anglaise (facultatif)<textarea rows={2} value={form.trEn} onChange={set('trEn')} dir="ltr" /></label>
          <label>Référence (obligatoire)<input required minLength={3} maxLength={500} value={form.reference} onChange={set('reference')} /></label>
          <label>Note de relecture (jamais montrée aux membres)<textarea rows={2} maxLength={1000} value={form.reviewNote} onChange={set('reviewNote')} /></label>
          <label className="chk"><input type="checkbox" checked={form.validated} onChange={set('validated')} /> Relu : texte et référence validés par une personne qualifiée</label>
          <label className="chk"><input type="checkbox" checked={form.enabled} disabled={!form.validated} onChange={set('enabled')} /> Affiché aux membres (seulement si relu)</label>
          <p><button className="btn">Enregistrer</button>{' '}<button type="button" className="btn ghost" onClick={() => { setForm(null); setErr(''); }}>{t('regCancel')}</button></p>
        </form>
      )}
      {importing && (
        <form className="reg-form aa-form" onSubmit={runImport}>
          <p className="meta small">Liste JSON : <code>{'[{"category":"morning","theme":"matin_soir","textAr":"…","translit":"…","trFr":"…","trEn":"…","reference":"…","target":3}]'}</code>. Moments : morning, evening, after_prayer, sleep, general. Thèmes : {THEMES.join(', ')} (facultatif : déduit sinon). Les dhikr importés arrivent non relus et non affichés.</p>
          <label>Fichier JSON<input type="file" accept=".json,application/json" onChange={readFile} /></label>
          <label>… ou contenu<textarea rows={6} value={imp} onChange={(e) => setImp(e.target.value)} dir="ltr" /></label>
          <p><button className="btn" disabled={!imp.trim()}>Importer</button>{' '}<button type="button" className="btn ghost" onClick={() => { setImp(null); setErr(''); }}>{t('regCancel')}</button></p>
        </form>
      )}

      {!editing && !importing && (
        <div className="aa-layout">
          <nav className="aa-themes" aria-label="Thèmes">
            <h3 className="aa-lbl">Thèmes</h3>
            <button type="button" className={`aa-theme${!fTheme ? ' on' : ''}`} aria-pressed={!fTheme} onClick={() => setFTheme('')}>
              <span>Tous les thèmes</span><small>{stats.valid} / {stats.total}</small>
            </button>
            {THEMES.map((k) => (
              <button key={k} type="button" className={`aa-theme${fTheme === k ? ' on' : ''}`} aria-pressed={fTheme === k} onClick={() => setFTheme(k)}>
                <span>{THEME_NAMES[k]}</span><small>{stats.per[k].valid} / {stats.per[k].total}</small>
                <i className="aa-bar"><span style={{ width: `${stats.per[k].total ? (stats.per[k].valid / stats.per[k].total) * 100 : 0}%` }} /></i>
              </button>
            ))}
          </nav>
          <div className="aa-list">
            <div className="aa-filters">
              <div className="aa-seg" role="group" aria-label="Statut">
                {STATUS.map(([k, n]) => <button key={k} type="button" className={fSt === k ? 'on' : ''} aria-pressed={fSt === k} onClick={() => setFSt(k)}>{n}</button>)}
              </div>
              <label className="aa-search"><span className="sr-only">Rechercher</span><input type="search" placeholder="Rechercher (arabe, français, source)" value={q} onChange={(e) => setQ(e.target.value)} /></label>
              <label>Moment<select value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Tous</option>{CATS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              <span className="meta small">{shown.length} sur {d.items.length}</span>
              {shown.some((x) => !x.validated) && <button type="button" className="btn ghost small" onClick={startReview}>Relire un par un ({shown.filter((x) => !x.validated).length})</button>}
            </div>
            <BulkBar count={sel.count} busy={busy} onRun={bulk} onClear={sel.clear}>
              <select aria-label="Changer le thème" value={chg.theme} onChange={(e) => setChg({ ...chg, theme: e.target.value })}><option value="">Thème…</option>{THEMES.map((k) => <option key={k} value={k}>{THEME_NAMES[k]}</option>)}</select>
              <select aria-label="Changer le moment" value={chg.category} onChange={(e) => setChg({ ...chg, category: e.target.value })}><option value="">Moment…</option>{CATS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
              <input type="number" min="1" max="1000" placeholder="Répét." aria-label="Changer le nombre de répétitions" value={chg.target} onChange={(e) => setChg({ ...chg, target: e.target.value })} dir="ltr" />
              <button type="button" className="btn ghost small" disabled={busy || (!chg.category && !chg.theme && !chg.target)} onClick={() => bulk('update')}>Appliquer</button>
            </BulkBar>
            <div className="aa-selall"><SelectAll visible={shown.map((x) => x.id)} selection={sel} /> <span className="meta small">Tout sélectionner (liste filtrée)</span></div>
            {shown.length === 0 && <p className="meta">{d.items.length ? 'Aucun dhikr ne correspond aux filtres.' : 'Aucun dhikr pour le moment. Le bouton « Restaurer les dhikr fournis » les recharge.'}</p>}
            <ul className="aa-cards">
              {shown.slice(0, limit).map((x) => (
                <li key={x.id} className={`aa-card${x.validated ? '' : ' todo'}`}>
                  <input type="checkbox" className="aa-pick" aria-label={`Sélectionner le dhikr ${x.id}`} checked={sel.has(x.id)} onChange={() => sel.toggle(x.id)} />
                  <div className="aa-body">
                    <p className="aa-ar" lang="ar" dir="rtl">{cut(x.textAr, 110)}</p>
                    <p className="aa-fr">{cut(x.trFr, 140)}</p>
                    <p className="aa-meta meta small">n° {x.id} · {THEME_NAMES[x.theme] || x.theme} · {CATS.find(([k]) => k === x.category)?.[1]} · {x.target} fois · {cut(x.reference, 80)}{x.reviewNote ? ' · ⚠ note de relecture' : ''}</p>
                  </div>
                  <div className="aa-ctl">
                    <label className="aa-sw"><span>Relu</span><input type="checkbox" role="switch" checked={x.validated} disabled={busy} onChange={() => act([x.id], x.validated ? 'unvalidate' : 'validate', {}, true)} /></label>
                    <label className="aa-sw"><span>Affiché</span><input type="checkbox" role="switch" checked={x.enabled} disabled={busy || !x.validated} onChange={() => act([x.id], x.enabled ? 'hide' : 'show', {}, true)} /></label>
                    <button type="button" className="btn ghost small" onClick={() => { setForm({ ...x }); setErr(''); setMsg(''); }}>Modifier</button>
                    <button type="button" className="btn ghost small" onClick={() => del(x)}>Supprimer</button>
                  </div>
                </li>
              ))}
            </ul>
            {shown.length > limit && <p><button type="button" className="btn ghost" onClick={() => setLimit(limit + PAGE)}>Afficher {Math.min(PAGE, shown.length - limit)} de plus ({shown.length - limit} restants)</button></p>}
          </div>
        </div>
      )}
    </section>
  );

}
