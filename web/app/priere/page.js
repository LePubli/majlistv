'use client';
// Réglages de la prière (étape 23a), ouverts à tous : visiteur (réglages gardés sur l'appareil) ou compte (réglages du compte).
import PrayerSettings from '../../components/PrayerSettings';
import Crumbs from '../../components/Crumbs';
import { useApp } from '../../components/Providers';

export default function PrayerPage() {
  const { t } = useApp();
  return (
    <main className="page acct">
      <Crumbs items={[[null, t('prySetTitle')]]} />
      <h1>{t('prySetTitle')}</h1>
      <PrayerSettings />
    </main>
  );
}
