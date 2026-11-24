// Kit de création de thèmes (lot T) : thème d'exemple « Aurore » à télécharger + GUIDE-IA.md généré à partir du code.
// Le guide n'est jamais écrit à la main pour les listes (pages, blocs, réglages, fonctions) : il les lit dans le code,
// donc il ne peut pas oublier une page ou une fonction ajoutée plus tard. Un test (test_theme_kit.mjs) vérifie qu'il est à jour.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip, ZIP_LIMITS } from './zip.js';
import { MAX_CSS, MAX_JSON, PACK_SCHEMA, SKIN_BASES, PAGE_KEYS, THEME_SLOT_PATHS } from './themePack.js';
import { TOKENS, GROUPS, BUILTIN_FONTS } from './themeCss.js';
import {
  BLOCK_TYPES, TYPE_ORDER, DATA_TYPES, PM_TYPES, PM_CAT_TYPES, WATCH_TYPES, KIDS_SAFE_TYPES, ZONES, ZONE_LABELS, SITE_PAGES, WILDCARD_SLOTS, REPLACEABLE_PATHS,
  HOME_PATH, CATALOGUE_PATH, WATCH_PATH, LAYOUT_PATH, GLOBAL_PREFIX, AUDIENCES, DEVICE_LABELS, COLOR_REFS, COLOR_REF_LABELS, STYLE_ALIGN, STYLE_FONTS, STYLE_HOVER, STYLE_ANIM,
  STYLE_ELEMENTS, STYLE_WIDTH, FUNC_PAGES, FUNC_TYPES, funcOwner, funcPath, MAX_BLOCKS_PER_ZONE, MAX_BLOCKS_PER_COLUMN, MAX_COLS, MAX_CONTENT_BYTES,
} from './blocks.js';
import { FEATURES, FEATURE_GROUPS } from './featuresList.js';

export const KIT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../theme-kit');
const read = (f) => JSON.parse(fs.readFileSync(path.join(KIT_DIR, f), 'utf8'));

// Fichiers d'un dossier → entrées de .zip (sans fichiers cachés).
export function folderEntries(dir) {
  const entries = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else entries.push({ name: r, data: fs.readFileSync(path.join(d, e.name)) });
    }
  };
  walk(dir, '');
  return entries;
}

let zipCache = null; let guideCache = null;
export function buildExampleZip() {
  if (!zipCache) zipCache = writeZip([...folderEntries(path.join(KIT_DIR, 'example')), { name: 'GUIDE-IA.md', data: Buffer.from(buildGuide(), 'utf8') }]);
  return zipCache;
}

// ------------------------------------------------------------------ Guide
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
const code = (s, lang = '') => '```' + lang + '\n' + s + '\n```';

