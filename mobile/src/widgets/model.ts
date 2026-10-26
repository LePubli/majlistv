// Widgets Android (étape 25) : données et textes affichés, en fonctions pures (testées avec Node, aucune dépendance native).
// Trois widgets, chacun en petit et en grand : Prière (horaires calculés sur le téléphone), Réviser (conférences à réviser aujourd'hui),
// Citation du jour. L'affichage (widgets/ui.tsx) ne fait que dessiner ce que ce fichier prépare.
import { buildSchedule } from '../lib/prayer/prayerLogic';
import { fmtTime } from '../lib/prayer/prayerTimes';
import { translate, type Locale, type Key } from '../lib/i18n';

type Prefs = { loc: { lat: number; lon: number; tz: string; name?: string; mode?: string }; method: string; asr: string; highLat: string };

/** Ce que l'application laisse pour le widget Prière : réglages déjà résolus (lieu, méthode…), langue, fonction active ou non. */
export type PrayerSnap = { on: boolean; enabled: boolean; prefs: Prefs | null; locale: Locale };
/** Dernier état connu des conférences à réviser (lu sur le serveur, gardé pour hors ligne). */
export type ReviseSnap = { state: 'ok' | 'login' | 'tier' | 'error'; total: number; week: number; titles: string[]; at: number };
export type CitationSnap = { text: string; textAr: string | null; attribution: string; day: string } | null;

export const DEFAULT_LOCALE: Locale = 'fr';
const NAME_KEY = (id: string) => ('pry' + id[0].toUpperCase() + id.slice(1)) as Key;
const tr = (locale: Locale, key: string, vars?: Record<string, string | number>) => translate(locale, key as Key, vars);

// ---------- Prière ----------
export type PrayerView =
  | { kind: 'off'; message: string }
  | { kind: 'ready'; place: string; date: string; next: { id: string; name: string; time: string }; rows: PrayerRow[]; label: string; sun: { name: string; time: string } | null };
/** Une ligne du widget : cinq prières + le Shuruk (lever du soleil, qui n'est pas une prière : `sun`). */
export type PrayerRow = { id: string; name: string; time: string; next: boolean; past: boolean; sun: boolean };
/** Moments affichés, dans l'ordre de la journée. */
export const EVENTS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

/** Jour civil (AAAA-M-J) d'un instant dans un fuseau, pour ne garder que les prières d'aujourd'hui. */
const dayKey = (ms: number, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

export function prayerView(snap: PrayerSnap | null, now: number): PrayerView {
  const locale = snap?.locale ?? DEFAULT_LOCALE;
  if (!snap || !snap.on || !snap.enabled || !snap.prefs) return { kind: 'off', message: tr(locale, 'wd.prayerOff') };
  const items = buildSchedule(now, snap.prefs) as { id: string; at: number }[];
  const tz = snap.prefs.loc.tz;
  const today = dayKey(now, tz);
  const next = items.find((p) => (EVENTS as readonly string[]).includes(p.id) && p.at > now);
  if (!next) return { kind: 'off', message: tr(locale, 'wd.prayerOff') };
  const evName = (id: string) => (id === 'sunrise' ? tr(locale, 'wd.sunrise') : tr(locale, NAME_KEY(id)));
  const rows: PrayerRow[] = EVENTS.map((id) => items.find((x) => x.id === id && dayKey(x.at, tz) === today))
    .filter((x): x is { id: string; at: number } => !!x)
    .map((x) => ({ id: x.id, name: evName(x.id), time: fmtTime(x.at, tz, locale), next: x.id === next.id && x.at === next.at, past: x.at <= now, sun: x.id === 'sunrise' }));
  const place = snap.prefs.loc.mode === 'geo' ? tr(locale, 'pryMyPos') : snap.prefs.loc.name || '';
  const sunRow = rows.find((r) => r.sun);
  let date = '';
  try { date = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(now)); } catch { /* Intl indisponible : pas de date */ }
  return {
    kind: 'ready', place, date, rows, sun: sunRow ? { name: sunRow.name, time: sunRow.time } : null,
    next: { id: next.id, name: evName(next.id), time: fmtTime(next.at, tz, locale) },
    label: tr(locale, next.id === 'sunrise' ? 'wd.nextSun' : 'wd.nextPrayer'),
  };
}

