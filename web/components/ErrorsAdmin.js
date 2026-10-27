'use client';
// Admin → Erreurs (étape 39) : erreurs du serveur et du navigateur, regroupées, avec leur trace et un état (ouverte / résolue / ignorée).
// Aucune donnée personnelle n'est enregistrée. Une alerte e-mail part à la première apparition d'une erreur et quand une erreur « résolue » revient.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';

const STATES = [['open', 'Ouvertes'], ['resolved', 'Résolues'], ['ignored', 'Ignorées'], ['all', 'Toutes']];
const SOURCES = [['all', 'Serveur et site'], ['api', 'Serveur'], ['web', 'Site (navigateur)']];
const ago = (s) => (s ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function ErrorsAdmin() {
  const { call } = useApp();
  const [state, setState] = useState('open');
  const [source, setSource] = useState('all');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(null); // empreinte dépliée
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => call(`/admin/errors?state=${state}&source=${source}`).then((r) => { if (r.ok) { setD(r.data); setErr(''); } else setErr(r.data?.error || 'Chargement impossible.'); }), [call, state, source]);
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);

  const toggle = async (fp) => {
    if (open === fp) { setOpen(null); setDetail(null); return; }
    setOpen(fp); setDetail(null);
    const r = await call(`/admin/errors/${fp}`);
    if (r.ok) setDetail(r.data); else setErr(r.data?.error || 'Détail introuvable.');
  };
  const setErrState = async (fp, next) => {
    setBusy(fp);
    const r = await call(`/admin/errors/${fp}`, { method: 'PUT', body: JSON.stringify({ state: next }) });
    setBusy('');
    if (r.ok) { setMsg(next === 'resolved' ? 'Marquée résolue : elle rouvrira toute seule si elle revient.' : next === 'ignored' ? 'Ignorée : plus d’alerte pour cette erreur.' : 'Rouverte.'); setOpen(null); load(); } else setErr(r.data?.error || 'Action impossible.');
  };
  const test = async () => {
    setBusy('test'); setMsg(''); setErr('');
    await call('/admin/errors/test', { method: 'POST' }); // renvoie volontairement une erreur 500 : c'est le but de l'essai
    setBusy('');
    setMsg('Erreur d’essai déclenchée : elle apparaît ci-dessous dans quelques secondes et un e-mail d’alerte part (si les e-mails sont configurés).');
    setTimeout(load, 2000);
  };

  if (err && !d) return <p className="error" role="alert">{err}</p>;
  if (!d) return <p className="health-muted">Chargement…</p>;
  return (
    <div className="health">
      <div className={`health-banner ${d.counts.open > 0 ? 'warn' : 'ok'}`} role="status">
        <strong>{d.counts.open > 0 ? `${d.counts.open} erreur${d.counts.open > 1 ? 's' : ''} ouverte${d.counts.open > 1 ? 's' : ''}` : 'Aucune erreur ouverte'}</strong>
        <span className="health-muted">{d.last24h} occurrence{d.last24h > 1 ? 's' : ''} sur les dernières 24 h</span>
      </div>

      <div className="health-actions" role="group" aria-label="Filtres">
        {STATES.map(([k, l]) => <button key={k} type="button" className={`btn ${state === k ? '' : 'ghost'}`} aria-pressed={state === k} onClick={() => setState(k)}>{l}{k !== 'all' && d.counts[k] != null ? ` (${d.counts[k]})` : ''}</button>)}
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Origine">{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      {msg && <p className="health-ok" role="status">{msg}</p>}
      {err && <p className="error" role="alert">{err}</p>}

      {d.items.length === 0 ? <section className="card health-block"><p>Rien à afficher dans cette liste.</p></section> : d.items.map((g) => (
        <section key={g.fingerprint} className="card health-block">
          <h3 style={{ overflowWrap: 'anywhere' }}>{g.message}</h3>
          <p className="health-muted">{g.source === 'api' ? 'Serveur' : 'Site (navigateur)'}{g.route ? ` · ${g.method ? `${g.method} ` : ''}${g.route}` : ''}{g.httpStatus ? ` · ${g.httpStatus}` : ''} · <strong>{g.count} fois</strong> · première le {ago(g.firstAt)} · dernière le {ago(g.lastAt)}</p>
          <div className="health-actions">
            <button type="button" className="btn ghost" aria-expanded={open === g.fingerprint} onClick={() => toggle(g.fingerprint)}>{open === g.fingerprint ? 'Masquer le détail' : 'Voir le détail'}</button>
            {g.state !== 'resolved' && <button type="button" className="btn" disabled={busy === g.fingerprint} onClick={() => setErrState(g.fingerprint, 'resolved')}>Marquer résolue</button>}
            {g.state !== 'ignored' && <button type="button" className="btn ghost" disabled={busy === g.fingerprint} onClick={() => setErrState(g.fingerprint, 'ignored')}>Ignorer</button>}
            {g.state !== 'open' && <button type="button" className="btn ghost" disabled={busy === g.fingerprint} onClick={() => setErrState(g.fingerprint, 'open')}>Rouvrir</button>}
          </div>
          {open === g.fingerprint && (detail ? (
            <>
              {detail.stack && <pre className="health-code" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{detail.stack}</pre>}
              <p className="health-muted">Dernières occurrences :</p>
              <ul className="health-lines">{detail.events.map((e, i) => <li key={i}>{ago(e.at)}{e.path ? ` · ${e.path}` : ''}{e.userAgent ? ` · ${e.userAgent}` : ''}</li>)}</ul>
              <p className="health-muted">Pour la faire corriger : copiez le message et la trace ci-dessus et dites à Claude « corrige cette erreur ».</p>
            </>
          ) : <p className="health-muted">Chargement du détail…</p>)}
        </section>
      ))}

      <section className="card health-block">
        <h3>À propos</h3>
        <p className="health-muted">Le serveur enregistre ses erreurs internes (code 500) et le site envoie les erreurs JavaScript de ses pages. Elles sont regroupées (même message + même page = une seule ligne, avec un compteur). Aucune donnée personnelle n’est conservée : ni compte, ni adresse IP ; e-mails, jetons et paramètres d’adresse sont masqués. Les occurrences sont gardées 30 jours, les erreurs résolues ou ignorées 90 jours. Alertes e-mail et destinataires : Paramètres → Santé du serveur.</p>
        <div className="health-actions"><button type="button" className="btn ghost" disabled={busy === 'test'} onClick={test}>{busy === 'test' ? 'Envoi…' : 'Déclencher une erreur d’essai'}</button></div>
      </section>
    </div>
  );
}
