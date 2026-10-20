// Module « Éditeur de montage » — étape E5d : le cadre vertical d'un extrait 9:16 qui bouge (suit le visage, corrections à la main).
// Fonctions pures (testées par api/tests/test_follow.mjs et, avec un vrai FFmpeg, par test_follow_render.py).
//
// Trajectoire du cadre = liste de points { t, x } : t en secondes de la VIDÉO D'ORIGINE, x = position du cadre (0 = tout à gauche,
// 100 = tout à droite), comme « cropX » d'un extrait fixe. Entre deux points, le cadre glisse en ligne droite.
// Deux sources : le suivi automatique du visage (calculé par le service de transcription) ou, à défaut, la position fixe « cropX » ;
// puis les corrections à la main (« pendant ce passage, le cadre est à cette position ») passent par-dessus, avec un glissement de 0,4 s.
import { z } from 'zod';

export const RAMP = 0.4;          // secondes de glissement avant et après une correction à la main
export const MAX_MANUAL = 20;     // corrections à la main par extrait
export const MIN_MANUAL = 0.5;    // durée minimale d'une correction (secondes)
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const clamp01 = (x) => Math.max(0, Math.min(100, x));

export const manualItemSchema = z.object({
  from: z.number().finite().min(0, 'Début de correction invalide'),
  to: z.number().finite().min(0, 'Fin de correction invalide'),
  x: z.number().finite().min(0, 'Position du cadre : entre 0 et 100').max(100, 'Position du cadre : entre 0 et 100'),
});
export const manualSchema = z.array(manualItemSchema).max(MAX_MANUAL, `${MAX_MANUAL} corrections au plus par extrait`).default([]);

// Valeur de la trajectoire à l'instant t (ligne droite entre deux points ; avant le premier / après le dernier : valeur du bord).
export function pathAt(path, t) {
  if (!path.length) return 50;
  if (t <= path[0].t) return path[0].x;
  for (let i = 1; i < path.length; i++) {
    if (t <= path[i].t) {
      const a = path[i - 1]; const b = path[i];
      return b.t === a.t ? b.x : a.x + (b.x - a.x) * ((t - a.t) / (b.t - a.t));
    }
  }
  return path[path.length - 1].x;
}

// Vérifie les corrections à la main d'un passage [from, to]. Les corrections sont découpées au passage ; une correction entièrement
// hors du passage est écartée (le passage a pu être raccourci) ; deux corrections ne peuvent pas se chevaucher.
// Renvoie { ok: true, manual } ou { ok: false, error }.
export function checkManual(list, from, to) {
  const out = [];
  for (const m of list || []) {
    const a = Math.max(from, Number(m.from)); const b = Math.min(to, Number(m.to));
    if (!(Number(m.to) > Number(m.from))) return { ok: false, error: 'Une correction doit finir après son début' };
    if (b - a <= 0) continue; // hors du passage
    if (b - a < MIN_MANUAL) {
      if (Number(m.to) - Number(m.from) < MIN_MANUAL) return { ok: false, error: `Une correction dure au moins ${MIN_MANUAL} s` };
      continue; // coupée par le passage : il en reste trop peu
    }
    out.push({ from: r3(a), to: r3(b), x: Math.round(clamp01(Number(m.x)) * 10) / 10 });
  }
  out.sort((p, q) => p.from - q.from);
  for (let i = 1; i < out.length; i++) {
    if (out[i].from < out[i - 1].to) return { ok: false, error: 'Deux corrections se chevauchent : changez leurs temps' };
  }
  if (out.length > MAX_MANUAL) return { ok: false, error: `${MAX_MANUAL} corrections au plus par extrait` };
  return { ok: true, manual: out };
}

// Points clés automatiques restreints au passage [from, to] : les bords sont ajoutés par interpolation.
export function clipKeys(keys, from, to) {
  const k = (keys || []).filter((p) => Number.isFinite(p?.t) && Number.isFinite(p?.x)).sort((a, b) => a.t - b.t);
  if (!k.length) return [];
  const inside = k.filter((p) => p.t > from && p.t < to).map((p) => ({ t: p.t, x: clamp01(p.x) }));
  return [{ t: from, x: clamp01(pathAt(k, from)) }, ...inside, { t: to, x: clamp01(pathAt(k, to)) }];
}

// Trajectoire finale d'un extrait. { follow, keys (suivi automatique prêt pour CE passage, ou null), cropX, manual, from, to }.
// Renvoie au moins deux points, du début à la fin du passage.
export function buildPath({ follow = false, keys = null, cropX = 50, manual = [], from, to }) {
  let base = follow && keys && keys.length ? clipKeys(keys, from, to) : [];
  if (base.length < 2) base = [{ t: from, x: clamp01(cropX) }, { t: to, x: clamp01(cropX) }];
  let path = base.map((p) => ({ t: r3(p.t), x: p.x }));
  for (const m of [...manual].sort((a, b) => a.from - b.from)) {
    const lo = Math.max(from, m.from - RAMP); const hi = Math.min(to, m.to + RAMP);
    const before = pathAt(path, lo); const after = pathAt(path, hi);
    const kept = path.filter((p) => p.t < lo || p.t > hi);
    const pts = [{ t: lo, x: before }, { t: Math.max(lo, m.from), x: m.x }, { t: Math.min(hi, m.to), x: m.x }, { t: hi, x: after }];
    path = [...kept, ...pts].sort((a, b) => a.t - b.t);
  }
  // Points confondus dans le temps : on garde le dernier ; points alignés inutiles : retirés.
  const uniq = [];
  for (const p of path) {
    const q = { t: r3(p.t), x: Math.round(p.x * 10) / 10 };
    if (uniq.length && uniq[uniq.length - 1].t === q.t) uniq[uniq.length - 1] = q; else uniq.push(q);
  }
  if (uniq.length < 2) return [{ t: from, x: clamp01(cropX) }, { t: to, x: clamp01(cropX) }];
  return uniq;
}

export const isConstant = (path) => path.every((p) => Math.abs(p.x - path[0].x) < 0.05);

// Expression FFmpeg de la position x du cadre (en pixels) au temps t de l'extrait (t = 0 au début de la partie ; "in" = début de la partie
// dans la vidéo d'origine). Somme de « rampes » : chaque morceau de trajectoire ajoute sa variation, bornée entre 0 et 1.
// Pas d'imbrication : l'expression reste lisible par FFmpeg même avec 60 points.
export function xExpression(path, inSec) {
  const terms = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]; const b = path[i];
    const dx = r2(b.x - a.x); const dt = r3(b.t - a.t);
    if (!dx || dt <= 0) continue;
    terms.push(`${dx}*clip((t+${r3(inSec)}-${r3(a.t)})/${dt},0,1)`);
  }
  return `(iw-ow)*(${r2(path[0].x)}${terms.length ? '+' + terms.join('+') : ''})/100`;
}

// Filtre de cadrage vertical qui bouge (jetons @W@ / @H@ remplacés par le worker, comme cropFilter de short.js).
export function cropFilterPath(path, inSec) {
  return `crop=w='trunc(min(iw,ih*9/16)/2)*2':h=ih:x='${xExpression(path, inSec)}':y=0,scale=@W@:@H@:force_original_aspect_ratio=increase,crop=@W@:@H@`;
}
