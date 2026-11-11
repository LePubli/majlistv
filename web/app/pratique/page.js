'use client';
// Navigation de novembre 2026 (lot E) — « Pratique » : les gestes de chaque jour au même endroit.
// Le bloc « Aujourd'hui » (déjà sur l'accueil et dans Apprendre) puis une carte par geste ; chaque carte ouvre la page existante.
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import TodayBlock from '../../components/TodayBlock';

export default function PratiquePage() {
  const { t, feat, user } = useApp();
  const cards = [
    ['/priere', t('pqNav'), t('pqHubPrayerTx'), feat('prayer')],
    ['/coran', t('qrNav'), t('pqHubQuranTx'), feat('quran')],
    ['/adhkar', t('atTab'), t('pqHubAthkarTx'), feat('athkar')],
    ['/ramadan', t('rzNav'), t('pqHubRamadanTx'), feat('ramadan')],
  ].filter((c) => c[3]);
  return (
    <main className="page pq-hub">
      <h1>{t('pqHub')}</h1>
      <p className="meta">{t('pqHubIntro')}</p>
      {user && <TodayBlock compact />}
      <div className="pq-hub-grid">
        {cards.map(([href, title, tx]) => (
          <Link key={href} href={href} className="pq-hub-card">
            <b>{title}</b>
            <span>{tx}</span>
            <i aria-hidden="true">{t('pqHubOpen')} →</i>
          </Link>
        ))}
      </div>
    </main>
  );
}
