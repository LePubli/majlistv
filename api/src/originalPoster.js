// Image de présentation d'origine d'une vidéo importée (YouTube, Vimeo, archive.org) — pour les vidéos DÉJÀ copiées chez nous
// (le worker la récupère à la conversion des nouveaux imports, voir worker/src/originalPoster.js).
// Seuls les serveurs d'images des plateformes sont contactés (liste fermée) : aucune adresse libre n'est suivie.
const HOST_OK = /(^|\.)(ytimg\.com|youtube\.com|vimeocdn\.com|archive\.org|dmcdn\.net)$/i;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIN_BYTES = 6000; // YouTube renvoie une image grise minuscule quand la haute définition n'existe pas
const MAX_BYTES = 4 * 1024 * 1024;

export const youtubeId = (url) => String(url || '').match(/(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live)\/)([A-Za-z0-9_-]{11})/)?.[1] || null;
export const archiveId = (url) => String(url || '').match(/archive\.org\/(?:details|download)\/([^/?#]+)/)?.[1] || null;

/** Adresses d'image à essayer, de la meilleure à la moins bonne. `vimeoThumb` : miniature donnée par l'oEmbed de Vimeo (facultative). */
export function posterUrls({ url, origin, thumb, vimeoThumb }) {
  const out = [];
  if (origin === 'youtube') {
    const id = youtubeId(url);
    if (id) out.push(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`);
  }
  if (vimeoThumb) out.push(String(vimeoThumb).replace(/_\d+x\d+(\.\w+)?$/, '_1280$1'), vimeoThumb); // Vimeo sert la taille demandée dans le nom du fichier
  if (thumb) out.push(thumb);
  if (origin === 'youtube') { const id = youtubeId(url); if (id) out.push(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`); }
  if (origin === 'archive') { const id = archiveId(url); if (id) out.push(`https://archive.org/services/img/${id}`); }
  return [...new Set(out.filter((u) => { try { const x = new URL(u); return x.protocol === 'https:' && HOST_OK.test(x.hostname); } catch { return false; } }))];
}

/** Première image valable : { buf, type, ext } ou null. */
export async function fetchPoster(urls, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  for (const u of urls) {
    try {
      const res = await fetchImpl(u, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
      if (!res.ok) continue;
      if (res.url && !HOST_OK.test(new URL(res.url).hostname)) continue; // redirection vers un autre serveur : refusée
      const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!TYPES[type]) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length >= MIN_BYTES && buf.length <= MAX_BYTES) return { buf, type, ext: TYPES[type] };
    } catch { /* adresse suivante */ }
  }
  return null;
}
