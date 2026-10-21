// Formes des réponses de l'API utilisées par l'application (voir api/src/routes/*.js).

export type User = { id: string; email: string; name: string; role: 'user' | 'organizer' | 'moderator' | 'admin'; locale: string };

export type Card = {
  id: string;
  title: string;
  speaker: string;
  language?: string;
  access: 'free' | 'premium';
  source: 'upload' | 'youtube' | 'vimeo' | 'archive';
  category?: string | null;
  durationSeconds?: number | null;
  posterUrl?: string | null;
  summary?: string;
  /** « Continuer à regarder » seulement */
  positionMs?: number;
  durationMs?: number;
};

export type HomeRow = { key: string; title: string | null; categoryId?: number; talks?: Card[]; series?: unknown[]; forYou?: boolean };
export type Home = {
  hero: { mode: 'text' } | { mode: 'featured'; items: Card[] } | { mode: 'custom'; title: string; subtitle: string; imageUrl: string | null };
  rows: HomeRow[];
};

export type Category = { id: number; name: string; parentId: number | null; fullName: string; depth: number };

export type Talk = Card & {
  description: string;
  status?: string;
  video_status?: string;
  locked?: boolean;
  preview?: boolean;
  previewSeconds?: number;
  playbackToken?: string;
  hlsPath?: string;
  audioPath?: string;
  fileUrl?: string;
  videoUrl?: string;
  video_ref?: string;
  resumeMs?: number;
  favorite?: boolean;
  playerError?: string;
};

export type Insights = {
  lang: string | null;
  summary: string;
  keyPoints: string[];
  chapters: { s: number; t: string }[];
  preview?: boolean;
};

export type BillingStatus = { active: boolean; tier: 'standard' | 'learning' | null; learning: boolean };

// ---- Tranche 2a : Bibliothèque, Apprendre, quiz, mise en pratique ----
export type ListSummary = { id: string; title: string; description: string; shared: boolean; items: number; updatedAt: string };
export type ListsResponse = { limit: number; maxItems: number; lists: ListSummary[] };
export type ListDetail = ListSummary & { unavailable: number; talks: Card[] };

export type RevisionInfo = { stage: number; dueOn: string; lateDays: number; lastPercent: number | null };
export type RevisionResponse = {
  items: (Card & { revision?: RevisionInfo; quizState?: string })[];
  total: number;
  remaining: number;
  reminder: { id: string; text: string; textAr: string | null; startMs: number | null; attribution: string | null; talkId: string | null; talkTitle: string | null; speaker: string | null } | null;
  upcoming: { week: number; mastered: number; nextOn: string | null };
};

export type QuizTodoCard = Card & { quizState: 'todo' | 'retry'; bestPercent?: number | null };

export type BadgeId = 'first_quiz' | 'passed_5' | 'passed_10' | 'perfect' | 'comeback' | 'streak_3' | 'explorer' | 'series_done';
export type LearningResponse = {
  score: number; quizzesTaken: number; quizzesPassed: number;
  badges: { id: BadgeId; earned: boolean; earnedAt: string | null }[];
  series: { id: string; title: string; speaker: string; total: number; passed: number; complete: boolean }[];
  recent: { talkId: string; title: string; percent: number; passed: boolean; at: string }[];
};

export type PracticeStatus = 'todo' | 'doing' | 'done' | 'not_yet';
export type DueKind = 'today' | 'week' | 'month';
export type Commitment = {
  id: string; talkId: string; talkTitle: string | null; suggestionId: string | null; size: number | null;
  text: string; niyya: string; note: string; dueKind: DueKind | null; dueOn: string | null; status: PracticeStatus;
  doneAt: string | null; overdue: boolean;
};
export type PracticeMine = { items: Commitment[]; counts: { todo: number; doing: number; done: number; notYet: number }; keyReady: boolean };

export type QuizQuestion = { id: string; question: string; options: string[]; chapterMs: number | null; chapterTitle: string | null };
export type QuizData = { passPercent: number; questions: QuizQuestion[]; last: { percent: number; passed: boolean; best: number | null; everPassed: boolean } | null };
export type QuizResult = {
  score: number; total: number; percent: number; passed: boolean; passPercent: number; best: number | null; saved: boolean;
  learning: { score: number; previousScore: number; newBadges: BadgeId[] } | null;
  results: { questionId: string; chosen: number | null; correct: boolean; correctIndex: number; explanation: string | null; chapterTitle: string | null }[];
};

export type PracticeSuggestion = { id: string; text: string; size: number; reference: string };
export type PracticeTalk = { suggestions: PracticeSuggestion[]; signedIn: boolean; tier: boolean; consent: boolean; mine: Commitment[] };
