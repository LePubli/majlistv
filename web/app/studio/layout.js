import { Suspense } from 'react';
import '../back.css'; // styles du Studio et de l'administration, chargés ici seulement (audit 11/2026)
import StudioShell from '../../components/StudioShell';

// Espace privé : jamais indexé par les moteurs de recherche.
export const metadata = { robots: { index: false, follow: false } };

// Espace de gestion : menu latéral Studio / Administration (voir components/StudioShell.js).
export default function Layout({ children }) {
  return <Suspense fallback={null}><StudioShell>{children}</StudioShell></Suspense>;
}
