// Application TV — règles pures (sans React Native : testées avec Node, tests/tv.test.ts).

/** Code de connexion affiché en deux groupes lisibles de loin : « ABCD 2345 ». */
export const fmtTvCode = (code: string): string => (code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code);

/** Écrans de l'espace Kids de la télé ouverts à l'enfant (tout le reste ramène à son accueil). */
export const TV_KID_SCREENS = ['home', 'watch', 'exit', 'stories', 'story', 'listen'];

/**
 * Écran de la télé vers lequel ramener un chemin interdit (lien profond, notification, écran du téléphone) : /tv par défaut.
 * Enfant dans l'espace Kids : seuls ses écrans sont permis, le reste ramène à /tv/kids/home (sortie : code parental).
 */
export function tvRouteFor(segments: string[], kid = false): string | null {
  if (kid) return segments[0] === 'tv' && segments[1] === 'kids' && TV_KID_SCREENS.includes(segments[2] ?? '') ? null : '/tv/kids/home';
  return segments[0] === 'tv' ? null : '/tv';
}

/** Rangées de l'accueil TV : « Continuer » d'abord, puis les rangées de l'accueil qui ont des vidéos (au plus `max`). */
export function tvRows<T extends { talks?: unknown[] | null; title?: string | null; key: string }>(rows: T[], max = 12): T[] {
  return rows.filter((r) => Array.isArray(r.talks) && r.talks.length > 0).slice(0, max);
}

/** Position de reprise (secondes) d'une vidéo pour le bouton « Reprendre » : rien sous 30 s ni dans les 30 dernières secondes. */
export function tvResumeSeconds(positionMs?: number | null, durationSeconds?: number | null): number {
  const p = Math.floor((positionMs || 0) / 1000);
  const d = durationSeconds || 0;
  if (p < 30) return 0;
  if (d && p > d - 30) return 0;
  return p;
}

/** Largeur du menu de gauche : une télé 1080p fait en général 960 points de large (densité 2). */
export const tvMenuWidth = (screenW: number): number => (screenW >= 1200 ? 220 : 180);

/**
 * Largeur d'une vignette : `perRow` vignettes visibles dans la zone de contenu (marges de 32 et espaces de 16 compris).
 * Rangées : 3,5 (on devine la suivante) ; grilles : 4 colonnes.
 */
export function tvCardWidth(contentW: number, perRow = 3.5): number {
  const gap = 16;
  const w = (contentW - 64 - gap * (Math.ceil(perRow) - 1)) / perRow;
  return Math.max(150, Math.floor(w));
}

// Rangées Audyn de la télé : « Nouveautés » (20 premiers), une rangée par catégorie, « Autres » (sans catégorie).
export function audynRows<T extends { id: string; category?: string | null }>(d: { items: T[]; categories: string[] } | null | undefined, newLabel: string, otherLabel: string): { key: string; title: string; items: T[] }[] {
  if (!d || d.items.length === 0) return [];
  const out = [{ key: 'new', title: newLabel, items: d.items.slice(0, 20) }];
  for (const c of d.categories) {
    const items = d.items.filter((x) => x.category === c);
    if (items.length) out.push({ key: `c-${c}`, title: c, items });
  }
  const other = d.items.filter((x) => !x.category);
  if (d.categories.length && other.length) out.push({ key: 'other', title: otherLabel, items: other });
  return out;
}

// ---- Refonte TV (étape TV-R) : tailles de la maquette, clavier à l'écran, images de fond ----

/** Taille de référence de la maquette (1920 × 1080 px). */
export const TV_REF_W = 1920;
export const TV_REF_H = 1080;
/** Menu de gauche : colonne d'icônes fermée, puis ouverte avec les noms (pixels de la maquette). */
export const TV_RAIL = 112;
export const TV_RAIL_OPEN = 440;

/**
 * Facteur qui convertit les pixels de la maquette en points de l'écran : une télé 1080p fait en général 960 × 540 points
 * (facteur 0,5). On prend le plus petit des deux rapports pour que rien ne déborde, même sur un écran plus bas (vidéoprojecteur).
 */
export function tvScale(w: number, h: number): number {
  if (!(w > 0) || !(h > 0)) return 0.5;
  return Math.max(0.3, Math.min(w / TV_REF_W, h / TV_REF_H));
}

/** Touches du clavier à l'écran (recherche) : lettres de la langue, puis chiffres. */
export function tvKeyboardKeys(locale: string): string[] {
  const latin = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const arabic = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
  return [...(locale === 'ar' ? arabic : latin), ...'0123456789'.split('')];
}

/** Effet d'une touche du clavier à l'écran sur la recherche (au plus 60 caractères, pas d'espace en tête ni doublé). */
export function tvKeyApply(q: string, key: string): string {
  if (key === 'del') return q.slice(0, -1);
  if (key === 'clear') return '';
  if (key === 'space') return q && !q.endsWith(' ') ? `${q} ` : q;
  return (q + key).slice(0, 60);
}

/** Image de fond en grand : pour YouTube, la version haute définition (« maxresdefault »), avec repli si elle n'existe pas. */
export function tvBackdropUrls(t: { posterUrl?: string | null; source?: string; video_ref?: string | null }): string[] {
  if (t.posterUrl) return [t.posterUrl];
  if (t.source === 'youtube' && t.video_ref) return [`https://i.ytimg.com/vi/${t.video_ref}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${t.video_ref}/hqdefault.jpg`];
  return [];
}

/** « 8:12 » ou « 1:02:05 » (position de reprise, minutage des chapitres). */
export function tvClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`;
}

/** Minutes restantes d'une vidéo commencée (arrondi au-dessus, au moins 1) ; 0 si inconnu. */
export function tvLeftMin(positionMs?: number | null, durationSec?: number | null): number {
  if (!durationSec || !positionMs) return 0;
  const left = durationSec - positionMs / 1000;
  return left > 0 ? Math.max(1, Math.ceil(left / 60)) : 0;
}
