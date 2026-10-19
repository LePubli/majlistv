// Module « Éditeur de montage » — étape E3 : habillage (titres, bandeau de nom, logo, intro et fin, transitions, sous-titres incrustés).
//
// Ce fichier contient :
//   1. le document d'habillage (« dress », ajouté au montage) et sa vérification ;
//   2. la fabrication des textes à incruster (fichier ASS, lu par libass dans FFmpeg) : le même code servira au rendu final (étape E4) ;
//   3. l'image finale d'un instant du montage (« Voir l'image finale ») : FFmpeg compose la vraie image (vidéo, fondu, textes, logo)
//      avec les mêmes réglages et les mêmes polices que le rendu.
//
//   dress = {
//     items:  [ { id, kind: 'title'|'banner', text, sub, start, len, pos: 'center'|'top'|'bottom' (titre), side: 'left'|'right' (bandeau), scale: 50-200 } ],
//                 titres et bandeaux, placés dans le temps du montage (comme les musiques, ils ne suivent pas les coupes)
//     logo:   { on, asset: 'channel' | <uuid d'un logo importé> | null, pos: 'tl'|'tr'|'bl'|'br', size: 4-40 (% de la largeur), opacity: 10-100, from, to (null = jusqu'à la fin) },
//     intro:  { on, len: 1-15 s, title, sub },     écran ajouté AVANT le montage (le montage ne bouge pas : seul le rendu ajoute sa durée)
//     outro:  { on, len: 1-15 s, title, sub },     écran ajouté APRÈS le montage
//     transitions: { all: { type, len } | null, byClip: { <id d'extrait>: { type, len } } },
//                 transition AVANT l'extrait (au raccord avec le précédent) ; type : 'cut' | 'dip' (fondu au noir) | 'dipwhite' (fondu au blanc).
//                 Un fondu n'empiète jamais sur le temps : il assombrit len/2 avant le raccord et len/2 après. Le son ne bouge pas.
//     subs:   { burn, scale: 50-200, pos: 'bottom'|'top', box }   sous-titres incrustés dans l'image (à la place des sous-titres du lecteur)
//   }
//   Variables dans les textes : {titre} (titre de la conférence), {intervenant} (nom de l'intervenant).
import { z } from 'zod';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../config.js';
import { makePlaybackToken } from '../../playback.js';
import { FFMPEG } from './audio.js';

export const MAX_ITEMS = 100;
export const MIN_ITEM = 0.5;
export const TRANSITIONS = ['cut', 'dip', 'dipwhite'];
export const LOGO_POS = ['tl', 'tr', 'bl', 'br'];
const FONTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');

const num = z.number().finite();
const rng = (label, min, max) => num.min(min, `${label} : entre ${min} et ${max}`).max(max, `${label} : entre ${min} et ${max}`);
const text = (label, max) => z.string().max(max, `${label} : ${max} caractères au plus`).default('');
const id = (what) => z.string().regex(/^[A-Za-z0-9_-]{1,24}$/, `Identifiant de ${what} invalide`);
const trans = z.object({
  type: z.enum(TRANSITIONS, { errorMap: () => ({ message: 'Transition : cut, dip ou dipwhite' }) }),
  len: rng('Durée de la transition (s)', 0.2, 3).default(0.8),
});
const item = z.object({
  id: id('titre'),
  kind: z.enum(['title', 'banner'], { errorMap: () => ({ message: 'Type de titre : title ou banner' }) }),
  text: text('Texte', 200),
  sub: text('Deuxième ligne', 200),
  start: num.min(0),
  len: rng('Durée du titre (s)', MIN_ITEM, 600),
  pos: z.enum(['center', 'top', 'bottom']).default('center'),
  side: z.enum(['left', 'right']).default('left'),
  scale: rng('Taille du texte (%)', 50, 200).default(100),
});
const card = (len) => z.object({
  on: z.boolean().default(false),
  len: rng('Durée (s)', 1, 15).default(len),
  title: text('Titre', 160),
  sub: text('Sous-titre', 160),
}).default({});
export const dressSchema = z.object({
  items: z.array(item).max(MAX_ITEMS, `${MAX_ITEMS} titres au plus`).default([]),
  logo: z.object({
    on: z.boolean().default(false),
    asset: z.union([z.literal('channel'), z.string().uuid('Logo inconnu'), z.null()]).default('channel'),
    pos: z.enum(LOGO_POS).default('tr'),
    size: rng('Taille du logo (%)', 4, 40).default(12),
    opacity: rng('Opacité du logo (%)', 10, 100).default(90),
    from: num.min(0).default(0),
    to: num.min(0).nullable().default(null),
  }).default({}),
  intro: card(4),
  outro: card(5),
  transitions: z.object({
    all: trans.nullable().default(null),
    byClip: z.record(z.string(), trans).default({}),
  }).default({}),
  subs: z.object({
    burn: z.boolean().default(false),
    scale: rng('Taille des sous-titres (%)', 50, 200).default(100),
    pos: z.enum(['bottom', 'top']).default('bottom'),
    box: z.boolean().default(true),
  }).default({}),
});

