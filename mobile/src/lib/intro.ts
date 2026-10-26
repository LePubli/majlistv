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
  total: 3000,
  trace: { at: 0, dur: 1000 },
  push: { at: 0, dur: 2300 },
  fill: { at: 900, dur: 700 },
  glowIn: { at: 700, dur: 800 },
  glowOut: { at: 1500, dur: 600 },
  outlineOut: { at: 1500, dur: 500 },
  name: { at: 1300, dur: 500 },
  tagline: { at: 1650, dur: 500 },
  textOut: { at: 2300, dur: 250 },
  zoom: { at: 2300, dur: 700 },
  fade: { at: 2500, dur: 500 },
};

/** Mouvements réduits (réglage d'accessibilité) : logo fixe un instant, puis fondu — aucun mouvement. */
export const REDUCED_PLAN = { total: 1200, hold: 900, fade: 300 } as const;
/** Appui pour passer : fondu court. */
export const SKIP_FADE_MS = 250;
/** Garde-fou : quoi qu'il arrive, l'animation ne dure jamais plus que cela. */
export const MAX_MS = 6000;

/** Fin d'une étape. */
export const endOf = (s: Step): number => s.at + s.dur;
/** Taille (en points) de l'image du logo : la même que l'écran de démarrage d'Android, pour un enchaînement sans saut. */
export const SPLASH_SIZE = 200;
/** Facteurs de grossissement : zoom avant lent, puis traversée du logo. */
export const PUSH_SCALE = 1.25;
export const ZOOM_SCALE = 9;
