// Lot X1 — Extensions déclaratives Mejliss (.zip) : lecture et validation. Aucune base de données ici : le même code sert à l'API (installation)
// et au validateur en ligne de commande du kit (api/ext-kit/validate.mjs).
//
// Une extension AJOUTE des briques au site, sans aucun code exécutable :
//   • des blocs « gabarit » (HTML restreint + champs modifiables dans l'éditeur, voir extTemplate.js) ;
//   • des blocs « composés » (assemblage de blocs existants, données du catalogue comprises, avec des champs liés) ;
//   • des réglages (Admin → Extensions), des fonctions activables, des textes FR / EN / AR ;
//   • une feuille de style limitée à ses propres classes (.x-<id>…).
// Elle ne remplace ni ne modifie le code du site : elle utilise les mêmes contrôles que l'éditeur.
import { readZip } from './zip.js';
import { sanitizeCss, MAX_CSS } from './themePack.js';
import { cleanContent, BLOCK_TYPES, TYPE_ORDER, PM_TYPES, PM_CAT_TYPES, WATCH_TYPES, validUrl, LANGS, EXT_TYPES } from './blocks.js';
import { compileTemplate, expandComposed, TPL_TAGS, TPL_ATTRS } from './extTemplate.js';

export const EXT_SCHEMA = 1;
export const MAX_EXT_JSON = 400 * 1024;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const KEY = /^[a-z][A-Za-z0-9]{0,30}$/;
const NAME = /^[a-z][a-z0-9_]{1,29}$/;
const SKEY = /^[A-Za-z][A-Za-z0-9_]{0,38}$/;
const TEXT_EXT = ['json', 'css', 'md', 'txt', 'html'];
const ext = (n) => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');
export const FIELD_KINDS = ['t', 'tl', 'url', 'media', 'sel', 'num', 'list'];
export const SETTING_TYPES = ['text', 'number', 'bool', 'select', 'color', 'url'];
// Blocs du site utilisables dans un bloc composé (ni sections de pages, ni blocs d'un thème précis, ni autres extensions).
export const COMPOSABLE = TYPE_ORDER.filter((t) => !PM_TYPES.includes(t) && !PM_CAT_TYPES.includes(t) && !WATCH_TYPES.includes(t) && !EXT_TYPES.has(t) && t !== 'global');
export const typeName = (extId, name) => `x_${extId.replace(/-/g, '_')}_${name}`;
export const cssPrefix = (extId) => `x-${extId}`;

// Texte par langue : { fr, en?, ar? } ou une simple chaîne (= français).
function langText(v, max, at, fail, required = true) {
  if (v == null) { if (required) fail(`${at} : texte obligatoire`); return null; }
  const o = typeof v === 'string' ? { fr: v } : v;
  if (!o || typeof o !== 'object' || Array.isArray(o)) { fail(`${at} : texte (ou { fr, en, ar }) attendu`); return null; }
  const out = {};
  for (const [l, s] of Object.entries(o)) {
    if (!LANGS.includes(l)) { fail(`${at} : langue inconnue « ${l} » (fr, en, ar)`); continue; }
    if (typeof s !== 'string' || s.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) { fail(`${at}.${l} : texte de ${max} caractères au plus, sans caractère de contrôle`); continue; }
    if (s.trim()) out[l] = s;
  }
  if (required && !out.fr) fail(`${at} : le français (fr) est obligatoire`);
  return out;
}

