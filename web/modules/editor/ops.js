// Éditeur de montage (étape E1) — opérations sur le montage, sans React (testées par web/tests/e1_ops.mjs).
//
// Un montage = une liste d'extraits de la vidéo source, joués l'un après l'autre : clips = [{ id, in, out }] (secondes).
// « Temps du montage » T : position dans la vidéo montée (0 → durée du montage).
// « Temps source » s : position dans la vidéo d'origine. Les pistes liées (voix d'origine, voix française, sous-titres)
// gardent leurs temps source : on les place dans le montage extrait par extrait (mapItems).
export const MIN_CLIP = 0.2;
const EPS = 1e-6;
export const round3 = (x) => Math.round(x * 1000) / 1000;

// Position de chaque extrait dans le montage.
export function layout(clips) {
  let t = 0;
  return clips.map((c) => { const start = t; t += c.out - c.in; return { ...c, start, end: t }; });
}
export const total = (clips) => clips.reduce((s, c) => s + (c.out - c.in), 0);

// Quel extrait joue au temps T du montage, et à quel temps source ?
export function locate(clips, T) {
  const L = layout(clips);
  if (!L.length) return null;
  const tt = Math.max(0, Math.min(T, L[L.length - 1].end));
  let i = L.findIndex((c) => tt < c.end - EPS);
  if (i < 0) i = L.length - 1;
  const c = L[i];
  return { index: i, clip: c, src: c.in + (tt - c.start), offset: tt - c.start };
}

// Nouvel identifiant d'extrait (c1, c2, …), unique dans le montage.
export function newId(clips) {
  let n = clips.length + 1;
  const ids = new Set(clips.map((c) => c.id));
  while (ids.has(`c${n}`)) n += 1;
  return `c${n}`;
}

// Couper au temps T : l'extrait est séparé en deux (rien si T tombe à moins de MIN_CLIP d'un bord).
export function splitAt(clips, T) {
  const loc = locate(clips, T);
  if (!loc) return { clips, done: false };
  const { index, clip, src } = loc;
  if (src - clip.in < MIN_CLIP - EPS || clip.out - src < MIN_CLIP - EPS) return { clips, done: false };
  const a = { id: clip.id, in: clip.in, out: round3(src) };
  const b = { id: newId(clips), in: round3(src), out: clip.out };
  const out = [...clips.slice(0, index), a, b, ...clips.slice(index + 1)];
  return { clips: out, done: true, index: index + 1 };
}

// Supprimer un extrait (le montage garde toujours au moins un extrait).
export function removeClip(clips, index) {
  if (clips.length <= 1 || index < 0 || index >= clips.length) return { clips, done: false };
  return { clips: clips.filter((_, i) => i !== index), done: true };
}

// Déplacer un extrait : de la place « from » à la place « to » (0 = tout au début).
export function moveClip(clips, from, to) {
  if (from === to || from < 0 || from >= clips.length) return { clips, done: false };
  const out = [...clips];
  const [c] = out.splice(from, 1);
  const dest = Math.max(0, Math.min(to, out.length));
  out.splice(dest, 0, c);
  const changed = out.some((x, i) => x.id !== clips[i].id);
  return { clips: changed ? out : clips, done: changed, index: dest };
}

// Raccourcir / rallonger : nouveau début (edge = 'in') ou nouvelle fin (edge = 'out') de l'extrait, en temps source.
export function trimClip(clips, index, edge, value, duration) {
  const c = clips[index];
  if (!c) return { clips, done: false };
  let v = Number(value);
  if (!Number.isFinite(v)) return { clips, done: false };
  if (edge === 'in') v = Math.max(0, Math.min(v, c.out - MIN_CLIP));
  else v = Math.min(duration, Math.max(v, c.in + MIN_CLIP));
  v = round3(v);
  if (Math.abs(v - c[edge]) < 0.0005) return { clips, done: false };
  const out = clips.map((x, i) => (i === index ? { ...x, [edge]: v } : x));
  return { clips: out, done: true };
}

// Place des éléments d'une piste liée (temps source { s, e, … }) dans le montage. Un élément coupé par le montage
// est raccourci (part = true) ; un passage repris deux fois apparaît deux fois.
export function mapItems(clips, items) {
  const out = [];
  for (const c of layout(clips)) {
    for (const it of items) {
      if (it.e <= c.in + EPS || it.s >= c.out - EPS) continue;
      const s = Math.max(it.s, c.in); const e = Math.min(it.e, c.out);
      out.push({ ...it, ts: c.start + (s - c.in), te: c.start + (e - c.in), part: s > it.s + EPS || e < it.e - EPS, clipId: c.id });
    }
  }
  return out;
}

// Raccords : entre deux extraits qui ne se suivent pas dans la source, un passage a été coupé ou déplacé (hachures).
export function joins(clips) {
  const L = layout(clips);
  const out = [];
  for (let i = 1; i < L.length; i += 1) {
    const prev = L[i - 1]; const cur = L[i];
    if (Math.abs(prev.out - cur.in) > 0.01) out.push({ t: cur.start, removed: cur.in > prev.out ? round3(cur.in - prev.out) : 0, moved: cur.in < prev.out });
  }
  return out;
}

