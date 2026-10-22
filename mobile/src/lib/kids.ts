// 22b-9a : Mejliss Kids natif. Logique pure (aucune bibliothèque native) : testable avec Node.
import type { KidCard, KidProfile, KidRubric, KidShelf, KidTime } from './types';

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
