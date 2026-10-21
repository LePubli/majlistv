// Conversion FFmpeg : fichier source -> HLS (fMP4) multi-qualités + miniature.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// Qualités possibles (hauteur, débit vidéo maximal, débit audio). Seules celles <= à la source sont produites.
// Le débit vidéo de chaque qualité est en plus plafonné par celui de la source (voir videoKbpsFor) : on ne grossit jamais le fichier.
export const RENDITIONS = [
  { h: 360, v: 800, a: 96, profile: 'main' },
  { h: 720, v: 2800, a: 128, profile: 'high' },
  { h: 1080, v: 5000, a: 128, profile: 'high' },
];

function run(cmd, args, { onLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let buf = '';
    child.stdout.on('data', (d) => {
      out += onLine ? '' : d;
      if (onLine) {
        buf += d;
        const lines = buf.split('\n');
        buf = lines.pop();
        lines.forEach(onLine);
      }
    });
    child.stderr.on('data', (d) => { err = (err + d).slice(-3000); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} a échoué (code ${code}) : ${err.trim()}`))));
    run.current = child;
  });
}
export const killCurrent = () => run.current?.kill('SIGKILL');

// Durée, hauteur et présence d'audio du fichier source.
export async function probe(file) {
  const json = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
  const video = json.streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  if (!video) throw new Error('Aucune piste vidéo dans le fichier');
  const duration = Number(json.format.duration || video.duration || 0);
  if (!duration) throw new Error('Durée de la vidéo illisible');
  const hasAudio = json.streams.some((s) => s.codec_type === 'audio');
  return { duration, height: video.height, hasAudio, videoKbps: sourceVideoKbps(json, video, duration) };
}

// Débit vidéo de la source en kbit/s (0 = inconnu). Ordre : débit de la piste vidéo ; sinon débit total (ou taille / durée) moins l'audio.
export function sourceVideoKbps(json, video, duration) {
  const v = Number(video?.bit_rate || video?.tags?.BPS || 0);
  if (v > 0) return Math.round(v / 1000);
  const audio = (json.streams || []).filter((s) => s.codec_type === 'audio').reduce((t, s) => t + Number(s.bit_rate || s.tags?.BPS || 128000), 0);
  let total = Number(json.format?.bit_rate || 0);
  if (!total && json.format?.size && duration) total = (Number(json.format.size) * 8) / duration;
  return total > audio ? Math.round((total - audio) / 1000) : 0;
}

// Débit vidéo d'une qualité : jamais plus que son maximum, ni (en proportion de la hauteur) plus que la source.
// Plancher par qualité pour garder une image correcte, mais jamais au-dessus du débit de la source.
const FLOOR = { 360: 250, 720: 500, 1080: 800 };
export function videoKbpsFor(r, srcHeight, srcKbps) {
  if (!srcKbps || !srcHeight) return r.v; // débit de la source inconnu : réglage d'avant
  const scaled = Math.round((srcKbps * r.h) / srcHeight);
  const floor = Math.min(FLOOR[r.h] ?? 250, srcKbps);
  return Math.max(150, Math.min(r.v, Math.max(scaled, floor)));
}

// Choisit les qualités à produire pour une hauteur source donnée.
export function pickRenditions(srcHeight) {
  const list = RENDITIONS.filter((r) => r.h <= srcHeight + 8);
  if (list.length) return list;
  return [{ ...RENDITIONS[0], h: Math.max(2, srcHeight - (srcHeight % 2)) }]; // source plus petite que 360p
}

// Construit les arguments FFmpeg (exporté pour les tests).
export function buildArgs({ input, outDir, info, threads = 0 }) {
  const rends = pickRenditions(info.height);
  const n = rends.length;
  const split = `[0:v]split=${n}${rends.map((_, i) => `[s${i}]`).join('')}`;
  const scales = rends.map((r, i) => `[s${i}]scale=-2:${r.h}[v${i}]`);
  const args = ['-y', '-nostdin', '-v', 'error', '-i', input, '-filter_complex', [split, ...scales].join(';')];
  rends.forEach((r, i) => {
    const kb = videoKbpsFor(r, info.height, info.videoKbps);
    args.push('-map', `[v${i}]`, `-c:v:${i}`, 'libx264', '-preset', 'veryfast', `-profile:v:${i}`, r.profile,
      `-b:v:${i}`, `${kb}k`, `-maxrate:v:${i}`, `${Math.round(kb * 1.07)}k`, `-bufsize:v:${i}`, `${Math.round(kb * 1.5)}k`,
      `-pix_fmt:v:${i}`, 'yuv420p');
  });
  if (info.hasAudio) {
    rends.forEach((r, i) => args.push('-map', '0:a:0', `-c:a:${i}`, 'aac', `-b:a:${i}`, `${r.a}k`, `-ac:a:${i}`, '2'));
  }
  args.push('-threads', String(threads), '-force_key_frames', 'expr:gte(t,n_forced*6)', '-sc_threshold', '0',
    '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_segment_type', 'fmp4',
    '-hls_flags', 'independent_segments', '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_segment_filename', path.join(outDir, 'v%v/seg_%05d.m4s'), '-master_pl_name', 'master.m3u8',
    '-var_stream_map', rends.map((_, i) => (info.hasAudio ? `v:${i},a:${i}` : `v:${i}`)).join(' '),
    '-progress', 'pipe:1', path.join(outDir, 'v%v/index.m3u8'));
  return { args, count: n };
}

// Convertit input -> outDir (master.m3u8, vN/…, poster.jpg). onProgress reçoit 0..1.
export async function transcode({ input, outDir, info, threads, onProgress }) {
  const { args, count } = buildArgs({ input, outDir, info, threads });
  for (let i = 0; i < count; i++) await fs.mkdir(path.join(outDir, `v${i}`), { recursive: true });

  // Miniature à ~10 % de la vidéo.
  await run('ffmpeg', ['-y', '-nostdin', '-v', 'error', '-ss', String(Math.floor(info.duration * 0.1)), '-i', input,
    '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', path.join(outDir, 'poster.jpg')]);

  // 3 images au choix pour la miniature (à 20 %, 50 % et 80 %) : c1.jpg, c2.jpg, c3.jpg.
  for (const [i, at] of [0.2, 0.5, 0.8].entries()) {
    await run('ffmpeg', ['-y', '-nostdin', '-v', 'error', '-ss', String(Math.floor(info.duration * at)), '-i', input,
      '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', path.join(outDir, `c${i + 1}.jpg`)]).catch(() => {});
  }

  await run('nice', ['-n', '10', 'ffmpeg', ...args], {
    onLine: (line) => {
      const m = line.match(/^out_time_(?:us|ms)=(\d+)/);
      if (m) onProgress?.(Math.min(1, Number(m[1]) / 1e6 / info.duration));
    },
  });
}

// Version « audio seul » (HLS fMP4 AAC) : écoute sans l'image, écran éteint, peu de données (≈ 28 Mo par heure à 64 kbit/s).
// input : fichier source ou playlist HLS locale ; copy = true recopie l'audio tel quel (vidéos déjà converties), sinon ré-encode en AAC 64 kbit/s.
export function buildAudioArgs({ input, outDir, copy = false }) {
  return ['-y', '-nostdin', '-v', 'error', '-i', input, '-vn', '-map', '0:a:0',
    ...(copy ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '64k', '-ac', '2']),
    '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_segment_type', 'fmp4',
    '-hls_flags', 'independent_segments', '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_segment_filename', path.join(outDir, 'seg_%05d.m4s'), path.join(outDir, 'index.m3u8')];
}

export async function makeAudio({ input, outDir, copy = false }) {
  await fs.mkdir(outDir, { recursive: true });
  await run('nice', ['-n', '10', 'ffmpeg', ...buildAudioArgs({ input, outDir, copy })]);
}
