// Menus (projet « Menus », étape 1) — emplacements, types de liens et validation d'un menu.
// Ce fichier est en DEUX copies identiques (api/src/menus.js et web/lib/menusCfg.js) : l'API refuse tout menu invalide,
// l'écran Admin → Menus s'en sert pour proposer les bons choix. Un test vérifie qu'elles sont égales.
import { NAV_ICONS, MENUS } from './navcfg.js';

export const LOCATIONS = {
  web_top: { label: 'Site — menu du haut', hint: 'Les liens de l’en-tête (ordinateur) et du menu ☰ du téléphone, pour tous les visiteurs.', children: true, max: 12, builtin: MENUS.main.builtin.map(([k]) => k) },
  web_side: { label: 'Site — menu latéral des membres', hint: 'Le menu à gauche des pages des membres connectés. Un élément « Titre de groupe » sépare les sections.', children: true, max: 40, builtin: Object.values(MENUS.side.builtin).flat().map(([k]) => k) },
  web_bar: { label: 'Site — barre du bas (téléphone)', hint: '5 liens au plus, sans sous-menu.', children: false, max: 5, builtin: MENUS.bar.builtin.map(([k]) => k), noHeading: true },
  web_footer: { label: 'Site — pied de page', hint: 'Les trois liens légaux (mentions légales, conditions de vente, confidentialité) sont obligatoires.', children: false, max: 20, builtin: MENUS.footer.builtin.map(([k]) => k), required: MENUS.footer.required },
  app_drawer: { label: 'Application — menu ☰', hint: 'Le tiroir de l’application mobile (étape 2 du projet).', children: true, max: 30, builtin: [] },
  app_tabs: { label: 'Application — onglets du bas', hint: '5 onglets au plus, sans sous-menu (étape 2 du projet).', children: false, max: 5, builtin: [], noHeading: true },
};
export const LOCATION_KEYS = Object.keys(LOCATIONS);

export const KINDS = [
  ['builtin', 'Lien d’origine du site'], ['url', 'Page du site ou adresse externe'], ['talk', 'Conférence'], ['series', 'Série'],
  ['collection', 'Collection'], ['channel', 'Chaîne'], ['page', 'Page créée dans Admin → Pages'], ['appscreen', 'Écran de l’application'], ['heading', 'Titre (sans lien)'],
];
export const KIND_KEYS = KINDS.map(([k]) => k);

// Écrans de l'application mobile (identifiants stables ; l'application les traduit en écrans, étape 2).
export const APP_SCREENS = [
  ['home', 'Accueil'], ['talks', 'Catalogue'], ['learn', 'Apprendre'], ['practice', 'Pratique'], ['library', 'Ma bibliothèque'], ['account', 'Mon compte'], ['search', 'Recherche'],
  ['shorts', 'Shorts'], ['quran', 'Coran'], ['athkar', 'Adhkar'], ['prayer', 'Prière'], ['ramadan', 'Ramadan'], ['kids', 'Mejliss Kids'],
  ['downloads', 'Téléchargements'], ['live', 'TV en direct'], ['events', 'Événements en direct'], ['series', 'Séries'], ['collections', 'Collections'], ['audyn', 'Audyn'],
];
export const AUDIENCES = ['all', 'visitor', 'member', 'manager'];
export const MAX_CHILDREN = 12;
export const MAX_NAME = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
const ITEM_ID = /^[a-z0-9_-]{1,40}$/;
const PAGE_PATH = /^\/[a-z0-9_/-]{1,98}$/;
// Adresse libre : page du site (/…) ou https:// ; mailto: et tel: acceptés (comme les liens des blocs).
const URL_OK = [/^\/(?!\/)[^\s<>"'\\]*$/, /^https:\/\/[^\s<>"'\\]+$/, /^(mailto|tel):[^\s<>"'\\]+$/];
export const validHref = (s) => typeof s === 'string' && s.length <= 500 && URL_OK.some((r) => r.test(s));

function cleanLabel(raw, required) {
  if (raw === undefined || raw === null) { if (required) throw new Error('Texte du lien obligatoire (français)'); return undefined; }
  if (typeof raw === 'string') raw = { fr: raw };
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Texte invalide');
  const out = {};
  for (const l of Object.keys(raw)) {
    if (!['fr', 'en', 'ar'].includes(l)) throw new Error('Langue inconnue dans le texte');
    const v = String(raw[l] ?? '').trim();
    if (/[\u0000-\u001F<>]/.test(v)) throw new Error('Le texte ne peut pas contenir de balises ni de caractères de contrôle');
    if (v.length > 60) throw new Error('Texte : 60 caractères au maximum');
    if (v) out[l] = v;
  }
  if (required && !out.fr) throw new Error('Texte du lien obligatoire (français)');
  return Object.keys(out).length ? out : undefined;
}

