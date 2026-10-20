// Module « Éditeur de montage » — étape E5b : extraits courts verticaux 9:16. Fonctions pures (testées par api/tests/test_short.mjs).
//
// Un extrait = un passage [from, to] de la vidéo d'origine (en secondes), recadré en 9:16 : le cadre vertical a la hauteur de l'image
// et se place horizontalement selon cropX (0 = tout à gauche, 50 = au centre, 100 = tout à droite).
// Sous-titres : mots regroupés en petits groupes (5 mots au plus) pour les lire d'un coup d'œil sur un téléphone.
// Titre : affiché en haut pendant les premières secondes.
import { z } from 'zod';
import { manualSchema } from './follow.js';

export const MIN_SHORT = 1;       // secondes
export const MAX_SHORT = 180;     // 3 minutes : limite des formats courts des réseaux
export const MAX_SHORTS = 30;     // par conférence
export const TITLE_SECS = 4;      // durée d'affichage du titre
export const CAPTION_WORDS = 5;
export const CAPTION_CHARS = 34;
const r3 = (x) => Math.round(x * 1000) / 1000;

export const shortConfigSchema = z.object({
  cropX: z.number().finite().min(0, 'Position du cadre : entre 0 et 100').max(100, 'Position du cadre : entre 0 et 100').default(50),
  captions: z.boolean().default(true),
  lang: z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, 'Langue invalide').nullable().default(null),
  dub: z.boolean().default(false),
  showTitle: z.boolean().default(true),
  // Registre n°33 : le mot prononcé s'affiche en or dans les sous-titres courts (les mots sont déjà horodatés).
  karaoke: z.boolean().default(true),
  // Étape E5d : le cadre suit le visage (analyse faite par le service de transcription) ; corrections à la main (temps de la vidéo d'origine).
  follow: z.boolean().default(false),
  manual: manualSchema,
});
export const shortDefaults = (c) => shortConfigSchema.parse(c || {});

// Vérifie le passage choisi. Renvoie { ok, from, to } ou { ok: false, error }.
export function checkPassage(from, to, duration) {
  const f = Number(from); const t = Number(to);
  if (!Number.isFinite(f) || !Number.isFinite(t)) return { ok: false, error: 'Début ou fin invalide' };
  if (f < 0) return { ok: false, error: 'Le début ne peut pas être avant le début de la vidéo' };
  if (Number(duration) > 0 && t > Number(duration) + 0.05) return { ok: false, error: 'La fin dépasse la fin de la vidéo' };
  if (t - f < MIN_SHORT - 1e-6) return { ok: false, error: `Un extrait doit durer au moins ${MIN_SHORT} s` };
  if (t - f > MAX_SHORT + 1e-6) return { ok: false, error: `Un extrait court dure ${MAX_SHORT / 60} minutes au plus` };
  return { ok: true, from: r3(f), to: r3(Math.min(t, Number(duration) > 0 ? Number(duration) : t)) };
}

// Montage d'un extrait : un seul extrait ; le son suit les réglages (voix française seulement si demandée, niveau visé −14 LUFS).
export function shortTimeline(from, to, duration, cfg) {
  return {
    v: 1, duration: r3(duration), clips: [{ id: 'c1', in: from, out: to },],
    audio: { orig: { gainDb: 0, mute: false, joinFadeMs: 30, denoise: 'off' }, dub: { use: Boolean(cfg.dub), gainDb: 0, duck: 15, fade: 0.5 }, music: [], loudness: { on: true, target: -14 } },
  };
}

