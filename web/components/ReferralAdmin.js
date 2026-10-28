'use client';
// Admin → Parrainages (étape 43) : qui a parrainé qui, état de la récompense. Réglages : Paramètres → Parrainage.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

const when = (s) => (s ? new Date(s).toLocaleDateString('fr-FR', { dateStyle: 'short' }) : '—');

export default function ReferralAdmin() {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    call('/admin/referrals').then((r) => (r.ok ? setD(r.data) : setErr(r.status === 404 ? 'Cette fonction est coupée (Admin → Fonctions → « Parrainage »).' : (r.data?.error || t('errGeneric')))));
  }, [call, t]);
  if (err) return <p className="error" role="alert">{err}</p>;
  if (!d) return null;
  const x = d.totals;
  return (
    <section>
      <h2>{t('refAdmTitle')}</h2>
      <p className="meta">{x.total} parrainage(s) · {x.rewarded} récompensé(s) · {x.pending} en attente · {x.referrers} parrain(s) · {x.monthsGiven} mois offerts au total.
        {' '}Récompense : {d.months} mois chacun, plafond {d.maxPerYear || 'aucun'} par parrain et par an (<Link className="link u" href="/admin?tab=settings">Paramètres → Parrainage</Link>).</p>
      {d.referrals.length === 0 ? <p className="meta">{t('refAdmNone')}</p> : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>{t('refAdmReferrer')}</th><th>{t('refAdmReferee')}</th><th>{t('refAdmDate')}</th><th>{t('refAdmStatus')}</th></tr></thead>
            <tbody>
              {d.referrals.map((r) => (
                <tr key={r.id}>
                  <td>{r.referrerEmail}</td><td>{r.refereeEmail}</td><td>{when(r.createdAt)}</td>
                  <td>{r.status === 'rewarded' ? `${t('refStRewarded')} (${r.months} mois, ${when(r.rewardedAt)})${r.referrerRewarded ? '' : ` — ${t('refAdmCapped')}`}` : t('refStPending')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
