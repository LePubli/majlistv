'use client';
// Module Cartes cadeaux — écran d'administration (Admin → Cartes cadeaux). Déplacé de app/admin/page.js à l'étape M3b.
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';

// Petits utilitaires repris de app/admin/page.js (le module ne dépend pas du code de la page d'administration).
const fmtDT = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
function Kpi({ value, label, hint, href }) {
  const body = (<><strong>{value}</strong><span>{label}</span>{hint && <small className="meta">{hint}</small>}</>);
  return href ? <Link className="admin-card kpi" href={href}>{body}</Link> : <div className="admin-card kpi">{body}</div>;
}

/* ---------------------------------------------------------------- Cartes cadeaux (étape 21) */
export default function GiftsAdmin() {
  const { call } = useApp();
  const [d, setD] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [gen, setGen] = useState({ months: 1, count: 5, note: '' });
  const [codes, setCodes] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => call(`/admin/gifts?${new URLSearchParams({ ...(status ? { status } : {}), ...(q.trim() ? { q: q.trim() } : {}) })}`).then((r) => r.ok && setD(r.data));
  useEffect(() => { load(); }, [call, status, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const money = (c, cur) => (c == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: String(cur || 'eur').toUpperCase() }).format(c / 100));
  const STATE = { pending: 'En attente de paiement', paid: 'Disponible', redeemed: 'Activée', void: 'Annulée' };
  const generate = async (e) => {
    e.preventDefault(); setMsg('');
    const r = await call('/admin/gifts/generate', { method: 'POST', body: JSON.stringify({ months: Number(gen.months), count: Number(gen.count), note: gen.note }) });
    if (r.ok) { setCodes(r.data.codes.join('\n')); load(); } else setMsg(r.data?.error || 'Échec');
  };
  const voidCard = async (g) => {
    if (!window.confirm(`Annuler la carte ${g.code} ? Si elle a été payée, pensez à rembourser le paiement dans Stripe.`)) return;
    const r = await call(`/admin/gifts/${g.id}/void`, { method: 'POST' });
    setMsg(r.ok ? 'Carte annulée.' : (r.data?.error || 'Échec')); load();
  };
  return (
    <section>
      <p className="meta">Cartes cadeaux de 1, 3 ou 12 mois. Prix et ouverture à la vente : Paramètres → Cartes cadeaux. Un remboursement fait dans Stripe annule automatiquement une carte non activée.</p>
      {d && (
        <div className="admin-cards">
          <Kpi value={d.totals.available} label="cartes disponibles" />
          <Kpi value={d.totals.redeemed} label="activées" />
          <Kpi value={d.totals.voided} label="annulées" />
          <Kpi value={money(d.totals.revenue, d.currency)} label="ventes (hors cartes offertes)" />
        </div>
      )}
      <form className="studio-tools" onSubmit={generate}>
        <label className="fld"><span>Durée</span><select value={gen.months} onChange={(e) => setGen({ ...gen, months: e.target.value })}><option value="1">1 mois</option><option value="3">3 mois</option><option value="12">12 mois</option></select></label>
        <label className="fld"><span>Quantité (50 au plus)</span><input type="number" min="1" max="50" value={gen.count} onChange={(e) => setGen({ ...gen, count: e.target.value })} /></label>
        <label className="fld"><span>Note (concours, partenaire…)</span><input value={gen.note} maxLength={200} onChange={(e) => setGen({ ...gen, note: e.target.value })} /></label>
        <button className="btn">Générer des cartes offertes</button>
      </form>
      {codes && <label className="fld"><span>Codes générés (à copier maintenant : ils restent visibles dans la liste ci-dessous)</span><textarea readOnly rows={Math.min(8, codes.split('\n').length + 1)} value={codes} onFocus={(e) => e.target.select()} /></label>}
      <div className="studio-tools">
        <label className="fld"><span>État</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tous</option>{Object.entries(STATE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="fld"><span>Recherche</span><input type="search" value={q} placeholder="Code ou e-mail" onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      {msg && <p className="meta" role="status">{msg}</p>}
      {d && d.gifts.length === 0 && <p className="meta">Aucune carte.</p>}
      {d && d.gifts.length > 0 && (
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead><tr><th>Code</th><th>Durée</th><th>État</th><th>Origine</th><th>Acheteur</th><th>Activée par</th><th>Montant</th><th>Date</th><th /></tr></thead>
            <tbody>
              {d.gifts.map((g) => (
                <tr key={g.id}>
                  <td><code>{g.code}</code></td>
                  <td>{g.months} mois</td>
                  <td>{STATE[g.status]}{g.refundedAt ? ' (remboursée)' : ''}</td>
                  <td>{g.source === 'admin' ? <>Agence{g.note ? <><br /><small className="muted">{g.note}</small></> : null}</> : 'Stripe'}</td>
                  <td>{g.purchaserEmail || '—'}{g.recipientEmail ? <><br /><small className="muted">→ {g.recipientEmail}</small></> : null}</td>
                  <td>{g.redeemerEmail || '—'}{g.redeemedAt ? <><br /><small className="muted">{fmtDT(g.redeemedAt)}</small></> : null}</td>
                  <td>{g.source === 'stripe' ? money(g.amount, g.currency) : '—'}</td>
                  <td className="muted">{fmtDT(g.paidAt || g.createdAt)}</td>
                  <td>{g.status === 'paid' && <button type="button" className="btn ghost small" onClick={() => voidCard(g)}>Annuler</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

