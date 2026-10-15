// Étape I1 — Apparence réglable : liste des réglages de style et fabrication de la feuille de style du thème.
//
// CE FICHIER EXISTE EN DEUX COPIES IDENTIQUES : api/src/themeCss.js et web/lib/themeCss.js
// (l'API valide et publie, le site applique et l'administration affiche l'aperçu en direct).
// Toute modification doit être faite dans les deux ; le test api/tests/test_theme.py vérifie qu'elles sont identiques.
//
// Un thème ne stocke que ce qui change par rapport aux valeurs d'origine : { accent: '#D4A017', btnRadius: '12px', … }.
// Valeurs acceptées (rien d'autre, pour qu'aucun texte libre n'arrive dans le CSS) :
//   couleur  : #rgb, #rrggbb, #rrggbbaa, transparent, ou « @jeton » / « @jeton/NN » (reprend une couleur de base,
//              éventuellement avec NN % d'opacité : « @bg/92 » = le fond à 92 %).
//   longueur : 12px, 1.5rem (dans les limites du réglage), ou « @jeton » (reprend une longueur de base).
//   police   : le nom d'une police intégrée ou d'une police importée dans Admin → Apparence.

// Groupes, dans l'ordre d'affichage de l'administration.
export const GROUPS = [
  { id: 'base', label: 'Couleurs de base', hint: 'Les couleurs principales du site. Les autres réglages en dépendent par défaut.' },
  { id: 'type', label: 'Polices et taille du texte' },
  { id: 'shape', label: 'Arrondis' },
  { id: 'space', label: 'Espacements et largeur' },
  { id: 'header', label: 'En-tête' },
  { id: 'sidebar', label: 'Menu latéral (membre)' },
  { id: 'bottom', label: 'Barre du bas (téléphone)' },
  { id: 'studio', label: 'Menu du Studio et de l’administration' },
  { id: 'buttons', label: 'Boutons' },
  { id: 'cards', label: 'Cartes, panneaux et vignettes' },
  { id: 'badges', label: 'Badges' },
  { id: 'forms', label: 'Champs de formulaire' },
  { id: 'tabs', label: 'Onglets' },
  { id: 'footer', label: 'Pied de page' },
  { id: 'quote', label: 'Citation du jour' },
  { id: 'kids', label: 'Espace Kids', hint: 'Couleurs de l’espace enfants (page des parents, espace enfant, bande de l’accueil).' },
];

// scope : 'root' = réglage de base (sur :root) ; 'body' = réglage d'une famille d'éléments (sur body, pour qu'une
// référence « @accent » suive aussi les couleurs de l'espace Kids, qui redéfinit les couleurs de base sur son body).
// min / max : bornes des longueurs, en px (1rem = 16px).
const c = (id, cssVar, group, label, def, scope = 'root') => ({ id, var: cssVar, group, label, type: 'color', def, scope });
const l = (id, cssVar, group, label, def, min, max, scope = 'root') => ({ id, var: cssVar, group, label, type: 'length', def, min, max, scope });
const f = (id, cssVar, group, label, def, role) => ({ id, var: cssVar, group, label, type: 'font', def, role, scope: 'root' });

