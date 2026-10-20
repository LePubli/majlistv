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

// ===== Étape E3 — habillage =====
// Mêmes valeurs par défaut et mêmes règles que l'API (api/src/modules/editor/dress.js). Temps du montage partout.
export const DRESS_DEF = {
  items: [],
  logo: { on: false, asset: 'channel', pos: 'tr', size: 12, opacity: 90, from: 0, to: null, x: null, y: null },
  intro: { on: false, len: 4, title: '', sub: '' },
  outro: { on: false, len: 5, title: '', sub: '' },
  transitions: { all: null, byClip: {} },
  subs: { burn: false, scale: 100, pos: 'bottom', box: true, y: null },
};
export const ITEM_DEF = { pos: 'center', side: 'left', scale: 100, x: null, y: null };
// Étape E6b : positions libres en % de l'image (null = position prédéfinie). Repères : titre = centre ; bandeau = bord gauche, milieu ;
// logo = coin haut-gauche ; sous-titres = milieu (y seul). Mêmes repères que le rendu (dress.js côté API).
export const isFree = (o) => o?.x != null && o?.y != null;
const clampPct = (v, lo, hi) => Math.round(Math.max(lo, Math.min(hi, v)) * 10) / 10;
// Nouvelle position d'un élément glissé. box : taille de l'élément en % de l'image { w, h } ; renvoie { x, y, guides }.
export function placeAt(kind, x, y, box, snapPct = 1.5) {
  const guides = [];
  const sn = (v, target, axis) => { if (Math.abs(v - target) <= snapPct) { guides.push({ axis, at: target }); return target; } return v; };
  if (kind === 'title') {
    let cx = sn(x, 50, 'x'); let cy = sn(y, 50, 'y');
    cx = clampPct(cx, box.w / 2, 100 - box.w / 2); cy = clampPct(cy, box.h / 2, 100 - box.h / 2);
    return { x: cx, y: cy, guides };
  }
  if (kind === 'subs') return { x: 50, y: clampPct(sn(y, 50, 'y'), box.h / 2, 100 - box.h / 2), guides };
  if (kind === 'banner') {
    let lx = sn(x, 5, 'x'); if (lx === x) { const r = sn(x + box.w, 95, 'x'); if (r !== x + box.w) lx = 95 - box.w; }
    return { x: clampPct(lx, 0, 100 - box.w), y: clampPct(y, box.h / 2, 100 - box.h / 2), guides };
  }
  // logo : coin haut-gauche ; aimanté aux marges de 2 %
  let lx = sn(x, 2, 'x'); if (lx === x) { const r = sn(x + box.w, 98, 'x'); if (r !== x + box.w) lx = 98 - box.w; }
  let ty = sn(y, 3.7, 'y'); if (ty === y) { const b = sn(y + box.h, 96.3, 'y'); if (b !== y + box.h) ty = 96.3 - box.h; }
  return { x: clampPct(lx, 0, 100 - box.w), y: clampPct(ty, 0, 100 - box.h), guides };
}
export const TRANSITION_TYPES = ['cut', 'dip', 'dipwhite', 'dissolve']; // dissolve : fondu enchaîné (registre n°13)
export const ITEM_FADE = 0.3; // fondu d'entrée et de sortie des titres (s), comme au rendu

export function withDress(d) {
  return {
    items: (d?.items || []).map((i) => ({ ...ITEM_DEF, text: '', sub: '', ...i })),
    logo: { ...DRESS_DEF.logo, ...(d?.logo || {}) },
    intro: { ...DRESS_DEF.intro, ...(d?.intro || {}) },
    outro: { ...DRESS_DEF.outro, ...(d?.outro || {}) },
    transitions: { all: d?.transitions?.all || null, byClip: { ...(d?.transitions?.byClip || {}) } },
    subs: { ...DRESS_DEF.subs, ...(d?.subs || {}) },
  };
}
// Habillage vide ? (rien à montrer ni à rendre)
export const dressEmpty = (d) => !d.items.length && !d.logo.on && !d.intro.on && !d.outro.on && !d.transitions.all
  && !Object.keys(d.transitions.byClip).length && !d.subs.burn;

