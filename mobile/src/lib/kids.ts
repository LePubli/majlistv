// 22b-9a : Mejliss Kids natif. Logique pure (aucune bibliothèque native) : testable avec Node.
import type { KidAction, KidActionCounts, KidCard, KidCatalogTalk, KidReportProfile, KidProfile, KidQuizQuestion, KidRubric, KidShelf, KidShort, KidTime } from './types';

export const AVATARS = ['lion', 'owl', 'fox', 'turtle', 'rabbit', 'bear', 'camel', 'star'] as const;
export const AVATAR_EMOJI: Record<string, string> = { lion: '🦁', owl: '🦉', fox: '🦊', turtle: '🐢', rabbit: '🐰', bear: '🐻', camel: '🐪', star: '⭐' };
export const avatarEmoji = (a: string) => AVATAR_EMOJI[a] ?? '⭐';
export const BANDS = ['3-6', '7-10', '11-14'] as const;
export const bandKey = (b: string) => (b === '3-6' ? 'kdBand36' : b === '7-10' ? 'kdBand710' : 'kdBand1114') as 'kdBand36' | 'kdBand710' | 'kdBand1114';

/** Couleurs de l'espace enfant : bleu nuit et or vif (mêmes valeurs que le site ; ne pas modifier). */
export const KC = {
  bg: '#0A1038', bgTop: '#101A56', bgBottom: '#070B27', surface: '#16215F', surface2: '#1D2A78', line: '#34459F', lineSoft: '#2A3A8C',
  accent: '#FFC83D', accentHover: '#FFD76E', onAccent: '#1B1300', text: '#F6F7FF', text2: '#D6DAFF', muted: '#AEB6EE', danger: '#FF8A80', ok: '#7BE0A0',
} as const;

// ---- Code parental ----
export const PIN_RE = /^\d{4,6}$/;
export const validPin = (s: string) => PIN_RE.test(s);

/** Message affiché après un code refusé (la réponse du serveur donne le nombre d'essais restants, ou le blocage). */
export function exitMessage(err: { status?: number; code?: string; data?: Record<string, unknown>; message?: string } | null, t: (k: any, v?: Record<string, string | number>) => string): string {
  if (!err) return '';
  if (err.code === 'locked') { const m = /(\d+)\s*min/.exec(err.message ?? ''); return t('kdExitLocked', { n: m ? Number(m[1]) : 10 }); }
  if (err.code === 'bad_pin') return t('kdExitBad', { n: typeof err.data?.left === 'number' ? err.data.left : 0 });
  if (err.status === 0) return t('errGeneric');
  return err.message || t('errGeneric');
}

// ---- Session enfant (gardée dans le coffre sécurisé : l'application reste en mode enfant après un redémarrage) ----
export type KidSessionData = { token: string; profile: KidProfile; issuedAt: number };
/** Le jeton enfant dure 12 h côté serveur ; on le renouvelle (avec la session du parent) bien avant. */
export const KID_TOKEN_TTL_MS = 12 * 3600_000;
export const KID_RENEW_AFTER_MS = 9 * 3600_000;
export const needsRenew = (s: KidSessionData, now = Date.now()) => now - s.issuedAt >= KID_RENEW_AFTER_MS;

export function parseKidSession(raw: string | null): KidSessionData | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v.token !== 'string' || !v.token || !v.profile || typeof v.profile.id !== 'string' || typeof v.profile.name !== 'string') return null;
    return {
      token: v.token,
      profile: { id: v.profile.id, name: v.profile.name, avatar: String(v.profile.avatar ?? 'star'), band: String(v.profile.band ?? '3-6') },
      issuedAt: Number.isFinite(v.issuedAt) ? v.issuedAt : 0,
    };
  } catch { return null; }
}
export const serializeKidSession = (s: KidSessionData) => JSON.stringify(s);

// ---- Temps ----
/** Minutes restantes aujourd'hui (arrondi au-dessus) ; null = pas de limite. */
export function leftMin(time: KidTime | null | undefined): number | null {
  if (!time || time.leftSec == null) return null;
  return Math.ceil(time.leftSec / 60);
}
export const PING_EVERY_MS = 30_000;
export const PROGRESS_EVERY_MS = 10_000;

// ---- Catalogue ----
export const rubricName = (r: Pick<KidRubric, 'names' | 'slug'>, locale: string) => r.names?.[locale] || r.names?.fr || r.slug;

