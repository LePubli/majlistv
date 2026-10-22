// Hors connexion (22b-6) : logique pure, sans dépendance native (testée avec Node, voir tests/downloads.test.ts).
// Un téléchargement = un fichier (MP4 vidéo ou M4A audio) préparé par le serveur, gardé dans le stockage privé de l'application,
// lisible jusqu'à la date de fin de sa licence signée (voir license.ts) que le serveur renouvelle à la reconnexion si l'abonnement est actif.
// Le serveur ne garde pas le fichier : il vit sur le téléphone de l'abonné (pack hors connexion à côté : résumé, chapitres, transcription, quiz).

export type DlKind = 'audio' | 'video';

export type DownloadRecord = {
  talkId: string; userId: string; title: string; speaker: string; durationSeconds: number;
  kind: DlKind; height: number; size: number; sha256: string;
  /** Nom du fichier dans le dossier « offline » de l'application. */
  file: string; poster: string | null;
  downloadedAt: number;
  /** Fin de validité (copie de la date signée dans la licence, pour l'affichage ; la licence fait foi). */
  expiresAt: number;
  /** Licence signée par le serveur (lie compte, fichier et date de fin). */
  licence: string;
  /** Pack hors connexion : nom du fichier et date de la dernière mise à jour (0 = pas encore reçu). */
  pack: string | null; packAt: number;
  /** Dernière position regardée hors connexion (ms) et envoyée ou non au serveur. */
  positionMs: number; synced: boolean; version: string;
};

export type RenewItem = { talkId: string; ok: boolean; expiresAt?: string; reason?: string; kind?: DlKind; height?: number; licence?: string; publicKey?: string };

export const RENEW_EVERY_MS = 12 * 3600 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);
const SAFE_FILE = /^[0-9a-f-]{36}-(audio\.m4a|video-\d{3,4}\.mp4)$/i;
export const isSafeFile = (s: unknown): s is string => typeof s === 'string' && SAFE_FILE.test(s);
const SAFE_PACK = /^pack-[0-9a-f-]{36}\.json$/i;
export const isSafePack = (s: unknown): s is string => typeof s === 'string' && SAFE_PACK.test(s);
export const packNameFor = (talkId: string) => `pack-${talkId}.json`;
export const QUEUE_FILE = 'quiz-queue.json';
export const PACK_REFRESH_MS = 24 * 3600 * 1000;

export const fileNameFor = (talkId: string, kind: DlKind, height: number) =>
  `${talkId}-${kind === 'audio' ? 'audio.m4a' : `video-${Math.round(height)}.mp4`}`;

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Lit l'index enregistré : lignes invalides ignorées (jamais d'exception), une seule ligne par conférence (la plus récente). */
export function parseIndex(raw: string | null | undefined): DownloadRecord[] {
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : []; } catch { return []; }
  if (!Array.isArray(data)) return [];
  const byTalk = new Map<string, DownloadRecord>();
  for (const x of data) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    if (!isUuid(r.talkId) || !isSafeFile(r.file) || (r.kind !== 'audio' && r.kind !== 'video')) continue;
    const rec: DownloadRecord = {
      talkId: r.talkId, userId: str(r.userId, 64), title: str(r.title), speaker: str(r.speaker), durationSeconds: Math.max(0, num(r.durationSeconds)),
      kind: r.kind, height: Math.max(0, num(r.height)), size: Math.max(0, num(r.size)), sha256: str(r.sha256, 64),
      file: r.file, poster: isSafeFile(r.poster) || (typeof r.poster === 'string' && /^[0-9a-f-]{36}\.jpg$/i.test(r.poster)) ? (r.poster as string) : null,
      downloadedAt: num(r.downloadedAt), expiresAt: num(r.expiresAt), licence: str(r.licence, 2000),
      pack: isSafePack(r.pack) ? r.pack : null, packAt: num(r.packAt), positionMs: Math.max(0, num(r.positionMs)), synced: r.synced !== false, version: str(r.version, 40) || '0',
    };
    const prev = byTalk.get(rec.talkId);
    if (!prev || rec.downloadedAt >= prev.downloadedAt) byTalk.set(rec.talkId, rec);
  }
  return [...byTalk.values()].sort((a, b) => b.downloadedAt - a.downloadedAt);
}

export const daysLeftUntil = (expiresAt: number, now: number) => Math.max(0, Math.ceil((expiresAt - now) / 86400000));
/** Le pack doit-il être (re)téléchargé ? absent, ou plus récent que 24 h seulement s'il date. */
export const packStale = (r: Pick<DownloadRecord, 'pack' | 'packAt'>, now: number) => !r.pack || now - r.packAt >= PACK_REFRESH_MS || now < r.packAt;
export const totalBytes = (rs: DownloadRecord[]) => rs.reduce((n, r) => n + r.size, 0);

