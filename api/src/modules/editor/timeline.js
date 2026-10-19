// Module « Éditeur de montage » — le document de montage (« timeline »), version 1 (étapes E1 et E2).
//
//   {
//     "v": 1,
//     "duration": 2892.4,                       durée de la vidéo source (secondes)
//     "clips": [ { "id": "c1", "in": 0, "out": 1140.2 }, … ]
//                                               piste Vidéo : extraits de la source, joués l'un après l'autre, sans trou.
//                                               La voix d'origine, la voix française et les sous-titres suivent ces extraits
//                                               (« pistes liées ») : couper ou déplacer la vidéo les coupe ou les déplace aussi.
//     "audio": {                                réglages du son (étape E2), tous facultatifs (valeurs par défaut ci-dessous)
//       "orig":  { "gainDb": 0, "mute": false, "joinFadeMs": 30, "denoise": "off" },
//                  voix d'origine : volume, coupée, petit fondu à chaque raccord (évite les « clics »), réduction du bruit
//       "dub":   { "use": true, "gainDb": 0, "duck": 15, "fade": 0.5 },
//                  voix française : utilisée au rendu, volume, voix d'origine sous la voix française (%), fondu d'entrée / sortie
//       "music": [ { "id": "m1", "asset": "<uuid>", "start": 0, "len": 30, "offset": 0, "gainDb": -12,
//                    "fadeIn": 2, "fadeOut": 3, "loop": false, "duck": true, "duckDb": -12 } ],
//                  musiques de fond placées dans le temps du montage (elles ne suivent pas les coupes de la vidéo)
//       "loudness": { "on": true, "target": -16 }   niveau sonore homogène au rendu (LUFS)
//     },
//     "ui": { "zoom": 1, "magnet": true }      préférences d'affichage du projet (facultatif)
//   }
//
//     "dress": { items, logo, intro, outro, transitions, subs }   habillage (étape E3), facultatif : voir dress.js
//
// Le moteur de rendu de l'étape E4 (FFmpeg piloté par notre code, choisi en E0) lira ce document : réduction du bruit
// (afftdn), ducking, fondus, loudnorm, textes (ASS), logo et transitions y sont appliqués.
import { z } from 'zod';
import { dressSchema, checkDress, dressIsEmpty } from './dress.js';

export const MIN_CLIP = 0.2;   // durée minimale d'un extrait (secondes)
export const MAX_CLIPS = 2000;
export const MAX_MUSIC = 50;
import { DENOISE, DENOISE_FILTER } from './denoise.js';
export { DENOISE, DENOISE_FILTER };

const num = z.number().finite();
// Nombre borné avec un message en français (« Volume : entre -40 et 12 »).
const rng = (label, min, max) => num.min(min, `${label} : entre ${min} et ${max}`).max(max, `${label} : entre ${min} et ${max}`);
const clip = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/, 'Identifiant d’extrait invalide'),
  in: num.min(0),
  out: num.min(0),
});
const music = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/, 'Identifiant de musique invalide'),
  asset: z.string().uuid('Musique inconnue'),
  start: num.min(0),
  len: num.min(MIN_CLIP, 'Une musique doit durer au moins 0,2 s'),
  offset: num.min(0).default(0),
  gainDb: rng('Volume de la musique (dB)', -40, 12).default(-12),
  fadeIn: rng('Fondu d’entrée (s)', 0, 20).default(2),
  fadeOut: rng('Fondu de sortie (s)', 0, 20).default(3),
  loop: z.boolean().default(false),
  duck: z.boolean().default(true),
  duckDb: rng('Baisse de la musique sous la voix (dB)', -40, 0).default(-12),
});
export const audioSchema = z.object({
  orig: z.object({
    gainDb: rng('Volume de la voix d’origine (dB)', -40, 12).default(0),
    mute: z.boolean().default(false),
    joinFadeMs: rng('Fondu aux raccords (ms)', 0, 1000).default(30),
    denoise: z.enum(DENOISE, { errorMap: () => ({ message: 'Réduction du bruit : off, light ou strong' }) }).default('off'),
  }).default({}),
  dub: z.object({
    use: z.boolean().default(true),
    gainDb: rng('Volume de la voix française (dB)', -40, 12).default(0),
    duck: rng('Voix d’origine sous la voix française (%)', 0, 100).default(15),
    fade: rng('Fondu d’entrée / sortie (s)', 0, 3).default(0.5),
  }).default({}),
  music: z.array(music).max(MAX_MUSIC, `${MAX_MUSIC} musiques au plus`).default([]),
  loudness: z.object({ on: z.boolean().default(true), target: rng('Niveau sonore visé (LUFS)', -30, -9).default(-16) }).default({}),
});

