// Découpage du Coran en 30 juz : premiers versets de chaque juz et nombre de versets de chaque sourate.
// Source : métadonnées du projet Tanzil (quran-data, indexes.juzs et nombre de versets), découpage habituel des 30 juz (riwaya Hafs).
// Données de structure (numéros), pas de texte. Total : 6236 versets.
export const JUZ_STARTS = [[1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 82], [6, 111], [7, 88], [8, 41], [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56], [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1]];
export const SURA_VERSES = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6];

// Juz n (1 à 30) : { n, start: { sura, aya }, end: { sura, aya } } — fin = verset qui précède le début du juz suivant.
export function juzRange(n) {
  const [s, a] = JUZ_STARTS[n - 1];
  let end;
  if (n === 30) end = [114, SURA_VERSES[113]];
  else {
    const [ns, na] = JUZ_STARTS[n];
    end = na > 1 ? [ns, na - 1] : [ns - 1, SURA_VERSES[ns - 2]];
  }
  return { n, start: { sura: s, aya: a }, end: { sura: end[0], aya: end[1] } };
}
export const JUZS = Array.from({ length: 30 }, (_, i) => juzRange(i + 1));
