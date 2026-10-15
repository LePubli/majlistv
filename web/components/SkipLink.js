'use client';
// Lien d'évitement (accessibilité, étape F) : premier élément atteint au clavier, il envoie directement au contenu de la page.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';

export default function SkipLink() {
  const { t } = useApp();
  const path = usePathname();
  // La zone principale de chaque page reçoit l'ancre « contenu » (les pages ont une seule balise <main>).
  useEffect(() => { const id = setTimeout(() => { const m = document.querySelector('main'); if (m && !m.id) m.id = 'contenu'; }, 300); return () => clearTimeout(id); }, [path]);
  const go = (e) => {
    const m = document.querySelector('main');
    if (!m) return;
    e.preventDefault(); m.setAttribute('tabindex', '-1'); m.focus(); m.scrollIntoView({ block: 'start' });
  };
  return <nav aria-label={t('skipToContent')}><a href="#contenu" className="skip-link" onClick={go}>{t('skipToContent')}</a></nav>;
}
