// Étape I4 — Navigation : éléments d'origine des menus, de l'en-tête et du pied de page, et validation des réglages.
//
// Ce fichier est en DEUX copies identiques (api/src/navcfg.js et web/lib/navcfg.js) : l'API refuse tout réglage invalide,
// le site et l'éditeur s'en servent pour dessiner les menus. Un test vérifie qu'elles sont égales.
// Principe : les éléments « d'origine » (Accueil, Séries, Mentions légales…) gardent leur adresse et leurs conditions
// (une fonction coupée dans Admin → Fonctions les fait toujours disparaître) ; on peut les réordonner, les masquer,
// renommer leur texte, et ajouter ses propres liens. Aucun réglage enregistré = le site d'origine, à l'identique.
import { DEVICES, validUrl, cleanShortText } from './blocks.js';

export const NAV_AUDIENCES = [
  ['all', 'Tout le monde'], ['visitor', 'Visiteurs non connectés'], ['member', 'Membres connectés'],
  ['manager', 'Équipe (organisateurs, modérateurs, administrateurs)'],
];
export const NAV_ICONS = ['home', 'series', 'col', 'books', 'people', 'learn', 'lib', 'bilan', 'kids', 'user', 'star', 'info', 'mail', 'link'];
export const NAV_ICON_LABELS = {
  home: 'Maison', series: 'Liste', col: 'Piles', books: 'Livre', people: 'Personnes', learn: 'Diplôme', lib: 'Signet', bilan: 'Coche',
  kids: 'Étoile (Kids)', user: 'Personne', star: 'Étoile', info: 'Information', mail: 'Enveloppe', link: 'Lien',
};
export const BAR_MAX = 5;
export const MAX_CUSTOM = 20;

// Éléments d'origine : [clé, texte par défaut (pour l'éditeur), masqué par défaut ?]
export const MENUS = {
  main: {
    label: 'Menu principal', hint: 'Les liens de l’en-tête (ordinateur) et du menu ☰ du téléphone.',
    builtin: [['home', 'Accueil'], ['series', 'Séries'], ['collections', 'Collections'], ['books', 'Ouvrages'], ['learning', 'Apprentissage'], ['library', 'Ma bibliothèque'], ['kids', 'Mejliss Kids']],
  },
  side: {
    label: 'Menu latéral des membres', hint: 'Le menu à gauche des pages pour les membres connectés (ordinateur), en quatre groupes.',
    groups: [['discover', 'Découvrir'], ['space', 'Mon espace'], ['account', 'Compte'], ['manage', 'Gérer']],
    builtin: {
      discover: [['home', 'Accueil'], ['series', 'Séries'], ['collections', 'Collections'], ['books', 'Ouvrages'], ['channels', 'Chaînes']],
      space: [['learning', 'Apprentissage'], ['library', 'Ma bibliothèque'], ['bilan', 'Mon bilan']],
      account: [['kids', 'Mejliss Kids'], ['account', 'Mon compte']],
      manage: [['studio', 'Studio'], ['admin', 'Administration']],
    },
  },
  bar: {
    label: 'Barre du bas (téléphone)', hint: `La barre de ${BAR_MAX} liens en bas de l’écran du téléphone, pour les membres connectés.`,
    builtin: [['home', 'Accueil'], ['series', 'Séries'], ['learning', 'Apprentissage'], ['library', 'Ma bibliothèque'], ['account', 'Mon compte'],
      ['collections', 'Collections', true], ['books', 'Ouvrages', true], ['channels', 'Chaînes', true], ['kids', 'Mejliss Kids', true]],
  },
  footer: {
    label: 'Liens du pied de page', hint: 'Les trois liens légaux sont obligatoires : on peut les déplacer ou les renommer, pas les retirer.',
    builtin: [['channels', 'Chaînes'], ['mentions', 'Mentions légales'], ['cgv', 'Conditions générales de vente'], ['privacy', 'Politique de confidentialité']],
    required: ['mentions', 'cgv', 'privacy'],
  },
};
export const HEADER = {
  zones: [['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']],
  elements: [['logo', 'Logo'], ['menu', 'Menu principal (liens)'], ['search', 'Loupe de recherche'], ['lang', 'Choix de la langue'], ['account', 'Connexion / compte'], ['cta', 'Bouton « S’abonner »']],
  required: ['logo', 'account'], custom: [['link', 'Lien'], ['button', 'Bouton']],
};
export const FOOTER = {
  zones: [['left', 'Gauche'], ['right', 'Droite']],
  elements: [['brand', 'Marque et copyright'], ['links', 'Liens du pied de page']],
  required: ['links'], custom: [['text', 'Texte'], ['link', 'Lien']],
};

