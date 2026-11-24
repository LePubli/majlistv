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
export const ZONES = { custom: ['main'], slot: ['before', 'after'], home: ['main'], catalogue: ['main'], watch: ['main'], func: ['main'], global: ['main'], layout: ['topbar', 'footerTop'] };
export const HOME_PATH = '/_home'; // adresse interne de l'accueil des membres (page « home »)
// ---- Annuaire des pages du site (lot A de l'éditeur) : toute page publique peut recevoir des blocs avant / après son contenu.
// [adresse, nom, remplaçable] : « remplaçable » = page d'information dont on peut masquer le contenu d'origine pour le remplacer par ses blocs.
// Les pages fonctionnelles (connexion, paiement, compte…) gardent toujours leur contenu : on ajoute des blocs autour, on ne les remplace pas.
export const SITE_PAGES = [
  ['Pages principales', [['/', 'Accueil (visiteurs)'], ['/catalogue', 'Catalogue (page d’origine)'], ['/series', 'Séries'], ['/themes', 'Thèmes'], ['/chaines', 'Chaînes'], ['/collections', 'Collections'], ['/shorts', 'Shorts'], ['/intervenants', 'Intervenants'], ['/books', 'Ouvrages'], ['/events', 'Événements'], ['/live', 'En direct'], ['/audyn', 'Écoute (Audyn)']]],
  ['Pages « toutes les pages de ce genre »', [['/conferences/*', 'Chaque vidéo'], ['/series/*', 'Chaque série'], ['/catalogue/*', 'Chaque catégorie'], ['/chaines/*', 'Chaque chaîne'], ['/collections/*', 'Chaque collection'], ['/shorts/*', 'Chaque short'], ['/intervenants/*', 'Chaque intervenant'], ['/themes/*', 'Chaque thème'], ['/books/*', 'Chaque ouvrage'], ['/events/*', 'Chaque événement'], ['/audyn/*', 'Chaque écoute'], ['/coran/*', 'Chaque sourate'], ['/legal/*', 'Chaque page légale']]],
  ['Apprendre et pratiquer', [['/learning', 'Apprentissage'], ['/pratique', 'Pratique'], ['/priere', 'Prière'], ['/adhkar', 'Adhkar'], ['/coran', 'Coran'], ['/ramadan', 'Ramadan']]],
  ['Compte et abonnement', [['/pricing', 'Tarifs'], ['/login', 'Connexion'], ['/register', 'Inscription'], ['/forgot', 'Mot de passe oublié'], ['/account', 'Mon compte'], ['/library', 'Ma bibliothèque'], ['/lists', 'Mes listes'], ['/gift', 'Offrir un abonnement'], ['/redeem', 'Activer une carte cadeau'], ['/welcome', 'Bienvenue', true]]],
  ['Espace enfants (Kids)', [['/kids', 'Accueil Kids'], ['/kids/histoires', 'Histoires'], ['/kids/shorts', 'Shorts Kids'], ['/kids/histoires/*', 'Chaque histoire'], ['/kids/serie/*', 'Chaque série Kids'], ['/kids/univers/*', 'Chaque univers Kids'], ['/kids/watch/*', 'Chaque vidéo Kids'], ['/kids/shorts/*', 'Chaque short Kids']]],
  ['Informations', [['/legal/mentions-legales', 'Mentions légales', true], ['/legal/cgv', 'Conditions générales de vente', true], ['/legal/confidentialite', 'Confidentialité', true], ['/licences', 'Licences', true], ['/application', 'Application mobile', true]]],
];
export const WILDCARD_SLOTS = SITE_PAGES.flatMap(([, items]) => items.map(([p]) => p)).filter((p) => p.endsWith('/*'));
export const REPLACEABLE_PATHS = SITE_PAGES.flatMap(([, items]) => items.filter((i) => i[2]).map(([p]) => p)).concat(['/legal/*']);
// Zone « toutes les pages de ce genre » qui s'applique à une adresse (null si aucune). /talks/<id> et /conferences/<nom> sont la même fiche.
export function wildcardFor(path) {
  const parts = String(path).split('/');
  const seg = parts[1];
  if (!seg || !String(path).includes('/', 1)) return null;
  if (seg === 'kids' && parts[2] && WILDCARD_SLOTS.includes(`/kids/${parts[2]}/*`)) return `/kids/${parts[2]}/*`; // espace Kids : familles à deux niveaux
  if (seg === 'talks') return '/conferences/*';
  const w = `/${seg}/*`;
  return WILDCARD_SLOTS.includes(w) ? w : null;
}

