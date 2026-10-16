import { Suspense } from 'react';
import AdminShell from '../../components/AdminShell';

// Espace privé : jamais indexé par les moteurs de recherche.
export const metadata = { robots: { index: false, follow: false } };

// Administration : habillage et menu propres (voir components/AdminShell.js), séparés du Studio depuis l'étape D.
export default function Layout({ children }) {
  return <Suspense fallback={null}><AdminShell>{children}</AdminShell></Suspense>;
}
