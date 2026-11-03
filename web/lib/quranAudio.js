// Coran (étape A1) : adresse du fichier audio d'un verset et mot à mot selon la langue. Sans dépendance (testé avec Node).
// Même calcul que l'API (api/src/modules/quran/lib.js) et l'application (mobile/src/lib/quran.ts).

// Nombre de versets de chaque sourate (riwaya Hafs, 6236 au total) — copie de api/src/modules/quran/juz.js.
export const SURA_VERSES = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];

/** Numéro du verset dans tout le Coran (1 à 6236). */
export function globalAyah(sura, aya) {
  let n = 0;
  for (let i = 0; i < sura - 1; i++) n += SURA_VERSES[i];
  return n + aya;
}

/** Adresse du fichier d'un verset : {sura3}/{aya3} (sur 3 chiffres), {sura}/{aya}, ou {ayahg} (1 à 6236). https seulement. */
export function reciterUrl(tpl, sura, aya) {
  if (typeof tpl !== 'string' || !/^https:\/\//i.test(tpl)) return null;
  return tpl.replace(/\{sura3\}/g, String(sura).padStart(3, '0')).replace(/\{aya3\}/g, String(aya).padStart(3, '0'))
    .replace(/\{sura\}/g, String(sura)).replace(/\{aya\}/g, String(aya)).replace(/\{ayahg\}/g, String(globalAyah(sura, aya)));
}

/**
 * Valeur du paramètre « words » de GET /quran/suras/:n.
 * Interface française ou anglaise : le mot à mot suit la langue (si l'option est cochée).
 * Interface arabe : rien par défaut ; l'option « Sens des mots » choisit une langue (fr, en…).
 */
export function wordsParam(locale, prefs) {
  if (locale === 'ar') return prefs.wbwLang ? prefs.wbwLang : '';
  return prefs.wbw ? locale : '';
}

/** Origines https des récitateurs (adresse modèle → https://hote), pour la CSP « media-src » du site. */
export function reciterOriginsOf(list) {
  const out = new Set();
  for (const r of Array.isArray(list) ? list : []) {
    try { const u = new URL(String(r?.urlTemplate || '').replace(/\{[a-z0-9]+\}/gi, '1')); if (u.protocol === 'https:') out.add(u.origin); } catch { /* ignorée */ }
  }
  return [...out];
}
