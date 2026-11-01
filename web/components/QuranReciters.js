'use client';
// Admin → Coran → Récitateurs (étape 45B2) : le navigateur du visiteur lit le fichier du verset directement chez la source ; rien n'est copié sur nos serveurs.
// Une adresse modèle contient {sura3} ou {sura} (sourate) et {aya3} ou {aya} (verset) ; « 3 » = sur trois chiffres (001).
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';

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
      {!form && <p><button type="button" className="btn" onClick={() => { setForm({ ...EMPTY }); setErr(''); setMsg(''); }}>{t('qrRcNew')}</button></p>}
      {form && (
        <form className="reg-form" onSubmit={save}>
          {!form.id && <label>Identifiant (ex. alafasy)<input required value={form.slug} onChange={set('slug')} dir="ltr" pattern="[a-z0-9][a-z0-9_\-]{1,59}" /></label>}
          <label>Nom du récitateur<input required minLength={2} maxLength={120} value={form.name} onChange={set('name')} /></label>
          <label>Adresse modèle du fichier d’un verset (https, avec {'{sura3}'} et {'{aya3}'})<input required maxLength={500} value={form.urlTemplate} onChange={set('urlTemplate')} dir="ltr" placeholder="https://…/{sura3}{aya3}.mp3" /></label>
          <label>Adresse de la source (page des conditions d’utilisation)<input maxLength={500} value={form.sourceUrl} onChange={set('sourceUrl')} dir="ltr" /></label>
          <label>Licence ou autorisation (telle que reçue)<input maxLength={300} value={form.license} onChange={set('license')} /></label>
          <label>Crédit à afficher<input maxLength={300} value={form.credit} onChange={set('credit')} /></label>
          <label>Ordre<input type="number" min="0" max="1000" value={form.position} onChange={set('position')} dir="ltr" /></label>
          <label className="chk"><input type="checkbox" checked={form.enabled} onChange={set('enabled')} /> Proposé aux visiteurs</label>
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