// Espace Kids : seuls des blocs simples (aucune donnée du catalogue adulte, aucune vidéo externe) y sont permis.
export const KIDS_SAFE_TYPES = ['hero', 'heading', 'text', 'image', 'button', 'cards', 'quote', 'faq', 'columns', 'spacer', 'divider'];
export const isKidsPath = (path) => /^\/kids(\/|$)/.test(String(path || ''));
// Erreurs { chemin: message } si un bloc interdit sur Kids se trouve dans ce contenu (colonnes comprises).
export function kidsErrors(path, content) {
  const errors = {};
  if (!isKidsPath(path)) return errors;
  const walk = (list, at) => (list || []).forEach((b, i) => {
    if (!KIDS_SAFE_TYPES.includes(b?.type)) errors[`${at}.${i}`] = 'Sur l’espace Kids, seuls les blocs simples sont permis (titre, texte, image, bouton, cartes, colonnes…) : pas de vidéos ni de données du catalogue';
    (b?.cols || []).forEach((col, c) => walk(col, `${at}.${i}.cols.${c}`));
  });
  for (const [z, list] of Object.entries(content?.zones || {})) walk(list, `zones.${z}`);
  return errors;
}

// Page « fonction » (/_func/<page>) : seules les sections de CETTE page sont permises, plus les blocs libres.
export function funcErrors(path, content) {
  const m = String(path || '').match(/^\/_func\/([a-z0-9-]+)$/);
  if (!m) return {};
  const out = {};
  if (!FUNC_PAGES[m[1]]) { out[''] = 'Page inconnue'; return out; }
  const walk = (list, at) => (list || []).forEach((b, i) => {
    if (FUNC_TYPES.includes(b.type) && funcOwner(b.type) !== m[1]) out[`${at}.${i}.type`] = `Cette section appartient à la page « ${FUNC_PAGES[funcOwner(b.type)].label} »`;
    (b.cols || []).forEach((c, ci) => walk(c, `${at}.${i}.cols.${ci}`));
  });
  for (const [z, list] of Object.entries(content?.zones || {})) walk(list, `zones.${z}`);
  return out;
}
export const GLOBAL_PREFIX = '/_global/'; // sections globales : une page par section, adresse interne /_global/<nom>
export const WATCH_PATH = '/_watch'; // adresse interne de la fiche vidéo en blocs (page « watch »)
export const CATALOGUE_PATH = '/_catalogue'; // adresse interne du Catalogue en blocs (page « catalogue », thème Premium)
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
export const MAX_BLOCKS_PER_COLUMN = 20; // blocs dans une colonne (les colonnes s'imbriquent sur deux niveaux)
export const MAX_COLS = 4;
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
    label: 'Vidéos', hint: 'Une rangée de vidéos du catalogue (mise à jour automatique).',
    fields: [T('title', 'Titre de la rangée'), S('source', 'Quelles vidéos', [['latest', 'Les plus récentes'], ['category', 'D’une catégorie']], 'latest'),
      N('category', 'Numéro de la catégorie (Admin → Catégories)', 0, 100000, 0), S('level', 'Niveau', [['', 'Tous'], ['beginner', 'Débutant'], ['intermediate', 'Intermédiaire'], ['advanced', 'Avancé']], ''),
      N('limit', 'Nombre de vidéos', 1, 12, 4), T('moreLabel', 'Lien « Tout voir » : texte'), U('moreUrl', 'Lien « Tout voir » : adresse')],
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
    label: 'À la une + Reprendre', hint: 'Grande vidéo mise en avant (Admin → Vidéos → « À la une »), avec à droite la carte « Reprendre » de la personne connectée.',
    fields: [S('layout', 'Vidéos à la une', [['auto', 'Plusieurs, qui défilent'], ['fixed', 'Une seule, fixe']], 'auto'),
      S('resume', 'Carte « Reprendre »', [['yes', 'Oui (si une vidéo est en cours)'], ['no', 'Non']], 'yes')],
    sample: {},
  },
  mine: {
    label: 'Ma progression', hint: 'Une rangée personnelle : à réviser, quiz à rattraper, ou vidéos en cours. Invisible si la personne n’a rien dedans ou n’est pas connectée.',
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
    label: 'Bande Espace Kids', hint: 'Les dernières vidéos Kids. Invisible si l’Espace Kids est coupé (Admin → Paramètres).', fields: [], sample: {},
  },
  columns: {
    label: 'Colonnes', hint: 'Une rangée de 2 à 4 colonnes : glissez d’autres blocs dans chaque colonne. Sur téléphone, les colonnes s’empilent.',
    container: true,
    fields: [S('count', 'Nombre de colonnes', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], '2'),
      S('ratio', 'Proportions (2 colonnes)', [['', 'Égales'], ['1-2', 'Étroite puis large'], ['2-1', 'Large puis étroite']], ''),
      S('gap', 'Espace entre colonnes', [['s', 'Petit'], ['m', 'Moyen'], ['l', 'Grand']], 'm'),
      S('valign', 'Alignement vertical', [['start', 'En haut'], ['center', 'Au milieu'], ['end', 'En bas']], 'start'),
      S('stack', 'Empiler sur', [['m', 'Téléphone'], ['t', 'Téléphone et tablette']], 'm')],
    sample: { count: '2' },
  },
  // ---- Sections de l'accueil du thème Premium (étape 4) : mêmes données et même dessin que l'accueil Premium d'origine.
  // Elles ne s'affichent que sur le thème Premium (sur un autre thème, le bloc reste vide).
  pm_hero: {
    label: 'Premium : la une', hint: 'Grande image de la une (vidéos choisies dans Admin → Vidéos → « À la une », à défaut les plus récentes), avec flèches et points.',
    fields: [S('count', 'Nombre de vidéos qui défilent', [['1', '1 (fixe)'], ['3', '3'], ['5', '5']], '5')], sample: { count: '5' },
  },
  pm_universes: {
    label: 'Premium : univers (téléphone)', hint: 'Les quatre premières catégories en icônes. N’apparaît que sur téléphone.', fields: [], sample: {},
  },
  pm_continue: {
    label: 'Premium : continuer à regarder', hint: 'Vidéos commencées par la personne connectée. Invisible si elle n’en a pas.',
    fields: [T('title', 'Titre (à défaut : « Continuer à regarder »)'), N('limit', 'Nombre de vidéos', 1, 10, 10)], sample: { limit: 10 },
  },
  pm_rows: {
    label: 'Premium : rangées du catalogue', hint: 'Les rangées de l’accueil d’origine : nouveautés, « Pour vous », débutant, séries, rangées par catégorie.',
    fields: [N('max', 'Nombre de rangées', 1, 12, 12)], sample: { max: 12 },
  },
  pm_collections: {
    label: 'Premium : collections', hint: 'Cycles, séries d’un intervenant et thèmes du moment (Studio → Collections), la première en grand cadre.',
    fields: [N('limit', 'Nombre de collections', 1, 12, 12)], sample: { limit: 12 },
  },
  pm_shorts: {
    label: 'Premium : shorts', hint: 'Rangée des derniers extraits verticaux. Invisible s’il n’y en a aucun.',
    fields: [T('title', 'Titre (à défaut : « Shorts »)'), N('limit', 'Nombre de shorts', 2, 20, 10)], sample: { limit: 10 },
  },
  pm_kids: {
    label: 'Premium : encart Kids', hint: 'Dernières vidéos Kids (ou bannière illustrée s’il n’y en a pas). Invisible si l’Espace Kids est coupé.', fields: [], sample: {},
  },
  pm_learn: {
    label: 'Premium : bandeau Apprendre', hint: 'Bandeau « Mon espace Apprendre » avec la progression du parcours (formule Apprentissage). Invisible si Apprendre est coupé.', fields: [], sample: {},
  },
  pm_cat_hero: {
    label: 'Catalogue : bannière et recherche', hint: 'Bannière du Catalogue avec son titre, sa phrase et le champ de recherche.', fields: [], sample: {},
  },
  pm_cat_chips: {
    label: 'Catalogue : thèmes', hint: 'Les puces des grands thèmes (avec leurs liens vers Shorts, Collections, Chaînes…).', fields: [], sample: {},
  },
  pm_cat_rails: {
    label: 'Catalogue : rangées par thème', hint: 'Une rangée par grand thème tant qu’aucun filtre n’est choisi.', fields: [], sample: {},
  },
  pm_cat_results: {
    label: 'Catalogue : résultats et filtres', hint: 'Formats, tri, filtres et grille des vidéos. C’est le cœur du Catalogue : il suit les choix de la personne.', fields: [], sample: {},
  },
  pm_cat_cross: {
    label: 'Catalogue : liens Apprendre et Kids', hint: 'Les deux grandes cartes du bas du Catalogue (si ces rubriques sont actives).', fields: [], sample: {},
  },
  // ---- Sections de la fiche vidéo (étape 6b, page « Fiche vidéo ») : le contenu vient de la vidéo affichée ; seules la place, le style et l'affichage se règlent.
  w_stage: { label: 'Fiche : lecteur et titre', hint: 'Lien de retour, fil d’Ariane, lecteur vidéo, titre, actions (liste, partage, vitesse…). Ne le retirez pas : sans lui, plus de lecteur.', fields: [], sample: {} },
  w_notices: { label: 'Fiche : messages', hint: 'Invitation à s’abonner, bandeaux de brouillon, quiz à reprendre, transcription en cours.', fields: [], sample: {} },
  w_grid: {
    label: 'Fiche : contenu et Apprendre', hint: 'À gauche : modules, onglets (À propos, Questions, Notes), transcription. À côté : parcours Apprendre (quiz, révision, pratique) et épisodes de la série.',
    fields: [S('side', 'Place du parcours Apprendre', [['right', 'À droite'], ['left', 'À gauche'], ['below', 'Sous le contenu'], ['hidden', 'Masqué']], 'right')], sample: {},
  },
  w_next: { label: 'Fiche : à suivre', hint: 'Rangée de vidéos « À suivre » / « Dans la même veine ».', fields: [N('max', 'Nombre de vidéos', 2, 8, 8)], sample: {} },
  w_books: { label: 'Fiche : livres cités', hint: 'Les livres liés à la vidéo, quand il y en a.', fields: [], sample: {} },
  global: {
    label: 'Section globale', hint: 'Une section réutilisable : modifiée une fois, elle change partout où elle est posée. Se crée avec « Rendre globale » sur un bloc.',
    fields: [{ k: 'ref', label: 'Section globale', kind: 'slug' }], sample: {},
  },
  spacer: { label: 'Espace', hint: 'Un espace vide entre deux blocs.', fields: [N('size', 'Hauteur (px)', 8, 240, 40)], sample: {} },
  divider: { label: 'Séparateur', hint: 'Un trait fin.', fields: [], sample: {} },
};
export const TYPE_ORDER = ['hero', 'heading', 'text', 'image', 'button', 'cards', 'talks', 'quote', 'faq', 'video', 'featured', 'mine', 'channels', 'shorts', 'collections', 'dayquote', 'series', 'catrows', 'kids', 'pm_hero', 'pm_universes', 'pm_continue', 'pm_rows', 'pm_collections', 'pm_shorts', 'pm_kids', 'pm_learn', 'pm_cat_hero', 'pm_cat_chips', 'pm_cat_rails', 'pm_cat_results', 'pm_cat_cross', 'columns', 'spacer', 'divider', 'w_stage', 'w_notices', 'w_grid', 'w_next', 'w_books', 'global'];
// Types qui lisent les données du site (l'éditeur les range à part).
export const DATA_TYPES = ['featured', 'mine', 'channels', 'shorts', 'collections', 'dayquote', 'series', 'catrows', 'kids'];
// Sections de l'accueil Premium : proposées seulement quand le thème du site est Premium (l'éditeur les range à part).
export const PM_TYPES = ['pm_hero', 'pm_universes', 'pm_continue', 'pm_rows', 'pm_collections', 'pm_shorts', 'pm_kids', 'pm_learn'];
// Sections du Catalogue Premium (page « catalogue ») : même principe, rangées dans l'éditeur sous « Catalogue Premium ».
export const PM_CAT_TYPES = ['pm_cat_hero', 'pm_cat_chips', 'pm_cat_rails', 'pm_cat_results', 'pm_cat_cross'];