function fieldKind(f) {
  switch (f.kind) {
    case 't': return 'texte court par langue : `{"fr":"…","en":"…","ar":"…"}`' + (f.max ? ` (${f.max} car. max)` : '');
    case 'tl': return 'texte long par langue (Markdown léger)' + (f.max ? ` (${f.max} car. max)` : '');
    case 'url': return 'adresse : `/page`, `https://…`, `mailto:…` ou `tel:…`';
    case 'media': return 'image : dans un thème, `"pack:assets/mon-image.webp"`';
    case 'video': return 'adresse YouTube, Vimeo ou Dailymotion';
    case 'slug': return 'nom d’une section globale (`aurore-infolettre`)';
    case 'sel': return 'choix : ' + f.options.map(([v, l]) => `\`${v}\` (${l})`).join(', ') + (f.def !== undefined ? ` ; défaut \`${f.def}\`` : '');
    case 'num': return `nombre entier ${f.min} à ${f.max}` + (f.def !== undefined ? ` ; défaut ${f.def}` : '');
    case 'list': return `liste de ${f.max} ${f.item}(s) au plus, chacun avec : ` + f.fields.map((x) => `\`${x.k}\` (${fieldKind(x).split(' : ')[0]})`).join(', ');
    default: return f.kind;
  }
}
function blocksSection() {
  const order = [...TYPE_ORDER, ...Object.keys(BLOCK_TYPES).filter((t) => !TYPE_ORDER.includes(t))];
  const group = (t) => (DATA_TYPES.includes(t) ? 'données du site' : PM_TYPES.includes(t) ? 'accueil Premium' : PM_CAT_TYPES.includes(t) ? 'catalogue Premium' : WATCH_TYPES.includes(t) ? 'fiche vidéo' : FUNC_TYPES.includes(t) ? `page fonction « ${FUNC_PAGES[funcOwner(t)].label} »` : 'simple');
  const out = [];
  out.push(table(['Type', 'Nom', 'Catégorie', 'Dans Kids ?', 'Rôle'], order.map((t) => [`\`${t}\``, BLOCK_TYPES[t].label, group(t), KIDS_SAFE_TYPES.includes(t) ? 'oui' : 'non', BLOCK_TYPES[t].hint])));
  for (const t of order) {
    const d = BLOCK_TYPES[t];
    out.push(`\n#### \`${t}\` : ${d.label}\n\n${d.hint}\n`);
    if (d.container) out.push(`Bloc conteneur : ses blocs enfants sont dans \`cols\` (liste de colonnes, chacune une liste de blocs). Deux niveaux d’imbrication au plus, ${MAX_COLS} colonnes, ${MAX_BLOCKS_PER_COLUMN} blocs par colonne.\n`);
    out.push(d.fields.length ? table(['Champ (`props`)', 'Valeur'], d.fields.map((f) => [`\`${f.k}\` (${f.label})`, fieldKind(f)])) : 'Aucun champ : le bloc se règle uniquement par `style` et `show`.');
    if (d.sample && Object.keys(d.sample).length) out.push('\nExemple de `props` :\n' + code(JSON.stringify(d.sample), 'json'));
  }
  return out.join('\n');
}
function tokensSection() {
  const out = [];
  for (const g of GROUPS) {
    const list = TOKENS.filter((t) => t.group === g.id);
    if (!list.length) continue;
    out.push(`\n#### ${g.label}\n${g.hint ? '\n' + g.hint + '\n' : ''}`);
    out.push(table(['Clé', 'Rôle', 'Type', 'Valeur d’origine', 'Bornes'], list.map((t) => [`\`${t.id}\``, t.label, t.type === 'color' ? 'couleur' : t.type === 'length' ? 'longueur' : 'police', t.def === '' ? '(vide)' : t.def, t.type === 'length' ? `${t.min} à ${t.max} px` : ''])));
  }
  return out.join('\n');
}
function pagesSection() {
  const out = [];
  out.push(table(['Adresse', 'Nom', 'Contenu d’origine masquable (`hideOriginal`)'], SITE_PAGES.flatMap(([grp, items]) => items.map(([p, n]) => [`\`${p}\``, `${grp} : ${n}`, REPLACEABLE_PATHS.includes(p) ? 'oui' : 'non']))));
  return out.join('\n');
}
function routesSection(routes) {
  const rows = routes.map((r) => [`\`${r.path}\``, { public: 'public / membre', kids: 'Kids', studio: 'Studio', admin: 'Administration', organisateur: 'Organisateur', technique: 'technique' }[r.area], r.slot ? `\`${r.slot}\`` : (r.area === 'public' || r.area === 'kids' ? 'aucune zone (voir CSS)' : 'non (CSS seulement)'), r.name]);
  return table(['Route du site', 'Espace', 'Zone de blocs (`pages.slots`)', 'Nom'], rows);
}
function checklist(routes) {
  const lines = [];
  const states = 'visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base';
  for (const r of routes.filter((x) => x.area === 'public' || x.area === 'kids')) lines.push(`- [ ] \`${r.path}\`${r.slot ? ` (zone \`${r.slot}\`)` : ''} : ${states}`);
  lines.push('', 'Écrans à ne pas oublier (réglés par les jetons et le CSS, jamais par des blocs) :');
  for (const r of routes.filter((x) => !(x.area === 'public' || x.area === 'kids'))) lines.push(`- [ ] \`${r.path}\` (${r.area}) : contraste et lisibilité, 390 et 1440 px`);
  return lines.join('\n');
}
function classesSection(hooks) {
  return Object.entries(hooks).map(([f, list]) => `#### ${f} (${list.length} classes)\n\n${list.map((c) => '.' + c).join(' ')}`).join('\n\n');
}

