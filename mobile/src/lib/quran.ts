// Étape M2 — Coran dans l'application (mêmes données et mêmes règles que le site, étapes 45B, 45B2 et 45E).
// Fonctions pures : testées avec Node (tests/quran.test.ts).

export type SuraInfo = { n: number; en: string; ar: string; verses: number | null };
export type SurasResponse = { ready: boolean; suras: SuraInfo[] };
export type ResourceMeta = { slug: string; kind?: string; lang: string; name: string; author?: string; sourceUrl?: string; license?: string; credit?: string };
export type Verse = { aya: number; ar: string; tr?: string | null; tn?: string; ph?: string | null };
export type SuraData = {
  sura: { n: number; en: string; ar: string };
  verses: Verse[];
  text: ResourceMeta; translation: ResourceMeta | null; transliteration: ResourceMeta | null;
  translations: ResourceMeta[]; transliterations: ResourceMeta[]; tafsirs: ResourceMeta[];
  wordsMeta?: ResourceMeta; tajweedMeta?: ResourceMeta;
  words?: Record<string, string[]>;
  tajweed?: Record<string, [string, number, number][]>;
};
export type Reciter = { slug: string; name: string; urlTemplate: string; sourceUrl?: string; license?: string; credit?: string };
export type SearchHit = { sura: number; aya: number; name: string; ar: string | null; tr: string | null };
export type JuzPoint = { sura: number; aya: number; name: string; ar: string };
export type Juz = { n: number; start: JuzPoint; end: JuzPoint };
export type QuranPlan = {
  startedOn: string; day: number; todayJuz: number | null; reads: number[]; remindHour: number | null; completed: number; finished: boolean;
} | null;

/** Réglages de lecture gardés sur le téléphone (comme « qr-prefs » du site). */
export type QuranPrefs = { translation?: string; ph: boolean; tafsir: string; size: 1 | 2 | 3 | 4; reciter: string; chain: boolean; wbw: boolean; taj: boolean };
export const DEFAULT_PREFS: QuranPrefs = { ph: true, tafsir: '', size: 2, reciter: '', chain: true, wbw: false, taj: false };

/** Relit des réglages enregistrés (texte JSON ou objet) : toute valeur inattendue reprend sa valeur par défaut. */
export function readPrefs(raw: unknown): QuranPrefs {
  let o: Record<string, unknown> = {};
  try { o = typeof raw === 'string' ? JSON.parse(raw) : (raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}); } catch { o = {}; }
  if (!o || typeof o !== 'object') o = {};
  const slug = (v: unknown) => (typeof v === 'string' && /^[a-z0-9][a-z0-9_-]{0,59}$/.test(v) ? v : '');
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const size = Number(o.size);
  return {
    ...(slug(o.translation) ? { translation: slug(o.translation) } : {}),
    ph: bool(o.ph, DEFAULT_PREFS.ph),
    tafsir: slug(o.tafsir),
    size: (size === 1 || size === 2 || size === 3 || size === 4 ? size : DEFAULT_PREFS.size) as QuranPrefs['size'],
    reciter: slug(o.reciter),
    chain: bool(o.chain, DEFAULT_PREFS.chain),
    wbw: bool(o.wbw, DEFAULT_PREFS.wbw),
    taj: bool(o.taj, DEFAULT_PREFS.taj),
  };
}

/** Taille du texte arabe (mêmes paliers que le site : 1,3 / 1,7 / 2,1 / 2,6 rem). */
export const ARABIC_SIZES: Record<QuranPrefs['size'], number> = { 1: 21, 2: 27, 3: 34, 4: 42 };

/** Paramètres de GET /quran/suras/:n selon les réglages. */
export function suraQuery(locale: string, p: QuranPrefs): Record<string, string> {
  const q: Record<string, string> = { lang: locale };
  if (p.translation) q.translation = p.translation;
  if (!p.ph) q.translit = 'none';
  if (p.wbw) q.words = '1';
  if (p.taj) q.tajweed = '1';
  return q;
}