// Sections de la fiche vidéo : réservées à la page « Fiche vidéo » (kind watch).
export const WATCH_TYPES = ['w_stage', 'w_notices', 'w_grid', 'w_next', 'w_books'];

// ---- Pages « fonction » découpées en sections (lot C) : tarifs, compte, bibliothèque… Chaque page garde son code (paiement, lecteur, quiz…) ;
// l'éditeur peut seulement déplacer, masquer et styler ses sections, et poser des blocs libres entre elles. Une page en blocs
// (adresse interne /_func/<page>) n'existe pas tant qu'elle n'est pas publiée : la page d'origine reste en place.
// Section = [type, nom, aide, champs facultatifs : options de la fonction, écrits avec S / N / T comme les autres blocs]. Les types s'écrivent f_<page>_<section> ; l'ordre est celui de la page d'origine.
export const FUNC_PATH = '/_func/';
export const FUNC_PAGES = {
  pricing: { label: 'Tarifs', route: '/pricing', sections: [
    ['f_pricing_head', 'titre et messages', 'Lien de retour, étapes, titre, essai gratuit, messages d’annulation ou de paiement indisponible.'],
    ['f_pricing_country', 'pays', 'Choix du pays pour le tarif (seulement quand des tarifs par pays existent : Admin → Tarifs par pays).'],
    ['f_pricing_plans', 'formules et abonnement', 'Les formules (mensuelle, annuelle) avec le bouton d’abonnement ou de gestion. Ne le retirez pas : sans lui, personne ne peut s’abonner.',
      [S('tiers', 'Formules affichées', [['all', 'Toutes'], ['standard', 'Seulement Mejliss'], ['learning', 'Seulement Apprentissage']], 'all')]],
    ['f_pricing_methods', 'moyens de paiement', 'Carte, Apple Pay, Google Pay, PayPal… selon ce qui est activé.'],
    ['f_pricing_waiver', 'renoncement et connexion', 'Case « renoncement au droit de rétractation » (obligatoire avant de s’abonner) et lien « j’ai déjà un compte ». Ne le retirez pas.'],
    ['f_pricing_extras', 'cadeau et mentions', 'Bouton « Offrir un abonnement » et note de bas de page.'],
  ] },
  account: { label: 'Mon compte', route: '/account', sections: [
    ['f_account_head', 'titre', 'Fil d’Ariane et « Bonjour … ».'],
    ['f_account_profile', 'profil', 'Adresse e-mail, rôle, préférences, langue de l’interface, lien vers les réglages de prière.'],
    ['f_account_security', 'sécurité', 'Mot de passe et double authentification.'],
    ['f_account_data', 'mes données', 'Export et suppression des données personnelles (RGPD). Ne le retirez pas : c’est une obligation légale.'],
    ['f_account_billing', 'abonnement', 'État de l’abonnement et bouton de gestion.'],
    ['f_account_purchases', 'achats', 'Achats de la boutique (si la fonction est active).'],
    ['f_account_gifts', 'cartes cadeaux', 'Cartes cadeaux achetées et reçues (si la fonction est active).'],
    ['f_account_referral', 'parrainage', 'Lien et récompenses de parrainage (si la fonction est active).'],
    ['f_account_notifs', 'notifications', 'Choix des e-mails reçus.'],
  ] },
  learning: { label: 'Apprendre', route: '/learning', sections: [
    ['f_learning_head', 'titre', 'Salutation et phrase d’introduction.'],
    ['f_learning_today', 'aujourd’hui', 'Bloc « Aujourd’hui », reprise de la dernière vidéo, quiz / engagement / série du moment.'],
    ['f_learning_week', 'ma semaine', 'Planning de la semaine (à déplier).'],
    ['f_learning_next', 'pour continuer', 'Rangée de vidéos « Pour continuer à apprendre ».'],
    ['f_learning_quiz', 'quiz à passer', 'Liste des quiz en attente (si la fonction est active).'],
    ['f_learning_revision', 'révisions du jour', 'Révision espacée, rappel et e-mail quotidien (si la fonction est active).'],
    ['f_learning_cards', 'cartes mémoire', 'Cartes mémoire du jour (si la fonction est active).'],
    ['f_learning_series', 'séries et attestations', 'Séries suivies et attestations.'],
    ['f_learning_commit', 'engagements', 'Mes engagements (si la fonction est active).'],
    ['f_learning_bilan', 'bilan', 'Bilan personnel et évolution (si la fonction est active).'],
    ['f_learning_stats', 'statistiques', 'Série de jours, score, courbe et résultats récents.'],
  ] },
  series: { label: 'Fiche série', route: '/series', sections: [
    ['f_series_hero', 'bannière', 'Titre, informations, description, prérequis et bouton « Regarder / Reprendre ».'],
    ['f_series_episodes', 'saisons et épisodes', 'Choix de saison et liste des épisodes avec avancement.'],
    ['f_series_books', 'livres liés', 'Livres associés à la série (si la fonction est active).'],
  ] },
  channel: { label: 'Page chaîne', route: '/chaines', sections: [
    ['f_channel_head', 'en-tête', 'Fil d’Ariane, bannière, nom, abonnés, bouton Suivre, présentation et liens.'],
    ['f_channel_featured', 'vidéo à la une', 'Vidéo mise en avant par la chaîne (si elle en a une).'],
    ['f_channel_content', 'vidéos et séries', 'Onglets Vidéos, Shorts et Séries de la chaîne.'],
  ] },
  collection: { label: 'Page collection', route: '/collections', sections: [
    ['f_collection_head', 'titre', 'Retour, type, titre et présentation de la collection.'],
    ['f_collection_talks', 'vidéos', 'Les vidéos de la collection dans l’ordre choisi.'],
  ] },
  library: { label: 'Ma bibliothèque', route: '/library', sections: [
    ['f_library_head', 'titre', 'Fil d’Ariane et titre de la page.'],
    ['f_library_resume', 'reprendre', 'Quiz à rattraper, vidéos en cours (« Reprendre ») et séries suivies.'],
    ['f_library_list', 'ma liste', 'Favoris et « à regarder plus tard » réunis (si la fonction est active).'],
    ['f_library_lists', 'mes listes', 'Listes personnelles et partagées (si la fonction est active).'],
    ['f_library_notes', 'mes notes', 'Notes et repères pris pendant les vidéos (si la fonction est active).'],
  ] },
};
// ---- Lot X1 : blocs d'extension (installés par l'administrateur, enregistrés au démarrage et à chaque activation).
// EXT_META[type] garde la définition complète (gabarit HTML ou assemblage) ; BLOCK_TYPES[type] reçoit les champs : l'éditeur et la validation les traitent comme tous les blocs.
export const EXT_TYPES = new Set();
export const EXT_META = {};
export function registerExtBlocks(defs) {
  for (const t of [...EXT_TYPES]) { delete BLOCK_TYPES[t]; delete EXT_META[t]; }
  EXT_TYPES.clear();
  for (const [t, d] of Object.entries(defs || {})) {
    if (BLOCK_TYPES[t] && !EXT_TYPES.has(t)) continue; // jamais écraser un bloc du site
    BLOCK_TYPES[t] = { label: d.label, hint: d.hint || '', fields: d.fields || [], sample: d.sample || {}, ext: d.ext };
    EXT_META[t] = d; EXT_TYPES.add(t);
  }
}
export const FUNC_TYPES = Object.values(FUNC_PAGES).flatMap((p) => p.sections.map((x) => x[0]));
export const funcOwner = (type) => Object.keys(FUNC_PAGES).find((id) => FUNC_PAGES[id].sections.some((x) => x[0] === type)) || null;
export const funcPath = (id) => `${FUNC_PATH}${id}`;
// Sections des pages « fonction » : des blocs sans réglage propre (sauf options), le contenu vient de la page.
for (const p of Object.values(FUNC_PAGES)) {
  for (const [type, name, hint, opts] of p.sections) {
    const fields = opts || [];
    BLOCK_TYPES[type] = { label: `${p.label} : ${name}`, hint, fields, sample: {} };
  }
}

