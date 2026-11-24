# Guide pour créer une extension Mejliss TV (généré depuis le code)

Ce guide est destiné aux IA (et aux humains) : suivez-le à la lettre, le site REFUSE toute extension qui sort des règles. Contrôle en ligne de commande : `node api/ext-kit/validate.mjs mon-extension/` (mêmes règles que le site).

## 1. Ce qu'est une extension (et ce qu'elle n'est pas)

Une extension = un fichier .zip qui **ajoute des briques** au site, **sans aucun code exécutable** (ni JavaScript, ni serveur) :

1. **Blocs « gabarit »** : du HTML restreint avec des champs modifiables dans l'éditeur (section 4).
2. **Blocs « composés »** : un assemblage de blocs existants du site (y compris les blocs de données : vidéos, séries, chaînes…) dont certains réglages sont liés à des champs (section 5).
3. **Réglages** (Admin → Apparence → Extensions) lus par les gabarits : `{{s:cle}}`.
4. **Fonctions activables** (interrupteurs) lues par les gabarits : `{{#if feat:cle}}`.
5. **Textes** FR / EN / AR : `{{t:cle}}`.
6. **Une feuille de style** limitée à ses propres classes `.x-<id>`.

Elle ne change pas le code du site, n'ajoute pas de route ni de logique serveur (prévu plus tard, à part), et ne touche pas aux pages d'origine : elle ajoute des blocs que l'on pose dans l'éditeur visuel.

## 2. Contenu du .zip

```
mon-extension/
  extension.json          manifeste (obligatoire)
  extension.css           feuille de style (facultatif)
  blocks/<nom>.html       un gabarit par bloc « gabarit »
  blocks/<nom>.json       un assemblage par bloc « composé »
  README.md               facultatif
```

Types de fichiers permis : json, css, html, md, txt. **Aucune image, aucune police** (les images se choisissent dans l'éditeur, depuis la bibliothèque du site). Limites : 120 fichiers, 1 Mo par fichier, 8 Mo en tout, 6 Mo pour le .zip.

## 3. extension.json

```json
{
  "schema": 1,
  "id": "exemple",
  "name": "Exemple",
  "version": "1.0.0",
  "author": "…",
  "description": "…",
  "css": "extension.css",
  "texts": {
    "cle": {
      "fr": "…",
      "en": "…",
      "ar": "…"
    }
  },
  "settings": [
    "…"
  ],
  "features": [
    "…"
  ],
  "blocks": [
    "…"
  ],
  "composed": [
    "…"
  ]
}
```

- `schema` : 1. `id` : lettres minuscules, chiffres et tirets (2 à 24). `version` : 1.0.0. Seules les clés ci-dessus sont permises.
- Mettre à jour une extension = renvoyer un .zip de même `id` : les valeurs des réglages sont gardées.
- Les types de blocs créés s'appellent `x_<id>_<nom>` (tirets de l'id remplacés par _).

### 3.1 `settings` (réglages modifiables par l'administrateur)

| `type` | Valeur | Remarque |
| --- | --- | --- |
| `text` | texte d’une ligne (300 max) |  |
| `number` | nombre entier |  |
| `bool` | true / false |  |
| `select` | un choix parmi `options` | `options`: [["valeur","Libellé"], …] |
| `color` | #RRGGBB |  |
| `url` | adresse valide ou vide |  |

Chaque réglage : `{ "key": "phone", "type": "text", "label": { "fr": "…" }, "help": { "fr": "…" }, "default": "" }`. Lu par `{{s:phone}}` ou `{{#if s:phone}}`. **Les réglages sont publics** (le site les envoie aux navigateurs) : n'y mettez JAMAIS de mot de passe ni de clé secrète.

### 3.2 `features`

`{ "key": "badge", "label": { "fr": "…" }, "description": { "fr": "…" }, "default": true }` : un interrupteur dans Admin → Extensions ; lu par `{{#if feat:badge}}`.

### 3.3 `texts`