type T = (k: any, v?: Record<string, string | number>) => string;
export function shelfTitle(s: KidShelf, ctx: { t: T; rubrics: KidRubric[]; locale: string }): string {
  const { t, rubrics, locale } = ctx;
  if (s.kind === 'resume') return t('kdContinue');
  if (s.kind === 'because') return t('kcBecause', { title: s.basedOn?.title ?? '' });
  if (s.kind === 'age') return t('kcAge');
  if (s.kind === 'new') return t('kcNew');
  if (s.kind === 'popular') return t('kcPopular');
  const r = rubrics.find((x) => x.id === s.rubricId);
  return r ? `${r.emoji} ${rubricName(r, locale)}` : '';
}

/** Option « seulement pour mon âge » : la plus jeune tranche de la vidéo est celle de l'enfant. */
export const ageFilter = (list: KidCard[], mine: boolean, band: string) => (mine ? list.filter((x) => x.kidsBands?.[0] === band) : list);

/** Rangées prêtes à afficher : identifiants remplacés par les vidéos, rangées vides retirées. */
export function resolveShelves(shelves: KidShelf[], talks: KidCard[], mine: boolean, band: string) {
  const byId = new Map(talks.map((x) => [x.id, x]));
  return shelves
    .map((s) => ({ shelf: s, items: ageFilter(s.ids.map((i) => byId.get(i)).filter((x): x is KidCard => !!x), mine, band) }))
    .filter((r) => r.items.length > 0);
}

/** Texte cherché : au moins 2 lettres (sinon pas de recherche). */
export const searchTerm = (q: string): string | null => { const s = q.trim(); return s.length >= 2 ? s.slice(0, 80) : null; };

/** Corps envoyé pour la reprise : rien avant 5 s de lecture (comme sur le site). */
export function progressBody(positionSec: number, durationSec: number): { positionMs: number; durationMs: number } | null {
  const pos = Math.round((Number.isFinite(positionSec) ? positionSec : 0) * 1000);
  if (pos < 5000) return null;
  return { positionMs: pos, durationMs: Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec * 1000) : 0 };
}

/** Une réponse d'erreur « session enfant expirée » ou « refus du mode enfant ». */
export const isKidExpired = (err: { status?: number; code?: string } | null) => !!err && (err.code === 'kid_expired' || err.status === 401);
export const isTimeUp = (err: { code?: string } | null) => !!err && err.code === 'kid_time_up';

// ---------------------------------------------------------------- 22b-9b : quiz, étoiles, badges, petites actions, courts

export const BADGE_ICON: Record<string, string> = { first_quiz: '🎯', three_stars: '🌟', quizzes_5: '🏅', explorer: '🧭', watcher_3: '📺', retry_better: '🚀', stars_10: '✨' };
export const BADGE_CODES = Object.keys(BADGE_ICON);
export const badgeIcon = (code: string) => BADGE_ICON[code] ?? '🏅';
export const QUIZ_OPTIONS_MAX = 4;

/** Réponses à envoyer au serveur ; null tant qu'une question n'a pas de réponse (jamais d'envoi incomplet). */
export function quizAnswers(questions: KidQuizQuestion[], picks: (number | undefined)[]): { questionId: string; index: number }[] | null {
  if (!questions.length) return null;
  const out: { questionId: string; index: number }[] = [];
  for (let i = 0; i < questions.length; i += 1) {
    const p = picks[i];
    if (p == null || !Number.isInteger(p) || p < 0 || p >= Math.min(QUIZ_OPTIONS_MAX, questions[i].options.length)) return null;
    out.push({ questionId: questions[i].id, index: p });
  }
  return out;
}
/** Message de fin de quiz : jamais « raté », toujours au moins une étoile. */
export const starsMessageKey = (stars: number) => (stars >= 3 ? 'kdStars3' : stars === 2 ? 'kdStars2' : 'kdStars1');
export const clampStars = (n: number | null | undefined) => Math.max(0, Math.min(3, Math.round(Number(n) || 0)));

/** Actions encore à traiter (la liste de l'accueil et de la fin de quiz masque les validées). */
export const openActions = (list: KidAction[], limit = 100) => list.filter((a) => a.status !== 'validated').slice(0, limit);
export const actionsOpenCount = (c?: KidActionCounts | null) => (c ? c.todo + c.claimed : 0);
export const actionStateKey = (s: KidAction['status']) => (s === 'validated' ? 'kaStValidated' : s === 'claimed' ? 'kaStClaimed' : 'kaStTodo');

