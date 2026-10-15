'use client';
// Étape A — Garde de pages : fonction coupée → message clair ; maintenance → page d'attente (sauf administrateurs).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';
import { featureForPath, MAINTENANCE_OPEN } from '../lib/features';

export default function RouteGate({ children }) {
  const { t, features, user, ready } = useApp();
  const path = usePathname();
  if (features.maintenance && !MAINTENANCE_OPEN.test(path) && !path.startsWith('/admin')) {
    if (!ready) return null; // on attend de savoir si c'est un administrateur
    if (!user || user.role !== 'admin') {
      return (
        <main className="card gate">
          <h1>{t('mtTitle')}</h1>
          <p className="meta">{t('mtText')}</p>
          <p><Link className="link u" href="/login">{t('login')}</Link></p>
        </main>
      );
    }
  }
  const id = featureForPath(path);
  if (id && features[id] === false) {
    return (
      <main className="card gate">
        <h1>{t('ftOffTitle')}</h1>
        <p className="meta">{t('ftOffText')}</p>
        <p><Link className="btn" href="/">{t('ftBackHome')}</Link></p>
      </main>
    );
  }
  return children;
}
