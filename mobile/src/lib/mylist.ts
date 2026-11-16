// « Ma liste » (étape N7, comme le site N5/N6) : favoris et vidéos gardées pour plus tard réunis, sans doublon,
// la plus récemment ajoutée d'abord (addedAt pour « plus tard », favoritedAt pour les favoris).
// `srcs` dit d'où vient chaque vidéo (« later », « fav ») pour la retirer des deux ; l'avancement (positionMs) est gardé.
// Fonctions pures : testées avec Node (tests/mylist.test.ts).
import type { Card } from './types';

export type MyListItem = Card & { srcs: ('later' | 'fav')[]; at: number; addedAt?: string; favoritedAt?: string };
type Dated = Card & { addedAt?: string; favoritedAt?: string };
const when = (x: Dated): number => Date.parse(x.addedAt || x.favoritedAt || '') || 0;

export function mergeMyList(lat: Dated[] | null | undefined, favs: Dated[] | null | undefined): MyListItem[] {
  const byId = new Map<string, MyListItem>();
  const all: [Dated, 'later' | 'fav'][] = [...(lat ?? []).map((v) => [v, 'later'] as [Dated, 'later']), ...(favs ?? []).map((v) => [v, 'fav'] as [Dated, 'fav'])];
  for (const [x, src] of all) {
    const o = byId.get(x.id);
    if (o) { o.srcs.push(src); o.at = Math.max(o.at, when(x)); if (o.positionMs == null && x.positionMs != null) o.positionMs = x.positionMs; continue; }
    byId.set(x.id, { ...x, srcs: [src], at: when(x) });
  }
  return [...byId.values()].sort((a, b) => b.at - a.at);
}

/** Que faire au toucher du bouton « Ma liste » : retirer des listes où la vidéo se trouve, sinon l'ajouter dans les favoris
 * (ou dans « plus tard » si les favoris sont éteints). */
export function myListPlan(inFav: boolean, inLater: boolean, feat: (id: string) => boolean): { remove: ('fav' | 'later')[]; add: 'fav' | 'later' | null } {
  if (inFav || inLater) return { remove: [...(inFav ? ['fav' as const] : []), ...(inLater ? ['later' as const] : [])], add: null };
  if (feat('favorites')) return { remove: [], add: 'fav' };
  if (feat('watchlater')) return { remove: [], add: 'later' };
  return { remove: [], add: null };
}

// Onglets de la bibliothèque (étape N7, comme le site N5).
export type LibTab = 'resume' | 'list' | 'lists' | 'notes';
/** Onglet demandé par un lien (anciens noms compris). */
export function libTabOf(tab: unknown): LibTab {
  if (tab === 'fav' || tab === 'favs' || tab === 'later') return 'list';
  return tab === 'resume' || tab === 'list' || tab === 'lists' || tab === 'notes' ? tab : 'resume';
}

// Onglets du compte (étape N7, comme le site N5) ; anciens noms du site compris.
export type AccTab = 'profile' | 'billing' | 'notifs';
export function accTabOf(tab: unknown): AccTab {
  if (tab === 'billing' || tab === 'purchases' || tab === 'gifts' || tab === 'referral') return 'billing';
  if (tab === 'notifs' || tab === 'emails') return 'notifs';
  return 'profile';
}
