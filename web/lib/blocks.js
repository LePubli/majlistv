// Étape I3 — Blocs de page : types de blocs, champs, valeurs par défaut et validation.
//
// Ce fichier est en DEUX copies identiques (api/src/blocks.js et web/lib/blocks.js) : l'API s'en sert pour refuser
// tout contenu invalide, le site pour dessiner les blocs et construire l'éditeur. Un test vérifie qu'elles sont égales.
// Rien ici n'accepte de HTML ni de script : les textes sont du texte brut, les adresses sont filtrées, les couleurs
// sont des codes hexadécimaux ou des couleurs du thème.

export const LANGS = ['fr', 'en', 'ar'];
export const DEVICES = ['m', 't', 'd']; // téléphone (≤ 700 px), tablette (701–1024 px), ordinateur (≥ 1025 px)
export const DEVICE_LABELS = { m: 'Téléphone', t: 'Tablette', d: 'Ordinateur' };
export const AUDIENCES = [
  ['all', 'Tout le monde'], ['visitor', 'Visiteurs non connectés'], ['member', 'Membres connectés'],
  ['subscriber', 'Abonnés (essai ou abonnement actif)'], ['free', 'Membres sans abonnement'],
];
export const ZONES = { custom: ['main'], slot: ['before', 'after'], home: ['main'], layout: ['topbar', 'footerTop'] };
export const HOME_PATH = '/_home'; // adresse interne de l'accueil des membres (page « home »)
export const LAYOUT_PATH = '/_layout'; // adresse interne de « En-tête, menus et pied de page » (page « layout »)
export const ZONE_LABELS = { main: 'Contenu de la page', before: 'Avant le contenu de la page', after: 'Après le contenu de la page', topbar: 'Barre d’annonce (tout en haut du site, au-dessus de l’en-tête)', footerTop: 'Au-dessus du pied de page (sur toutes les pages)' };
// Couleurs du thème utilisables dans un bloc (suivent Admin → Apparence) : « @accent » devient var(--accent).
export const COLOR_REFS = {
  accent: '--accent', accentLight: '--accent-light', surface: '--surface', surface2: '--surface-2', bg: '--bg',
  text: '--text', muted: '--muted', line: '--line', onAccent: '--on-accent',
};
export const COLOR_REF_LABELS = {
  accent: 'Or (couleur principale)', accentLight: 'Or clair', surface: 'Surface', surface2: 'Surface foncée', bg: 'Fond du site',
  text: 'Texte', muted: 'Texte atténué', line: 'Bordure', onAccent: 'Texte sur l’or',
};
export const MAX_BLOCKS_PER_ZONE = 60;
export const MAX_CONTENT_BYTES = 250_000;

// ---- Champs : t = texte court par langue, tl = texte long par langue, url, media (image envoyée), sel, num, video, list
const T = (k, label, extra = {}) => ({ k, label, kind: 't', ...extra });
const TL = (k, label, extra = {}) => ({ k, label, kind: 'tl', ...extra });
const U = (k, label, extra = {}) => ({ k, label, kind: 'url', ...extra });
const M = (k, label, extra = {}) => ({ k, label, kind: 'media', ...extra });
const S = (k, label, options, def, extra = {}) => ({ k, label, kind: 'sel', options, def, ...extra });
const N = (k, label, min, max, def, extra = {}) => ({ k, label, kind: 'num', min, max, def, ...extra });
const L = (k, label, max, item, fields, extra = {}) => ({ k, label, kind: 'list', max, item, fields, ...extra });

