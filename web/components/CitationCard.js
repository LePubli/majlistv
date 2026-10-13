'use client';
// Citation du jour (verset ou hadith) : texte arabe + français tels qu'ils figurent dans la source, avec la référence exacte.
import { useState } from 'react';

export default function CitationCard({ c, t, label, compact = false }) {
  const [more, setMore] = useState(false);
  if (!c) return null;
  const long = (c.textAr || '').length > 260; // long hadith : texte arabe replié par défaut
  if (compact) { // accueil : une ligne de français, l'arabe s'ouvre à la demande
    return (
      <figure className="cit-card cit-compact" aria-label={label || t('citTitle')}>
        <span className="cit-label">{label || t('citTitle')}</span>
        <div className="cit-main">
          <blockquote className="cit-fr" dir="auto">{c.text}</blockquote>
          <figcaption>{c.attribution}</figcaption>
          {c.textAr && more && <blockquote className="cit-ar" dir="rtl" lang="ar">{c.textAr}</blockquote>}
        </div>
        {c.textAr && <button type="button" className="link u small cit-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>{more ? t('citLess') : t('citMore')}</button>}
      </figure>
    );
  }
  return (
    <figure className="cit-card" aria-label={label || t('citTitle')}>
      <span className="cit-label">{label || t('citTitle')}</span>
      {c.textAr && <blockquote className={long && !more ? 'cit-ar clamp' : 'cit-ar'} dir="rtl" lang="ar">{c.textAr}</blockquote>}
      {long && <button type="button" className="link u small cit-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>{more ? t('citLess') : t('citMore')}</button>}
      <blockquote className="cit-fr" dir="auto">{c.text}</blockquote>
      <figcaption>{c.attribution}</figcaption>
    </figure>
  );
}
