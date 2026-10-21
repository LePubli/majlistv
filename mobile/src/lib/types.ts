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
