// Bloc « Aujourd'hui » (étape M1, même contenu que le site — étape B1) : textes des lignes et écran à ouvrir.
// Données : GET /me/today?lang=xx → { date, items: [{ kind, order, done, href, n?, total?, juz?, moment?, day?, year? }], left }.
// Fonctions pures : testées avec Node (tests/today.test.ts).
import type { Key } from './i18n';

export type TodayItem = {
  kind: 'quranJuz' | 'quranStart' | 'athkar' | 'ramadan' | 'ramadanBilan' | 'cards' | 'revision' | string;
  order: number;
  done: boolean;
  href: string;
  n?: number;
  total?: number;
  juz?: number;
  moment?: 'morning' | 'evening' | string;
  day?: number;
  year?: number;
};
export type TodayResponse = { date: string; items: TodayItem[]; left: number };

type T = (key: Key, vars?: Record<string, string | number>) => string;

/** Texte de la ligne (mêmes textes que le site : clés td*). Ligne inconnue : '' (elle n'est pas affichée). */
export function todayLabel(it: TodayItem, t: T): string {
  switch (it.kind) {
    case 'quranJuz': return t('tdQuranJuz', { n: it.juz ?? '' });
    case 'quranStart': return t('tdQuranStart');
    case 'athkar': return it.moment === 'evening' ? t('tdAthkar_evening') : t('tdAthkar_morning');
    case 'ramadan': return t('tdRamadan', { d: it.day ?? '' });
    case 'ramadanBilan': return t('tdRamadanBilan', { y: it.year ?? '' });
    case 'cards': return it.done ? t('tdCardsDone') : t('tdCards');
    case 'revision': return t('tdRevision');
    default: return '';
  }
}

/** Petit compteur à droite : « 3 / 8 » (athkar, Ramadan) ou « 12 » (cartes, révisions). */
export const todayCount = (it: TodayItem): string => (it.total ? `${it.n ?? 0} / ${it.total}` : (it.n ?? 0) > 0 ? String(it.n) : '');

/** Clé stable de la ligne. */
export const todayKey = (it: TodayItem): string => `${it.kind}-${it.moment ?? it.juz ?? it.day ?? it.year ?? ''}`;

/**
 * Où mène la ligne : un écran de l'application quand il existe, sinon la page du site (chemin relatif, jamais d'adresse extérieure).
 * Coran (M2) et athkar (M3) : dans l'application. Ramadan et cartes arrivent aux étapes M4 et M5 : en attendant, ils s'ouvrent sur le site.
 */
export function todayTarget(href: unknown, moment?: string): { app: string } | { web: string } {
  const h = typeof href === 'string' ? href.trim() : '';
  if (!h.startsWith('/') || h.startsWith('//') || h.length > 200 || /[\s\\]/.test(h)) return { app: '/learn' };
  const [path, query = ''] = h.split('#')[0].split('?');
  const tab = new URLSearchParams(query).get('tab');
  if (path === '/learning' && (tab === 'rev' || !tab)) return { app: '/learn' };
  if (path === '/coran') return { app: '/quran' }; // étape M2
  if (path === '/learning' && tab === 'athkar') return { app: moment === 'morning' || moment === 'evening' ? `/athkar?cat=${moment}` : '/athkar' }; // étape M3
  return { web: h };
}
