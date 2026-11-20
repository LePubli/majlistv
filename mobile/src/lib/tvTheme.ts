// Refonte TV (étape TV-R) : couleurs « bleu nuit » de l'application TV (maquette validée du 19/11) et tailles à l'échelle de l'écran.
// Les écrans TV donnent leurs tailles en pixels de la maquette 1920 × 1080 ; u() les convertit en points de l'écran
// (0,5 sur une télé 1080p ordinaire ; plus petit si l'écran est plus bas, pour que rien ne soit coupé).
import { useWindowDimensions } from 'react-native';
import { TV_RAIL, tvScale } from './tvRules';

export const tvc = {
  bg: '#061022',
  rail: '#040B18',
  panel: '#0D1E35',
  line: '#24406A',
  text: '#FFFFFF',
  text2: '#C9D6E8',
  muted: '#8FA9CC',
  faint: '#4A6488',
  accent: '#1677E8',
  accentLight: '#45A3FF',
  halo: 'rgba(69,163,255,0.55)',
  glass: 'rgba(255,255,255,0.14)',
  glassSoft: 'rgba(255,255,255,0.08)',
  live: '#E5394A',
  ok: '#2BD4B4',
  kids: '#FFC83D',
  onLight: '#061022',
} as const;

/** Fond translucide (voiles sur les images). */
export const tvVeil = (a: number) => `rgba(6,16,34,${a})`;

export function useTv() {
  const { width, height } = useWindowDimensions();
  const k = tvScale(width, height);
  const u = (px: number) => Math.round(px * k);
  return { u, k, W: width, H: height, rail: u(TV_RAIL), gutter: u(96) };
}

/** Dégradés bleus des vignettes sans image (à la place des dégradés or du téléphone). */
const TV_GRADS: [string, string][] = [['#0B2C66', '#1677E8'], ['#0D1E35', '#2A4B7C'], ['#14204A', '#3D7FD6'], ['#0B3B44', '#1B6E80']];
export function tvGradient(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TV_GRADS[h % TV_GRADS.length];
}