export function buildGuide() {
  if (guideCache) return guideCache;
  const routes = read('routes.json'); const hooks = read('css-hooks.json');
  const features = FEATURE_GROUPS.map((g) => `#### ${g.label}\n\n` + table(['Fonction', 'Identifiant', 'Rôle'], FEATURES.filter((f) => f.group === g.id).map((f) => [f.label, `\`${f.id}\``, f.hint || '']))).join('\n\n');
  const md = `# Guide IA : créer un thème Mejliss TV

> Ce fichier est GÉNÉRÉ à partir du code du site (pages, blocs, réglages, fonctions). Il est donc complet. Ne l'éditez pas à la main : relancez \`node api/theme-kit/scan.mjs\`.
> Donnez-le en entier à l'IA, avec le thème d'exemple « Aurore » (\`example.zip\`), puis décrivez le thème voulu.

## 0. Résumé en dix lignes

1. Un thème est un fichier **.zip** : \`theme.json\` + \`theme.css\` + \`fonts/\` + \`assets/\` + \`pages/*.json\`. **Aucun code exécutable** (pas de JavaScript, pas de PHP).
2. \`theme.json\` choisit une **base** (${SKIN_BASES.map((b) => `\`${b}\``).join(', ')}), des **jetons** (couleurs, polices, arrondis, espacements), un **CSS**, des **polices**, des **pages** en blocs, des **sections globales** et des **modèles**.
3. Les **fonctions** du site (lecteur vidéo, quiz, paiement Stripe, connexion, compte, Kids…) restent dans le code : un thème les **habille** (jetons, CSS) et les **entoure** de blocs, il ne les remplace pas.
4. Les pages d'un thème s'installent en **brouillon** : l'administrateur relit et publie. Rien n'est jamais publié automatiquement.
5. Les textes sont **multilingues** : \`{"fr":"…","en":"…","ar":"…"}\`. Le français est obligatoire ; l'anglais et l'arabe (écriture de droite à gauche) sont attendus.
6. Les images des pages s'écrivent \`"pack:assets/nom.webp"\` ; celles du CSS \`url("assets/nom.webp")\`.
7. Validez toujours : \`node api/theme-kit/validate.mjs mon-theme/\` (mêmes règles que le site). Fabriquez : \`node api/theme-kit/build.mjs mon-theme/ mon-theme.zip\`.
8. Installation : Admin → Apparence → Thèmes Mejliss → Envoyer un thème → Installer → Activer. « Désactiver » restaure l'état d'avant.
9. Limites : ${ZIP_LIMITS.files} fichiers, ${ZIP_LIMITS.fileBytes / 1024 / 1024} Mo par fichier, ${ZIP_LIMITS.totalBytes / 1024 / 1024} Mo au total, CSS ${MAX_CSS / 1024} Ko, JSON ${MAX_JSON / 1024} Ko.
10. Parcourez la **checklist** (section 10) : elle liste TOUTES les pages et tous les états à contrôler.

## 1. Structure du .zip

${code(`mon-theme/
├── theme.json            (obligatoire : le manifeste)
├── theme.css             (facultatif : habillage fin)
├── README.md             (facultatif : notice du thème)
├── assets/               (images : png, jpg, webp, gif)
│   ├── preview.png       (aperçu affiché dans l'administration)
│   └── hero.webp
├── fonts/                (polices : woff2, woff, ttf, otf)
└── pages/                (pages en blocs : JSON)
    ├── home.json  catalogue.json  watch.json  layout.json
    ├── pricing.json  legal-cgv.json   (zones « avant / après » d'une page)
    ├── a-propos.json                  (page libre : /p/a-propos)
    ├── global-infolettre.json         (section globale)
    └── tpl-banniere.json  tpl-atterrissage.json   (modèles)`)}

Extensions permises : png, jpg, jpeg, webp, gif, woff2, woff, ttf, otf, json, css, md, txt. Tout autre fichier fait refuser le thème. Les images et polices sont vérifiées sur leur contenu réel (pas seulement l'extension). Un seul dossier racine est toléré dans le .zip.

## 2. theme.json (le manifeste)

${code(`{
  "schema": ${PACK_SCHEMA},
  "id": "aurore",                       // minuscules, chiffres, tirets (2 à 40)
  "name": "Aurore",                     // 60 caractères au plus
  "version": "1.0.0",                   // x.y.z
  "author": "…", "description": "…",    // facultatifs
  "base": "nuit",                       // ${SKIN_BASES.join(' | ')}
  "preview": "assets/preview.png",      // facultatif
  "tokens": { "accent": "#FF8A5B", "radius": "18px", "fontTitle": "Aurore Serif" },
  "fonts": [ { "family": "Aurore Serif", "weight": "400 700", "style": "normal", "file": "fonts/aurore-serif.woff2" } ],
  "css": "theme.css",
  "pages": {
    "home": "pages/home.json", "catalogue": "pages/catalogue.json", "watch": "pages/watch.json", "layout": "pages/layout.json",
    "slots": { "/pricing": "pages/pricing.json" },
    "func": { "pricing": "pages/func-pricing.json" },
    "custom": [ { "slug": "a-propos", "title": "À propos", "file": "pages/a-propos.json" } ]
  },
  "globals": [ { "slug": "aurore-infolettre", "title": "Invitation à s'inscrire", "file": "pages/global-infolettre.json" } ],
  "templates": [
    { "kind": "section", "name": "Bannière", "description": "…", "file": "pages/tpl-banniere.json" },
    { "kind": "page", "pageKind": "custom", "name": "Page d'atterrissage", "file": "pages/tpl-atterrissage.json" }
  ]
}`, 'jsonc')}

(Les commentaires \`//\` ci-dessus sont pour vous : le vrai fichier est du JSON strict, sans commentaires.)

Clés inconnues = thème refusé. \`pageKind\` d'un modèle de page : custom, slot, home, catalogue ou watch.

### Ce que fait chaque clé à l'activation

| Clé | Effet à l'activation | Retour en arrière |
|---|---|---|
| \`base\` | devient l'habillage de départ (\`skin_default\`) | restauré |
| \`tokens\` | créent un thème « Mejliss — <nom> » et l'activent | l'ancien thème est réactivé |
| \`fonts\` | polices ajoutées aux polices du site | retirées |
| \`css\` | ajouté APRÈS les réglages (dernier mot) | retiré |
| \`pages\` | **brouillons** (accueil, catalogue, fiche vidéo, en-tête/pied, zones, pages libres) ; jamais publiées automatiquement | brouillons conservés |
| \`globals\` | créées et publiées si le nom est libre | conservées |
| \`templates\` | ajoutés à la bibliothèque de modèles si le nom est libre | conservés |

## 3. Jetons (\`tokens\`)

Valeurs acceptées (rien d'autre) : couleur \`#rgb\`, \`#rrggbb\`, \`#rrggbbaa\`, \`transparent\`, ou référence \`"@jeton"\` / \`"@jeton/NN"\` (reprend une couleur de base avec NN % d'opacité, ex. \`"@bg/92"\`) ; longueur \`12px\` ou \`1.5rem\` dans les bornes ; police = nom d'une police intégrée ou déclarée dans \`fonts\`. Ne mettez que ce qui change.

Polices intégrées : ${BUILTIN_FONTS.map((f) => `\`${f}\``).join(', ')}. Une police de \`fonts\` doit avoir un nom DIFFÉRENT de ces noms.
${tokensSection()}

Références de couleur utilisables dans les blocs (\`style.bgColor\`, \`textColor\`…) : ${Object.keys(COLOR_REFS).map((k) => `\`@${k}\` (${COLOR_REF_LABELS[k]})`).join(', ')}. Ou un code \`#RRGGBB\`.

**Contraste** : texte normal ≥ 4,5:1, grand texte et éléments d'interface ≥ 3:1 (WCAG AA). L'administration signale les contrastes faibles.

## 4. CSS (\`theme.css\`)

- Interdits : \`@import\`, \`@charset\`, \`@namespace\`, \`expression()\`, \`behavior\`, \`-moz-binding\`, \`javascript:\`, balises \`<style>\` / \`<script>\`, caractères \`<\` et \`>\`. Les commentaires sont retirés.
- \`url()\` : uniquement \`url("assets/x.webp")\` ou \`url("fonts/x.woff2")\` d'un fichier du thème, ou une petite image \`data:image/...;base64,...\`. Aucune adresse externe.
- Le CSS est chargé après les réglages : à spécificité égale, il gagne. Préférez des **variables** (\`var(--accent)\`, \`var(--radius)\`, \`var(--surface)\`, \`var(--line)\`, \`var(--text)\`, \`var(--muted)\`) aux couleurs écrites en dur, pour que les réglages de l'administrateur continuent de fonctionner.
- Arabe : le site passe en \`html[dir="rtl"]\`. Utilisez des propriétés logiques (\`margin-inline-start\`, \`padding-inline\`, \`inset-inline-end\`, \`text-align: start\`), pas \`left\` / \`right\`. Pas d'\`letter-spacing\` en arabe.
- Mobile d'abord : contrôlez 390, 768 et 1440 px. Seuils du site : téléphone ≤ 700 px, tablette 701–1024 px, ordinateur ≥ 1025 px.
- Les **jetons** du thème sont republiés avec un sélecteur plus fort que celui des habillages (\`html[data-skin][lang][dir]\`) : ils gagnent toujours, seulement pour les clés que le thème règle. Votre **CSS**, lui, suit les règles normales : pour battre une règle d'un habillage (\`html[data-skin="nuit"] …\`), préfixez vos sélecteurs par \`html[data-skin][lang]\`.
- Habillage actif : \`html[data-skin="${SKIN_BASES.join('"] | html[data-skin="')}"]\`. Pour cibler seulement une base, préfixez.
- L'espace Kids a son propre habillage (\`body.kd-theme\`) : ne changez pas ses polices ni ses couleurs sans besoin.

Classes de blocs (les plus utiles) : \`.pb-hero\` (+ \`.h-s|m|l\`, \`.has-img\`), \`.pb-h\`, \`.pb-sub\`, \`.pb-rich\`, \`.pb-actions\`, \`.pb-image\`, \`.pb-cards\` (+ \`.c-2|3|4\`), \`.pb-card\`, \`.pb-card-body\`, \`.pb-quote\`, \`.pb-faq\`, \`.pb-cols\` (+ \`.n-1…4\`), \`.pb-col\`, \`.pb-talks\`, \`.pb-global\`, \`.btn\`, \`.btn.ghost\`. La liste COMPLÈTE de toutes les classes du site est en annexe B.

## 5. Pages en blocs

Un fichier de page a la forme :

${code(`{
  "meta": { "title": {"fr":"…"}, "description": {"fr":"…"}, "noindex": false, "hideOriginal": false },
  "zones": { "main": [ { "id": "aur-home-hero", "type": "hero", "props": { … }, "show": { "devices": ["m","t","d"], "audience": "all" }, "style": { … } } ] }
}`, 'json')}

- \`id\` : 4 à 24 caractères \`A-Za-z0-9_-\`, **unique dans la page**.
- \`type\` : voir section 6. \`props\` : les champs du type. \`show.devices\` : ${Object.entries(DEVICE_LABELS).map(([k, v]) => `\`${k}\` = ${v}`).join(', ')}. \`show.audience\` : ${AUDIENCES.map(([k, v]) => `\`${k}\` (${v})`).join(', ')}.
- Maximum ${MAX_BLOCKS_PER_ZONE} blocs par zone, ${Math.round(MAX_CONTENT_BYTES / 1000)} Ko par page.
- \`meta.hideOriginal\` : masque le contenu d'origine, **seulement** sur les pages d'information masquables (tableau ci-dessous).

### 5.1 Types de pages et zones

${table(['Clé dans theme.json', 'Genre de page', 'Zones', 'Adresse interne'], [
  ['`pages.home`', 'Accueil des membres', ZONES.home.map((z) => `\`${z}\` (${ZONE_LABELS[z]})`).join(', '), `\`${HOME_PATH}\``],
  ['`pages.catalogue`', 'Catalogue (habillage Premium)', ZONES.catalogue.map((z) => `\`${z}\``).join(', '), `\`${CATALOGUE_PATH}\``],
  ['`pages.watch`', 'Fiche vidéo', ZONES.watch.map((z) => `\`${z}\``).join(', '), `\`${WATCH_PATH}\``],
  ['`pages.layout`', 'En-tête, menus et pied de page', ZONES.layout.map((z) => `\`${z}\` (${ZONE_LABELS[z]})`).join(', '), `\`${LAYOUT_PATH}\``],
  ['`pages.func`', 'Pages à fonctions recomposées en sections (tarifs, compte, apprendre, série, chaîne…)', ZONES.func.map((z) => `\`${z}\``).join(', '), '`/_func/<page>`'],
  ['`pages.slots`', 'Toute autre page du site : blocs avant / après son contenu', ZONES.slot.map((z) => `\`${z}\``).join(', '), 'l’adresse de la page (ex. `/pricing`)'],
  ['`pages.custom`', 'Pages libres (`/p/<slug>`)', ZONES.custom.map((z) => `\`${z}\``).join(', '), '`/p/<slug>`'],
  ['`globals`', 'Sections globales (réutilisables)', ZONES.global.map((z) => `\`${z}\``).join(', '), `\`${GLOBAL_PREFIX}<slug>\``],
])}

