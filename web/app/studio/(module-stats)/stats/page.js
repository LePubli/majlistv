'use client';
// Studio → Statistiques : audience de MES vidéos (organisateur) — voir components/StatsView.js.
import { useApp } from '../../../../components/Providers';
import StatsView from '../../../../modules/stats/StatsView';
import StudioTabs from '../../../../components/StudioTabs';

export default function StudioStats() {
  const { t, user, skin } = useApp();
  if (!user) return null;
  return (
    <main className="studio-page">
      {skin !== 'premium' && <h1 className="studio-title">{t('stNav')}</h1>}
      <StudioTabs group="analytics" />
      <StatsView endpoint="/studio/stats" />
    </main>
  );
}
