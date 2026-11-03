// Étape M6 — parcours du nouveau membre et du compte dans l'application (comme le site : étapes B2, 21, 43).
// Fonctions pures : testées avec Node (tests/onboarding.test.ts).
import type { Key } from './i18n';

// ---------------------------------------------------------------- « Par quoi commencer ? »
export type StartCard = { id: 'talk' | 'quran' | 'athkar' | 'ramadan'; route: string; title: Key; text: Key; badge?: Key; icon: string };
/** 3 premières cartes dont la fonction est activée (même ordre que le site). */
export function startCards(feat: (id: string) => boolean): StartCard[] {
  const all: (StartCard & { on: boolean })[] = [
    { id: 'talk', on: true, route: '/talks', title: 'obTalk', text: 'obTalkTx', icon: 'play' },
    { id: 'quran', on: feat('quran') && feat('quranplan'), route: '/quran', title: 'obQuran', text: 'obQuranTx', icon: 'book' },
    { id: 'athkar', on: feat('athkar'), route: '/athkar', title: 'obAthkar', text: 'obAthkarTx', badge: 'obLearnBadge', icon: 'sun' },
    { id: 'ramadan', on: feat('ramadan'), route: '/ramadan', title: 'obRamadan', text: 'obRamadanTx', icon: 'moon' },
  ];
  return all.filter((c) => c.on).slice(0, 3).map(({ on, ...c }) => { void on; return c; });
}
/** Afficher l'écran « Par quoi commencer ? » : membre dont le compte est nouveau (onboarded = false) et fonction active. */
export const showStart = (user: { onboarded?: boolean } | null, feat: (id: string) => boolean): boolean => Boolean(user && user.onboarded === false && feat('onboarding'));

// ---------------------------------------------------------------- Visite guidée
// Sur le site, chaque bulle éclaire un élément de la page ; dans l'application, chaque étape dit OÙ se trouve la rubrique
// (onglet du bas, menu ☰, loupe) et propose de l'ouvrir.
export type TourStep = { id: string; title: Key; text: Key; icon: string; route?: string; feature?: string };
export const TOUR_STEPS: TourStep[] = [
  { id: 'today', title: 'tourToday_t', text: 'tourToday', icon: 'check-square' },
  { id: 'learn', title: 'tourLearn_t', text: 'tourLearn', icon: 'book-open', route: '/learn', feature: 'learning' },
  { id: 'quran', title: 'tourQuran_t', text: 'tourQuran', icon: 'book', route: '/quran', feature: 'quran' },
  { id: 'menu', title: 'tourBurger_t', text: 'tourBurger', icon: 'menu' },
  { id: 'search', title: 'tourSearch_t', text: 'tourSearch', icon: 'search', route: '/search' },
  { id: 'account', title: 'tourAccount_t', text: 'tourAccount', icon: 'user', route: '/account' },
];
export const tourSteps = (feat: (id: string) => boolean): TourStep[] => TOUR_STEPS.filter((s) => !s.feature || feat(s.feature));

// ---------------------------------------------------------------- Parrainage
export type Referral = {
  code: string; months: number; maxPerYear: number;
  stats: { invited: number; rewarded: number; pending: number; monthsEarned: number; capReached: boolean };
  referredBy: { status: string; months: number } | null;
};
/** Lien d'inscription avec le code (même lien que le site). */
export const referralLink = (site: string, code: string): string => `${site.replace(/\/+$/, '')}/register?ref=${encodeURIComponent(code)}`;
/** Code de parrainage saisi : 8 caractères (sans O/0/I/1, comme le serveur) ; tirets et espaces ignorés. */
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const cleanCode = (v: string): string => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export const codeOk = (v: string): boolean => { const c = cleanCode(v); return c.length === 8 && [...c].every((x) => REF_ALPHABET.includes(x)); };

// ---------------------------------------------------------------- Cartes cadeaux
export type Gift = { id: string; months: number; status: 'paid' | 'redeemed' | 'void'; code: string | null; recipientEmail: string | null; createdAt: string; paidAt: string | null };
export const GIFT_MONTHS: Record<number, Key> = { 1: 'gfM1', 3: 'gfM3', 12: 'gfM12' };
export const GIFT_STATE: Record<Gift['status'], Key> = { paid: 'gfPaid', redeemed: 'gfRedeemed', void: 'gfVoid' };
/** Code de carte cadeau saisi → « ABCD-EFGH-JKLM » (12 caractères) ou null. */
export function giftCode(v: string): string | null {
  const c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 12 ? `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}` : null;
}
/** Lien d'activation à partager (page /redeem du site). */
export const redeemLink = (site: string, code: string): string => `${site.replace(/\/+$/, '')}/redeem?code=${encodeURIComponent(code)}`;