Une page « fonction » (\`pages.func\`) découpe une page à fonctions en **sections** que l'on déplace, masque et style : le code (paiement, quiz, lecteur, connexion) reste en place et chaque section est un bloc \`f_<page>_<section>\`. Tant qu'elle n'est pas publiée, la page d'origine s'affiche. Clés permises : ${Object.keys(FUNC_PAGES).map((k) => `\`${k}\``).join(', ')}.

${table(['Clé (`pages.func`)', 'Page', 'Sections (types de blocs)'], Object.entries(FUNC_PAGES).map(([id, p]) => [`\`${id}\``, `${p.label} (\`${p.route}\`, adresse interne \`${funcPath(id)}\`)`, p.sections.map((x) => `\`${x[0]}\``).join(', ')]))}

Une page « slot » (\`pages.slots\`) a les zones \`before\` et \`after\`. Le **contenu fonctionnel** (formulaire de connexion, paiement, lecteur…) reste toujours en place : les blocs sont posés autour.
Les adresses \`/chose/*\` s'appliquent à TOUTES les pages de ce genre (ex. \`/conferences/*\` = chaque vidéo). Liste des zones « toutes les pages de ce genre » : ${WILDCARD_SLOTS.map((p) => `\`${p}\``).join(', ')}.

### 5.2 Annuaire des pages qui acceptent des blocs (\`pages.slots\`)

