// Rendu du montage (étape E4a) : lit le « plan de rendu » préparé par l'API (api/src/modules/editor/plan.js) et lance FFmpeg.
//
// Le worker ne connaît rien au montage : le plan contient la liste des fichiers à lire, le graphe de filtres (vidéo et audio), le fichier de
// textes ASS et les courbes de baisse du volume. Ici on télécharge les fichiers, on remplace quelques valeurs qui dépendent de la vidéo
// (taille de l'image, cadence : @W@, @H@, @FPS@…), on mesure le niveau sonore (première passe du « niveau homogène »), puis on encode.
//
// Étapes visibles dans l'éditeur (colonne stage) : download → measure → encode → upload.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { RENDITIONS } from './transcode.js';

export const CURVE_HZ = 1000;
const MAX_ATTEMPTS = 2;

// --- Fonctions pures (testées) ----------------------------------------------------------------------------------------------

// Taille de l'image : aperçu 640×360 ; rendu final à la hauteur de la meilleure qualité de la source (360, 720 ou 1080), en 16:9.
// Extrait court 9:16 (étape E5b, plan.vertical) : aperçu 360 × 640 ; rendu final 1080 × 1920, 720 × 1280 ou 360 × 640 selon la hauteur de la source
// (le cadre vertical garde toute la hauteur de la source : inutile de dépasser sa qualité).
export function outputSize({ preview, srcHeight, vertical = false }) {
  if (vertical) {
    if (preview) return { W: 360, H: 640 };
    const h = srcHeight || 0;
    return h >= 1072 ? { W: 1080, H: 1920 } : h >= 712 ? { W: 720, H: 1280 } : { W: 360, H: 640 };
  }
  if (preview) return { W: 640, H: 360 };
  const list = RENDITIONS.filter((r) => r.h <= (srcHeight || 0) + 8);
  const H = list.length ? list[list.length - 1].h : 360;
  return { W: Math.round((H * 16) / 9 / 2) * 2, H };
}

// Cadence : celle de la source, entre 24 et 30 images par seconde (25 si inconnue).
export const outputFps = (srcFps) => (Number.isFinite(srcFps) && srcFps > 1 ? Math.max(24, Math.min(30, Math.round(srcFps))) : 25);

// g(t) = 1 - e(t) × profondeur, échantillonné à CURVE_HZ (flottants 32 bits), pour « amultiply ». pts : [[t, e]…] en lignes brisées.
export function rasterizeCurve(pts, depth, seconds) {
  const n = Math.max(2, Math.ceil(seconds * CURVE_HZ));
  const out = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / CURVE_HZ;
    while (j + 1 < pts.length && pts[j + 1][0] < t) j += 1;
    let e;
    if (!pts.length) e = 0;
    else if (t <= pts[0][0]) e = pts[0][1];
    else if (j + 1 >= pts.length) e = pts[pts.length - 1][1];
    else { const [t0, v0] = pts[j]; const [t1, v1] = pts[j + 1]; e = t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0); }
    out[i] = 1 - e * depth;
  }
  return out;
}

// Remplace les valeurs @…@ du plan. vars : { W, H, FPS, ASS, FONTS, LN }.
export function fillScript(text, plan, vars) {
  const all = { W: vars.W, H: vars.H, FPS: vars.FPS, ASS: vars.ASS, FONTS: vars.FONTS, LN: vars.LN };
  for (const [name, [base, k]] of Object.entries(plan.tokens || {})) all[name] = Math.max(2, Math.round(k * (base === 'W' ? vars.W : vars.H)));
  return text.replace(/@([A-Z]+)@/g, (m, k) => (all[k] === undefined ? m : String(all[k])));
}

