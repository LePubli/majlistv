// Étape M4 — circuit de Ramadan, bilan, Ramadan des enfants et pastille « validations en attente » (mêmes règles que le site :
// étapes 45F, 45F2, 45G, B5). Fonctions pures : testées avec Node (tests/ramadan.test.ts).
import type { Key } from './i18n';

export type RamadanItem = { id: number; day: number; title: string; text: string; link: string; reference: string };
export type RamadanStatus = { active: boolean; day: number | null; hyear: number | null; startsOn: string | null; endsOn: string | null; daysToStart: number | null };
export type Tarawih = { rakaat: number | null; place: 'mosque' | 'home' | null };
export type RamadanResponse = {
  status: RamadanStatus; everyDay: RamadanItem[]; days: { day: number; items: RamadanItem[] }[];
  me?: { marks: Record<string, number[]>; tarawih: Record<string, Tarawih>; remindHour: number | null };
};
export type Bilan = {
  hyear: number; start: string; end: string; days: number; daysPassed: number;
  actions: { done: number; expected: number; fullDays: number };
  tarawih: { nights: number; rakaat: number; mosque: number; home: number };
  quranJuz: number; athkarDays: number; note: string;
} | null;
export type KidState = 'todo' | 'claimed' | 'validated';
export type KidRamadanResponse = { status: RamadanStatus; items: (RamadanItem & { state: KidState })[]; validated: number };
export type ParentRamadanResponse = { status: RamadanStatus; days: { day: number; items: (RamadanItem & { state: KidState })[] }[] };
export type PendingResponse = { total: number; profiles: { id: string; name: string; avatar: string; actions: number; ramadan: number; total: number }[] };

/** Actions d'un jour : celles « de chaque jour » puis celles du jour (comme le site). */
export const itemsOf = (d: RamadanResponse, day: number): RamadanItem[] => [...d.everyDay, ...(d.days[day - 1]?.items || [])];
export const marksOf = (d: RamadanResponse, day: number): number[] => d.me?.marks?.[String(day)] || [];
/** Cocher : membre connecté, pendant Ramadan, pour un jour déjà commencé (rattrapage permis, pas d'avance). */
export const canMark = (d: RamadanResponse, day: number): boolean => Boolean(d.me && d.status.active && d.status.day && day <= d.status.day);
/** Le programme contient-il au moins une action ? */
export const hasItems = (d: RamadanResponse): boolean => d.everyDay.length > 0 || d.days.some((x) => x.items.length > 0);
/** Jour choisi au départ : le jour en cours, sinon le 1er. */
export const startDay = (s: RamadanStatus): number => (s.active && s.day ? s.day : 1);
/** Toutes les actions du jour cochées. */
export const dayFull = (d: RamadanResponse, day: number): boolean => { const n = itemsOf(d, day).length; return n > 0 && marksOf(d, day).length >= n; };

type T = (key: Key, vars?: Record<string, string | number>) => string;
/** « Jour 12 de Ramadan 1448 » ou « Ramadan commence dans 20 jours (le …) » ; '' si rien n'est connu. */
export function statusLine(s: RamadanStatus, t: T, locale: string): string {
  if (s.active && s.day) return t('rzDayOf', { n: s.day, y: s.hyear ?? '' });
  if (s.startsOn) return t('rzStartsIn', { n: s.daysToStart ?? 0, d: longDate(s.startsOn, locale) });
  return '';
}
export function longDate(iso: string, locale: string): string {
  try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: 'long' } as Intl.DateTimeFormatOptions); } catch { return iso; }
}

/** Nombre de rakaat saisi : 2 à 40, vide = null. */
export const clampRakaat = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(40, Math.max(2, n)) : null;
};

/** Cartes du bilan (chiffres personnels, jamais comparés). Coran et adhkar seulement si leur fonction est active. */
export function bilanCards(b: NonNullable<Bilan>, t: T, feat: (id: string) => boolean): { icon: string; value: string; label: string }[] {
  return [
    { icon: '✅', value: `${b.actions.done} / ${b.actions.expected}`, label: t('rbActions') },
    { icon: '📅', value: `${b.actions.fullDays} / ${b.daysPassed}`, label: t('rbFullDays') },
    { icon: '🌙', value: String(b.tarawih.nights), label: t('rbTarawih') + (b.tarawih.rakaat ? ` · ${t('rbRakaat', { n: b.tarawih.rakaat })}` : '') },
    ...(feat('quranplan') ? [{ icon: '📖', value: String(b.quranJuz), label: t('rbJuz') }] : []),
    ...(feat('athkar') ? [{ icon: '📿', value: String(b.athkarDays), label: t('rbAthkar') }] : []),
  ];
}

/** Lien d'une action (page du site) : écran de l'application quand il existe, sinon page du site ; jamais d'adresse extérieure. */
export function itemLink(link: string): { app: string } | { web: string } | null {
  if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//') || /[\s\\]/.test(link) || link.length > 300) return null;
  const path = link.split(/[?#]/)[0];
  if (path === '/coran') return { app: '/quran' };
  const m = /^\/coran\/(\d{1,3})$/.exec(path);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 114) { const aya = /#v(\d{1,3})$/.exec(link)?.[1]; return { app: `/quran/${Number(m[1])}${aya ? `?aya=${Number(aya)}` : ''}` }; }
  if (path === '/learning' && /[?&]tab=athkar\b/.test(link)) return { app: '/athkar' };
  if (path === '/ramadan') return { app: '/ramadan' };
  const c = /^\/conferences\/([A-Za-z0-9_-]{1,120})$/.exec(path);
  if (c) return { app: `/talk/${c[1]}` };
  return { web: link };
}

/** Pastille : « 9+ » au-delà de 9 ; rien à 0. */
export const badgeText = (n: number): string => (n > 9 ? '9+' : n > 0 ? String(n) : '');
/** État d'une action de l'enfant → texte (côté parent). */
export const kidStateKey = (s: KidState): Key => (s === 'claimed' ? 'kaStClaimed' : s === 'validated' ? 'kaStValidated' : 'kaStTodo');