export const defaultHeader = () => ({
  left: [{ id: 'h-logo', key: 'logo' }],
  center: [{ id: 'h-menu', key: 'menu' }],
  right: [{ id: 'h-search', key: 'search' }, { id: 'h-lang', key: 'lang', show: { devices: [...DEVICES], audience: 'visitor' } }, { id: 'h-account', key: 'account' }, { id: 'h-cta', key: 'cta' }],
});
export const defaultFooter = () => ({ left: [{ id: 'f-brand', key: 'brand' }], right: [{ id: 'f-links', key: 'links' }] });

// Liste complète pour l'éditeur : les éléments enregistrés, puis les éléments d'origine qui manquent (nouvelle fonction, première modification).
export function materializeList(list, builtin) {
  const out = Array.isArray(list) ? list.map((x) => ({ ...x })) : [];
  const have = new Set(out.filter((x) => x.key).map((x) => x.key));
  for (const [key, , hid] of builtin) if (!have.has(key)) out.push({ id: `m-${key}`, key, ...(hid ? { hidden: true } : {}) });
  return out;
}
export function materializeNav(nav) {
  const n = nav && typeof nav === 'object' ? nav : {};
  const m = n.menus || {};
  const side = { titles: { ...(m.side?.titles || {}) } };
  for (const [g] of MENUS.side.groups) side[g] = materializeList(m.side?.[g], MENUS.side.builtin[g]);
  return {
    menus: { main: materializeList(m.main, MENUS.main.builtin), side, bar: materializeList(m.bar, MENUS.bar.builtin), footer: materializeList(m.footer, MENUS.footer.builtin) },
    header: n.header ? { left: n.header.left || [], center: n.header.center || [], right: n.header.right || [] } : defaultHeader(),
    footer: n.footer ? { left: n.footer.left || [], right: n.footer.right || [] } : defaultFooter(),
  };
}
export const newNavId = () => 'n' + Math.random().toString(36).slice(2, 9);

// ---- Validation
const ID = /^[A-Za-z0-9_-]{3,24}$/;
const ITEM_KEYS = ['id', 'key', 'type', 'label', 'url', 'icon', 'hidden', 'show', 'buttonKind'];

function cleanShow(s, at, err) {
  const sh = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  let devices = Array.isArray(sh.devices) ? sh.devices : DEVICES;
  if (!devices.length || !devices.every((d) => DEVICES.includes(d))) { err(`${at}.show.devices`, 'Choisissez au moins un appareil'); devices = DEVICES; }
  let audience = sh.audience ?? 'all';
  if (!NAV_AUDIENCES.some(([a]) => a === audience)) { err(`${at}.show.audience`, 'Public inconnu'); audience = 'all'; }
  return { devices: DEVICES.filter((d) => devices.includes(d)), audience };
}

