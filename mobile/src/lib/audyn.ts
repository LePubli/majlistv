// Audyn (livres audio) — logique pure du lecteur : types, formats, reprise, minuteur de sommeil avec fondu.
// Aucune dépendance native : testable avec Node (voir tests/audyn.test.ts).

export type AudynItem = {
  id: string; title: string; narrator: string; author: string; category: string; language: string;
  chapters: number; durationSeconds: number; coverUrl: string | null; full: boolean;
  /** Étape C-3 : en vente à l'unité. */
  onSale?: boolean;
};
export type AudynChapter = { id: string; title: string; durationSeconds: number; position?: number; playable: boolean };
export type AudynDetail = {
  id: string; title: string; narrator: string; author: string; description: string; category: string; language: string;
  coverUrl: string | null; durationSeconds: number;
  access: { full: boolean; previewSeconds: number; learningRequired: boolean };
  sale?: import('./sales').Sale;
  chapters: AudynChapter[];
  // Histoires du soir (espace Kids) : renseigné par l'écran enfant, jamais par l'API publique.
  kids?: boolean;
  resumeId?: string;           // clé de reprise propre à l'enfant
  timerAllowed?: boolean;      // l'enfant peut régler le minuteur de sommeil (accordé par le parent)
  autoStopMin?: number | null; // arrêt automatique réglé par le parent
};
export type AudynList = { items: AudynItem[]; categories: string[] };
export type PlayInfo = { preview: boolean; url: string; limitSeconds?: number };

/** 3725 → « 1:02:05 » ; 125 → « 2:05 » ; valeurs invalides → « 0:00 ». */
export function fmtClock(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return (h > 0 ? `${h}:` : '') + `${mm}:${String(r).padStart(2, '0')}`;
}

/** Durée « longue » : 5400 → « 1 h 30 » ; 1500 → « 25 min ». */
export function fmtLong(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.round(sec / 60) : 0;
  const h = Math.floor(s / 60), m = s % 60;
  if (h > 0) return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  return `${m} min`;
}

/** Adresses de l'API : livres audio (adultes) ou histoires du soir (jeton enfant). */
export const audynBase = (b: { kids?: boolean }) => (b.kids ? '/kids/stories' : '/audyn');
/** Identifiant de reprise : propre à l'enfant pour les histoires du soir. */
export const audynResumeId = (b: { id: string; resumeId?: string }) => b.resumeId || b.id;
/** Le minuteur est-il réglable par la personne qui écoute ? (adulte : toujours ; enfant : si le parent l'a autorisé.) */
export const canSetTimer = (b: { kids?: boolean; timerAllowed?: boolean }) => !b.kids || Boolean(b.timerAllowed);
/** Temps d'écoute des histoires envoyé au serveur toutes les 30 s (compté à part pour le rapport du parent). */
export const STORY_PING_MS = 30000;

// ---------------------------------------------------------------- Reprise
export type Resume = { cid: string; pos: number; at: number };

/** Clé de stockage de la reprise d'un livre (caractères autorisés par le coffre : lettres, chiffres, . - _). */
export const resumeKey = (itemId: string) => `audyn.pos.${String(itemId).replace(/[^A-Za-z0-9._-]/g, '_')}`;

export function encodeResume(r: Resume): string { return JSON.stringify([r.cid, Math.round(r.pos), r.at]); }

export function decodeResume(raw: string | null | undefined): Resume | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v) || typeof v[0] !== 'string' || !Number.isFinite(v[1]) || v[1] < 0) return null;
    return { cid: v[0], pos: v[1], at: Number.isFinite(v[2]) ? v[2] : 0 };
  } catch { return null; }
}

/** Où reprendre : le chapitre enregistré s'il existe encore et est jouable (sinon le premier), quelques secondes avant le point d'arrêt.
 *  Un chapitre quasi fini (≤ 5 s de la fin) repart du début ; un début (< 5 s) reste au début. */
export function resumePoint(chapters: AudynChapter[], saved: Resume | null): { index: number; pos: number } {
  const first = Math.max(0, chapters.findIndex((c) => c.playable));
  if (!saved) return { index: first, pos: 0 };
  const i = chapters.findIndex((c) => c.id === saved.cid);
  if (i < 0 || !chapters[i].playable) return { index: first, pos: 0 };
  const dur = chapters[i].durationSeconds;
  if (saved.pos < 5) return { index: i, pos: 0 };
  if (dur > 0 && saved.pos >= dur - 5) return { index: i, pos: 0 };
  return { index: i, pos: Math.max(0, saved.pos - 3) }; // reculer de 3 s pour retrouver le fil
}

// ---------------------------------------------------------------- « Continuer l'écoute » (accueil Audyn)
export const CONTINUE_MAX = 8;
/** Livres de la liste qui ont une position enregistrée, du plus récemment écouté au plus ancien. */
export function continueCandidates<T extends { id: string }>(items: T[], saved: Record<string, Resume | null>, limit = CONTINUE_MAX): { item: T; saved: Resume }[] {
  const out: { item: T; saved: Resume }[] = [];
  for (const it of items || []) { const s = saved[it.id]; if (s && s.at > 0) out.push({ item: it, saved: s }); }
  return out.sort((a, b) => b.saved.at - a.saved.at).slice(0, limit);
}

