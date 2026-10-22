// Petites fonctions d'affichage communes aux vignettes (pures, testées).
import type { Key } from './i18n';
import type { Card } from './types';

export type Tr = (key: Key, vars?: Record<string, string | number>) => string;

/** Miniature : image du serveur, sinon celle de YouTube pour une vidéo YouTube. */
export function thumbOf(talk: Pick<Card, 'posterUrl' | 'source' | 'video_ref'>): string | null {
  if (talk.posterUrl) return talk.posterUrl;
  if (talk.source === 'youtube' && talk.video_ref) return `https://i.ytimg.com/vi/${talk.video_ref}/hqdefault.jpg`;
  return null;
}

/** « 12 min » (arrondi, 1 minute au moins) ; vide si la durée est inconnue. */
export function minutesLabel(seconds: number | null | undefined, t: Tr): string {
  return seconds && seconds > 0 ? `${Math.max(1, Math.round(seconds / 60))} ${t('minutes')}` : '';
}

const LEVEL_KEY = { beginner: 'lvBeginner', intermediate: 'lvInter', advanced: 'lvAdvanced' } as const;
export const levelLabel = (level: string | null | undefined, t: Tr): string => (level && level in LEVEL_KEY ? t(LEVEL_KEY[level as keyof typeof LEVEL_KEY]) : '');
export const LEVEL_COLOR: Record<string, string> = { beginner: '#7fd1a0', intermediate: '#E6A739', advanced: '#d98b8b' };

/** Ligne sous le titre : « Titre de la série · S1 É3 » pour un épisode, sinon « Intervenant · Catégorie ». */
export function subLine(talk: Pick<Card, 'series' | 'speaker' | 'category'>, t: Tr, show = { speaker: true, category: true }): string {
  if (talk.series) {
    const place = [talk.series.seasonNumber ? t('sShort', { n: talk.series.seasonNumber }) : '', t('eShort', { n: talk.series.number })].filter(Boolean).join(' ');
    return [talk.series.title, place].join(' · ');
  }
  return [show.speaker && talk.speaker, show.category && talk.category].filter(Boolean).join(' · ');
}

/** Progression 0..1 d'une carte « Continuer à regarder ». */
export function progressOf(x: Pick<Card, 'positionMs' | 'durationMs' | 'durationSeconds'>): number {
  const dur = x.durationMs || (x.durationSeconds ?? 0) * 1000;
  return x.positionMs && dur > 0 ? Math.min(1, x.positionMs / dur) : 0;
}