// Un élément de liste. ctx : { at, keys (clés d'origine permises), types (types personnalisés permis), icons, seenIds, seenKeys, strict, err }
function cleanItem(it, ctx) {
  const { at, err } = ctx;
  if (!it || typeof it !== 'object' || Array.isArray(it)) { err(at, 'Élément invalide'); return null; }
  for (const k of Object.keys(it)) if (!ITEM_KEYS.includes(k)) err(`${at}.${k}`, 'Réglage inconnu');
  if (typeof it.id !== 'string' || !ID.test(it.id)) err(`${at}.id`, 'Identifiant invalide');
  else if (ctx.seenIds.has(it.id)) err(`${at}.id`, 'Identifiant en double');
  else ctx.seenIds.add(it.id);
  const o = { id: String(it.id) };
  if (it.key !== undefined) {
    if (!ctx.keys.has(it.key)) { err(`${at}.key`, 'Élément inconnu'); return null; }
    if (ctx.seenKeys.has(it.key)) { err(`${at}.key`, 'Cet élément est déjà dans la liste'); return null; }
    ctx.seenKeys.add(it.key);
    o.key = it.key;
    for (const k of ['type', 'url', 'icon', 'buttonKind']) if (it[k] !== undefined) err(`${at}.${k}`, 'Réglage inutile pour un élément d’origine');
  } else {
    const type = it.type ?? ctx.types[0];
    if (!ctx.types.includes(type)) { err(`${at}.type`, 'Type inconnu'); return null; }
    o.type = type;
    if (type !== 'text') {
      if (it.url === undefined || it.url === '') { if (ctx.strict) err(`${at}.url`, 'Indiquez l’adresse du lien'); }
      else if (!validUrl(it.url)) err(`${at}.url`, 'Adresse non valide : commencez par / (page du site), https://, mailto: ou tel:');
      else o.url = it.url;
    } else if (it.url !== undefined) err(`${at}.url`, 'Un texte n’a pas d’adresse');
    if (it.icon !== undefined && it.icon !== '') {
      if (!ctx.icons) err(`${at}.icon`, 'Pas d’icône ici');
      else if (!NAV_ICONS.includes(it.icon)) err(`${at}.icon`, 'Icône inconnue');
      else o.icon = it.icon;
    }
    if (type === 'button' && it.buttonKind !== undefined) {
      if (!['primary', 'ghost'].includes(it.buttonKind)) err(`${at}.buttonKind`, 'Style de bouton inconnu'); else o.buttonKind = it.buttonKind;
    }
  }
  if (it.label !== undefined) {
    try { const l = cleanShortText(it.label, 60); if (l) o.label = l; } catch (e) { err(`${at}.label`, e.message); }
  }
  if (!o.key && !o.label && ctx.strict) err(`${at}.label`, 'Indiquez le texte');
  if (it.hidden !== undefined) { if (typeof it.hidden !== 'boolean') err(`${at}.hidden`, 'Valeur invalide'); else if (it.hidden) o.hidden = true; }
  if (it.show !== undefined) o.show = cleanShow(it.show, at, err);
  return o;
}

function cleanList(list, at, ctx0, errs, extra = {}) {
  if (list === undefined) return undefined;
  if (!Array.isArray(list)) { errs(at, 'Liste invalide'); return undefined; }
  if (list.length > 40) { errs(at, '40 éléments au maximum'); return undefined; }
  const ctx = { ...ctx0, seenKeys: new Set(), seenIds: extra.seenIds || new Set(), err: errs };
  const out = [];
  list.forEach((it, i) => { const c = cleanItem(it, { ...ctx, at: `${at}.${i}` }); if (c) out.push(c); });
  if (out.filter((x) => !x.key).length > MAX_CUSTOM) errs(at, `${MAX_CUSTOM} liens personnalisés au maximum`);
  return out;
}