// Un champ d'un bloc → même description que dans BLOCK_TYPES (l'éditeur et la validation du site l'utilisent tels quels).
function buildField(spec, at, fail, depth = 0, used = new Set()) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) { fail(`${at} : objet attendu`); return null; }
  const allowed = ['k', 'kind', 'label', 'max', 'options', 'def', 'min', 'item', 'fields'];
  for (const k of Object.keys(spec)) if (!allowed.includes(k)) fail(`${at} : clé inconnue « ${k} » (permises : ${allowed.join(', ')})`);
  if (typeof spec.k !== 'string' || !KEY.test(spec.k)) { fail(`${at}.k : lettre minuscule puis lettres/chiffres (31 caractères au plus), ex. « title »`); return null; }
  if (['count', 'ref'].includes(spec.k)) { fail(`${at}.k : « ${spec.k} » est réservé`); return null; }
  if (used.has(spec.k)) { fail(`${at}.k : « ${spec.k} » est en double`); return null; }
  used.add(spec.k);
  if (!FIELD_KINDS.includes(spec.kind)) { fail(`${at}.kind : ${FIELD_KINDS.join(', ')}`); return null; }
  if (typeof spec.label !== 'string' || !spec.label.trim() || spec.label.length > 80) { fail(`${at}.label : intitulé affiché dans l'éditeur (80 caractères au plus)`); return null; }
  const f = { k: spec.k, label: spec.label.trim(), kind: spec.kind };
  if (spec.kind === 't' || spec.kind === 'tl') {
    if (spec.max != null) { if (!Number.isInteger(spec.max) || spec.max < 1 || spec.max > (spec.kind === 't' ? 300 : 4000)) fail(`${at}.max : 1 à ${spec.kind === 't' ? 300 : 4000}`); else f.max = spec.max; }
  } else if (spec.kind === 'sel') {
    if (!Array.isArray(spec.options) || spec.options.length < 2 || spec.options.length > 20 || !spec.options.every((o) => Array.isArray(o) && o.length === 2 && typeof o[0] === 'string' && /^[A-Za-z0-9_-]{0,30}$/.test(o[0]) && typeof o[1] === 'string' && o[1].length <= 60)) { fail(`${at}.options : 2 à 20 choix [ ["valeur", "Libellé"], … ] (valeur : lettres, chiffres, - _)`); return null; }
    f.options = spec.options.map((o) => [o[0], o[1]]);
    f.def = spec.def ?? f.options[0][0];
    if (!f.options.some(([o]) => o === f.def)) fail(`${at}.def : doit être l'une des valeurs de options`);
  } else if (spec.kind === 'num') {
    if (!Number.isInteger(spec.min) || !Number.isInteger(spec.max) || spec.min > spec.max || spec.min < -100000 || spec.max > 100000) { fail(`${at} : min et max (entiers, min ≤ max) obligatoires`); return null; }
    f.min = spec.min; f.max = spec.max; f.def = spec.def ?? spec.min;
    if (!Number.isInteger(f.def) || f.def < f.min || f.def > f.max) fail(`${at}.def : entier entre min et max`);
  } else if (spec.kind === 'list') {
    if (depth > 0) { fail(`${at} : une liste ne peut pas contenir une autre liste`); return null; }
    if (!Number.isInteger(spec.max) || spec.max < 1 || spec.max > 30) { fail(`${at}.max : nombre d'éléments (1 à 30)`); return null; }
    if (typeof spec.item !== 'string' || !spec.item.trim() || spec.item.length > 40) { fail(`${at}.item : nom d'un élément (« Carte », « Question »…)`); return null; }
    if (!Array.isArray(spec.fields) || !spec.fields.length || spec.fields.length > 10) { fail(`${at}.fields : 1 à 10 champs par élément`); return null; }
    const u = new Set();
    f.max = spec.max; f.item = spec.item.trim();
    f.fields = spec.fields.map((x, i) => buildField(x, `${at}.fields[${i}]`, fail, depth + 1, u)).filter(Boolean);
  }
  if (spec.kind !== 'sel' && spec.kind !== 'num' && spec.def != null) fail(`${at}.def : seulement pour les champs « sel » et « num »`);
  return f;
}
function buildFields(list, at, fail) {
  if (!Array.isArray(list) || list.length > 24) { fail(`${at} : liste de 24 champs au plus`); return []; }
  const used = new Set();
  return list.map((x, i) => buildField(x, `${at}[${i}]`, fail, 0, used)).filter(Boolean);
}

