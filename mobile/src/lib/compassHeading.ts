// Cap de la boussole du téléphone (Qibla) : choix de la mesure et état affiché. Logique pure, testée sans téléphone.
// expo-location (watchHeadingAsync) donne trueHeading (nord géographique, -1 si indisponible) et magHeading (nord magnétique).
export type HeadingSample = { trueHeading?: number; magHeading?: number };

/** Cap en degrés (0–360) à partir d'une mesure, ou null si aucune valeur utilisable. On préfère le nord géographique. */
export function headingOf(s: HeadingSample | null | undefined): number | null {
  if (!s) return null;
  const pick = typeof s.trueHeading === 'number' && s.trueHeading >= 0 && Number.isFinite(s.trueHeading) ? s.trueHeading
    : typeof s.magHeading === 'number' && Number.isFinite(s.magHeading) && s.magHeading >= 0 ? s.magHeading : null;
  if (pick == null) return null;
  return pick >= 360 ? pick % 360 : pick; // valeur déjà entre 0 et 360 : rendue telle quelle (pas d'erreur d'arrondi)
}