/** Courts : seulement ceux qu'on peut lire (adresse présente), jamais plus de `max`. */
export const playableShorts = (list: unknown, max = 20): KidShort[] =>
  (Array.isArray(list) ? (list as KidShort[]) : []).filter((s) => s && typeof s.id === 'string' && !!s.videoUrl).slice(0, max);
/** Dans une file de courts, l'indice voisin (boucle sans fin désactivée : on s'arrête aux bords). */
export const neighbourShort = (i: number, n: number, dir: 1 | -1) => Math.min(n - 1, Math.max(0, i + dir));
/** Date « 2026-10-22 » en lecture locale (révision espacée). */
export const reviewDate = (d: string, locale: string) => { const x = new Date(`${d}T12:00:00`); return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }); };

/** Vidéos « à revoir » du résumé → cartes de vidéo (les champs absents prennent des valeurs neutres). */
export const dueCards = (due: { id: string; title: string; speaker: string | null; source: string; durationSeconds: number | null; posterUrl: string | null }[]): KidCard[] =>
  due.map((d) => ({ id: d.id, title: d.title, speaker: d.speaker, access: 'free', source: d.source, kidsBands: [], durationSeconds: d.durationSeconds, completed: false, positionMs: 0, rubricIds: [], stars: null, posterUrl: d.posterUrl }));

// ---------------------------------------------------------------- 22b-9c : espace parent

/** Durées proposées (minutes) ; null = pas de limite. Le serveur accepte de 5 à 480. */
export const LIMIT_CHOICES: (number | null)[] = [null, 15, 30, 45, 60, 90, 120, 180];
export const limitLabel = (m: number | null, t: (k: string, v?: Record<string, string | number>) => string) => (m == null ? t('kcNoLimit') : t('kcMin', { n: m }));
/** « 1 h 05 » à partir de 60 min, sinon « 25 min ». */
export const fmtMinutes = (m: number, t: (k: string, v?: Record<string, string | number>) => string) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : t('kcMin', { n: m }));
/** Hauteur (0 à 100) de chaque barre du graphique « minutes par jour » ; la plus haute journée = 100. */
export const usageBars = (usage: { day: string; seconds: number }[]): { day: string; pct: number; min: number }[] => {
  const peak = Math.max(1, ...usage.map((u) => u.seconds));
  return usage.map((u) => ({ day: u.day, pct: Math.round((100 * u.seconds) / peak), min: Math.round(u.seconds / 60) }));
};
/** Lettre du jour (« L », « M »…) d'une date « 2026-10-22 », selon la langue. */
export const dayLetter = (iso: string, locale: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'narrow', timeZone: 'UTC' }).format(d);
};
export const reportDays = [7, 30] as const;

/** Changement de code parental : renvoie la clé du message d'erreur, ou null si tout est bon. */
export function pinChangeError(current: string, next: string, confirm: string, hasCurrent = true): 'kdPinBad' | 'kids.pinMismatch' | null {
  if (hasCurrent && !validPin(current)) return 'kdPinBad';
  if (!validPin(next)) return 'kdPinBad';
  if (next !== confirm) return 'kids.pinMismatch';
  return null;
}
/** Corps de la requête de modification d'un profil : seulement ce qui change (le serveur refuse un corps vide). */
export function profilePatch(cur: { name: string; avatar: string; band: string }, next: { name: string; avatar: string; band: string }): Partial<{ name: string; avatar: string; band: string }> | null {
  const out: Partial<{ name: string; avatar: string; band: string }> = {};
  const name = next.name.trim();
  if (!name || name.length > 30) return null;
  if (name !== cur.name) out.name = name;
  if (next.avatar !== cur.avatar) out.avatar = next.avatar;
  if (next.band !== cur.band) out.band = next.band;
  return Object.keys(out).length ? out : null;
}
/** Catalogue : nombre de vidéos autorisées / total. */
export const allowedCount = (talks: KidCatalogTalk[]) => talks.filter((x) => x.allowed).length;
/** Change l'état « autorisé » de certaines vidéos (affichage immédiat, avant la réponse du serveur). */
export const withAllowed = (talks: KidCatalogTalk[], ids: string[], allowed: boolean): KidCatalogTalk[] => talks.map((x) => (ids.includes(x.id) ? { ...x, allowed } : x));
export const catalogIds = (talks: KidCatalogTalk[], max = 200) => talks.slice(0, max).map((x) => x.id);
/** Un enfant du rapport a-t-il quelque chose à montrer ? (sinon : « pas d'activité ») */
export const hasActivity = (p: KidReportProfile) => p.active;