// Arguments d'entrée de FFmpeg. files : { source, dub, logo, music: {id: chemin}, curves: {id: chemin} }.
export function inputArgs(plan, files, { hasAudio }) {
  const args = [];
  for (const inp of plan.inputs) {
    let opts = inp.opts; let file;
    if (inp.ref === 'source') {
      file = files.source;
      if (inp.use === 'a' && !hasAudio) { // vidéo sans piste son : silence de la même durée
        const t = opts[opts.indexOf('-t') + 1];
        args.push('-f', 'lavfi', '-t', String(t), '-i', 'anullsrc=r=48000:cl=stereo');
        continue;
      }
    } else if (inp.ref === 'dub') file = files.dub;
    else if (inp.ref === 'logo') file = files.logo;
    else if (inp.ref.startsWith('music:')) file = files.music[inp.ref.slice(6)];
    else if (inp.ref.startsWith('curve:')) file = files.curves[inp.ref.slice(6)];
    if (!file) throw new Error(`Fichier introuvable pour « ${inp.ref} »`);
    args.push(...opts, '-i', file);
  }
  return args;
}

// Mesure du son (loudnorm, première passe) : lit le bloc JSON écrit par FFmpeg.
export function parseLoudnorm(stderr) {
  const m = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const n = (k) => Number(j[k]);
    const out = { I: n('input_i'), TP: n('input_tp'), LRA: n('input_lra'), thresh: n('input_thresh'), offset: n('target_offset') };
    return Object.values(out).every(Number.isFinite) ? out : null;
  } catch { return null; }
}

export function loudnormFilter(plan, measured) {
  if (!plan.loudness.on) return 'anull';
  const base = `loudnorm=I=${plan.loudness.target}:TP=-1.5:LRA=11`;
  if (!measured) return base;
  return `${base}:measured_I=${measured.I}:measured_TP=${measured.TP}:measured_LRA=${measured.LRA}:measured_thresh=${measured.thresh}:offset=${measured.offset}:linear=true`;
}

export function encodeArgs(plan) {
  return plan.preview
    ? ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k']
    : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'];
}

// --- Exécution ----------------------------------------------------------------------------------------------------------------

let current = null; // processus FFmpeg en cours
export const killRender = () => current?.kill('SIGKILL');

function runFfmpeg(args, { cwd, onProgress, label }) {
  return new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '10', 'ffmpeg', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    current = child;
    let err = ''; let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) { const m = line.match(/^out_time_(?:us|ms)=(\d+)/); if (m) onProgress?.(Number(m[1]) / 1e6); }
    });
    child.stderr.on('data', (d) => { err = (err + d).slice(-60000); });
    child.on('error', (e) => { current = null; reject(new Error(`FFmpeg introuvable (${e.message})`)); });
    child.on('close', (code, sig) => {
      current = null;
      if (code === 0) return resolve(err);
      const tail = err.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => !/^\[(Parsed_loudnorm|Parsed_ebur)/.test(l)).slice(-3).join(' · ');
      return reject(Object.assign(new Error(`${label || 'FFmpeg'} s’est arrêté (code ${code ?? sig}) : ${tail}`.slice(0, 600)), { killed: sig === 'SIGKILL' }));
    });
  });
}