// raw : réglages enregistrés → { value, errors }. strict = false pour un brouillon (champs obligatoires encore vides permis).
export function cleanNav(raw, strict = true) {
  const errors = {};
  const err = (p, m) => { if (!errors[p]) errors[p] = m; };
  if (raw === undefined || raw === null) return { value: undefined, errors };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { value: undefined, errors: { nav: 'Réglages de navigation invalides' } };
  for (const k of Object.keys(raw)) if (!['menus', 'header', 'footer'].includes(k)) err(`nav.${k}`, 'Réglage inconnu');
  const out = {};

  // Menus
  if (raw.menus !== undefined) {
    const mr = raw.menus;
    if (!mr || typeof mr !== 'object' || Array.isArray(mr)) err('nav.menus', 'Menus invalides');
    else {
      const menus = {};
      for (const k of Object.keys(mr)) if (!Object.hasOwn(MENUS, k)) err(`nav.menus.${k}`, 'Menu inconnu');
      const base = (def) => ({ keys: new Set(def.map(([k]) => k)), types: ['link'], icons: true, strict });
      menus.main = cleanList(mr.main, 'nav.menus.main', { ...base(MENUS.main.builtin), icons: false }, err);
      menus.bar = cleanList(mr.bar, 'nav.menus.bar', base(MENUS.bar.builtin), err);
      if (menus.bar && strict && menus.bar.filter((x) => !x.hidden).length > BAR_MAX) err('nav.menus.bar', `${BAR_MAX} liens affichés au plus : masquez-en pour garder ${BAR_MAX}`);
      menus.footer = cleanList(mr.footer, 'nav.menus.footer', { ...base(MENUS.footer.builtin), icons: false }, err);
      if (menus.footer && strict) {
        for (const key of MENUS.footer.required) {
          const it = menus.footer.find((x) => x.key === key);
          if (!it) err('nav.menus.footer', 'Les liens légaux (mentions légales, conditions de vente, confidentialité) sont obligatoires');
          else if (it.hidden) err('nav.menus.footer', 'Les liens légaux ne peuvent pas être masqués');
        }
      }
      if (mr.side !== undefined) {
        const sr = mr.side;
        if (!sr || typeof sr !== 'object' || Array.isArray(sr)) err('nav.menus.side', 'Menu invalide');
        else {
          const side = {}; const groups = MENUS.side.groups.map(([g]) => g);
          const seenIds = new Set();
          for (const k of Object.keys(sr)) if (!groups.includes(k) && k !== 'titles') err(`nav.menus.side.${k}`, 'Groupe inconnu');
          for (const g of groups) {
            const l = cleanList(sr[g], `nav.menus.side.${g}`, { keys: new Set(MENUS.side.builtin[g].map(([k]) => k)), types: ['link'], icons: true, strict }, err, { seenIds });
            if (l) side[g] = l;
          }
          if (sr.titles !== undefined) {
            if (!sr.titles || typeof sr.titles !== 'object' || Array.isArray(sr.titles)) err('nav.menus.side.titles', 'Titres invalides');
            else {
              side.titles = {};
              for (const g of Object.keys(sr.titles)) {
                if (!groups.includes(g)) { err(`nav.menus.side.titles.${g}`, 'Groupe inconnu'); continue; }
                try { const v = cleanShortText(sr.titles[g], 40); if (v) side.titles[g] = v; } catch (e) { err(`nav.menus.side.titles.${g}`, e.message); }
              }
            }
          }
          menus.side = side;
        }
      }
      for (const k of Object.keys(menus)) if (menus[k] === undefined) delete menus[k];
      if (Object.keys(menus).length) out.menus = menus;
    }
  }

  // En-tête et pied de page : trois / deux zones, chaque élément une seule fois sur l'ensemble des zones.
  for (const [name, def] of [['header', HEADER], ['footer', FOOTER]]) {
    if (raw[name] === undefined) continue;
    const zr = raw[name];
    if (!zr || typeof zr !== 'object' || Array.isArray(zr)) { err(`nav.${name}`, 'Réglages invalides'); continue; }
    const zones = def.zones.map(([z]) => z);
    for (const k of Object.keys(zr)) if (!zones.includes(k)) err(`nav.${name}.${k}`, 'Zone inconnue');
    const seenIds = new Set(); const seenKeys = new Set(); const res = {};
    for (const z of zones) {
      const l = cleanList(zr[z] ?? [], `nav.${name}.${z}`, { keys: new Set(def.elements.map(([k]) => k)), types: def.custom.map(([t]) => t), icons: false, strict }, err, { seenIds });
      // « seenKeys » est propre à chaque liste dans cleanList : on revérifie ici l'unicité sur l'ensemble des zones
      res[z] = (l || []).filter((x) => { if (!x.key) return true; if (seenKeys.has(x.key)) { err(`nav.${name}.${z}`, 'Un élément ne peut être placé qu’une seule fois'); return false; } seenKeys.add(x.key); return true; });
    }
    if (strict) for (const key of def.required) if (!seenKeys.has(key)) err(`nav.${name}`, `L’élément « ${def.elements.find(([k]) => k === key)[1]} » est obligatoire`);
    out[name] = res;
  }
  return { value: Object.keys(out).length ? out : undefined, errors };
}
