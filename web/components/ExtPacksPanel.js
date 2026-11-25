'use client';
// Lot X1 — Administration → Fonctions → « Extensions » : envoyer une extension (.zip), la contrôler, l'installer, l'activer, régler ses options.
// Une extension ajoute des blocs, réglages, fonctions et textes. Elle ne contient aucun code exécutable.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './Providers';

const readAsDataUrl = (file) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(file); });
const MAX = 6 * 1024 * 1024;
const fr = (o) => (o && typeof o === 'object' ? o.fr || '' : o || '');

function Values({ pack, onSaved }) {
  const { call } = useApp();
  const [s, setS] = useState(pack.values.settings);
  const [f, setF] = useState(pack.values.features);
  const [msg, setMsg] = useState('');
  const save = async () => {
    setMsg('');
    const r = await call(`/admin/ext-packs/${pack.slug}/values`, { method: 'PUT', body: JSON.stringify({ settings: s, features: f }) });
    setMsg(r.ok ? 'Enregistré (visible sur le site dans les 15 secondes).' : (r.data?.error || 'Enregistrement impossible.') + (r.data?.errors ? ' ' + Object.entries(r.data.errors).map(([k, v]) => `${k} : ${v}`).join(' · ') : ''));
    if (r.ok) onSaved?.();
  };
  if (!pack.settings.length && !pack.features.length) return null;
  return (
    <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
      {pack.features.map((x) => (
        <label key={x.key}><input type="checkbox" checked={Boolean(f[x.key])} onChange={(e) => setF({ ...f, [x.key]: e.target.checked })} /> {fr(x.label)}
          {x.description && <span className="meta small" style={{ display: 'block' }}>{fr(x.description)}</span>}</label>
      ))}
      {pack.settings.map((x) => (
        <label key={x.key} className="small">{fr(x.label)}
          {x.type === 'bool' ? <input type="checkbox" checked={Boolean(s[x.key])} onChange={(e) => setS({ ...s, [x.key]: e.target.checked })} />
            : x.type === 'select' ? <select value={s[x.key] ?? ''} onChange={(e) => setS({ ...s, [x.key]: e.target.value })}>{x.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            : x.type === 'number' ? <input type="number" value={s[x.key] ?? 0} onChange={(e) => setS({ ...s, [x.key]: Number.parseInt(e.target.value || '0', 10) || 0 })} />
            : x.type === 'color' ? <input type="color" value={s[x.key] || '#C9A24B'} onChange={(e) => setS({ ...s, [x.key]: e.target.value })} />
            : <input type="text" value={s[x.key] ?? ''} maxLength={300} onChange={(e) => setS({ ...s, [x.key]: e.target.value })} />}
          {x.help && <span className="meta small" style={{ display: 'block' }}>{fr(x.help)}</span>}
        </label>
      ))}
      <span><button type="button" className="btn ghost" onClick={save}>Enregistrer les réglages</button> {msg && <span className="meta small" role="status">{msg}</span>}</span>
    </div>
  );
}

export default function ExtPacksPanel() {
  const { call } = useApp();
  const [list, setList] = useState(null);
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [used, setUsed] = useState(null);
  const fileRef = useRef(null);
  const load = useCallback(() => call('/admin/ext-packs').then((r) => { if (r.ok) setList(r.data); }), [call]);
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
    setCheck(null); setMsg(''); setUsed(null);
    if (!file) return;
    if (file.size > MAX) { setMsg('Extension trop lourde (6 Mo au maximum).'); return; }
    setBusy('inspect');
    const data = await readAsDataUrl(file);
    const r = await call('/admin/ext-packs/inspect', { method: 'POST', body: JSON.stringify({ file: data }) });
    setBusy('');
    if (!r.ok) { setMsg(r.data?.error || 'Contrôle impossible.'); return; }
    setCheck({ ...r.data, file: data });
  };
  const install = async () => {
    setBusy('install'); setMsg(''); setUsed(null);
    const r = await call('/admin/ext-packs', { method: 'POST', body: JSON.stringify({ file: check.file }) });
    setBusy('');
    if (!r.ok) { if (r.data?.usedIn) setUsed(r.data.usedIn); setCheck({ ...check, ok: false, errors: r.data?.errors || [r.data?.error || 'Installation impossible.'] }); return; }
    setMsg(`Extension « ${r.data.name} » installée. Elle n’est pas encore active : cliquez sur « Activer ».`);
    setCheck(null); if (fileRef.current) fileRef.current.value = '';
    load();
  };
  const act = async (p, what) => {
    setBusy(what + p.slug); setMsg(''); setUsed(null);
    const r = what === 'del' ? await call(`/admin/ext-packs/${p.slug}`, { method: 'DELETE' }) : await call(`/admin/ext-packs/${p.slug}/${what === 'on' ? 'activate' : 'deactivate'}`, { method: 'POST', body: '{}' });
    setBusy('');
    if (!r.ok) { setMsg(r.data?.error || 'Action impossible.'); if (r.data?.usedIn) setUsed(r.data.usedIn); return; }
    setMsg(what === 'on' ? 'Extension activée : ses blocs sont dans l’éditeur visuel (groupe « Extensions »).' : what === 'off' ? 'Extension désactivée.' : 'Extension supprimée.');
    load();
  };

  return (
    <section className="ap-group" style={{ marginBottom: 14 }} aria-labelledby="xp-h">
      <h2 id="xp-h" style={{ padding: '12px 14px' }}>Extensions (.zip)</h2>
      <div className="ap-group-body">
        <p className="meta small">Une extension ajoute au site des blocs (gabarits HTML sûrs, assemblages, listes du catalogue), des réglages, des fonctions activables et des textes FR / EN / AR. Elle ne contient aucun code exécutable et ne modifie pas le code du site : ses blocs se posent depuis l’éditeur visuel.</p>
        <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost" onClick={() => download('/admin/ext-packs/example.zip', 'extension-exemple.zip')}>Télécharger l’extension d’exemple</button>
          <button type="button" className="btn ghost" onClick={() => download('/admin/ext-packs/guide.md', 'GUIDE-EXTENSIONS-IA.md')}>Télécharger le guide pour IA (.md)</button>
        </p>
        <div className="bm-form" style={{ marginTop: 10 }}>
          <label>Envoyer une extension (.zip)
            <input ref={fileRef} type="file" accept=".zip,application/zip" onChange={inspect} disabled={Boolean(busy)} />
          </label>
        </div>
        {busy === 'inspect' && <p className="meta small" role="status">Contrôle de l’extension…</p>}
        {check && (
          <div role="status" className="ap-row" style={{ display: 'block', marginTop: 8 }}>
            {check.ok ? (
              <>
                <b>✓ Extension valide : {check.summary.name} {check.summary.version}</b>
                <span className="meta small" style={{ display: 'block' }}>{check.summary.blocks} bloc(s) gabarit · {check.summary.composed} bloc(s) composé(s) · {check.summary.settings} réglage(s) · {check.summary.features} fonction(s) · {check.summary.texts} texte(s) · CSS {Math.round(check.summary.cssBytes / 1024 * 10) / 10} Ko</span>
                {check.warnings?.map((w, i) => <span key={i} className="meta small" style={{ display: 'block' }}>⚠ {w}</span>)}
                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={install} disabled={busy === 'install'}>{busy === 'install' ? 'Installation…' : 'Installer cette extension'}</button>
              </>
            ) : (
              <>
                <b>✗ Cette extension est refusée ({check.errors.length} problème{check.errors.length > 1 ? 's' : ''})</b>
                <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{check.errors.slice(0, 30).map((e, i) => <li key={i} className="small">{e}</li>)}</ul>
                <span className="meta small" style={{ display: 'block', marginTop: 4 }}>Corrigez l’extension (ou renvoyez ces messages à l’IA qui l’a faite), puis renvoyez le .zip.</span>
              </>
            )}
          </div>
        )}
        {msg && <p className="meta small" role="status">{msg}</p>}
        {used && used.length > 0 && (
          <div className="ap-row" style={{ display: 'block' }}>
            <b className="small">Pages ou modèles qui utilisent encore ses blocs</b>
            <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>{used.map((u, i) => <li key={i} className="small">{u.title} <span className="meta small">{u.path}</span></li>)}</ul>
          </div>
        )}

        <h3 style={{ marginTop: 16 }}>Extensions installées</h3>
        {list && !list.length && <p className="meta small">Aucune extension installée.</p>}
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {(list || []).map((p) => (
            <article key={p.slug} className={`ap-row${p.active ? ' changed' : ''}`} style={{ display: 'block' }}>
              <b>{p.name} <span className="meta small">v{p.version}</span> {p.active && <span className="ap-tag">Active</span>}</b>
              {p.author && <span className="meta small" style={{ display: 'block' }}>par {p.author}</span>}
              {p.description && <span className="meta small" style={{ display: 'block' }}>{p.description}</span>}
              <span className="meta small" style={{ display: 'block' }}>Blocs : {p.blocks.map((b) => b.label).join(' · ') || 'aucun'}</span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {p.active
                  ? <button type="button" className="btn ghost" onClick={() => act(p, 'off')} disabled={Boolean(busy)}>Désactiver</button>
                  : <>
                    <button type="button" className="btn" onClick={() => act(p, 'on')} disabled={Boolean(busy)}>Activer</button>
                    <button type="button" className="btn ghost" onClick={() => { if (window.confirm(`Supprimer l’extension « ${p.name} » ?`)) act(p, 'del'); }} disabled={Boolean(busy)}>Supprimer</button>
                  </>}
              </span>
              <Values pack={p} onSaved={load} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
