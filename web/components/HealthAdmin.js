'use client';
// Admin → Santé du serveur (étape 29) : disque, mémoire, charge, historique 7 jours, base de données, état des alertes e-mail.
// Le disque est celui qui porte Docker sur le serveur (même chiffre que `df -h /`). Les seuils et les destinataires se règlent dans
// Admin → Paramètres → « Santé du serveur ». Rafraîchi toutes les minutes.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';

const LEVEL = { ok: ['Tout va bien', 'ok'], warn: ['À surveiller', 'warn'], crit: ['Critique', 'crit'] };
const GB = 1024 ** 3;
const size = (n) => (n >= GB ? `${(n / GB).toFixed(1)} Go` : n >= 1024 ** 2 ? `${Math.round(n / 1024 ** 2)} Mo` : `${Math.round(n / 1024)} Ko`);
const uptime = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return d ? `${d} j ${h} h` : `${h} h ${Math.floor((s % 3600) / 60)} min`; };
const days = (n) => (n < 1 ? 'moins d’un jour' : `${Math.round(n)} jour${Math.round(n) > 1 ? 's' : ''}`);

/** Jauge en barre : la couleur suit le niveau, la valeur est toujours écrite (jamais la couleur seule). */
function Gauge({ title, pct, level, lines }) {
  return (
    <div className="card health-gauge" data-level={level}>
      <div className="health-gauge-head"><h3>{title}</h3><span className={`health-badge ${level}`}>{LEVEL[level][0]}</span></div>
      <div className="health-pct">{pct}<small> %</small></div>
      <div className="health-bar" role="progressbar" aria-label={title} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <ul className="health-lines">{lines.filter(Boolean).map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

/** Courbe des 7 derniers jours (disque et mémoire), SVG simple, 0–100 %. */
function Spark({ series }) {
  if (series.length < 2) return <p className="health-muted">L’historique se construit : une mesure toutes les 10 minutes, la courbe apparaît dans l’heure qui suit.</p>;
  const W = 600, H = 120, t0 = series[0].t, span = Math.max(1, series[series.length - 1].t - t0);
  const line = (k) => series.filter((p) => p[k] != null).map((p, i) => `${i ? 'L' : 'M'}${(((p.t - t0) / span) * W).toFixed(1)},${(H - (p[k] / 100) * H).toFixed(1)}`).join('');
  return (
    <figure className="health-spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Disque et mémoire utilisés sur les 7 derniers jours">
        {[25, 50, 75].map((g) => <line key={g} x1="0" x2={W} y1={H - (g / 100) * H} y2={H - (g / 100) * H} className="health-grid" />)}
        <path d={line('memPct')} className="health-line mem" />
        <path d={line('diskPct')} className="health-line disk" />
      </svg>
      <figcaption><span className="health-key disk" /> Disque <span className="health-key mem" /> Mémoire · 7 derniers jours · échelle 0–100 %</figcaption>
    </figure>
  );
}

export default function HealthAdmin() {
  const { call } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => call('/admin/health').then((r) => { if (r.ok) { setD(r.data); setErr(''); } else setErr(r.data?.error || 'Chargement impossible.'); }), [call]);
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);

  const act = async (kind, path, ok) => {
    setBusy(kind); setMsg(''); setErr('');
    const r = await call(path, { method: 'POST' });
    setBusy('');
    if (r.ok) { if (kind === 'check') setD(r.data); setMsg(ok(r.data)); } else setErr(r.data?.error || 'Action impossible.');
  };

  if (err && !d) return <p className="error" role="alert">{err}</p>;
  if (!d) return <p className="health-muted">Chargement…</p>;
  const [lvlText, lvl] = LEVEL[d.level];
  const tr = d.disk;
  const trendText = !tr ? '' : !tr.enough ? 'Tendance : pas encore assez de mesures (il faut environ 6 heures).' : tr.daysLeft != null ? `Tendance : le disque se remplit d’environ ${size(Math.max(0, tr.bytesPerDay))} par jour, il serait plein dans environ ${days(tr.daysLeft)}.` : 'Tendance : le disque est stable (ou se libère).';
  const ago = (s) => (s ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const stateOf = (k) => d.alerts.states.find((s) => s.kind === k);

  return (
    <div className="health">
      <div className={`health-banner ${lvl}`} role="status">
        <strong>{lvlText}</strong>
        <span>{lvl === 'ok' ? 'Disque et mémoire sont sous les seuils.' : lvl === 'warn' ? 'Un seuil d’attention est dépassé : pense à libérer de la place (voir plus bas).' : 'Un seuil critique est dépassé : à traiter rapidement.'}</span>
        <span className="health-muted">Serveur allumé depuis {uptime(d.uptimeSec)}</span>
      </div>

      <div className="health-grid-cards">
        {d.disk && <Gauge title="Disque" pct={d.disk.pct} level={d.disk.level} lines={[`${size(d.disk.free)} libres sur ${size(d.disk.total)}`, `Alerte à ${d.thresholds.diskWarn} %, critique à ${d.thresholds.diskCrit} %`]} />}
        <Gauge title="Mémoire" pct={d.mem.pct} level={d.mem.level} lines={[`${size(d.mem.avail)} disponibles sur ${size(d.mem.total)}`, `Critique à ${d.thresholds.memCrit} %`]} />
        <Gauge title="Charge du processeur" pct={d.cpu.loadPct} level={d.cpu.level} lines={[`Moyenne 1 / 5 / 15 min : ${d.cpu.load.join(' · ')}`, `${d.cpu.cpus} cœurs (100 % = tous les cœurs occupés)`]} />
      </div>

      <section className="card health-block">
        <h3>Évolution sur 7 jours</h3>
        <Spark series={d.series} />
        {trendText && <p>{trendText}</p>}
      </section>

      <section className="card health-block">
        <h3>Base de données</h3>
        <p>Taille totale : <strong>{size(d.database.size)}</strong></p>
        <ul className="health-tables">
          {d.database.tables.map((t) => <li key={t.name}><span>{t.name}</span><strong>{size(t.size)}</strong></li>)}
        </ul>
      </section>

      <section className="card health-block">
        <h3>Alertes e-mail</h3>
        <p>
          {d.alerts.enabled ? 'Activées' : 'Désactivées'} · {d.alerts.mailConfigured ? 'envoi d’e-mails configuré' : <strong className="health-warn-text">envoi d’e-mails non configuré : aucune alerte ne partira (Paramètres → E-mails)</strong>} · {d.alerts.recipients} destinataire{d.alerts.recipients > 1 ? 's' : ''}
        </p>
        <ul className="health-lines">
          {['disk', 'mem'].map((k) => { const s = stateOf(k); return <li key={k}>{k === 'disk' ? 'Disque' : 'Mémoire'} : {s ? LEVEL[s.level][0] : '—'}{s?.last_sent_at ? ` · dernier e-mail le ${ago(s.last_sent_at)}` : ''}</li>; })}
        </ul>
        <p className="health-muted">Un e-mail part quand un seuil est franchi, puis un rappel toutes les 24 h (critique) ou 72 h (attention) tant que ça dure, et un message quand tout redevient normal. Seuils et destinataires : Paramètres → Santé du serveur.</p>
        <div className="health-actions">
          <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => act('check', '/admin/health/check', () => 'Mesure effectuée.')}>{busy === 'check' ? 'Mesure…' : 'Mesurer maintenant'}</button>
          <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={() => act('test', '/admin/health/test-alert', (r) => `E-mail d’essai envoyé à ${r.sent} destinataire${r.sent > 1 ? 's' : ''} (il part dans les secondes qui suivent).`)}>{busy === 'test' ? 'Envoi…' : 'Tester l’alerte e-mail'}</button>
          <a className="btn ghost" href="/admin?tab=settings&section=health">Régler les seuils</a>
        </div>
        {msg && <p className="health-ok" role="status">{msg}</p>}
        {err && <p className="error" role="alert">{err}</p>}
      </section>

      <section className="card health-block">
        <h3>Libérer de la place</h3>
        <p className="health-muted">Les images Docker et le cache de construction ne sont pas visibles depuis le site (volontairement). Sur le VPS, en SSH :</p>
        <pre className="health-code">{`df -h /
docker system df
docker image prune -a -f
docker builder prune -f --filter "until=48h"
df -h /`}</pre>
        <p className="health-muted">Ne jamais lancer « docker volume prune » : il supprimerait des volumes (base de données, stockage vidéo). Un nettoyage automatique tourne déjà chaque dimanche à 4 h.</p>
      </section>
    </div>
  );
}
