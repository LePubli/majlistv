// Étape M5 — « Apprendre » de l'application, comme la page du site (étape B6) : 4 onglets regroupant des sections,
// cartes mémoire (étape 38), bilan personnel (Tazkiyat an-nafs), évolution, attestations, assistant « Poser une question » (étape 41).
// Fonctions pures : testées avec Node (tests/learnHub.test.ts).
import type { Key } from './i18n';

// ---------------------------------------------------------------- Onglets
export type SectionId = 'dash' | 'path' | 'rev' | 'cards' | 'commit' | 'bilan' | 'att' | 'plan';
export type GroupId = 'g_today' | 'g_plan' | 'g_talks' | 'g_progress';
export type Group = { id: GroupId; label: Key; intro: Key; subs: SectionId[] };

const ALL_GROUPS: Group[] = [
  { id: 'g_today', label: 'lgGToday', intro: 'lgGTodayTx', subs: ['dash'] },
  { id: 'g_plan', label: 'pnTab', intro: 'lgGPlanTx', subs: ['plan'] },
  { id: 'g_talks', label: 'lgGTalks', intro: 'lgGTalksTx', subs: ['path', 'rev', 'cards'] },
  { id: 'g_progress', label: 'lgGProgress', intro: 'lgGProgressTx', subs: ['commit', 'bilan', 'att'] },
];
// Fonction nécessaire à chaque section (comme les onglets du site) ; sans fonction = toujours là.
const NEEDS: Partial<Record<SectionId, string>> = { rev: 'revision', cards: 'memorycards', commit: 'practice', bilan: 'selfcheck' };

/** Groupes visibles selon les fonctions activées (Admin → Fonctions) ; un groupe sans section disparaît. */
export function groupsFor(feat: (id: string) => boolean): Group[] {
  return ALL_GROUPS.map((g) => ({ ...g, subs: g.subs.filter((s) => !NEEDS[s] || feat(NEEDS[s] as string)) })).filter((g) => g.subs.length > 0);
}
/** Le Coran et les adhkar sont dans « Pratique » (navigation de novembre 2026) : un ancien lien ?tab=quran ou ?tab=athkar
 * ouvre leur écran. */
export const movedTab = (tab: unknown): '/quran' | '/athkar' | null => (tab === 'quran' ? '/quran' : tab === 'athkar' ? '/athkar' : null);
/** Section demandée par un lien (?tab=rev, ?tab=cards…) ou la première. */
export function pickSection(groups: Group[], tab: unknown): SectionId {
  const all = groups.flatMap((g) => g.subs);
  const v = typeof tab === 'string' ? tab : '';
  return (all as string[]).includes(v) ? v as SectionId : all[0] ?? 'dash';
}
export const groupOf = (groups: Group[], s: SectionId): Group => groups.find((g) => g.subs.includes(s)) ?? groups[0];
/** Libellé d'une section (sous-onglet). */
export const SECTION_LABEL: Record<SectionId, Key> = {
  dash: 'tbDash', path: 'tbPath', rev: 'tbQuizRev', cards: 'mcTab', commit: 'tbCommit', bilan: 'msBilan', att: 'tbAtt', plan: 'pnTab',
};

// ---------------------------------------------------------------- Cartes mémoire
export type MemoryCard = {
  id: string; talkId: string; talkTitle: string; lang: string; front: string; answer: string; explanation: string | null;
  quote: string | null; startMs: number | null; isNew?: boolean; stage: number;
};
export type CardsResponse = {
  free: boolean;
  counts: { total: number; mastered: number; learning: number; due: number; newAvailable: number };
  session: { cards: MemoryCard[]; due: number; fresh: number; remaining: number };
};
/** Après une réponse : la carte sort de la file ; ratée, elle revient UNE fois en fin de file (jamais en boucle). */
export function requeue<C extends { id: string }>(queue: C[], card: C, known: boolean, retried: Set<string>): { queue: C[]; retried: Set<string> } {
  const rest = queue.slice(1);
  if (known || retried.has(card.id)) return { queue: rest, retried };
  const r = new Set(retried); r.add(card.id);
  return { queue: [...rest, card], retried: r };
}
/** « Revoir ce passage » : 3 s avant la citation (au moins 5 s, sinon la vidéo s'ouvre au début). */
export function replayAt(card: { startMs: number | null }): number | undefined {
  const sec = card.startMs != null ? Math.max(0, Math.floor(card.startMs / 1000) - 3) : 0;
  return sec > 5 ? sec : undefined;
}
/** Cartes à faire aujourd'hui (pastille). */
export const cardsToday = (c: CardsResponse['counts']): number => c.due + c.newAvailable;

