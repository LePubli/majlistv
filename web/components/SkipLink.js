'use client';
// Lien d'évitement (accessibilité, étape F) : premier élément atteint au clavier, il envoie directement au contenu de la page.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';

export default function SkipLink() {
  const { t } = useApp();
  const path = usePathname();
  // La zone principale de chaque page reçoit l'ancre « contenu » (les pages ont une seule balise <main>).
  // Le <main> peut apparaître après le chargement des données (ex. page Tarifs) : on l'attend au lieu de tenter une seule fois.
  // Le <main> est parfois recréé après coup (connexion vérifiée, données chargées) : l'observateur reste actif et remet l'ancre au besoin.
  useEffect(() => {
    let raf = 0;
    const mark = () => { raf = 0; const m = document.querySelector('main'); if (m && !m.id) m.id = 'contenu'; };
    mark();
    const obs = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(mark); });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { obs.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [path]);
  const go = (e) => {
    const m = document.querySelector('main');
    if (!m) return;
    e.preventDefault(); m.setAttribute('tabindex', '-1'); m.focus(); m.scrollIntoView({ block: 'start' });
  };
  return <nav aria-label={t('skipToContent')}><a href="#contenu" className="skip-link" onClick={go}>{t('skipToContent')}</a></nav>;
}