/** Adresse du fichier audio d'un verset ({sura3}/{aya3} : sur trois chiffres). Seules les adresses https sont acceptées. */
export function reciterUrl(template: string, sura: number, aya: number): string | null {
  if (typeof template !== 'string' || !/^https:\/\//i.test(template)) return null;
  const pad = (x: number) => String(x).padStart(3, '0');
  return template.replace(/\{sura3\}/g, pad(sura)).replace(/\{aya3\}/g, pad(aya)).replace(/\{sura\}/g, String(sura)).replace(/\{aya\}/g, String(aya));
}

/** Verset suivant à enchaîner, ou null (fin de sourate, enchaînement coupé). */
export function nextAya(verses: { aya: number }[], current: number, chain: boolean): number | null {
  if (!chain) return null;
  return verses.some((v) => v.aya === current + 1) ? current + 1 : null;
}

// --- Tajwid : une couleur par famille de règles (même table que le site) -----------------------------------------
type Label = { fr: string; en: string; ar: string };
export const TAJWEED: Record<string, [string, Label?]> = {
  ghunnah: ['#4ade80', { fr: 'Ghunna', en: 'Ghunna', ar: 'غنة' }],
  idghaam_ghunnah: ['#38bdf8', { fr: 'Idgham', en: 'Idgham', ar: 'إدغام' }], idghaam_wo_ghunnah: ['#38bdf8'], idghaam_mutajaanisayn: ['#38bdf8'], idghaam_mutaqaribayn: ['#38bdf8'], idghaam_shafawi: ['#38bdf8'],
  ikhfa: ['#f472b6', { fr: 'Ikhfa', en: 'Ikhfa', ar: 'إخفاء' }], ikhfa_shafawi: ['#f472b6'],
  iqlab: ['#a78bfa', { fr: 'Iqlab', en: 'Iqlab', ar: 'إقلاب' }],
  qalqalah: ['#fb923c', { fr: 'Qalqala', en: 'Qalqala', ar: 'قلقلة' }],
  madd_2: ['#facc15', { fr: 'Madd', en: 'Madd', ar: 'مد' }], madd_246: ['#facc15'], madd_6: ['#facc15'], madd_munfasil: ['#facc15'], madd_muttasil: ['#facc15'],
  hamzat_wasl: ['#9ca3af', { fr: 'Hamzat al-wasl', en: 'Hamzat al-wasl', ar: 'همزة الوصل' }], lam_shamsiyyah: ['#9ca3af'],
  silent: ['#6b7280', { fr: 'Lettre muette', en: 'Silent letter', ar: 'حرف لا يُنطق' }],
};
export const tajColor = (rule: string): string => (TAJWEED[rule] ? TAJWEED[rule][0] : '#d1d5db');

/** Légende : une entrée par couleur rencontrée dans la sourate, avec son nom dans la langue choisie. */
export function tajLegend(tajweed: SuraData['tajweed'], locale: 'fr' | 'en' | 'ar'): { color: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const marks of Object.values(tajweed || {})) for (const [r] of marks) if (!seen.has(tajColor(r))) seen.set(tajColor(r), r);
  const label = (r: string) => {
    const e = TAJWEED[r]?.[1] || Object.values(TAJWEED).find((x) => x[0] === tajColor(r) && x[1])?.[1];
    return e ? e[locale] || e.fr : r;
  };
  return [...seen].map(([color, r]) => ({ color, label: label(r) }));
}

/** Découpe le morceau [from, to) du verset (en caractères) en tronçons de même règle. */
export function paint(cps: string[], marks: [string, number, number][] | null | undefined, from = 0, to = cps.length): { text: string; rule: string | null }[] {
  const rule: (string | null)[] = new Array(cps.length).fill(null);
  for (const [r, a, b] of marks || []) for (let i = Math.max(0, a); i < Math.min(b, cps.length); i++) rule[i] = r;
  const out: { text: string; rule: string | null }[] = [];
  for (let i = from; i < to;) {
    let j = i + 1;
    while (j < to && rule[j] === rule[i]) j++;
    out.push({ text: cps.slice(i, j).join(''), rule: rule[i] });
    i = j;
  }
  return out;
}

/** Mots du verset (séparés par les espaces) : [début, fin) en caractères. */
export function tokens(cps: string[]): [number, number][] {
  const out: [number, number][] = [];
  let st = -1;
  cps.forEach((c, i) => { if (/\s/.test(c)) { if (st >= 0) out.push([st, i]); st = -1; } else if (st < 0) st = i; });
  if (st >= 0) out.push([st, cps.length]);
  return out;
}

/** Le mot à mot n'est proposé que si le nombre de mots correspond exactement (comme sur le site). */
export const wordMode = (ar: string, words?: string[] | null): boolean => Array.isArray(words) && tokens([...ar]).length === words.length;

/**
 * Nom arabe court (nom de sourate) affiché d'un seul tenant : les espaces deviennent insécables.
 * Sur Android, la largeur d'un texte en police Amiri est parfois sous-estimée : un nom de deux mots (« آل عمران ») passait
 * à la ligne et le second mot disparaissait. Un seul bloc insécable s'affiche toujours en entier.
 */
export const arLabel = (s: string): string => String(s || '').trim().replace(/\s+/g, '\u00A0');

/** Filtre de la liste des sourates : nom latin, nom arabe ou numéro. */
export function filterSuras(list: SuraInfo[], q: string): SuraInfo[] {
  const f = q.trim().toLowerCase();
  if (!f) return list;
  return list.filter((s) => s.en.toLowerCase().includes(f) || s.ar.includes(q.trim()) || String(s.n) === f);
}

/** « Al-Baqara 142 → Al-Baqara 252 » (noms arabes en arabe). */
export function juzRange(j: Juz, locale: string): string {
  const nm = (p: JuzPoint) => (locale === 'ar' ? arLabel(p.ar) : p.name);
  return `${nm(j.start)} ${j.start.aya} → ${nm(j.end)} ${j.end.aya}`;
}

/** État du programme pour l'en-tête : jour 1 à 30, dépassé, ou pas encore commencé. */
export function planPhase(plan: NonNullable<QuranPlan>): 'day' | 'over' | 'soon' {
  return plan.day >= 1 && plan.day <= 30 ? 'day' : plan.day > 30 ? 'over' : 'soon';
}

/** Numéro de sourate valide (1 à 114) ou null. */
export function suraNum(v: unknown): number | null {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= 114 ? n : null;
}