// ---------------------------------------------------------------- Assistant « Poser une question »
export const MAX_QUESTION = 400;
export type AskTurn = { id?: string; question: string; answer: string; status?: string; sources?: { text: string; startMs: number }[]; reported?: boolean };
export function askErrorKey(code?: string, status?: number): Key {
  if (code === 'learning_required') return 'askNeedLearning';
  if (code === 'ask_quota') return 'askQuota';
  if (code === 'ask_busy') return 'askBusy';
  if (code === 'ask_failed') return 'askFailed';
  if (code === 'no_transcript') return 'askNoTranscript';
  if (code === 'ask_unavailable' || status === 503) return 'askUnavailable';
  return 'askError';
}
export const validQuestion = (q: string): boolean => { const n = String(q || '').trim().length; return n >= 3 && n <= MAX_QUESTION; };
export const pushTurn = (turns: AskTurn[], turn: AskTurn): AskTurn[] => [...turns, turn].slice(-30);
export const markReported = (turns: AskTurn[], id: string): AskTurn[] => turns.map((x) => (x.id === id ? { ...x, reported: true } : x));
export const dropTurn = (turns: AskTurn[], id: string): AskTurn[] => turns.filter((x) => x.id !== id);
/** mm:ss (ou h:mm:ss) d'une position en millisecondes. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  const p = (x: number) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(r)}` : `${m}:${p(r)}`;
}

// ---------------------------------------------------------------- Bilan personnel (Tazkiyat an-nafs)
export const SC_STATES = ['achieved', 'progress', 'not_yet'] as const;
export type ScState = typeof SC_STATES[number];
export type Goal = {
  id: string; nature: 'quality' | 'defect'; title: string; themeId: string | null; commitmentId: string | null; archived: boolean;
  current: { status: ScState; note: string } | null; marks: Record<string, ScState>;
};
export type SelfCheckResponse = {
  week: string; weeks: string[]; limit: number; goals: Goal[]; commitments: { id: string; text: string }[];
  consent: boolean; prefs: { email: boolean; weekday: number }; emailEnabled: boolean; emailHour: number; themesEnabled: boolean;
};
export type ScTheme = { id: string; kind: 'quality' | 'defect'; title: string; translit?: string; ar?: string; desc?: string };
/** Ajoute n jours à une date AAAA-MM-JJ. */
export function addDays(iso: string, n: number): string { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/** Date courte localisée (« 3 novembre »). */
export function shortDate(iso: string, locale: string): string {
  try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch { return iso; }
}
/** Nom du jour (1 = lundi … 7 = dimanche). */
export function dayName(n: number, locale: string): string {
  try { return new Date(Date.UTC(2024, 0, n)).toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' }); } catch { return String(n); }
}
/** Objectifs actifs au maximum ? */
export const goalsFull = (d: SelfCheckResponse): boolean => d.goals.filter((g) => !g.archived).length >= d.limit;
/** Remplace un objectif modifié ; un archivé quitte la liste active (sauf si l'on affiche les archivés). */
export function replaceGoal(goals: Goal[], n: Goal, showArchived: boolean): Goal[] {
  return goals.flatMap((g) => (g.id !== n.id ? [g] : n.archived && !showArchived ? [] : [n]));
}

// ---------------------------------------------------------------- Évolution
export type EvolutionResponse = {
  month: string; months: string[]; themesEnabled: boolean;
  themes: { id: string; title: string; watched: number; quizzes: number; made: number; done: number; goals: number; achieved: number; progress: number; notYet: number }[];
};
export function monthLabel(m: string, locale: string): string {
  try { return new Date(`${m}-15T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }); } catch { return m; }
}
