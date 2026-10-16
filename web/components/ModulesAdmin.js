'use client';
// Étape M1 — Administration → Modules : la liste des modules installés (livrés par zip puis redéployés), leur version, un
// interrupteur, leurs dépendances et leurs réglages. Les données d'un module ne sont jamais supprimées en le coupant.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from './Providers';
import { hasWebModule, webModule } from '../lib/modules';

const STATUS = { on: ['Activé', 'on'], off: ['Désactivé', ''], error: ['Erreur', 'warn'], absent: ['Absent du code', 'warn'] };

function Field({ f, value, onChange }) {
  const id = `mf-${f.key}`;
  if (f.type === 'bool') return <label className="pe-f"><span className="pe-lab">{f.label}</span><select id={id} value={value} onChange={(e) => onChange(e.target.value)}><option value="true">Oui</option><option value="false">Non</option></select></label>;
  if (f.type === 'select') return <label className="pe-f"><span className="pe-lab">{f.label}</span><select id={id} value={value} onChange={(e) => onChange(e.target.value)}>{(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;
  const secret = f.type === 'secret' || f.type === 'secret_text';
  return (
    <label className="pe-f"><span className="pe-lab">{f.label}</span>
      <input id={id} type={secret ? 'password' : f.type === 'number' ? 'number' : 'text'} autoComplete="off" min={f.min ?? undefined} max={f.max ?? undefined}
        value={value} placeholder={secret ? (f.isSet ? `Défini ${f.hint} — laisser vide pour le garder` : 'Non défini') : f.default || ''} onChange={(e) => onChange(e.target.value)} />
      {f.help && <span className="meta small">{f.help}</span>}
      {!secret && f.source && f.source !== 'db' && <span className="meta small">Valeur actuelle : {f.source === 'env' ? 'variable d’environnement' : 'valeur par défaut'}.</span>}
    </label>
  );
}

function Card({ m, onChange, call }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [label, cls] = STATUS[m.status] || STATUS.off;
  const switchable = m.id && m.status !== 'error' && m.status !== 'absent';
  const put = async (body) => {
    setBusy(true); setMsg('');
    const r = await call(`/admin/modules/${m.id}`, { method: 'PUT', body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) { onChange(r.data); return true; }
    setMsg(r.data?.error || 'Échec de l’enregistrement.'); return false;
  };
  const save = async () => {
    const body = {};
    for (const [k, v] of Object.entries(vals)) body[k] = v === '' ? null : v;
    if (!Object.keys(body).length) { setMsg('Rien n’a changé.'); return; }
    if (await put({ settings: body })) { setVals({}); setMsg('Réglages enregistrés.'); }
  };
  const cur = (f) => (vals[f.key] !== undefined ? vals[f.key] : f.type === 'secret' || f.type === 'secret_text' ? '' : f.value ?? '');
  return (
    <article className="md-card" aria-label={m.name}>
      <header className="md-head">
        <div>
          <h3>{m.name} <span className="ap-tag">v{m.version || '?'}</span> <span className={`ap-pill ${cls === 'on' ? 'on' : ''}`}>{label}</span></h3>
          <p className="meta small">{m.description}</p>
          {m.installedVersion && m.version && m.installedVersion !== m.version && <p className="meta small">Version enregistrée en base : v{m.installedVersion}.</p>}
          {m.feature && <p className="meta small">Lié à la fonction « {m.feature} » : même interrupteur que dans Admin → Fonctions.</p>}
          {m.id && m.status !== 'absent' && (hasWebModule(m.id)
            ? (webModule(m.id).paths || []).length > 0 && <p className="meta small">Écrans du site : présents.</p>
            : <p className="meta small">Pas d’écran sur le site pour ce module (partie web absente ou inutile).</p>)}
        </div>
        {switchable && (
          <button type="button" role="switch" aria-checked={m.status === 'on'} aria-label={`Activer le module ${m.name}`} disabled={busy}
            className={`ft-switch${m.status === 'on' ? ' on' : ''}`} onClick={() => put({ enabled: m.status !== 'on' })}><span className="ft-knob" aria-hidden="true" /></button>
        )}
      </header>
      {m.admin && m.status !== 'absent' && <p><Link className="link u" href={m.admin.href}>{m.admin.label} →</Link></p>}
      {m.error && <p className="pe-err" role="alert">{m.error}</p>}
      {m.requires.length > 0 && <p className="meta small">Nécessite : {m.requires.map((r) => `${r.name}${!r.present ? ' (absent)' : r.enabled ? ' ✓' : ' (désactivé)'}`).join(', ')}.</p>}
      {m.dependents.length > 0 && <p className="meta small">Utilisé par : {m.dependents.map((d) => `${d.name}${d.enabled ? ' (actif)' : ''}`).join(', ')}.</p>}
      {msg && <p className="meta small" role="status" aria-live="polite">{msg}</p>}
      {m.fields.length > 0 && (
        <>
          <button type="button" className="link u" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Masquer les réglages' : `Réglages (${m.fields.length})`}</button>
          {open && (
            <div className="md-fields">
              {m.fields.map((f) => <Field key={f.key} f={f} value={cur(f)} onChange={(v) => setVals({ ...vals, [f.key]: v })} />)}
              <div className="em-actions"><button type="button" className="btn" disabled={busy} onClick={save}>Enregistrer les réglages</button></div>
              <p className="meta small">Un champ vidé revient à la valeur d’origine. Les clés secrètes sont chiffrées et ne sont jamais réaffichées.</p>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default function ModulesAdmin() {
  const { call } = useApp();
  const router = useRouter();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => { const r = await call('/admin/modules'); if (r.ok) setD(r.data); else setMsg(r.data?.error || 'Impossible de charger les modules.'); }, [call]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <p className="meta" role="status">{msg || 'Chargement…'}</p>;
  return (
    <section className="md-admin">
      <p className="meta">Un module est une fonction livrée dans un dossier à part (<code>api/src/modules/&lt;nom&gt;</code>) : on le dépose avec le zip, on redéploie l’API, puis il apparaît ici. Un nouveau module arrive <b>désactivé</b>. Le couper ferme ses routes sans supprimer ses données.</p>
      {d.modules.length === 0 && <p className="meta">Aucun module installé.</p>}
      <div className="md-list">
        {d.modules.map((m) => <Card key={m.folder || m.id} m={m} call={call} onChange={(data) => { setD(data); router.refresh(); }} />)}
      </div>
    </section>
  );
}
