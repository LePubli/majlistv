'use client';
// Admin → Athkar (étape 45D) : les dhikr du compteur (formule Apprentissage). Aucun dhikr n'est fourni avec le logiciel.
// Chaque dhikr a une référence (source) ; il n'est montré aux membres qu'une fois VALIDÉ (relu par une personne qualifiée) et affiché.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';
import { BulkBar, SelectAll, useSelection } from './BulkTools';

const CATS = [['morning', 'Matin'], ['evening', 'Soir'], ['after_prayer', 'Après la prière'], ['sleep', 'Avant de dormir'], ['general', 'À tout moment']];
const EMPTY = { category: 'morning', textAr: '', translit: '', trFr: '', trEn: '', reference: '', target: 1, position: 0, validated: false, enabled: false };
const errOf = (r, t) => r.data?.error || (r.data?.details ? r.data.details.map((d) => d.message).join(' ; ') : t('errGeneric'));

export default function AthkarAdmin() {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [imp, setImp] = useState(null);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const sel = useSelection();
  const [fCat, setFCat] = useState(''); const [fSt, setFSt] = useState('');
  const [busy, setBusy] = useState(false);
  const [chg, setChg] = useState({ category: '', target: '' });
  const load = useCallback(async () => {
    const r = await call('/admin/athkar');
    if (r.ok) { setD(r.data); setErr(''); } else setErr(r.status === 404 ? 'Cette fonction est coupée (Admin → Fonctions → « Compteur d’athkar »).' : errOf(r, t));
  }, [call, t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { sel.clear(); }, [fCat, fSt, sel.clear]); // la sélection ne garde jamais des éléments masqués par un filtre
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    const { id, reviewedAt, ...rest } = form;
    const body = { ...rest, target: Number(rest.target) || 1, position: Number(rest.position) || 0 };
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
    setImp(null); setMsg(`${r.data.created} dhikr importés (non validés, non affichés).${r.data.errors.length ? ` Refusés : ${r.data.errors.join(' ; ')}` : ''}`); load();
  };
  const bulk = async (action) => {
    setErr(''); setMsg(''); setBusy(true);
    const set = {};
    if (action === 'update') { if (chg.category) set.category = chg.category; if (chg.target) set.target = Number(chg.target); }
    const r = await call('/admin/athkar/bulk', { method: 'POST', body: JSON.stringify({ ids: sel.ids, action, set }) });
    setBusy(false);
    if (!r.ok) { setErr(errOf(r, t)); return; }
    setMsg(`${r.data.done} dhikr traité${r.data.done > 1 ? 's' : ''}${r.data.skipped ? ` · ${r.data.skipped} ignoré${r.data.skipped > 1 ? 's' : ''} (non validés : on ne peut pas les afficher)` : ''}.`);
    if (action === 'delete') sel.clear();
    setChg({ category: '', target: '' }); load();
  };
  const restore = async () => {
    if (!window.confirm('Restaurer les dhikr fournis qui manquent ? Ils reviennent non validés et non affichés ; ceux déjà présents ne sont pas dupliqués.')) return;
    setErr(''); setMsg(''); setBusy(true);
    const r = await call('/admin/athkar/restore-provided', { method: 'POST', body: '{}' });
    setBusy(false);
    if (!r.ok) { setErr(errOf(r, t)); return; }
    setMsg(`${r.data.created} dhikr restauré${r.data.created > 1 ? 's' : ''} sur ${r.data.total} fournis (non validés, non affichés).`); load();
  };
  const readFile = (e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => setImp(String(rd.result || '')); rd.readAsText(f); };

  if (err && !d) return <p className="error" role="alert">{err}</p>;
  if (!d) return null;
  const shown = d.items.filter((x) => (!fCat || x.category === fCat) && (!fSt || (fSt === 'todo' ? !x.validated : fSt === 'valid' ? x.validated && !x.enabled : x.enabled)));
  return (
    <section>
      <h2>Athkar</h2>
      <p className="meta">Compteur quotidien pour les membres de la formule Apprentissage (onglet « Athkar » de la page Apprendre). Aucun dhikr n’est fourni : saisissez-les avec leur <b>référence</b> (recueil, numéro, degré d’authenticité tel que donné par la source). Un dhikr n’est montré qu’une fois <b>validé</b> (relu par une personne qualifiée) et <b>affiché</b>.</p>
      {msg && <p className="meta" role="status">✓ {msg}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {!form && imp === null && <p><button type="button" className="btn" onClick={() => { setForm({ ...EMPTY }); setMsg(''); setErr(''); }}>Ajouter un dhikr</button>{' '}<button type="button" className="btn ghost" onClick={() => { setImp(''); setMsg(''); setErr(''); }}>Importer une liste (JSON)</button>{' '}<button type="button" className="btn ghost" disabled={busy} onClick={restore}>Restaurer les dhikr fournis</button></p>}
      {form && (
        <form className="reg-form" onSubmit={save}>
          <label>Moment<select value={form.category} onChange={set('category')}>{CATS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label>Texte arabe<textarea required rows={3} value={form.textAr} onChange={set('textAr')} dir="rtl" lang="ar" /></label>
          <label>Phonétique (facultatif)<textarea rows={2} value={form.translit} onChange={set('translit')} dir="ltr" /></label>
          <label>Traduction française<textarea rows={2} value={form.trFr} onChange={set('trFr')} /></label>
          <label>Traduction anglaise (facultatif)<textarea rows={2} value={form.trEn} onChange={set('trEn')} dir="ltr" /></label>
          <label>Référence (obligatoire)<input required minLength={3} maxLength={500} value={form.reference} onChange={set('reference')} /></label>
          <label>Nombre de répétitions<input type="number" min="1" max="1000" value={form.target} onChange={set('target')} dir="ltr" /></label>
          <label>Ordre<input type="number" min="0" max="10000" value={form.position} onChange={set('position')} dir="ltr" /></label>
          <label className="chk"><input type="checkbox" checked={form.validated} onChange={set('validated')} /> Validé : texte et référence relus par une personne qualifiée</label>
          <label className="chk"><input type="checkbox" checked={form.enabled} disabled={!form.validated} onChange={set('enabled')} /> Affiché aux membres (seulement si validé)</label>
          <p><button className="btn">Enregistrer</button>{' '}<button type="button" className="btn ghost" onClick={() => { setForm(null); setErr(''); }}>{t('regCancel')}</button></p>
        </form>
      )}
      {imp !== null && (
        <form className="reg-form" onSubmit={runImport}>
          <p className="meta small">Liste JSON : <code>{'[{"category":"morning","textAr":"…","translit":"…","trFr":"…","trEn":"…","reference":"…","target":3}]'}</code>. Catégories : morning, evening, after_prayer, sleep, general. Les dhikr importés arrivent non validés et non affichés.</p>
          <label>Fichier JSON<input type="file" accept=".json,application/json" onChange={readFile} /></label>
          <label>… ou contenu<textarea rows={6} value={imp} onChange={(e) => setImp(e.target.value)} dir="ltr" /></label>
          <p><button className="btn" disabled={!imp.trim()}>Importer</button>{' '}<button type="button" className="btn ghost" onClick={() => { setImp(null); setErr(''); }}>{t('regCancel')}</button></p>
        </form>
      )}
      <div className="adm-filters">
        <label>Moment<select value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Tous</option>{CATS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Statut<select value={fSt} onChange={(e) => setFSt(e.target.value)}><option value="">Tous</option><option value="todo">À valider</option><option value="valid">Validés, non affichés</option><option value="shown">Affichés</option></select></label>
        <span className="meta small" style={{ alignSelf: 'end' }}>{shown.length} sur {d.items.length}</span>
      </div>
      <BulkBar count={sel.count} busy={busy} onRun={bulk} onClear={sel.clear}>
        <select aria-label="Changer le moment" value={chg.category} onChange={(e) => setChg({ ...chg, category: e.target.value })}><option value="">Moment…</option>{CATS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        <input type="number" min="1" max="1000" placeholder="Répét." aria-label="Changer le nombre de répétitions" value={chg.target} onChange={(e) => setChg({ ...chg, target: e.target.value })} dir="ltr" />
        <button type="button" className="btn ghost small" disabled={busy || (!chg.category && !chg.target)} onClick={() => bulk('update')}>Appliquer</button>
      </BulkBar>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th><SelectAll visible={shown.map((x) => x.id)} selection={sel} /></th><th>Dhikr</th><th>Moment</th><th>Répétitions</th><th>Validé</th><th>Affiché</th><th /></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={7}>{d.items.length ? 'Aucun dhikr ne correspond aux filtres.' : 'Aucun dhikr pour le moment. Le bouton « Restaurer les dhikr fournis » les recharge.'}</td></tr>}
            {shown.map((x) => (
              <tr key={x.id}>
                <td><input type="checkbox" aria-label={`Sélectionner le dhikr ${x.id}`} checked={sel.has(x.id)} onChange={() => sel.toggle(x.id)} /></td>
                <td><span lang="ar" dir="rtl" className="at-adm-ar">{x.textAr.length > 90 ? `${x.textAr.slice(0, 90)}…` : x.textAr}</span><br /><span className="meta small">{x.reference}</span></td>
                <td>{CATS.find(([k]) => k === x.category)?.[1]}</td><td>{x.target}</td><td>{x.validated ? '✓' : '—'}</td><td>{x.enabled ? '✓' : '—'}</td>
                <td className="adm-actions">
                  <button type="button" className="btn ghost small" onClick={() => { setForm({ ...x }); setImp(null); setErr(''); setMsg(''); }}>Modifier</button>{' '}
                  <button type="button" className="btn ghost small" onClick={() => del(x)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
