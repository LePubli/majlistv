#!/usr/bin/env node
// Étape E0 — prototype JETABLE du moteur de rendu du Studio : un montage décrit en JSON (timeline.json) devient UNE commande
// FFmpeg (filter_complex). Rien n'est branché au site : ce script sert à mesurer la vitesse sur le processeur du VPS et à
// valider le choix du moteur avant l'étape E1.
//
// Ce que le prototype sait faire (le minimum d'un montage de conférence) :
//   - générique d'ouverture et de fin (fond + titres), extraits coupés dans une ou plusieurs vidéos (début / fin),
//   - fondus enchaînés entre extraits (image et son), mise à l'échelle 16:9 avec bandes si besoin,
//   - logo, bandeaux de titre (« lower third »), sous-titres incrustés recalés après les coupes (carte du temps),
//   - pistes audio supplémentaires (voix française, musique) avec début, volume, boucle, fondus,
//   - ducking : la voix d'origine et la musique baissent automatiquement quand la voix française parle,
//   - volume final normalisé (EBU R128), H.264 / AAC, aperçu rapide en 640x360.
// Les textes passent par un fichier ASS (libass) : l'arabe est bien façonné et écrit de droite à gauche.
//
// Usage : node render.mjs [timeline.json] [--media dossier] [--out fichier.mp4] [--preview] [--threads N] [--dry]
// Sans dépendance npm : Node 22 et FFmpeg (avec libass et libx264) suffisent.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(name);
const TL_PATH = args.find((a) => a.endsWith('.json')) || 'timeline.json';
const MEDIA = opt('--media', 'media');
const PREVIEW = flag('--preview');
const OUT = opt('--out', PREVIEW ? 'out/montage-preview.mp4' : 'out/montage.mp4');
const THREADS = Number(opt('--threads', String(Math.min(4, os.cpus().length))));
const DRY = flag('--dry');
const HERE = path.dirname(new URL(import.meta.url).pathname);

const fail = (m) => { console.error(`Erreur : ${m}`); process.exit(1); };
const tl = JSON.parse(fs.readFileSync(TL_PATH, 'utf8'));
const W = PREVIEW ? 640 : tl.output?.width || 1920;
const H = PREVIEW ? 360 : tl.output?.height || 1080;
const FPS = tl.output?.fps || 25;
const K = W / 1920; // facteur d'échelle des tailles (logo, marges) ; les textes ASS s'adaptent seuls (PlayRes 1920x1080)

// --- Fichiers sources (une entrée FFmpeg par fichier) ---
const inputs = []; // { file, opts }
const inputOf = new Map();
function input(file, opts = []) {
  const full = path.isAbsolute(file) ? file : path.join(MEDIA, file);
  if (!fs.existsSync(full)) fail(`fichier introuvable : ${full}`);
  const key = `${full}|${opts.join(' ')}`;
  if (!inputOf.has(key)) { inputOf.set(key, inputs.length); inputs.push({ file: full, opts }); }
  return inputOf.get(key);
}
const hasAudio = (file) => {
  try {
    return execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]).toString().trim() !== '';
  } catch { return false; }
};

// --- Segments du fil principal : générique, extraits, générique de fin ---
const segs = [];
if (tl.intro) segs.push({ kind: 'card', d: tl.intro.duration, card: tl.intro, t: 0 });
for (const c of tl.clips || []) {
  if (!(c.out > c.in)) fail(`extrait ${c.src} : la fin (${c.out}) doit être après le début (${c.in})`);
  segs.push({ kind: 'clip', d: c.out - c.in, clip: c, t: segs.length ? c.transition?.duration || 0 : 0 });
}
if (tl.outro) segs.push({ kind: 'card', d: tl.outro.duration, card: tl.outro, t: tl.outro.transition?.duration || 0 });
if (!segs.length) fail('la timeline est vide');
let acc = 0;
for (const [i, s] of segs.entries()) {
  if (s.t >= s.d || (i > 0 && s.t >= segs[i - 1].d)) fail(`fondu de ${s.t} s trop long pour l'élément ${i + 1}`);
  s.start = i === 0 ? 0 : acc - s.t; // début dans le montage (les fondus se chevauchent)
  acc = s.start + s.d;
}
const T = acc; // durée totale
const r3 = (x) => Math.round(x * 1000) / 1000;

