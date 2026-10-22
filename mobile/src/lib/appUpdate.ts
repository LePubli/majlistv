// Mise à jour de l'application (22b-5) : logique pure, sans dépendance native (testée avec Node, voir tests/appUpdate.test.ts).
// Le serveur répond à GET /app/latest?platform=android&versionCode=N ; l'écran (components/AppUpdate.tsx) fait le téléchargement et l'installation.

export type ReleaseNotes = { fr?: string; en?: string; ar?: string };
export type LatestRelease = { version: string; versionCode: number; size: number; sha256: string; notes: ReleaseNotes; publishedAt?: string; downloadUrl: string };
export type LatestResponse = { latest: LatestRelease | null; updateAvailable: boolean; required: boolean };

/** Fréquence maximale des vérifications automatiques (au démarrage et au retour dans l'application). */
export const CHECK_EVERY_MS = 6 * 3600 * 1000;

/** Le serveur est-il fiable pour cette réponse ? On ne suit que des adresses https de notre serveur. */
export function isTrustedDownload(url: string, apiUrl: string): boolean {
  try {
    const u = new URL(url);
    const a = new URL(apiUrl);
    return u.protocol === 'https:' ? u.host === a.host : (a.protocol === 'http:' && u.host === a.host); // http seulement pour un serveur de test en http
  } catch { return false; }
}

/** Valide la réponse du serveur (forme et valeurs) : sinon null, jamais d'exception. */
export function parseLatest(raw: unknown, apiUrl: string): LatestResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const l = r.latest as Record<string, unknown> | null | undefined;
  if (l == null) return { latest: null, updateAvailable: false, required: false };
  if (typeof l !== 'object') return null;
  const code = Number(l.versionCode); const size = Number(l.size);
  if (!Number.isInteger(code) || code < 1 || !Number.isFinite(size) || size < 1) return null;
  if (typeof l.version !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z._+-]{0,39}$/.test(l.version)) return null;
  if (typeof l.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(l.sha256)) return null;
  if (typeof l.downloadUrl !== 'string' || !isTrustedDownload(l.downloadUrl, apiUrl)) return null;
  const n = (l.notes && typeof l.notes === 'object' ? l.notes : {}) as Record<string, unknown>;
  const notes: ReleaseNotes = {};
  for (const k of ['fr', 'en', 'ar'] as const) if (typeof n[k] === 'string') notes[k] = (n[k] as string).slice(0, 1500);
  return {
    latest: { version: l.version, versionCode: code, size, sha256: l.sha256, notes, publishedAt: typeof l.publishedAt === 'string' ? l.publishedAt : undefined, downloadUrl: l.downloadUrl },
    updateAvailable: r.updateAvailable === true,
    required: r.required === true,
  };
}

/** Nouveautés dans la langue de la personne, sinon en français, sinon dans une autre langue disponible. */
export function notesFor(notes: ReleaseNotes, locale: 'fr' | 'en' | 'ar'): string {
  return (notes[locale] || notes.fr || notes.en || notes.ar || '').trim();
}

/** Taille lisible : 48,3 Mo. */
export function formatSize(bytes: number, locale: string = 'fr'): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  const n = mb >= 100 ? Math.round(mb).toString() : mb.toFixed(1);
  return `${locale === 'fr' ? n.replace('.', ',') : n} ${locale === 'fr' ? 'Mo' : locale === 'ar' ? 'م.ب' : 'MB'}`;
}

/** Faut-il interroger le serveur maintenant ? (au plus toutes les 6 h, sauf si une mise à jour est déjà connue) */
export function shouldCheck(lastCheckAt: number | null, now: number, force = false): boolean {
  if (force || lastCheckAt == null) return true;
  return now - lastCheckAt >= CHECK_EVERY_MS || now < lastCheckAt;
}

/** Le rappel (bandeau) est-il masqué ? Une version écartée ne revient pas, sauf si la mise à jour est obligatoire. */
export function bannerHidden(dismissedCode: number | null, latest: LatestRelease | null, required: boolean): boolean {
  if (!latest) return true;
  if (required) return false;
  return dismissedCode != null && dismissedCode >= latest.versionCode;
}

/** Numéro de build installé (versionCode Android), 0 si inconnu (développement, web). */
export function installedCode(nativeBuildVersion: string | null | undefined): number {
  const n = Number(nativeBuildVersion);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Progression 0..1 du téléchargement (taille totale inconnue : on se base sur la taille annoncée par le serveur). */
export function progressRatio(written: number, total: number, announced: number): number {
  const t = total > 0 ? total : announced;
  if (!(t > 0) || !(written >= 0)) return 0;
  return Math.min(1, written / t);
}

export type StepKind = 'idle' | 'downloading' | 'verifying' | 'ready' | 'error';
export type ErrorKind = 'network' | 'integrity' | 'install' | 'unsupported';

/** Résultat d'une vérification manuelle (écran Compte) : la cause d'un échec est affichée, jamais avalée. */
export type UpdateCheckResult =
  | { kind: 'current' }
  | { kind: 'available'; version: string }
  | { kind: 'error'; detail: string }
  | { kind: 'unsupported' };

/** Cause lisible d'un échec de vérification : code HTTP du serveur, réponse invalide ou réseau. */
export function checkErrorDetail(e: unknown): string {
  const x = e as { status?: number; message?: string } | null;
  if (x && typeof x.status === 'number' && x.status > 0) return `serveur HTTP ${x.status}${x.message ? ` — ${String(x.message).slice(0, 120)}` : ''}`;
  return `réseau : ${String(x?.message ?? e).slice(0, 120)}`;
}