export const BLOCK_TYPES = {
  hero: {
    label: 'Bannière', hint: 'Grand bloc d’accueil : titre, texte, boutons, image de fond.',
    fields: [T('eyebrow', 'Petit titre au-dessus'), T('title', 'Titre', { max: 200 }), TL('text', 'Texte'),
      T('btn1Label', 'Bouton 1 : texte'), U('btn1Url', 'Bouton 1 : adresse'), T('btn2Label', 'Bouton 2 : texte'), U('btn2Url', 'Bouton 2 : adresse'),
      M('image', 'Image de fond'), N('overlay', 'Assombrir l’image (%)', 0, 90, 55), S('height', 'Hauteur', [['s', 'Basse'], ['m', 'Moyenne'], ['l', 'Haute']], 'm')],
    sample: { title: { fr: 'Un titre qui donne envie' }, text: { fr: 'Une ou deux phrases pour présenter ce que l’on trouve ici.' }, btn1Label: { fr: 'Découvrir' }, btn1Url: '/' },
  },
  heading: {
    label: 'Titre', hint: 'Un titre de section, avec un sous-titre facultatif.',
    fields: [T('title', 'Titre'), T('subtitle', 'Sous-titre'), S('level', 'Niveau', [['h2', 'Grand (H2)'], ['h3', 'Moyen (H3)']], 'h2')],
    sample: { title: { fr: 'Nouveau titre' } },
  },
  text: {
    label: 'Texte', hint: 'Paragraphes. **gras**, *italique*, [lien](adresse), « - » pour une liste.',
    fields: [TL('body', 'Texte')], sample: { body: { fr: 'Écrivez votre texte ici.' } },
  },
  image: {
    label: 'Image', hint: 'Une image envoyée depuis votre ordinateur.',
    fields: [M('image', 'Image'), T('alt', 'Description (pour les malvoyants)'), T('caption', 'Légende'), U('link', 'Adresse du lien (facultatif)'),
      S('size', 'Largeur', [['full', 'Pleine'], ['wide', 'Large'], ['medium', 'Moyenne'], ['small', 'Petite']], 'wide')],
    sample: {},
  },
  button: {
    label: 'Bouton', hint: 'Un bouton qui mène vers une page.',
    fields: [T('label', 'Texte du bouton'), U('url', 'Adresse'), S('kind', 'Style', [['primary', 'Plein (or)'], ['ghost', 'Contour']], 'primary')],
    sample: { label: { fr: 'En savoir plus' }, url: '/' },
  },
  cards: {
    label: 'Cartes', hint: 'Une grille de cartes (image, titre, texte, lien).',
    fields: [S('columns', 'Colonnes (ordinateur)', [['2', '2'], ['3', '3'], ['4', '4']], '3'),
      L('items', 'Cartes', 12, 'Carte', [M('image', 'Image'), T('title', 'Titre'), TL('text', 'Texte', { max: 600 }), U('link', 'Adresse du lien')])],
    sample: { items: [{ title: { fr: 'Première carte' }, text: { fr: 'Un court texte.' } }, { title: { fr: 'Deuxième carte' }, text: { fr: 'Un court texte.' } }, { title: { fr: 'Troisième carte' }, text: { fr: 'Un court texte.' } }] },
  },
  talks: {
    label: 'Conférences', hint: 'Une rangée de conférences du catalogue (mise à jour automatique).',
    fields: [T('title', 'Titre de la rangée'), S('source', 'Quelles conférences', [['latest', 'Les plus récentes'], ['category', 'D’une catégorie']], 'latest'),
      N('category', 'Numéro de la catégorie (Admin → Catégories)', 0, 100000, 0), S('level', 'Niveau', [['', 'Tous'], ['beginner', 'Débutant'], ['intermediate', 'Intermédiaire'], ['advanced', 'Avancé']], ''),
      N('limit', 'Nombre de conférences', 1, 12, 4), T('moreLabel', 'Lien « Tout voir » : texte'), U('moreUrl', 'Lien « Tout voir » : adresse')],
    sample: { title: { fr: 'Nouveautés' } },
  },
  quote: {
    label: 'Citation', hint: 'Une phrase mise en valeur.',
    fields: [TL('text', 'Citation', { max: 600 }), T('author', 'Auteur')], sample: { text: { fr: 'Une belle phrase à retenir.' } },
  },
  faq: {
    label: 'Questions fréquentes', hint: 'Questions et réponses qui se déplient.',
    fields: [T('title', 'Titre'), L('items', 'Questions', 20, 'Question', [T('q', 'Question'), TL('a', 'Réponse', { max: 1500 })])],
    sample: { title: { fr: 'Questions fréquentes' }, items: [{ q: { fr: 'Une question ?' }, a: { fr: 'Une réponse.' } }] },
  },
  video: {
    label: 'Vidéo', hint: 'Une vidéo YouTube, Vimeo ou Dailymotion intégrée.',
    fields: [{ k: 'url', label: 'Adresse de la vidéo (YouTube, Vimeo ou Dailymotion)', kind: 'video' }, T('title', 'Titre de la vidéo')], sample: {},
  },
  // ---- Blocs « données du site » (étape H) : leur contenu vient du catalogue et du compte de la personne, il se met à jour tout seul.
  featured: {
    label: 'À la une + Reprendre', hint: 'Grande conférence mise en avant (Admin → Conférences → « À la une »), avec à droite la carte « Reprendre » de la personne connectée.',
    fields: [S('layout', 'Conférences à la une', [['auto', 'Plusieurs, qui défilent'], ['fixed', 'Une seule, fixe']], 'auto'),
      S('resume', 'Carte « Reprendre »', [['yes', 'Oui (si une conférence est en cours)'], ['no', 'Non']], 'yes')],
    sample: {},
  },
  mine: {
    label: 'Ma progression', hint: 'Une rangée personnelle : à réviser, quiz à rattraper, ou conférences en cours. Invisible si la personne n’a rien dedans ou n’est pas connectée.',
    fields: [S('what', 'Contenu', [['review', 'À réviser aujourd’hui'], ['quiz', 'Quiz à rattraper'], ['continue', 'Continuer à regarder']], 'review')],
    sample: { what: 'review' },
  },
  channels: {
    label: 'Chaînes à suivre', hint: 'Des chaînes avec leur bouton « Suivre ».',
    fields: [T('title', 'Titre (à défaut : « Chaînes à suivre »)'), N('limit', 'Nombre de chaînes', 1, 10, 5),
      S('order', 'Ordre', [['new', 'Celles que la personne ne suit pas encore, d’abord'], ['popular', 'Les plus suivies'], ['alpha', 'Ordre alphabétique']], 'new')],
    sample: {},
  },
  shorts: {
    label: 'Shorts', hint: 'Une rangée des derniers extraits verticaux publiés par les chaînes. Invisible s’il n’y en a aucun ou si la fonction Shorts est coupée.',
    fields: [T('title', 'Titre (à défaut : « Shorts »)'), N('limit', 'Nombre de shorts', 2, 20, 8)], sample: {},
  },
  collections: {
    label: 'Collections', hint: 'Cycles, séries d’un intervenant et thèmes du moment (Studio → Collections).',
    fields: [T('title', 'Titre (à défaut : « Collections »)'), N('limit', 'Nombre de collections', 1, 12, 3)], sample: {},
  },
  dayquote: {
    label: 'Citation du jour', hint: 'Le verset ou le hadith du jour (Admin → Citations), identique pour tout le monde.',
    fields: [S('style', 'Présentation', [['framed', 'Grand cadre'], ['compact', 'Compacte']], 'framed')], sample: {},
  },
  series: {
    label: 'Séries', hint: 'Une rangée de séries.',
    fields: [T('title', 'Titre (à défaut : « Séries »)'), N('limit', 'Nombre de séries', 1, 12, 8)], sample: {},
  },
  catrows: {
    label: 'Rangées par catégorie', hint: 'Une rangée par grande catégorie, les thèmes préférés de la personne connectée d’abord (« Pour vous »).',
    fields: [N('max', 'Nombre de rangées', 1, 12, 4)], sample: {},
  },
  kids: {
    label: 'Bande Espace Kids', hint: 'Les dernières conférences Kids. Invisible si l’Espace Kids est coupé (Admin → Paramètres).', fields: [], sample: {},
  },
  spacer: { label: 'Espace', hint: 'Un espace vide entre deux blocs.', fields: [N('size', 'Hauteur (px)', 8, 240, 40)], sample: {} },
  divider: { label: 'Séparateur', hint: 'Un trait fin.', fields: [], sample: {} },
};
export const TYPE_ORDER = ['hero', 'heading', 'text', 'image', 'button', 'cards', 'talks', 'quote', 'faq', 'video', 'featured', 'mine', 'channels', 'shorts', 'collections', 'dayquote', 'series', 'catrows', 'kids', 'spacer', 'divider'];
// Types qui lisent les données du site (l'éditeur les range à part).
export const DATA_TYPES = ['featured', 'mine', 'channels', 'shorts', 'collections', 'dayquote', 'series', 'catrows', 'kids'];

