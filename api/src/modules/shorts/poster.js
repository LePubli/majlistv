// Affiche d'un short : une image JPEG tirée de la vidéo (vers 1 s, ou au début si le short est très court), enregistrée
// sous shorts/<id>.jpg. FFmpeg lit la vidéo par un lien temporaire ; sans FFmpeg ou en cas d'échec, pas d'affiche (la page
// prend alors la miniature de la conférence).
import { spawn } from 'node:child_process';
import { presignGet, putObject } from '../../storage.js';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

function grab(url, at) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-v', 'error', '-ss', String(at), '-i', url, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1']);
    const out = []; let err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('délai dépassé')); }, 30000);
    p.stdout.on('data', (b) => out.push(b));
    p.stderr.on('data', (b) => { err += b; });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => { clearTimeout(timer); const buf = Buffer.concat(out); if (code === 0 && buf.length > 100) resolve(buf); else reject(new Error(err.trim().slice(0, 200) || `FFmpeg ${code}`)); });
  });
}

// Renvoie la clé de l'affiche, ou null.
export async function makePoster(id, videoKey, duration, log) {
  try {
    const url = await presignGet(videoKey);
    const at = Number(duration) > 2 ? 1 : 0;
    const img = await grab(url, at);
    const key = `shorts/${id}.jpg`;
    await putObject(key, img, 'image/jpeg');
    return key;
  } catch (e) {
    log?.warn?.(`Shorts : affiche non créée (${e.message})`);
    return null;
  }
}