Adresses permises : exactement celles du tableau (${THEME_SLOT_PATHS.length} adresses).

${pagesSection()}

### 5.3 Espace Kids

L'espace enfants est ouvert aux blocs SIMPLES seulement : ${KIDS_SAFE_TYPES.map((t) => `\`${t}\``).join(', ')}. Aucune donnée du catalogue adulte, aucune vidéo externe. Toute autre page Kids avec un autre bloc est refusée. Contenu adapté aux enfants obligatoire.

### 5.4 Images dans les pages

Écrivez \`"image": "pack:assets/hero.webp"\` (aussi dans \`style.bgImage\` et dans les éléments de listes comme les cartes). À l'installation, chaque image est ajoutée à la médiathèque du site. Le fichier doit exister dans le .zip.

## 6. Blocs

Règles : \`global\` ne peut pas contenir de \`global\` ; les types \`w_*\` n'existent que dans \`pages.watch\` ; les colonnes s'imbriquent sur deux niveaux ; les blocs \`pm_*\` ne s'affichent que sous l'habillage Premium ; les blocs « données du site » (talks, featured, mine…) se remplissent tout seuls et disparaissent s'il n'y a rien à montrer.

${blocksSection()}

### 6.1 Réglages de style communs (\`style\`)

Tous facultatifs ; une valeur absente = réglage du thème.

${table(['Clé', 'Valeur'], [
  ['`textColor`, `bgColor`', 'couleur `#RRGGBB(AA)` ou référence `@accent`, `@surface`…'], ['`bgImage`', '`pack:assets/x.webp`'], ['`align`, `alignM`', `${STYLE_ALIGN.map(([v]) => v).filter(Boolean).join(' | ')} (alignM = téléphone)`],
  ['`maxWidth`', STYLE_WIDTH.map(([v]) => v).filter(Boolean).join(' | ')], ['`padTop`, `padBottom` (+ `padTopT`, `padBottomT`, `padTopM`, `padBottomM`)', 'entier 0 à 240 px'], ['`radius`', 'entier 0 à 60'], ['`minHeight`, `minHeightM`', 'entier 0 à 1200'],
  ['`shadow`', '`soft` | `strong`'], ['`border`', '`true`'], ['`font`', STYLE_FONTS.map((f) => `\`${f}\``).join(', ')], ['`hover`', STYLE_HOVER.map(([v]) => v).filter(Boolean).join(' | ')], ['`hoverBg`, `hoverText`', 'couleur'],
  ['`anim`', STYLE_ANIM.map(([v]) => v).filter(Boolean).join(' | ')], ['`animDelay`', 'entier 0 à 2000 ms'],
  ...Object.entries(STYLE_ELEMENTS).map(([k, d]) => [`\`${k}\``, d === 'color' ? 'couleur' : d[0] === 'int' ? `entier ${d[1]} à ${d[2]}` : `graisse ${d[1].join(' | ')}`]),
])}

