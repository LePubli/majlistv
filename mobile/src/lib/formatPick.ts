// Choix du nom d'un format selon la langue (fonction pure, testable sans l'appli).
import type { FormatItem } from './types';

export function pickFormatName(list: FormatItem[], slug: string | null | undefined, locale: string): string {
  if (!slug) return '';
  const f = list.find((x) => x.slug === slug);
  if (!f) return '';
  return (locale === 'en' ? f.nameEn : locale === 'ar' ? f.nameAr : f.nameFr) || f.nameFr || '';
}