// Feuille de style : filtrée comme celle d'un thème, puis chaque sélecteur doit contenir une classe .x-<id> (une extension ne peut pas restyler le reste du site).
function scopeErrors(css, extId) {
  const pre = `.${cssPrefix(extId)}`; const errs = [];
  const isOk = (sel) => sel.split(',').every((s) => new RegExp(`\\.${cssPrefix(extId)}(?![A-Za-z0-9_])|\\.${cssPrefix(extId)}-`).test(s));
  const walk = (s, kf) => {
    let i = 0;
    while (i < s.length) {
      const o = s.indexOf('{', i);
      if (o < 0) break;
      const prelude = s.slice(i, o).trim();
      // fin du bloc correspondant
      let d = 1; let j = o + 1;
      while (j < s.length && d > 0) { if (s[j] === '{') d++; else if (s[j] === '}') d--; j++; }
      const body = s.slice(o + 1, j - 1);
      if (prelude.startsWith('@')) {
        const at = prelude.match(/^@([a-z-]+)/i)?.[1]?.toLowerCase();
        if (at === 'media' || at === 'supports') walk(body, false);
        else if (at === 'keyframes') { if (!new RegExp(`^@keyframes\\s+${cssPrefix(extId)}-[A-Za-z0-9_-]+$`).test(prelude)) errs.push(`@keyframes : le nom doit commencer par « ${cssPrefix(extId)}- »`); }
        else errs.push(`@${at} interdit dans une extension (permis : @media, @supports, @keyframes)`);
      } else if (!kf && !isOk(prelude)) errs.push(`Sélecteur « ${prelude.slice(0, 60)} » : chaque sélecteur doit contenir une classe ${pre}… (une extension ne style que ses propres éléments)`);
      i = j;
    }
  };
  walk(css, false);
  return errs.slice(0, 8);
}