export const TOKENS = [
  // ---- Couleurs de base
  c('bg', '--bg', 'base', 'Fond général', '#0B0906'),
  c('surface', '--surface', 'base', 'Surface (panneaux, champs)', '#17120B'),
  c('surface2', '--surface-2', 'base', 'Surface secondaire (survol, élément actif)', '#1F1810'),
  c('line', '--line', 'base', 'Bordures', '#3A2E1E'),
  c('lineSoft', '--line-soft', 'base', 'Bordures discrètes', '#2A2116'),
  c('lineStrong', '--line-strong', 'base', 'Bordures marquées', '#5A4628'),
  c('accent', '--accent', 'base', 'Couleur principale (or)', '#E6A739'),
  c('accentHover', '--accent-hover', 'base', 'Couleur principale au survol', '#F7C863'),
  c('accentLight', '--accent-light', 'base', 'Texte doré (liens, mentions)', '#F2BE5C'),
  c('bronze', '--bronze', 'base', 'Bronze (dégradés)', '#BD7E2A'),
  c('onAccent', '--on-accent', 'base', 'Texte posé sur la couleur principale', '#120D06'),
  c('text', '--text', 'base', 'Texte principal', '#FFFFFF'),
  c('text2', '--text-2', 'base', 'Texte secondaire', '#EDE6DA'),
  c('muted', '--muted', 'base', 'Texte atténué', '#B8AC98'),
  c('placeholder', '--placeholder', 'base', 'Texte d’exemple dans les champs', '#7D715F'),
  c('danger', '--danger', 'base', 'Erreur (texte)', '#F0766B'),
  c('dangerBg', '--danger-bg', 'base', 'Bouton de suppression (fond)', '#9B2C22'),
  c('ok', '--ok', 'base', 'Succès (texte)', '#7FD18B'),

  // ---- Polices et taille
  f('fontBody', '--font-body-name', 'type', 'Police du texte', 'DM Sans Variable', 'body'),
  f('fontTitle', '--font-title-name', 'type', 'Police des titres et boutons', 'Montserrat Variable', 'title'),
  f('fontBodyAr', '--font-body-ar-name', 'type', 'Police du texte (arabe)', 'Noto Sans Arabic Variable', 'body'),
  f('fontTitleAr', '--font-title-ar-name', 'type', 'Police des titres (arabe)', 'Noto Kufi Arabic Variable', 'title'),
  f('fontKids', '--font-kids-name', 'type', 'Police de l’espace Kids', 'Fredoka Variable', 'title'),
  l('fontSize', '--font-size', 'type', 'Taille du texte courant', '16px', 13, 22),
  c('titleColor', '--title-color', 'type', 'Couleur des titres (si choisie, remplace celle de chaque bloc)', '@text', 'body'),

  // ---- Arrondis
  l('radius', '--radius', 'shape', 'Arrondi des grands blocs', '14px', 0, 40),
  l('radiusSm', '--radius-sm', 'shape', 'Arrondi des petits éléments', '8px', 0, 24),
  l('btnRadius', '--btn-radius', 'shape', 'Arrondi des boutons', '999px', 0, 999, 'body'),
  l('cardRadius', '--card-radius', 'shape', 'Arrondi des panneaux', '@radius', 0, 40, 'body'),
  l('thumbRadius', '--thumb-radius', 'shape', 'Arrondi des vignettes', '10px', 0, 40, 'body'),
  l('inputRadius', '--input-radius', 'shape', 'Arrondi des champs', '@radiusSm', 0, 999, 'body'),
  l('badgeRadius', '--badge-radius', 'shape', 'Arrondi des badges', '999px', 0, 999, 'body'),

  // ---- Espacements
  l('wrap', '--wrap', 'space', 'Largeur maximale du contenu', '1320px', 960, 1920),
  l('gutterMin', '--gutter-min', 'space', 'Marge latérale minimale (téléphone)', '16px', 8, 40),
  l('gutterMax', '--gutter-max', 'space', 'Marge latérale maximale (grand écran)', '32px', 16, 96),
  l('rowSpace', '--row-space', 'space', 'Espace sous chaque rangée de l’accueil', '14px', 0, 80),
  l('panelPad', '--panel-pad', 'space', 'Marge intérieure des panneaux', '22px', 8, 48),

  // ---- En-tête
  c('headerBg', '--header-bg', 'header', 'Fond', '@bg/92', 'body'),
  c('headerText', '--header-text', 'header', 'Liens', '@muted', 'body'),
  c('headerTextActive', '--header-text-active', 'header', 'Lien survolé ou actif', '@text', 'body'),
  c('headerBorder', '--header-border', 'header', 'Bordure du bas', '@lineSoft', 'body'),

  // ---- Menu latéral membre
  c('sidebarBg', '--sidebar-bg', 'sidebar', 'Fond', '#FFFFFF03', 'body'),
  c('sidebarText', '--sidebar-text', 'sidebar', 'Liens', '@text2', 'body'),
  c('sidebarActiveBg', '--sidebar-active-bg', 'sidebar', 'Fond du lien actif', '@surface2', 'body'),
  c('sidebarActiveText', '--sidebar-active-text', 'sidebar', 'Texte du lien actif', '@text', 'body'),
  c('sidebarMark', '--sidebar-mark', 'sidebar', 'Trait du lien actif', '@accent', 'body'),
  c('sidebarBorder', '--sidebar-border', 'sidebar', 'Bordure', '@lineSoft', 'body'),

  // ---- Barre du bas (téléphone)
  c('bottomBg', '--bottom-bg', 'bottom', 'Fond', '@bg/96', 'body'),
  c('bottomText', '--bottom-text', 'bottom', 'Liens', '@text2', 'body'),
  c('bottomActive', '--bottom-active', 'bottom', 'Lien actif', '@accent', 'body'),
  c('bottomBorder', '--bottom-border', 'bottom', 'Bordure du haut', '@line', 'body'),

  // ---- Studio et administration
  c('studioSideBg', '--studio-side-bg', 'studio', 'Fond du menu', '#100C07', 'body'),

  // ---- Boutons
  c('btnBg', '--btn-bg', 'buttons', 'Fond du bouton principal', '@accent', 'body'),
  c('btnText', '--btn-text', 'buttons', 'Texte du bouton principal', '@onAccent', 'body'),
  c('btnHoverBg', '--btn-hover-bg', 'buttons', 'Fond au survol', '@accentHover', 'body'),
  c('btnGhostText', '--btn-ghost-text', 'buttons', 'Bouton secondaire : texte', '@text', 'body'),
  c('btnGhostBorder', '--btn-ghost-border', 'buttons', 'Bouton secondaire : bordure', '@lineStrong', 'body'),

  // ---- Cartes et panneaux
  c('cardBg', '--card-bg', 'cards', 'Fond des panneaux', '@surface', 'body'),
  c('cardBorder', '--card-border', 'cards', 'Bordure des panneaux et vignettes', '@lineSoft', 'body'),
  c('cardTitle', '--card-title', 'cards', 'Titre sous une vignette', '@text', 'body'),
  c('cardMeta', '--card-meta', 'cards', 'Détails sous une vignette', '@muted', 'body'),
  c('progressBar', '--progress-bar', 'cards', 'Barre de progression', '@accent', 'body'),

  // ---- Badges
  c('badgeBg', '--badge-bg', 'badges', 'Fond (Gratuit, durée…)', '@bg/80', 'body'),
  c('badgeText', '--badge-text', 'badges', 'Texte', '@text', 'body'),
  c('badgePremiumBg', '--badge-premium-bg', 'badges', 'Fond « Premium »', '@accent', 'body'),
  c('badgePremiumText', '--badge-premium-text', 'badges', 'Texte « Premium »', '@onAccent', 'body'),

  // ---- Champs
  c('inputBg', '--input-bg', 'forms', 'Fond des champs', '@surface', 'body'),
  c('inputBgPanel', '--input-bg-panel', 'forms', 'Fond des champs dans un panneau', '@bg', 'body'),
  c('inputText', '--input-text', 'forms', 'Texte saisi', '@text', 'body'),
  c('inputBorder', '--input-border', 'forms', 'Bordure', '@line', 'body'),
  c('inputFocus', '--input-focus', 'forms', 'Bordure du champ actif', '@accent', 'body'),

  // ---- Onglets
  c('tabsText', '--tabs-text', 'tabs', 'Onglet', '@muted', 'body'),
  c('tabsActive', '--tabs-active', 'tabs', 'Onglet actif', '@text', 'body'),
  c('tabsMark', '--tabs-mark', 'tabs', 'Trait de l’onglet actif', '@accent', 'body'),

  // ---- Pied de page
  c('footerBg', '--footer-bg', 'footer', 'Fond', 'transparent', 'body'),
  c('footerText', '--footer-text', 'footer', 'Texte et liens', '@muted', 'body'),
  c('footerLinkHover', '--footer-link-hover', 'footer', 'Lien survolé', '@text', 'body'),
  c('footerBorder', '--footer-border', 'footer', 'Bordure du haut', '@lineSoft', 'body'),

  // ---- Citation du jour
  c('quoteGold', '--quote-gold', 'quote', 'Doré (étiquette, référence)', '#FFD76E'),
  c('quoteArabic', '--quote-arabic', 'quote', 'Texte arabe', '#FFE7A8'),
  c('quoteText', '--quote-text', 'quote', 'Traduction', '@text', 'body'),
  c('quoteBorder', '--quote-border', 'quote', 'Bordure', '#F0BE50B3'),
  c('quoteBgA', '--quote-bg-a', 'quote', 'Fond (début du dégradé)', '#3A2808'),
  c('quoteBgB', '--quote-bg-b', 'quote', 'Fond (fin du dégradé)', '#1E1508'),

  // ---- Kids
  c('kidsBg', '--kids-bg', 'kids', 'Fond', '#0A1038'),
  c('kidsBgTop', '--kids-bg-top', 'kids', 'Fond (haut du dégradé)', '#101A56'),
  c('kidsBgBottom', '--kids-bg-bottom', 'kids', 'Fond (bas du dégradé)', '#070B27'),
  c('kidsSurface', '--kids-surface', 'kids', 'Surface', '#16215F'),
  c('kidsSurface2', '--kids-surface-2', 'kids', 'Surface secondaire', '#1D2A78'),
  c('kidsLine', '--kids-line', 'kids', 'Bordures', '#34459F'),
  c('kidsLineSoft', '--kids-line-soft', 'kids', 'Bordures discrètes', '#2A3A8C'),
  c('kidsLineStrong', '--kids-line-strong', 'kids', 'Bordures marquées', '#4A5DC0'),
  c('kidsAccent', '--kids-accent', 'kids', 'Couleur principale', '#FFC83D'),
  c('kidsAccentHover', '--kids-accent-hover', 'kids', 'Couleur principale au survol', '#FFD76E'),
  c('kidsOnAccent', '--kids-on-accent', 'kids', 'Texte posé sur la couleur principale', '#1B1300'),
  c('kidsText', '--kids-text', 'kids', 'Texte principal', '#F6F7FF'),
  c('kidsText2', '--kids-text-2', 'kids', 'Texte secondaire', '#D6DAFF'),
  c('kidsMuted', '--kids-muted', 'kids', 'Texte atténué', '#AEB6EE'),
];

