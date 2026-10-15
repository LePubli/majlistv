'use client';
// Administration → Rémunération (étape D) : cagnotte du mois, part de chaque chaîne, clôture, suivi des paiements, export CSV.
// Les pourcentages, le seuil et les plafonds se règlent dans Paramètres → « Rémunération des chaînes ».
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

const money = (c, cur) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: String(cur || 'eur').toUpperCase() }).format((c || 0) / 100);
const hours = (s) => (s / 3600).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const STATUS = { draft: 'Brouillon', due: 'À payer', paid: 'Payé', carried: 'Reporté', rolled: 'Repris le mois suivant' };
const monthLabel = (m) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const prevMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };

export default function RevenueAdmin() {
  const { call } = useApp();
  const [month, setMonth] = useState(prevMonth());
  const [d, setD] = useState(null);
  const [off, setOff] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => call(`/admin/revenue?month=${month}`).then((r) => {
    if (r.ok) { setD(r.data); setOff(false); } else if (r.data?.code === 'feature_off') setOff(true);
  }), [call, month]);
  useEffect(() => { load(); }, [load]);

  if (off) return <section><p className="soon">La rémunération des chaînes est désactivée. Activez-la dans <Link className="link u" href="/admin?tab=features">Fonctions</Link> (rubrique Argent), puis réglez les pourcentages dans <Link className="link u" href="/admin?tab=settings">Paramètres</Link>.</p></section>;
  if (!d) return null;

  const close = async () => {
    if (!window.confirm(`Clôturer ${monthLabel(month)} ? Les montants seront figés : un remboursement ou un changement de réglage ultérieur ne les modifiera plus.`)) return;
    const r = await call(`/admin/revenue/${month}/close`, { method: 'POST' });
    setMsg(r.ok ? 'Mois clôturé.' : (r.data?.error || 'Échec')); load();
  };
  const pay = async (l) => {
    const note = window.prompt(`Marquer « ${l.name} » comme payé (${money(l.amountCents + l.carriedInCents, d.currency)}). Note facultative (référence du virement) :`, '');
    if (note === null) return;
    const r = await call(`/admin/revenue/lines/${l.id}/paid`, { method: 'POST', body: JSON.stringify({ note }) });
    setMsg(r.ok ? 'Paiement enregistré.' : (r.data?.error || 'Échec')); load();
  };
  const exportCsv = async () => {
    const res = await fetch(`/api/admin/revenue/${month}/export.csv`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
    if (!res.ok) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = `remuneration-${month}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const s = d.settings;
  return (
    <section className="rv-admin">
      <p className="meta">Chaque mois, {s.sharePct} % des abonnements encaissés (hors taxes, après {s.costsPct} % de frais de paiement) sont répartis entre les chaînes selon le temps de visionnage.
        Seuil de paiement : {money(s.minPayoutCents, d.currency)}. Les cartes cadeaux ne sont pas incluses. Réglages : <Link className="link u" href="/admin?tab=settings">Paramètres → Rémunération des chaînes</Link>.</p>
      <div className="studio-tools">
        <label className="fld"><span>Mois</span><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
        {d.closable && <button className="btn" onClick={close}>Clôturer ce mois</button>}
        {d.closed && <button className="btn ghost" onClick={exportCsv}>Exporter en CSV</button>}
      </div>
      <p className="ft-msg" role="status" aria-live="polite">{msg}</p>
      <div className="admin-cards">
        <div className="admin-card kpi"><strong>{money(d.netCents, d.currency)}</strong><span>encaissé (hors taxes, net des remboursements)</span></div>
        <div className="admin-card kpi"><strong>{money(d.poolCents, d.currency)}</strong><span>cagnotte à répartir</span></div>
        <div className="admin-card kpi"><strong>{hours(d.totalSeconds)} h</strong><span>de visionnage compté</span></div>
        <div className="admin-card kpi"><strong>{d.closed ? 'Clôturé' : d.closable ? 'Ouvert (clôturable)' : 'En cours'}</strong><span>{d.closed ? `le ${new Date(d.closedAt).toLocaleDateString('fr-FR')}` : 'montants recalculés en direct'}</span></div>
      </div>
      {d.unassigned > 0 && <p className="soon">{d.unassigned} chaîne(s) sans propriétaire : leur part est mise de côté et reportée tant qu'aucun organisateur ne leur est attribué (Studio → Chaînes).</p>}
      {d.lines.length === 0 ? <p className="soon">Aucun visionnage compté ce mois-ci.</p> : (
        <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr><th>Chaîne</th><th>Propriétaire</th><th>Heures</th><th>Gagné</th><th>Report</th><th>Total</th><th>Statut</th><th /></tr></thead>
          <tbody>{d.lines.map((l) => (
            <tr key={l.slug}><td>{l.name}</td><td>{l.ownerName || l.ownerEmail || <em>aucun</em>}</td><td>{hours(l.seconds)}</td><td>{money(l.amountCents, d.currency)}</td>
              <td>{money(l.carriedInCents, d.currency)}</td><td><b>{money(l.amountCents + l.carriedInCents, d.currency)}</b></td>
              <td><span className={`rv-st rv-${l.status}`}>{STATUS[l.status]}</span>{l.paidAt ? ` le ${new Date(l.paidAt).toLocaleDateString('fr-FR')}` : ''}{l.note ? ` · ${l.note}` : ''}</td>
              <td>{l.status === 'due' && <button className="btn ghost" onClick={() => pay(l)}>Marquer payé</button>}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      <h2>Mois clôturés</h2>
      {d.periods.length === 0 ? <p className="meta">Aucun mois clôturé pour le moment.</p> : (
        <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr><th>Mois</th><th>Cagnotte</th><th>Reste à payer</th><th>Payé</th><th /></tr></thead>
          <tbody>{d.periods.map((p) => (
            <tr key={p.month}><td>{monthLabel(p.month)}</td><td>{money(p.poolCents, d.currency)}</td><td>{money(p.dueCents, d.currency)}</td><td>{money(p.paidCents, d.currency)}</td>
              <td><button className="link u" onClick={() => setMonth(p.month)}>Voir</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
      <p className="meta">Le paiement des chaînes se fait pour l'instant par virement, hors du site : exportez le CSV, payez, puis cliquez sur « Marquer payé ». Vérifiez les obligations légales et fiscales (statut des organisateurs, factures, TVA) avec votre comptable avant les premiers versements.</p>
    </section>
  );
}
