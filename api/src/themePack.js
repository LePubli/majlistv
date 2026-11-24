// Thèmes uploadables « Mejliss » (lot T) : lecture et validation d'un fichier .zip de thème. Aucune base de données ici :
// le même code sert à l'API (installation) et au validateur en ligne de commande du kit (api/theme-kit/validate.mjs).
//
// Un thème = theme.json (manifeste) + theme.css + polices + images + pages en blocs (JSON) + modèles + sections globales.
// Un thème ne contient JAMAIS de code exécutable : le CSS est filtré, les pages passent par les mêmes contrôles que l'éditeur.
import { readZip } from './zip.js';
import { imageFormat, fontFormat } from './fileSniff.js';
import { cleanValues, TOKEN_MAP, validFontName, BUILTIN_FONTS } from './themeCss.js';
import { validate, emptyContent } from './pageContent.js';
import { SITE_PAGES, WILDCARD_SLOTS, GLOBAL_PREFIX, FUNC_PAGES, funcPath } from './blocks.js';

export const PACK_SCHEMA = 1;
export const SKIN_BASES = ['classique', 'nuit', 'bleu', 'premium'];
export const PAGE_KEYS = ['home', 'catalogue', 'watch', 'layout']; // pages « spéciales » d'un thème
export const MAX_CSS = 300 * 1024;
export const MAX_JSON = 600 * 1024;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const IMG_EXT = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', gif: 'gif' };
const FONT_EXT = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };
const TEXT_EXT = ['json', 'css', 'md', 'txt'];
export const IMG_TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
export const FONT_TYPES = { woff2: 'font/woff2', woff: 'font/woff', truetype: 'font/ttf', opentype: 'font/otf' };
const ext = (n) => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');

// Toutes les adresses de pages sur lesquelles un thème peut poser des blocs « avant / après » (annuaire du site).
export const THEME_SLOT_PATHS = SITE_PAGES.flatMap(([, items]) => items.map(([p]) => p));

// ------------------------------------------------------------------ CSS
// Interdit : @import, adresses externes, anciennes astuces de script (expression, behavior, -moz-binding, javascript:), balises.
// Autorisé dans url() : un fichier du thème (assets/…, fonts/…) — réécrit vers /api/theme-pack/<id>/… — ou une petite image data:.
export function sanitizeCss(raw, slug, files = null) {
  const errors = []; const warnings = [];
  let css = String(raw ?? '');
  if (css.length > MAX_CSS) return { css: '', errors: [`theme.css est trop gros (${Math.round(MAX_CSS / 1024)} Ko au maximum)`], warnings };
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Les échappements CSS (\69mport…) sont décodés pour la vérification : on ne peut pas cacher un mot interdit.
  const decoded = plain.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) => { const n = parseInt(h, 16); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }).replace(/\\(.)/g, '$1');
  const bad = [
    [/@import/i, '@import interdit (le thème doit tenir dans ses propres fichiers)'], [/@charset|@namespace/i, '@charset et @namespace interdits'],
    [/expression\s*\(/i, 'expression() interdit'], [/behaviou?r\s*:/i, 'behavior interdit'], [/-moz-binding/i, '-moz-binding interdit'],
    [/javascript\s*:|vbscript\s*:/i, 'adresses javascript: interdites'], [/<\s*\/?\s*(style|script)/i, 'balises <style> et <script> interdites'], [/[<>]/, 'caractères < et > interdits'],
  ];
  for (const [re, msg] of bad) if (re.test(decoded)) errors.push(msg);
  let opens = 0;
  for (const ch of decoded.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')) { if (ch === '{') opens++; else if (ch === '}') opens--; if (opens < 0) break; }
  if (opens !== 0) errors.push('Accolades { } non équilibrées');
  // Les commentaires sont retirés (ils ne servent pas au site, et un « url() » cité dans un commentaire ne doit pas être jugé).
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // url(...) : réécriture des fichiers du thème, refus du reste
  css = css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi, (all, a, b, c) => {
    const u = (a ?? b ?? c ?? '').trim();
    if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]{1,60000}$/.test(u)) return `url("${u}")`;
    if (/^(assets|fonts)\/[A-Za-z0-9._\-/]+$/.test(u) && !u.includes('..')) {
      if (files && !files.has(u)) errors.push(`Fichier introuvable dans le thème : ${u}`);
      return `url("/api/theme-pack/${slug}/${u}")`;
    }
    errors.push(`url() refusée : « ${u.slice(0, 60)} » (seuls assets/… et fonts/… du thème, ou une petite image data:, sont permis)`);
    return 'url("")';
  });
  if (!errors.length && !/\S/.test(plain)) warnings.push('theme.css est vide');
  return { css: errors.length ? '' : css, errors, warnings };
}