/** Ajoute ou remplace (une conférence = un téléchargement). */
export const upsert = (rs: DownloadRecord[], rec: DownloadRecord) => [rec, ...rs.filter((r) => r.talkId !== rec.talkId)];

/**
 * Applique la réponse du serveur au renouvellement.
 * ok → nouvelle date de fin ; refus « subscription » (abonnement terminé) ou « gone » (conférence retirée) → téléchargement supprimé ;
 * autre refus (vidéo en cours de remplacement…) → on garde jusqu'à la date de fin actuelle.
 */
export function applyRenewal(rs: DownloadRecord[], items: RenewItem[], now: number): { records: DownloadRecord[]; removed: DownloadRecord[] } {
  const by = new Map(items.map((i) => [i.talkId, i]));
  const removed: DownloadRecord[] = [];
  const records: DownloadRecord[] = [];
  for (const r of rs) {
    const it = by.get(r.talkId);
    if (!it) { records.push(r); continue; }
    if (it.ok) {
      const t = it.expiresAt ? Date.parse(it.expiresAt) : NaN;
      // Nouvelle licence uniquement si elle concerne bien ce fichier (même type de fichier) ; sans licence (ancien serveur), la licence actuelle reste.
      const lic = it.licence && (!it.kind || it.kind === r.kind) ? it.licence : r.licence;
      records.push(Number.isFinite(t) && t > now ? { ...r, expiresAt: t, licence: lic } : r);
    } else if (it.reason === 'subscription' || it.reason === 'gone') removed.push(r);
    else records.push(r);
  }
  return { records, removed };
}

/** Faut-il renouveler maintenant ? (au plus toutes les 12 h, sauf demande explicite) */
export function shouldRenew(last: number | null, now: number, force = false): boolean {
  return force || last == null || now - last >= RENEW_EVERY_MS || now < last;
}

/** Position de reprise : ignore moins de 5 s et les 10 dernières secondes. */
export function resumeFor(r: Pick<DownloadRecord, 'positionMs' | 'durationSeconds'>): number {
  const p = r.positionMs;
  if (p < 5000) return 0;
  const d = r.durationSeconds * 1000;
  return d && p > d - 10000 ? 0 : p;
}

/** Attente avant de redemander au serveur si le fichier est prêt : 1,5 s, puis de plus en plus, jusqu'à 5 s. */
export const pollDelay = (attempt: number) => Math.min(5000, 1500 + attempt * 500);
export const MAX_POLL_MS = 25 * 60 * 1000;

export type PrepareResult =
  | { kind: 'preparing' }
  | { kind: 'ready'; url: string; size: number; sha256: string; expiresAt: number; version: string; height: number; licence: string; publicKey: string; serverTime: number }
  | { kind: 'failed'; error: string };

/** Réponse de POST /me/offline/:id, validée. */
export function parsePrepare(body: unknown): PrepareResult | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.status === 'preparing') return { kind: 'preparing' };
  if (b.status === 'failed') return { kind: 'failed', error: str(b.error) || '' };
  if (b.status !== 'ready') return null;
  const size = num(b.size); const exp = typeof b.expiresAt === 'string' ? Date.parse(b.expiresAt) : NaN;
  if (typeof b.url !== 'string' || !/^https?:\/\//.test(b.url) || size < 1 || typeof b.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(b.sha256) || !Number.isFinite(exp)) return null;
  const licence = str(b.licence, 2000); const publicKey = str(b.publicKey, 100);
  if (!licence || !publicKey) return null;
  const st = typeof b.serverTime === 'string' ? Date.parse(b.serverTime) : NaN;
  return { kind: 'ready', url: b.url, size, sha256: b.sha256, expiresAt: exp, version: str(b.version, 40) || '0', height: num(b.height), licence, publicKey, serverTime: Number.isFinite(st) ? st : 0 };
}

export type DlErrorCode = 'network' | 'integrity' | 'subscription' | 'external' | 'not_ready' | 'no_audio' | 'space' | 'generic';

/** Code d'erreur affichable d'après la réponse du serveur (champ « reason » ou statut HTTP). */
export function errorCodeFor(status: number, reason?: string): DlErrorCode {
  if (reason === 'subscription' || status === 403) return 'subscription';
  if (reason === 'external') return 'external';
  if (reason === 'not_ready') return 'not_ready';
  if (reason === 'no_audio') return 'no_audio';
  return 'generic';
}