`"texts": { "cle": { "fr": "…", "en": "…", "ar": "…" } }` (le français est obligatoire ; l'anglais et l'arabe retombent sur le français s'ils manquent). Lu par `{{t:cle}}`. Pensez à l'arabe (écriture de droite à gauche).

## 4. Blocs « gabarit »

Dans `blocks` : `{ "name": "bandeau", "label": "Bandeau", "hint": "…", "fields": [ … ], "template": "blocks/bandeau.html" }` (`name` : minuscules, chiffres, _ ; 2 à 30).

### 4.1 Champs (`fields`, 24 au plus)

| `kind` | Ce que l'éditeur propose | Réglages |
| --- | --- | --- |
| `t` | texte court, par langue (FR / EN / AR) | `max` (300 au plus) |
| `tl` | texte long, par langue | `max` (4000 au plus) |
| `url` | adresse de lien |  |
| `media` | image de la bibliothèque du site |  |
| `sel` | liste de choix | `options`: [["valeur","Libellé"], …], `def` |
| `num` | nombre entier | `min`, `max`, `def` |
| `list` | liste d'éléments (une seule profondeur) | `max` (30), `item` (nom d'un élément), `fields` (champs d'un élément) |

Chaque champ : `{ "k": "title", "kind": "t", "label": "Titre" }` (`k` : minuscule puis lettres/chiffres ; « count » et « ref » sont réservés).

### 4.2 Gabarit HTML

Syntaxe (chaque valeur est échappée par le site) :

| Écriture | Effet |
| --- | --- |
| `{{champ}}` | valeur du champ (texte dans la langue du visiteur, nombre, choix, adresse) |
| `{{champ\|br}}` | idem, retours à la ligne → <br> (textes seulement) |
| `{{t:cle}}` | texte de l'extension |
| `{{s:cle}}` | réglage de l'extension |
| `{{lang}}` `{{dir}}` | langue (fr/en/ar) et sens (ltr/rtl) |
| `{{#if cond}}…{{else}}…{{/if}}` | cond : `champ` · `!champ` · `champ=valeur` · `feat:cle` · `s:cle` · `!s:cle` |
| `{{#each liste}}…{{/each}}` | répète pour chaque élément d'un champ liste ; dedans, `{{champ}}` = champ de l'élément, `{{@n}}` = 1, 2, 3… (pas d'imbrication) |
| `src="{{image}}"` | sur `<img>` seulement, un seul champ `media`, rien autour |
| `href="{{lien}}"` | sur `<a>` seulement : un seul champ `url`, ou une adresse fixe valide (`/page`, `https://…`, `mailto:`, `tel:`, `#ancre`) |

- Balises permises : `div`, `span`, `p`, `h2`, `h3`, `h4`, `h5`, `h6`, `a`, `img`, `ul`, `ol`, `li`, `section`, `article`, `header`, `footer`, `nav`, `aside`, `figure`, `figcaption`, `strong`, `em`, `b`, `i`, `u`, `small`, `br`, `hr`, `blockquote`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `details`, `summary`. Toute autre balise (script, style, iframe, form, input, button, svg…) est REFUSÉE.
- Attributs permis : `class` (texte fixe + champs « sel », ex. `x-id-look-{{look}}`), `href`, `src`, `alt`, `title`, `role`, `width`, `height`, `colspan`, `rowspan`, `open`, `aria-label`, `aria-hidden`, `aria-expanded`. `role` : list, listitem, region, note, img, presentation, group, navigation. Aucun `style`, aucun `on…`, aucun `id`.
- `<img>` : `alt` et `src` obligatoires (`alt=""` si décorative). `<a>` : `href` obligatoire. Les liens https s'ouvrent avec `rel="noopener noreferrer"` (ajouté par le site).
- Écrivez `&amp;` pour « & », `&lt;` pour « < ». 20 Ko et 600 éléments au plus, 14 niveaux au plus.
- Le site entoure votre gabarit de `<div class="x-<id> x-<id>-<nom>">` : utilisez ces classes dans le CSS.
- Pas d'interactivité (pas de JavaScript) : pour déplier, utilisez `<details><summary>`.

### 4.3 CSS (`extension.css`)

- Même filtrage qu'un thème : pas de `@import`, pas d'adresse externe, pas d'`url()` sauf une petite image `data:`.
- **Chaque sélecteur doit contenir une classe `.x-<id>`** (ex. `.x-exemple-bandeau .titre`). Permis : `@media`, `@supports`, `@keyframes x-<id>-nom`. Interdit : `@font-face`, `:root`, `body`, sélecteurs sans classe de l'extension.
- Utilisez les variables du site (`--accent`, `--surface`, `--bg`, `--text`, `--line`, `--on-accent`…) pour suivre le thème ; testez à 390 px et en arabe (`[dir="rtl"]`).

## 5. Blocs « composés » (dont les blocs de données)

Dans `composed` : `{ "name": "selection", "label": "…", "hint": "…", "fields": [ … ], "tree": "blocks/selection.json" }`. Le fichier `tree` est une liste de blocs du site :

```json
[
  {
    "type": "heading",
    "props": {
      "title": "$title"
    }
  },
  {
    "type": "talks",
    "props": {
      "limit": "$limit",
      "level": "$level",
      "source": "latest"
    }
  }
]
```

- Une valeur `"$champ"` prend la valeur du champ du bloc d'extension ; le type du champ doit correspondre au réglage visé (`t` → texte, `num` → nombre dans la même plage, `sel` → choix tous acceptés par le réglage visé).
- `cols` (seulement sur `columns`, un niveau) : liste de colonnes, chacune une liste de blocs.
- L'assemblage est essayé avec les valeurs par défaut des champs et doit passer les contrôles de l'éditeur.
- Blocs permis (22) et leurs réglages :

#### `hero` : Bannière

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `eyebrow` | t |  |
| `title` | t |  |
| `text` | tl |  |
| `btn1Label` | t |  |
| `btn1Url` | url |  |
| `btn2Label` | t |  |
| `btn2Url` | url |  |
| `image` | media |  |
| `overlay` | num | 0 à 90 |
| `height` | sel | `s`, `m`, `l` |

#### `heading` : Titre

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `title` | t |  |
| `subtitle` | t |  |
| `level` | sel | `h2`, `h3` |

#### `text` : Texte

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `body` | tl |  |

#### `image` : Image

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `image` | media |  |
| `alt` | t |  |
| `caption` | t |  |
| `link` | url |  |
| `size` | sel | `full`, `wide`, `medium`, `small` |

#### `button` : Bouton

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `label` | t |  |
| `url` | url |  |
| `kind` | sel | `primary`, `ghost` |

#### `cards` : Cartes

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `columns` | sel | `2`, `3`, `4` |
| `items` | list | liste (12 max) |

#### `talks` : Vidéos

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `title` | t |  |
| `source` | sel | `latest`, `category` |
| `category` | num | 0 à 100000 |
| `level` | sel | ``, `beginner`, `intermediate`, `advanced` |
| `limit` | num | 1 à 12 |
| `moreLabel` | t |  |
| `moreUrl` | url |  |

#### `quote` : Citation

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `text` | tl |  |
| `author` | t |  |

#### `faq` : Questions fréquentes

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `title` | t |  |
| `items` | list | liste (20 max) |

#### `video` : Vidéo

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `url` | video |  |
| `title` | t |  |

#### `featured` : À la une + Reprendre

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `layout` | sel | `auto`, `fixed` |
| `resume` | sel | `yes`, `no` |

#### `mine` : Ma progression

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `what` | sel | `review`, `quiz`, `continue` |

#### `channels` : Chaînes à suivre

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `title` | t |  |
| `limit` | num | 1 à 10 |
| `order` | sel | `new`, `popular`, `alpha` |

#### `shorts` : Shorts

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `title` | t |  |
| `limit` | num | 2 à 20 |

#### `collections` : Collections

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `title` | t |  |
| `limit` | num | 1 à 12 |

#### `dayquote` : Citation du jour

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `style` | sel | `framed`, `compact` |

#### `series` : Séries

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `title` | t |  |
| `limit` | num | 1 à 12 |

#### `catrows` : Rangées par catégorie

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `max` | num | 1 à 12 |

#### `kids` : Bande Espace Kids

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |

#### `columns` : Colonnes

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `count` | sel | `1`, `2`, `3`, `4` |
| `ratio` | sel | ``, `1-2`, `2-1` |
| `gap` | sel | `s`, `m`, `l` |
| `valign` | sel | `start`, `center`, `end` |
| `stack` | sel | `m`, `t` |

#### `spacer` : Espace

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |
| `size` | num | 8 à 240 |

#### `divider` : Séparateur

| Réglage (`props`) | Type | Détail |
| --- | --- | --- |


## 6. Cycle de vie

1. Admin → Apparence → Extensions → « Envoyer une extension » : contrôle complet (liste précise des erreurs sinon), puis « Installer » (inactive).
2. « Activer » : les blocs apparaissent dans l'éditeur visuel (groupe « Extensions »), le CSS et les textes sont chargés.
3. Réglages et fonctions : même écran.
4. « Désactiver » / « Supprimer » : **refusé tant qu'une page ou un modèle utilise un bloc de l'extension** (la liste est affichée). Une mise à jour qui retire un bloc encore utilisé est refusée.
5. Les blocs d'extension ne sont pas proposés dans l'espace Kids.

## 7. Checklist « rien d'oublié »

- [ ] `node api/ext-kit/validate.mjs mon-extension/` → ✓
- [ ] chaque texte visible a ses versions FR, EN et AR (champs `t`/`tl` : l'éditeur propose les 3 langues ; `texts` : fournir en, ar)
- [ ] aspect testé à 390 / 768 / 1440 px, en français et en arabe (RTL), thèmes classique / nuit / bleu / premium
- [ ] fonction coupée (`feat:`) : le bloc reste correct
- [ ] aucun secret dans les réglages (ils sont publics)
- [ ] images : jamais dans le .zip ; champs `media` pour que l'administrateur les choisisse
- [ ] CSS : uniquement des sélecteurs `.x-<id>`

## 8. Exemple complet

### `extension.json`

```json
{
  "schema": 1,
  "id": "exemple",
  "name": "Exemple",
  "version": "1.0.0",
  "author": "Votre nom",
  "description": "Extension d’exemple : un bandeau, des avis, une sélection de vidéos, deux réglages et une fonction.",
  "css": "extension.css",
  "texts": {
    "badge": {
      "fr": "Nouveau",
      "en": "New",
      "ar": "جديد"
    },
    "callUs": {
      "fr": "Appelez-nous :",
      "en": "Call us:",
      "ar": "اتصل بنا:"
    }
  },
  "settings": [
    {
      "key": "phone",
      "type": "text",
      "label": {
        "fr": "Numéro affiché dans le bandeau",
        "en": "Phone shown in the banner"
      },
      "default": ""
    },
    {
      "key": "accent",
      "type": "color",
      "label": {
        "fr": "Couleur du bandeau"
      },
      "default": "#C9A24B"
    }
  ],
  "features": [
    {
      "key": "badge",
      "label": {
        "fr": "Afficher la pastille « Nouveau »",
        "en": "Show the “New” badge"
      },
      "description": {
        "fr": "Ajoute une pastille au-dessus du titre du bandeau."
      },
      "default": true
    }
  ],
  "blocks": [
    {
      "name": "bandeau",
      "label": "Bandeau",
      "hint": "Un bandeau avec titre, texte, bouton et numéro de téléphone.",
      "fields": [
        {
          "k": "title",
          "kind": "t",
          "label": "Titre",
          "max": 120
        },
        {
          "k": "text",
          "kind": "tl",
          "label": "Texte"
        },
        {
          "k": "btnLabel",
          "kind": "t",
          "label": "Bouton : texte"
        },
        {
          "k": "btnUrl",
          "kind": "url",
          "label": "Bouton : adresse"
        },
        {
          "k": "look",
          "kind": "sel",
          "label": "Aspect",
          "options": [
            [
              "plain",
              "Sobre"
            ],
            [
              "bold",
              "Marqué"
            ]
          ],
          "def": "plain"
        }
      ],
      "template": "blocks/bandeau.html"
    },
    {
      "name": "avis",
      "label": "Avis",
      "hint": "Une liste de citations (texte et auteur).",
      "fields": [
        {
          "k": "items",
          "kind": "list",
          "label": "Avis",
          "max": 8,
          "item": "Avis",
          "fields": [
            {
              "k": "quote",
              "kind": "tl",
              "label": "Citation",
              "max": 400
            },
            {
              "k": "author",
              "kind": "t",
              "label": "Auteur"
            }
          ]
        }
      ],
      "template": "blocks/avis.html"
    }
  ],
  "composed": [
    {
      "name": "selection",
      "label": "Sélection de vidéos",
      "hint": "Un titre suivi d’une rangée de vidéos du catalogue.",
      "fields": [
        {
          "k": "title",
          "kind": "t",
          "label": "Titre"
        },
        {
          "k": "limit",
          "kind": "num",
          "label": "Nombre de vidéos",
          "min": 1,
          "max": 12,
          "def": 4
        },
        {
          "k": "level",
          "kind": "sel",
          "label": "Niveau",
          "options": [
            [
              "",
              "Tous"
            ],
            [
              "beginner",
              "Débutant"
            ],
            [
              "intermediate",
              "Intermédiaire"
            ],
            [
              "advanced",
              "Avancé"
            ]
          ],
          "def": ""
        }
      ],
      "tree": "blocks/selection.json"
    }
  ]
}
```

### `blocks/bandeau.html`

```html
<div class="x-exemple-bandeau-in x-exemple-look-{{look}}">
  {{#if feat:badge}}<span class="x-exemple-badge">{{t:badge}}</span>{{/if}}
  <h2>{{title}}</h2>
  {{#if text}}<p>{{text|br}}</p>{{/if}}
  {{#if btnLabel}}<a class="x-exemple-btn" href="{{btnUrl}}">{{btnLabel}}</a>{{/if}}
  {{#if s:phone}}<p class="x-exemple-phone">{{t:callUs}} {{s:phone}}</p>{{/if}}
</div>
```

### `blocks/avis.html`

```html
<ul class="x-exemple-avis-list" role="list">
  {{#each items}}
  <li class="x-exemple-avis-item">
    <blockquote>{{quote}}</blockquote>
    <small>{{author}}</small>
  </li>
  {{/each}}
</ul>
```

### `blocks/selection.json`

```json
[
  {
    "type": "heading",
    "props": {
      "title": "$title"
    }
  },
  {
    "type": "talks",
    "props": {
      "limit": "$limit",
      "level": "$level"
    }
  }
]
```

### `extension.css`

```css
/* Une extension ne style que ses propres classes : chaque sélecteur contient « .x-<id> » (ici .x-exemple). */
.x-exemple-bandeau { border-radius: 16px; overflow: hidden; }
.x-exemple-bandeau-in { padding: 28px 24px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 16px; }
.x-exemple-bandeau .x-exemple-look-bold { background: var(--accent); color: var(--on-accent); }
.x-exemple-bandeau .x-exemple-badge { display: inline-block; padding: 2px 10px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-size: .8rem; margin-bottom: 8px; }
.x-exemple-bandeau .x-exemple-btn { display: inline-block; margin-top: 12px; padding: 10px 18px; border-radius: 999px; background: var(--accent); color: var(--on-accent); text-decoration: none; }
.x-exemple-bandeau .x-exemple-look-bold .x-exemple-btn { background: var(--bg); color: var(--text); }
.x-exemple-avis .x-exemple-avis-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.x-exemple-avis .x-exemple-avis-item { padding: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; }
@media (max-width: 600px) { .x-exemple-bandeau .x-exemple-bandeau-in { padding: 20px 16px; } }
```

### `README.md`

```
# Extension d'exemple

Dossier de départ pour créer une extension Mejliss. Modifiez-le puis envoyez-le (en .zip) dans Admin → Apparence → Extensions.
Le guide complet (toutes les règles, tous les champs) est le fichier GUIDE-EXTENSIONS-IA.md : donnez-le à votre IA avec ce dossier.
```