// ------------------------------------------------------------------ Pages
// Remplace les « pack:assets/x.webp » des champs image (et de l'image de fond d'un bloc) par une valeur fournie par `resolve`.
export function mapPackImages(content, resolve) {
  const walk = (blocks) => (blocks || []).map((b) => {
    const props = { ...(b.props || {}) };
    for (const [k, v] of Object.entries(props)) if (typeof v === 'string' && v.startsWith('pack:')) props[k] = resolve(v.slice(5));
    const style = { ...(b.style || {}) };
    if (typeof style.bgImage === 'string' && style.bgImage.startsWith('pack:')) style.bgImage = resolve(style.bgImage.slice(5));
    // listes (cartes, questions…) : leurs éléments peuvent contenir des images
    for (const [k, v] of Object.entries(props)) {
      if (Array.isArray(v)) props[k] = v.map((it) => (it && typeof it === 'object' ? Object.fromEntries(Object.entries(it).map(([kk, vv]) => [kk, typeof vv === 'string' && vv.startsWith('pack:') ? resolve(vv.slice(5)) : vv])) : it));
    }
    return { ...b, props, style, ...(b.cols ? { cols: b.cols.map(walk) } : {}) };
  });
  return { ...content, zones: Object.fromEntries(Object.entries(content.zones || {}).map(([z, l]) => [z, walk(l)])), ...(content.meta ? { meta: content.meta } : {}) };
}
// Fichiers « pack:… » cités dans un contenu.
export function packImageRefs(content) {
  const out = new Set();
  mapPackImages(content, (p) => { out.add(p); return 'x'; });
  return [...out];
}

