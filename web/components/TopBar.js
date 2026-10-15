'use client';
// Étape I4 — Barre d'annonce : blocs placés tout en haut du site, au-dessus de l'en-tête (Admin → Pages → En-tête, menus et pied de page).
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';
import { LayoutZone } from './PageBlocks';

export default function TopBar() {
  const { kid } = useApp();
  const path = usePathname() || '/';
  if (kid || path.startsWith('/studio') || path.startsWith('/admin')) return null; // mêmes pages que l'en-tête
  return <div className="topbar"><LayoutZone zone="topbar" className="pb-topbar" /></div>;
}
