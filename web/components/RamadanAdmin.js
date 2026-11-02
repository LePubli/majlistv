'use client';
// Admin → Ramadan (étape 45F) : actions du circuit de 30 jours (adultes). Aucun contenu n'est fourni avec le logiciel.
// Une action n'est montrée qu'une fois VALIDÉE (relue par une personne qualifiée) et affichée. Jour 0 = chaque jour.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { BulkBar, SelectAll, useSelection } from './BulkTools';

const L = [['fr', 'Français'], ['en', 'English'], ['ar', 'العربية']];
const EMPTY = { audience: 'adult', day: 1, title: { fr: '', en: '', ar: '' }, text: { fr: '', en: '', ar: '' }, link: '', reference: '', position: 0, validated: false, enabled: false };
const errOf = (r, t) => r.data?.error || (r.data?.details ? r.data.details.map((d) => d.message).join(' ; ') : t('errGeneric'));

export default function RamadanAdmin() {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [imp, setImp] = useState(null);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const sel = useSelection();
  const [fAud, setFAud] = useState(''); const [fSt, setFSt] = useState('');
  const [busy, setBusy] = useState(false);
  const [chg, setChg] = useState({ audience: '', day: '' });
  const load = useCallback(async () => {
    const r = await call('/admin/ramadan/items');
    if (r.ok) { setD(r.data); setErr(''); } else setErr(r.status === 404 ? 'Cette fonction est coupée (Admin → Fonctions → « Circuit de Ramadan »).' : errOf(r, t));
  }, [call, t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { sel.clear(); }, [fAud, fSt, sel.clear]); // la sélection ne garde jamais des éléments masqués par un filtre
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setL = (k, l) => (e) => setForm({ ...form, [k]: { ...form[k], [l]: e.target.value } });
  const save = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    const { id, ...rest } = form;
    const body = { ...rest, day: Number(rest.day), position: Number(rest.position) || 0 };
    const r = id ? await call(`/admin/ramadan/items/${id}`, { method: 'PUT', body: JSON.stringify(body) }) : await call('/admin/ramadan/items', { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) { setErr(errOf(r, t)); return; }
    setForm(null); setMsg('Enregistré.'); load();
  };
  const del = async (x) => {
    if (!window.confirm('Supprimer cette action et les cases des membres pour cette action ?')) return;
    const r = await call(`/admin/ramadan/items/${x.id}`, { method: 'DELETE' });
    if (r.ok) load(); else setErr(errOf(r, t));
  };
  const runImport = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    let items;
    try { const j = JSON.parse(imp); items = Array.isArray(j) ? j : j.items; } catch { setErr('JSON illisible.'); return; }
    const r = await call('/admin/ramadan/import', { method: 'POST', body: JSON.stringify({ items }) });
    if (!r.ok) { setErr(`${errOf(r, t)}${r.data?.errors?.length ? ` — ${r.data.errors.join(' ; ')}` : ''}`); return; }
    setImp(null); setMsg(`${r.data.created} action(s) importée(s) (non validées, non affichées).${r.data.errors.length ? ` Refusées : ${r.data.errors.join(' ; ')}` : ''}`); load();
  };
  const bulk = async (action) => {
    setErr(''); setMsg(''); setBusy(true);
    const set = {};
    if (action === 'update') { if (chg.audience) set.audience = chg.audience; if (chg.day !== '') set.day = Number(chg.day); }
    const r = await call('/admin/ramadan/items/bulk', { method: 'POST', body: JSON.stringify({ ids: sel.ids, action, set }) });
    setBusy(false);
    if (!r.ok) { setErr(errOf(r, t)); return; }
    setMsg(`${r.data.done} action${r.data.done > 1 ? 's' : ''} traitée${r.data.done > 1 ? 's' : ''}${r.data.skipped ? ` · ${r.data.skipped} ignorée${r.data.skipped > 1 ? 's' : ''} (non validées : on ne peut pas les afficher)` : ''}.`);
    if (action === 'delete') sel.clear();
    setChg({ audience: '', day: '' }); load();
  };
  const readFile = (e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => setImp(String(rd.result || '')); rd.readAsText(f); };
  if (err && !d) return <p className="error" role="alert">{err}</p>;
  if (!d) return null;
  const st = d.status;
  const shown = d.items.filter((x) => (!fAud || x.audience === fAud) && (!fSt || (fSt === 'todo' ? !x.validated : fSt === 'valid' ? x.validated && !x.enabled : x.enabled)));
  return (
    <section>
      <h2>Circuit de Ramadan</h2>
      <p className="meta">Actions proposées chaque jour de Ramadan aux membres connectés (page <Link className="link u" href="/ramadan">/ramadan</Link>, gratuite). Aucun contenu n’est fourni : saisissez chaque action avec, si besoin, sa référence et un lien vers une page du site. Une action n’est montrée qu’une fois <b>validée</b> et <b>affichée</b>. Jour 0 = chaque jour. Les membres cochent aussi leurs tarawih. Les actions « Enfants » apparaissent dans l’espace Kids pendant Ramadan : l’enfant dit « je l’ai fait », le parent valide (aucune comparaison entre enfants). Import : ajoutez <code>"audience":"kid"</code>.</p>
      <p className="meta">{st.active ? `Aujourd’hui : jour ${st.day} de Ramadan ${st.hyear}.` : st.startsOn ? `Prochain Ramadan : ${new Date(`${st.startsOn}T12:00:00Z`).toLocaleDateString('fr-FR', { dateStyle: 'long' })} (dans ${st.daysToStart} jours).` : ''} Décalage de date : <Link className="link u" href="/admin?tab=settings">Paramètres → Saisons</Link>.</p>
      {msg && <p className="meta" role="status">✓ {msg}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {!form && imp === null && <p><button type="button" className="btn" onClick={() => { setForm(JSON.parse(JSON.stringify(EMPTY))); setMsg(''); setErr(''); }}>Ajouter une action</button>{' '}<button type="button" className="btn ghost" onClick={() => { setImp(''); setMsg(''); setErr(''); }}>Importer une liste (JSON)</button></p>}
      {form && (
        <form className="reg-form" onSubmit={save}>
          <label>Public<select value={form.audience} onChange={set('audience')}><option value="adult">Adultes (page /ramadan)</option><option value="kid">Enfants (espace Kids, validé par le parent)</option></select></label>
          <label>Jour (0 = chaque jour)<input type="number" min="0" max="30" value={form.day} onChange={set('day')} dir="ltr" /></label>
          <fieldset className="fd-fs"><legend>Titre</legend>{L.map(([l, n]) => <label key={l}>{n}<input maxLength={200} value={form.title[l]} onChange={setL('title', l)} dir={l === 'ar' ? 'rtl' : 'ltr'} /></label>)}</fieldset>
          <fieldset className="fd-fs"><legend>Explication (facultatif)</legend>{L.map(([l, n]) => <label key={l}>{n}<textarea rows={2} maxLength={2000} value={form.text[l]} onChange={setL('text', l)} dir={l === 'ar' ? 'rtl' : 'ltr'} /></label>)}<p className="meta small">Langue vide = texte français.</p></fieldset>
          <label>Lien vers une page du site (ex. /coran/2, /collections/…)<input maxLength={300} value={form.link} onChange={set('link')} dir="ltr" placeholder="/…" /></label>
          <label>Référence (facultatif)<input maxLength={500} value={form.reference} onChange={set('reference')} /></label>
          <label>Ordre<input type="number" min="0" max="10000" value={form.position} onChange={set('position')} dir="ltr" /></label>
          <label className="chk"><input type="checkbox" checked={form.validated} onChange={set('validated')} /> Validée : texte et référence relus par une personne qualifiée</label>
          <label className="chk"><input type="checkbox" checked={form.enabled} disabled={!form.validated} onChange={set('enabled')} /> Affichée aux membres (seulement si validée)</label>
          <p><button className="btn">Enregistrer</button>{' '}<button type="button" className="btn ghost" onClick={() => { setForm(null); setErr(''); }}>{t('regCancel')}</button></p>
        </form>
      )}
      {imp !== null && (
        <form className="reg-form" onSubmit={runImport}>
          <p className="meta small">Liste JSON : <code>{'[{"day":1,"titleFr":"…","textFr":"…","titleEn":"…","titleAr":"…","link":"/coran/1","reference":"…"}]'}</code> — jour 0 = chaque jour. Les actions importées arrivent non validées et non affichées.</p>
          <label>Fichier JSON<input type="file" accept=".json,application/json" onChange={readFile} /></label>
          <label>… ou contenu<textarea rows={6} value={imp} onChange={(e) => setImp(e.target.value)} dir="ltr" /></label>
          <p><button className="btn" disabled={!imp.trim()}>Importer</button>{' '}<button type="button" className="btn ghost" onClick={() => { setImp(null); setErr(''); }}>{t('regCancel')}</button></p>
        </form>
      )}
      <div className="adm-filters">
        <label>Public<select value={fAud} onChange={(e) => setFAud(e.target.value)}><option value="">Tous</option><option value="adult">Adultes</option><option value="kid">Enfants</option></select></label>
        <label>Statut<select value={fSt} onChange={(e) => setFSt(e.target.value)}><option value="">Tous</option><option value="todo">À valider</option><option value="valid">Validées, non affichées</option><option value="shown">Affichées</option></select></label>
        <span className="meta small" style={{ alignSelf: 'end' }}>{shown.length} sur {d.items.length}</span>
      </div>
      <BulkBar count={sel.count} busy={busy} onRun={bulk} onClear={sel.clear}>
        <select aria-label="Changer le public" value={chg.audience} onChange={(e) => setChg({ ...chg, audience: e.target.value })}><option value="">Public…</option><option value="adult">Adultes</option><option value="kid">Enfants</option></select>
        <input type="number" min="0" max="30" placeholder="Jour" aria-label="Changer le jour (0 = chaque jour)" value={chg.day} onChange={(e) => setChg({ ...chg, day: e.target.value })} dir="ltr" />
        <button type="button" className="btn ghost small" disabled={busy || (!chg.audience && chg.day === '')} onClick={() => bulk('update')}>Appliquer</button>
      </BulkBar>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th><SelectAll visible={shown.map((x) => x.id)} selection={sel} /></th><th>Public</th><th>Jour</th><th>Action</th><th>Validée</th><th>Affichée</th><th /></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={7}>{d.items.length ? 'Aucune action ne correspond aux filtres.' : 'Aucune action pour le moment.'}</td></tr>}
            {shown.map((x) => (
              <tr key={x.id}>
                <td><input type="checkbox" aria-label={`Sélectionner l’action ${x.id}`} checked={sel.has(x.id)} onChange={() => sel.toggle(x.id)} /></td>
                <td>{x.audience === 'kid' ? 'Enfants' : 'Adultes'}</td>
                <td>{x.day || 'Chaque jour'}</td>
                <td><b>{x.title.fr || x.title.en || x.title.ar}</b>{x.reference ? <><br /><span className="meta small">{x.reference}</span></> : null}</td>
                <td>{x.validated ? '✓' : '—'}</td><td>{x.enabled ? '✓' : '—'}</td>
                <td className="adm-actions">
                  <button type="button" className="btn ghost small" onClick={() => { setForm(JSON.parse(JSON.stringify(x))); setImp(null); setErr(''); setMsg(''); }}>Modifier</button>{' '}
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