## 7. Annuaire COMPLET des routes du site

${routes.length} routes, lues dans le code (\`web/app\`). « Zone de blocs » = adresse à mettre dans \`pages.slots\`. Les routes sans zone ne reçoivent pas de blocs : elles se règlent par les jetons et le CSS.

${routesSection(routes)}

Pages spéciales hors de cet annuaire : accueil des membres (\`pages.home\`), catalogue Premium (\`pages.catalogue\`), fiche vidéo (\`pages.watch\`), en-tête / menus / pied de page (\`pages.layout\`).
Menus (en-tête, menu latéral, barre du bas, pied de page) : leurs liens se règlent dans Admin → Menus, pas dans un thème.

## 8. Fonctions du site

Chaque fonction peut être activée ou coupée par l'administrateur (Admin → Fonctions). Un thème doit rester correct quand une fonction est coupée : ne mettez jamais de bouton ou de lien obligatoire vers une fonction sans prévoir son absence. Un thème ne change pas leur fonctionnement.

${features}

Fonctions toujours présentes (code, non désactivables par un thème) : lecteur vidéo (HLS, sous-titres, chapitres), quiz et révision espacée, paiement Stripe (6,99 €/mois, 69,99 €/an, essai 7 jours, codes promo, cartes cadeaux), connexion / inscription / mot de passe, compte, abonnement, Kids, Studio, administration. Habillez-les (couleurs, arrondis, polices, CSS) ; ne les cachez pas.

## 9. Règles de qualité

1. **Fidélité à la marque** : noir et or d'origine = \`accent\` doré ; un thème est libre, mais gardez des textes lisibles (blanc pur sur fond sombre).
2. **Trois langues** : chaque texte visible a \`fr\`, \`en\`, \`ar\`. L'arabe est relu de droite à gauche.
3. **Responsive** : 390 → 1440 px, sans défilement horizontal.
4. **Accessibilité** : contrastes WCAG AA, focus visible conservé (ne retirez jamais \`outline\` sans remplacement), images avec \`alt\`.
5. **Pas de dépendance externe** : tout est dans le .zip (polices, images). Aucun CDN.
6. **Pas de secrets** : jamais de clé, mot de passe ni adresse privée dans un thème.
7. **Droits** : polices et images libres de droits (indiquez la licence dans \`README.md\`).
8. **Légal** : ne pas masquer ni déformer les pages légales ; le pied de page garde les trois liens obligatoires.
9. **Sobriété** : CSS court (< 30 Ko idéal), images optimisées (webp), polices en woff2.
10. **Réversible** : tout ce que fait le thème doit pouvoir être défait par « Désactiver ».

## 10. Checklist « rien d'oublié »

Pour CHAQUE ligne, contrôlez : visiteur et connecté, FR / EN / AR, 390 / 768 / 1440 px, et, quand elle existe, la fonction coupée.

- [ ] \`theme.json\` valide (\`node api/theme-kit/validate.mjs\` → ✓)
- [ ] aperçu \`assets/preview.png\` fourni
- [ ] jetons : contrastes, arrondis, polices (FR et AR)
- [ ] \`pages.home\`, \`pages.catalogue\`, \`pages.watch\`, \`pages.layout\` (ou volontairement absentes)
- [ ] \`pages.func\` : ${Object.keys(FUNC_PAGES).map((k) => `\`${k}\``).join(', ')} (ou volontairement absentes)
${checklist(routes)}

