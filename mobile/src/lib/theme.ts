// Couleurs et formes de la maquette validée : fond noir chaud, accents or, cartes arrondies, texte blanc crème.
export const colors = {
  bg: '#0B0906',
  bgDeep: '#050403',
  panel: '#15110B',
  panel2: '#1C160D',
  nav: '#0F0C07',
  border: '#2A2216',
  text: '#F3EBDD',
  text2: '#D9CFBD',
  muted: '#A89C86',
  gold: '#E6A739',
  goldLight: '#F2BE5C',
  goldTint: 'rgba(230,167,57,0.16)',
  goldLine: 'rgba(230,167,57,0.4)',
  onGold: '#120D06',
  danger: '#E0705A',
};

export const radius = { card: 14, panel: 20, pill: 999, input: 14 };

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

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