export const dressDefaults = (d) => dressSchema.parse(d || {});
const r3 = (x) => Math.round(x * 1000) / 1000;

// Vérifie l'habillage d'un montage. clipIds : extraits qui existent ; logos : Set des logos importés connus (omis = pas de vérification).
// Les transitions d'un extrait disparu sont retirées sans erreur (l'extrait a pu être supprimé).
export function checkDress(input, { clipIds, logos } = {}) {
  const p = dressSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message || 'Habillage invalide' };
  const d = p.data;
  const seen = new Set();
  for (const it of d.items) {
    if (seen.has(it.id)) return { ok: false, error: `Titre en double : ${it.id}` };
    seen.add(it.id);
  }
  if (logos && d.logo.asset && d.logo.asset !== 'channel' && !logos.has(d.logo.asset)) return { ok: false, error: 'Le logo du montage n’est plus dans la bibliothèque' };
  if (d.logo.to != null && d.logo.to <= d.logo.from) return { ok: false, error: 'Le logo doit finir après son début' };
  const byClip = {};
  for (const [k, v] of Object.entries(d.transitions.byClip)) if (!clipIds || clipIds.has(k)) byClip[k] = v;
  return { ok: true, dress: { ...d, items: d.items.map((i) => ({ ...i, start: r3(i.start), len: r3(i.len) })), transitions: { all: d.transitions.all, byClip } } };
}

// Un habillage de départ vide ? (pour ne pas enregistrer { dress } pour rien)
export const dressIsEmpty = (d) => {
  const x = dressDefaults(d);
  return !x.items.length && !x.logo.on && !x.intro.on && !x.outro.on && !x.transitions.all && !Object.keys(x.transitions.byClip).length && !x.subs.burn;
};

// Remplace {titre} et {intervenant}.
export const fillVars = (s, vars = {}) => String(s ?? '').replace(/\{(titre|intervenant)\}/g, (_, k) => vars[k] ?? '');

// --- Temps : extraits → temps du montage
export function layout(clips) {
  let t = 0;
  return clips.map((c) => { const start = t; t += c.out - c.in; return { ...c, start, end: t }; });
}
// Place des éléments { s, e, … } (temps source) dans le montage ; un élément coupé est raccourci. Même règle que le site (ops.js).
export function mapItems(clips, items, minPart = 0) {
  const out = [];
  for (const c of layout(clips)) {
    for (const it of items) {
      if (it.e <= c.in + 1e-6 || it.s >= c.out - 1e-6) continue;
      const s = Math.max(it.s, c.in); const e = Math.min(it.e, c.out);
      if (e - s < minPart) continue;
      out.push({ ...it, ts: c.start + (s - c.in), te: c.start + (e - c.in), clipId: c.id });
    }
  }
  return out;
}
// Transition effective à l'entrée de l'extrait d'indice i (i ≥ 1), ou null (coupure franche).
export function transitionAt(dress, clips, i) {
  if (i < 1 || i >= clips.length) return null;
  const t = dress.transitions.byClip[clips[i].id] || dress.transitions.all;
  return t && t.type !== 'cut' ? t : null;
}
// Voile (0 à 1 et couleur) au temps T : le fondu monte jusqu'au raccord puis redescend.
export function dipAt(dress, clips, T) {
  const L = layout(clips);
  for (let i = 1; i < L.length; i += 1) {
    const tr = transitionAt(dress, clips, i);
    if (!tr) continue;
    const half = tr.len / 2; const d = Math.abs(T - L[i].start);
    if (d < half) return { alpha: 1 - d / half, color: tr.type === 'dipwhite' ? 'white' : 'black' };
  }
  return { alpha: 0, color: 'black' };
}

