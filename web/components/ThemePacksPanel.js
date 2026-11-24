'use client';
// Lot T — Administration → Apparence → « Thèmes Mejliss » : envoyer un thème (.zip), le contrôler, l'installer, l'activer, revenir en arrière.
// Un thème ne contient aucun code : jetons de style, feuille de style filtrée, polices, images et pages en blocs (brouillons).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './Providers';

const readAsDataUrl = (file) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(file); });
const MAX = 30 * 1024 * 1024;

export default function ThemePacksPanel({ onChange }) {
  const { call } = useApp();
  const [list, setList] = useState(null);
  const [check, setCheck] = useState(null); // résultat du contrôle d'un .zip : { ok, errors, warnings, summary, file }
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [report, setReport] = useState(null);
  const [applyPages, setApplyPages] = useState(true);
  const fileRef = useRef(null);

  const load = useCallback(() => call('/admin/theme-packs').then((r) => { if (r.ok) setList(r.data); }), [call]);
  useEffect(() => { load(); }, [load]);

  const download = async (path, name) => {
    setMsg('');
    const res = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
    if (!res.ok) { setMsg('Téléchargement impossible.'); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const inspect = async (e) => {
    const file = e.target.files?.[0];
    setCheck(null); setMsg(''); setReport(null);
    if (!file) return;
    if (file.size > MAX) { setMsg('Thème trop lourd (30 Mo au maximum).'); return; }
    setBusy('inspect');
    const data = await readAsDataUrl(file);
    const r = await call('/admin/theme-packs/inspect', { method: 'POST', body: JSON.stringify({ file: data }) });
    setBusy('');
    if (!r.ok) { setMsg(r.data?.error || 'Contrôle impossible.'); return; }
    setCheck({ ...r.data, file: data, name: file.name });
  };
  const install = async () => {
    setBusy('install'); setMsg('');
    const r = await call('/admin/theme-packs', { method: 'POST', body: JSON.stringify({ file: check.file }) });
    setBusy('');
    if (!r.ok) { setCheck({ ...check, ok: false, errors: r.data?.errors || [r.data?.error || 'Installation impossible.'] }); return; }
    setMsg(`Thème « ${r.data.name} » installé. Il n'est pas encore actif : cliquez sur « Activer ».`);
    setCheck(null); if (fileRef.current) fileRef.current.value = '';
    load();
  };
  const activate = async (t) => {
    if (!window.confirm(`Activer « ${t.name} » ? Les couleurs, polices et le style du site changent tout de suite.${applyPages ? ' Ses pages sont ajoutées en BROUILLON (rien n’est publié).' : ''} « Désactiver » revient à l’état d’avant.`)) return;
    setBusy('a:' + t.slug); setMsg(''); setReport(null);
    const r = await call(`/admin/theme-packs/${t.slug}/activate`, { method: 'POST', body: JSON.stringify({ applyPages }) });
    setBusy('');
    if (!r.ok) { setMsg(r.data?.error || 'Activation impossible.'); return; }
    setReport(r.data.report); load(); onChange?.();
  };
  const deactivate = async () => {
    if (!window.confirm('Désactiver le thème ? Le site retrouve le thème et les couleurs d’avant l’activation. Les brouillons de pages restent dans l’éditeur.')) return;
    setBusy('d'); setMsg(''); setReport(null);
    const r = await call('/admin/theme-packs/deactivate', { method: 'POST', body: '{}' });
    setBusy('');
    setMsg(r.ok ? 'Thème désactivé : le site est revenu à l’état d’avant.' : (r.data?.error || 'Désactivation impossible.'));
    load(); onChange?.();
  };
  const remove = async (t) => {
    if (!window.confirm(`Supprimer le thème « ${t.name} » ? Ses fichiers sont effacés (les pages déjà ajoutées au site restent).`)) return;
    const r = await call(`/admin/theme-packs/${t.slug}`, { method: 'DELETE' });
    setMsg(r.ok ? 'Thème supprimé.' : (r.data?.error || 'Suppression impossible.'));
    load();
  };

  return (
    <section className="ap-group" style={{ marginBottom: 14 }} aria-labelledby="tp-h">
      <h2 id="tp-h" style={{ padding: '12px 14px' }}>Thèmes Mejliss (.zip)</h2>
      <div className="ap-group-body">
        <p className="meta small">Un thème est un fichier .zip : couleurs, polices, feuille de style, images et pages en blocs. Il ne contient aucun code. Ses pages arrivent en brouillon dans l’éditeur : rien n’est publié sans vous.</p>
        <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost" onClick={() => download('/admin/theme-packs/example.zip', 'mejliss-theme-exemple-aurore.zip')}>Télécharger le thème d’exemple (Aurore)</button>
          <button type="button" className="btn ghost" onClick={() => download('/admin/theme-packs/guide.md', 'GUIDE-THEME-IA.md')}>Télécharger le guide pour IA (.md)</button>
        </p>
        <p className="meta small">Pour créer un thème avec une IA : donnez-lui le guide et l’exemple, décrivez le style voulu, puis envoyez ici le .zip obtenu.</p>

        <div className="bm-form" style={{ marginTop: 10 }}>
          <label>Envoyer un thème (.zip)
            <input ref={fileRef} type="file" accept=".zip,application/zip" onChange={inspect} disabled={Boolean(busy)} />
          </label>
        </div>
        {busy === 'inspect' && <p className="meta small" role="status">Contrôle du thème…</p>}
        {check && (
          <div role="status" className="ap-row" style={{ display: 'block', marginTop: 8 }}>
            {check.ok ? (
              <>
                <b>✓ Thème valide : {check.summary.name} {check.summary.version}</b>
                <span className="meta small" style={{ display: 'block' }}>
                  Base « {check.summary.base} » · {check.summary.tokens} réglage(s) · {check.summary.fonts} police(s) · {check.summary.assets} image(s) · {check.summary.pages} page(s) · {check.summary.globals} section(s) globale(s) · {check.summary.templates} modèle(s)
                </span>
                {check.warnings?.map((w, i) => <span key={i} className="meta small" style={{ display: 'block' }}>⚠ {w}</span>)}
                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={install} disabled={busy === 'install'}>{busy === 'install' ? 'Installation…' : 'Installer ce thème'}</button>
              </>
            ) : (
              <>
                <b>✗ Ce thème est refusé ({check.errors.length} problème{check.errors.length > 1 ? 's' : ''})</b>
                <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{check.errors.slice(0, 30).map((e, i) => <li key={i} className="small">{e}</li>)}</ul>
                {check.errors.length > 30 && <span className="meta small">… et {check.errors.length - 30} autre(s).</span>}
                <span className="meta small" style={{ display: 'block', marginTop: 4 }}>Corrigez le thème (ou renvoyez ces messages à l’IA qui l’a fait), puis renvoyez le .zip.</span>
              </>
            )}
          </div>
        )}
        {msg && <p className="meta small" role="status">{msg}</p>}

        <h3 style={{ marginTop: 16 }}>Thèmes installés</h3>
        <label style={{ display: 'block', margin: '4px 0 8px' }}>
          <input type="checkbox" checked={applyPages} onChange={(e) => setApplyPages(e.target.checked)} /> À l’activation, ajouter aussi les pages du thème (en brouillon)
        </label>
        {list && !list.length && <p className="meta small">Aucun thème installé.</p>}
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {(list || []).map((t) => (
            <article key={t.slug} className={`ap-row${t.active ? ' changed' : ''}`} style={{ display: 'block' }}>
              {t.preview && <img src={t.preview} alt={`Aperçu du thème ${t.name}`} style={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', borderRadius: 8 }} />}
              <b style={{ display: 'block', marginTop: 6 }}>{t.name} <span className="meta small">v{t.version}</span> {t.active && <span className="ap-tag">Actif</span>}</b>
              {t.author && <span className="meta small" style={{ display: 'block' }}>par {t.author}</span>}
              {t.description && <span className="meta small" style={{ display: 'block' }}>{t.description}</span>}
              <span className="meta small" style={{ display: 'block' }}>Base « {t.base} » · {t.tokens} réglage(s) · {t.fonts} police(s) · {t.pages} page(s) · {t.globals} globale(s) · {t.templates} modèle(s)</span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {t.active
                  ? <button type="button" className="btn ghost" onClick={deactivate} disabled={Boolean(busy)}>Désactiver</button>
                  : <>
                    <button type="button" className="btn" onClick={() => activate(t)} disabled={Boolean(busy)}>{busy === 'a:' + t.slug ? 'Activation…' : 'Activer'}</button>
                    <button type="button" className="btn ghost" onClick={() => remove(t)} disabled={Boolean(busy)}>Supprimer</button>
                  </>}
              </span>
            </article>
          ))}
        </div>

        {report && (
          <div role="status" className="ap-row" style={{ display: 'block', marginTop: 10 }}>
            <b>Thème activé</b>
            <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{report.applied.map((s, i) => <li key={i} className="small">{s}</li>)}</ul>
            {report.skipped.length > 0 && <><b className="small" style={{ display: 'block', marginTop: 6 }}>Non appliqué</b><ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>{report.skipped.map((s, i) => <li key={i} className="small">{s}</li>)}</ul></>}
            <p className="small" style={{ margin: '8px 0 0' }}>Relisez puis publiez les pages en brouillon : <a href="/editeur">ouvrir l’éditeur visuel</a>.</p>
          </div>
        )}
      </div>
    </section>
  );
}