// ---- Style d'un bloc (tout est facultatif : une valeur absente = réglage du thème)
export const STYLE_ALIGN = [['', 'Selon le bloc'], ['start', 'Début'], ['center', 'Centré'], ['end', 'Fin']];
export const STYLE_WIDTH = [['', 'Selon le bloc'], ['full', 'Pleine largeur'], ['wide', 'Large'], ['narrow', 'Étroite']];

// ---- Contrôles de valeurs
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const URL_OK = [/^\/(?!\/)[^\s<>"'\\]*$/, /^https:\/\/[^\s<>"'\\]+$/, /^(mailto|tel):[^\s<>"'\\]+$/];
export const validUrl = (s) => typeof s === 'string' && s.length <= 500 && URL_OK.some((r) => r.test(s));
export const validMedia = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
export const validColor = (s) => typeof s === 'string' && (/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(s) || (s[0] === '@' && Object.hasOwn(COLOR_REFS, s.slice(1))));
// CSS d'une couleur de bloc.
export const colorCss = (s) => (s && s[0] === '@' ? `var(${COLOR_REFS[s.slice(1)]})` : s);

// Adresse de vidéo → { kind, id, src } (intégration sans cookies), ou null.
export function videoEmbed(url) {
  if (typeof url !== 'string') return null;
  let m = url.match(/^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#\s]*&)?v=([A-Za-z0-9_-]{11})(?:[&#][^\s]*)?$/)
    || url.match(/^https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#][^\s]*)?$/)
    || url.match(/^https:\/\/(?:www\.)?youtube\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})(?:[?#][^\s]*)?$/);
  if (m) return { kind: 'youtube', id: m[1], src: `https://www.youtube-nocookie.com/embed/${m[1]}` };
  m = url.match(/^https:\/\/(?:www\.)?vimeo\.com\/(\d{6,12})(?:[/?#][^\s]*)?$/) || url.match(/^https:\/\/player\.vimeo\.com\/video\/(\d{6,12})(?:[?#][^\s]*)?$/);
  if (m) return { kind: 'vimeo', id: m[1], src: `https://player.vimeo.com/video/${m[1]}` };
  m = url.match(/^https:\/\/(?:www\.)?dailymotion\.com\/(?:embed\/)?video\/([A-Za-z0-9]{5,16})(?:_[^/?#\s]*)?\/?(?:[?#][^\s]*)?$/) || url.match(/^https:\/\/dai\.ly\/([A-Za-z0-9]{5,16})(?:[?#][^\s]*)?$/);
  if (m) return { kind: 'dailymotion', id: m[1], src: `https://www.dailymotion.com/embed/video/${m[1]}` };
  return null;
}

// Texte d'une langue, à défaut le français, à défaut le premier texte rempli.
export function tx(v, lang) {
  if (!v || typeof v !== 'object') return '';
  return v[lang] || v.fr || v.en || v.ar || '';
}

// ---- Validation d'un champ → valeur nettoyée, ou lance Error(message)
function cleanField(f, v) {
  switch (f.kind) {
    case 't': case 'tl': {
      if (v == null) return undefined;
      if (typeof v !== 'object' || Array.isArray(v)) throw new Error('Texte invalide');
      const max = f.max || (f.kind === 't' ? 200 : 4000), out = {};
      for (const l of Object.keys(v)) {
        if (!LANGS.includes(l)) throw new Error(`Langue inconnue « ${l} »`);
        const s = v[l];
        if (typeof s !== 'string') throw new Error('Texte invalide');
        if (CTRL.test(s)) throw new Error('Caractère de contrôle interdit');
        if (s.length > max) throw new Error(`Texte trop long (${max} caractères au maximum)`);
        if (f.kind === 't' && /[\r\n]/.test(s)) throw new Error('Une seule ligne pour ce champ');
        if (s.trim()) out[l] = s;
      }
      return Object.keys(out).length ? out : undefined;
    }
    case 'url':
      if (v == null || v === '') return undefined;
      if (!validUrl(v)) throw new Error('Adresse non valide : commencez par / (page du site), https://, mailto: ou tel:');
      return v;
    case 'media':
      if (v == null || v === '') return undefined;
      if (!validMedia(v)) throw new Error('Image inconnue');
      return v;
    case 'video':
      if (v == null || v === '') return undefined;
      if (!videoEmbed(v)) throw new Error('Adresse YouTube, Vimeo ou Dailymotion attendue (https://www.youtube.com/watch?v=…, https://vimeo.com/… ou https://www.dailymotion.com/video/…)');
      return v;
    case 'sel': {
      if (v == null) return undefined;
      if (!f.options.some(([o]) => o === String(v))) throw new Error('Choix inconnu');
      return String(v);
    }
    case 'num': {
      if (v == null || v === '') return undefined;
      const n = Number(v);
      if (!Number.isInteger(n) || n < f.min || n > f.max) throw new Error(`Nombre entier entre ${f.min} et ${f.max}`);
      return n;
    }
    case 'list': {
      if (v == null) return undefined;
      if (!Array.isArray(v)) throw new Error('Liste invalide');
      if (v.length > f.max) throw new Error(`${f.max} éléments au maximum`);
      return v.map((it, i) => {
        if (!it || typeof it !== 'object' || Array.isArray(it)) throw new Error(`${f.item} ${i + 1} invalide`);
        const o = {};
        for (const sf of f.fields) {
          try { const c = cleanField(sf, it[sf.k]); if (c !== undefined) o[sf.k] = c; } catch (e) { throw new Error(`${f.item} ${i + 1} : ${sf.label} : ${e.message}`); }
        }
        return o;
      });
    }
    default: throw new Error('Champ inconnu');
  }
}

// Texte d'une langue pour les autres modules (menus) : une seule ligne, max caractères.
export const cleanShortText = (v, max = 60) => cleanField({ k: 'x', label: 'x', kind: 't', max }, v);

// ---- Validation du contenu d'une page → { value, errors } (errors : chemin → message ; vide si tout est bon).
// strict = false pour un brouillon : les champs obligatoires (image, vidéo, catégorie) peuvent encore être vides.
export function cleanContent(content, kind, strict = true) {
  const errors = {};
  const out = { meta: {}, zones: {} };
  const err = (path, msg) => { if (!errors[path]) errors[path] = msg; };
  if (!content || typeof content !== 'object' || Array.isArray(content)) return { value: out, errors: { '': 'Contenu invalide' } };
  try { const raw = JSON.stringify(content); if (raw.length > MAX_CONTENT_BYTES) err('', `Page trop volumineuse (${Math.round(MAX_CONTENT_BYTES / 1000)} Ko au maximum)`); } catch { err('', 'Contenu invalide'); }
  const meta = content.meta && typeof content.meta === 'object' ? content.meta : {};
  for (const [k, spec] of [['title', T('title', 'Titre', { max: 120 })], ['description', T('description', 'Description', { max: 300 })]]) {
    try { const c = cleanField(spec, meta[k]); if (c !== undefined) out.meta[k] = c; } catch (e) { err(`meta.${k}`, e.message); }
  }
  const zones = content.zones && typeof content.zones === 'object' ? content.zones : {};
  for (const z of Object.keys(zones)) if (!ZONES[kind].includes(z)) err(`zones.${z}`, 'Zone inconnue');
  const seen = new Set();
  for (const z of ZONES[kind]) {
    const list = zones[z] ?? [];
    out.zones[z] = [];
    if (!Array.isArray(list)) { err(`zones.${z}`, 'Liste de blocs invalide'); continue; }
    if (list.length > MAX_BLOCKS_PER_ZONE) { err(`zones.${z}`, `${MAX_BLOCKS_PER_ZONE} blocs au maximum par zone`); continue; }
    list.forEach((b, i) => {
      const at = `zones.${z}.${i}`;
      if (!b || typeof b !== 'object' || Array.isArray(b)) { err(at, 'Bloc invalide'); return; }
      const def = BLOCK_TYPES[b.type];
      if (!def) { err(`${at}.type`, 'Type de bloc inconnu'); return; }
      if (typeof b.id !== 'string' || !/^[A-Za-z0-9_-]{4,24}$/.test(b.id)) err(`${at}.id`, 'Identifiant de bloc invalide');
      else if (seen.has(b.id)) err(`${at}.id`, 'Identifiant de bloc en double');
      else seen.add(b.id);
      const props = {};
      const src = b.props && typeof b.props === 'object' && !Array.isArray(b.props) ? b.props : {};
      for (const f of def.fields) {
        try { const c = cleanField(f, src[f.k]); if (c !== undefined) props[f.k] = c; } catch (e) { err(`${at}.props.${f.k}`, e.message); }
      }
      // Champs obligatoires : exigés à la publication seulement (un brouillon peut être incomplet).
      if (strict) {
        if (b.type === 'talks' && (props.source || 'latest') === 'category' && !(props.category > 0)) err(`${at}.props.category`, 'Indiquez le numéro de la catégorie');
        if (b.type === 'image' && !props.image) err(`${at}.props.image`, 'Choisissez une image');
        if (b.type === 'video' && !props.url) err(`${at}.props.url`, 'Indiquez l’adresse de la vidéo');
      }
      // Affichage : appareils et public
      const s = b.show && typeof b.show === 'object' ? b.show : {};
      let devices = Array.isArray(s.devices) ? s.devices : DEVICES;
      if (!devices.every((d) => DEVICES.includes(d)) || !devices.length) { err(`${at}.show.devices`, 'Choisissez au moins un appareil'); devices = DEVICES; }
      const audience = s.audience ?? 'all';
      if (!AUDIENCES.some(([a]) => a === audience)) err(`${at}.show.audience`, 'Public inconnu');
      // Style
      const st = b.style && typeof b.style === 'object' && !Array.isArray(b.style) ? b.style : {};
      const style = {};
      for (const k of Object.keys(st)) {
        const v = st[k];
        if (v === '' || v == null) continue;
        if (k === 'textColor' || k === 'bgColor') { if (!validColor(v)) err(`${at}.style.${k}`, 'Couleur non valide (code #RRGGBB ou couleur du thème)'); else style[k] = v; }
        else if (k === 'align') { if (!['start', 'center', 'end'].includes(v)) err(`${at}.style.${k}`, 'Alignement inconnu'); else style[k] = v; }
        else if (k === 'maxWidth') { if (!['full', 'wide', 'narrow'].includes(v)) err(`${at}.style.${k}`, 'Largeur inconnue'); else style[k] = v; }
        else if (k === 'padTop' || k === 'padBottom') { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 240) err(`${at}.style.${k}`, 'Entier entre 0 et 240'); else style[k] = n; }
        else if (k === 'radius') { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 60) err(`${at}.style.${k}`, 'Entier entre 0 et 60'); else style[k] = n; }
        else err(`${at}.style.${k}`, 'Réglage de style inconnu');
      }
      out.zones[z].push({ id: b.id, type: b.type, props, show: { devices: DEVICES.filter((d) => devices.includes(d)), audience: AUDIENCES.some(([a]) => a === audience) ? audience : 'all' }, style });
    });
  }
  return { value: out, errors };
}

// ---- Aides pour l'éditeur (le site les utilise, l'API non)
export const newId = () => 'b' + Math.random().toString(36).slice(2, 10);
export function newBlock(type) {
  const def = BLOCK_TYPES[type];
  return { id: newId(), type, props: JSON.parse(JSON.stringify(def.sample || {})), show: { devices: [...DEVICES], audience: 'all' }, style: {} };
}
// Public d'un bloc pour un visiteur : user = null (non connecté) ou { subscriber: bool }.
export function audienceMatches(audience, user) {
  switch (audience) {
    case 'visitor': return !user;
    case 'member': return Boolean(user);
    case 'subscriber': return Boolean(user && user.subscriber);
    case 'free': return Boolean(user && !user.subscriber);
    default: return true;
  }
}
// Court résumé d'un bloc pour la liste de l'éditeur.
export function blockSummary(b, lang = 'fr') {
  const p = b.props || {};
  const first = p.title || p.label || p.body || p.text || p.eyebrow || p.caption || p.alt || (p.items && p.items[0] && (p.items[0].title || p.items[0].q));
  if (first && typeof first === 'object') return tx(first, lang).replace(/\s+/g, ' ').slice(0, 70);
  if (b.type === 'video') return p.url || '';
  if (b.type === 'spacer') return `${p.size || 40} px`;
  return '';
}

// ---- Modèle de l'accueil des membres (maquette « Main » ; puis séries, rangées par catégorie et bande Kids, qui existaient déjà)
export function homeTemplate() {
  const mk = (type, props = {}) => { const b = newBlock(type); b.props = { ...b.props, ...props }; return b; };
  return {
    meta: {},
    zones: {
      main: [
        mk('featured'),
        mk('mine', { what: 'review' }),
        mk('mine', { what: 'quiz' }),
        mk('talks', { title: { fr: 'Nouveautés', en: 'New releases', ar: 'الجديد' }, limit: 8 }),
        mk('channels'),
        mk('shorts'),
        mk('collections'),
        mk('series'),
        mk('catrows'),
        mk('kids'),
        mk('dayquote'),
      ],
    },
  };
}