export function parseExtPack(buf) {
  const errors = []; const warnings = [];
  const fail = (m) => { if (errors.length < 40) errors.push(m); };
  let entries;
  try { entries = readZip(buf, { files: 120, fileBytes: 1024 * 1024, totalBytes: 8 * 1024 * 1024 }); } catch (e) { return { ok: false, errors: [e.message], warnings }; }
  const tops = new Set(entries.map((e) => e.name.split('/')[0]));
  if (tops.size === 1 && entries.every((e) => e.name.includes('/')) && !entries.some((e) => e.name === 'extension.json')) {
    const top = [...tops][0] + '/';
    entries = entries.map((e) => ({ name: e.name.slice(top.length), data: e.data }));
  }
  const files = new Map(entries.map((e) => [e.name, e.data]));
  for (const [name, data] of files) {
    if (!TEXT_EXT.includes(ext(name))) fail(`Type de fichier non permis : « ${name} » (une extension ne contient que json, css, html, md, txt : les images se choisissent dans l'éditeur)`);
    else if (/\u0000/.test(data.subarray(0, 2000).toString('latin1'))) fail(`« ${name} » n’est pas un fichier texte`);
  }
  const read = (name, max = MAX_EXT_JSON) => {
    const d = files.get(name);
    if (!d) { fail(`Fichier introuvable : ${name}`); return null; }
    if (d.length > max) { fail(`${name} est trop gros`); return null; }
    return d.toString('utf8');
  };
  const readJson = (name) => { const s = read(name); if (s == null) return null; try { return JSON.parse(s); } catch (e) { fail(`${name} : JSON invalide (${e.message})`); return null; } };
  if (!files.has('extension.json')) return { ok: false, errors: [...errors, 'extension.json manquant à la racine du .zip'], warnings };
  const m = readJson('extension.json');
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, errors: errors.length ? errors : ['extension.json invalide'], warnings };
  const known = ['schema', 'id', 'name', 'version', 'author', 'description', 'css', 'texts', 'settings', 'features', 'blocks', 'composed'];
  for (const k of Object.keys(m)) if (!known.includes(k)) fail(`extension.json : clé inconnue « ${k} » (clés permises : ${known.join(', ')})`);
  if (m.schema !== EXT_SCHEMA) fail(`extension.json : "schema" doit valoir ${EXT_SCHEMA}`);
  if (typeof m.id !== 'string' || !SLUG.test(m.id) || m.id.length < 2 || m.id.length > 24) fail('extension.json : "id" = lettres minuscules, chiffres et tirets (2 à 24 caractères)');
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 60) fail('extension.json : "name" obligatoire (60 caractères au plus)');
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) fail('extension.json : "version" au format 1.0.0');
  if (m.author != null && (typeof m.author !== 'string' || m.author.length > 80)) fail('extension.json : "author" (80 caractères au plus)');
  if (m.description != null && (typeof m.description !== 'string' || m.description.length > 300)) fail('extension.json : "description" (300 caractères au plus)');
  const id = typeof m.id === 'string' && SLUG.test(m.id) ? m.id : 'ext';

  // -- textes
  const texts = {};
  if (m.texts != null) {
    if (typeof m.texts !== 'object' || Array.isArray(m.texts) || Object.keys(m.texts).length > 200) fail('extension.json : "texts" = objet de 200 textes au plus');
    else for (const [k, v] of Object.entries(m.texts)) {
      if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) { fail(`texts.${k} : nom en lettres, chiffres et _ (40 caractères au plus)`); continue; }
      const t = langText(v, 1000, `texts.${k}`, fail); if (t) texts[k] = t;
    }
  }
  // -- réglages
  const settings = [];
  if (m.settings != null) {
    if (!Array.isArray(m.settings) || m.settings.length > 40) fail('extension.json : "settings" = liste de 40 réglages au plus');
    else for (const [i, s] of m.settings.entries()) {
      const at = `settings[${i}]`;
      if (!s || typeof s !== 'object') { fail(`${at} invalide`); continue; }
      for (const k of Object.keys(s)) if (!['key', 'type', 'label', 'help', 'default', 'options'].includes(k)) fail(`${at} : clé inconnue « ${k} »`);
      if (typeof s.key !== 'string' || !SKEY.test(s.key) || settings.some((x) => x.key === s.key)) { fail(`${at}.key : nom unique en lettres, chiffres et _`); continue; }
      if (!SETTING_TYPES.includes(s.type)) { fail(`${at}.type : ${SETTING_TYPES.join(', ')}`); continue; }
      const label = langText(s.label, 80, `${at}.label`, fail); const help = s.help != null ? langText(s.help, 300, `${at}.help`, fail, false) : null;
      const o = { key: s.key, type: s.type, label: label || { fr: s.key } };
      if (help && Object.keys(help).length) o.help = help;
      let def = s.default;
      if (s.type === 'text') { def = def ?? ''; if (typeof def !== 'string' || def.length > 300 || /[\r\n]/.test(def)) fail(`${at}.default : texte d'une ligne (300 caractères au plus)`); }
      else if (s.type === 'number') { def = def ?? 0; if (!Number.isInteger(def) || Math.abs(def) > 1e9) fail(`${at}.default : nombre entier`); }
      else if (s.type === 'bool') { def = def ?? false; if (typeof def !== 'boolean') fail(`${at}.default : true ou false`); }
      else if (s.type === 'color') { def = def ?? '#C9A24B'; if (typeof def !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(def)) fail(`${at}.default : couleur #RRGGBB`); }
      else if (s.type === 'url') { def = def ?? ''; if (typeof def !== 'string' || (def !== '' && !validUrl(def))) fail(`${at}.default : adresse valide ou vide`); }
      else if (s.type === 'select') {
        if (!Array.isArray(s.options) || s.options.length < 2 || s.options.length > 20 || !s.options.every((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && /^[A-Za-z0-9_-]{1,30}$/.test(x[0]) && typeof x[1] === 'string' && x[1].length <= 60)) { fail(`${at}.options : 2 à 20 choix [ ["valeur", "Libellé"], … ]`); continue; }
        o.options = s.options.map((x) => [x[0], x[1]]); def = def ?? o.options[0][0];
        if (!o.options.some(([v]) => v === def)) fail(`${at}.default : doit être l'une des valeurs de options`);
      }
      o.default = def; settings.push(o);
    }
  }
  // -- fonctions activables
  const features = [];
  if (m.features != null) {
    if (!Array.isArray(m.features) || m.features.length > 20) fail('extension.json : "features" = liste de 20 fonctions au plus');
    else for (const [i, f] of m.features.entries()) {
      const at = `features[${i}]`;
      if (!f || typeof f !== 'object') { fail(`${at} invalide`); continue; }
      for (const k of Object.keys(f)) if (!['key', 'label', 'description', 'default'].includes(k)) fail(`${at} : clé inconnue « ${k} »`);
      if (typeof f.key !== 'string' || !SKEY.test(f.key) || features.some((x) => x.key === f.key)) { fail(`${at}.key : nom unique en lettres, chiffres et _`); continue; }
      const label = langText(f.label, 80, `${at}.label`, fail); const desc = f.description != null ? langText(f.description, 300, `${at}.description`, fail, false) : null;
      if (f.default != null && typeof f.default !== 'boolean') fail(`${at}.default : true ou false`);
      features.push({ key: f.key, label: label || { fr: f.key }, description: desc && Object.keys(desc).length ? desc : undefined, default: f.default === true });
    }
  }
  const env = { texts: new Set(Object.keys(texts)), settings: new Set(settings.map((s) => s.key)), features: new Set(features.map((f) => f.key)) };

  // -- blocs « gabarit »
  const blocks = {};
  const defineCommon = (b, at) => {
    if (!b || typeof b !== 'object' || Array.isArray(b)) { fail(`${at} invalide`); return null; }
    if (typeof b.name !== 'string' || !NAME.test(b.name)) { fail(`${at}.name : lettres minuscules, chiffres et _ (2 à 30 caractères), ex. « banniere »`); return null; }
    const type = typeName(id, b.name);
    if (blocks[type]) { fail(`${at}.name : « ${b.name} » est en double`); return null; }
    if (typeof b.label !== 'string' || !b.label.trim() || b.label.length > 60) { fail(`${at}.label : nom affiché dans l'éditeur (60 caractères au plus)`); return null; }
    if (b.hint != null && (typeof b.hint !== 'string' || b.hint.length > 200)) fail(`${at}.hint : 200 caractères au plus`);
    const fields = buildFields(b.fields ?? [], `${at}.fields`, fail);
    return { type, label: `${m.name?.slice?.(0, 24) || id} : ${b.label.trim()}`, hint: b.hint || '', fields, ext: id, name: b.name };
  };
  if (m.blocks != null) {
    if (!Array.isArray(m.blocks) || m.blocks.length > 30) fail('extension.json : "blocks" = liste de 30 blocs au plus');
    else for (const [i, b] of m.blocks.entries()) {
      const at = `blocks[${i}]`;
      if (b && typeof b === 'object') for (const k of Object.keys(b)) if (!['name', 'label', 'hint', 'fields', 'template'].includes(k)) fail(`${at} : clé inconnue « ${k} »`);
      const d = defineCommon(b, at); if (!d) continue;
      if (typeof b.template !== 'string') { fail(`${at}.template : fichier .html du gabarit`); continue; }
      const src = read(b.template, 30 * 1024); if (src == null) continue;
      const c = compileTemplate(src, d.fields, env);
      for (const e of c.errors) fail(`${b.template} : ${e}`);
      blocks[d.type] = { kind: 'html', type: d.type, label: d.label, hint: d.hint, fields: d.fields, ext: id, name: d.name, template: src };
    }
  }
  // -- blocs composés (assemblage de blocs du site)
  if (m.composed != null) {
    if (!Array.isArray(m.composed) || m.composed.length > 30) fail('extension.json : "composed" = liste de 30 blocs au plus');
    else for (const [i, b] of m.composed.entries()) {
      const at = `composed[${i}]`;
      if (b && typeof b === 'object') for (const k of Object.keys(b)) if (!['name', 'label', 'hint', 'fields', 'tree'].includes(k)) fail(`${at} : clé inconnue « ${k} »`);
      const d = defineCommon(b, at); if (!d) continue;
      if (typeof b.tree !== 'string') { fail(`${at}.tree : fichier .json de l'assemblage`); continue; }
      const tree = readJson(b.tree); if (!tree) continue;
      if (!Array.isArray(tree) || !tree.length || tree.length > 20) { fail(`${b.tree} : liste de 1 à 20 blocs attendue`); continue; }
      const terr = checkTree(tree, d.fields, b.tree);
      terr.forEach(fail);
      if (!terr.length) {
        // Essai complet : l'assemblage rempli avec les valeurs par défaut doit passer les contrôles du site (brouillon).
        const props = {}; for (const f of d.fields) if (f.def !== undefined) props[f.k] = f.def;
        const sample = expandComposed(tree, props, 'xcheck');
        const r = cleanContent({ meta: {}, zones: { main: sample } }, 'custom', false);
        for (const [p, msg] of Object.entries(r.errors)) fail(`${b.tree} : ${p || 'contenu'} : ${msg}`);
      }
      blocks[d.type] = { kind: 'composed', type: d.type, label: d.label, hint: d.hint, fields: d.fields, ext: id, name: d.name, tree };
    }
  }
  if (!Object.keys(blocks).length && !settings.length && !features.length && !Object.keys(texts).length) warnings.push('Cette extension ne contient rien (ni bloc, ni réglage, ni fonction, ni texte).');
  // -- CSS
  let css = '';
  if (m.css != null) {
    if (typeof m.css !== 'string' || !files.has(m.css) || ext(m.css) !== 'css') fail('extension.json : "css" doit nommer un fichier .css de l\'extension');
    else {
      const s = sanitizeCss(files.get(m.css).toString('utf8'), 'x', new Map());
      errors.push(...s.errors.map((e) => `${m.css} : ${e}`)); warnings.push(...s.warnings.filter((w) => !/theme\.css/.test(w)));
      if (!s.errors.length) { scopeErrors(s.css, id).forEach((e) => fail(`${m.css} : ${e}`)); css = s.css; }
    }
  }
  // -- fichiers non utilisés
  const used = new Set(['extension.json', m.css, ...Object.values(blocks).flatMap(() => [])]);
  for (const b of [...(m.blocks || []), ...(m.composed || [])]) { if (b?.template) used.add(b.template); if (b?.tree) used.add(b.tree); }
  for (const n of files.keys()) if (!used.has(n) && !/\.(md|txt)$/i.test(n)) warnings.push(`Fichier non utilisé : ${n}`);
  const summary = {
    id: m.id, name: m.name, version: m.version, author: m.author || '', description: m.description || '',
    blocks: Object.values(blocks).filter((b) => b.kind === 'html').length, composed: Object.values(blocks).filter((b) => b.kind === 'composed').length,
    settings: settings.length, features: features.length, texts: Object.keys(texts).length, cssBytes: css.length,
  };
  return { ok: errors.length === 0, errors, warnings, manifest: m, payload: { blocks, texts, settings, features }, css, summary };
}

