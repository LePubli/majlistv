// Thème Premium réglable (étape 1 de l'éditeur visuel, 24/11/2026) : palette en 10 rôles → couleurs de toutes les feuilles Premium.
//
// CE FICHIER EXISTE EN DEUX COPIES IDENTIQUES : api/src/premiumColors.js et web/lib/premiumColors.js
// (comme themeCss.js ; le test api/tests/test_theme.py vérifie qu'elles sont identiques).
//
// Principe : web/scripts/themeify-premium-css.py a remplacé chaque couleur écrite en dur des feuilles Premium par
// var(--c-RRGGBB, #RRGGBB). Ici, chaque couleur de base (premiumBases.js) est classée dans un rôle (fond, surface,
// bordure, principale, accent, texte, atténué, doré, succès, erreur) d'après sa teinte, sa saturation et sa clarté.
// Quand l'administrateur change la couleur d'un rôle, toutes les couleurs de ce rôle suivent : même écart de teinte,
// même rapport de saturation, même écart de clarté que celui qui sépare la couleur choisie de la couleur d'origine du rôle.
// Rien n'est publié pour un rôle laissé à sa valeur d'origine : l'affichage reste exactement celui d'aujourd'hui.
import { PREMIUM_BASES } from './premiumBases.js';

// Rôles, dans l'ordre d'affichage. anchor = couleur d'origine du rôle (celle de la maquette).
export const PM_ROLES = [
  { id: 'pmBg', label: 'Fond du site', anchor: '#061325' },
  { id: 'pmSurface', label: 'Panneaux, cartes et menus', anchor: '#0d233e' },
  { id: 'pmLine', label: 'Bordures et séparateurs', anchor: '#294566' },
  { id: 'pmPrimary', label: 'Couleur principale (boutons, éléments actifs)', anchor: '#087cff' },
  { id: 'pmAccent', label: 'Accent clair (survols, contours, liens)', anchor: '#34c1ff' },
  { id: 'pmText', label: 'Texte principal', anchor: '#f5f9ff' },
  { id: 'pmMuted', label: 'Texte atténué', anchor: '#9aafc9' },
  { id: 'pmGold', label: 'Doré (étiquettes, étoiles)', anchor: '#f6cb83' },
  { id: 'pmOk', label: 'Succès (vert)', anchor: '#2cce9c' },
  { id: 'pmDanger', label: 'Erreur et alerte (rouge)', anchor: '#ff6b6b' },
];

export function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const rgbToHex = (r, g, b) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

// RVB (0-255) → [teinte 0-360, saturation 0-100, clarté 0-100]
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2; const d = mx - mn;
  let h = 0; let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// Rôle d'une couleur de base (« 087cff »), ou null si elle reste fixe (noir des ombres, violets, gris moyens…).
export function roleOf(base) {
  const [r, g, b] = hexToRgb(base);
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 12) return l >= 70 ? 'pmText' : null; // blanc et gris très clairs ; le noir et les gris moyens ne bougent pas
  if (h >= 20 && h <= 65) return 'pmGold';
  if (h >= 130 && h <= 175) return 'pmOk';
  if (h <= 20 || h >= 335) return 'pmDanger';
  if (h > 175 && h <= 250) {
    if (l >= 88) return 'pmText';
    if (l >= 62 && s < 55) return 'pmMuted';
    if (s >= 55 && (l >= 62 || (h <= 205 && l >= 54))) return 'pmAccent';
    if (l <= 14) return 'pmBg';
    if (l <= 26 && s < 80) return 'pmSurface';
    if (s >= 45 && l >= 30 && l < 62) return 'pmPrimary';
    if (s >= 70 && l < 30) return 'pmPrimary';
    if (l <= 45) return 'pmLine';
  }
  return null;
}

const ROLE_OF = new Map(PREMIUM_BASES.map((b) => [b, roleOf(b)]));
export const premiumRoleOf = (base) => ROLE_OF.get(base) || null;

const ANCHOR_HSL = Object.fromEntries(PM_ROLES.map((r) => [r.id, rgbToHsl(...hexToRgb(r.anchor))]));

// Nouvelle valeur (« #rrggbb ») d'une couleur de base quand son rôle passe de sa couleur d'origine à `chosen` (« #rrggbb »).
export function shiftColor(base, role, chosen) {
  const [h0, s0, l0] = ANCHOR_HSL[role];
  const [h1, s1, l1] = rgbToHsl(...hexToRgb(chosen));
  const [h, s, l] = rgbToHsl(...hexToRgb(base));
  let nh; let ns;
  if (s < 12) { nh = h1; ns = s1; } // blanc et gris clairs du texte : prennent la teinte choisie
  else { nh = h + (h1 - h0); ns = s0 > 1 ? Math.min(100, s * (s1 / s0)) : s1; }
  const nl = Math.max(0, Math.min(100, l + (l1 - l0)));
  return rgbToHex(...hslToRgb(nh, ns, nl));
}

// Variables à publier pour des réglages modifiés : { '--c-087cff': '#1a9b5e', … }.
// `values` : réglages du thème (seuls les rôles modifiés sont présents). Un rôle absent ou égal à l'origine ne publie rien.
export function premiumOverrides(values = {}) {
  const out = {};
  for (const r of PM_ROLES) {
    const chosen = values[r.id];
    if (typeof chosen !== 'string' || !/^#[0-9a-f]{6}$/i.test(chosen) || chosen.toLowerCase() === r.anchor) continue;
    for (const base of PREMIUM_BASES) {
      if (ROLE_OF.get(base) !== r.id) continue;
      out[`--c-${base}`] = shiftColor(base, r.id, chosen.toLowerCase());
    }
  }
  return out;
}