Fonctions à contrôler (activées ET coupées) :
${FEATURES.map((f) => `- [ ] ${f.label} (\`${f.id}\`)`).join('\n')}

## 11. Modèle de demande à une IA

> Tu es ingénieur front-end. Crée un thème Mejliss TV nommé « <NOM> » (id « <id> »), style « <description du style> ». Respecte à la lettre le GUIDE-IA.md joint et pars de l'exemple « Aurore » (\`example.zip\`). Fournis : theme.json, theme.css, pages/*.json (accueil, catalogue, fiche vidéo, en-tête/pied, au moins les zones /pricing, /login, /register, /account, une page libre, une section globale, deux modèles), assets (images générées en webp) et fonts. Chaque texte en fr, en, ar. Parcours la checklist de la section 10 ligne par ligne et dis-moi ce qui n'a pas été vérifié. Lance \`node api/theme-kit/validate.mjs\` jusqu'à obtenir ✓, puis \`build.mjs\`.

## Annexe A : réglages Premium (rôles de couleur)

Les clés \`pm*\` (voir section 3, groupes « Thème Premium ») ne s'appliquent que si la base est \`premium\`. Elles recolorent toutes les nuances d'un même rôle sur tout le site Premium.

## Annexe B : toutes les classes CSS du site

Liste lue dans \`web/app/*.css\` (${Object.values(hooks).reduce((n, l) => n + l.length, 0)} classes). Une classe existante peut être redéfinie ; n'en inventez pas : elle ne ferait rien.

${classesSection(hooks)}
`;
  guideCache = md;
  return md;
}
