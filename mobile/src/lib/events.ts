// Événements en direct (application) — logique pure : types, décompte, date, adresse du fichier agenda. Testable avec Node.
export type EventPhase = 'upcoming' | 'live' | 'ended' | 'cancelled';
export type LiveEvent = {
  id: string; title: string; speaker: string; description: string; language: string;
  startsAt: string; durationMinutes: number; phase: EventPhase;
  video?: { source: 'youtube' | 'vimeo'; ref: string }; // donné seulement quand le direct est ouvert
  reminded: boolean;
  replay: { talkId: string; title: string } | null;
};

export type CountdownUnits = { d: string; h: string; m: string; s: string };
const p2 = (n: number) => String(n).padStart(2, '0');

/** « 2 j 03 h 15 min » ; sous une heure : « 12 min 05 s ». */
export function fmtCountdown(ms: number, u: CountdownUnits = { d: 'j', h: 'h', m: 'min', s: 's' }): string {
  const s = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} ${u.d} ${p2(h)} ${u.h} ${p2(m)} ${u.m}`;
  if (h > 0) return `${h} ${u.h} ${p2(m)} ${u.m}`;
  return `${m} ${u.m} ${p2(s % 60)} ${u.s}`;
}

const INTL: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar' };
/** « samedi 7 novembre, 17:00 » dans la langue de l'application et le fuseau du téléphone. */
export function fmtWhen(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(INTL[locale] ?? 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/** Adresse du fichier agenda : le téléphone l'ouvre avec son application Agenda. */
export const calendarUrl = (apiUrl: string, id: string) => `${apiUrl.replace(/\/$/, '')}/events/${encodeURIComponent(id)}/calendar.ics`;

/** Un événement qui a encore un intérêt (rappel, agenda) : ni terminé ni annulé. */
export const isOpenEvent = (e: Pick<LiveEvent, 'phase'>) => e.phase === 'upcoming' || e.phase === 'live';

/** Dans combien de temps relire la fiche (ms) : à l'ouverture du direct, puis chaque minute ; null si l'événement est fini. */
export function nextRefreshMs(e: Pick<LiveEvent, 'phase' | 'startsAt'>, now: number): number | null {
  if (e.phase === 'ended' || e.phase === 'cancelled') return null;
  if (e.phase === 'live') return 60000;
  return Math.max(5000, Math.min(new Date(e.startsAt).getTime() - now + 1000, 60000));
}