// Contrôle d'un assemblage : types permis, réglages connus, liaisons « $champ » cohérentes avec les champs du bloc d'extension.
function checkTree(tree, fields, file) {
  const errs = []; const byKey = Object.fromEntries(fields.map((f) => [f.k, f]));
  const boundKeys = new Set();
  const walk = (list, at, depth) => {
    list.forEach((n, i) => {
      const w = `${file} ${at}[${i}]`;
      if (!n || typeof n !== 'object' || Array.isArray(n)) { errs.push(`${w} : objet attendu`); return; }
      for (const k of Object.keys(n)) if (!['type', 'props', 'cols'].includes(k)) errs.push(`${w} : clé inconnue « ${k} » (permises : type, props, cols)`);
      if (!COMPOSABLE.includes(n.type)) { errs.push(`${w} : bloc « ${n.type} » non permis dans un assemblage (permis : ${COMPOSABLE.join(', ')})`); return; }
      const def = BLOCK_TYPES[n.type];
      for (const [k, v] of Object.entries(n.props || {})) {
        const tf = def.fields.find((f) => f.k === k);
        if (!tf && !(def.container && k === 'count')) { errs.push(`${w}.props.${k} : réglage inconnu pour « ${n.type} » (connus : ${def.fields.map((f) => f.k).join(', ')})`); continue; }
        if (typeof v === 'string' && v.startsWith('$')) {
          const key = v.slice(1); const sf = byKey[key];
          if (!sf) { errs.push(`${w}.props.${k} : « ${v} » : champ « ${key} » absent de "fields"`); continue; }
          boundKeys.add(key);
          if (tf) {
            if (!(sf.kind === tf.kind || (sf.kind === 't' && tf.kind === 'tl'))) errs.push(`${w}.props.${k} : « ${v} » est de type « ${sf.kind} » mais « ${k} » attend « ${tf.kind} »`);
            else if (tf.kind === 'sel' && !sf.options.every(([o]) => tf.options.some(([x]) => x === o))) errs.push(`${w}.props.${k} : les choix de « ${key} » ne sont pas tous acceptés par « ${n.type}.${k} »`);
            else if (tf.kind === 'num' && (sf.min < tf.min || sf.max > tf.max)) errs.push(`${w}.props.${k} : « ${key} » (${sf.min} à ${sf.max}) dépasse ce que « ${n.type}.${k} » accepte (${tf.min} à ${tf.max})`);
          }
        }
      }
      if (n.cols != null) {
        if (!def.container) errs.push(`${w} : « cols » seulement sur un bloc « columns »`);
        else if (depth > 0) errs.push(`${w} : colonnes imbriquées non permises dans un assemblage`);
        else if (!Array.isArray(n.cols) || n.cols.length > 4 || !n.cols.every(Array.isArray)) errs.push(`${w}.cols : 4 colonnes au plus, chacune une liste de blocs`);
        else n.cols.forEach((c, ci) => walk(c, `${at}[${i}].cols[${ci}]`, depth + 1));
      }
    });
  };
  walk(tree, 'tree', 0);
  return errs;
}

export { TPL_TAGS, TPL_ATTRS, MAX_CSS };