// --- Fichier ASS ----------------------------------------------------------------------------------------------------------
// Les tailles sont données pour une image de 1920 × 1080 : libass les adapte à la taille réelle (PlayRes).
const GOLD = '&H0039A7E6&';     // or du site (#E6A739), en BGR
const WHITE = '&H00FFFFFF&';
const ts = (x) => { const c = Math.max(0, Math.round(x * 100)); return `${Math.floor(c / 360000)}:${String(Math.floor(c / 6000) % 60).padStart(2, '0')}:${String(Math.floor(c / 100) % 60).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`; };
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\r?\n/g, '\\N');
const LAYER = { Title: 2, Banner: 1, Card: 2, Subs: 0, SubsBox: 0 };

// Événements d'habillage en temps du montage + décalage « offset » (durée de l'intro quand on rend toute la vidéo).
// ctx : { vars, total (durée du montage), cues (sous-titres en temps du montage : [{ ts, te, text }]), fade (fondu d'entrée / sortie des titres) }
export function dressEvents(dress, ctx) {
  const { vars = {}, total, cues = [], fade = true, offset = 0 } = ctx;
  const ev = [];
  const fad = fade ? '{\\fad(300,300)}' : '';
  const push = (a, b, style, body, mv = 0) => { if (b - a > 0.01 && a < total + 1e-6) ev.push({ a: a + offset, b: Math.min(b, total) + offset, style, body, mv }); };
  for (const it of dress.items) {
    const a = it.start; const b = Math.min(it.start + it.len, total);
    const main = esc(fillVars(it.text, vars)); const sub = esc(fillVars(it.sub, vars));
    if (!main && !sub) continue;
    const k = it.scale / 100;
    if (it.kind === 'title') {
      const an = { center: 5, top: 8, bottom: 2 }[it.pos] || 5;
      const mv = { center: 0, top: 110, bottom: 190 }[it.pos] || 0;
      const first = main ? `{\\an${an}\\fs${Math.round(96 * k)}\\b1\\c${WHITE}}${main}` : '';
      const second = sub ? `${main ? '\\N' : `{\\an${an}}`}{\\fs${Math.round(46 * k)}\\b0\\c${GOLD}}${sub}` : '';
      push(a, b, 'Title', `${fad}{\\an${an}}${first}${second}`, mv);
    } else {
      const an = it.side === 'right' ? 3 : 1;
      const first = main ? `{\\an${an}\\fs${Math.round(54 * k)}\\b1\\c${WHITE}}${main}` : '';
      const second = sub ? `${main ? '\\N' : `{\\an${an}}`}{\\fs${Math.round(38 * k)}\\b0\\c${GOLD}}${sub}` : '';
      push(a, b, 'Banner', `${fad}{\\an${an}}${first}${second}`);
    }
  }
  if (dress.subs.burn) {
    const k = dress.subs.scale / 100;
    const an = dress.subs.pos === 'top' ? 8 : 2;
    for (const c of cues) {
      const body = esc(c.text);
      if (body) push(c.ts, c.te, dress.subs.box ? 'SubsBox' : 'Subs', `{\\an${an}\\fs${Math.round(50 * k)}}${body}`);
    }
  }
  return ev;
}

