'use client';
// Admin → Tests A/B (amélioration 7.2) : comparer l'original d'une zone du site à 1 ou 2 variantes de textes,
// mesurer les inscriptions, puis « garder » la meilleure (ses textes deviennent ceux du site, modifiables dans Admin → Textes).
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';
import { DICT } from '../lib/i18n';

const STATUS = { draft: ['Brouillon', 'meta'], running: ['En cours', 'ok'], paused: ['En pause', 'meta'], ended: ['Terminé', 'meta'] };
const LANG_NAME = { fr: 'Français', en: 'Anglais', ar: 'Arabe' };
const VERDICT = {
  reference: 'Référence',
  collecting: 'Pas assez de données',
  better: 'Meilleure que l’original',
  worse: 'Moins bonne que l’original',
  inconclusive: 'Pas de différence nette pour l’instant',
};
const pct = (n) => `${String(n).replace('.', ',')} %`;
const day = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
const blank = (n) => ({ name: n === 0 ? 'Original' : `Variante ${'ABC'[n]}`, weight: 50, texts: {}, options: {} });

function Form({ zones, langs, onDone, onCancel }) {
  const { call } = useApp();
  const [name, setName] = useState('');
  const [zone, setZone] = useState(zones[0]?.id || '');
  const [vars, setVars] = useState([blank(0), blank(1)]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const z = zones.find((x) => x.id === zone);
  const upd = (i, patch) => setVars((vs) => vs.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  const setOpt = (i, k, val) => setVars((vs) => vs.map((v, n) => (n === i ? { ...v, options: { ...v.options, [k]: val } } : v)));
  const setText = (i, lang, key, val) => setVars((vs) => vs.map((v, k) => (k === i ? { ...v, texts: { ...v.texts, [lang]: { ...(v.texts[lang] || {}), [key]: val } } } : v)));
  const total = vars.reduce((s, v) => s + Number(v.weight || 0), 0);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const body = { name, zone, variants: vars.map((v) => ({ name: v.name, weight: Number(v.weight), texts: v.texts, options: v.options })) };
    const r = await call('/admin/experiments', { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) onDone(); else setErr(r.data?.error || 'Enregistrement impossible.');
  };
  return (
    <form className="form card xp-form" onSubmit={submit}>
      <h2>Nouveau test</h2>
      <div className="form-grid">
        <label>Nom du test<input required maxLength={120} value={name} placeholder="Ex. accroche courte" onChange={(e) => setName(e.target.value)} /></label>
        <label>Zone testée<select value={zone} onChange={(e) => { setZone(e.target.value); setVars((vs) => vs.map((v) => ({ ...v, texts: {}, options: {} }))); }}>{zones.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
      </div>
      <p className="meta">L’objectif est l’<b>inscription</b> d’un visiteur. La variante <b>A est toujours l’original</b> (textes actuels du site). Pour B (et C), changez seulement ce que vous voulez tester (textes, et réglages de présentation s’il y en a) ; un champ vide garde l’existant. Les parts sont des poids : 50 / 50 = moitié-moitié.</p>
      {vars.map((v, i) => (
        <fieldset key={i} className="xp-var">
          <legend>Variante {'ABC'[i]}{i === 0 ? ' — original' : ''}</legend>
          <div className="form-grid">
            <label>Nom<input required maxLength={60} value={v.name} onChange={(e) => upd(i, { name: e.target.value })} /></label>
            <label>Part du trafic ({total ? Math.round((v.weight / total) * 100) : 0} %)<input type="number" min={1} max={100} required value={v.weight} onChange={(e) => upd(i, { weight: e.target.value })} /></label>
          </div>
          {i > 0 && Object.keys(z?.options || {}).length > 0 && (
            <div className="form-grid">
              {Object.entries(z.options).map(([k, o]) => (
                <label key={k}>{o.label}
                  <select value={v.options[k] || ''} onChange={(e) => setOpt(i, k, e.target.value)}>
                    <option value="">Comme actuellement sur le site</option>
                    {Object.entries(o.values).map(([val, name]) => <option key={val} value={val}>{name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
          {i > 0 && langs.map((lang) => (
            <div key={lang} className="xp-lang">
              <b>{LANG_NAME[lang]}</b>
              <div className="form-grid">
                {Object.entries(z?.keys || {}).map(([key, label]) => (
                  <label key={key}>{label}
                    <input dir={lang === 'ar' ? 'rtl' : 'ltr'} maxLength={300} value={v.texts[lang]?.[key] || ''} placeholder={DICT[lang]?.[key] || ''} onChange={(e) => setText(i, lang, key, e.target.value)} />
                  </label>
                ))}
              </div>
            </div>
          ))}
          {i === 2 && <button type="button" className="btn ghost" onClick={() => setVars(vars.slice(0, 2))}>Retirer cette variante</button>}
        </fieldset>
      ))}
      {vars.length < 3 && <button type="button" className="btn ghost" onClick={() => setVars([...vars, blank(2)])}>+ Ajouter une 3ᵉ variante</button>}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="studio-tools">
        <button className="btn" disabled={busy}>{busy ? 'Enregistrement…' : 'Créer le test (brouillon)'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

function Results({ e, onKeep }) {
  const best = e.variants.find((v) => v.verdict === 'better');
  return (
    <div className="adm-table-wrap">
      <table className="adm-table xp-table">
        <thead><tr><th>Variante</th><th>Part</th><th>Visiteurs</th><th>Clics bouton</th><th>Inscriptions</th><th>Taux d’inscription</th><th>Écart</th><th>Confiance</th><th>Verdict</th></tr></thead>
        <tbody>
          {e.variants.map((v) => (
            <tr key={v.key} className={v.verdict === 'better' ? 'xp-best' : undefined}>
              <td><b>{v.key}</b> {v.name}{v.key === e.winner ? ' 🏆' : ''}</td>
              <td>{v.weight}</td><td>{v.visitors}</td><td>{v.clicks} ({pct(v.clickRate)})</td><td>{v.conversions}</td><td>{pct(v.rate)}</td>
              <td>{v.lift == null ? '—' : `${v.lift > 0 ? '+' : ''}${String(v.lift).replace('.', ',')} %`}</td>
              <td>{v.confidence == null ? '—' : pct(v.confidence)}</td>
              <td>{VERDICT[v.verdict]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(e.status === 'running' || e.status === 'paused') && (
        <div className="studio-tools">
          {e.variants.map((v) => <button key={v.key} type="button" className="btn ghost" onClick={() => onKeep(v)}>{v.key === 'A' ? 'Garder l’original (A)' : `Garder la variante ${v.key}`}</button>)}
        </div>
      )}
      {best && e.status !== 'ended' && <p className="meta ok">La variante {best.key} fait mieux que l’original avec {pct(best.confidence)} de confiance : vous pouvez la garder.</p>}
      <p className="meta small">« Pas assez de données » : il faut au moins 100 visiteurs par variante et 10 inscriptions au total. « Confiance » = probabilité que l’écart ne soit pas dû au hasard ; en dessous de 95 %, ne concluez pas. Ne terminez pas un test trop tôt : laissez-le tourner au moins une à deux semaines.</p>
    </div>
  );
}

export default function ExperimentsAdmin() {
  const { call } = useApp();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => call('/admin/experiments').then((r) => setData(r.ok ? r.data : { error: r.data?.error || 'Chargement impossible.' })), [call]);
  useEffect(() => { load(); }, [load]);
  const act = async (path, opts, okText) => {
    const r = await call(path, opts);
    if (r.ok) { if (okText) setMsg({ ok: true, text: okText(r.data) }); load(); } else setMsg({ ok: false, text: r.data?.error || 'Action impossible.' });
  };
  const keep = (e, v) => {
    const text = v.key === 'A'
      ? `Terminer le test « ${e.name} » et garder l’original ? Le site ne change pas.`
      : `Terminer le test « ${e.name} » et appliquer la variante ${v.key} au site ? Ses textes remplaceront les textes actuels (modifiables ensuite dans Admin → Textes) et ses réglages de présentation seront enregistrés (Admin → Paramètres → Paiement).`;
    if (window.confirm(text)) act(`/admin/experiments/${e.id}/end`, { method: 'POST', body: JSON.stringify({ winner: v.key, apply: v.key !== 'A' }) }, (d) => (v.key === 'A' ? 'Test terminé : l’original est gardé.' : `Test terminé : variante ${v.key} appliquée (${d.applied} texte(s), ${d.appliedOptions} réglage(s)).`));
  };
  if (!data) return <p className="meta">Chargement…</p>;
  if (data.error) return <p className="error">{data.error}</p>;
  return (
    <section className="xp-admin">
      <p className="meta">Compare l’original d’une zone du site à une ou deux variantes de textes, sur des visiteurs tirés au sort, et mesure laquelle donne le plus d’<b>inscriptions</b>. Un visiteur garde la même variante à chaque visite. Aucune donnée personnelle ; un visiteur qui refuse le suivi (« Do Not Track ») voit toujours l’original et n’est pas compté. Sans test en cours, le site est inchangé.</p>
      {form
        ? <Form zones={data.zones} langs={data.langs} onCancel={() => setForm(false)} onDone={() => { setForm(false); setMsg({ ok: true, text: 'Test créé en brouillon : vérifiez-le puis démarrez-le.' }); load(); }} />
        : <button type="button" className="btn" onClick={() => { setMsg(null); setForm(true); }}>Nouveau test</button>}
      {msg && <p className={msg.ok ? 'meta ok' : 'error'} role="status">{msg.text}</p>}
      {!data.experiments.length && !form && <p className="meta">Aucun test pour l’instant.</p>}
      <ul className="xp-list">
        {data.experiments.map((e) => {
          const [label, cls] = STATUS[e.status];
          return (
            <li key={e.id} className="card xp-item">
              <div className="adm-row adm-between">
                <b>{e.name}</b>
                <small className={cls}>{label}{e.startedAt ? ` · démarré le ${day(e.startedAt)}` : ''}{e.endedAt ? ` · terminé le ${day(e.endedAt)}` : ''}</small>
              </div>
              <small className="meta">Zone : {e.zoneLabel} · objectif : inscription</small>
              <Results e={e} onKeep={(v) => keep(e, v)} />
              {e.variants.filter((v) => v.key !== 'A').map((v) => (
                <details key={v.key} className="meta"><summary>Changements de la variante {v.key} — {v.name}</summary>
                  <ul>{Object.entries(v.options || {}).map(([k, val]) => { const o = data.zones.find((z) => z.id === e.zone)?.options?.[k]; return <li key={k}><b>{o?.label || k}</b> : {o?.values?.[val] || val}</li>; })}
                    {Object.entries(v.texts).flatMap(([lang, map]) => Object.entries(map).map(([k, t]) => <li key={lang + k}><b>{LANG_NAME[lang]}</b> · {data.zones.find((z) => z.id === e.zone)?.keys[k] || k} : « {t} »</li>))}</ul>
                </details>
              ))}
              <div className="studio-tools">
                {(e.status === 'draft' || e.status === 'paused') && <button type="button" className="btn" onClick={() => act(`/admin/experiments/${e.id}/start`, { method: 'POST' }, () => 'Test démarré : les visiteurs sont répartis dès maintenant.')}>{e.status === 'draft' ? 'Démarrer' : 'Reprendre'}</button>}
                {e.status === 'running' && <button type="button" className="btn ghost" onClick={() => act(`/admin/experiments/${e.id}/pause`, { method: 'POST' }, () => 'Test en pause : le site montre l’original.')}>Mettre en pause</button>}
                {(e.status === 'running' || e.status === 'paused') && <button type="button" className="btn ghost" onClick={() => window.confirm('Terminer le test sans rien appliquer ? Le site garde l’original.') && act(`/admin/experiments/${e.id}/end`, { method: 'POST', body: '{}' }, () => 'Test terminé, rien n’est appliqué.')}>Terminer sans rien appliquer</button>}
                {(e.status === 'draft' || e.status === 'ended') && <button type="button" className="btn ghost" onClick={() => window.confirm(`Supprimer le test « ${e.name} » et ses chiffres ?`) && act(`/admin/experiments/${e.id}`, { method: 'DELETE' }, () => 'Test supprimé.')}>Supprimer</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