// --- Graphe FFmpeg ---
const F = [];
for (const [i, s] of segs.entries()) {
  if (s.kind === 'card') {
    F.push(`color=c=0x0B0B0B:s=${W}x${H}:r=${FPS}:d=${s.d},format=yuv420p,setsar=1,fps=${FPS},settb=1/${FPS}[v${i}]`);
    F.push(`anullsrc=r=48000:cl=stereo,atrim=0:${s.d},asetpts=PTS-STARTPTS[a${i}]`);
  } else {
    // Une entrée par extrait, ouverte directement au bon endroit (-ss / -t) : FFmpeg ne décode que les passages utiles et
    // n'accumule pas en mémoire les images d'un extrait en attendant le précédent (cas d'une même vidéo coupée plusieurs fois).
    const k = input(s.clip.src, ['-ss', String(s.clip.in), '-t', String(r3(s.d))]);
    const file = inputs[k].file;
    F.push(`[${k}:v]setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=decrease,`
      + `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},format=yuv420p,settb=1/${FPS}[v${i}]`);
    if (hasAudio(file)) F.push(`[${k}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${r3(s.d)}[a${i}]`);
    else F.push(`anullsrc=r=48000:cl=stereo,atrim=0:${s.d},asetpts=PTS-STARTPTS[a${i}]`);
  }
}
// Enchaînement : fondu (xfade / acrossfade) ou collage direct (concat). xfade exige la même taille, cadence et base de temps (settb).
let vAcc = 'v0'; let aAcc = 'a0';
for (let i = 1; i < segs.length; i++) {
  const s = segs[i];
  if (s.t > 0) {
    F.push(`[${vAcc}][v${i}]xfade=transition=${s.clip?.transition?.type || s.card?.transition?.type || 'fade'}:duration=${s.t}:offset=${r3(s.start)}[vx${i}]`);
    F.push(`[${aAcc}][a${i}]acrossfade=d=${s.t}:c1=tri:c2=tri[ax${i}]`);
  } else {
    F.push(`[${vAcc}][v${i}]concat=n=2:v=1:a=0,settb=1/${FPS}[vx${i}]`);
    F.push(`[${aAcc}][a${i}]concat=n=2:v=0:a=1[ax${i}]`);
  }
  vAcc = `vx${i}`; aAcc = `ax${i}`;
}

// --- Audio : voix d'origine + pistes ajoutées, ducking, volume final ---
const au = tl.audio || {};
F.push(`[${aAcc}]volume=${au.original?.gain ?? 1}[orig]`);
const bed = ['orig']; const voices = [];
for (const [j, tr] of (au.tracks || []).entries()) {
  const k = input(tr.src, tr.loop ? ['-stream_loop', '-1'] : []);
  const st = tr.start || 0;
  const parts = [`[${k}:a]aresample=48000,aformat=channel_layouts=stereo`];
  if (tr.loop) parts.push(`atrim=0:${r3(T - st)}`);
  parts.push(`volume=${tr.gain ?? 1}`);
  if (tr.fadeIn) parts.push(`afade=t=in:d=${tr.fadeIn}`);
  if (tr.fadeOut) parts.push(`afade=t=out:st=${r3(Math.max(0, T - st - tr.fadeOut))}:d=${tr.fadeOut}`);
  parts.push(`adelay=${Math.round(st * 1000)}:all=1`, 'apad', `atrim=0:${r3(T)}`);
  F.push(`${parts.join(',')}[t${j}]`);
  (tr.duck ? voices : bed).push(`t${j}`);
}
const mix = (labels, out) => (labels.length === 1 ? F.push(`[${labels[0]}]anull[${out}]`) : F.push(`${labels.map((l) => `[${l}]`).join('')}amix=inputs=${labels.length}:normalize=0:duration=first[${out}]`));
mix(bed, 'bed');
let finalA = 'bed';
if (voices.length) {
  mix(voices, 'voice');
  const d = au.ducking || {};
  if (d.enabled !== false) {
    F.push('[voice]asplit=2[vsc][vmix]');
    F.push(`[bed][vsc]sidechaincompress=threshold=${d.threshold ?? 0.02}:ratio=${d.ratio ?? 8}:attack=${d.attackMs ?? 20}:release=${d.releaseMs ?? 350}[ducked]`);
    F.push('[ducked][vmix]amix=inputs=2:normalize=0:duration=first[mixed]');
  } else F.push('[bed][voice]amix=inputs=2:normalize=0:duration=first[mixed]');
  finalA = 'mixed';
}
F.push(`[${finalA}]loudnorm=I=${au.loudnessLufs ?? -16}:TP=-1.5:LRA=11,aresample=48000[aout]`);

