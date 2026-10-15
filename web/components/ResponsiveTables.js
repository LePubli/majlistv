'use client';
// Étape F : sur téléphone, les tableaux (.adm-table, .st-table, .studio-table) deviennent des fiches empilées (CSS dans globals.css).
// Ce composant recopie le titre de chaque colonne dans l'attribut data-label de chaque cellule pour que la fiche affiche « Colonne : valeur ».
// Il suit les changements de la page (tableaux chargés après coup) ; aucun effet sur ordinateur.
import { useEffect } from 'react';

const SEL = 'table.adm-table, table.st-table, table.studio-table';
function label(table) {
  const heads = [...table.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim());
  if (!heads.some(Boolean)) return;
  table.querySelectorAll('tbody tr').forEach((tr) => {
    [...tr.children].forEach((td, i) => { if (td.tagName === 'TD' && heads[i] && td.getAttribute('data-label') !== heads[i]) td.setAttribute('data-label', heads[i]); });
  });
}

export default function ResponsiveTables() {
  useEffect(() => {
    let raf = 0;
    const run = () => { raf = 0; document.querySelectorAll(SEL).forEach(label); };
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(run); });
    mo.observe(document.body, { childList: true, subtree: true });
    run();
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return null;
}
