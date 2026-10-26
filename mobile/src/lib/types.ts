// Formes des réponses de l'API utilisées par l'application (voir api/src/routes/*.js).

export type User = { id: string; email: string; name: string; role: 'user' | 'organizer' | 'moderator' | 'admin'; locale: string };

export type Card = {
  id: string;
  title: string;
  speaker: string;
  language?: string;
  access: 'free' | 'premium';
  source: 'upload' | 'youtube' | 'vimeo' | 'dailymotion' | 'archive';
  category?: string | null;
  durationSeconds?: number | null;
  posterUrl?: string | null;
  summary?: string;
  level?: 'beginner' | 'intermediate' | 'advanced' | null;
  format?: string | null;
  video_ref?: string;
  /** « Continuer à regarder » seulement */
  positionMs?: number;
  durationMs?: number;
  /** Rangées Apprendre : à passer / à revoir / à réviser. */
  quizState?: 'todo' | 'retry' | 'review';
  bestPercent?: number | null;
  nextUp?: boolean;
  /** Épisode de série : « Titre · S1 É3 ». */
  series?: { id?: string; title: string; number: number; seasonNumber?: number | null } | null;
};

export type SeriesItem = {
  id: string; title: string; speaker?: string; posterUrl?: string | null; access: 'free' | 'premium' | 'mixed'; level?: string | null;
  episodeCount: number; seasonCount?: number; hasSeasons?: boolean; watched?: number;
};
export type HomeRow = { key: string; title: string | null; categoryId?: number; total?: number; talks?: Card[]; series?: SeriesItem[]; forYou?: boolean };
export type Home = {
  hero: { mode: 'text' } | { mode: 'featured'; items: Card[] } | { mode: 'custom'; title: string; subtitle: string; imageUrl: string | null; ctaLabel?: string; ctaUrl?: string };
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
  tracks?: string[];
  themes?: { id: number | string; name: string }[];
  speakerSlug?: string | null;
  transcriptStatus?: string;
  insightsPending?: boolean;
  quiz?: { available: boolean; count: number };
  practice?: { available: boolean };
};

export type AppConfig = {
  features: Record<string, boolean>;
  hasSeries: boolean;
  hasBooks: boolean;
  appName: string;
  trialDays: number;
  /** Player ID Dailymotion (Admin → Paramètres) ; vide : les vidéos Dailymotion s'ouvrent sur le site. */
  dailymotionPlayerId?: string;
  cards?: { show: Record<string, boolean> };
  /** Réglages de la fonction Prière (Admin → Paramètres) ; absent si la fonction est désactivée. */
  prayer?: { defaultEnabled: boolean; pill: boolean; method: string; asr: string; blockMinutes: number; maxBlockMinutes: number; city: string } | null;
};

export type Citation = { text: string; textAr?: string | null; attribution: string } | null;
export type KidsHome = { enabled: boolean; talks: Card[] } | null;
export type FormatItem = { id: number; slug: string; nameFr: string; nameEn: string; nameAr: string; count: number };

export type SeriesCtx = {
  id: string; title: string; number?: number | null; total: number; season?: { number: number } | null;
  prev?: { id: string } | null; next?: { id: string; title: string; number: number; seasonNumber?: number | null } | null;
  episodes: { id: string; title: string; number: number; seasonNumber?: number | null; durationSeconds?: number; positionMs?: number; completed?: boolean; current?: boolean; posterUrl?: string | null; access?: string }[];
};

export type TranscriptData = { lang: string; languages: string[]; segments: { s: number; e: number; t: string }[] };
export type Note = { id: string; positionMs: number; body: string };

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

