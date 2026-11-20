'use client';
// /kids/univers/<slug> : un univers Kids (thèmes, séries, vidéos de l'âge de l'enfant).
import { Suspense } from 'react';
import KidUniverse from '../../../../../components/KidUniverse';

export default function KidsUniversePage() {
  return <Suspense fallback={null}><KidUniverse /></Suspense>;
}