// Aimant : ramène T sur le repère le plus proche (bords des extraits, début et fin des phrases) s'il est à moins de « tol ».
export function snap(T, targets, tol) {
  let best = T; let d = tol;
  for (const x of targets) { const k = Math.abs(x - T); if (k < d) { d = k; best = x; } }
  return best;
}

// Repères de l'aimant, en temps du montage.
export function snapTargets(clips, cues = []) {
  const set = new Set([0]);
  for (const c of layout(clips)) { set.add(round3(c.start)); set.add(round3(c.end)); }
  for (const m of mapItems(clips, cues)) { set.add(round3(m.ts)); set.add(round3(m.te)); }
  return [...set].sort((a, b) => a - b);
}

// Repère source le plus proche (bord d'une phrase) pour raccourcir un extrait avec l'aimant.
export function snapSource(s, cues, tol) {
  let best = s; let d = tol;
  for (const c of cues) for (const x of [c.s, c.e]) { const k = Math.abs(x - s); if (k < d) { d = k; best = x; } }
  return best;
}

// 75.4 → « 1:15,4 » (dixièmes) ; h:mm:ss au-delà d'une heure.
export function fmtTime(s, { tenths = false, sep = ',' } = {}) {
  const v = Math.max(0, Number(s) || 0);
  const h = Math.floor(v / 3600); const m = Math.floor((v % 3600) / 60); const sec = Math.floor(v % 60);
  const pad = (n) => String(n).padStart(2, '0');
  let out = h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  if (tenths) out += `${sep}${Math.floor((v * 10) % 10)}`;
  return out;
}
// Horloge du lecteur : 00:14:32
export function clock(s) {
  const v = Math.max(0, Math.floor(Number(s) || 0));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(v / 3600))}:${pad(Math.floor((v % 3600) / 60))}:${pad(v % 60)}`;
}
// Saisie « 1:15,4 » / « 75.4 » / « 1:02:03 » → secondes (ou NaN).
export function parseTime(str) {
  const t = String(str || '').trim().replace(',', '.');
  if (!t) return NaN;
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(t)) return NaN;
  return t.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
}

// Graduations de la règle : un pas « rond » qui laisse environ 90 px entre deux repères.
export function rulerStep(pxPerSec) {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  return steps.find((s) => s * pxPerSec >= 90) || 3600;
}

// ===== Étape E2 — son =====
// Réglages du son : mêmes valeurs par défaut que l'API (api/src/modules/editor/timeline.js).
export const MUSIC_DEF = { offset: 0, gainDb: -12, fadeIn: 2, fadeOut: 3, loop: false, duck: true, duckDb: -12 };
export const AUDIO_DEF = {
  orig: { gainDb: 0, mute: false, joinFadeMs: 30, denoise: 'off' },
  dub: { use: true, gainDb: 0, duck: 15, fade: 0.5 },
  music: [],
  loudness: { on: true, target: -16 },
};
export function withAudio(a, defaults = AUDIO_DEF) {
  const d = defaults || AUDIO_DEF;
  return {
    orig: { ...d.orig, ...(a?.orig || {}) },
    dub: { ...d.dub, ...(a?.dub || {}) },
    music: (a?.music || []).map((m) => ({ ...MUSIC_DEF, ...m })),
    loudness: { ...d.loudness, ...(a?.loudness || {}) },
  };
}
export const dbToLin = (db) => 10 ** ((Number(db) || 0) / 20);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Moments où la voix française parle, en temps du montage (phrases non gardées en voix d'origine).
export function dubSpans(clips, segments) {
  return mapItems(clips, (segments || []).filter((s) => !s.keep)).map((m) => ({ ts: m.ts, te: m.te })).sort((a, b) => a.ts - b.ts);
}
// Moments où quelqu'un parle dans la vidéo d'origine (phrases des sous-titres), en temps du montage.
export const speechSpans = (clips, cues) => mapItems(clips, cues || []).map((m) => ({ ts: m.ts, te: m.te })).sort((a, b) => a.ts - b.ts);

// 0 hors des passages, 1 dedans, avec une rampe de « fade » secondes avant et après (baisse progressive).
export function envelope(T, spans, fade) {
  let best = 0;
  for (const s of spans) {
    if (s.ts - fade > T) break;
    if (T >= s.ts && T <= s.te) return 1;
    const d = T < s.ts ? s.ts - T : T - s.te;
    if (fade > 0 && d < fade) best = Math.max(best, 1 - d / fade);
  }
  return best;
}

// Temps dans le fichier d'une musique au temps T du montage (null si la musique ne joue pas).
export function musicTime(m, T, assetDur) {
  if (T < m.start || T >= m.start + m.len) return null;
  let s = m.offset + (T - m.start);
  if (m.loop && assetDur > 0) s %= assetDur;
  else if (assetDur > 0 && s >= assetDur) return null;
  return s;
}

// Volumes (0-1) de chaque source au temps T : voix d'origine, voix française, musiques. ctx = { clips, dubSp, speechSp, hasDub }.
export function mixAt(T, audio, ctx) {
  const a = audio;
  const useDub = Boolean(ctx.hasDub && a.dub.use);
  const ev = useDub ? envelope(T, ctx.dubSp, a.dub.fade) : 0;
  // Petit fondu aux raccords : le son descend puis remonte sur joinFadeMs autour de chaque raccord.
  let jf = 1;
  if (a.orig.joinFadeMs > 0 && ctx.joins) {
    const half = a.orig.joinFadeMs / 2000;
    for (const j of ctx.joins) { const d = Math.abs(T - j); if (d < half) jf = Math.min(jf, d / half); }
  }
  const orig = a.orig.mute ? 0 : clamp01(dbToLin(a.orig.gainDb) * (1 - ev * (1 - a.dub.duck / 100)) * jf);
  const dub = useDub ? clamp01(dbToLin(a.dub.gainDb)) : 0;
  const voice = useDub ? ctx.dubSp : ctx.speechSp;
  const music = {};
  for (const m of a.music) {
    if (T < m.start || T >= m.start + m.len) { music[m.id] = 0; continue; }
    const into = T - m.start; const left = m.start + m.len - T;
    let g = dbToLin(m.gainDb);
    if (m.fadeIn > 0 && into < m.fadeIn) g *= into / m.fadeIn;
    if (m.fadeOut > 0 && left < m.fadeOut) g *= left / m.fadeOut;
    if (m.duck) g *= 1 - envelope(T, voice, 0.3) * (1 - dbToLin(m.duckDb));
    music[m.id] = clamp01(g);
  }
  return { orig, dub, music, ducked: ev > 0.5 };
}

// Nouvel identifiant de musique (m1, m2, …).
export function newMusicId(items) {
  const ids = new Set(items.map((m) => m.id));
  let n = items.length + 1;
  while (ids.has(`m${n}`)) n += 1;
  return `m${n}`;
}
// Ajouter une musique au temps T : jusqu'à la fin du montage (en boucle si le fichier est plus court).
export function addMusic(items, asset, T, assetDur, totalS) {
  const start = round3(Math.max(0, Math.min(T, Math.max(0, totalS - MIN_CLIP))));
  const room = Math.max(MIN_CLIP, totalS - start);
  const loop = assetDur > 0 && assetDur < room;
  const len = round3(loop ? room : Math.min(room, assetDur || room));
  const fadeIn = Math.min(MUSIC_DEF.fadeIn, len / 4); const fadeOut = Math.min(MUSIC_DEF.fadeOut, len / 4);
  const m = { ...MUSIC_DEF, id: newMusicId(items), asset, start, len, loop, fadeIn: round3(fadeIn), fadeOut: round3(fadeOut) };
  return { items: [...items, m], id: m.id };
}
// Déplacer une musique (nouveau début, en temps du montage).
export const moveMusic = (items, id, start) => items.map((m) => (m.id === id ? { ...m, start: round3(Math.max(0, start)) } : m));
// Raccourcir / rallonger une musique par son bord gauche (edge 'in', valeur = nouveau début) ou droit ('out', valeur = nouvelle fin).
export function trimMusic(items, id, edge, value, assetDur) {
  return items.map((m) => {
    if (m.id !== id) return m;
    const end = m.start + m.len;
    if (edge === 'in') {
      let s = Math.max(0, Math.min(value, end - MIN_CLIP));
      let off = m.offset + (s - m.start);
      if (!m.loop) { if (off < 0) { s -= off; off = 0; } if (assetDur > 0 && off > assetDur - MIN_CLIP) { off = assetDur - MIN_CLIP; s = m.start + (off - m.offset); } }
      else if (assetDur > 0) off = ((off % assetDur) + assetDur) % assetDur;
      const len = end - s;
      return { ...m, start: round3(s), offset: round3(off), len: round3(len), fadeIn: Math.min(m.fadeIn, round3(len / 2)), fadeOut: Math.min(m.fadeOut, round3(len / 2)) };
    }
    let len = Math.max(MIN_CLIP, value - m.start);
    if (!m.loop && assetDur > 0) len = Math.min(len, assetDur - m.offset);
    return { ...m, len: round3(len), fadeIn: Math.min(m.fadeIn, round3(len / 2)), fadeOut: Math.min(m.fadeOut, round3(len / 2)) };
  });
}

// Base64 → octets (formes d'onde de l'API : un pic 0-255 toutes les stepMs).
export function decodePeaks(b64) {
  if (!b64) return null;
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
// Pic maximal (0-1) entre deux temps d'un fichier analysé.
export function peakBetween(peaks, stepMs, s0, s1) {
  if (!peaks || !peaks.length) return 0;
  const k = 1000 / stepMs;
  let i0 = Math.max(0, Math.floor(s0 * k)); const i1 = Math.min(peaks.length - 1, Math.floor(s1 * k));
  if (i0 > i1) i0 = i1;
  let mx = 0;
  for (let i = i0; i <= i1; i += 1) if (peaks[i] > mx) mx = peaks[i];
  return mx / 255;
}