export const TOKEN_MAP = Object.fromEntries(TOKENS.map((t) => [t.id, t]));

// Polices livrées avec le site (fichiers auto-hébergés, aucun appel à Google : conforme RGPD).
// « Système » = la police de l'appareil ; « Serif » = Georgia ou équivalent.
export const BUILTIN_FONTS = ['DM Sans Variable', 'Montserrat Variable', 'Fredoka Variable', 'Noto Sans Arabic Variable', 'Noto Kufi Arabic Variable', 'Système', 'Serif'];

const FONT_NAME = /^[A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ \-]{1,39}$/;
export const validFontName = (s) => typeof s === 'string' && FONT_NAME.test(s) && !/\s{2}/.test(s);

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const REF = /^@([A-Za-z0-9]{1,32})(?:\/(\d{1,3}))?$/;
const LEN = /^(\d{1,4}(?:\.\d{1,2})?)(px|rem)$/;

// Vérifie une valeur. Renvoie '' si elle est correcte, sinon la raison (en français, affichée dans l'administration).
export function checkValue(id, value, fontNames = []) {
  const t = TOKEN_MAP[id];
  if (!t) return 'réglage inconnu';
  if (typeof value !== 'string' || value.length > 64) return 'valeur invalide';
  const ref = value.match(REF);
  if (ref) {
    const target = TOKEN_MAP[ref[1]];
    if (t.scope !== 'body') return 'un réglage de base ne peut pas reprendre un autre réglage';
    if (!target || target.scope !== 'root' || target.type !== t.type) return 'réglage repris introuvable';
    if (ref[2] !== undefined && (t.type !== 'color' || Number(ref[2]) > 100)) return 'opacité invalide (0 à 100)';
    return '';
  }
  if (t.type === 'color') return HEX.test(value) || value === 'transparent' ? '' : 'couleur attendue (#RRGGBB)';
  if (t.type === 'length') {
    const m = value.match(LEN);
    if (!m) return 'longueur attendue (ex. 12px)';
    const px = Number(m[1]) * (m[2] === 'rem' ? 16 : 1);
    return px >= t.min && px <= t.max ? '' : `entre ${t.min} et ${t.max} px`;
  }
  if (t.type === 'font') return BUILTIN_FONTS.includes(value) || fontNames.includes(value) ? '' : 'police inconnue';
  return 'valeur invalide';
}

