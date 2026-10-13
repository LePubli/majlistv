// Réécriture des playlists HLS : le master pointe vers l'API, les variantes vers des liens S3 signés.
export const HLS_PATH = /^(master\.m3u8|v\d+\/index\.m3u8|audio\/index\.m3u8)$/;

// Master : les lignes d'URI (variantes) reçoivent le jeton de lecture.
export function rewriteMaster(text, token) {
  return text.split('\n').map((l) => (l && !l.startsWith('#') ? `${l.trim()}?t=${encodeURIComponent(token)}` : l)).join('\n');
}

// Variante : init et segments deviennent des liens signés (signUrl(chemin relatif) -> URL).
export async function rewriteVariant(text, signUrl) {
  const out = [];
  for (const l of text.split('\n')) {
    if (l.startsWith('#EXT-X-MAP:')) {
      const m = l.match(/URI="([^"]+)"/);
      out.push(m ? l.replace(m[0], `URI="${await signUrl(m[1])}"`) : l);
    } else if (l && !l.startsWith('#')) {
      out.push(await signUrl(l.trim()));
    } else out.push(l);
  }
  return out.join('\n');
}

// Aperçu : ne garde que les segments qui commencent avant `seconds`, puis termine la playlist.
export function truncateVariant(text, seconds) {
  const out = [];
  let elapsed = 0;
  let pendingInf = null;
  for (const l of text.split('\n')) {
    if (l.startsWith('#EXT-X-ENDLIST')) continue;
    if (l.startsWith('#EXTINF:')) { pendingInf = l; continue; }
    if (pendingInf !== null && l && !l.startsWith('#')) {
      if (elapsed >= seconds) break;
      out.push(pendingInf, l);
      elapsed += parseFloat(pendingInf.slice(8)) || 0;
      pendingInf = null;
      continue;
    }
    if (pendingInf !== null) { out.push(pendingInf); pendingInf = null; }
    out.push(l);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  out.push('#EXT-X-ENDLIST', '');
  return out.join('\n');
}