// ---- Tranche 3b : séries, collections, thèmes, intervenants, recherche ----
export type SeriesEpisode = { id: string; title: string; number: number; durationSeconds?: number; positionMs?: number; completed?: boolean; posterUrl?: string | null; access?: string };
export type SeriesDetail = SeriesItem & {
  description?: string; category?: string | null; episodes: SeriesEpisode[];
  seasons?: { id: string | null; number: number | null; title: string; episodes: SeriesEpisode[] }[] | null;
  resume?: { talkId: string; positionMs: number; number: number; started: boolean } | null;
};
export type CollectionItem = { id: string; title: string; description: string; kind?: string; talks: number; posterUrl?: string | null };
export type CollectionDetail = { id: string; title: string; description: string; talks: Card[] };
export type ThemeDetail = { id: string; title: string; translit?: string; ar?: string; desc?: string; steps?: { size: number; text: string }[]; talks: { id: string; title: string; speaker?: string; durationSeconds?: number; language?: string }[] };
export type SpeakerDetail = { slug: string; name: string; bio?: string; talks: number; seriesCount: number; series: SeriesItem[]; followers?: number };
export type SearchHit = Card & { snippet?: string | null; moments?: { ms: number; text: string }[] };
export type SearchResult = { total: number; hits: SearchHit[]; series: SeriesItem[]; markers: [string, string] };

// ---- Mejliss Kids (22b-9a) ----
export type KidProfile = { id: string; name: string; avatar: string; band: string };
export type KidProfileFull = KidProfile & { dailyLimitMin: number | null; catalogMode: string };
export type KidsState = {
  allowed: boolean; hasPin: boolean; max: number; learning: boolean; reportEmail: string | null;
  profiles: KidProfileFull[]; bands: string[]; avatars: string[];
};
export type KidTime = { limitMin: number | null; usedSec: number; leftSec: number | null; timeUp: boolean };
export type KidRubric = { id: number; slug: string; names: Record<string, string>; emoji: string; position: number };
export type KidCard = {
  id: string; title: string; speaker: string | null; access: string; source: string; kidsBands: string[]; durationSeconds: number | null;
  completed: boolean; positionMs: number; rubricIds: number[]; stars: number | null; posterUrl: string | null;
};
export type KidShelf = { kind: 'resume' | 'because' | 'age' | 'new' | 'popular' | 'rubric'; ids: string[]; rubricId?: number; basedOn?: { id: string; title: string } };
export type KidCatalog = { rubrics: KidRubric[]; shelves: KidShelf[]; talks: KidCard[]; time: KidTime };

// ---- Mejliss Kids (22b-9b) : quiz, étoiles, badges, petites actions, courts ----
export type KidQuizQuestion = { id: string; question: string; options: string[] };
export type KidQuizResult = {
  score: number; total: number; percent: number; stars: number; totalStars: number; previousStars: number; newBadges: string[]; nextReview: string | null;
  results: { questionId: string; chosen: number; correct: boolean; correctIndex: number; explanation: string | null; evidenceMs: number | null }[];
};
export type KidActionStatus = 'todo' | 'claimed' | 'validated';
export type KidAction = { id: string; title: string; status: KidActionStatus; createdAt: string; claimedAt: string | null; validatedAt: string | null };
export type KidActionCounts = { todo: number; claimed: number; validated: number };
export type KidSummary = {
  time: KidTime; learning: boolean; stars: number; quizzes: number; watched: number; badges: { code: string; earnedAt: string }[]; allBadges: string[];
  due: { id: string; title: string; speaker: string | null; source: string; durationSeconds: number | null; posterUrl: string | null }[]; actions?: KidActionCounts;
};
export type KidShort = { id: string; title: string; duration: number | null; views: number; publishedAt: string; videoUrl: string | null; posterUrl: string | null; talk: { id: string; title: string; premium: boolean } };

// ---- Mejliss Kids (22b-9c) : espace parent ----
export type KidControls = { dailyLimitMin: number | null; catalogMode: 'all' | 'selected'; usedSec: number; leftSec: number | null; min: number; max: number };
export type KidCatalogTalk = { id: string; title: string; speaker: string | null; kidsBands: string[]; durationSeconds: number | null; access: string; allowed: boolean };
export type KidParentCatalog = { mode: 'all' | 'selected'; talks: KidCatalogTalk[] };
export type KidReportProfile = {
  id: string; name: string; avatar: string; band: string; dailyLimitMin: number | null; catalogMode: string; usage: { day: string; seconds: number }[];
  minutes: number; activeDays: number; watched: number; watchedTitles: string[]; quizzes: number; avgPercent: number | null; starsGained: number; stars: number; badges: string[]; retry: string[]; active: boolean;
};
export type KidReport = { days: number; since: string; profiles: KidReportProfile[]; learning: boolean; email: boolean };
