import { Suspense } from 'react';
import StudioShell from '../../components/StudioShell';

// Espace privé : jamais indexé par les moteurs de recherche.
export const metadata = { robots: { index: false, follow: false } };

// Espace de gestion : menu latéral Studio / Administration (voir components/StudioShell.js).
export default function Layout({ children }) {
  return <Suspense fallback={null}><StudioShell>{children}</StudioShell></Suspense>;
}
