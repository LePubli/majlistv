'use client';
// Navigation de novembre 2026 (lot E) — les adhkar à leur propre adresse, dans « Pratique ».
// Même écran que l'onglet « Adhkar » d'Apprendre (components/Athkar.js) ; /learning?tab=athkar reste valable.
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import Athkar from '../../components/Athkar';

export default function AdhkarPage() {
  const { t, feat, user, ready } = useApp();
  if (!feat('athkar')) return <main className="page"><p className="meta">{t('noAccess')}</p></main>;
  if (!ready) return <main className="page" aria-busy="true" />;
  return (
    <main className="page">
      <h1>{t('atTab')}</h1>
      {user ? <Athkar /> : <p className="meta">{t('pqHubLogin')} <Link href="/login" className="u">{t('login')}</Link></p>}
    </main>
  );
}
