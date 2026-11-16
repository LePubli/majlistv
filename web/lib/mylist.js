// « Ma liste » (étapes N5 et N6, 16/11) : favoris et vidéos gardées pour plus tard réunis, sans doublon,
// la plus récemment ajoutée d'abord (addedAt pour « plus tard », favoritedAt pour les favoris).
// `srcs` dit d'où vient chaque vidéo (« later », « fav ») pour la retirer des deux ; l'avancement (positionMs) est gardé.
const when = (x) => Date.parse(x.addedAt || x.favoritedAt || '') || 0;

export function mergeMyList(lat, favs) {
  const byId = new Map();
  for (const [x, src] of [...(lat || []).map((v) => [v, 'later']), ...(favs || []).map((v) => [v, 'fav'])]) {
    const o = byId.get(x.id);
    if (o) { o.srcs.push(src); o.at = Math.max(o.at, when(x)); if (o.positionMs == null && x.positionMs != null) o.positionMs = x.positionMs; continue; }
    byId.set(x.id, { ...x, srcs: [src], at: when(x) });
  }
  return [...byId.values()].sort((a, b) => b.at - a.at);
}
