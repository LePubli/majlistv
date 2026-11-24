'use client';
// Étape 6b : la fiche vidéo recomposée en blocs. TalkClient fournit, par type de section (w_stage, w_grid…), une fonction qui dessine
// la section avec l'état de la vidéo en cours (lecteur, quiz, notes…). Les blocs « Fiche : … » la retrouvent ici.
import { createContext, useContext } from 'react';

export const WatchCtx = createContext(null);

// Bloc « Fiche : … » dans une page. Hors d'une fiche vidéo (aperçu de l'éditeur, autre page), on montre un repère.
export function WatchBlock({ b, preview }) {
  const ctx = useContext(WatchCtx);
  const draw = ctx?.sections?.[b.type];
  if (draw) return draw(b.props || {});
  return preview ? <p className="meta small pb-placeholder" role="note">Section de la fiche vidéo : elle s’affiche ici sur chaque vidéo.</p> : null;
}
