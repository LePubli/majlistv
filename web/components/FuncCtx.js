'use client';
// Lot C — contexte des sections d'une page « fonction » et bloc qui les dessine (séparé de FuncPage pour éviter une importation circulaire).
import { createContext, useContext } from 'react';
import { FUNC_PAGES } from '../lib/blocks';

export const FuncCtx = createContext(null);

// Bloc « <Page> : <section> » dans une page. Hors de sa page (aperçu de l'éditeur, autre page), on montre un repère.
export function FuncBlock({ b, preview }) {
  const ctx = useContext(FuncCtx);
  const draw = ctx?.sections?.[b.type];
  if (draw) return draw(b.props || {});
  if (!preview) return null;
  const owner = Object.values(FUNC_PAGES).find((p) => p.sections.some((x) => x[0] === b.type));
  return <p className="meta small pb-placeholder" role="note">Section de la page « {owner?.label} » : elle s’affiche ici, avec les vraies données.</p>;
}