/** Où en est l'écoute : null si pas vraiment commencé (< 5 s du premier chapitre), fini (moins de 30 s avant la fin du dernier
 *  chapitre jouable) ou chapitre disparu. Sinon { index, count, left (secondes restantes), pct }. */
export function listenState(chapters: AudynChapter[], saved: Resume | null): { index: number; count: number; left: number; pct: number } | null {
  if (!saved || !Array.isArray(chapters) || !chapters.length) return null;
  const i = chapters.findIndex((c) => c.id === saved.cid);
  if (i < 0 || !chapters[i].playable) return null;
  let last = -1; chapters.forEach((c, k) => { if (c.playable) last = k; });
  const dur = Number(chapters[i].durationSeconds) || 0;
  const pos = Math.max(0, Math.min(Number(saved.pos) || 0, dur || Infinity));
  if (i === Math.max(0, chapters.findIndex((c) => c.playable)) && pos < 5) return null;
  if (i >= last && dur > 0 && pos >= dur - 30) return null;
  const total = chapters.reduce((a, c) => a + (Number(c.durationSeconds) || 0), 0);
  const before = chapters.slice(0, i).reduce((a, c) => a + (Number(c.durationSeconds) || 0), 0);
  const done = before + pos;
  return { index: i, count: chapters.length, left: Math.max(0, total - done), pct: total > 0 ? Math.min(1, done / total) : 0 };
}

/** Chapitre suivant jouable (pas de bouclage), sinon -1. */
export function nextPlayable(chapters: AudynChapter[], index: number): number {
  for (let i = index + 1; i < chapters.length; i++) if (chapters[i].playable) return i;
  return -1;
}
export function prevPlayable(chapters: AudynChapter[], index: number): number {
  for (let i = index - 1; i >= 0; i--) if (chapters[i].playable) return i;
  return -1;
}

// ---------------------------------------------------------------- Minuteur de sommeil
/** Durées proposées (minutes) ; 0 = « à la fin du chapitre ». */
export const SLEEP_CHOICES = [10, 20, 30, 45, 60, 0] as const;
export const FADE_SECONDS = 30;

export type SleepTimer = { endAt: number | null; endOfChapter: boolean };
export const NO_TIMER: SleepTimer = { endAt: null, endOfChapter: false };

export function startSleep(minutes: number, now: number): SleepTimer {
  if (minutes === 0) return { endAt: null, endOfChapter: true };
  if (!Number.isFinite(minutes) || minutes < 0) return NO_TIMER;
  return { endAt: now + Math.round(minutes) * 60000, endOfChapter: false };
}

/** Volume (0..1) pendant le fondu : 1 jusqu'aux FADE_SECONDS dernières secondes, puis descente linéaire jusqu'à 0. */
export function fadeVolume(remainingMs: number, fadeMs = FADE_SECONDS * 1000): number {
  if (!Number.isFinite(remainingMs)) return 1;
  if (remainingMs <= 0) return 0;
  if (remainingMs >= fadeMs) return 1;
  return Math.max(0, Math.min(1, remainingMs / fadeMs));
}

/** Fondu de fin de chapitre (minuteur « fin du chapitre ») : même courbe sur les dernières secondes restantes du fichier. */
export function chapterFade(remainingSec: number): number { return fadeVolume(remainingSec * 1000, 8000); }

export type TimerTick = { volume: number; stop: boolean; remainingMs: number | null };

/** Un « tic » du minuteur (appelé chaque seconde). `stop` = couper maintenant. */
export function sleepTick(tm: SleepTimer, now: number, chapterRemainingSec: number | null): TimerTick {
  if (tm.endAt != null) {
    const rem = tm.endAt - now;
    return { volume: fadeVolume(rem), stop: rem <= 0, remainingMs: Math.max(0, rem) };
  }
  if (tm.endOfChapter) {
    if (chapterRemainingSec == null) return { volume: 1, stop: false, remainingMs: null };
    return { volume: chapterFade(chapterRemainingSec), stop: false, remainingMs: Math.max(0, chapterRemainingSec * 1000) };
  }
  return { volume: 1, stop: false, remainingMs: null };
}

export const SPEEDS = [0.8, 1, 1.25, 1.5, 2] as const;
export function nextSpeed(cur: number): number {
  const i = SPEEDS.findIndex((s) => s === cur);
  return SPEEDS[(i + 1) % SPEEDS.length];
}

/** Saut (secondes) borné au chapitre. */
export function seekTarget(pos: number, delta: number, duration: number): number {
  const t = pos + delta;
  if (t < 0) return 0;
  if (duration > 0 && t > duration) return duration;
  return t;
}

/** Enregistre la reprise au plus toutes les `everySec` secondes d'écoute (et à la pause). */
export function shouldSaveResume(lastSavedPos: number, pos: number, everySec = 10): boolean {
  return !Number.isFinite(lastSavedPos) || Math.abs(pos - lastSavedPos) >= everySec;
}
