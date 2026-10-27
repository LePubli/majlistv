'use client';
// Admin → E-mails de cycle de vie (étape 33) : interrupteur général, aperçu (combien d'e-mails partiraient, SANS rien envoyer),
// envois récents, passage manuel et e-mails d'essai. Les délais, la plage horaire et le plafond se règlent dans
// Admin → Paramètres → « E-mails de cycle de vie ». Rafraîchi toutes les minutes.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';

const KIND = {
  resume_talk: ['Reprise', 'Conférence commencée (≥ 2 min), laissée de côté depuis quelques jours : « Reprenez là où vous vous êtes arrêté ».'],
  welcome_nudge: ['Par où commencer', 'Compte créé depuis quelques jours sans aucune conférence regardée : trois conférences pour démarrer.'],
  winback: ['Retour', 'Abonnement terminé depuis quelques jours (plus aucun accès) : les nouveautés depuis son départ.'],
};

export default function LifecycleAdmin() {
  const { call } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => call('/admin/lifecycle').then((r) => { if (r.ok) { setD(r.data); setErr(''); } else setErr(r.data?.error || 'Chargement impossible.'); }), [call]);
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);

  const toggle = async (value) => {
    setBusy('master'); setMsg(''); setErr('');
    const r = await call('/admin/settings', { method: 'PUT', body: JSON.stringify({ values: { lifecycle_enabled: value ? 'true' : 'false' } }) });
    setBusy('');
    if (r.ok) { setMsg(value ? 'E-mails de cycle de vie activés : le premier passage a lieu dans les 15 minutes (dans la plage horaire).' : 'E-mails de cycle de vie désactivés.'); load(); } else setErr(r.data?.error || 'Action impossible.');
  };
  const run = async () => {
    setBusy('run'); setMsg(''); setErr('');
    const r = await call('/admin/lifecycle/run', { method: 'POST' });
    setBusy('');
    if (r.ok) { setMsg(r.data.queued ? `${r.data.queued} e-mail${r.data.queued > 1 ? 's' : ''} mis en file.` : 'Rien à envoyer pour le moment (interrupteur, plage horaire, plafond ou personne éligible).'); load(); } else setErr(r.data?.error || 'Action impossible.');
  };
  const test = async (kind) => {
    setBusy(`test-${kind}`); setMsg(''); setErr('');
    const r = await call('/admin/lifecycle/test', { method: 'POST', body: JSON.stringify({ kind }) });
    setBusy('');
    if (r.ok) setMsg(`Exemple « ${KIND[kind][0]} » envoyé à ${r.data.to}.`); else setErr(r.data?.error || 'Action impossible.');
  };

  if (err && !d) return <p className="error" role="alert">{err}</p>;
  if (!d) return <p className="health-muted">Chargement…</p>;
  const c = d.cfg;
  const total = Object.entries(d.kinds).filter(([, k]) => k.enabled).reduce((n, [, k]) => n + k.count, 0);
  return (
    <div className="health">
      <div className={`health-banner ${c.master ? 'ok' : 'warn'}`} role="status">
        <strong>{c.master ? 'Activés' : 'Désactivés'}</strong>
        <span>{c.master ? `Plage d’envoi ${c.from === c.to ? 'toute la journée' : `${c.from} h – ${c.to} h`} (heure de Paris), plafond ${c.dailyMax} par jour, ${d.sentToday} envoyé${d.sentToday > 1 ? 's' : ''} aujourd’hui.` : 'Rien n’est envoyé tant que l’interrupteur est coupé. Regardez l’aperçu ci-dessous avant de l’activer.'}</span>
        {!d.smtp && <span className="health-warn-text">Envoi d’e-mails non configuré (Admin → Paramètres → E-mails).</span>}
      </div>

      <section className="card health-block">
        <h3>Aperçu : qui recevrait un e-mail maintenant</h3>
        <p className="health-muted">Calcul en direct, aucun e-mail n’est envoyé. Les personnes qui ont refusé ces e-mails, ou qui en ont déjà reçu un depuis {c.gapDays} jour{c.gapDays > 1 ? 's' : ''}, sont exclues.</p>
        <ul className="health-tables">
          {Object.entries(d.kinds).map(([k, v]) => (
            <li key={k}>
              <span><strong>{KIND[k][0]}</strong>{!v.enabled && ' (coupé)'}<br /><small className="health-muted">{KIND[k][1]}</small>{v.sample.length > 0 && <><br /><small className="health-muted">Par exemple : {v.sample.map((s) => s.email).join(', ')}</small></>}</span>
              <strong>{v.count}</strong>
            </li>
          ))}
        </ul>
        <p><strong>{total}</strong> e-mail{total > 1 ? 's' : ''} au total{d.remaining < total ? ` (limité à ${d.remaining} aujourd’hui par le plafond)` : ''}.{!d.inWindow && c.master ? ` Hors plage horaire en ce moment (il est ${d.hour} h à Paris).` : ''}</p>
        <div className="health-actions">
          {c.master
            ? <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => toggle(false)}>{busy === 'master' ? '…' : 'Désactiver'}</button>
            : <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => toggle(true)}>{busy === 'master' ? '…' : `Activer (${total} e-mail${total > 1 ? 's' : ''} pourraient partir)`}</button>}
          <button type="button" className="btn ghost" disabled={Boolean(busy) || !c.master} onClick={run}>{busy === 'run' ? 'Passage…' : 'Lancer un passage maintenant'}</button>
          <a className="btn ghost" href="/admin?tab=settings&section=lifecycle">Régler les délais</a>
        </div>
        {msg && <p className="health-ok" role="status">{msg}</p>}
        {err && <p className="error" role="alert">{err}</p>}
      </section>

      <section className="card health-block">
        <h3>Envoyés ces 14 derniers jours</h3>
        <ul className="health-tables">
          {Object.keys(KIND).map((k) => <li key={k}><span>{KIND[k][0]}</span><strong>{d.sent14[k] || 0}</strong></li>)}
        </ul>
        <p className="health-muted">Chaque e-mail est envoyé au plus une fois par situation (par conférence, par compte ou par abonnement), avec un lien de désinscription en un clic. Les e-mails de fin d’essai, de paiement refusé et de résiliation existent déjà et ne sont pas concernés.</p>
      </section>

      <section className="card health-block">
        <h3>Recevoir un exemple</h3>
        <p className="health-muted">Envoie le modèle à votre propre adresse (dans votre langue), sans rien écrire dans le journal.</p>
        <div className="health-actions">
          {Object.keys(KIND).map((k) => <button key={k} type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => test(k)}>{busy === `test-${k}` ? '…' : KIND[k][0]}</button>)}
        </div>
      </section>
    </div>
  );
}
