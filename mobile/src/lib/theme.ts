// Couleurs et formes de la maquette validée : fond noir chaud, accents or, cartes arrondies, texte blanc crème.
// Deux thèmes, comme sur le site : « classique » (noir et or) et « nuit » (« Nuit et or » : bleu de nuit, or, titres Marcellus / Amiri).
// Le thème est choisi par l'administrateur (Admin → Paramètres → Thème visuel par défaut) et lu dans /config.
// Les écrans lisent `colors` au moment de l'affichage : applySkin() remplace les valeurs avant de (re)dessiner l'application.
export type Skin = 'classique' | 'nuit';

const CLASSIQUE = {
  bg: '#0B0906',
  bgDeep: '#050403',
  panel: '#17120B',
  panel2: '#1F1810',
  nav: '#0F0C07',
  border: '#3A2E1E',
  borderSoft: '#2A2116',
  borderStrong: '#5A4628',
  text: '#FFFFFF', // texte en blanc pur (maquette validée)
  text2: '#EDE6DA',
  muted: '#B8AC98',
  placeholder: '#7D715F',
  gold: '#E6A739',
  goldLight: '#F2BE5C',
  goldHover: '#F7C863',
  bronze: '#BD7E2A',
  goldTint: 'rgba(230,167,57,0.14)',
  goldLine: 'rgba(230,167,57,0.4)',
  onGold: '#120D06',
  danger: '#F0766B',
  ok: '#7FD18B',
  // Citation du jour (mêmes valeurs que le site)
  quoteGold: '#FFD76E',
  quoteArabic: '#FFE7A8',
  quoteBgA: '#3A2808',
  quoteBgB: '#1E1508',
};

/** « Nuit et or » : mêmes valeurs que web/app/skin-nuit.css. */
const NUIT: typeof CLASSIQUE = {
  bg: '#0E1430',
  bgDeep: '#0A0F26',
  panel: '#131B3D',
  panel2: '#1A2552',
  nav: '#0A0F26',
  border: 'rgba(230,167,57,0.32)', // filets or des cartes (comme --card-border du site)
  borderSoft: '#1F2B5C',
  borderStrong: 'rgba(230,167,57,0.6)',
  text: '#FFFFFF',
  text2: '#E6EAF8',
  muted: '#BAC2E3',
  placeholder: '#8691BE',
  gold: '#E6A739',
  goldLight: '#F2C76E',
  goldHover: '#F2C76E',
  bronze: '#B07A1E',
  goldTint: 'rgba(230,167,57,0.14)',
  goldLine: 'rgba(230,167,57,0.4)',
  onGold: '#120D06',
  danger: '#F0766B',
  ok: '#7FD18B',
  quoteGold: '#F2C76E',
  quoteArabic: '#F6DCA0',
  quoteBgA: '#1A2552',
  quoteBgB: '#131B3D',
};

export const colors: typeof CLASSIQUE = { ...CLASSIQUE };

export const radius = { card: 14, thumb: 10, panel: 20, pill: 999, input: 12 };

/** Polices de la PWA : Montserrat (titres), DM Sans (texte), Noto Kufi / Noto Sans Arabic (arabe). */
export const fonts = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_700Bold',
  bold: 'DMSans_700Bold',
  extrabold: 'Montserrat_800ExtraBold',
};

let current: Skin = 'classique';
/** Thème en cours. */
export const currentSkin = (): Skin => current;
/** Valeur reçue (réglage du site, cache) → thème connu ; tout le reste : classique. */
export const pickSkin = (v: unknown): Skin => (v === 'nuit' ? 'nuit' : 'classique');

/** Applique un thème : couleurs, police des titres et dégradés de repli. Renvoie vrai si quelque chose a changé. */
export function applySkin(skin: Skin): boolean {
  if (skin === current) return false;
  current = skin;
  Object.assign(colors, skin === 'nuit' ? NUIT : CLASSIQUE);
  fonts.extrabold = skin === 'nuit' ? 'Marcellus_400Regular' : 'Montserrat_800ExtraBold';
  posterGradients.splice(0, posterGradients.length, ...(skin === 'nuit' ? NUIT_GRADIENTS : CLASSIQUE_GRADIENTS));
  return true;
}

export type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

/** Famille à utiliser : titres (gras forts ou gros texte) en Montserrat / Noto Kufi, le reste en DM Sans / Noto Sans Arabic. */
export function fontFamily(weight: Weight, size: number, rtl: boolean): string {
  const title = weight === 'extrabold' || (weight === 'bold' && size >= 17);
  // « Nuit et or » : titres en Marcellus (latin) et Amiri (arabe), comme sur le site.
  if (title && current === 'nuit') return rtl ? 'Amiri_700Bold' : 'Marcellus_400Regular';
  if (rtl) {
    if (title) return weight === 'extrabold' ? 'NotoKufiArabic_800ExtraBold' : 'NotoKufiArabic_700Bold';
    return weight === 'regular' ? 'NotoSansArabic_400Regular' : weight === 'medium' ? 'NotoSansArabic_500Medium' : 'NotoSansArabic_700Bold';
  }
  if (title) return weight === 'extrabold' ? 'Montserrat_800ExtraBold' : 'Montserrat_700Bold';
  return weight === 'regular' ? 'DMSans_400Regular' : weight === 'medium' ? 'DMSans_500Medium' : 'DMSans_700Bold';
}

/** Dégradés de repli quand une conférence n'a pas de miniature. */
const CLASSIQUE_GRADIENTS: [string, string][] = [
  ['#3B2A12', '#A9772A'],
  ['#1F2A2C', '#4C8A86'],
  ['#2C1F2E', '#8A5B8F'],
  ['#2A2A14', '#8C8A33'],
];
const NUIT_GRADIENTS: [string, string][] = [
  ['#131B3D', '#B07A1E'],
  ['#0E1430', '#3B4D8E'],
  ['#1A2552', '#E6A739'],
  ['#0A0F26', '#2B3B78'],
];
export const posterGradients: [string, string][] = [...CLASSIQUE_GRADIENTS];
export const gradientFor = (id: string): [string, string] => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return posterGradients[h % posterGradients.length];
};

/** Fond du thème en cours, avec transparence (voiles sur la vidéo, barres translucides). */
const RGB: Record<Skin, { bg: string; deep: string }> = { classique: { bg: '11,9,6', deep: '5,4,3' }, nuit: { bg: '14,20,48', deep: '10,15,38' } };
export const veil = (alpha: number): string => `rgba(${RGB[current].bg},${alpha})`;
export const veilDeep = (alpha: number): string => `rgba(${RGB[current].deep},${alpha})`;
