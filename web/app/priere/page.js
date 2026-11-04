'use client';
// Page « Prière » (amélioration 4.3), ouverte à tous : horaires du jour, date hégirienne, calendrier du mois, Qibla, réglages.
// Les réglages (étape 23a) sont dans le dernier onglet ; l'ancienne adresse /priere affichait directement les réglages.
import PrayerPage from '../../components/PrayerPage';
import Crumbs from '../../components/Crumbs';
import { useApp } from '../../components/Providers';

export default function PriereRoute() {
  const { t } = useApp();
  return (
    <main className="page acct">
      <Crumbs items={[[null, t('pqNav')]]} />
      <h1>{t('pqTitle')}</h1>
      <PrayerPage />
    </main>
  );
}