// ---- Style d'un bloc (tout est facultatif : une valeur absente = réglage du thème)
export const STYLE_ALIGN = [['', 'Selon le bloc'], ['start', 'Début'], ['center', 'Centré'], ['end', 'Fin']];
// Étape 5 : police propre à un bloc (liste = polices livrées avec le site, voir BUILTIN_FONTS de themeCss.js), survol, animation
// d'apparition et réglages propres à la tablette (T, jusqu'à 1024 px) et au téléphone (M, jusqu'à 700 px).
export const STYLE_FONTS = ['DM Sans Variable', 'Montserrat Variable', 'Fredoka Variable', 'Noto Sans Arabic Variable', 'Noto Kufi Arabic Variable',
  'Inter Variable', 'Poppins', 'Amiri', 'Marcellus', 'Playfair Display Variable', 'Lora Variable', 'Nunito Variable', 'Open Sans Variable', 'Cairo Variable', 'Tajawal', 'Système', 'Serif'];
export const STYLE_HOVER = [['', 'Aucun'], ['lift', 'Soulèvement'], ['zoom', 'Léger zoom'], ['glow', 'Halo lumineux'], ['bright', 'Éclaircissement']];
export const STYLE_ANIM = [['', 'Aucune'], ['fade', 'Fondu'], ['up', 'Montée'], ['down', 'Descente'], ['left', 'Depuis la gauche'], ['right', 'Depuis la droite'], ['zoom', 'Zoom']];
// Étape 6a : réglages par élément du bloc (titres, textes, boutons, images). Clé → [type, min, max] (nombres) ou 'color' / liste de valeurs.
export const STYLE_ELEMENTS = {
  elTitleColor: 'color', elTitleSize: ['int', 12, 120], elTitleWeight: ['list', [400, 500, 600, 700, 800]],
  elTextColor: 'color', elTextSize: ['int', 10, 40],
  elBtnBg: 'color', elBtnColor: 'color', elBtnRadius: ['int', 0, 999],
  elImgRadius: ['int', 0, 200],
};
export const PAD_DEVICE_KEYS = ['padTopT', 'padBottomT', 'padTopM', 'padBottomM'];
/** CSS de la police d'un bloc (null = celle du thème). */
export function fontCss(name) {
  if (!STYLE_FONTS.includes(name)) return null;
  if (name === 'Système') return 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  if (name === 'Serif') return 'Georgia, "Times New Roman", serif';
  return `"${name}", system-ui, sans-serif`;
}
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
    case 'slug': { // nom technique (lettres minuscules, chiffres, tirets) : référence d'une section globale
      if (v == null || v === '') return undefined;
      if (typeof v !== 'string' || v.length > 60 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) throw new Error('Nom invalide');
      return v;
    }
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
  // Référencement : image de partage (image envoyée dans les pages) et « ne pas référencer » (hors plan du site, balise noindex).
  try { const c = cleanField({ k: 'image', label: 'Image', kind: 'media' }, meta.image); if (c !== undefined) out.meta.image = c; } catch (e) { err('meta.image', e.message); }
  if (meta.noindex === true) out.meta.noindex = true;
  if (meta.hideOriginal === true) out.meta.hideOriginal = true; // lot A : masque le contenu d'origine d'une page d'information (seulement honoré sur REPLACEABLE_PATHS)
  const zones = content.zones && typeof content.zones === 'object' ? content.zones : {};
  for (const z of Object.keys(zones)) if (!ZONES[kind].includes(z)) err(`zones.${z}`, 'Zone inconnue');
  const seen = new Set();
  const cleanBlock = (b, at, depth) => {
    if (!b || typeof b !== 'object' || Array.isArray(b)) { err(at, 'Bloc invalide'); return null; }
    const def = BLOCK_TYPES[b.type];
    if (def && b.type === 'global') {
      if (kind === 'global') { err(at, 'Une section globale ne peut pas en contenir une autre'); return null; }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(b.props?.ref || '')) || String(b.props.ref).length > 60) { if (strict || b.props?.ref) err(`${at}.props.ref`, 'Choisissez une section globale'); }
    }
    if (def && WATCH_TYPES.includes(b.type) && kind !== 'watch') { err(at, 'Cette section n’existe que sur la page « Fiche vidéo »'); return null; }
    if (def && FUNC_TYPES.includes(b.type) && kind !== 'func') { err(at, `Cette section n’existe que sur la page « ${FUNC_PAGES[funcOwner(b.type)].label} »`); return null; }
    if (def?.container && depth > 1) { err(`${at}.type`, 'Les colonnes ne s’imbriquent que sur deux niveaux'); return null; }
    if (!def) { err(`${at}.type`, 'Type de bloc inconnu'); return null; }
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
      else if (k === 'bgImage') { if (!validMedia(v)) err(`${at}.style.${k}`, 'Image non valide'); else style[k] = v; }
      else if (k === 'shadow') { if (!['soft', 'strong'].includes(v)) err(`${at}.style.${k}`, 'Ombre inconnue'); else style[k] = v; }
      else if (k === 'border') { if (v !== true) err(`${at}.style.${k}`, 'Bordure non valide'); else style[k] = true; }
      else if (k === 'minHeight') { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 1200) err(`${at}.style.${k}`, 'Entier entre 0 et 1200'); else style[k] = n; }
      else if (k === 'font') { if (!STYLE_FONTS.includes(v)) err(`${at}.style.${k}`, 'Police inconnue'); else style[k] = v; }
      else if (k === 'hover') { if (!STYLE_HOVER.some(([h]) => h === v)) err(`${at}.style.${k}`, 'Effet de survol inconnu'); else style[k] = v; }
      else if (k === 'hoverBg' || k === 'hoverText') { if (!validColor(v)) err(`${at}.style.${k}`, 'Couleur non valide (code #RRGGBB ou couleur du thème)'); else style[k] = v; }
      else if (k === 'anim') { if (!STYLE_ANIM.some(([a]) => a === v)) err(`${at}.style.${k}`, 'Animation inconnue'); else style[k] = v; }
      else if (k === 'animDelay') { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 2000) err(`${at}.style.${k}`, 'Entier entre 0 et 2000 (millisecondes)'); else style[k] = n; }
      else if (PAD_DEVICE_KEYS.includes(k)) { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 240) err(`${at}.style.${k}`, 'Entier entre 0 et 240'); else style[k] = n; }
      else if (k === 'minHeightM') { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 1200) err(`${at}.style.${k}`, 'Entier entre 0 et 1200'); else style[k] = n; }
      else if (k === 'alignM') { if (!['start', 'center', 'end'].includes(v)) err(`${at}.style.${k}`, 'Alignement inconnu'); else style[k] = v; }
      else if (STYLE_ELEMENTS[k]) {
        const def2 = STYLE_ELEMENTS[k];
        if (def2 === 'color') { if (!validColor(v)) err(`${at}.style.${k}`, 'Couleur non valide (code #RRGGBB ou couleur du thème)'); else style[k] = v; }
        else if (def2[0] === 'int') { const n = Number(v); if (!Number.isInteger(n) || n < def2[1] || n > def2[2]) err(`${at}.style.${k}`, `Entier entre ${def2[1]} et ${def2[2]}`); else style[k] = n; }
        else { const n = Number(v); if (!def2[1].includes(n)) err(`${at}.style.${k}`, 'Graisse inconnue'); else style[k] = n; }
      }
      else err(`${at}.style.${k}`, 'Réglage de style inconnu');
    }
    const res = { id: b.id, type: b.type, props, show: { devices: DEVICES.filter((d) => devices.includes(d)), audience: AUDIENCES.some(([a]) => a === audience) ? audience : 'all' }, style };
    if (def.container) {
      const n = Math.max(1, Math.min(MAX_COLS, Number(props.count) || 2));
      const rawCols = Array.isArray(b.cols) ? b.cols : [];
      if (rawCols.length > MAX_COLS) err(`${at}.cols`, `${MAX_COLS} colonnes au maximum`);
      res.cols = [];
      for (let c = 0; c < n; c++) {
        const colList = Array.isArray(rawCols[c]) ? rawCols[c] : [];
        if (colList.length > MAX_BLOCKS_PER_COLUMN) { err(`${at}.cols.${c}`, `${MAX_BLOCKS_PER_COLUMN} blocs au maximum par colonne`); res.cols.push([]); continue; }
        res.cols.push(colList.map((cb, ci) => cleanBlock(cb, `${at}.cols.${c}.${ci}`, depth + 1)).filter(Boolean));
      }
      // Colonnes en trop (nombre réduit) : leurs blocs sont ajoutés à la dernière colonne gardée, rien ne se perd.
      for (let c = n; c < rawCols.length; c++) if (Array.isArray(rawCols[c])) for (const cb of rawCols[c]) { const k = cleanBlock(cb, `${at}.cols.${c}`, depth + 1); if (k && res.cols[n - 1].length < MAX_BLOCKS_PER_COLUMN) res.cols[n - 1].push(k); }
    }
    return res;
  };
  for (const z of ZONES[kind]) {
    const list = zones[z] ?? [];
    out.zones[z] = [];
    if (!Array.isArray(list)) { err(`zones.${z}`, 'Liste de blocs invalide'); continue; }
    if (list.length > MAX_BLOCKS_PER_ZONE) { err(`zones.${z}`, `${MAX_BLOCKS_PER_ZONE} blocs au maximum par zone`); continue; }
    list.forEach((b, i) => { const r = cleanBlock(b, `zones.${z}.${i}`, 0); if (r) out.zones[z].push(r); });
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

// ---- Modèle de l'accueil du thème Premium : les sections de l'accueil d'origine, dans le même ordre (accueil identique tant qu'on n'y touche pas).
export function premiumHomeTemplate() {
  const mk = (type) => newBlock(type);
  return { meta: {}, zones: { main: PM_TYPES.map(mk) } };
}

// ---- Modèle d'une page « fonction » : toutes ses sections, dans l'ordre de la page d'origine.
export function funcTemplate(id) {
  return { meta: {}, zones: { main: (FUNC_PAGES[id]?.sections || []).map(([t]) => newBlock(t)) } };
}

// ---- Modèle de la fiche vidéo : les cinq sections de la fiche d'origine, dans le même ordre.
export function watchTemplate() {
  return { meta: {}, zones: { main: WATCH_TYPES.map((t) => newBlock(t)) } };
}

// ---- Modèle du Catalogue Premium : les cinq sections du Catalogue d'origine, dans le même ordre.
export function premiumCatalogueTemplate() {
  return { meta: {}, zones: { main: PM_CAT_TYPES.map((t) => newBlock(t)) } };
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
