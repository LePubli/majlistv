// Animation du logo au lancement (étape 26) : calendrier de la séquence (en millisecondes), pur et testé.
// Tracé du contour doré (de bas en haut) → remplissage + halo → nom et slogan → zoom qui traverse le logo et fond dans l'application.
export type Step = { at: number; dur: number };
export type Plan = {
  total: number;
  /** Le contour se dessine (rideaux qui se lèvent de bas en haut). */
  trace: Step;
  /** Léger zoom avant continu pendant toute la séquence. */
  push: Step;
  /** Le logo se remplit. */
  fill: Step;
  /** Halo doré qui monte puis se calme. */
  glowIn: Step; glowOut: Step;
  /** Le contour néon s'efface une fois le logo rempli. */
  outlineOut: Step;
  /** Nom « Mejliss TV » puis slogan. */
  name: Step; tagline: Step;
  /** Le nom et le slogan s'effacent avant le zoom. */
  textOut: Step;
  /** Zoom qui traverse le logo, puis fondu vers l'application. */
  zoom: Step; fade: Step;
};

export const PLAN: Plan = {
  total: 5400,
  trace: { at: 0, dur: 1800 },
  push: { at: 0, dur: 4140 },
  fill: { at: 1620, dur: 1260 },
  glowIn: { at: 1260, dur: 1440 },
  glowOut: { at: 2700, dur: 1080 },
  outlineOut: { at: 2700, dur: 900 },
  name: { at: 2340, dur: 900 },
  tagline: { at: 2970, dur: 900 },
  textOut: { at: 4140, dur: 450 },
  zoom: { at: 4140, dur: 1260 },
  fade: { at: 4500, dur: 900 },
};

/** Mouvements réduits (réglage d'accessibilité) : logo fixe un instant, puis fondu — aucun mouvement. */
export const REDUCED_PLAN = { total: 1200, hold: 900, fade: 300 } as const;
/** Appui pour passer : fondu court. */
export const SKIP_FADE_MS = 250;
/** Garde-fou : quoi qu'il arrive, l'animation ne dure jamais plus que cela. */
export const MAX_MS = 8000;

/** Fin d'une étape. */
export const endOf = (s: Step): number => s.at + s.dur;
/** Taille (en points) de l'image du logo : la même que l'écran de démarrage d'Android, pour un enchaînement sans saut. */
export const SPLASH_SIZE = 200;
/** Facteurs de grossissement : zoom avant lent, puis traversée du logo. */
export const PUSH_SCALE = 1.25;
export const ZOOM_SCALE = 9;
