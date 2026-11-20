// Image de présentation d'origine d'une vidéo importée (YouTube, Vimeo, archive.org…) : copiée chez nous pour rester disponible
// quand la conférence devient une vidéo hébergée (avant, seule une image tirée de la vidéo était proposée).
// YouTube : on essaie d'abord la version haute définition (maxresdefault, 1280 × 720), puis l'adresse relevée par le transcripteur.
import fs from 'node:fs/promises';
import path from 'node:path';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 6 * 1024 * 1024;
const MIN_BYTES = 6000; // YouTube renvoie parfois une image grise de 120 × 90 quand la haute définition n'existe pas

/** Adresses à essayer, de la meilleure à la moins bonne (sans doublon). */
export function posterUrls({ source, ref, thumb }) {
  const urls = [];
  if (source === 'youtube' && ref) urls.push(`https://i.ytimg.com/vi/${encodeURIComponent(ref)}/maxresdefault.jpg`);
  if (thumb && /^https?:\/\//i.test(thumb)) urls.push(thumb);
  if (source === 'youtube' && ref) urls.push(`https://i.ytimg.com/vi/${encodeURIComponent(ref)}/hqdefault.jpg`);
  return [...new Set(urls)];
}

/** Télécharge la première image valable dans `dir` (original.<ext>) ; renvoie le nom du fichier, ou null si aucune. */
export async function fetchOriginalPoster({ source, ref, thumb }, dir, { fetchImpl = fetch, timeoutMs = 15000, log = () => {} } = {}) {
  for (const url of posterUrls({ source, ref, thumb })) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
      if (!res.ok) continue;
      const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const ext = TYPES[type];
      if (!ext) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < MIN_BYTES || buf.length > MAX_BYTES) continue;
      const name = `original.${ext}`;
      await fs.writeFile(path.join(dir, name), buf);
      return name;
    } catch (err) { log(`image d'origine (${url}) : ${err.message}`); }
  }
  return null;
}
