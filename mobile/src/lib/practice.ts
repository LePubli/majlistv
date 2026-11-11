// Navigation de novembre 2026 (lot G) — onglet « Pratique » de l'application : les gestes de chaque jour.
// Même contenu que la page /pratique du site : Prière, Coran, Adhkar, Ramadan, selon les fonctions activées.
// Fonction pure : testée avec Node (tests/practice.test.ts).
import type { Key } from './i18n';

export type PracticeCard = { key: 'prayer' | 'quran' | 'athkar' | 'ramadan'; pathname: '/prayer' | '/quran' | '/athkar' | '/ramadan'; icon: string; title: Key; text: Key };

const ALL: (PracticeCard & { feat: string; member?: boolean })[] = [
  { key: 'prayer', pathname: '/prayer', icon: 'clock', title: 'pqNav', text: 'pqHubPrayerTx', feat: 'prayer' },
  { key: 'quran', pathname: '/quran', icon: 'book', title: 'qrNav', text: 'pqHubQuranTx', feat: 'quran' },
  { key: 'athkar', pathname: '/athkar', icon: 'sun', title: 'atTab', text: 'pqHubAthkarTx', feat: 'athkar', member: true },
  { key: 'ramadan', pathname: '/ramadan', icon: 'moon', title: 'rzNav', text: 'pqHubRamadanTx', feat: 'ramadan' },
];

/** Cartes à montrer : fonction activée ; les adhkar demandent un compte (comme dans le menu ☰). */
export function practiceCards(feat: (id: string) => boolean, loggedIn: boolean): PracticeCard[] {
  return ALL.filter((c) => feat(c.feat) && (!c.member || loggedIn)).map(({ feat: _f, member: _m, ...c }) => c);
}
/** L'onglet « Pratique » n'a de sens que si au moins un geste est activé. */
export const practiceOn = (feat: (id: string) => boolean): boolean => ALL.some((c) => feat(c.feat));
