import { Suspense } from 'react';
import StudioShell from '../../components/StudioShell';

// Espace de gestion : menu latéral Studio / Administration (voir components/StudioShell.js).
export default function Layout({ children }) {
  return <Suspense fallback={null}><StudioShell>{children}</StudioShell></Suspense>;
}
