'use client';
// /kids : le parent choisit un profil (et gère les profils) ; l'enfant, une fois entré, voit ses vidéos.
import { Suspense } from 'react';
import { useApp } from '../../../components/Providers';
import KidsParent from '../../../components/KidsParent';
import KidsHome from '../../../components/KidsHome';

export default function KidsPage() {
  const { kid, ready } = useApp();
  if (!ready) return null;
  return kid ? <Suspense fallback={null}><KidsHome /></Suspense> : <KidsParent />;
}
