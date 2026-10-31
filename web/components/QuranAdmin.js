'use client';
// Admin → Coran (étape 45B) : ressources (texte arabe, traductions, phonétique, tafsir), avec source, licence et crédit.
// Aucun texte n'est fourni avec le logiciel : on importe ici ce qu'on a le droit d'utiliser (adresse ou contenu du fichier).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

const KINDS = [['text', 'Texte arabe (Hafs)'], ['translation', 'Traduction'], ['transliteration', 'Phonétique'], ['tafsir', 'Tafsir']];
const EMPTY = { slug: '', kind: 'translation', lang: 'fr', name: '', author: '', sourceUrl: '', license: '', credit: '', enabled: false, position: 0 };
const when = (s) => (s ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const errOf = (r, t) => r.data?.error || (r.data?.details ? r.data.details.map((d) => d.message).join(' ; ') : t('errGeneric'));

export default function QuranAdmin() {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [imp, setImp] = useState(null); // { res, format, url, content }
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await call('/admin/quran/resources');
    if (r.ok) { setD(r.data); setErr(''); } else setErr(r.status === 404 ? 'Cette fonction est coupée (Admin → Fonctions → « Coran »).' : errOf(r, t));
  }, [call, t]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    const { id, slug, kind, ...rest } = form;
    const body = { ...rest, position: Number(rest.position) || 0 };
    const r = id ? await call(`/admin/quran/resources/${id}`, { method: 'PUT', body: JSON.stringify(body) })
      : await call('/admin/quran/resources', { method: 'POST', body: JSON.stringify({ ...body, slug, kind }) });
    setBusy(false);
    if (!r.ok) { setErr(errOf(r, t)); return; }
    setForm(null); setMsg(t('qrAdSaved')); load();
  };
  const del = async (x) => {
    if (!window.confirm(`Supprimer « ${x.name} » et tout son contenu ?`)) return;
    const r = await call(`/admin/quran/resources/${x.id}`, { method: 'DELETE' });
    if (r.ok) load(); else setErr(errOf(r, t));
  };
  const toggle = async (x) => {
    setErr(''); setMsg('');
    const r = await call(`/admin/quran/resources/${x.id}`, { method: 'PUT', body: JSON.stringify({ lang: x.lang, name: x.name, author: x.author, sourceUrl: x.sourceUrl, license: x.license, credit: x.credit, enabled: !x.enabled, position: x.position }) });
    if (r.ok) load(); else setErr(errOf(r, t));
  };
  const runImport = async (e) => {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    const body = { format: imp.format, ...(imp.url.trim() ? { url: imp.url.trim() } : { content: imp.content }) };
    const r = await call(`/admin/quran/resources/${imp.res.id}/import`, { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr(errOf(r, t)); return; }
    setImp(null); setMsg(`Import terminé : ${r.data.imported} versets, ${r.data.suras} sourate(s)${r.data.skipped ? `, ${r.data.skipped} ligne(s) ignorée(s)` : ''}.${r.data.warning ? ` ⚠ ${r.data.warning}` : ''}`); load();
  };
  const readFile = (e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => setImp((s) => ({ ...s, content: String(rd.result || ''), url: '' })); rd.readAsText(f); };

  if (err && !d) return <p className="error" role="alert">{err}</p>;
  if (!d) return null;
  return (
    <section>
      <h2>{t('qrAdTitle')}</h2>
      <p className="meta">{t('qrAdIntro')} <Link className="link u" href="/coran">{t('qrAdOpen')}</Link></p>
      <p className="meta small">{t('qrAdLicence')}</p>
      {msg && <p className="meta" role="status">✓ {msg}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {!form && !imp && <p><button type="button" className="btn" onClick={() => { setForm({ ...EMPTY }); setMsg(''); setErr(''); }}>{t('qrAdNew')}</button></p>}
      {form && (
        <form className="reg-form" onSubmit={save}>
          {!form.id && <label>Identifiant (ex. fr-hamidullah)<input required value={form.slug} onChange={set('slug')} dir="ltr" pattern="[a-z0-9][a-z0-9_\-]{1,59}" /></label>}
          {!form.id && <label>Type<select value={form.kind} onChange={set('kind')}>{KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>}
          <label>Langue (fr, en, ar…)<input required value={form.lang} onChange={set('lang')} dir="ltr" pattern="[a-z]{2,3}" /></label>
          <label>Nom affiché<input required minLength={2} maxLength={120} value={form.name} onChange={set('name')} /></label>
          <label>Auteur / traducteur<input maxLength={200} value={form.author} onChange={set('author')} /></label>
          <label>Adresse de la source<input maxLength={500} value={form.sourceUrl} onChange={set('sourceUrl')} dir="ltr" /></label>
          <label>Licence (telle que publiée par la source)<input maxLength={300} value={form.license} onChange={set('license')} /></label>
          <label>Crédit à afficher<input maxLength={300} value={form.credit} onChange={set('credit')} /></label>
          <label>Ordre (le plus petit d’abord ; sert au choix par défaut)<input type="number" min="0" max="1000" value={form.position} onChange={set('position')} dir="ltr" /></label>
          <label className="chk"><input type="checkbox" checked={form.enabled} onChange={set('enabled')} /> Affichée sur le site (possible seulement une fois importée)</label>
          <p><button className="btn" disabled={busy}>{t('seasonSave')}</button>{' '}<button type="button" className="btn ghost" onClick={() => { setForm(null); setErr(''); }}>{t('regCancel')}</button></p>
        </form>
      )}
      {imp && (
        <form className="reg-form" onSubmit={runImport}>
          <h3>Importer « {imp.res.name} »</h3>
          <p className="meta small">Remplace tout le contenu de cette ressource. Formats : <b>tanzil</b> (lignes <code>sourate|verset|texte</code>) ou <b>json</b> (liste de {'{sura, aya, text}'} ou objet par sourate).</p>
          <label>Format<select value={imp.format} onChange={(e) => setImp({ ...imp, format: e.target.value })}><option value="tanzil">tanzil (sourate|verset|texte)</option><option value="json">json</option></select></label>
          <label>Adresse du fichier (téléchargé par le serveur, adresse publique)<input value={imp.url} onChange={(e) => setImp({ ...imp, url: e.target.value, content: '' })} dir="ltr" placeholder="https://…" /></label>
          <label>… ou fichier de votre ordinateur<input type="file" accept=".txt,.json,.csv,text/*,application/json" onChange={readFile} /></label>
          {imp.content && <p className="meta small">Fichier lu : {Math.round(imp.content.length / 1024)} Ko.</p>}
          <p><button className="btn" disabled={busy || (!imp.url.trim() && !imp.content)}>{busy ? 'Import en cours…' : 'Importer'}</button>{' '}<button type="button" className="btn ghost" onClick={() => { setImp(null); setErr(''); }}>{t('regCancel')}</button></p>
        </form>
      )}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Ressource</th><th>Type</th><th>Langue</th><th>Versets</th><th>Importée</th><th>Affichée</th><th /></tr></thead>
          <tbody>
            {d.resources.length === 0 && <tr><td colSpan={7}>{t('qrAdNone')}</td></tr>}
            {d.resources.map((x) => (
              <tr key={x.id}>
                <td><b>{x.name}</b><br /><span className="meta small">{x.slug}{x.credit ? ` · ${x.credit}` : ''}{x.license ? ` · ${x.license}` : ''}</span></td>
                <td>{KINDS.find(([k]) => k === x.kind)?.[1]}</td><td>{x.lang}</td>
                <td>{x.verseCount}{x.kind === 'text' && x.verseCount && x.verseCount !== d.totalExpected ? ` ⚠ (attendu ${d.totalExpected})` : ''}</td>
                <td>{when(x.importedAt)}</td><td>{x.enabled ? '✓' : '—'}</td>
                <td className="adm-actions">
                  <button type="button" className="btn ghost small" onClick={() => { setImp({ res: x, format: 'tanzil', url: '', content: '' }); setForm(null); setErr(''); setMsg(''); }}>Importer</button>{' '}
                  <button type="button" className="btn ghost small" disabled={!x.verseCount && !x.enabled} onClick={() => toggle(x)}>{x.enabled ? 'Masquer' : 'Afficher'}</button>{' '}
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