export const timelineSchema = z.object({
  v: z.literal(1, { errorMap: () => ({ message: 'Version du montage inconnue' }) }),
  duration: num.positive(),
  clips: z.array(clip).min(1, 'Le montage doit garder au moins un extrait').max(MAX_CLIPS),
  audio: audioSchema.optional(),
  dress: dressSchema.optional(),
  ui: z.object({ zoom: num.min(0.05).max(400).optional(), magnet: z.boolean().optional() }).optional(),
});

const round = (x) => Math.round(x * 1000) / 1000;

// Réglages du son avec leurs valeurs par défaut (pour un montage d'avant E2 aussi). duck : valeur par défaut du doublage.
export function audioDefaults(audio, { duck } = {}) {
  const a = audioSchema.parse(audio || {});
  if (!audio?.dub || audio.dub.duck === undefined) { if (Number.isFinite(duck)) a.dub.duck = duck; }
  return a;
}

// Vérifie le montage par rapport à la vraie durée de la vidéo et aux musiques de la bibliothèque.
// assets : Map(id → durée en secondes) des musiques prêtes ; omis = pas de vérification des musiques.
// Renvoie { ok, timeline } ou { ok: false, error }.
export function checkTimeline(input, sourceDuration, { assets, logos } = {}) {
  const p = timelineSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message || 'Montage invalide' };
  const tl = p.data;
  const dur = Number(sourceDuration) > 0 ? Number(sourceDuration) : tl.duration;
  const ids = new Set();
  for (const c of tl.clips) {
    if (ids.has(c.id)) return { ok: false, error: `Extrait en double : ${c.id}` };
    ids.add(c.id);
    if (c.out > dur + 0.05) return { ok: false, error: `Un extrait dépasse la fin de la vidéo (${round(c.out)} s > ${round(dur)} s)` };
    if (c.out - c.in < MIN_CLIP - 1e-6) return { ok: false, error: `Un extrait doit durer au moins ${MIN_CLIP} s` };
  }
  const out = {
    v: 1, duration: round(dur),
    clips: tl.clips.map((c) => ({ id: c.id, in: round(c.in), out: round(Math.min(c.out, dur)) })),
  };
  if (tl.audio) {
    const a = tl.audio;
    const mids = new Set();
    for (const m of a.music) {
      if (mids.has(m.id)) return { ok: false, error: `Musique en double : ${m.id}` };
      mids.add(m.id);
      if (assets) {
        if (!assets.has(m.asset)) return { ok: false, error: 'Une musique du montage n’est plus dans la bibliothèque (ou pas encore analysée)' };
        const ad = assets.get(m.asset);
        if (ad && m.offset >= ad) return { ok: false, error: 'Le début choisi dépasse la fin de la musique' };
        if (ad && !m.loop && m.offset + m.len > ad + 0.05) return { ok: false, error: 'Une musique est plus longue que son fichier : cochez « En boucle » ou raccourcissez-la' };
      }
      if (m.fadeIn + m.fadeOut > m.len + 1e-6) return { ok: false, error: 'Les fondus d’une musique sont plus longs que la musique' };
    }
    out.audio = {
      orig: a.orig, dub: a.dub, loudness: a.loudness,
      music: a.music.map((m) => ({ ...m, start: round(m.start), len: round(m.len), offset: round(m.offset) })),
    };
  }
  if (tl.dress) {
    const d = checkDress(tl.dress, { clipIds: ids, logos });
    if (!d.ok) return d;
    if (!dressIsEmpty(d.dress)) out.dress = d.dress;
  }
  if (tl.ui) out.ui = tl.ui;
  return { ok: true, timeline: out };
}

// Logos importés utilisés par un montage (le logo « channel » est celui de la chaîne : rien à vérifier).
export const logoAssets = (tl) => (tl?.dress?.logo?.asset && tl.dress.logo.asset !== 'channel' ? [tl.dress.logo.asset] : []);

// Musiques utilisées par un montage.
export const musicAssets = (tl) => [...new Set((tl?.audio?.music || []).map((m) => m.asset))];

// Montage de départ : la vidéo entière en un seul extrait.
export const initialTimeline = (duration) => ({ v: 1, duration: round(duration), clips: [{ id: 'c1', in: 0, out: round(duration) }], ui: { zoom: 1, magnet: true } });

// Durée du montage (somme des extraits).
export const editedDuration = (tl) => round((tl?.clips || []).reduce((s, c) => s + (c.out - c.in), 0));

// Le montage diffère-t-il de la vidéo d'origine (au moins une coupe ou un déplacement) ?
export function isEdited(tl) {
  const c = tl?.clips || [];
  return !(c.length === 1 && c[0].in <= 0.05 && Math.abs(c[0].out - tl.duration) <= 0.05);
}