// Valide un ensemble { id: valeur }. Renvoie { values, errors } : values ne garde que les entrées correctes
// et différentes de la valeur d'origine ; errors = { id: raison }.
export function cleanValues(input, fontNames = []) {
  const values = {}; const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { values, errors: { _: 'objet attendu' } };
  for (const [id, v] of Object.entries(input)) {
    const why = checkValue(id, v, fontNames);
    if (why) errors[id] = why;
    else if (v !== TOKEN_MAP[id].def) values[id] = v;
  }
  return { values, errors };
}

const fontStack = (name) => (name === 'Système' ? "system-ui, -apple-system, 'Segoe UI'" : name === 'Serif' ? 'Georgia, "Times New Roman", serif' : `'${name}'`);

// Valeur CSS d'un réglage (après validation).
function cssValue(t, v) {
  const ref = v.match(REF);
  if (ref) {
    const target = TOKEN_MAP[ref[1]];
    if (ref[2] !== undefined && Number(ref[2]) < 100) return `color-mix(in srgb, var(${target.var}) ${Number(ref[2])}%, transparent)`;
    return `var(${target.var})`;
  }
  if (t.type === 'font') return fontStack(v);
  return v;
}

// values : réglages modifiés (déjà validés) ; fonts : polices importées [{ id, family, weight, style, format }].
// fontUrl : adresse d'un fichier de police (le site passe par son proxy /api).
export function buildCss(values = {}, fonts = [], fontUrl = (id) => `/api/theme/fonts/${id}`) {
  const names = fonts.map((x) => x.family);
  const get = (id) => {
    const v = values[id];
    return v !== undefined && !checkValue(id, v, names) ? v : TOKEN_MAP[id].def;
  };
  const root = []; const body = [];
  for (const t of TOKENS) (t.scope === 'body' ? body : root).push(`${t.var}:${cssValue(t, get(t.id))}`);
  const q = (id) => fontStack(get(id));
  // Piles de polices complètes : la police choisie, puis la police de l'autre écriture, puis celle de l'appareil.
  root.push(`--font-body:${q('fontBody')},${q('fontBodyAr')},system-ui,'Segoe UI',sans-serif`);
  root.push(`--font-title:${q('fontTitle')},${q('fontTitleAr')},system-ui,sans-serif`);
  root.push(`--font-kids:${q('fontKids')},${q('fontTitleAr')},system-ui,sans-serif`);
  root.push(`--font-kids-ar:${q('fontBodyAr')},${q('fontKids')},system-ui,sans-serif`);
  const ar = [`--font-body:${q('fontBodyAr')},${q('fontBody')},system-ui,sans-serif`, `--font-title:${q('fontTitleAr')},${q('fontTitle')},system-ui,sans-serif`];
  const faces = fonts.map((x) => `@font-face{font-family:'${x.family}';src:url(${fontUrl(x.id)}) format('${x.format}');font-weight:${x.weight};font-style:${x.style};font-display:swap}`);
  // « < » n'apparaît jamais (valeurs filtrées) ; on le neutralise quand même : le CSS est placé dans une balise <style>.
  // Couleur des titres : appliquée seulement si elle a été choisie (sinon chaque titre garde la couleur de son bloc).
  const extra = values.titleColor !== undefined && !checkValue('titleColor', values.titleColor, names) ? ['h1,h2,h3{color:var(--title-color)}'] : [];
  return [...faces, `:root{${root.join(';')}}`, `:root:lang(ar){${ar.join(';')}}`, `body{${body.join(';')}}`, ...extra].join('\n').replace(/</g, '\\3c ');
}

