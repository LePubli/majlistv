'use client';
// Module Statistiques — écran d'administration (Admin → Statistiques, tout le site). Étape M3b.
import StatsView from './StatsView';

export default function StatsAdmin() {
  return <StatsView endpoint="/admin/stats" site />;
}