// --- Textes (ASS) : titres des génériques, bandeaux, sous-titres recalés sur le montage ---
const ts = (x) => { const c = Math.max(0, Math.round(x * 100)); const h = Math.floor(c / 360000); const m = Math.floor(c / 6000) % 60; const s = Math.floor(c / 100) % 60; return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`; };
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\n/g, '\\N');
const ev = [];
// Calques distincts : libass n'écarte (empile) que les textes d'un même calque, un sous-titre ne saute donc pas au-dessus d'un bandeau.
const LAYER = { Title: 2, Sub: 2, Banner: 1, BannerSub: 1, Subs: 0 };
const add = (a, b, style, text) => { if (b > a) ev.push(`Dialogue: ${LAYER[style] ?? 0},${ts(a)},${ts(b)},${style},,0,0,0,,${esc(text)}`); };
for (const s of segs) {
  if (s.kind !== 'card') continue;
  add(s.start + 0.2, s.start + s.d, 'Title', s.card.title);
  add(s.start + 0.6, s.start + s.d, 'Sub', s.card.subtitle);
}
for (const o of tl.overlays || []) {
  if (o.type !== 'banner') continue;
  add(o.start, o.end, 'Banner', o.text);
  add(o.start, o.end, 'BannerSub', o.subtitle);
}
// Carte du temps : un instant de la source → instant(s) du montage (une phrase coupée disparaît, une phrase à cheval est raccourcie).
const timeMap = segs.filter((s) => s.kind === 'clip').map((s) => ({ src: s.clip.src, in: s.clip.in, out: s.clip.out, at: r3(s.start) }));
let subsKept = 0; let subsDropped = 0;
if (tl.subtitles?.burn && tl.subtitles.src) {
  const vtt = fs.readFileSync(path.join(MEDIA, tl.subtitles.src), 'utf8');
  const sec = (x) => { const p = x.trim().split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
  for (const block of vtt.split(/\r?\n\r?\n/)) {
    const m = block.match(/([\d:.]+)\s*-->\s*([\d:.]+)[^\n]*\n([\s\S]+)/);
    if (!m) continue;
    const a = sec(m[1]); const b = sec(m[2]); const text = m[3].trim();
    let placed = false;
    for (const c of timeMap) {
      const lo = Math.max(a, c.in); const hi = Math.min(b, c.out);
      if (hi - lo > 0.3) { add(c.at + (lo - c.in), c.at + (hi - c.in), 'Subs', text); placed = true; }
    }
    if (placed) subsKept += 1; else subsDropped += 1;
  }
}
fs.mkdirSync(path.dirname(OUT) || '.', { recursive: true });
const assPath = path.join(path.dirname(OUT) || '.', PREVIEW ? 'e0-preview.ass' : 'e0.ass');
fs.writeFileSync(assPath, `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,DejaVu Sans,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,80,80,60,1
Style: Sub,DejaVu Sans,46,&H003AA4E0,&H003AA4E0,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,80,80,380,1
Style: Banner,DejaVu Sans,54,&H00FFFFFF,&H00FFFFFF,&H00141008,&H50141008,-1,0,0,0,100,100,0,0,3,18,0,1,90,90,250,1
Style: BannerSub,DejaVu Sans,38,&H003AA4E0,&H003AA4E0,&H00141008,&H50141008,0,0,0,0,100,100,0,0,3,14,0,1,90,90,180,1
Style: Subs,DejaVu Sans,50,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,1,2,120,120,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${ev.join('\n')}
`);
const fontsDir = path.join(HERE, 'fonts');
// Chemins passés au filtre ass : relatifs au dossier courant (pas de « : » à échapper).
const rel = (p) => path.relative(process.cwd(), p).split(path.sep).join('/') || '.';
F.push(`[${vAcc}]ass=filename=${rel(assPath)}:fontsdir=${rel(fontsDir)}[vtxt]`);
let vOut = 'vtxt';
for (const [j, o] of (tl.overlays || []).entries()) {
  if (o.type !== 'logo') continue;
  const k = input(o.src, ['-loop', '1']);
  const size = Math.round((o.size || 120) * K); const m = Math.round(40 * K);
  const pos = { 'top-right': [`W-w-${m}`, `${m}`], 'top-left': [`${m}`, `${m}`], 'bottom-right': [`W-w-${m}`, `H-h-${m}`], 'bottom-left': [`${m}`, `H-h-${m}`] }[o.position || 'top-right'];
  F.push(`[${k}:v]scale=${size}:-1,format=rgba,colorchannelmixer=aa=${o.opacity ?? 1}[lg${j}]`);
  F.push(`[${vOut}][lg${j}]overlay=x=${pos[0]}:y=${pos[1]}:shortest=1:enable='between(t,${o.from || 0},${o.to ?? T})'[vl${j}]`);
  vOut = `vl${j}`;
}
F.push(`[${vOut}]format=yuv420p[vout]`);

const ff = ['-hide_banner', '-y', '-nostats', '-progress', 'pipe:1'];
for (const i of inputs) ff.push(...i.opts, '-i', i.file);
const graphPath = path.join(path.dirname(OUT) || '.', PREVIEW ? 'e0-preview.graph.txt' : 'e0.graph.txt');
fs.writeFileSync(graphPath, F.join(';\n'));
ff.push('-filter_complex_script', graphPath, '-map', '[vout]', '-map', '[aout]', '-t', String(r3(T)), '-r', String(FPS), '-threads', String(THREADS),
  '-c:v', 'libx264', '-preset', PREVIEW ? 'ultrafast' : 'medium', '-crf', PREVIEW ? '30' : '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', PREVIEW ? '96k' : '160k', '-movflags', '+faststart', OUT);

console.log(`Montage « ${tl.title || ''} » : ${segs.length} éléments, ${r3(T)} s, ${W}x${H}, ${THREADS} fil(s)${PREVIEW ? ' (aperçu)' : ''}`);
if (DRY) { console.log(`ffmpeg ${ff.join(' ')}`); console.log(F.join(';\n')); process.exit(0); }

const t0 = Date.now();
const p = spawn('ffmpeg', ff, { stdio: ['ignore', 'pipe', 'pipe'] });
let err = ''; let lastPct = -1;
p.stderr.on('data', (d) => { err = (err + d).slice(-6000); });
p.stdout.on('data', (d) => {
  const m = String(d).match(/out_time_us=(\d+)/g);
  if (!m) return;
  const us = Number(m[m.length - 1].split('=')[1]);
  const pct = Math.min(100, Math.floor((us / 1e6 / T) * 100));
  if (pct >= lastPct + 10) { lastPct = pct; process.stdout.write(`  … ${pct} %\n`); }
});
p.on('close', (code) => {
  const sec = (Date.now() - t0) / 1000;
  if (code !== 0) { console.error(err); fail(`FFmpeg s'est arrêté (code ${code})`); }
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height', '-of', 'json', OUT]).toString());
  const report = {
    date: new Date().toISOString(), host: os.hostname(), cpus: os.cpus().length, threads: THREADS, preview: PREVIEW,
    ffmpeg: execFileSync('ffmpeg', ['-version']).toString().split('\n')[0],
    timeline: path.basename(TL_PATH), output: OUT, width: W, height: H, durationS: r3(Number(probe.format.duration)), expectedS: r3(T),
    sizeMB: Math.round(Number(probe.format.size) / 1048576 * 10) / 10, renderS: r3(sec), rtf: r3(sec / T),
    streams: probe.streams.map((s) => s.codec_name), subtitles: { kept: subsKept, dropped: subsDropped }, timeMap,
  };
  const rp = path.join(path.dirname(OUT) || '.', PREVIEW ? 'report-preview.json' : 'report.json');
  fs.writeFileSync(rp, JSON.stringify(report, null, 2));
  console.log(`Terminé en ${report.renderS} s pour ${report.durationS} s de vidéo : ${report.rtf} s de calcul par seconde (RTF), ${report.sizeMB} Mo.`);
  console.log(`Sous-titres : ${subsKept} gardés, ${subsDropped} retirés (passages coupés). Rapport : ${rp}`);
});