// ---------------------------------------------------------------- Contraste (règles WCAG)
// Couleur réelle d'un réglage { r, g, b, a } (0-255, a 0-1), en suivant les références « @jeton/NN ».
export function resolveColor(id, values = {}) {
  const t = TOKEN_MAP[id];
  const v = values[id] !== undefined && !checkValue(id, values[id], BUILTIN_FONTS) ? values[id] : t.def;
  const ref = v.match(REF);
  if (ref) {
    const base = resolveColor(ref[1], values);
    return { ...base, a: base.a * (ref[2] !== undefined ? Number(ref[2]) / 100 : 1) };
  }
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let h = v.slice(1);
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
}

const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
const lum = ({ r, g, b }) => {
  const ch = (x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// Paires texte / fond vérifiées : [texte, fond, fond sous le fond (si transparent), libellé].
const PAIRS = [
  ['text', 'bg', null, 'Texte principal sur le fond'],
  ['text', 'surface', 'bg', 'Texte principal sur une surface'],
  ['text2', 'bg', null, 'Texte secondaire sur le fond'],
  ['muted', 'bg', null, 'Texte atténué sur le fond'],
  ['muted', 'surface', 'bg', 'Texte atténué sur une surface'],
  ['accentLight', 'bg', null, 'Texte doré sur le fond'],
  ['titleColor', 'bg', null, 'Titres sur le fond'],
  ['btnText', 'btnBg', 'bg', 'Texte du bouton principal'],
  ['btnText', 'btnHoverBg', 'bg', 'Texte du bouton au survol'],
  ['btnGhostText', 'bg', null, 'Bouton secondaire'],
  ['headerText', 'headerBg', 'bg', 'Liens de l’en-tête'],
  ['sidebarText', 'sidebarBg', 'bg', 'Liens du menu latéral'],
  ['sidebarActiveText', 'sidebarActiveBg', 'bg', 'Lien actif du menu latéral'],
  ['bottomText', 'bottomBg', 'bg', 'Liens de la barre du bas'],
  ['cardTitle', 'bg', null, 'Titres des vignettes'],
  ['cardMeta', 'bg', null, 'Détails des vignettes'],
  ['badgeText', 'badgeBg', 'surface', 'Texte des badges'],
  ['badgePremiumText', 'badgePremiumBg', 'surface', 'Badge « Premium »'],
  ['inputText', 'inputBg', 'bg', 'Texte saisi dans un champ'],
  ['placeholder', 'inputBg', 'bg', 'Texte d’exemple dans un champ', 3],
  ['tabsText', 'bg', null, 'Onglets'],
  ['footerText', 'footerBg', 'bg', 'Pied de page'],
  ['quoteText', 'quoteBgB', null, 'Traduction de la citation'],
  ['quoteArabic', 'quoteBgB', null, 'Texte arabe de la citation'],
  ['danger', 'bg', null, 'Messages d’erreur'],
  ['kidsText', 'kidsBg', null, 'Kids : texte principal'],
  ['kidsMuted', 'kidsSurface', null, 'Kids : texte atténué sur une surface'],
  ['kidsOnAccent', 'kidsAccent', null, 'Kids : texte sur la couleur principale'],
];

// Liste des paires trop peu lisibles : [{ fg, bg, label, ratio, min }]. Seuil 4,5:1 (texte courant), 3:1 pour les textes d'exemple.
export function contrastIssues(values = {}) {
  const out = [];
  for (const [fg, bgId, under, label, min = 4.5] of PAIRS) {
    let back = resolveColor(bgId, values);
    if (back.a < 1) back = over(back, under ? over(resolveColor(under, values), { r: 0, g: 0, b: 0, a: 1 }) : { r: 0, g: 0, b: 0, a: 1 });
    const front = over(resolveColor(fg, values), back);
    const ratio = Math.round(contrast(front, back) * 10) / 10;
    if (ratio < min) out.push({ fg, bg: bgId, label, ratio, min });
  }
  return out;
}