// ------------------------------------------------------------------ Lecture complète d'un .zip
// Renvoie { ok, errors[], warnings[], manifest, css, files: Map, fonts[], pages: { home?, catalogue?, watch?, layout?, slots: {path: content}, custom: [] }, globals[], templates[], summary }.
export function parsePack(buf) {
  const errors = []; const warnings = [];
  const fail = (m) => errors.push(m);
  let entries;
  try { entries = readZip(buf); } catch (e) { return { ok: false, errors: [e.message], warnings }; }
  // Un zip fait depuis un dossier a souvent un dossier racine unique : on le retire.
  const tops = new Set(entries.map((e) => e.name.split('/')[0]));
  if (tops.size === 1 && entries.every((e) => e.name.includes('/')) && !entries.some((e) => e.name === 'theme.json')) {
    const top = [...tops][0] + '/';
    entries = entries.map((e) => ({ name: e.name.slice(top.length), data: e.data }));
  }
  const files = new Map(entries.map((e) => [e.name, e.data]));
  for (const [name, data] of files) {
    const x = ext(name);
    if (IMG_EXT[x]) { if (imageFormat(data) !== IMG_EXT[x]) fail(`« ${name} » n’est pas une vraie image ${x.toUpperCase()}`); }
    else if (FONT_EXT[x]) { if (fontFormat(data) !== FONT_EXT[x]) fail(`« ${name} » n’est pas une vraie police ${x.toUpperCase()}`); }
    else if (!TEXT_EXT.includes(x)) fail(`Type de fichier non permis : « ${name} » (permis : png, jpg, webp, gif, woff2, woff, ttf, otf, json, css, md, txt)`);
    if (TEXT_EXT.includes(x) && /\u0000/.test(data.subarray(0, 2000).toString('latin1'))) fail(`« ${name} » n’est pas un fichier texte`);
  }
  const readJson = (name, max = MAX_JSON) => {
    const d = files.get(name);
    if (!d) { fail(`Fichier introuvable : ${name}`); return null; }
    if (d.length > max) { fail(`${name} est trop gros`); return null; }
    try { return JSON.parse(d.toString('utf8')); } catch (e) { fail(`${name} : JSON invalide (${e.message})`); return null; }
  };
  const m = files.has('theme.json') ? readJson('theme.json') : (fail('theme.json manquant à la racine du .zip'), null);
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, errors: errors.length ? errors : ['theme.json invalide'], warnings };
  // -- manifeste
  const known = ['schema', 'id', 'name', 'version', 'author', 'description', 'base', 'preview', 'tokens', 'fonts', 'css', 'pages', 'globals', 'templates'];
  for (const k of Object.keys(m)) if (!known.includes(k)) fail(`theme.json : clé inconnue « ${k} » (clés permises : ${known.join(', ')})`);
  if (m.schema !== PACK_SCHEMA) fail(`theme.json : "schema" doit valoir ${PACK_SCHEMA}`);
  if (typeof m.id !== 'string' || !SLUG.test(m.id) || m.id.length < 2 || m.id.length > 40) fail('theme.json : "id" = lettres minuscules, chiffres et tirets (2 à 40 caractères)');
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 60) fail('theme.json : "name" obligatoire (60 caractères au plus)');
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) fail('theme.json : "version" au format 1.0.0');
  if (m.author != null && (typeof m.author !== 'string' || m.author.length > 80)) fail('theme.json : "author" (80 caractères au plus)');
  if (m.description != null && (typeof m.description !== 'string' || m.description.length > 300)) fail('theme.json : "description" (300 caractères au plus)');
  if (!SKIN_BASES.includes(m.base)) fail(`theme.json : "base" doit être l'un de : ${SKIN_BASES.join(', ')}`);
  const slug = typeof m.id === 'string' ? m.id : 'theme';
  if (m.preview != null) { if (typeof m.preview !== 'string' || !files.has(m.preview) || !IMG_EXT[ext(m.preview)]) fail('theme.json : "preview" doit être une image du thème'); }
  // -- couleurs, polices (jetons)
  const fonts = [];
  if (m.fonts != null) {
    if (!Array.isArray(m.fonts) || m.fonts.length > 12) fail('theme.json : "fonts" = liste de 12 polices au plus');
    else for (const [i, f] of m.fonts.entries()) {
      const at = `fonts[${i}]`;
      if (!f || typeof f !== 'object') { fail(`${at} invalide`); continue; }
      if (!validFontName(f.family) || BUILTIN_FONTS.includes(f.family)) fail(`${at}.family : nom de police invalide ou déjà intégré au site`);
      if (!/^[1-9]00(?: [1-9]00)?$/.test(String(f.weight ?? '400'))) fail(`${at}.weight : 100 à 900`);
      if (!['normal', 'italic'].includes(f.style ?? 'normal')) fail(`${at}.style : normal ou italic`);
      if (typeof f.file !== 'string' || !files.has(f.file) || !FONT_EXT[ext(f.file)]) fail(`${at}.file : fichier de police du thème introuvable`);
      else fonts.push({ family: f.family, weight: String(f.weight ?? '400'), style: f.style ?? 'normal', file: f.file, format: FONT_EXT[ext(f.file)] });
    }
  }
  let tokens = {};
  if (m.tokens != null) {
    if (typeof m.tokens !== 'object' || Array.isArray(m.tokens)) fail('theme.json : "tokens" doit être un objet');
    else {
      const names = [...new Set(fonts.map((f) => f.family))];
      const res = cleanValues(m.tokens, names);
      for (const [k, v] of Object.entries(res.errors)) fail(`tokens.${k} : ${v}${TOKEN_MAP[k] ? '' : ' (jeton inconnu : voir GUIDE-IA.md, section « Jetons »)'}`);
      tokens = res.values;
    }
  }
  // -- CSS
  let css = '';
  if (m.css != null) {
    if (typeof m.css !== 'string' || !files.has(m.css) || ext(m.css) !== 'css') fail('theme.json : "css" doit nommer un fichier .css du thème');
    else { const s = sanitizeCss(files.get(m.css).toString('utf8'), slug, files); errors.push(...s.errors.map((e) => `${m.css} : ${e}`)); warnings.push(...s.warnings); css = s.css; }
  }
  // -- pages
  const pages = { slots: {}, custom: [], func: {} }; const used = new Set();
  const loadPage = (file, kind, path, label) => {
    const raw = readJson(file); if (!raw) return null;
    used.add(file);
    if (typeof raw !== 'object' || Array.isArray(raw)) { fail(`${file} : objet attendu`); return null; }
    const imgs = packImageRefs(raw);
    for (const p of imgs) if (!files.has(p) || !IMG_EXT[ext(p)]) fail(`${file} : image « pack:${p} » introuvable dans le thème`);
    // les « pack: » sont remplacés par un identifiant fictif valide pour contrôler le contenu sans envoyer d'image
    const probe = mapPackImages(raw, () => '00000000-0000-4000-8000-000000000000');
    const v = validate(kind, probe, false, path);
    for (const [k, msg] of Object.entries(v.errors)) fail(`${file} : ${k || 'contenu'} : ${msg}`);
    return raw;
  };
  if (m.pages != null) {
    if (typeof m.pages !== 'object' || Array.isArray(m.pages)) fail('theme.json : "pages" doit être un objet');
    else {
      for (const k of Object.keys(m.pages)) if (![...PAGE_KEYS, 'slots', 'custom', 'func'].includes(k)) fail(`pages.${k} : clé inconnue (permises : ${[...PAGE_KEYS, 'slots', 'custom', 'func'].join(', ')})`);
      for (const k of PAGE_KEYS) if (m.pages[k] != null) { const c = typeof m.pages[k] === 'string' ? loadPage(m.pages[k], k, '', k) : (fail(`pages.${k} : chemin de fichier attendu`), null); if (c) pages[k] = c; }
      if (m.pages.slots != null) {
        if (typeof m.pages.slots !== 'object' || Array.isArray(m.pages.slots)) fail('pages.slots : objet { adresse: fichier } attendu');
        else for (const [path, file] of Object.entries(m.pages.slots)) {
          if (!THEME_SLOT_PATHS.includes(path)) { fail(`pages.slots : adresse inconnue « ${path} » (voir GUIDE-IA.md, section « Pages »)`); continue; }
          if (typeof file !== 'string') { fail(`pages.slots.${path} : chemin de fichier attendu`); continue; }
          const c = loadPage(file, 'slot', path, path); if (c) pages.slots[path] = c;
        }
      }
      if (m.pages.func != null) {
        if (typeof m.pages.func !== 'object' || Array.isArray(m.pages.func)) fail('pages.func : objet { page: fichier } attendu');
        else for (const [id, file] of Object.entries(m.pages.func)) {
          if (!FUNC_PAGES[id]) { fail(`pages.func : page inconnue « ${id} » (permises : ${Object.keys(FUNC_PAGES).join(', ')})`); continue; }
          if (typeof file !== 'string') { fail(`pages.func.${id} : chemin de fichier attendu`); continue; }
          const c = loadPage(file, 'func', funcPath(id), id); if (c) pages.func[id] = c;
        }
      }
      if (m.pages.custom != null) {
        if (!Array.isArray(m.pages.custom) || m.pages.custom.length > 30) fail('pages.custom : liste de 30 pages au plus');
        else for (const [i, p] of m.pages.custom.entries()) {
          if (!p || typeof p.slug !== 'string' || !SLUG.test(p.slug) || p.slug.length > 60 || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 120 || typeof p.file !== 'string') { fail(`pages.custom[${i}] : { slug, title, file } attendu`); continue; }
          const c = loadPage(p.file, 'custom', `/p/${p.slug}`, p.slug); if (c) pages.custom.push({ slug: p.slug, title: p.title.trim(), content: c });
        }
      }
    }
  }
  const globals = [];
  if (m.globals != null) {
    if (!Array.isArray(m.globals) || m.globals.length > 30) fail('theme.json : "globals" = liste de 30 sections globales au plus');
    else for (const [i, g] of m.globals.entries()) {
      if (!g || typeof g.slug !== 'string' || !SLUG.test(g.slug) || g.slug.length > 60 || typeof g.title !== 'string' || !g.title.trim() || typeof g.file !== 'string') { fail(`globals[${i}] : { slug, title, file } attendu`); continue; }
      const c = loadPage(g.file, 'global', `${GLOBAL_PREFIX}${g.slug}`, g.slug); if (c) globals.push({ slug: g.slug, title: g.title.trim(), content: c });
    }
  }
  const templates = [];
  if (m.templates != null) {
    if (!Array.isArray(m.templates) || m.templates.length > 60) fail('theme.json : "templates" = liste de 60 modèles au plus');
    else for (const [i, t] of m.templates.entries()) {
      if (!t || !['section', 'page'].includes(t.kind) || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 80 || typeof t.file !== 'string') { fail(`templates[${i}] : { kind: section|page, name, file } attendu`); continue; }
      if (t.kind === 'page' && !['custom', 'slot', 'home', 'catalogue', 'watch'].includes(t.pageKind)) { fail(`templates[${i}].pageKind : custom, slot, home, catalogue ou watch`); continue; }
      const c = loadPage(t.file, t.kind === 'section' ? 'custom' : t.pageKind, '', t.name); if (c) templates.push({ kind: t.kind, pageKind: t.kind === 'page' ? t.pageKind : null, name: t.name.trim(), description: String(t.description || '').slice(0, 200), content: c });
    }
  }
  const summary = {
    id: m.id, name: m.name, version: m.version, author: m.author || '', description: m.description || '', base: m.base,
    tokens: Object.keys(tokens).length, fonts: fonts.length, cssBytes: css.length, assets: [...files.keys()].filter((n) => IMG_EXT[ext(n)]).length,
    pages: PAGE_KEYS.filter((k) => pages[k]).length + Object.keys(pages.slots).length + Object.keys(pages.func).length + pages.custom.length, globals: globals.length, templates: templates.length,
  };
  if (!summary.tokens && !css && !summary.pages) warnings.push('Ce thème ne change rien : ni jetons, ni CSS, ni pages.');
  return { ok: errors.length === 0, errors, warnings, manifest: m, tokens, css, files, fonts, pages, globals, templates, summary };
}

export { emptyContent, WILDCARD_SLOTS };
