'use client';
// Citation du jour (verset ou hadith) : texte arabe + français tels qu'ils figurent dans la source, avec la référence exacte.
import { useMemo, useState } from 'react';
import ShareCardModal from './ShareCardModal';

export default function CitationCard({ c, t, label, compact = false, framed = false }) {
  const [more, setMore] = useState(false);
  const [sharing, setSharing] = useState(false);
  const card = useMemo(() => (c ? { ar: c.textAr || '', fr: c.text || '', attribution: c.attribution || '', kicker: label || t('citTitle') } : null), [c, label, t]);
  if (!c) return null;
  const shareBtn = <button type="button" className="link u small cit-share" onClick={() => setSharing(true)}>{t('shImage')}</button>;
  const modal = sharing ? <ShareCardModal card={card} url={typeof window !== 'undefined' ? `${window.location.origin}/` : '/'} title={c.attribution || t('citTitle')} onClose={() => setSharing(false)} /> : null;
  const long = (c.textAr || '').length > 260; // long hadith : texte arabe replié par défaut
  if (framed) { // bas de l'accueil : grand cadre centré, texte mis en valeur
    return (
      <figure className="cit-framed" aria-label={label || t('citTitle')}>
        <span className="cit-mark" aria-hidden="true">“</span>
        <span className="cit-label">✦ {label || t('citTitle')}</span>
        {c.textAr && <blockquote className="cit-ar" dir="rtl" lang="ar">{long && !more ? `${c.textAr.slice(0, 260).trimEnd()}…` : c.textAr}</blockquote>}
        <blockquote className="cit-fr" dir="auto">« {c.text} »</blockquote>
        <figcaption>{c.attribution}</figcaption>
        {long && <button type="button" className="link u small cit-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>{more ? t('citLess') : t('citMore')}</button>}
        {shareBtn}{modal}
      </figure>
    );
  }
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
        {shareBtn}{modal}
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
      {shareBtn}{modal}
    </figure>
  );
}
