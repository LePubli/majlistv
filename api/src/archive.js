// Internet Archive (archive.org) : lecture des métadonnées d'un élément et choix du fichier vidéo à lire.
// Les fichiers sont servis directement par archive.org et lus avec le lecteur Mejliss TV (aucun lecteur ni publicité d'archive.org).
// ARCHIVE_BASE_URL permet de pointer vers un faux serveur pendant les tests.
const BASE = () => (process.env.ARCHIVE_BASE_URL || 'https://archive.org').replace(/\/$/, '');
const ID_RE = /^[A-Za-z0-9][\w.-]{0,99}$/;

export class ArchiveError extends Error {}

// Extrait l'identifiant (et le fichier éventuel) d'une adresse archive.org.
export function parseArchiveUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/^(www\.)?archive\.org$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/(?:details|embed|download)\/([^/]+)(?:\/(.+))?$/);
  if (!m || !ID_RE.test(m[1])) return null;
  const file = m[2] ? decodeURIComponent(m[2]).replace(/\/$/, '') : null;
  return { source: 'archive', ref: m[1], file: file || null };
}

// « 01:02:03 », « 62:03 » ou « 3723.5 » -> secondes.
export function parseLength(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v);
  if (s.includes(':')) {
    const p = s.split(':').map(Number);
    if (p.some(Number.isNaN)) return null;
    return Math.round(p.reduce((acc, x) => acc * 60 + x, 0));
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const VIDEO_EXT = /\.(mp4|m4v|webm|ogv)$/i;
// Préférence : MP4 H.264 dérivé par archive.org (léger, lisible partout), puis autres MP4, puis WebM / Ogg.
function score(f) {
  const name = f.name || '';
  const fmt = String(f.format || '').toLowerCase();
  if (!VIDEO_EXT.test(name)) return -1;
  let s = 0;
  if (/\.(mp4|m4v)$/i.test(name)) s += 100;
  if (fmt.startsWith('h.264')) s += 50;
  else if (fmt.includes('mpeg4') && !fmt.startsWith('512kb')) s += 30;
  else if (fmt.startsWith('512kb')) s += 10;
  const h = Number(f.height) || 0;
  if (h && h <= 1080) s += h / 100; // la meilleure définition jusqu'à 1080p
  return s;
}

export function pickVideoFile(files, wanted) {
  const list = (files || []).filter((f) => f && f.name);
  if (wanted) {
    const f = list.find((x) => x.name === wanted);
    if (f && score(f) >= 0) return f;
  }
  const ok = list.filter((f) => score(f) >= 0).sort((a, b) => score(b) - score(a));
  return ok[0] || null;
}

const stripHtml = (s) => String(Array.isArray(s) ? s.join('\n') : s || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/?p[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/(https?:\/\/)?(www\.)?(archive\.org|youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|dai\.ly)\/\S*/gi, '') // aucun lien vers la plateforme d'origine
  .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

// Lit l'élément archive.org et renvoie { title, description, duration, thumb, file }.
export async function resolveArchive(identifier, wantedFile = null) {
  if (!ID_RE.test(identifier)) throw new ArchiveError('Identifiant archive.org invalide');
  let res;
  try {
    res = await fetch(`${BASE()}/metadata/${encodeURIComponent(identifier)}`, { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ArchiveError("archive.org ne répond pas, réessayez dans un instant");
  }
  if (!res.ok) throw new ArchiveError(`archive.org a répondu ${res.status}`);
  const data = await res.json().catch(() => ({}));
  if (!data || !data.metadata) throw new ArchiveError('Élément introuvable sur archive.org');
  const md = data.metadata;
  if (md.mediatype === 'collection') throw new ArchiveError("C'est une collection : utilisez « Importer une playlist ou une chaîne »");
  if (String(md['access-restricted-item']) === 'true' || data.is_dark) throw new ArchiveError('Vidéo en accès restreint sur archive.org (prêt uniquement) : impossible de la lire');
  const f = pickVideoFile(data.files, wantedFile);
  if (!f) throw new ArchiveError('Aucun fichier vidéo lisible dans cet élément archive.org');
  return {
    title: stripHtml(md.title).slice(0, 200),
    description: stripHtml(md.description).slice(0, 5000),
    duration: parseLength(f.length) ?? parseLength(md.runtime),
    thumb: `${BASE()}/services/img/${encodeURIComponent(identifier)}`,
    file: f.name,
  };
}

// Adresse du fichier vidéo (archive.org redirige vers le serveur qui le stocke ; lecture par plages, sans téléchargement complet).
export function archiveFileUrl(identifier, file) {
  return `${BASE()}/download/${encodeURIComponent(identifier)}/${file.split('/').map(encodeURIComponent).join('/')}`;
}