// {titre} et {intervenant}
export const fillVars = (s, vars = {}) => String(s ?? '').replace(/\{(titre|intervenant)\}/g, (_, k) => vars[k] ?? '');

export function newItemId(items) {
  const ids = new Set(items.map((i) => i.id));
  let n = items.length + 1;
  while (ids.has(`t${n}`)) n += 1;
  return `t${n}`;
}
// Ajouter un titre (kind 'title') ou un bandeau de nom (kind 'banner') au temps T ; reste dans le montage.
export function addItem(items, kind, T, totalS) {
  const room = Math.max(0.5, totalS - T);
  const start = round3(Math.max(0, Math.min(T, Math.max(0, totalS - 0.5))));
  const len = round3(Math.min(kind === 'banner' ? 6 : 5, Math.max(0.5, totalS - start), room));
  const it = kind === 'banner'
    ? { ...ITEM_DEF, id: newItemId(items), kind, text: '{intervenant}', sub: '{titre}', start, len }
    : { ...ITEM_DEF, id: newItemId(items), kind, text: '', sub: '', start, len };
  return { items: [...items, it], id: it.id };
}
export const patchItem = (items, id, patch) => items.map((i) => (i.id === id ? { ...i, ...patch } : i));
export const moveItem = (items, id, start) => items.map((i) => (i.id === id ? { ...i, start: round3(Math.max(0, start)) } : i));
// Bord gauche (edge 'in', valeur = nouveau début) ou droit ('out', valeur = nouvelle fin) d'un titre.
export function trimItem(items, id, edge, value) {
  const MIN = 0.5;
  return items.map((i) => {
    if (i.id !== id) return i;
    const end = i.start + i.len;
    if (edge === 'in') { const s = Math.max(0, Math.min(value, end - MIN)); return { ...i, start: round3(s), len: round3(end - s) }; }
    return { ...i, len: round3(Math.max(MIN, value - i.start)) };
  });
}
// Titres visibles au temps T, avec leur opacité (fondu de 0,3 s).
export function activeItems(dress, T, totalS) {
  const out = [];
  for (const it of dress.items) {
    const end = Math.min(it.start + it.len, totalS);
    if (T < it.start || T >= end) continue;
    const a = Math.min(1, (T - it.start) / ITEM_FADE, (end - T) / ITEM_FADE);
    out.push({ item: it, alpha: Math.max(0, Math.min(1, a)) });
  }
  return out;
}
// Le logo est-il visible au temps T ?
export const logoOn = (dress, T) => dress.logo.on && T >= dress.logo.from && (dress.logo.to == null || T < dress.logo.to);

// Transition à l'entrée de l'extrait d'indice i (≥ 1) : { type, len } ou null (coupure franche).
export function transitionFor(dress, clips, i) {
  if (i < 1 || i >= clips.length) return null;
  const t = dress.transitions.byClip[clips[i].id] || dress.transitions.all;
  return t && t.type !== 'cut' ? t : null;
}
// Voile du fondu au temps T : { alpha 0-1, color } — il monte jusqu'au raccord puis redescend (len / 2 de chaque côté).
export function dipAt(dress, clips, T) {
  const L = layout(clips);
  for (let i = 1; i < L.length; i += 1) {
    const tr = transitionFor(dress, clips, i);
    if (!tr || tr.type === 'dissolve') continue; // fondu enchaîné : visible au rendu, pas de voile dans l'aperçu
    const half = tr.len / 2; const d = Math.abs(T - L[i].start);
    if (d < half) return { alpha: 1 - d / half, color: tr.type === 'dipwhite' ? '#fff' : '#000' };
  }
  return { alpha: 0, color: '#000' };
}
// Régler la transition d'un extrait (clipId) ou de tous les raccords ('all'). type 'none' = effacer le réglage propre à l'extrait.
export function setTransition(dress, clipId, tr) {
  const t = dress.transitions;
  if (clipId === 'all') return { ...dress, transitions: { ...t, all: tr && tr.type !== 'cut' ? tr : null } };
  const byClip = { ...t.byClip };
  if (!tr) delete byClip[clipId]; else byClip[clipId] = tr;
  return { ...dress, transitions: { ...t, byClip } };
}