// Un élément. `depth` 0 = niveau principal, 1 = sous-menu. Lève une Error (message en français) au premier problème.
function cleanItem(it, L, depth, seen) {
  if (!it || typeof it !== 'object' || Array.isArray(it)) throw new Error('Élément invalide');
  const known = ['id', 'kind', 'ref', 'label', 'icon', 'audience', 'devices', 'newTab', 'hidden', 'children'];
  for (const k of Object.keys(it)) if (!known.includes(k)) throw new Error(`Réglage inconnu : ${k}`);
  const kind = it.kind;
  if (!KIND_KEYS.includes(kind)) throw new Error('Type de lien inconnu');
  if (kind === 'heading' && (L.noHeading)) throw new Error('Cet emplacement n’accepte pas de titre sans lien');
  if (kind === 'builtin' && !L.builtin.length) throw new Error('Les liens d’origine du site ne servent pas dans cet emplacement');
  // Un écran d'application placé dans un menu du site est simplement ignoré à l'affichage (permis, pour partager un même menu).
  const o = { id: it.id === undefined ? undefined : String(it.id), kind };
  if (!o.id || !ITEM_ID.test(o.id)) throw new Error('Identifiant d’élément invalide');
  if (seen.has(o.id)) throw new Error('Identifiant d’élément en double');
  seen.add(o.id);
  const ref = it.ref === undefined || it.ref === null ? '' : String(it.ref);
  switch (kind) {
    case 'builtin': if (!L.builtin.includes(ref)) throw new Error('Lien d’origine inconnu pour cet emplacement'); break;
    case 'url': if (!validHref(ref)) throw new Error('Adresse non valide : commencez par / (page du site), https://, mailto: ou tel:'); break;
    case 'talk': case 'series': case 'collection': if (!UUID.test(ref)) throw new Error('Contenu du catalogue invalide'); break;
    case 'channel': if (!SLUG.test(ref)) throw new Error('Chaîne invalide'); break;
    case 'page': if (!PAGE_PATH.test(ref)) throw new Error('Page invalide'); break;
    case 'appscreen': if (!APP_SCREENS.some(([k]) => k === ref)) throw new Error('Écran d’application inconnu'); break;
    case 'heading': if (ref) throw new Error('Un titre n’a pas d’adresse'); break;
  }
  if (kind !== 'heading') o.ref = ref;
  const label = cleanLabel(it.label, kind === 'url' || kind === 'heading');
  if (label) o.label = label;
  if (it.icon !== undefined && it.icon !== null && it.icon !== '') { if (!NAV_ICONS.includes(it.icon)) throw new Error('Icône inconnue'); o.icon = it.icon; }
  if (it.audience !== undefined && it.audience !== 'all') { if (!AUDIENCES.includes(it.audience)) throw new Error('Public invalide'); o.audience = it.audience; }
  if (it.devices !== undefined) {
    if (!Array.isArray(it.devices) || it.devices.some((d) => !['m', 't', 'd'].includes(d))) throw new Error('Appareils invalides');
    if (!it.devices.length) throw new Error('Choisissez au moins un appareil');
    if (it.devices.length < 3) o.devices = ['m', 't', 'd'].filter((d) => it.devices.includes(d));
  }
  if (it.newTab) { if (!['url'].includes(kind)) throw new Error('« Nouvel onglet » ne s’applique qu’aux adresses'); o.newTab = true; }
  if (it.hidden) o.hidden = true;
  if (it.children !== undefined && it.children !== null && !(Array.isArray(it.children) && !it.children.length)) {
    if (!L.children) throw new Error('Cet emplacement n’accepte pas de sous-menus');
    if (depth > 0) throw new Error('Un seul niveau de sous-menu');
    if (!Array.isArray(it.children)) throw new Error('Sous-menu invalide');
    if (it.children.length > MAX_CHILDREN) throw new Error(`${MAX_CHILDREN} éléments au maximum par sous-menu`);
    o.children = it.children.map((c, i) => { try { return cleanItem(c, L, 1, seen); } catch (e) { throw new Error(`Sous-menu, élément ${i + 1} : ${e.message}`); } });
  }
  // Un titre sans lien n'a de sens que s'il porte un sous-menu (haut, pied) ou sépare des sections (latéral, tiroir) : on le permet partout.
  return o;
}

// Liste complète d'un menu pour un emplacement. Retourne { items } ou { error }.
export function cleanMenuItems(raw, loc) {
  const L = LOCATIONS[loc];
  if (!L) return { error: 'Emplacement inconnu' };
  return clean(raw, L);
}
function clean(raw, L) {
  if (!Array.isArray(raw)) return { error: 'Liste d’éléments invalide' };
  if (raw.length > L.max) return { error: `${L.max} éléments au maximum pour cet emplacement` };
  const seen = new Set();
  const items = [];
  for (let i = 0; i < raw.length; i++) {
    try { items.push(cleanItem(raw[i], L, 0, seen)); } catch (e) { return { error: `Élément ${i + 1} : ${e.message}` }; }
  }
  if (L.required) {
    for (const key of L.required) {
      const it = items.find((x) => x.kind === 'builtin' && x.ref === key);
      if (!it) return { error: 'Les liens légaux (mentions légales, conditions de vente, confidentialité) sont obligatoires dans le pied de page' };
      if (it.hidden || it.audience || it.devices) return { error: 'Les liens légaux ne peuvent être ni masqués ni limités à un public ou un appareil' };
    }
  }
  return { items };
}

// Un menu enregistré est écrit sans emplacement précis : il est vérifié pour tous les emplacements où on veut l'affecter (voir routes/menus.js).
// Ici : validation « générale » à l'enregistrement = la plus souple (liste web_side, les éléments d'origine du site sont valides si connus quelque part).
export const ALL_BUILTIN = [...new Set(LOCATION_KEYS.flatMap((l) => LOCATIONS[l].builtin))];
export function cleanMenuGeneric(raw) {
  return clean(raw, { children: true, max: 40, builtin: ALL_BUILTIN });
}

// Un menu peut-il être affecté à cet emplacement ? Retourne null si oui, sinon le message à afficher.
export function fitsLocation(items, loc) {
  const r = cleanMenuItems(items, loc);
  return r.error || null;
}