// Fichier ASS complet. cards : écrans de l'intro et de la fin [{ a, b, title, sub }] (au centre, par-dessus un fond uni).
export function buildAss(events, { cards = [], w = 1920, h = 1080, fade = true } = {}) {
  const lines = events.map((e) => `Dialogue: ${LAYER[e.style] ?? 0},${ts(e.a)},${ts(e.b)},${e.style},,0,0,${e.mv || 0},,${e.body}`);
  for (const c of cards) {
    const main = esc(c.title); const sub = esc(c.sub);
    if (main) lines.push(`Dialogue: ${LAYER.Card},${ts(c.a)},${ts(c.b)},Card,,0,0,0,,{\\an5\\pos(${w / 2},${h * 0.52})${fade ? '\\fad(400,400)' : ''}}${main}`);
    if (sub) lines.push(`Dialogue: ${LAYER.Card},${ts(c.a)},${ts(c.b)},CardSub,,0,0,0,,{\\an5\\pos(${w / 2},${h * 0.52 + 110})${fade ? '\\fad(700,400)' : ''}}${sub}`);
  }
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,DejaVu Sans,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,3,3,5,120,120,110,1
Style: Banner,DejaVu Sans,54,&H00FFFFFF,&H00FFFFFF,&H40060D12,&H50060D12,-1,0,0,0,100,100,0,0,3,20,0,1,90,90,150,1
Style: Subs,DejaVu Sans,50,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,1,2,160,160,60,1
Style: SubsBox,DejaVu Sans,50,&H00FFFFFF,&H00FFFFFF,&H5A060D12,&H64000000,0,0,0,0,100,100,0,0,3,14,0,2,160,160,60,1
Style: Card,DejaVu Sans,104,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,160,160,0,1
Style: CardSub,DejaVu Sans,48,${GOLD.replace(/&$/, '')},${GOLD.replace(/&$/, '')},&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,160,160,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join('\n')}
`;
}

// --- Image finale d'un instant ------------------------------------------------------------------------------------------
export const FRAME_W = 1280; export const FRAME_H = 720;
const run = (args, { cwd, timeoutS = 40, needOut = true } = {}) => new Promise((resolve, reject) => {
  const p = spawn(FFMPEG, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = []; let err = '';
  const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Image trop longue à préparer')); }, timeoutS * 1000);
  p.stdout.on('data', (d) => out.push(d));
  p.stderr.on('data', (d) => { err = (err + d.toString()).slice(-6000); });
  p.on('error', (e) => { clearTimeout(timer); reject(new Error(`FFmpeg introuvable (${e.message})`)); });
  p.on('close', (code) => {
    clearTimeout(timer);
    const buf = Buffer.concat(out);
    if (code !== 0 || (needOut && !buf.length)) reject(new Error(`Image impossible : ${err.trim().split('\n').slice(-2).join(' · ')}`.slice(0, 400)));
    else resolve({ buf, err });
  });
});

// Dimensions d'une image (logo) : FFmpeg la décode une fois ; un fichier illisible est refusé.
export async function probeImage(url) {
  const { err } = await run(['-hide_banner', '-v', 'info', '-i', url, '-frames:v', '1', '-f', 'null', '-'], { timeoutS: 20, needOut: false }).catch((e) => { throw new Error(`Image illisible : ${e.message.replace(/^Image impossible : /, '')}`.slice(0, 300)); });
  const m = err.match(/Video:[^\n]*?[ ,](\d{2,5})x(\d{2,5})/);
  if (!m) throw new Error('Image illisible');
  return { w: Number(m[1]), h: Number(m[2]) };
}

// Lien interne vers la meilleure qualité disponible parmi 720p (v1) et 360p (v0).
async function sourceUrl(talkId) {
  const tok = encodeURIComponent(makePlaybackToken(talkId, 600));
  const base = `http://127.0.0.1:${config.port}/hls/${talkId}`;
  try { const r = await fetch(`${base}/v1/index.m3u8?t=${tok}`); if (r.ok) return `${base}/v1/index.m3u8?t=${tok}`; } catch { /* qualité absente */ }
  return `${base}/v0/index.m3u8?t=${tok}`;
}

const LOGO_XY = (pos, m) => ({ tl: [`${m}`, `${m}`], tr: [`W-w-${m}`, `${m}`], bl: [`${m}`, `H-h-${m}`], br: [`W-w-${m}`, `H-h-${m}`] }[pos] || [`W-w-${m}`, `${m}`]);

