'use client';
// Entrée de /shorts : thème Premium = hub « Shorts & découvertes » (grille de vignettes) ; autres thèmes, ou une chaîne précise = fil vertical.
import { useEffect, useState } from 'react';
import ShortsFeed from './ShortsFeed';
import PmShorts from './premium/PmShorts';

export default function ShortsEntry({ channel }) {
  const [premium, setPremium] = useState(null);
  useEffect(() => { setPremium(document.documentElement.dataset.skin === 'premium'); }, []);
  if (premium === null) return <main className="sh-page" aria-busy="true" />;
  return premium && !channel ? <PmShorts /> : <ShortsFeed channel={channel} />;
}
