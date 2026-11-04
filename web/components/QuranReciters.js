'use client';
// Admin → Coran → Récitateurs (étape 45B2) : le navigateur du visiteur lit le fichier du verset directement chez la source ; rien n'est copié sur nos serveurs.
// Une adresse modèle contient {sura3} ou {sura} (sourate) et {aya3} ou {aya} (verset) ; « 3 » = sur trois chiffres (001) ;
// ou bien {ayahg} : numéro du verset dans tout le Coran (1 à 6236), utilisé par Islamic Network.
// Étape A1 : « Ajouter depuis un catalogue » (EveryAyah, Islamic Network) — le serveur lit la liste, l'administrateur coche ;
// les récitateurs ajoutés ne sont PAS proposés aux visiteurs tant qu'il ne les a pas vérifiés et proposés.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';
import { reciterUrl } from '../lib/quranAudio';

const EMPTY = { slug: '', name: '', urlTemplate: '', sourceUrl: '', license: '', credit: '', enabled: false, position: 0 };
const errOf = (r, t) => r.data?.error || (r.data?.details ? r.data.details.map((d) => d.message).join(' ; ') : t('errGeneric'));

export default function QuranReciters() {
  const { t, call } = useApp();
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await call('/admin/quran/reciters');
    if (r.ok) setList(r.data.reciters);
  }, [call]);
  useEffect(() => { load(); }, [load]);
  // Catalogue : { source, label, items } ; choix : ensemble d'identifiants cochés.
  const [cat, setCat] = useState(null);
  const [pickSet, setPickSet] = useState(new Set());
  const [catBusy, setCatBusy] = useState(false);
  const openCatalog = async (source) => {
    setErr(''); setMsg(''); setCat(null); setPickSet(new Set()); setCatBusy(true);
    const r = await call(`/admin/quran/reciter-catalog?source=${source}`);
    setCatBusy(false);
    if (r.ok) setCat(r.data); else setErr(errOf(r, t));
  };
  const addPicked = async () => {
    setErr(''); setMsg(''); setCatBusy(true);
    let n = 0; const fails = [];
    for (const it of cat.items.filter((x) => pickSet.has(x.slug))) {
      const r = await call('/admin/quran/reciters', { method: 'POST', body: JSON.stringify({ slug: it.slug, name: it.name, urlTemplate: it.urlTemplate, sourceUrl: it.sourceUrl, license: it.license, credit: it.credit, enabled: false, position: 100 }) });
      if (r.ok) n++; else fails.push(`${it.name} : ${errOf(r, t)}`);
    }
    setCatBusy(false); setCat(null); setPickSet(new Set());
    setMsg(`${n} récitateur(s) ajouté(s), non proposé(s) aux visiteurs. Écoutez-les, vérifiez la licence, puis « Proposer ».`);
    if (fails.length) setErr(fails.join(' ; '));
    load();
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    const { id, slug, origin, ...rest } = form;
    const body = { ...rest, position: Number(rest.position) || 0 };
    const r = id ? await call(`/admin/quran/reciters/${id}`, { method: 'PUT', body: JSON.stringify(body) })
      : await call('/admin/quran/reciters', { method: 'POST', body: JSON.stringify({ ...body, slug }) });
    if (!r.ok) { setErr(errOf(r, t)); return; }
    setForm(null); setMsg(t('qrAdSaved')); load();
  };
  const del = async (x) => {
    if (!window.confirm(`Supprimer le récitateur « ${x.name} » ?`)) return;
    const r = await call(`/admin/quran/reciters/${x.id}`, { method: 'DELETE' });
    if (r.ok) load(); else setErr(errOf(r, t));
  };
  const toggle = async (x) => {
    const { id, slug, origin, ...rest } = x;
    const r = await call(`/admin/quran/reciters/${id}`, { method: 'PUT', body: JSON.stringify({ ...rest, enabled: !x.enabled }) });
    if (r.ok) load(); else setErr(errOf(r, t));
  };
  if (!list) return null;
  return (
    <section className="qr-preset">
      <h3>{t('qrRcTitle')}</h3>
      <p className="meta small">{t('qrRcIntro')}</p>
      {msg && <p className="meta" role="status">✓ {msg}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {!form && (
        <p className="adm-actions">
          <button type="button" className="btn" onClick={() => { setForm({ ...EMPTY }); setErr(''); setMsg(''); setCat(null); }}>{t('qrRcNew')}</button>{' '}
          <button type="button" className="btn ghost" disabled={catBusy} onClick={() => openCatalog('everyayah')}>Ajouter depuis EveryAyah</button>{' '}
          <button type="button" className="btn ghost" disabled={catBusy} onClick={() => openCatalog('islamic')}>Ajouter depuis Islamic Network</button>
          {catBusy && <span className="meta small"> …</span>}
        </p>
      )}
      {cat && (
        <div className="panel" role="group" aria-label={cat.label}>
          <h4>Catalogue {cat.label} — {cat.items.length} récitateurs verset par verset</h4>
          <p className="meta small">Licence indiquée : {cat.items[0]?.license}</p>
          <p className="meta small">Cochez ceux à ajouter. Ils sont créés <b>non proposés</b> : écoutez un verset et vérifiez la licence avant de les proposer aux visiteurs.</p>
          <p><button type="button" className="link u small" onClick={() => setPickSet(new Set(cat.items.filter((x) => !x.exists).map((x) => x.slug)))}>Tout cocher</button> · <button type="button" className="link u small" onClick={() => setPickSet(new Set())}>Tout décocher</button></p>
          <ul className="adm-checklist" style={{ maxHeight: 360, overflow: 'auto' }}>
            {cat.items.map((it) => (
              <li key={it.slug}>
                <label className="chk"><input type="checkbox" disabled={it.exists} checked={pickSet.has(it.slug)}
                  onChange={(e) => { const n = new Set(pickSet); if (e.target.checked) n.add(it.slug); else n.delete(it.slug); setPickSet(n); }} />
                  {' '}{it.name}{it.exists ? ' — déjà ajouté' : ''}</label>
                <span className="meta small" dir="ltr"> {it.urlTemplate}</span>
              </li>
            ))}
          </ul>
          <p><button type="button" className="btn" disabled={catBusy || !pickSet.size} onClick={addPicked}>Ajouter {pickSet.size} récitateur(s)</button>{' '}
            <button type="button" className="btn ghost" onClick={() => setCat(null)}>{t('regCancel')}</button></p>
        </div>
      )}
      {form && (
        <form className="reg-form" onSubmit={save}>
          {!form.id && <label>Identifiant (ex. alafasy)<input required value={form.slug} onChange={set('slug')} dir="ltr" pattern="[a-z0-9][a-z0-9_\-]{1,59}" /></label>}
          <label>Nom du récitateur<input required minLength={2} maxLength={120} value={form.name} onChange={set('name')} /></label>
          <label>Adresse modèle du fichier d’un verset (https, avec {'{sura3}'} et {'{aya3}'}, ou {'{ayahg}'} = numéro de 1 à 6236)<input required maxLength={500} value={form.urlTemplate} onChange={set('urlTemplate')} dir="ltr" placeholder="https://…/{sura3}{aya3}.mp3" /></label>
          <label>Adresse de la source (page des conditions d’utilisation)<input maxLength={500} value={form.sourceUrl} onChange={set('sourceUrl')} dir="ltr" /></label>
          <label>Licence ou autorisation (telle que reçue)<input maxLength={300} value={form.license} onChange={set('license')} /></label>
          <label>Crédit à afficher<input maxLength={300} value={form.credit} onChange={set('credit')} /></label>
          <label>Ordre<input type="number" min="0" max="1000" value={form.position} onChange={set('position')} dir="ltr" /></label>
          <label className="chk"><input type="checkbox" role="switch" checked={form.enabled} onChange={set('enabled')} /> Proposé aux visiteurs</label>
          <p><button className="btn">{t('seasonSave')}</button>{' '}<button type="button" className="btn ghost" onClick={() => { setForm(null); setErr(''); }}>{t('regCancel')}</button></p>
        </form>
      )}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Récitateur</th><th>Origine à autoriser</th><th>Proposé</th><th /></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={4}>{t('qrRcNone')}</td></tr>}
            {list.map((x) => (
              <tr key={x.id}>
                <td><b>{x.name}</b><br /><span className="meta small">{x.slug}{x.credit ? ` · ${x.credit}` : ''}{x.license ? ` · ${x.license}` : ''}</span></td>
                <td><code>{x.origin}</code></td><td>{x.enabled ? '✓' : '—'}</td>
                <td className="adm-actions">
                  {/* Essai : premier verset d'Al-Fatiha, lu directement chez la source. */}
                  <button type="button" className="btn ghost small" onClick={() => { try { const a = new Audio(reciterUrl(x.urlTemplate, 1, 1)); a.play().catch(() => setErr(`« ${x.name} » : lecture impossible (source injoignable ou domaine non autorisé).`)); } catch { /* ignoré */ } }}>▶ 1:1</button>{' '}
                  <button type="button" className="btn ghost small" onClick={() => toggle(x)}>{x.enabled ? 'Masquer' : 'Proposer'}</button>{' '}
                  <button type="button" className="btn ghost small" onClick={() => { setForm({ ...x }); setErr(''); setMsg(''); }}>Modifier</button>{' '}
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