// Modèles prêts à l'emploi (textes dans la langue du site). Les modèles enregistrés viennent de l'API.
export function builtinTemplates(txt) {
  const base = withDress(null);
  const standard = {
    ...base,
    items: [{ ...ITEM_DEF, id: 't1', kind: 'banner', text: '{intervenant}', sub: '{titre}', start: 3, len: 6 }],
    logo: { ...base.logo, on: true, asset: 'channel', pos: 'tr', size: 10, opacity: 85 },
    transitions: { all: { type: 'dip', len: 0.6 }, byClip: {} },
  };
  const withIntro = {
    ...standard,
    intro: { on: true, len: 4, title: '{titre}', sub: '{intervenant}' },
    outro: { on: true, len: 5, title: txt.outroTitle, sub: txt.outroSub },
  };
  return [{ id: 'builtin-standard', name: txt.standard, builtin: true, dress: standard }, { id: 'builtin-intro', name: txt.intro, builtin: true, dress: withIntro }];
}

// ===== Étape E5a — montage par le texte =====
// Le texte est rangé dans l'ordre de la vidéo source ; un mot est « gardé » si un extrait du montage le contient.
// Couper des mots retire leur passage (temps source) de TOUS les extraits ; « Rétablir » le remet en rallongeant l'extrait voisin
// (ou en ajoutant un extrait à sa place). Comme les autres gestes, tout s'annule avec Ctrl+Z.
const JOIN_TOL = 0.011; // deux bords à moins de 11 ms se touchent (les temps sont arrondis à la milliseconde)

// Le temps source s est-il dans le montage ?
export const covered = (clips, s) => clips.some((c) => s >= c.in - EPS && s < c.out - EPS);

// Temps du montage où l'on entend le temps source s (première fois), ou null s'il est coupé.
export function srcToT(clips, s) {
  for (const c of layout(clips)) if (s >= c.in - EPS && s < c.out - EPS) return round3(c.start + (s - c.in));
  return null;
}

// Passage source à retirer pour les mots i → j (liste à plat, ordre source) : du début du premier mot au début du mot suivant
// si le silence entre les deux fait moins d'une seconde (pas de « trou » laissé), sinon 0,1 s après le dernier mot.
export function wordSpan(words, i, j) {
  const a = Math.min(i, j); const b = Math.max(i, j);
  const first = words[a]; const last = words[b]; const next = words[b + 1];
  if (!first || !last) return null;
  let e = last.e + 0.1;
  if (next) e = next.s - last.e < 1 ? next.s : Math.min(e, next.s);
  return { s: round3(first.s), e: round3(Math.max(e, first.s + 0.05)) };
}

// Mot gardé si son milieu est dans le montage.
export const wordKept = (clips, w) => covered(clips, (w.s + w.e) / 2);

