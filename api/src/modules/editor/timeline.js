// Module « Éditeur de montage » — le document de montage (« timeline »), version 1 (étape E1).
//
//   {
//     "v": 1,
//     "duration": 2892.4,                       durée de la vidéo source (secondes)
//     "clips": [ { "id": "c1", "in": 0, "out": 1140.2 }, … ]
//                                               piste Vidéo : extraits de la source, joués l'un après l'autre, sans trou.
//                                               La voix d'origine, la voix française et les sous-titres suivent ces extraits
//                                               (« pistes liées ») : couper ou déplacer la vidéo les coupe ou les déplace aussi.
//     "ui": { "zoom": 1, "magnet": true }      préférences d'affichage du projet (facultatif)
//   }
//
// Les étapes suivantes ajoutent leurs pistes à ce même document : audio (E2), titres, logo, intro, fin, transitions (E3).
// Le moteur de rendu de l'étape E4 (FFmpeg piloté par notre code, choisi en E0) lira ce document.
import { z } from 'zod';

export const MIN_CLIP = 0.2;   // durée minimale d'un extrait (secondes)
export const MAX_CLIPS = 2000;

const num = z.number().finite();
const clip = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/, 'Identifiant d’extrait invalide'),
  in: num.min(0),
  out: num.min(0),
});

export const timelineSchema = z.object({
  v: z.literal(1, { errorMap: () => ({ message: 'Version du montage inconnue' }) }),
  duration: num.positive(),
  clips: z.array(clip).min(1, 'Le montage doit garder au moins un extrait').max(MAX_CLIPS),
  ui: z.object({ zoom: num.min(0.05).max(400).optional(), magnet: z.boolean().optional() }).optional(),
});

const round = (x) => Math.round(x * 1000) / 1000;

// Vérifie le montage par rapport à la vraie durée de la vidéo. Renvoie { ok, timeline } ou { ok: false, error }.
export function checkTimeline(input, sourceDuration) {
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
  return {
    ok: true,
    timeline: {
      v: 1, duration: round(dur),
      clips: tl.clips.map((c) => ({ id: c.id, in: round(c.in), out: round(Math.min(c.out, dur)) })),
      ...(tl.ui ? { ui: tl.ui } : {}),
    },
  };
}

// Montage de départ : la vidéo entière en un seul extrait.
export const initialTimeline = (duration) => ({ v: 1, duration: round(duration), clips: [{ id: 'c1', in: 0, out: round(duration) }], ui: { zoom: 1, magnet: true } });

// Durée du montage (somme des extraits).
export const editedDuration = (tl) => round((tl?.clips || []).reduce((s, c) => s + (c.out - c.in), 0));

// Le montage diffère-t-il de la vidéo d'origine (au moins une coupe ou un déplacement) ?
export function isEdited(tl) {
  const c = tl?.clips || [];
  return !(c.length === 1 && c[0].in <= 0.05 && Math.abs(c[0].out - tl.duration) <= 0.05);
}