// Compose l'image finale. at : temps du montage (nombre) ou 'intro' / 'outro'.
// row : { talk_id, … } ; timeline : montage vérifié ; ctx : { vars, cues (temps source), logoUrl }
export async function renderFrame({ talkId, timeline, at, vars, cues, logoUrl }) {
  const dress = dressDefaults(timeline.dress);
  const clips = timeline.clips;
  const total = layout(clips).at(-1).end;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e3frame-'));
  try {
    const W = FRAME_W; const H = FRAME_H;
    const args = ['-hide_banner', '-v', 'error', '-y'];
    let events = []; let cards = []; let dip = { alpha: 0, color: 'black' }; let logo = null;
    const isCard = at === 'intro' || at === 'outro';
    if (isCard) {
      const c = dress[at];
      cards = [{ a: 0, b: 5, title: fillVars(c.title, vars), sub: fillVars(c.sub, vars) }];
      args.push('-f', 'lavfi', '-i', `color=c=0x0B0906:s=${W}x${H}:r=25:d=1`);
      if (dress.logo.on && logoUrl) logo = { center: true };
    } else {
      const T = Math.max(0, Math.min(Number(at) || 0, Math.max(0, total - 0.04)));
      let i = layout(clips).findIndex((c) => T < c.end - 1e-6); if (i < 0) i = clips.length - 1;
      const L = layout(clips)[i];
      const src = L.in + (T - L.start);
      args.push('-protocol_whitelist', 'file,http,https,tcp,tls,crypto,hls', '-ss', String(Math.max(0, src)), '-i', await sourceUrl(talkId));
      dip = dipAt(dress, clips, T);
      // Les événements actifs à l'instant T, ramenés à 0 : l'image est lue à l'instant 0 du filtre. Sans fondu : on voit le titre en entier.
      const cueMap = mapItems(clips, cues).map((m) => ({ ts: m.ts, te: m.te, text: m.text }));
      events = dressEvents(dress, { vars, total, cues: cueMap, fade: false })
        .filter((e) => e.a <= T + 1e-6 && e.b > T + 1e-6).map((e) => ({ ...e, a: Math.max(0, e.a - T), b: e.b - T }));
      if (dress.logo.on && logoUrl && T >= dress.logo.from && (dress.logo.to == null || T < dress.logo.to)) logo = { center: false };
    }
    if (logo) args.push('-i', logoUrl);
    fs.writeFileSync(path.join(dir, 'f.ass'), buildAss(events, { cards, fade: false }));
    const f = [`[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p[b]`];
    let cur = 'b';
    if (dip.alpha > 0.001) { f.push(`[${cur}]drawbox=x=0:y=0:w=iw:h=ih:color=${dip.color}@${dip.alpha.toFixed(3)}:t=fill[d]`); cur = 'd'; }
    if (isCard) { f.push(`[${cur}]drawbox=x=(iw-160)/2:y=${Math.round(H * (0.52 + 78 / 1080))}:w=160:h=4:color=0xE6A739:t=fill[g]`); cur = 'g'; }
    f.push(`[${cur}]ass=filename=f.ass:fontsdir=${FONTS}[t]`); cur = 't';
    if (logo) {
      const lw = Math.round(W * (isCard ? 0.14 : dress.logo.size / 100));
      f.push(`[1:v]scale=${lw}:-1,format=rgba,colorchannelmixer=aa=${(isCard ? 1 : dress.logo.opacity / 100).toFixed(2)}[lg]`);
      const [x, y] = isCard ? ['(W-w)/2', `${Math.round(H * 0.18)}`] : LOGO_XY(dress.logo.pos, Math.round(W * 0.021));
      f.push(`[${cur}][lg]overlay=x=${x}:y=${y}[o]`); cur = 'o';
    }
    args.push('-filter_complex', f.join(';'), '-map', `[${cur}]`, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1');
    try {
      const { buf } = await run(args, { cwd: dir });
      return buf;
    } catch (e) {
      // Certains flux (HLS fMP4 / VP9) ne rendent aucune image avec un saut en entrée : on relit avec le saut après l'entrée (plus lent, plus sûr).
      const k = args.indexOf('-ss');
      if (isCard || k < 0) throw e;
      const alt = args.slice(); const [flag, val] = alt.splice(k, 2);
      alt.splice(alt.indexOf('-i') + 2, 0, flag, val);
      const { buf } = await run(alt, { cwd: dir, timeoutS: 60 });
      return buf;
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