// ---------- Réviser ----------
export type ReviseView = { kind: 'ok' | 'none' | 'login' | 'tier' | 'error'; number: string; label: string; titles: string[]; week: string; action: string; at: number; today: string; actionNow: string; actionGo: string };

export function reviseView(snap: ReviseSnap | null, locale: Locale): ReviseView {
  const base = { number: '', titles: [] as string[], week: '', action: tr(locale, 'wd.reviseAction'), at: snap?.at ?? 0, today: tr(locale, 'wd.reviseToday'), actionNow: tr(locale, 'wd.reviseNow'), actionGo: tr(locale, 'wd.reviseGo') };
  if (!snap || snap.state === 'login') return { ...base, kind: 'login', label: tr(locale, 'wd.reviseLogin'), action: tr(locale, 'wd.open') };
  if (snap.state === 'error') return { ...base, kind: 'error', label: tr(locale, 'wd.reviseError'), action: tr(locale, 'wd.open') };
  if (snap.state === 'tier') return { ...base, kind: 'tier', label: tr(locale, 'wd.reviseTier'), action: tr(locale, 'wd.open') };
  if (snap.total <= 0) return { ...base, kind: 'none', number: '✓', label: tr(locale, 'wd.reviseNone'), week: snap.week > 0 ? tr(locale, 'wd.reviseWeek', { n: snap.week }) : '' };
  return { ...base, kind: 'ok', number: String(snap.total), label: tr(locale, 'wd.reviseDue', { n: snap.total }), titles: snap.titles.slice(0, 2), week: snap.week > 0 ? tr(locale, 'wd.reviseWeek', { n: snap.week }) : '' };
}

/** Lit la réponse de /me/revision (ou null) : conférences à réviser, titres, échéances de la semaine. Jamais d'exception. */
export function parseRevision(raw: unknown, at: number): ReviseSnap {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { total?: unknown; items?: unknown; upcoming?: { week?: unknown } };
  const items = Array.isArray(r.items) ? (r.items as { title?: unknown }[]) : [];
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return { state: 'ok', total: n(r.total) || items.length, week: n(r.upcoming?.week), titles: items.map((i) => (typeof i?.title === 'string' ? i.title : '')).filter(Boolean).slice(0, 3), at };
}

// ---------- Citation ----------
export type CitationView = { kind: 'ok' | 'none'; text: string; textAr: string; attribution: string; title: string };

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max).replace(/\s+\S*$/, '').trimEnd()}…`);

export function citationView(c: CitationSnap, locale: Locale, size: 'small' | 'large'): CitationView {
  const title = tr(locale, 'wd.citationTitle');
  if (!c || !c.text) return { kind: 'none', text: tr(locale, 'wd.citationNone'), textAr: '', attribution: '', title };
  // Petit : un court extrait (le widget est petit) ; grand : le texte arabe (replié s'il est long) puis la traduction.
  return {
    kind: 'ok', title, attribution: c.attribution || '',
    text: clip(c.text, size === 'small' ? 130 : 220),
    textAr: size === 'large' && c.textAr ? clip(c.textAr, 140) : '',
  };
}

/** Lit la réponse de /citation/today : jamais d'exception. */
export function parseCitation(raw: unknown, day: string): CitationSnap {
  const r = raw as { text?: unknown; textAr?: unknown; attribution?: unknown } | null;
  if (!r || typeof r.text !== 'string' || !r.text.trim()) return null;
  return { text: r.text.trim(), textAr: typeof r.textAr === 'string' && r.textAr.trim() ? r.textAr.trim() : null, attribution: typeof r.attribution === 'string' ? r.attribution : '', day };
}

/** La citation gardée date-t-elle d'aujourd'hui ? (identique pour tout le monde dans la journée) */
export const citationFresh = (c: CitationSnap, today: string): boolean => !!c && c.day === today;
/** Jour civil local AAAA-MM-JJ. */
export const localDay = (now: number): string => { const d = new Date(now); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

// ---------- Liens (ouverts par un appui sur le widget) ----------
export const WIDGET_LINKS = { prayer: 'mejlisstv://prayer', revise: 'mejlisstv://learn', citation: 'mejlisstv://' } as const;
