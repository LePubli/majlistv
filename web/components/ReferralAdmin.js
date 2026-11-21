'use client';
// Admin → Parrainages (étape 43) : qui a parrainé qui, état de la récompense. Réglages : Paramètres → Parrainage.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { Page, Metrics, Panel, Cols, Table, Badge, Meta, c } from './backoffice/Kit';

const when = (s) => (s ? new Date(s).toLocaleDateString('fr-FR', { dateStyle: 'short' }) : '—');

export default function ReferralAdmin() {
  const { t, call, skin } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    call('/admin/referrals').then((r) => (r.ok ? setD(r.data) : setErr(r.status === 404 ? 'Cette fonction est coupée (Admin → Fonctions → « Parrainage »).' : (r.data?.error || t('errGeneric')))));
  }, [call, t]);
  if (err) return <p className="error" role="alert">{err}</p>;
  if (!d) return null;
  const x = d.totals;
  if (skin === 'premium') {
    return (
      <Page title="Parrainage & ambassadeurs" sub="Qui a parrainé qui, état des récompenses et règles du programme.">
        <Metrics cols="four" items={[
          { icon: 'share', label: 'Parrainages', value: x.total },
          { icon: 'gift', tone: 'green', label: 'Récompensés', value: x.rewarded },
          { icon: 'clock', tone: 'amber', label: 'En attente', value: x.pending },
          { icon: 'users', label: 'Parrains', value: x.referrers, note: `${x.monthsGiven} mois offerts` },
        ]} />
        <Cols kind="two-main">
          <Panel title="Parrainages" extra={`${d.referrals.length}`}>
            <Table headers={[t('refAdmReferrer'), t('refAdmReferee'), t('refAdmDate'), t('refAdmStatus')]} empty={t('refAdmNone')}
              rows={d.referrals.map((r) => [r.referrerEmail, r.refereeEmail, when(r.createdAt),
                r.status === 'rewarded'
                  ? <Badge key="s" tone={r.referrerRewarded ? 'green' : 'amber'}>{`${t('refStRewarded')} · ${r.months} mois${r.referrerRewarded ? '' : ` — ${t('refAdmCapped')}`}`}</Badge>
                  : <Badge key="s" tone="blue">{t('refStPending')}</Badge>])} />
          </Panel>
          <Panel title="Règles du programme">
            <div className={c('ax-flow')} style={{ flexDirection: 'column' }}>
              {[['1', 'Invitation', 'Lien personnel (Mon compte → Parrainage)'], ['2', 'Inscription', 'Compte de moins de 48 h, sans abonnement'], ['3', 'Premier vrai paiement', 'Pas de récompense pendant l’essai à 0 €'], ['4', 'Récompense', `${d.months} mois offerts au parrain et au filleul`]].map((y) => (
                <div key={y[0]}><span>{y[0]}</span><b>{y[1]}</b><small>{y[2]}</small></div>
              ))}
            </div>
            <div style={{ padding: '0 14px 14px' }}>
              <Meta items={[['Mois offerts', d.months], ['Plafond par parrain et par an', d.maxPerYear || 'Aucun']]} />
              <Link className="link u" href="/admin?tab=settings">Modifier : Paramètres → Parrainage</Link>
            </div>
          </Panel>
        </Cols>
      </Page>
    );
  }
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