// Retirer le passage source [s, e] du montage. Les bouts restants de moins de MIN_CLIP disparaissent aussi.
// Le montage garde toujours au moins un extrait : sinon rien n'est fait (reason = 'all').
export function cutRange(clips, s, e) {
  if (!(e > s)) return { clips, done: false };
  const ids = new Set(clips.map((c) => c.id));
  const fresh = () => { let n = ids.size + 1; while (ids.has(`c${n}`)) n += 1; ids.add(`c${n}`); return `c${n}`; };
  const out = []; let changed = false; let removed = 0;
  for (const c of clips) {
    if (c.out <= s + EPS || c.in >= e - EPS) { out.push(c); continue; }
    changed = true;
    const parts = [];
    if (c.in < s - EPS && s - c.in >= MIN_CLIP - EPS) parts.push({ in: c.in, out: round3(s) });
    if (c.out > e + EPS && c.out - e >= MIN_CLIP - EPS) parts.push({ in: round3(e), out: c.out });
    removed += (c.out - c.in) - parts.reduce((x, p) => x + (p.out - p.in), 0);
    parts.forEach((p, k) => out.push({ id: k === 0 ? c.id : fresh(), in: p.in, out: p.out }));
  }
  if (!changed) return { clips, done: false };
  if (!out.length) return { clips, done: false, reason: 'all' };
  return { clips: out, done: true, removed: round3(removed) };
}

// Remettre le passage source [s, e] dans le montage (ce qui en manque seulement).
export function restoreRange(clips, s, e, duration = Infinity) {
  const a0 = Math.max(0, s); const b0 = Math.min(duration, e);
  if (!(b0 > a0)) return { clips, done: false };
  // Parties de [a0, b0] qu'aucun extrait ne contient.
  const spans = clips.map((c) => [c.in, c.out]).sort((x, y) => x[0] - y[0]);
  const gaps = []; let at = a0;
  for (const [i, o] of spans) {
    if (o <= at) continue;
    if (i >= b0) break;
    if (i > at) gaps.push([at, Math.min(i, b0)]);
    at = Math.max(at, o);
    if (at >= b0) break;
  }
  if (at < b0) gaps.push([at, b0]);
  let out = clips.map((c) => ({ ...c }));
  let done = false;
  for (const [ga, gb] of gaps.filter(([x, y]) => y - x >= 0.02)) {
    const a = round3(ga); const b = round3(gb);
    const before = out.findIndex((c) => Math.abs(c.out - a) < JOIN_TOL);
    const after = out.findIndex((c) => Math.abs(c.in - b) < JOIN_TOL);
    if (before >= 0) {
      out[before].out = b;
      // L'extrait suivant dans le montage reprend juste là : les deux n'en font plus qu'un.
      if (after === before + 1) { out[before].out = out[after].out; out.splice(after, 1); }
    } else if (after >= 0) {
      out[after].in = a;
    } else {
      const ids = new Set(out.map((c) => c.id)); let n = out.length + 1; while (ids.has(`c${n}`)) n += 1;
      // Placé après l'extrait qui finit juste avant dans la source (sinon avant celui qui commence après).
      let pos = -1; let best = -Infinity;
      out.forEach((c, k) => { if (c.out <= a + EPS && c.out >= best) { best = c.out; pos = k; } });
      let idx = pos + 1;
      if (pos < 0) { const k = out.findIndex((c) => c.in >= b - EPS); idx = k < 0 ? out.length : k; }
      out.splice(idx, 0, { id: `c${n}`, in: a, out: b });
    }
    done = true;
  }
  return done ? { clips: out, done: true } : { clips, done: false };
}

// Recherche dans le texte : indices des mots (liste à plat) où commence chaque occurrence (sans accents ni majuscules).
export const foldText = (s) => String(s || '').normalize('NFD').replace(/[̀-ًͯ-ْ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '');
export function findWords(words, query) {
  const q = foldText(query).split(/\s+/).filter(Boolean);
  if (!q.length) return [];
  const f = words.map((w) => foldText(w.w));
  const hits = [];
  for (let i = 0; i + q.length <= f.length; i += 1) {
    let ok = true;
    for (let k = 0; k < q.length && ok; k += 1) ok = k === q.length - 1 ? f[i + k].startsWith(q[k]) : f[i + k] === q[k];
    if (ok) hits.push({ i, j: i + q.length - 1 });
  }
  return hits;
}