async function ffprobeJson(file) {
  return new Promise((resolve, reject) => {
    const c = spawn('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    c.on('error', reject);
    c.on('close', (code) => { if (code !== 0) return reject(new Error(`ffprobe : ${err.trim().slice(-300)}`)); try { resolve(JSON.parse(out)); } catch (e) { reject(e); } });
  });
}

export async function probeSource(file) {
  const j = await ffprobeJson(file);
  const v = j.streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  if (!v) throw new Error('Aucune piste vidéo dans la source');
  const [a, b] = String(v.avg_frame_rate || v.r_frame_rate || '0/1').split('/').map(Number);
  return { width: v.width, height: v.height, fps: b ? a / b : NaN, hasAudio: j.streams.some((s) => s.codec_type === 'audio'), duration: Number(j.format.duration) || 0 };
}

// Ligne de la file : réservée par le worker (pause, priorité et plage horaire des tâches lourdes : Studio → Activité).
export function makeRenderClaim(pool, log = () => {}) {
  let controls = true;
  return async function claimRender() {
    const cond = controls ? `AND activity_allows('video') AND NOT activity_paused('render', id::text)` : '';
    const order = controls ? `activity_priority('render', id::text) DESC, created_at` : 'created_at';
    try {
      const { rows } = await pool.query(
        `UPDATE editor_renders SET status = 'running', stage = 'download', progress = 0, error = NULL, started_at = now(), updated_at = now(), attempts = attempts + 1
          WHERE id = (SELECT id FROM editor_renders WHERE status = 'queued' AND NOT cancel_requested ${cond} ORDER BY ${order} LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING id, project_id, talk_id, kind, plan, attempts`);
      return rows[0];
    } catch (err) {
      if (err.code === '42P01') return undefined; // la migration de l'API n'est pas encore passée
      if (controls && err.code === '42883') { controls = false; log('Pause et priorité indisponibles : file simple'); return claimRender(); }
      throw err;
    }
  };
}

// Au démarrage (ou à l'arrêt) : un rendu interrompu repart.
export const requeueRunning = (pool) => pool.query(`UPDATE editor_renders SET status = 'queued', stage = NULL, progress = 0, updated_at = now() WHERE status = 'running'`).catch(() => {});

export async function processRender({ job, pool, s3, bucket, workDir, threads = 0, log = () => {}, stopping = () => false }) {
  const plan = job.plan;
  const dir = path.join(workDir, `render-${job.id}`);
  const t0 = Date.now();
  const put = async (fields) => {
    const keys = Object.keys(fields);
    await pool.query(`UPDATE editor_renders SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`, [job.id, ...keys.map((k) => fields[k])]);
  };
  let lastWrite = 0; let lastPct = -1; let lastStage = null;
  const progress = async (stage, pct, force = false) => {
    const p = Math.max(0, Math.min(99, Math.floor(pct)));
    if (!force && stage === lastStage && (p === lastPct || Date.now() - lastWrite < 3000)) return;
    lastWrite = Date.now(); lastPct = p; lastStage = stage;
    const r = await pool.query('UPDATE editor_renders SET progress = $2, stage = $3, updated_at = now() WHERE id = $1 RETURNING cancel_requested', [job.id, p, stage]).catch(() => null);
    if (r?.rows[0]?.cancel_requested) killRender();
  };
  const download = async (key, file) => {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    await pipeline(obj.Body, fs.createWriteStream(file));
  };
  try {
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.mkdir(dir, { recursive: true });

    // 1. Fichiers : la source (l'original envoyé, sinon la meilleure qualité convertie), la voix française, les musiques, le logo.
    await progress('download', 0, true);
    const talk = (await pool.query("SELECT video_ref, source, COALESCE(media_prefix, 'hls/' || id || '/') AS prefix FROM talks WHERE id = $1", [job.talk_id])).rows[0];
    if (!talk) throw new Error('Conférence introuvable');
    const files = { music: {}, curves: {} };
    files.source = await fetchSource({ s3, bucket, talk, talkId: job.talk_id, dir, download, log });
    if (plan.refs.dub?.key) { files.dub = path.join(dir, 'dub.m4a'); await download(plan.refs.dub.key, files.dub); }
    if (plan.refs.logo?.key) { files.logo = path.join(dir, 'logo.img'); await download(plan.refs.logo.key, files.logo); }
    for (const [id, m] of Object.entries(plan.refs.music || {})) { files.music[id] = path.join(dir, `music-${id}.audio`); await download(m.key, files.music[id]); }
    const { out, info, W, H, FPS, measured } = await renderFiles({ plan, files, dir, threads, log: (m) => log(`[rendu ${job.id}] ${m}`), onProgress: (stage, pct) => progress(stage, pct) });
    // 4. Contrôle puis envoi.
    const res = await ffprobeJson(out);
    const dur = Number(res.format.duration); const bytes = Number(res.format.size);
    if (!(dur > 0) || Math.abs(dur - plan.outDur) > Math.max(1.5, plan.outDur * 0.01)) throw new Error(`Durée du fichier inattendue : ${dur.toFixed(1)} s au lieu de ${plan.outDur} s`);
    await progress('upload', 95, true);
    const key = `editor/renders/${job.project_id}/${job.id}-${plan.preview ? 'preview' : 'final'}.mp4`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: fs.createReadStream(out), ContentLength: bytes, ContentType: 'video/mp4' }));
    const sec = (Date.now() - t0) / 1000;
    const done = await pool.query(
      `UPDATE editor_renders SET status = 'ready', stage = NULL, progress = 100, output_key = $2, bytes = $3, out_duration_s = $4, error = NULL, finished_at = now(), updated_at = now(),
              report = $5 WHERE id = $1 AND NOT cancel_requested RETURNING id`,
      [job.id, key, bytes, dur, { width: W, height: H, fps: FPS, renderS: Math.round(sec * 10) / 10, rtf: Math.round((sec / plan.outDur) * 100) / 100,
        measured, srcWidth: info.width, srcHeight: info.height, hasAudio: info.hasAudio, ffmpegThreads: threads || null }]);
    if (!done.rowCount) { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {}); await put({ status: 'canceled', stage: null, finished_at: new Date() }); log(`[rendu ${job.id}] annulé`); }
    else log(`[rendu ${job.id}] terminé : ${Math.round(sec)} s de calcul pour ${plan.outDur} s (${Math.round((bytes / 1048576) * 10) / 10} Mo)`);
    return { ok: true };
  } catch (err) {
    const row = (await pool.query('SELECT cancel_requested FROM editor_renders WHERE id = $1', [job.id]).catch(() => ({ rows: [] }))).rows[0];
    if (row?.cancel_requested) { await put({ status: 'canceled', stage: null, finished_at: new Date() }).catch(() => {}); log(`[rendu ${job.id}] annulé`); return { ok: false, canceled: true }; }
    if (stopping()) return { ok: false, stopped: true }; // arrêt du worker : le rendu est remis en file par l'arrêt propre
    const final = job.attempts >= MAX_ATTEMPTS;
    log(`[rendu ${job.id}] échec (${job.attempts}/${MAX_ATTEMPTS}) : ${err.message}`);
    await put({ status: final ? 'failed' : 'queued', stage: null, progress: 0, error: String(err.message).slice(0, 800), ...(final ? { finished_at: new Date() } : {}) }).catch(() => {});
    return { ok: false, error: err.message };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Polices des textes (DejaVu Sans) : FONTS_DIR, sinon worker/fonts, sinon celles du dépôt (développement), sinon celles du système
// (paquet font-dejavu installé dans l'image du worker : indépendant du contexte de construction choisi dans DockPanel).
export function fontsDir() {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const list = [process.env.FONTS_DIR, path.join(here, '..', 'fonts'), path.join(here, '..', '..', 'api', 'src', 'modules', 'editor', 'fonts'),
    '/usr/share/fonts/dejavu', '/usr/share/fonts/truetype/dejavu'].filter(Boolean); // paquet font-dejavu (Alpine) / fonts-dejavu (Debian, Ubuntu)
  return list.find((d) => fs.existsSync(path.join(d, 'DejaVuSans.ttf'))) || list[0];
}

// Rendu à partir de fichiers locaux (utilisé par processRender et par les tests). files : voir inputArgs.
export async function renderFiles({ plan, files, dir, threads = 0, log = () => {}, onProgress = () => {} }) {
  const info = await probeSource(files.source);
  const { W, H } = outputSize({ preview: plan.preview, srcHeight: info.height, vertical: Boolean(plan.vertical) });
  const FPS = outputFps(info.fps);
  log(`source ${info.width}x${info.height}, ${Math.round(info.duration)} s, audio=${info.hasAudio} → ${W}x${H} @${FPS}, ${plan.outDur} s`);

  // Fichiers de travail : textes (ASS), courbes de baisse du volume.
  await fsp.writeFile(path.join(dir, 'render.ass'), plan.ass);
  const need = Math.ceil(plan.total) + 3;
  for (const c of plan.curves) {
    const f = path.join(dir, `${c.id}.f32`);
    const arr = rasterizeCurve(plan.envelopes[c.env] || [], c.depth, need);
    await fsp.writeFile(f, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    files.curves[c.id] = f;
  }
  const FONTS = fontsDir();
  const vars = { W, H, FPS, ASS: 'render.ass', FONTS };
  const ins = inputArgs(plan, files, { hasAudio: info.hasAudio });
  const th = threads ? ['-threads', String(threads)] : [];
  const base = ['-hide_banner', '-nostdin', '-y', '-nostats'];

  // 2. Niveau sonore homogène : première passe (mesure), pour les rendus finals.
  let measured = null;
  if (plan.loudness.on && !plan.preview) {
    await onProgress('measure', 0);
    const aScript = fillScript(plan.script.audio, plan, { ...vars, LN: `loudnorm=I=${plan.loudness.target}:TP=-1.5:LRA=11:print_format=json` });
    await fsp.writeFile(path.join(dir, 'audio-measure.txt'), aScript);
    const err = await runFfmpeg([...base, '-v', 'info', '-progress', 'pipe:1', ...ins, '-filter_complex_script', 'audio-measure.txt', '-map', '[aout]', '-f', 'null', '-'],
      { cwd: dir, label: 'La mesure du son', onProgress: (s) => onProgress('measure', (s / plan.outDur) * 15) });
    measured = parseLoudnorm(err);
    if (!measured) log(`mesure du son illisible : passe unique`);
  }

  // 3. Encodage.
  const full = `${fillScript(plan.script.video, plan, vars)};\n${fillScript(plan.script.audio, plan, { ...vars, LN: loudnormFilter(plan, measured) })}`;
  await fsp.writeFile(path.join(dir, 'graph.txt'), full);
  const out = path.join(dir, 'out.mp4');
  const from = measured ? 15 : 0;
  await onProgress('encode', from);
  await runFfmpeg([...base, '-v', 'error', '-progress', 'pipe:1', ...ins, '-filter_complex_script', 'graph.txt', '-map', '[vout]', '-map', '[aout]',
    '-t', String(plan.outDur), '-r', String(FPS), ...th, ...encodeArgs(plan), '-movflags', '+faststart', out],
  { cwd: dir, label: 'L’encodage', onProgress: (s) => onProgress('encode', from + (s / plan.outDur) * (94 - from)) });

  return { out, info, W, H, FPS, measured };
}

// Source du rendu : le fichier envoyé (qualité d'origine) ; s'il n'existe plus (archivé), la meilleure qualité convertie (HLS).
async function fetchSource({ s3, bucket, talk, talkId, dir, download, log }) {
  const file = path.join(dir, 'source');
  try {
    if (!talk.video_ref) throw new Error('pas de fichier');
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: talk.video_ref }));
    await download(talk.video_ref, file);
    return file;
  } catch (err) {
    log(`[rendu] original indisponible (${err.name || err.message}) : meilleure qualité convertie`);
  }
  // v0 = 360p, v1 = 720p, v2 = 1080p : on prend le plus grand numéro présent.
  const found = new Set();
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${talk.prefix || `hls/${talkId}/`}v`, ContinuationToken: token }));
    for (const o of page.Contents || []) { const m = o.Key.slice((talk.prefix || `hls/${talkId}/`).length).match(/^(v\d+)\//); if (m) found.add(m[1]); }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  if (!found.size) throw new Error('La vidéo n’est plus disponible dans le stockage (ni l’original, ni les versions converties)');
  const best = [...found].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).at(-1);
  const hdir = path.join(dir, 'hls'); await fsp.mkdir(hdir, { recursive: true });
  token = undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${talk.prefix || `hls/${talkId}/`}${best}/`, ContinuationToken: token }));
    for (const o of page.Contents || []) await download(o.Key, path.join(hdir, path.basename(o.Key)));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  // Recopie en un seul fichier (sans réencoder) : sauter à un instant précis d'une playlist HLS fMP4 est peu fiable.
  await new Promise((resolve, reject) => {
    const c = spawn('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-y', '-i', path.join(hdir, 'index.m3u8'), '-map', '0', '-c', 'copy', '-f', 'mp4', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let e = ''; c.stderr.on('data', (d) => { e = (e + d).slice(-2000); });
    c.on('error', reject); c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Recopie de la vidéo convertie impossible : ${e.trim().slice(-300)}`))));
  });
  await fsp.rm(hdir, { recursive: true, force: true });
  return file;
}
