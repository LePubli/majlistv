'use client';
// Studio → Statistiques : audience de MES conférences (organisateur) — voir components/StatsView.js.
import { useApp } from '../../../../components/Providers';
import StatsView from '../../../../modules/stats/StatsView';

export default function StudioStats() {
  const { t, user } = useApp();
  if (!user) return null;
  return (
    <main className="studio-page">
      <h1 className="studio-title">{t('stNav')}</h1>
      <StatsView endpoint="/studio/stats" />
    </main>
  );
}
