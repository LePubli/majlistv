// Bloc « Aujourd'hui » (étape M1, même contenu que le site — étape B1) : textes des lignes et écran à ouvrir.
// Données : GET /me/today?lang=xx → { date, items: [{ kind, order, done, href, n?, total?, juz?, moment?, day?, year? }], left }.
// Fonctions pures : testées avec Node (tests/today.test.ts).
import type { Key } from './i18n';
import { LEGACY_TABS } from './learnHub';

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
    case 'quiz': return t('tdQuiz'); // étape N7 : ligne « Quiz à passer » de l'accueil
    default: return '';
  }
}

/** Petit compteur à droite : « 3 / 8 » (adhkar, Ramadan) ou « 12 » (cartes, révisions). */
export const todayCount = (it: TodayItem): string => (it.total ? `${it.n ?? 0} / ${it.total}` : (it.n ?? 0) > 0 ? String(it.n) : '');

/** Clé stable de la ligne. */
export const todayKey = (it: TodayItem): string => `${it.kind}-${it.moment ?? it.juz ?? it.day ?? it.year ?? ''}`;

/**
 * Où mène la ligne : un écran de l'application quand il existe, sinon la page du site (chemin relatif, jamais d'adresse extérieure).
 * Tout s'ouvre dans l'application depuis l'étape M5 (Coran, adhkar, Ramadan, révisions, cartes) ; une ligne inconnue s'ouvre sur le site.
 */
export function todayTarget(href: unknown, moment?: string): { app: string } | { web: string } {
  const h = typeof href === 'string' ? href.trim() : '';
  if (!h.startsWith('/') || h.startsWith('//') || h.length > 200 || /[\s\\]/.test(h)) return { app: '/learn' };
  const [path, query = ''] = h.split('#')[0].split('?');
  const tab = new URLSearchParams(query).get('tab');
  if (path === '/learning' && !tab) return { app: '/learn' };
  if (path === '/learning' && tab && tab in LEGACY_TABS) return { app: `/learn?tab=${tab}` }; // étapes M5 et N7 (onglets et anciennes sections)
  if (path === '/coran') return { app: '/quran' }; // étape M2
  if (path === '/ramadan') return { app: /#rb-t$/.test(h) ? '/ramadan?bilan=1' : '/ramadan' }; // étape M4
  if (path === '/learning' && tab === 'athkar') return { app: moment === 'morning' || moment === 'evening' ? `/athkar?cat=${moment}` : '/athkar' }; // étape M3
  return { web: h };
}

/** Étape N7 (comme le site N3) : sur l'accueil, la carte « À faire aujourd'hui » porte aussi les quiz à passer (une ligne),
 * à la place des rangées « À réviser » et « Quiz à rattraper ». Lignes faites en bas, puis par ordre. */
export function withQuizLine(data: TodayResponse | null, quizN: number): TodayResponse | null {
  if (!data || !quizN) return data;
  const quiz: TodayItem = { kind: 'quiz', order: 35, n: quizN, done: false, href: '/learning?tab=rev' };
  const items = [...data.items, quiz].sort((a, b) => Number(a.done) - Number(b.done) || (a.order ?? 99) - (b.order ?? 99));
  return { ...data, items, left: (data.left || 0) + 1 };
}