// Sous-titres courts. words : [{ s, e, w }] (temps source, ordre croissant) ; renvoie [{ s, e, text }] dans [from, to].
// Coupures : 5 mots au plus, 34 caractères au plus, fin de phrase (. ? ! … ؟ ۔), pause de plus de 0,8 s, virgule après 3 mots.
const END = /[.?!…؟۔]["»”')\]]*$/;
const SOFT = /[,;،؛:]["»”')\]]*$/;
export function chunkCaptions(words, from, to) {
  const inside = words.filter((x) => (x.s + x.e) / 2 >= from && (x.s + x.e) / 2 < to && String(x.w || '').trim());
  const chunks = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    chunks.push({ s: Math.max(from, cur[0].s), e: Math.min(to, cur[cur.length - 1].e + 0.2), text: cur.map((x) => String(x.w).trim()).join(' '),
      words: cur.map((x) => ({ s: r3(x.s), e: r3(x.e), w: String(x.w).trim() })) }); // mots horodatés (mot dit en couleur)
    cur = [];
  };
  inside.forEach((w, i) => {
    const txt = String(w.w).trim();
    const len = cur.reduce((n, x) => n + String(x.w).trim().length + 1, 0);
    if (cur.length && (cur.length >= CAPTION_WORDS || len + txt.length > CAPTION_CHARS)) flush();
    cur.push(w);
    const next = inside[i + 1];
    const last = w.e;
    if (END.test(txt) || (SOFT.test(txt) && cur.length >= 3) || (next && next.s - last > 0.8)) flush();
  });
  flush();
  // Chaque groupe reste affiché jusqu'au suivant s'il le suit de près (pas de clignotement), au moins 0,5 s.
  for (let i = 0; i < chunks.length; i += 1) {
    const c = chunks[i]; const n = chunks[i + 1];
    if (n && n.s - c.e < 0.35) c.e = n.s;
    if (c.e - c.s < 0.5) c.e = Math.min(n ? n.s : to, c.s + 0.5);
    if (n && c.e > n.s) c.e = n.s;
    c.s = r3(c.s); c.e = r3(Math.max(c.e, c.s + 0.05));
  }
  return chunks.filter((c) => c.e > c.s);
}

// --- Fichier de textes (ASS) 1080 × 1920 ----------------------------------------------------------------------------------------
const GOLD = '&H0039A7E6&'; // or du site (#E6A739), en BGR
const ts = (x) => { const c = Math.max(0, Math.round(x * 100)); return `${Math.floor(c / 360000)}:${String(Math.floor(c / 6000) % 60).padStart(2, '0')}:${String(Math.floor(c / 100) % 60).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`; };
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\r?\n/g, '\\N');
export const SHORT_W = 1080; export const SHORT_H = 1920;

// chunks : sous-titres en temps de l'extrait (0 = début) ; title : texte du début ; total : durée de l'extrait.
export function buildShortAss({ chunks = [], title = '', total = 0, karaoke = false } = {}) {
  const lines = [];
  const t = esc(String(title).trim());
  if (t) lines.push(`Dialogue: 2,${ts(0.2)},${ts(Math.min(TITLE_SECS, Math.max(1, total - 0.2)))},ShortTitle,,0,0,0,,{\\fad(300,400)}${t}`);
  for (const c of chunks) {
    const ws = karaoke && Array.isArray(c.words) ? c.words.filter((w) => w.w) : [];
    if (ws.length < 2) { lines.push(`Dialogue: 1,${ts(c.s)},${ts(c.e)},ShortCap,,0,0,0,,${esc(c.text)}`); continue; }
    // Registre n°33 : une ligne par mot ; le mot en cours est en or, les autres en blanc (même texte, même place : pas de saut).
    const line = (k) => ws.map((w, i) => (i === k ? `{\\c&H39A7E6&}${esc(w.w)}{\\c&HFFFFFF&}` : esc(w.w))).join(' ');
    const start = Math.max(c.s, ws[0].s);
    if (start - c.s > 0.02) lines.push(`Dialogue: 1,${ts(c.s)},${ts(start)},ShortCap,,0,0,0,,${line(-1)}`);
    ws.forEach((w, k) => {
      const a = k === 0 ? start : Math.max(c.s, w.s);
      const b = k + 1 < ws.length ? Math.max(a + 0.02, Math.min(c.e, ws[k + 1].s)) : c.e;
      if (b > a) lines.push(`Dialogue: 1,${ts(a)},${ts(b)},ShortCap,,0,0,0,,${line(k)}`);
    });
  }
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${SHORT_W}
PlayResY: ${SHORT_H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ShortCap,DejaVu Sans,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,6,2,2,90,90,420,1
Style: ShortTitle,DejaVu Sans,60,${GOLD},${GOLD},&H78060D12,&H78060D12,-1,0,0,0,100,100,0,0,3,22,0,8,90,90,230,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join('\n')}
`;
}

// Cadre vertical : filtre FFmpeg (jeton @W@ / @H@ remplacés par le worker). Le cadre garde toute la hauteur de la source.
export const cropFilter = (cropX) => `crop=w='trunc(min(iw,ih*9/16)/2)*2':h=ih:x='(iw-ow)*${r3(cropX / 100)}':y=0,scale=@W@:@H@:force_original_aspect_ratio=increase,crop=@W@:@H@`;

// Largeur du cadre vertical en part de la largeur de la source (16:9 → 31,6 %).
export const frameShare = (srcW, srcH) => Math.min(1, (srcH * 9 / 16) / srcW);
