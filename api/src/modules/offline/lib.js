// Étape 22b-6 — fonctions pures du module « Hors connexion » (testées dans tests/test_offline_lib.mjs).

/** Variantes vidéo d'une playlist maître HLS : [{ path: 'v1/index.m3u8', height: 720, bandwidth: 2800000 }], de la plus basse à la plus haute. */
export function parseMaster(text) {
  const out = [];
  const lines = String(text || '').split('\n').map((l) => l.trim());
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
    const info = lines[i];
    const next = lines.slice(i + 1).find((l) => l && !l.startsWith('#'));
    if (!next || !/^v\d+\/index\.m3u8$/.test(next.split('?')[0])) continue;
    const res = info.match(/RESOLUTION=(\d+)x(\d+)/);
    const bw = info.match(/(?:^|[,:])BANDWIDTH=(\d+)/);
    out.push({ path: next.split('?')[0], height: res ? Number(res[2]) : 0, bandwidth: bw ? Number(bw[1]) : 0 });
  }
  return out.sort((a, b) => a.height - b.height || a.bandwidth - b.bandwidth);
}

/** Variante la plus haute qui ne dépasse pas `height` ; sinon la plus basse. */
export function pickVariant(variants, height) {
  if (!variants.length) return null;
  const ok = variants.filter((v) => v.height <= height);
  return ok.length ? ok[ok.length - 1] : variants[0];
}

/** Qualités proposées : au plus 360 et 720 (ou la plus proche disponible), sans doublon. */
export function offeredHeights(variants) {
  const seen = new Set();
  const out = [];
  for (const want of [360, 720]) {
    const v = pickVariant(variants, want);
    if (v && !seen.has(v.height)) { seen.add(v.height); out.push(v); }
  }
  return out;
}

/** Taille estimée en octets : débit moyen × durée (8 bits par octet), arrondie au Mo supérieur. */
export function estimateBytes(bandwidth, seconds) {
  if (!(bandwidth > 0) || !(seconds > 0)) return 0;
  return Math.ceil((bandwidth * seconds) / 8 / 1048576) * 1048576;
}

export const AUDIO_BANDWIDTH = 64000;

/** Clé du fichier préparé dans le stockage. */
export const offlineKey = (talkId, version, kind, height) =>
  `offline/${talkId}/${version}/${kind === 'audio' ? 'audio.m4a' : `video-${Number(height)}.mp4`}`;

export const OFFLINE_KIND = ['audio', 'video'];
export const OFFLINE_HEIGHTS = [360, 720];

/** Date de fin de validité à partir de maintenant. */
export const expiresAt = (now, days) => new Date(now + Math.max(1, Number(days) || 30) * 86400000).toISOString();

/** Arguments FFmpeg : copie sans reconversion d'une playlist (fichier local aux liens signés) vers un MP4 (vidéo) ou un M4A (audio). */
export function ffmpegArgs(playlistPath, outPath, kind) {
  const head = ['-hide_banner', '-v', 'error', '-y', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto', '-allowed_extensions', 'ALL', '-i', playlistPath];
  return kind === 'audio'
    ? [...head, '-vn', '-c:a', 'copy', '-movflags', '+faststart', '-f', 'ipod', outPath]
    : [...head, '-map', '0', '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', outPath];
}
