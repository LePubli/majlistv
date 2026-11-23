'use client';
// Sens du texte selon la page : le back-office (Admin, Studio) reste de gauche à droite (textes en français) même quand le site est
// en arabe. Le serveur pose déjà le bon sens au premier affichage (app/layout.js) ; ce composant le corrige quand on passe d'une page à
// l'autre sans recharger (le gabarit racine n'est pas redessiné par la navigation interne).
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export const isBackoffice = (path) => /^\/(admin|studio)(\/|$)/.test(path || '');

export default function DirGuard({ locale }) {
  const path = usePathname();
  useEffect(() => {
    document.documentElement.dir = isBackoffice(path) ? 'ltr' : (locale === 'ar' ? 'rtl' : 'ltr');
  }, [path, locale]);
  return null;
}
