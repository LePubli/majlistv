// Couleurs et formes de la maquette validée : fond noir chaud, accents or, cartes arrondies, texte blanc crème.
export const colors = {
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

export const radius = { card: 14, thumb: 10, panel: 20, pill: 999, input: 12 };

/** Polices de la PWA : Montserrat (titres), DM Sans (texte), Noto Kufi / Noto Sans Arabic (arabe). */
export const fonts = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_700Bold',
  bold: 'DMSans_700Bold',
  extrabold: 'Montserrat_800ExtraBold',
};

export type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

/** Famille à utiliser : titres (gras forts ou gros texte) en Montserrat / Noto Kufi, le reste en DM Sans / Noto Sans Arabic. */
export function fontFamily(weight: Weight, size: number, rtl: boolean): string {
  const title = weight === 'extrabold' || (weight === 'bold' && size >= 17);
  if (rtl) {
    if (title) return weight === 'extrabold' ? 'NotoKufiArabic_800ExtraBold' : 'NotoKufiArabic_700Bold';
    return weight === 'regular' ? 'NotoSansArabic_400Regular' : weight === 'medium' ? 'NotoSansArabic_500Medium' : 'NotoSansArabic_700Bold';
  }
  if (title) return weight === 'extrabold' ? 'Montserrat_800ExtraBold' : 'Montserrat_700Bold';
  return weight === 'regular' ? 'DMSans_400Regular' : weight === 'medium' ? 'DMSans_500Medium' : 'DMSans_700Bold';
}

/** Dégradés de repli quand une conférence n'a pas de miniature. */
export const posterGradients: [string, string][] = [
  ['#3B2A12', '#A9772A'],
  ['#1F2A2C', '#4C8A86'],
  ['#2C1F2E', '#8A5B8F'],
  ['#2A2A14', '#8C8A33'],
];
export const gradientFor = (id: string): [string, string] => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return posterGradients[h % posterGradients.length];
};
