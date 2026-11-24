# Guide IA : créer un thème Mejliss TV

> Ce fichier est GÉNÉRÉ à partir du code du site (pages, blocs, réglages, fonctions). Il est donc complet. Ne l'éditez pas à la main : relancez `node api/theme-kit/scan.mjs`.
> Donnez-le en entier à l'IA, avec le thème d'exemple « Aurore » (`example.zip`), puis décrivez le thème voulu.

## 0. Résumé en dix lignes

1. Un thème est un fichier **.zip** : `theme.json` + `theme.css` + `fonts/` + `assets/` + `pages/*.json`. **Aucun code exécutable** (pas de JavaScript, pas de PHP).
2. `theme.json` choisit une **base** (`classique`, `nuit`, `bleu`, `premium`), des **jetons** (couleurs, polices, arrondis, espacements), un **CSS**, des **polices**, des **pages** en blocs, des **sections globales** et des **modèles**.
3. Les **fonctions** du site (lecteur vidéo, quiz, paiement Stripe, connexion, compte, Kids…) restent dans le code : un thème les **habille** (jetons, CSS) et les **entoure** de blocs, il ne les remplace pas.
4. Les pages d'un thème s'installent en **brouillon** : l'administrateur relit et publie. Rien n'est jamais publié automatiquement.
5. Les textes sont **multilingues** : `{"fr":"…","en":"…","ar":"…"}`. Le français est obligatoire ; l'anglais et l'arabe (écriture de droite à gauche) sont attendus.
6. Les images des pages s'écrivent `"pack:assets/nom.webp"` ; celles du CSS `url("assets/nom.webp")`.
7. Validez toujours : `node api/theme-kit/validate.mjs mon-theme/` (mêmes règles que le site). Fabriquez : `node api/theme-kit/build.mjs mon-theme/ mon-theme.zip`.
8. Installation : Admin → Apparence → Thèmes Mejliss → Envoyer un thème → Installer → Activer. « Désactiver » restaure l'état d'avant.
9. Limites : 300 fichiers, 5 Mo par fichier, 40 Mo au total, CSS 300 Ko, JSON 600 Ko.
10. Parcourez la **checklist** (section 10) : elle liste TOUTES les pages et tous les états à contrôler.

## 1. Structure du .zip

```
mon-theme/
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
    └── tpl-banniere.json  tpl-atterrissage.json   (modèles)
```

Extensions permises : png, jpg, jpeg, webp, gif, woff2, woff, ttf, otf, json, css, md, txt. Tout autre fichier fait refuser le thème. Les images et polices sont vérifiées sur leur contenu réel (pas seulement l'extension). Un seul dossier racine est toléré dans le .zip.

## 2. theme.json (le manifeste)

```jsonc
{
  "schema": 1,
  "id": "aurore",                       // minuscules, chiffres, tirets (2 à 40)
  "name": "Aurore",                     // 60 caractères au plus
  "version": "1.0.0",                   // x.y.z
  "author": "…", "description": "…",    // facultatifs
  "base": "nuit",                       // classique | nuit | bleu | premium
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
}
```

(Les commentaires `//` ci-dessus sont pour vous : le vrai fichier est du JSON strict, sans commentaires.)

Clés inconnues = thème refusé. `pageKind` d'un modèle de page : custom, slot, home, catalogue ou watch.

### Ce que fait chaque clé à l'activation

| Clé | Effet à l'activation | Retour en arrière |
|---|---|---|
| `base` | devient l'habillage de départ (`skin_default`) | restauré |
| `tokens` | créent un thème « Mejliss — <nom> » et l'activent | l'ancien thème est réactivé |
| `fonts` | polices ajoutées aux polices du site | retirées |
| `css` | ajouté APRÈS les réglages (dernier mot) | retiré |
| `pages` | **brouillons** (accueil, catalogue, fiche vidéo, en-tête/pied, zones, pages libres) ; jamais publiées automatiquement | brouillons conservés |
| `globals` | créées et publiées si le nom est libre | conservées |
| `templates` | ajoutés à la bibliothèque de modèles si le nom est libre | conservés |

## 3. Jetons (`tokens`)

Valeurs acceptées (rien d'autre) : couleur `#rgb`, `#rrggbb`, `#rrggbbaa`, `transparent`, ou référence `"@jeton"` / `"@jeton/NN"` (reprend une couleur de base avec NN % d'opacité, ex. `"@bg/92"`) ; longueur `12px` ou `1.5rem` dans les bornes ; police = nom d'une police intégrée ou déclarée dans `fonts`. Ne mettez que ce qui change.

Polices intégrées : `DM Sans Variable`, `Montserrat Variable`, `Fredoka Variable`, `Noto Sans Arabic Variable`, `Noto Kufi Arabic Variable`, `Inter Variable`, `Poppins`, `Amiri`, `Marcellus`, `Playfair Display Variable`, `Lora Variable`, `Nunito Variable`, `Open Sans Variable`, `Cairo Variable`, `Tajawal`, `Système`, `Serif`. Une police de `fonts` doit avoir un nom DIFFÉRENT de ces noms.

#### Thème Premium : couleurs

Dix couleurs « par rôle » : chaque changement s’applique à toutes les nuances du même rôle, sur tout le site Premium et son administration (la couleur d’origine est celle de la maquette). Laissez une couleur à sa valeur d’origine pour ne rien changer.

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `pmBg` | Fond du site | couleur | #061325 |  |
| `pmSurface` | Panneaux, cartes et menus | couleur | #0d233e |  |
| `pmLine` | Bordures et séparateurs | couleur | #294566 |  |
| `pmPrimary` | Couleur principale (boutons, éléments actifs) | couleur | #087cff |  |
| `pmAccent` | Accent clair (survols, contours, liens) | couleur | #34c1ff |  |
| `pmText` | Texte principal | couleur | #f5f9ff |  |
| `pmMuted` | Texte atténué | couleur | #9aafc9 |  |
| `pmGold` | Doré (étiquettes, étoiles) | couleur | #f6cb83 |  |
| `pmOk` | Succès (vert) | couleur | #2cce9c |  |
| `pmDanger` | Erreur et alerte (rouge) | couleur | #ff6b6b |  |

#### Thème Premium : polices

Vide = police d’origine du thème Premium. Le choix s’applique à tous les écrans Premium ; la police du back-office a son propre réglage.

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `pmFontBody` | Police du texte et des menus | police | (vide) |  |
| `pmFontTitle` | Police des titres et des boutons | police | (vide) |  |
| `pmFontBo` | Police du back-office (administration et Studio) | police | (vide) |  |

#### Couleurs de base

Les couleurs principales du site. Les autres réglages en dépendent par défaut.

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `bg` | Fond général | couleur | #0B0906 |  |
| `surface` | Surface (panneaux, champs) | couleur | #17120B |  |
| `surface2` | Surface secondaire (survol, élément actif) | couleur | #1F1810 |  |
| `line` | Bordures | couleur | #3A2E1E |  |
| `lineSoft` | Bordures discrètes | couleur | #2A2116 |  |
| `lineStrong` | Bordures marquées | couleur | #5A4628 |  |
| `accent` | Couleur principale (or) | couleur | #E6A739 |  |
| `accentHover` | Couleur principale au survol | couleur | #F7C863 |  |
| `accentLight` | Texte doré (liens, mentions) | couleur | #F2BE5C |  |
| `bronze` | Bronze (dégradés) | couleur | #BD7E2A |  |
| `onAccent` | Texte posé sur la couleur principale | couleur | #120D06 |  |
| `text` | Texte principal | couleur | #FFFFFF |  |
| `text2` | Texte secondaire | couleur | #EDE6DA |  |
| `muted` | Texte atténué | couleur | #B8AC98 |  |
| `placeholder` | Texte d’exemple dans les champs | couleur | #7D715F |  |
| `danger` | Erreur (texte) | couleur | #F0766B |  |
| `dangerBg` | Bouton de suppression (fond) | couleur | #9B2C22 |  |
| `ok` | Succès (texte) | couleur | #7FD18B |  |

#### Polices et taille du texte

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `fontBody` | Police du texte | police | DM Sans Variable |  |
| `fontTitle` | Police des titres et boutons | police | Montserrat Variable |  |
| `fontBodyAr` | Police du texte (arabe) | police | Noto Sans Arabic Variable |  |
| `fontTitleAr` | Police des titres (arabe) | police | Noto Kufi Arabic Variable |  |
| `fontKids` | Police de l’espace Kids | police | Fredoka Variable |  |
| `fontSize` | Taille du texte courant | longueur | 16px | 13 à 22 px |
| `titleColor` | Couleur des titres (si choisie, remplace celle de chaque bloc) | couleur | @text |  |

#### Arrondis

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `radius` | Arrondi des grands blocs | longueur | 14px | 0 à 40 px |
| `radiusSm` | Arrondi des petits éléments | longueur | 8px | 0 à 24 px |
| `btnRadius` | Arrondi des boutons | longueur | 999px | 0 à 999 px |
| `cardRadius` | Arrondi des panneaux | longueur | @radius | 0 à 40 px |
| `thumbRadius` | Arrondi des vignettes | longueur | 10px | 0 à 40 px |
| `inputRadius` | Arrondi des champs | longueur | @radiusSm | 0 à 999 px |
| `badgeRadius` | Arrondi des badges | longueur | 999px | 0 à 999 px |

#### Espacements et largeur

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `wrap` | Largeur maximale du contenu | longueur | 1320px | 960 à 1920 px |
| `gutterMin` | Marge latérale minimale (téléphone) | longueur | 16px | 8 à 40 px |
| `gutterMax` | Marge latérale maximale (grand écran) | longueur | 32px | 16 à 96 px |
| `rowSpace` | Espace sous chaque rangée de l’accueil | longueur | 14px | 0 à 80 px |
| `panelPad` | Marge intérieure des panneaux | longueur | 22px | 8 à 48 px |

#### En-tête

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `headerBg` | Fond | couleur | @bg/92 |  |
| `headerText` | Liens | couleur | @muted |  |
| `headerTextActive` | Lien survolé ou actif | couleur | @text |  |
| `headerBorder` | Bordure du bas | couleur | @lineSoft |  |

#### Menu latéral (membre)

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `sidebarBg` | Fond | couleur | #FFFFFF03 |  |
| `sidebarText` | Liens | couleur | @text2 |  |
| `sidebarActiveBg` | Fond du lien actif | couleur | @surface2 |  |
| `sidebarActiveText` | Texte du lien actif | couleur | @text |  |
| `sidebarMark` | Trait du lien actif | couleur | @accent |  |
| `sidebarBorder` | Bordure | couleur | @lineSoft |  |

#### Barre du bas (téléphone)

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `bottomBg` | Fond | couleur | @bg/96 |  |
| `bottomText` | Liens | couleur | @text2 |  |
| `bottomActive` | Lien actif | couleur | @accent |  |
| `bottomBorder` | Bordure du haut | couleur | @line |  |

#### Menu du Studio et de l’administration

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `studioSideBg` | Fond du menu | couleur | #100C07 |  |

#### Boutons

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `btnBg` | Fond du bouton principal | couleur | @accent |  |
| `btnText` | Texte du bouton principal | couleur | @onAccent |  |
| `btnHoverBg` | Fond au survol | couleur | @accentHover |  |
| `btnGhostText` | Bouton secondaire : texte | couleur | @text |  |
| `btnGhostBorder` | Bouton secondaire : bordure | couleur | @lineStrong |  |

#### Cartes, panneaux et vignettes

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `cardBg` | Fond des panneaux | couleur | @surface |  |
| `cardBorder` | Bordure des panneaux et vignettes | couleur | @lineSoft |  |
| `cardTitle` | Titre sous une vignette | couleur | @text |  |
| `cardMeta` | Détails sous une vignette | couleur | @muted |  |
| `progressBar` | Barre de progression | couleur | @accent |  |

#### Badges

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `badgeBg` | Fond (Gratuit, durée…) | couleur | @bg/80 |  |
| `badgeText` | Texte | couleur | @text |  |
| `badgePremiumBg` | Fond « Premium » | couleur | @accent |  |
| `badgePremiumText` | Texte « Premium » | couleur | @onAccent |  |

#### Champs de formulaire

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `inputBg` | Fond des champs | couleur | @surface |  |
| `inputBgPanel` | Fond des champs dans un panneau | couleur | @bg |  |
| `inputText` | Texte saisi | couleur | @text |  |
| `inputBorder` | Bordure | couleur | @line |  |
| `inputFocus` | Bordure du champ actif | couleur | @accent |  |

#### Onglets

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `tabsText` | Onglet | couleur | @muted |  |
| `tabsActive` | Onglet actif | couleur | @text |  |
| `tabsMark` | Trait de l’onglet actif | couleur | @accent |  |

#### Pied de page

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `footerBg` | Fond | couleur | transparent |  |
| `footerText` | Texte et liens | couleur | @muted |  |
| `footerLinkHover` | Lien survolé | couleur | @text |  |
| `footerBorder` | Bordure du haut | couleur | @lineSoft |  |

#### Citation du jour

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `quoteGold` | Doré (étiquette, référence) | couleur | #FFD76E |  |
| `quoteArabic` | Texte arabe | couleur | #FFE7A8 |  |
| `quoteText` | Traduction | couleur | @text |  |
| `quoteBorder` | Bordure | couleur | #F0BE50B3 |  |
| `quoteBgA` | Fond (début du dégradé) | couleur | #3A2808 |  |
| `quoteBgB` | Fond (fin du dégradé) | couleur | #1E1508 |  |

#### Espace Kids

Couleurs de l’espace enfants (page des parents, espace enfant, bande de l’accueil).

| Clé | Rôle | Type | Valeur d’origine | Bornes |
|---|---|---|---|---|
| `kidsBg` | Fond | couleur | #0A1038 |  |
| `kidsBgTop` | Fond (haut du dégradé) | couleur | #101A56 |  |
| `kidsBgBottom` | Fond (bas du dégradé) | couleur | #070B27 |  |
| `kidsSurface` | Surface | couleur | #16215F |  |
| `kidsSurface2` | Surface secondaire | couleur | #1D2A78 |  |
| `kidsLine` | Bordures | couleur | #34459F |  |
| `kidsLineSoft` | Bordures discrètes | couleur | #2A3A8C |  |
| `kidsLineStrong` | Bordures marquées | couleur | #4A5DC0 |  |
| `kidsAccent` | Couleur principale | couleur | #FFC83D |  |
| `kidsAccentHover` | Couleur principale au survol | couleur | #FFD76E |  |
| `kidsOnAccent` | Texte posé sur la couleur principale | couleur | #1B1300 |  |
| `kidsText` | Texte principal | couleur | #F6F7FF |  |
| `kidsText2` | Texte secondaire | couleur | #D6DAFF |  |
| `kidsMuted` | Texte atténué | couleur | #AEB6EE |  |

Références de couleur utilisables dans les blocs (`style.bgColor`, `textColor`…) : `@accent` (Or (couleur principale)), `@accentLight` (Or clair), `@surface` (Surface), `@surface2` (Surface foncée), `@bg` (Fond du site), `@text` (Texte), `@muted` (Texte atténué), `@line` (Bordure), `@onAccent` (Texte sur l’or). Ou un code `#RRGGBB`.

**Contraste** : texte normal ≥ 4,5:1, grand texte et éléments d'interface ≥ 3:1 (WCAG AA). L'administration signale les contrastes faibles.

## 4. CSS (`theme.css`)

- Interdits : `@import`, `@charset`, `@namespace`, `expression()`, `behavior`, `-moz-binding`, `javascript:`, balises `<style>` / `<script>`, caractères `<` et `>`. Les commentaires sont retirés.
- `url()` : uniquement `url("assets/x.webp")` ou `url("fonts/x.woff2")` d'un fichier du thème, ou une petite image `data:image/...;base64,...`. Aucune adresse externe.
- Le CSS est chargé après les réglages : à spécificité égale, il gagne. Préférez des **variables** (`var(--accent)`, `var(--radius)`, `var(--surface)`, `var(--line)`, `var(--text)`, `var(--muted)`) aux couleurs écrites en dur, pour que les réglages de l'administrateur continuent de fonctionner.
- Arabe : le site passe en `html[dir="rtl"]`. Utilisez des propriétés logiques (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align: start`), pas `left` / `right`. Pas d'`letter-spacing` en arabe.
- Mobile d'abord : contrôlez 390, 768 et 1440 px. Seuils du site : téléphone ≤ 700 px, tablette 701–1024 px, ordinateur ≥ 1025 px.
- Les **jetons** du thème sont republiés avec un sélecteur plus fort que celui des habillages (`html[data-skin][lang][dir]`) : ils gagnent toujours, seulement pour les clés que le thème règle. Votre **CSS**, lui, suit les règles normales : pour battre une règle d'un habillage (`html[data-skin="nuit"] …`), préfixez vos sélecteurs par `html[data-skin][lang]`.
- Habillage actif : `html[data-skin="classique"] | html[data-skin="nuit"] | html[data-skin="bleu"] | html[data-skin="premium"]`. Pour cibler seulement une base, préfixez.
- L'espace Kids a son propre habillage (`body.kd-theme`) : ne changez pas ses polices ni ses couleurs sans besoin.

Classes de blocs (les plus utiles) : `.pb-hero` (+ `.h-s|m|l`, `.has-img`), `.pb-h`, `.pb-sub`, `.pb-rich`, `.pb-actions`, `.pb-image`, `.pb-cards` (+ `.c-2|3|4`), `.pb-card`, `.pb-card-body`, `.pb-quote`, `.pb-faq`, `.pb-cols` (+ `.n-1…4`), `.pb-col`, `.pb-talks`, `.pb-global`, `.btn`, `.btn.ghost`. La liste COMPLÈTE de toutes les classes du site est en annexe B.

## 5. Pages en blocs

Un fichier de page a la forme :

```json
{
  "meta": { "title": {"fr":"…"}, "description": {"fr":"…"}, "noindex": false, "hideOriginal": false },
  "zones": { "main": [ { "id": "aur-home-hero", "type": "hero", "props": { … }, "show": { "devices": ["m","t","d"], "audience": "all" }, "style": { … } } ] }
}
```

- `id` : 4 à 24 caractères `A-Za-z0-9_-`, **unique dans la page**.
- `type` : voir section 6. `props` : les champs du type. `show.devices` : `m` = Téléphone, `t` = Tablette, `d` = Ordinateur. `show.audience` : `all` (Tout le monde), `visitor` (Visiteurs non connectés), `member` (Membres connectés), `subscriber` (Abonnés (essai ou abonnement actif)), `free` (Membres sans abonnement).
- Maximum 60 blocs par zone, 250 Ko par page.
- `meta.hideOriginal` : masque le contenu d'origine, **seulement** sur les pages d'information masquables (tableau ci-dessous).

### 5.1 Types de pages et zones

| Clé dans theme.json | Genre de page | Zones | Adresse interne |
|---|---|---|---|
| `pages.home` | Accueil des membres | `main` (Contenu de la page) | `/_home` |
| `pages.catalogue` | Catalogue (habillage Premium) | `main` | `/_catalogue` |
| `pages.watch` | Fiche vidéo | `main` | `/_watch` |
| `pages.layout` | En-tête, menus et pied de page | `topbar` (Barre d’annonce (tout en haut du site, au-dessus de l’en-tête)), `footerTop` (Au-dessus du pied de page (sur toutes les pages)) | `/_layout` |
| `pages.func` | Pages à fonctions recomposées en sections (tarifs, compte, apprendre, série, chaîne…) | `main` | `/_func/<page>` |
| `pages.slots` | Toute autre page du site : blocs avant / après son contenu | `before`, `after` | l’adresse de la page (ex. `/pricing`) |
| `pages.custom` | Pages libres (`/p/<slug>`) | `main` | `/p/<slug>` |
| `globals` | Sections globales (réutilisables) | `main` | `/_global/<slug>` |

Une page « fonction » (`pages.func`) découpe une page à fonctions en **sections** que l'on déplace, masque et style : le code (paiement, quiz, lecteur, connexion) reste en place et chaque section est un bloc `f_<page>_<section>`. Tant qu'elle n'est pas publiée, la page d'origine s'affiche. Clés permises : `pricing`, `account`, `learning`, `series`, `channel`, `collection`, `library`.

| Clé (`pages.func`) | Page | Sections (types de blocs) |
|---|---|---|
| `pricing` | Tarifs (`/pricing`, adresse interne `/_func/pricing`) | `f_pricing_head`, `f_pricing_country`, `f_pricing_plans`, `f_pricing_methods`, `f_pricing_waiver`, `f_pricing_extras` |
| `account` | Mon compte (`/account`, adresse interne `/_func/account`) | `f_account_head`, `f_account_profile`, `f_account_security`, `f_account_data`, `f_account_billing`, `f_account_purchases`, `f_account_gifts`, `f_account_referral`, `f_account_notifs` |
| `learning` | Apprendre (`/learning`, adresse interne `/_func/learning`) | `f_learning_head`, `f_learning_today`, `f_learning_week`, `f_learning_next`, `f_learning_quiz`, `f_learning_revision`, `f_learning_cards`, `f_learning_series`, `f_learning_commit`, `f_learning_bilan`, `f_learning_stats` |
| `series` | Fiche série (`/series`, adresse interne `/_func/series`) | `f_series_hero`, `f_series_episodes`, `f_series_books` |
| `channel` | Page chaîne (`/chaines`, adresse interne `/_func/channel`) | `f_channel_head`, `f_channel_featured`, `f_channel_content` |
| `collection` | Page collection (`/collections`, adresse interne `/_func/collection`) | `f_collection_head`, `f_collection_talks` |
| `library` | Ma bibliothèque (`/library`, adresse interne `/_func/library`) | `f_library_head`, `f_library_resume`, `f_library_list`, `f_library_lists`, `f_library_notes` |

Une page « slot » (`pages.slots`) a les zones `before` et `after`. Le **contenu fonctionnel** (formulaire de connexion, paiement, lecteur…) reste toujours en place : les blocs sont posés autour.
Les adresses `/chose/*` s'appliquent à TOUTES les pages de ce genre (ex. `/conferences/*` = chaque vidéo). Liste des zones « toutes les pages de ce genre » : `/conferences/*`, `/series/*`, `/catalogue/*`, `/chaines/*`, `/collections/*`, `/shorts/*`, `/intervenants/*`, `/themes/*`, `/books/*`, `/events/*`, `/audyn/*`, `/coran/*`, `/legal/*`, `/kids/histoires/*`, `/kids/serie/*`, `/kids/univers/*`, `/kids/watch/*`, `/kids/shorts/*`.

### 5.2 Annuaire des pages qui acceptent des blocs (`pages.slots`)

Adresses permises : exactement celles du tableau (54 adresses).

| Adresse | Nom | Contenu d’origine masquable (`hideOriginal`) |
|---|---|---|
| `/` | Pages principales : Accueil (visiteurs) | non |
| `/catalogue` | Pages principales : Catalogue (page d’origine) | non |
| `/series` | Pages principales : Séries | non |
| `/themes` | Pages principales : Thèmes | non |
| `/chaines` | Pages principales : Chaînes | non |
| `/collections` | Pages principales : Collections | non |
| `/shorts` | Pages principales : Shorts | non |
| `/intervenants` | Pages principales : Intervenants | non |
| `/books` | Pages principales : Ouvrages | non |
| `/events` | Pages principales : Événements | non |
| `/live` | Pages principales : En direct | non |
| `/audyn` | Pages principales : Écoute (Audyn) | non |
| `/conferences/*` | Pages « toutes les pages de ce genre » : Chaque vidéo | non |
| `/series/*` | Pages « toutes les pages de ce genre » : Chaque série | non |
| `/catalogue/*` | Pages « toutes les pages de ce genre » : Chaque catégorie | non |
| `/chaines/*` | Pages « toutes les pages de ce genre » : Chaque chaîne | non |
| `/collections/*` | Pages « toutes les pages de ce genre » : Chaque collection | non |
| `/shorts/*` | Pages « toutes les pages de ce genre » : Chaque short | non |
| `/intervenants/*` | Pages « toutes les pages de ce genre » : Chaque intervenant | non |
| `/themes/*` | Pages « toutes les pages de ce genre » : Chaque thème | non |
| `/books/*` | Pages « toutes les pages de ce genre » : Chaque ouvrage | non |
| `/events/*` | Pages « toutes les pages de ce genre » : Chaque événement | non |
| `/audyn/*` | Pages « toutes les pages de ce genre » : Chaque écoute | non |
| `/coran/*` | Pages « toutes les pages de ce genre » : Chaque sourate | non |
| `/legal/*` | Pages « toutes les pages de ce genre » : Chaque page légale | oui |
| `/learning` | Apprendre et pratiquer : Apprentissage | non |
| `/pratique` | Apprendre et pratiquer : Pratique | non |
| `/priere` | Apprendre et pratiquer : Prière | non |
| `/adhkar` | Apprendre et pratiquer : Adhkar | non |
| `/coran` | Apprendre et pratiquer : Coran | non |
| `/ramadan` | Apprendre et pratiquer : Ramadan | non |
| `/pricing` | Compte et abonnement : Tarifs | non |
| `/login` | Compte et abonnement : Connexion | non |
| `/register` | Compte et abonnement : Inscription | non |
| `/forgot` | Compte et abonnement : Mot de passe oublié | non |
| `/account` | Compte et abonnement : Mon compte | non |
| `/library` | Compte et abonnement : Ma bibliothèque | non |
| `/lists` | Compte et abonnement : Mes listes | non |
| `/gift` | Compte et abonnement : Offrir un abonnement | non |
| `/redeem` | Compte et abonnement : Activer une carte cadeau | non |
| `/welcome` | Compte et abonnement : Bienvenue | oui |
| `/kids` | Espace enfants (Kids) : Accueil Kids | non |
| `/kids/histoires` | Espace enfants (Kids) : Histoires | non |
| `/kids/shorts` | Espace enfants (Kids) : Shorts Kids | non |
| `/kids/histoires/*` | Espace enfants (Kids) : Chaque histoire | non |
| `/kids/serie/*` | Espace enfants (Kids) : Chaque série Kids | non |
| `/kids/univers/*` | Espace enfants (Kids) : Chaque univers Kids | non |
| `/kids/watch/*` | Espace enfants (Kids) : Chaque vidéo Kids | non |
| `/kids/shorts/*` | Espace enfants (Kids) : Chaque short Kids | non |
| `/legal/mentions-legales` | Informations : Mentions légales | oui |
| `/legal/cgv` | Informations : Conditions générales de vente | oui |
| `/legal/confidentialite` | Informations : Confidentialité | oui |
| `/licences` | Informations : Licences | oui |
| `/application` | Informations : Application mobile | oui |

### 5.3 Espace Kids

L'espace enfants est ouvert aux blocs SIMPLES seulement : `hero`, `heading`, `text`, `image`, `button`, `cards`, `quote`, `faq`, `columns`, `spacer`, `divider`. Aucune donnée du catalogue adulte, aucune vidéo externe. Toute autre page Kids avec un autre bloc est refusée. Contenu adapté aux enfants obligatoire.

### 5.4 Images dans les pages

Écrivez `"image": "pack:assets/hero.webp"` (aussi dans `style.bgImage` et dans les éléments de listes comme les cartes). À l'installation, chaque image est ajoutée à la médiathèque du site. Le fichier doit exister dans le .zip.

## 6. Blocs

Règles : `global` ne peut pas contenir de `global` ; les types `w_*` n'existent que dans `pages.watch` ; les colonnes s'imbriquent sur deux niveaux ; les blocs `pm_*` ne s'affichent que sous l'habillage Premium ; les blocs « données du site » (talks, featured, mine…) se remplissent tout seuls et disparaissent s'il n'y a rien à montrer.

| Type | Nom | Catégorie | Dans Kids ? | Rôle |
|---|---|---|---|---|
| `hero` | Bannière | simple | oui | Grand bloc d’accueil : titre, texte, boutons, image de fond. |
| `heading` | Titre | simple | oui | Un titre de section, avec un sous-titre facultatif. |
| `text` | Texte | simple | oui | Paragraphes. **gras**, *italique*, [lien](adresse), « - » pour une liste. |
| `image` | Image | simple | oui | Une image envoyée depuis votre ordinateur. |
| `button` | Bouton | simple | oui | Un bouton qui mène vers une page. |
| `cards` | Cartes | simple | oui | Une grille de cartes (image, titre, texte, lien). |
| `talks` | Vidéos | simple | non | Une rangée de vidéos du catalogue (mise à jour automatique). |
| `quote` | Citation | simple | oui | Une phrase mise en valeur. |
| `faq` | Questions fréquentes | simple | oui | Questions et réponses qui se déplient. |
| `video` | Vidéo | simple | non | Une vidéo YouTube, Vimeo ou Dailymotion intégrée. |
| `featured` | À la une + Reprendre | données du site | non | Grande vidéo mise en avant (Admin → Vidéos → « À la une »), avec à droite la carte « Reprendre » de la personne connectée. |
| `mine` | Ma progression | données du site | non | Une rangée personnelle : à réviser, quiz à rattraper, ou vidéos en cours. Invisible si la personne n’a rien dedans ou n’est pas connectée. |
| `channels` | Chaînes à suivre | données du site | non | Des chaînes avec leur bouton « Suivre ». |
| `shorts` | Shorts | données du site | non | Une rangée des derniers extraits verticaux publiés par les chaînes. Invisible s’il n’y en a aucun ou si la fonction Shorts est coupée. |
| `collections` | Collections | données du site | non | Cycles, séries d’un intervenant et thèmes du moment (Studio → Collections). |
| `dayquote` | Citation du jour | données du site | non | Le verset ou le hadith du jour (Admin → Citations), identique pour tout le monde. |
| `series` | Séries | données du site | non | Une rangée de séries. |
| `catrows` | Rangées par catégorie | données du site | non | Une rangée par grande catégorie, les thèmes préférés de la personne connectée d’abord (« Pour vous »). |
| `kids` | Bande Espace Kids | données du site | non | Les dernières vidéos Kids. Invisible si l’Espace Kids est coupé (Admin → Paramètres). |
| `pm_hero` | Premium : la une | accueil Premium | non | Grande image de la une (vidéos choisies dans Admin → Vidéos → « À la une », à défaut les plus récentes), avec flèches et points. |
| `pm_universes` | Premium : univers (téléphone) | accueil Premium | non | Les quatre premières catégories en icônes. N’apparaît que sur téléphone. |
| `pm_continue` | Premium : continuer à regarder | accueil Premium | non | Vidéos commencées par la personne connectée. Invisible si elle n’en a pas. |
| `pm_rows` | Premium : rangées du catalogue | accueil Premium | non | Les rangées de l’accueil d’origine : nouveautés, « Pour vous », débutant, séries, rangées par catégorie. |
| `pm_collections` | Premium : collections | accueil Premium | non | Cycles, séries d’un intervenant et thèmes du moment (Studio → Collections) : les deux premières en grand cadre « Sélection », les autres en rangées. |
| `pm_spot` | Premium : sélection | accueil Premium | non | Une sélection en grand cadre (texte, deux affiches, image de fond), prise parmi les collections publiées sur l’accueil qui ont au moins 2 vidéos. À poser entre deux rangées. Invisible s’il n’y en a pas. |
| `pm_shorts` | Premium : shorts | accueil Premium | non | Rangée des derniers extraits verticaux. Invisible s’il n’y en a aucun. |
| `pm_kids` | Premium : encart Kids | accueil Premium | non | Dernières vidéos Kids (ou bannière illustrée s’il n’y en a pas). Invisible si l’Espace Kids est coupé. |
| `pm_learn` | Premium : bandeau Apprendre | accueil Premium | non | Bandeau « Mon espace Apprendre » avec la progression du parcours (formule Apprentissage). Invisible si Apprendre est coupé. |
| `pm_discover` | Premium : « La découverte continue » | accueil Premium | non | Bandeau de fin de page : une phrase d’invitation et le bouton « Voir tout le catalogue ». |
| `pm_cat_hero` | Catalogue : bannière et recherche | catalogue Premium | non | Bannière du Catalogue avec son titre, sa phrase et le champ de recherche. |
| `pm_cat_chips` | Catalogue : thèmes | catalogue Premium | non | Les puces des grands thèmes (avec leurs liens vers Shorts, Collections, Chaînes…). |
| `pm_cat_rails` | Catalogue : rangées par thème | catalogue Premium | non | Une rangée par grand thème tant qu’aucun filtre n’est choisi. |
| `pm_cat_results` | Catalogue : résultats et filtres | catalogue Premium | non | Formats, tri, filtres et grille des vidéos. C’est le cœur du Catalogue : il suit les choix de la personne. |
| `pm_cat_cross` | Catalogue : liens Apprendre et Kids | catalogue Premium | non | Les deux grandes cartes du bas du Catalogue (si ces rubriques sont actives). |
| `columns` | Colonnes | simple | oui | Une rangée de 2 à 4 colonnes : glissez d’autres blocs dans chaque colonne. Sur téléphone, les colonnes s’empilent. |
| `spacer` | Espace | simple | oui | Un espace vide entre deux blocs. |
| `divider` | Séparateur | simple | oui | Un trait fin. |
| `w_stage` | Fiche : lecteur et titre | fiche vidéo | non | Lien de retour, fil d’Ariane, lecteur vidéo, titre, actions (liste, partage, vitesse…). Ne le retirez pas : sans lui, plus de lecteur. |
| `w_notices` | Fiche : messages | fiche vidéo | non | Invitation à s’abonner, bandeaux de brouillon, quiz à reprendre, transcription en cours. |
| `w_grid` | Fiche : contenu et Apprendre | fiche vidéo | non | À gauche : modules, onglets (À propos, Questions, Notes), transcription. À côté : parcours Apprendre (quiz, révision, pratique) et épisodes de la série. |
| `w_next` | Fiche : à suivre | fiche vidéo | non | Rangée de vidéos « À suivre » / « Dans la même veine ». |
| `w_books` | Fiche : livres cités | fiche vidéo | non | Les livres liés à la vidéo, quand il y en a. |
| `global` | Section globale | simple | non | Une section réutilisable : modifiée une fois, elle change partout où elle est posée. Se crée avec « Rendre globale » sur un bloc. |
| `f_pricing_head` | Tarifs : titre et messages | page fonction « Tarifs » | non | Lien de retour, étapes, titre, essai gratuit, messages d’annulation ou de paiement indisponible. |
| `f_pricing_country` | Tarifs : pays | page fonction « Tarifs » | non | Choix du pays pour le tarif (seulement quand des tarifs par pays existent : Admin → Tarifs par pays). |
| `f_pricing_plans` | Tarifs : formules et abonnement | page fonction « Tarifs » | non | Les formules (mensuelle, annuelle) avec le bouton d’abonnement ou de gestion. Ne le retirez pas : sans lui, personne ne peut s’abonner. |
| `f_pricing_methods` | Tarifs : moyens de paiement | page fonction « Tarifs » | non | Carte, Apple Pay, Google Pay, PayPal… selon ce qui est activé. |
| `f_pricing_waiver` | Tarifs : renoncement et connexion | page fonction « Tarifs » | non | Case « renoncement au droit de rétractation » (obligatoire avant de s’abonner) et lien « j’ai déjà un compte ». Ne le retirez pas. |
| `f_pricing_extras` | Tarifs : cadeau et mentions | page fonction « Tarifs » | non | Bouton « Offrir un abonnement » et note de bas de page. |
| `f_account_head` | Mon compte : titre | page fonction « Mon compte » | non | Fil d’Ariane et « Bonjour … ». |
| `f_account_profile` | Mon compte : profil | page fonction « Mon compte » | non | Adresse e-mail, rôle, préférences, langue de l’interface, lien vers les réglages de prière. |
| `f_account_security` | Mon compte : sécurité | page fonction « Mon compte » | non | Mot de passe et double authentification. |
| `f_account_data` | Mon compte : mes données | page fonction « Mon compte » | non | Export et suppression des données personnelles (RGPD). Ne le retirez pas : c’est une obligation légale. |
| `f_account_billing` | Mon compte : abonnement | page fonction « Mon compte » | non | État de l’abonnement et bouton de gestion. |
| `f_account_purchases` | Mon compte : achats | page fonction « Mon compte » | non | Achats de la boutique (si la fonction est active). |
| `f_account_gifts` | Mon compte : cartes cadeaux | page fonction « Mon compte » | non | Cartes cadeaux achetées et reçues (si la fonction est active). |
| `f_account_referral` | Mon compte : parrainage | page fonction « Mon compte » | non | Lien et récompenses de parrainage (si la fonction est active). |
| `f_account_notifs` | Mon compte : notifications | page fonction « Mon compte » | non | Choix des e-mails reçus. |
| `f_learning_head` | Apprendre : titre | page fonction « Apprendre » | non | Salutation et phrase d’introduction. |
| `f_learning_today` | Apprendre : aujourd’hui | page fonction « Apprendre » | non | Bloc « Aujourd’hui », reprise de la dernière vidéo, quiz / engagement / série du moment. |
| `f_learning_week` | Apprendre : ma semaine | page fonction « Apprendre » | non | Planning de la semaine (à déplier). |
| `f_learning_next` | Apprendre : pour continuer | page fonction « Apprendre » | non | Rangée de vidéos « Pour continuer à apprendre ». |
| `f_learning_quiz` | Apprendre : quiz à passer | page fonction « Apprendre » | non | Liste des quiz en attente (si la fonction est active). |
| `f_learning_revision` | Apprendre : révisions du jour | page fonction « Apprendre » | non | Révision espacée, rappel et e-mail quotidien (si la fonction est active). |
| `f_learning_cards` | Apprendre : cartes mémoire | page fonction « Apprendre » | non | Cartes mémoire du jour (si la fonction est active). |
| `f_learning_series` | Apprendre : séries et attestations | page fonction « Apprendre » | non | Séries suivies et attestations. |
| `f_learning_commit` | Apprendre : engagements | page fonction « Apprendre » | non | Mes engagements (si la fonction est active). |
| `f_learning_bilan` | Apprendre : bilan | page fonction « Apprendre » | non | Bilan personnel et évolution (si la fonction est active). |
| `f_learning_stats` | Apprendre : statistiques | page fonction « Apprendre » | non | Série de jours, score, courbe et résultats récents. |
| `f_series_hero` | Fiche série : bannière | page fonction « Fiche série » | non | Titre, informations, description, prérequis et bouton « Regarder / Reprendre ». |
| `f_series_episodes` | Fiche série : saisons et épisodes | page fonction « Fiche série » | non | Choix de saison et liste des épisodes avec avancement. |
| `f_series_books` | Fiche série : livres liés | page fonction « Fiche série » | non | Livres associés à la série (si la fonction est active). |
| `f_channel_head` | Page chaîne : en-tête | page fonction « Page chaîne » | non | Fil d’Ariane, bannière, nom, abonnés, bouton Suivre, présentation et liens. |
| `f_channel_featured` | Page chaîne : vidéo à la une | page fonction « Page chaîne » | non | Vidéo mise en avant par la chaîne (si elle en a une). |
| `f_channel_content` | Page chaîne : vidéos et séries | page fonction « Page chaîne » | non | Onglets Vidéos, Shorts et Séries de la chaîne. |
| `f_collection_head` | Page collection : titre | page fonction « Page collection » | non | Retour, type, titre et présentation de la collection. |
| `f_collection_talks` | Page collection : vidéos | page fonction « Page collection » | non | Les vidéos de la collection dans l’ordre choisi. |
| `f_library_head` | Ma bibliothèque : titre | page fonction « Ma bibliothèque » | non | Fil d’Ariane et titre de la page. |
| `f_library_resume` | Ma bibliothèque : reprendre | page fonction « Ma bibliothèque » | non | Quiz à rattraper, vidéos en cours (« Reprendre ») et séries suivies. |
| `f_library_list` | Ma bibliothèque : ma liste | page fonction « Ma bibliothèque » | non | Favoris et « à regarder plus tard » réunis (si la fonction est active). |
| `f_library_lists` | Ma bibliothèque : mes listes | page fonction « Ma bibliothèque » | non | Listes personnelles et partagées (si la fonction est active). |
| `f_library_notes` | Ma bibliothèque : mes notes | page fonction « Ma bibliothèque » | non | Notes et repères pris pendant les vidéos (si la fonction est active). |

#### `hero` : Bannière

Grand bloc d’accueil : titre, texte, boutons, image de fond.

| Champ (`props`) | Valeur |
|---|---|
| `eyebrow` (Petit titre au-dessus) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `title` (Titre) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` (200 car. max) |
| `text` (Texte) | texte long par langue (Markdown léger) |
| `btn1Label` (Bouton 1 : texte) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `btn1Url` (Bouton 1 : adresse) | adresse : `/page`, `https://…`, `mailto:…` ou `tel:…` |
| `btn2Label` (Bouton 2 : texte) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `btn2Url` (Bouton 2 : adresse) | adresse : `/page`, `https://…`, `mailto:…` ou `tel:…` |
| `image` (Image de fond) | image : dans un thème, `"pack:assets/mon-image.webp"` |
| `overlay` (Assombrir l’image (%)) | nombre entier 0 à 90 ; défaut 55 |
| `height` (Hauteur) | choix : `s` (Basse), `m` (Moyenne), `l` (Haute) ; défaut `m` |

Exemple de `props` :
```json
{"title":{"fr":"Un titre qui donne envie"},"text":{"fr":"Une ou deux phrases pour présenter ce que l’on trouve ici."},"btn1Label":{"fr":"Découvrir"},"btn1Url":"/"}
```

#### `heading` : Titre

Un titre de section, avec un sous-titre facultatif.

| Champ (`props`) | Valeur |
|---|---|
| `title` (Titre) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `subtitle` (Sous-titre) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `level` (Niveau) | choix : `h2` (Grand (H2)), `h3` (Moyen (H3)) ; défaut `h2` |

Exemple de `props` :
```json
{"title":{"fr":"Nouveau titre"}}
```

#### `text` : Texte

Paragraphes. **gras**, *italique*, [lien](adresse), « - » pour une liste.

| Champ (`props`) | Valeur |
|---|---|
| `body` (Texte) | texte long par langue (Markdown léger) |

Exemple de `props` :
```json
{"body":{"fr":"Écrivez votre texte ici."}}
```

#### `image` : Image

Une image envoyée depuis votre ordinateur.

| Champ (`props`) | Valeur |
|---|---|
| `image` (Image) | image : dans un thème, `"pack:assets/mon-image.webp"` |
| `alt` (Description (pour les malvoyants)) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `caption` (Légende) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `link` (Adresse du lien (facultatif)) | adresse : `/page`, `https://…`, `mailto:…` ou `tel:…` |
| `size` (Largeur) | choix : `full` (Pleine), `wide` (Large), `medium` (Moyenne), `small` (Petite) ; défaut `wide` |

#### `button` : Bouton

Un bouton qui mène vers une page.

| Champ (`props`) | Valeur |
|---|---|
| `label` (Texte du bouton) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `url` (Adresse) | adresse : `/page`, `https://…`, `mailto:…` ou `tel:…` |
| `kind` (Style) | choix : `primary` (Plein (or)), `ghost` (Contour) ; défaut `primary` |

Exemple de `props` :
```json
{"label":{"fr":"En savoir plus"},"url":"/"}
```

#### `cards` : Cartes

Une grille de cartes (image, titre, texte, lien).

| Champ (`props`) | Valeur |
|---|---|
| `columns` (Colonnes (ordinateur)) | choix : `2` (2), `3` (3), `4` (4) ; défaut `3` |
| `items` (Cartes) | liste de 12 Carte(s) au plus, chacun avec : `image` (image), `title` (texte court par langue), `text` (texte long par langue (Markdown léger) (600 car. max)), `link` (adresse) |

Exemple de `props` :
```json
{"items":[{"title":{"fr":"Première carte"},"text":{"fr":"Un court texte."}},{"title":{"fr":"Deuxième carte"},"text":{"fr":"Un court texte."}},{"title":{"fr":"Troisième carte"},"text":{"fr":"Un court texte."}}]}
```

#### `talks` : Vidéos

Une rangée de vidéos du catalogue (mise à jour automatique).

| Champ (`props`) | Valeur |
|---|---|
| `title` (Titre de la rangée) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `source` (Quelles vidéos) | choix : `latest` (Les plus récentes), `category` (D’une catégorie) ; défaut `latest` |
| `category` (Numéro de la catégorie (Admin → Catégories)) | nombre entier 0 à 100000 ; défaut 0 |
| `level` (Niveau) | choix : `` (Tous), `beginner` (Débutant), `intermediate` (Intermédiaire), `advanced` (Avancé) ; défaut `` |
| `limit` (Nombre de vidéos) | nombre entier 1 à 12 ; défaut 4 |
| `moreLabel` (Lien « Tout voir » : texte) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `moreUrl` (Lien « Tout voir » : adresse) | adresse : `/page`, `https://…`, `mailto:…` ou `tel:…` |

Exemple de `props` :
```json
{"title":{"fr":"Nouveautés"}}
```

#### `quote` : Citation

Une phrase mise en valeur.

| Champ (`props`) | Valeur |
|---|---|
| `text` (Citation) | texte long par langue (Markdown léger) (600 car. max) |
| `author` (Auteur) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |

Exemple de `props` :
```json
{"text":{"fr":"Une belle phrase à retenir."}}
```

#### `faq` : Questions fréquentes

Questions et réponses qui se déplient.

| Champ (`props`) | Valeur |
|---|---|
| `title` (Titre) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `items` (Questions) | liste de 20 Question(s) au plus, chacun avec : `q` (texte court par langue), `a` (texte long par langue (Markdown léger) (1500 car. max)) |

Exemple de `props` :
```json
{"title":{"fr":"Questions fréquentes"},"items":[{"q":{"fr":"Une question ?"},"a":{"fr":"Une réponse."}}]}
```

#### `video` : Vidéo

Une vidéo YouTube, Vimeo ou Dailymotion intégrée.

| Champ (`props`) | Valeur |
|---|---|
| `url` (Adresse de la vidéo (YouTube, Vimeo ou Dailymotion)) | adresse YouTube, Vimeo ou Dailymotion |
| `title` (Titre de la vidéo) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |

#### `featured` : À la une + Reprendre

Grande vidéo mise en avant (Admin → Vidéos → « À la une »), avec à droite la carte « Reprendre » de la personne connectée.

| Champ (`props`) | Valeur |
|---|---|
| `layout` (Vidéos à la une) | choix : `auto` (Plusieurs, qui défilent), `fixed` (Une seule, fixe) ; défaut `auto` |
| `resume` (Carte « Reprendre ») | choix : `yes` (Oui (si une vidéo est en cours)), `no` (Non) ; défaut `yes` |

#### `mine` : Ma progression

Une rangée personnelle : à réviser, quiz à rattraper, ou vidéos en cours. Invisible si la personne n’a rien dedans ou n’est pas connectée.

| Champ (`props`) | Valeur |
|---|---|
| `what` (Contenu) | choix : `review` (À réviser aujourd’hui), `quiz` (Quiz à rattraper), `continue` (Continuer à regarder) ; défaut `review` |

Exemple de `props` :
```json
{"what":"review"}
```

#### `channels` : Chaînes à suivre

Des chaînes avec leur bouton « Suivre ».

| Champ (`props`) | Valeur |
|---|---|
| `title` (Titre (à défaut : « Chaînes à suivre »)) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `limit` (Nombre de chaînes) | nombre entier 1 à 10 ; défaut 5 |
| `order` (Ordre) | choix : `new` (Celles que la personne ne suit pas encore, d’abord), `popular` (Les plus suivies), `alpha` (Ordre alphabétique) ; défaut `new` |

#### `shorts` : Shorts

Une rangée des derniers extraits verticaux publiés par les chaînes. Invisible s’il n’y en a aucun ou si la fonction Shorts est coupée.

| Champ (`props`) | Valeur |
|---|---|
| `title` (Titre (à défaut : « Shorts »)) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `limit` (Nombre de shorts) | nombre entier 2 à 20 ; défaut 8 |

#### `collections` : Collections

Cycles, séries d’un intervenant et thèmes du moment (Studio → Collections).

| Champ (`props`) | Valeur |
|---|---|
| `title` (Titre (à défaut : « Collections »)) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `limit` (Nombre de collections) | nombre entier 1 à 12 ; défaut 3 |

#### `dayquote` : Citation du jour

Le verset ou le hadith du jour (Admin → Citations), identique pour tout le monde.

| Champ (`props`) | Valeur |
|---|---|
| `style` (Présentation) | choix : `framed` (Grand cadre), `compact` (Compacte) ; défaut `framed` |

#### `series` : Séries

Une rangée de séries.

| Champ (`props`) | Valeur |
|---|---|
| `title` (Titre (à défaut : « Séries »)) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `limit` (Nombre de séries) | nombre entier 1 à 12 ; défaut 8 |

#### `catrows` : Rangées par catégorie

Une rangée par grande catégorie, les thèmes préférés de la personne connectée d’abord (« Pour vous »).

| Champ (`props`) | Valeur |
|---|---|
| `max` (Nombre de rangées) | nombre entier 1 à 12 ; défaut 4 |

#### `kids` : Bande Espace Kids

Les dernières vidéos Kids. Invisible si l’Espace Kids est coupé (Admin → Paramètres).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `pm_hero` : Premium : la une

Grande image de la une (vidéos choisies dans Admin → Vidéos → « À la une », à défaut les plus récentes), avec flèches et points.

| Champ (`props`) | Valeur |
|---|---|
| `count` (Nombre de vidéos qui défilent) | choix : `1` (1 (fixe)), `3` (3), `5` (5) ; défaut `5` |

Exemple de `props` :
```json
{"count":"5"}
```

#### `pm_universes` : Premium : univers (téléphone)

Les quatre premières catégories en icônes. N’apparaît que sur téléphone.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `pm_continue` : Premium : continuer à regarder

Vidéos commencées par la personne connectée. Invisible si elle n’en a pas.

| Champ (`props`) | Valeur |
|---|---|
| `title` (Titre (à défaut : « Continuer à regarder »)) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `limit` (Nombre de vidéos) | nombre entier 1 à 10 ; défaut 10 |

Exemple de `props` :
```json
{"limit":10}
```

#### `pm_rows` : Premium : rangées du catalogue

Les rangées de l’accueil d’origine : nouveautés, « Pour vous », débutant, séries, rangées par catégorie.

| Champ (`props`) | Valeur |
|---|---|
| `max` (Nombre de rangées) | nombre entier 1 à 12 ; défaut 12 |

Exemple de `props` :
```json
{"max":12}
```

#### `pm_collections` : Premium : collections

Cycles, séries d’un intervenant et thèmes du moment (Studio → Collections) : les deux premières en grand cadre « Sélection », les autres en rangées.

| Champ (`props`) | Valeur |
|---|---|
| `limit` (Nombre de collections) | nombre entier 1 à 12 ; défaut 12 |
| `spots` (Sélections en grand cadre) | choix : `1` (Oui (les deux premières)), `0` (Non : rangées seulement) ; défaut `1` |

Exemple de `props` :
```json
{"limit":12,"spots":"1"}
```

#### `pm_spot` : Premium : sélection

Une sélection en grand cadre (texte, deux affiches, image de fond), prise parmi les collections publiées sur l’accueil qui ont au moins 2 vidéos. À poser entre deux rangées. Invisible s’il n’y en a pas.

| Champ (`props`) | Valeur |
|---|---|
| `n` (Quelle sélection) | choix : `1` (La première), `2` (La deuxième) ; défaut `1` |

Exemple de `props` :
```json
{"n":"1"}
```

#### `pm_shorts` : Premium : shorts

Rangée des derniers extraits verticaux. Invisible s’il n’y en a aucun.

| Champ (`props`) | Valeur |
|---|---|
| `title` (Titre (à défaut : « Shorts »)) | texte court par langue : `{"fr":"…","en":"…","ar":"…"}` |
| `limit` (Nombre de shorts) | nombre entier 2 à 20 ; défaut 10 |

Exemple de `props` :
```json
{"limit":10}
```

#### `pm_kids` : Premium : encart Kids

Dernières vidéos Kids (ou bannière illustrée s’il n’y en a pas). Invisible si l’Espace Kids est coupé.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `pm_learn` : Premium : bandeau Apprendre

Bandeau « Mon espace Apprendre » avec la progression du parcours (formule Apprentissage). Invisible si Apprendre est coupé.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `pm_discover` : Premium : « La découverte continue »

Bandeau de fin de page : une phrase d’invitation et le bouton « Voir tout le catalogue ».

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `pm_cat_hero` : Catalogue : bannière et recherche

Bannière du Catalogue avec son titre, sa phrase et le champ de recherche.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `pm_cat_chips` : Catalogue : thèmes

Les puces des grands thèmes (avec leurs liens vers Shorts, Collections, Chaînes…).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `pm_cat_rails` : Catalogue : rangées par thème

Une rangée par grand thème tant qu’aucun filtre n’est choisi.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `pm_cat_results` : Catalogue : résultats et filtres

Formats, tri, filtres et grille des vidéos. C’est le cœur du Catalogue : il suit les choix de la personne.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `pm_cat_cross` : Catalogue : liens Apprendre et Kids

Les deux grandes cartes du bas du Catalogue (si ces rubriques sont actives).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `columns` : Colonnes

Une rangée de 2 à 4 colonnes : glissez d’autres blocs dans chaque colonne. Sur téléphone, les colonnes s’empilent.

Bloc conteneur : ses blocs enfants sont dans `cols` (liste de colonnes, chacune une liste de blocs). Deux niveaux d’imbrication au plus, 4 colonnes, 20 blocs par colonne.

| Champ (`props`) | Valeur |
|---|---|
| `count` (Nombre de colonnes) | choix : `1` (1), `2` (2), `3` (3), `4` (4) ; défaut `2` |
| `ratio` (Proportions (2 colonnes)) | choix : `` (Égales), `1-2` (Étroite puis large), `2-1` (Large puis étroite) ; défaut `` |
| `gap` (Espace entre colonnes) | choix : `s` (Petit), `m` (Moyen), `l` (Grand) ; défaut `m` |
| `valign` (Alignement vertical) | choix : `start` (En haut), `center` (Au milieu), `end` (En bas) ; défaut `start` |
| `stack` (Empiler sur) | choix : `m` (Téléphone), `t` (Téléphone et tablette) ; défaut `m` |

Exemple de `props` :
```json
{"count":"2"}
```

#### `spacer` : Espace

Un espace vide entre deux blocs.

| Champ (`props`) | Valeur |
|---|---|
| `size` (Hauteur (px)) | nombre entier 8 à 240 ; défaut 40 |

#### `divider` : Séparateur

Un trait fin.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `w_stage` : Fiche : lecteur et titre

Lien de retour, fil d’Ariane, lecteur vidéo, titre, actions (liste, partage, vitesse…). Ne le retirez pas : sans lui, plus de lecteur.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `w_notices` : Fiche : messages

Invitation à s’abonner, bandeaux de brouillon, quiz à reprendre, transcription en cours.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `w_grid` : Fiche : contenu et Apprendre

À gauche : modules, onglets (À propos, Questions, Notes), transcription. À côté : parcours Apprendre (quiz, révision, pratique) et épisodes de la série.

| Champ (`props`) | Valeur |
|---|---|
| `side` (Place du parcours Apprendre) | choix : `right` (À droite), `left` (À gauche), `below` (Sous le contenu), `hidden` (Masqué) ; défaut `right` |

#### `w_next` : Fiche : à suivre

Rangée de vidéos « À suivre » / « Dans la même veine ».

| Champ (`props`) | Valeur |
|---|---|
| `max` (Nombre de vidéos) | nombre entier 2 à 8 ; défaut 8 |

#### `w_books` : Fiche : livres cités

Les livres liés à la vidéo, quand il y en a.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `global` : Section globale

Une section réutilisable : modifiée une fois, elle change partout où elle est posée. Se crée avec « Rendre globale » sur un bloc.

| Champ (`props`) | Valeur |
|---|---|
| `ref` (Section globale) | nom d’une section globale (`aurore-infolettre`) |

#### `f_pricing_head` : Tarifs : titre et messages

Lien de retour, étapes, titre, essai gratuit, messages d’annulation ou de paiement indisponible.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_pricing_country` : Tarifs : pays

Choix du pays pour le tarif (seulement quand des tarifs par pays existent : Admin → Tarifs par pays).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_pricing_plans` : Tarifs : formules et abonnement

Les formules (mensuelle, annuelle) avec le bouton d’abonnement ou de gestion. Ne le retirez pas : sans lui, personne ne peut s’abonner.

| Champ (`props`) | Valeur |
|---|---|
| `tiers` (Formules affichées) | choix : `all` (Toutes), `standard` (Seulement Mejliss), `learning` (Seulement Apprentissage) ; défaut `all` |

#### `f_pricing_methods` : Tarifs : moyens de paiement

Carte, Apple Pay, Google Pay, PayPal… selon ce qui est activé.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_pricing_waiver` : Tarifs : renoncement et connexion

Case « renoncement au droit de rétractation » (obligatoire avant de s’abonner) et lien « j’ai déjà un compte ». Ne le retirez pas.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_pricing_extras` : Tarifs : cadeau et mentions

Bouton « Offrir un abonnement » et note de bas de page.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_account_head` : Mon compte : titre

Fil d’Ariane et « Bonjour … ».

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_account_profile` : Mon compte : profil

Adresse e-mail, rôle, préférences, langue de l’interface, lien vers les réglages de prière.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_account_security` : Mon compte : sécurité

Mot de passe et double authentification.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_account_data` : Mon compte : mes données

Export et suppression des données personnelles (RGPD). Ne le retirez pas : c’est une obligation légale.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_account_billing` : Mon compte : abonnement

État de l’abonnement et bouton de gestion.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_account_purchases` : Mon compte : achats

Achats de la boutique (si la fonction est active).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_account_gifts` : Mon compte : cartes cadeaux

Cartes cadeaux achetées et reçues (si la fonction est active).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_account_referral` : Mon compte : parrainage

Lien et récompenses de parrainage (si la fonction est active).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_account_notifs` : Mon compte : notifications

Choix des e-mails reçus.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_learning_head` : Apprendre : titre

Salutation et phrase d’introduction.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_learning_today` : Apprendre : aujourd’hui

Bloc « Aujourd’hui », reprise de la dernière vidéo, quiz / engagement / série du moment.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_learning_week` : Apprendre : ma semaine

Planning de la semaine (à déplier).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_learning_next` : Apprendre : pour continuer

Rangée de vidéos « Pour continuer à apprendre ».

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_learning_quiz` : Apprendre : quiz à passer

Liste des quiz en attente (si la fonction est active).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_learning_revision` : Apprendre : révisions du jour

Révision espacée, rappel et e-mail quotidien (si la fonction est active).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_learning_cards` : Apprendre : cartes mémoire

Cartes mémoire du jour (si la fonction est active).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_learning_series` : Apprendre : séries et attestations

Séries suivies et attestations.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_learning_commit` : Apprendre : engagements

Mes engagements (si la fonction est active).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_learning_bilan` : Apprendre : bilan

Bilan personnel et évolution (si la fonction est active).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_learning_stats` : Apprendre : statistiques

Série de jours, score, courbe et résultats récents.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_series_hero` : Fiche série : bannière

Titre, informations, description, prérequis et bouton « Regarder / Reprendre ».

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_series_episodes` : Fiche série : saisons et épisodes

Choix de saison et liste des épisodes avec avancement.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_series_books` : Fiche série : livres liés

Livres associés à la série (si la fonction est active).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_channel_head` : Page chaîne : en-tête

Fil d’Ariane, bannière, nom, abonnés, bouton Suivre, présentation et liens.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_channel_featured` : Page chaîne : vidéo à la une

Vidéo mise en avant par la chaîne (si elle en a une).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_channel_content` : Page chaîne : vidéos et séries

Onglets Vidéos, Shorts et Séries de la chaîne.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_collection_head` : Page collection : titre

Retour, type, titre et présentation de la collection.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_collection_talks` : Page collection : vidéos

Les vidéos de la collection dans l’ordre choisi.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_library_head` : Ma bibliothèque : titre

Fil d’Ariane et titre de la page.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_library_resume` : Ma bibliothèque : reprendre

Quiz à rattraper, vidéos en cours (« Reprendre ») et séries suivies.

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_library_list` : Ma bibliothèque : ma liste

Favoris et « à regarder plus tard » réunis (si la fonction est active).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_library_lists` : Ma bibliothèque : mes listes

Listes personnelles et partagées (si la fonction est active).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

#### `f_library_notes` : Ma bibliothèque : mes notes

Notes et repères pris pendant les vidéos (si la fonction est active).

Aucun champ : le bloc se règle uniquement par `style` et `show`.

### 6.1 Réglages de style communs (`style`)

Tous facultatifs ; une valeur absente = réglage du thème.

| Clé | Valeur |
|---|---|
| `textColor`, `bgColor` | couleur `#RRGGBB(AA)` ou référence `@accent`, `@surface`… |
| `bgImage` | `pack:assets/x.webp` |
| `align`, `alignM` | start \| center \| end (alignM = téléphone) |
| `maxWidth` | full \| wide \| narrow |
| `padTop`, `padBottom` (+ `padTopT`, `padBottomT`, `padTopM`, `padBottomM`) | entier 0 à 240 px |
| `radius` | entier 0 à 60 |
| `minHeight`, `minHeightM` | entier 0 à 1200 |
| `shadow` | `soft` \| `strong` |
| `border` | `true` |
| `font` | `DM Sans Variable`, `Montserrat Variable`, `Fredoka Variable`, `Noto Sans Arabic Variable`, `Noto Kufi Arabic Variable`, `Inter Variable`, `Poppins`, `Amiri`, `Marcellus`, `Playfair Display Variable`, `Lora Variable`, `Nunito Variable`, `Open Sans Variable`, `Cairo Variable`, `Tajawal`, `Système`, `Serif` |
| `hover` | lift \| zoom \| glow \| bright |
| `hoverBg`, `hoverText` | couleur |
| `anim` | fade \| up \| down \| left \| right \| zoom |
| `animDelay` | entier 0 à 2000 ms |
| `elTitleColor` | couleur |
| `elTitleSize` | entier 12 à 120 |
| `elTitleWeight` | graisse 400 \| 500 \| 600 \| 700 \| 800 |
| `elTextColor` | couleur |
| `elTextSize` | entier 10 à 40 |
| `elBtnBg` | couleur |
| `elBtnColor` | couleur |
| `elBtnRadius` | entier 0 à 999 |
| `elImgRadius` | entier 0 à 200 |

## 7. Annuaire COMPLET des routes du site

100 routes, lues dans le code (`web/app`). « Zone de blocs » = adresse à mettre dans `pages.slots`. Les routes sans zone ne reçoivent pas de blocs : elles se règlent par les jetons et le CSS.

| Route du site | Espace | Zone de blocs (`pages.slots`) | Nom |
|---|---|---|---|
| `/` | public / membre | `/` | Accueil (visiteurs) |
| `/account` | public / membre | `/account` | Mon compte |
| `/adhkar` | public / membre | `/adhkar` | Adhkar |
| `/admin` | Administration | non (CSS seulement) |  |
| `/apercu-theme` | technique | non (CSS seulement) |  |
| `/application` | public / membre | `/application` | Application mobile |
| `/attestation/[code]` | technique | non (CSS seulement) |  |
| `/audyn` | technique | `/audyn` | Écoute (Audyn) |
| `/audyn/[id]` | technique | `/audyn/*` | Chaque écoute |
| `/books` | public / membre | `/books` | Ouvrages |
| `/books/[id]` | public / membre | `/books/*` | Chaque ouvrage |
| `/catalogue` | public / membre | `/catalogue` | Catalogue (page d’origine) |
| `/catalogue/[slug]` | public / membre | `/catalogue/*` | Chaque catégorie |
| `/chaines` | public / membre | `/chaines` | Chaînes |
| `/chaines/[slug]` | public / membre | `/chaines/*` | Chaque chaîne |
| `/collections` | public / membre | `/collections` | Collections |
| `/collections/[id]` | public / membre | `/collections/*` | Chaque collection |
| `/conferences/[slug]` | public / membre | `/conferences/*` | Chaque vidéo |
| `/coran` | public / membre | `/coran` | Coran |
| `/coran/[n]` | public / membre | `/coran/*` | Chaque sourate |
| `/editeur` | technique | non (CSS seulement) |  |
| `/events` | public / membre | `/events` | Événements |
| `/events/[id]` | public / membre | `/events/*` | Chaque événement |
| `/fiche/[id]` | technique | non (CSS seulement) |  |
| `/forgot` | public / membre | `/forgot` | Mot de passe oublié |
| `/gift` | public / membre | `/gift` | Offrir un abonnement |
| `/intervenants` | public / membre | `/intervenants` | Intervenants |
| `/intervenants/[slug]` | public / membre | `/intervenants/*` | Chaque intervenant |
| `/kids` | Kids | `/kids` | Accueil Kids |
| `/kids/histoires` | Kids | `/kids/histoires` | Histoires |
| `/kids/histoires/[id]` | Kids | `/kids/histoires/*` | Chaque histoire |
| `/kids/serie/[id]` | Kids | `/kids/serie/*` | Chaque série Kids |
| `/kids/shorts` | Kids | `/kids/shorts` | Shorts Kids |
| `/kids/shorts/[id]` | Kids | `/kids/shorts/*` | Chaque short Kids |
| `/kids/univers/[slug]` | Kids | `/kids/univers/*` | Chaque univers Kids |
| `/kids/watch/[id]` | Kids | `/kids/watch/*` | Chaque vidéo Kids |
| `/l/[token]` | technique | non (CSS seulement) |  |
| `/learning` | public / membre | `/learning` | Apprentissage |
| `/legal/[slug]` | public / membre | `/legal/*` | Chaque page légale |
| `/library` | public / membre | `/library` | Ma bibliothèque |
| `/licences` | public / membre | `/licences` | Licences |
| `/lists` | public / membre | `/lists` | Mes listes |
| `/live` | public / membre | `/live` | En direct |
| `/login` | public / membre | `/login` | Connexion |
| `/organizer` | Organisateur | non (CSS seulement) |  |
| `/p/[slug]` | public / membre | aucune zone (voir CSS) |  |
| `/pb-preview` | technique | non (CSS seulement) |  |
| `/pratique` | public / membre | `/pratique` | Pratique |
| `/pricing` | public / membre | `/pricing` | Tarifs |
| `/priere` | public / membre | `/priere` | Prière |
| `/ramadan` | public / membre | `/ramadan` | Ramadan |
| `/rapport-annonceur/[token]` | technique | non (CSS seulement) |  |
| `/redeem` | technique | `/redeem` | Activer une carte cadeau |
| `/register` | public / membre | `/register` | Inscription |
| `/reset` | public / membre | aucune zone (voir CSS) |  |
| `/series` | public / membre | `/series` | Séries |
| `/series/[id]` | public / membre | `/series/*` | Chaque série |
| `/shorts` | public / membre | `/shorts` | Shorts |
| `/shorts/[id]` | public / membre | `/shorts/*` | Chaque short |
| `/studio` | Studio | non (CSS seulement) |  |
| `/studio/[id]` | Studio | non (CSS seulement) |  |
| `/studio/[id]/content` | Studio | non (CSS seulement) |  |
| `/studio/activity` | Studio | non (CSS seulement) |  |
| `/studio/audyn` | Studio | non (CSS seulement) |  |
| `/studio/audyn/[id]` | Studio | non (CSS seulement) |  |
| `/studio/books` | Studio | non (CSS seulement) |  |
| `/studio/books/[id]` | Studio | non (CSS seulement) |  |
| `/studio/channel` | Studio | non (CSS seulement) |  |
| `/studio/collections` | Studio | non (CSS seulement) |  |
| `/studio/contents` | Studio | non (CSS seulement) |  |
| `/studio/corrections` | Studio | non (CSS seulement) |  |
| `/studio/dubbing` | Studio | non (CSS seulement) |  |
| `/studio/dubbing/[id]` | Studio | non (CSS seulement) |  |
| `/studio/editor` | Studio | non (CSS seulement) |  |
| `/studio/editor/[id]` | Studio | non (CSS seulement) |  |
| `/studio/editor/[id]/replace` | Studio | non (CSS seulement) |  |
| `/studio/editor/[id]/shorts` | Studio | non (CSS seulement) |  |
| `/studio/events` | Studio | non (CSS seulement) |  |
| `/studio/live` | Studio | non (CSS seulement) |  |
| `/studio/moderation` | Studio | non (CSS seulement) |  |
| `/studio/new` | Studio | non (CSS seulement) |  |
| `/studio/practice` | Studio | non (CSS seulement) |  |
| `/studio/quiz` | Studio | non (CSS seulement) |  |
| `/studio/references` | Studio | non (CSS seulement) |  |
| `/studio/reminders` | Studio | non (CSS seulement) |  |
| `/studio/revenue` | Studio | non (CSS seulement) |  |
| `/studio/series` | Studio | non (CSS seulement) |  |
| `/studio/series/[id]` | Studio | non (CSS seulement) |  |
| `/studio/settings` | Studio | non (CSS seulement) |  |
| `/studio/settings/storage` | Studio | non (CSS seulement) |  |
| `/studio/shorts` | Studio | non (CSS seulement) |  |
| `/studio/stats` | Studio | non (CSS seulement) |  |
| `/studio/subtitles` | Studio | non (CSS seulement) |  |
| `/studio/subtitles/quality` | Studio | non (CSS seulement) |  |
| `/talks/[id]` | public / membre | `/conferences/*` | Chaque vidéo |
| `/themes` | public / membre | `/themes` | Thèmes |
| `/themes/[id]` | public / membre | `/themes/*` | Chaque thème |
| `/tv` | public / membre | aucune zone (voir CSS) |  |
| `/unsubscribe/[token]` | technique | non (CSS seulement) |  |
| `/welcome` | technique | `/welcome` | Bienvenue |

Pages spéciales hors de cet annuaire : accueil des membres (`pages.home`), catalogue Premium (`pages.catalogue`), fiche vidéo (`pages.watch`), en-tête / menus / pied de page (`pages.layout`).
Menus (en-tête, menu latéral, barre du bas, pied de page) : leurs liens se règlent dans Admin → Menus, pas dans un thème.

## 8. Fonctions du site

Chaque fonction peut être activée ou coupée par l'administrateur (Admin → Fonctions). Un thème doit rester correct quand une fonction est coupée : ne mettez jamais de bouton ou de lien obligatoire vers une fonction sans prévoir son absence. Un thème ne change pas leur fonctionnement.

#### Catalogue

| Fonction | Identifiant | Rôle |
|---|---|---|
| Séries et épisodes | `series` | Regroupements ordonnés en saisons et épisodes |
| Veille des chaînes | `watch` | Suivre des chaînes YouTube / Dailymotion / Vimeo et recevoir les nouvelles vidéos dans l'admin (administrateur seulement) |
| Saisons (Ramadan, Hajj, Mawlid, Achoura) | `seasons` | Bandeau et rangée sur l'accueil pendant les grandes périodes du calendrier hégirien, notification une fois par an (réglages dans Admin → Saisons) |
| Vendredi (Al-Kahf, ablutions, prière sur le Prophète) | `friday` | Carte sur l'accueil le vendredi, rangée « Vidéos du vendredi » et notification facultative (réglages dans Admin → Vendredi ; désactivé tant qu'il n'est pas réglé) |
| Circuit de Ramadan (30 jours) | `ramadan` | Actions du jour pendant Ramadan (saisies et validées dans Admin → Ramadan), suivi des tarawih, rappel quotidien ; gratuit pour tout membre connecté |
| Accueil des nouveaux membres | `onboarding` | Écran « Par quoi commencer ? » (3 cartes, une seule fois, nouveaux comptes uniquement) et visite guidée en bulles (relançable depuis le menu du compte) |
| Lecture du Coran en 30 jours | `quranplan` | 1 juz par jour, case « lu », progression, rappel quotidien facultatif ; gratuit pour tout membre connecté (sur la page Coran) |
| Coran (lecteur) | `quran` | Texte arabe, traductions, phonétique et tafsir, verset par verset (contenus importés dans Admin → Coran) |
| Collections | `collections` | Sélections éditoriales de vidéos |
| Ouvrages | `books` | Livres et PDF liés aux vidéos |
| Audyn — livres audio et histoires du soir | `audyn` | Contenus audio avec chapitres : livres audio pour les adultes, histoires du soir pour les enfants. Formule « Apprentissage », aperçu gratuit |
| Chaînes | `channels` | Pages de chaînes (ex-intervenants), propriétaire organisateur, Studio « Ma chaîne » |
| Shorts | `shorts` | Extraits verticaux publiés par les chaînes : fil vertical, accueil, page de la chaîne ; l'espace Kids n'en montre que pour ses vidéos |
| Publicité au lancement de l'application | `ads` | Publicité plein écran (photo ou vidéo) au lancement de l'application, passable ; jamais dans l'espace Kids ni pendant l'heure de prière. Gérée dans Admin → Publicités |
| Tests A/B | `experiments` | Compare deux versions d'une zone du site (ex. la bannière de l'accueil visiteur) et mesure laquelle donne le plus d'inscriptions. Gérés dans Admin → Tests A/B ; sans test en cours, le site est inchangé |
| Menus personnalisés | `menus` | Les menus créés dans Admin → Menus (haut, latéral, barre du bas, pied de page, application). Coupée : le site et l'application reprennent leurs menus d'origine |
| Import de vidéos externes | `media_import` | Copier chez nous une vidéo YouTube, Vimeo, archive.org ou d'un autre site (déclaration des droits obligatoire, journal) pour la monter, la doubler et la mettre en extraits |

#### Apprentissage

| Fonction | Identifiant | Rôle |
|---|---|---|
| Compteur d'athkar (Apprentissage) | `athkar` | Compteur quotidien des dhikr saisis et validés dans Admin → Adhkar, objectif, série de jours, rappel facultatif ; réservé à la formule Apprentissage |
| Quiz | `quiz` | Questions après chaque vidéo, avec explication |
| Mise en pratique | `practice` | Écran « Et maintenant, que faire ? » |
| Références citées | `references` | Versets et hadiths cités dans la vidéo, avec lien vers le passage |
| Corrections des sous-titres | `corrections` | Les membres proposent une correction d'une phrase ; l'organisateur ou un modérateur la valide |
| Révision espacée | `revision` | Notions à revoir et rappels |
| Cartes mémoire | `memorycards` | Cartes recto/verso tirées des quiz, avec révision espacée |
| Questions sur la vidéo (assistant IA) | `ask` | Le membre « Apprentissage » pose une question ; réponse tirée de la transcription, avec le passage horodaté. Coût IA : plafonds dans Paramètres |
| Mon bilan personnel | `selfcheck` | Objectifs et notes privées |
| Parcours et attestations | `learning` | Tableau de bord d'apprentissage et attestations |
| Notes sur les vidéos | `notes` | Prise de notes pendant la lecture |

#### Communauté

| Fonction | Identifiant | Rôle |
|---|---|---|
| Favoris | `favorites` | Cœur sur les vignettes |
| À regarder plus tard | `watchlater` | Liste personnelle distincte des favoris : bouton sur les vignettes et la page de la vidéo, onglet dans Ma bibliothèque, rangée sur l’accueil |
| Événements en direct | `events` | Annonce de conférences en direct : page des événements, fichier agenda (.ics), « Me rappeler », direct YouTube / Vimeo intégré, rediffusion rattachée à une conférence |
| TV en direct | `livetv` | Chaînes YouTube diffusées 24 h/24 (ex. La Mecque, Médine) : page « TV en direct » du site, de l’application et de la télé, gérée dans Studio → TV en direct ; lecteur YouTube officiel, direct en cours retrouvé automatiquement. Indépendante des événements en direct |
| Listes de lecture | `lists` | Listes personnelles et partage par lien |
| Suivre un intervenant | `follow` | Bouton Suivre, alertes par e-mail et notifications sur téléphone |
| Citation du jour | `citations` | Verset ou hadith affiché sur l'accueil |
| Prière : pause et horaires | `prayer` | Pastille « Prochaine prière » dans l'en-tête, pause de la lecture à l'heure de la prière (blocage souple de 10 minutes), horaires calculés par le site selon l'endroit où se trouve la personne |
| Mejliss Kids | `kids` | Univers enfants séparé |
| Statistiques d'audience | `stats` | Mesure anonyme des vues |

#### Argent

| Fonction | Identifiant | Rôle |
|---|---|---|
| Cartes cadeaux | `gifts` | Offrir un abonnement |
| Contenus payants à l'unité | `sales` | Vidéos et contenus Audyn vendus ou loués à part (prix fixés dans le Studio), même pour les abonnés (réduction possible) ; « Mes achats » dans Mon compte |
| Tarifs par pays | `regional_pricing` | Prix adaptés au pays choisi par le membre sur la page Abonnement (groupes définis dans Admin → Tarifs par pays) |
| Parrainage | `referral` | Lien personnel : un mois offert au parrain et au filleul au premier paiement du filleul |
| Rémunération des chaînes | `revenue` | Partage des abonnements entre les chaînes selon le temps de visionnage ; relevés Studio, clôture mensuelle et suivi des paiements |

#### Communication

| Fonction | Identifiant | Rôle |
|---|---|---|
| Notifications dans le navigateur | `webpush` | Les membres peuvent recevoir les notifications (nouveautés, sélection de la semaine, révision) directement dans leur navigateur ou le site installé |
| Sélection de la semaine | `weekly` | E-mail hebdomadaire (pour les membres qui l'ont demandé) |
| Annonce des nouvelles vidéos | `announce` | E-mail aux abonnés d'un intervenant |

#### Accès

| Fonction | Identifiant | Rôle |
|---|---|---|
| Application installable | `app_install` | Icône sur l’écran d’accueil, plein écran, page hors connexion, page « Télécharger l’application » |
| Mises à jour de l'application | `appupdates` | L'application Android propose le nouvel APK et reçoit les mises à jour de son contenu depuis le serveur (la fabrication sur GitHub publie ici) |
| Hors connexion (application) | `offline` | L'application Android permet de télécharger une vidéo (audio ou vidéo) pour la regarder sans connexion ; réservé aux abonnés, valable une durée réglable |
| Vitrine visiteur | `showcase` | Page d'accueil des visiteurs non connectés : méthode, exemple de vidéo avec quiz, tarifs |
| Inscription ouverte | `registration` | Création de compte par le public |
| Mode maintenance | `maintenance` | Le site affiche une page d'attente aux visiteurs ; les administrateurs gardent l'accès |

Fonctions toujours présentes (code, non désactivables par un thème) : lecteur vidéo (HLS, sous-titres, chapitres), quiz et révision espacée, paiement Stripe (6,99 €/mois, 69,99 €/an, essai 7 jours, codes promo, cartes cadeaux), connexion / inscription / mot de passe, compte, abonnement, Kids, Studio, administration. Habillez-les (couleurs, arrondis, polices, CSS) ; ne les cachez pas.

## 9. Règles de qualité

1. **Fidélité à la marque** : noir et or d'origine = `accent` doré ; un thème est libre, mais gardez des textes lisibles (blanc pur sur fond sombre).
2. **Trois langues** : chaque texte visible a `fr`, `en`, `ar`. L'arabe est relu de droite à gauche.
3. **Responsive** : 390 → 1440 px, sans défilement horizontal.
4. **Accessibilité** : contrastes WCAG AA, focus visible conservé (ne retirez jamais `outline` sans remplacement), images avec `alt`.
5. **Pas de dépendance externe** : tout est dans le .zip (polices, images). Aucun CDN.
6. **Pas de secrets** : jamais de clé, mot de passe ni adresse privée dans un thème.
7. **Droits** : polices et images libres de droits (indiquez la licence dans `README.md`).
8. **Légal** : ne pas masquer ni déformer les pages légales ; le pied de page garde les trois liens obligatoires.
9. **Sobriété** : CSS court (< 30 Ko idéal), images optimisées (webp), polices en woff2.
10. **Réversible** : tout ce que fait le thème doit pouvoir être défait par « Désactiver ».

## 10. Checklist « rien d'oublié »

Pour CHAQUE ligne, contrôlez : visiteur et connecté, FR / EN / AR, 390 / 768 / 1440 px, et, quand elle existe, la fonction coupée.

- [ ] `theme.json` valide (`node api/theme-kit/validate.mjs` → ✓)
- [ ] aperçu `assets/preview.png` fourni
- [ ] jetons : contrastes, arrondis, polices (FR et AR)
- [ ] `pages.home`, `pages.catalogue`, `pages.watch`, `pages.layout` (ou volontairement absentes)
- [ ] `pages.func` : `pricing`, `account`, `learning`, `series`, `channel`, `collection`, `library` (ou volontairement absentes)
- [ ] `/` (zone `/`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/account` (zone `/account`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/adhkar` (zone `/adhkar`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/application` (zone `/application`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/books` (zone `/books`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/books/[id]` (zone `/books/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/catalogue` (zone `/catalogue`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/catalogue/[slug]` (zone `/catalogue/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/chaines` (zone `/chaines`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/chaines/[slug]` (zone `/chaines/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/collections` (zone `/collections`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/collections/[id]` (zone `/collections/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/conferences/[slug]` (zone `/conferences/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/coran` (zone `/coran`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/coran/[n]` (zone `/coran/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/events` (zone `/events`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/events/[id]` (zone `/events/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/forgot` (zone `/forgot`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/gift` (zone `/gift`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/intervenants` (zone `/intervenants`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/intervenants/[slug]` (zone `/intervenants/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/kids` (zone `/kids`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/kids/histoires` (zone `/kids/histoires`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/kids/histoires/[id]` (zone `/kids/histoires/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/kids/serie/[id]` (zone `/kids/serie/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/kids/shorts` (zone `/kids/shorts`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/kids/shorts/[id]` (zone `/kids/shorts/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/kids/univers/[slug]` (zone `/kids/univers/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/kids/watch/[id]` (zone `/kids/watch/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/learning` (zone `/learning`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/legal/[slug]` (zone `/legal/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/library` (zone `/library`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/licences` (zone `/licences`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/lists` (zone `/lists`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/live` (zone `/live`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/login` (zone `/login`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/p/[slug]` : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/pratique` (zone `/pratique`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/pricing` (zone `/pricing`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/priere` (zone `/priere`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/ramadan` (zone `/ramadan`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/register` (zone `/register`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/reset` : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/series` (zone `/series`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/series/[id]` (zone `/series/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/shorts` (zone `/shorts`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/shorts/[id]` (zone `/shorts/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/talks/[id]` (zone `/conferences/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/themes` (zone `/themes`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/themes/[id]` (zone `/themes/*`) : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base
- [ ] `/tv` : visiteur et connecté · FR, EN, AR (RTL) · 390, 768, 1440 px · clair/foncé selon base

Écrans à ne pas oublier (réglés par les jetons et le CSS, jamais par des blocs) :
- [ ] `/admin` (admin) : contraste et lisibilité, 390 et 1440 px
- [ ] `/apercu-theme` (technique) : contraste et lisibilité, 390 et 1440 px
- [ ] `/attestation/[code]` (technique) : contraste et lisibilité, 390 et 1440 px
- [ ] `/audyn` (technique) : contraste et lisibilité, 390 et 1440 px
- [ ] `/audyn/[id]` (technique) : contraste et lisibilité, 390 et 1440 px
- [ ] `/editeur` (technique) : contraste et lisibilité, 390 et 1440 px
- [ ] `/fiche/[id]` (technique) : contraste et lisibilité, 390 et 1440 px
- [ ] `/l/[token]` (technique) : contraste et lisibilité, 390 et 1440 px
- [ ] `/organizer` (organisateur) : contraste et lisibilité, 390 et 1440 px
- [ ] `/pb-preview` (technique) : contraste et lisibilité, 390 et 1440 px
- [ ] `/rapport-annonceur/[token]` (technique) : contraste et lisibilité, 390 et 1440 px
- [ ] `/redeem` (technique) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/[id]` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/[id]/content` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/activity` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/audyn` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/audyn/[id]` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/books` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/books/[id]` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/channel` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/collections` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/contents` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/corrections` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/dubbing` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/dubbing/[id]` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/editor` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/editor/[id]` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/editor/[id]/replace` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/editor/[id]/shorts` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/events` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/live` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/moderation` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/new` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/practice` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/quiz` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/references` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/reminders` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/revenue` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/series` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/series/[id]` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/settings` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/settings/storage` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/shorts` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/stats` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/subtitles` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/studio/subtitles/quality` (studio) : contraste et lisibilité, 390 et 1440 px
- [ ] `/unsubscribe/[token]` (technique) : contraste et lisibilité, 390 et 1440 px
- [ ] `/welcome` (technique) : contraste et lisibilité, 390 et 1440 px

Fonctions à contrôler (activées ET coupées) :
- [ ] Séries et épisodes (`series`)
- [ ] Veille des chaînes (`watch`)
- [ ] Saisons (Ramadan, Hajj, Mawlid, Achoura) (`seasons`)
- [ ] Compteur d'athkar (Apprentissage) (`athkar`)
- [ ] Vendredi (Al-Kahf, ablutions, prière sur le Prophète) (`friday`)
- [ ] Circuit de Ramadan (30 jours) (`ramadan`)
- [ ] Accueil des nouveaux membres (`onboarding`)
- [ ] Lecture du Coran en 30 jours (`quranplan`)
- [ ] Coran (lecteur) (`quran`)
- [ ] Collections (`collections`)
- [ ] Ouvrages (`books`)
- [ ] Audyn — livres audio et histoires du soir (`audyn`)
- [ ] Quiz (`quiz`)
- [ ] Mise en pratique (`practice`)
- [ ] Références citées (`references`)
- [ ] Corrections des sous-titres (`corrections`)
- [ ] Révision espacée (`revision`)
- [ ] Cartes mémoire (`memorycards`)
- [ ] Questions sur la vidéo (assistant IA) (`ask`)
- [ ] Mon bilan personnel (`selfcheck`)
- [ ] Parcours et attestations (`learning`)
- [ ] Notes sur les vidéos (`notes`)
- [ ] Favoris (`favorites`)
- [ ] À regarder plus tard (`watchlater`)
- [ ] Événements en direct (`events`)
- [ ] TV en direct (`livetv`)
- [ ] Listes de lecture (`lists`)
- [ ] Chaînes (`channels`)
- [ ] Shorts (`shorts`)
- [ ] Publicité au lancement de l'application (`ads`)
- [ ] Tests A/B (`experiments`)
- [ ] Menus personnalisés (`menus`)
- [ ] Import de vidéos externes (`media_import`)
- [ ] Suivre un intervenant (`follow`)
- [ ] Citation du jour (`citations`)
- [ ] Notifications dans le navigateur (`webpush`)
- [ ] Application installable (`app_install`)
- [ ] Prière : pause et horaires (`prayer`)
- [ ] Mises à jour de l'application (`appupdates`)
- [ ] Hors connexion (application) (`offline`)
- [ ] Mejliss Kids (`kids`)
- [ ] Vitrine visiteur (`showcase`)
- [ ] Statistiques d'audience (`stats`)
- [ ] Cartes cadeaux (`gifts`)
- [ ] Contenus payants à l'unité (`sales`)
- [ ] Tarifs par pays (`regional_pricing`)
- [ ] Parrainage (`referral`)
- [ ] Rémunération des chaînes (`revenue`)
- [ ] Sélection de la semaine (`weekly`)
- [ ] Annonce des nouvelles vidéos (`announce`)
- [ ] Inscription ouverte (`registration`)
- [ ] Mode maintenance (`maintenance`)

## 11. Modèle de demande à une IA

> Tu es ingénieur front-end. Crée un thème Mejliss TV nommé « <NOM> » (id « <id> »), style « <description du style> ». Respecte à la lettre le GUIDE-IA.md joint et pars de l'exemple « Aurore » (`example.zip`). Fournis : theme.json, theme.css, pages/*.json (accueil, catalogue, fiche vidéo, en-tête/pied, au moins les zones /pricing, /login, /register, /account, une page libre, une section globale, deux modèles), assets (images générées en webp) et fonts. Chaque texte en fr, en, ar. Parcours la checklist de la section 10 ligne par ligne et dis-moi ce qui n'a pas été vérifié. Lance `node api/theme-kit/validate.mjs` jusqu'à obtenir ✓, puis `build.mjs`.

## Annexe A : réglages Premium (rôles de couleur)

Les clés `pm*` (voir section 3, groupes « Thème Premium ») ne s'appliquent que si la base est `premium`. Elles recolorent toutes les nuances d'un même rôle sur tout le site Premium.

## Annexe B : toutes les classes CSS du site

Liste lue dans `web/app/*.css` (3674 classes). Une classe existante peut être redéfinie ; n'en inventez pas : elle ne ferait rien.

#### back.css (811 classes)

.aa-actions .aa-ar .aa-ar-big .aa-banner .aa-bar .aa-card .aa-cards .aa-checks .aa-cols .aa-ctl .aa-filters .aa-fr .aa-grid .aa-head .aa-help .aa-kpi .aa-kpis .aa-layout .aa-lbl .aa-meta .aa-note .aa-ph .aa-pick .aa-rv .aa-rvbar .aa-rvcard .aa-rvhead .aa-rvside .aa-search .aa-seg .aa-selall .aa-sw .aa-tags .aa-theme .aa-themes .ac-actions .ac-btn .ac-chip .ac-heavy .ac-heavy-row .ac-hours .ac-light .ac-list .ac-prio .ac-section .ac-sel .ac-side .ac-state .ac-task .ac-title .ac-window .adm-bulk .adm-bulk-del .adm-cards .adm-dialog .adm-filters .adm-form .adm-group-body .adm-langs .adm-off .adm-src .adm-table-wrap .adm-tabs .admin-card .admin-cards .adp-back .adp-bar .adp-foot .adp-input .adp-kbd .adp-kind .adp-list .adp-none .adp-open .adr-link .ap-ctl .ap-err .ap-font-form .ap-font-list .ap-font-sample .ap-fonts .ap-group .ap-group-body .ap-hex .ap-label .ap-num .ap-opacity .ap-reset .ap-row .ask-adm-grid .ask-adm-item .ay-aud .ay-audio .ay-badge .ay-bk-cat .ay-bk-del .ay-cat-btns .ay-cat-del .ay-cat-filter .ay-cat-list .ay-cat-name .ay-ch-cat .ay-ch-chap .ay-ch-ctl .ay-ch-desc .ay-ch-detail .ay-ch-fr .ay-ch-list .ay-ch-opts .ay-ch-ph .ay-ch-row .ay-ch-t .ay-ch-tools .ay-chapter .ay-chapters .ay-cover .ay-failed .ay-form .ay-h2 .ay-h3 .ay-head-btns .ay-job-t .ay-jobs .ay-link .ay-link-row .ay-list .ay-row .ay-sthumb .ay-sub .ay-table .ay-table-list .ay-wrap .bad .banner .big .bk-col .bk-coveredit .bk-kids .bk-panel .bk-rights .bk-sel .bk-upload .bk-url .box .btn .cadm .cadm-act .cadm-badge .cadm-bar .cadm-color .cadm-del .cadm-form .cadm-grid .cadm-ico .cadm-lang .cadm-name .cadm-prev .cadm-row .cadm-side .cadm-sm .cadm-sub .cadm-sw .cadm-tabs .cadm-talks .cadm-tile .cadm-tr .cadm-tree .camp-item .camp-list .card .cat-actions .cat-add .cat-edit .cat-name .ch-banner .ch-bar .ch-card .ch-card-head .ch-form .ch-images .ch-img-actions .ch-img-banner .ch-img-block .ch-li-text .ch-new .ch-pick .ch-studio .ch-team .ch-two .check .chk .co-btns .co-editor .co-hits .co-items .co-preview .co-row .co-rule .col .cr-add .cr-changed .cr-comment .cr-del .cr-diff .cr-edit .cr-group .cr-item .cr-item-head .crit .ct-replace .ct-tools .danger-link .danger-zone .dash .dash-cols .db-actions .db-add-grid .db-add-wrap .db-adv .db-adv-body .db-archived .db-audio .db-avatar .db-bar .db-check .db-chip .db-crumbs .db-form .db-gl-form .db-gl-list .db-gl-opts .db-gl-pair .db-gl-preview .db-glossary .db-grid .db-head-actions .db-job .db-keep .db-kpi .db-kpis .db-link .db-listen .db-mention .db-mono .db-note .db-presets .db-req .db-review .db-review-state .db-row .db-say .db-segs .db-slider .db-slider-top .db-soon .db-st .db-status .db-target-pick .db-textcell .db-track .db-vcard .db-vcards .db-voice .db-voice-actions .db-voice-list .db-voice-name .db-voice-selects .db-voices .disk .drag .dragging .dropzone .dub .editable .editing .end .error .evn-form .evn-row .fd-fs .flagged .fld .focus .free .ft-alert .ft-grid .ft-group .ft-knob .ft-msg .ft-row .ft-switch .gold .gr-card .gr-cell .gr-empty .gr-fhead .gr-funnel .gr-hint .gr-table .gr-track .gr-wrap .health-actions .health-badge .health-banner .health-bar .health-code .health-gauge-head .health-grid .health-grid-cards .health-key .health-line .health-muted .health-ok .health-pct .health-pill .health-spark .health-tables .health-warn-text .hit .hs-name .icon-btn .imp-panel .import-head .import-opts .import-row .in .inactive .keep .kpi .kr-actions .kr-form .kr-list .kr-new .kr-row .lb-title .linkrow .lv-admin .lv-btns .lv-err .lv-info .lv-preview .lv-thumb .manage-head .md-card .md-details .md-head .md-item .md-list .md-title .mem .menu-open .meta .mn-acts .mn-admin .mn-check .mn-checks .mn-child .mn-editor .mn-form .mn-found .mn-item .mn-kind .mn-list .mn-loc .mn-locs .mn-off .mn-row .mn-txt .moved .moving .mt-actions .mt-add .mt-backbtn .mt-badge .mt-bigplay .mt-block .mt-bottom .mt-cap .mt-caption .mt-check .mt-chev .mt-clip .mt-clip-body .mt-clock .mt-del .mt-desk .mt-dress .mt-dress-banner .mt-dress-card .mt-dress-card-in .mt-dress-dip .mt-dress-logo .mt-dress-subs .mt-dress-title .mt-drop .mt-editor .mt-editor-wrap .mt-empty .mt-field .mt-final .mt-frame-box .mt-free .mt-full .mt-gold .mt-guide .mt-handle .mt-head .mt-head-ruler .mt-hidden-audio .mt-hint .mt-home .mt-item .mt-items .mt-join .mt-keys .mt-kv .mt-lane .mt-left .mt-legend .mt-list .mt-lock .mt-logo-card .mt-logo-grid .mt-logostrip .mt-look .mt-main .mt-mclip .mt-mlist .mt-modal .mt-modal-box .mt-music-row .mt-notice .mt-on .mt-panel .mt-playhead .mt-preview .mt-pz .mt-pzbar .mt-readonly .mt-render-box .mt-render-go .mt-render-kind .mt-render-kinds .mt-render-line .mt-render-list .mt-render-old .mt-render-opts .mt-render-row .mt-render-st .mt-render-video .mt-render-warn .mt-right .mt-round .mt-row .mt-row-dub .mt-row-music .mt-row-orig .mt-row-subs .mt-row-titles .mt-row-video .mt-ruler .mt-ruler-row .mt-safe .mt-savetpl .mt-screen .mt-screen-msg .mt-search .mt-seg .mt-slider .mt-small .mt-sw .mt-tag .mt-tclip .mt-textmode .mt-tick .mt-tl .mt-tl-inner .mt-tl-scroll .mt-tools .mt-top .mt-top-actions .mt-tplrow .mt-tr-span .mt-transport .mt-trbtn .mt-try .mt-two .mt-upload .mt-ver .mt-ver-form .mt-ver-list .mt-wave .mt-zoom .mt-zoom-btns .mts .mts-cap .mts-check .mts-clock .mts-empty .mts-follow .mts-form .mts-frame .mts-main .mts-manual .mts-manual-row .mts-phone .mts-seg .mts-segs .mts-shade .mts-src .mts-stage .mts-tabs .mts-text .mts-times .mts-track .mts-transport .mts-video .mtw .mtw-actions .mtw-align .mtw-arrow .mtw-bar .mtw-foot .mtw-hits .mtw-msg .mtw-seg .mtw-status .mtw-tabs .mtw-text .mtw-time .mtw-w .muted .mx-actions .mx-after .mx-bang .mx-banner .mx-cap .mx-checks .mx-compare .mx-diff .mx-done .mx-dot .mx-keep .mx-link .mx-media .mx-page .mx-ph .mx-row .mx-rows .mx-side .mx-steps .mx-tick .mx-two .n2 .n3 .na .off .on .orig .out .over .panel-actions .paused .pd-dash .pd-label .pd-lang .pd-legend .pd-prod .pd-sep .pd-stages .pd-table .pd-views .pill .pill-select .preview-card .qa .qa-card .qa-cards .qa-ctl .qa-kinds .qa-lic .qa-opt .qa-panel .qa-state .qa-steps .qa-tabs .qa-title .qr-preset .quiz-card .qz-actions .qz-at .qz-card .qz-count .qz-form .qz-gen .qz-group .qz-head .qz-list-head .qz-missing .qz-opt-edit .qz-origin .qz-tick .reg-card .reg-list .rejected .rf-card .rf-grid .rf-quote .right .rights .rm-filters .rm-form .rm-head .rm-item .rm-panel .rm-row .rm-tag .rm-tools .role-card .role-cards .row-click .rv-card .rv-cards .rv-carried .rv-draft .rv-due .rv-paid .rv-rolled .rv-st .savebar-opts .sd-act .sd-actions .sd-bar .sd-big .sd-card-head .sd-chip .sd-chipbtn .sd-chips .sd-dash .sd-dl .sd-down .sd-dur .sd-followers .sd-head-actions .sd-job .sd-last .sd-list .sd-meter .sd-more .sd-note .sd-pill .sd-play .sd-poster .sd-row .sd-row-3 .sd-row-top .sd-see .sd-side-bar .sd-side-head .sd-side-space .sd-tabs .sd-tabs-n .sd-tool .sd-tool-ico .sd-tools .sd-up .seg-pager .seg-time .seg-undo .sel .set-card .set-cards .set-fields .set-pill .set-wide .sg-alert .sg-bar .sg-chip .sg-grid .sg-item .sg-item-act .sg-items .sg-key .sg-kpi-v .sg-kpis .sg-link .sg-measured .sg-num .sg-pill .sg-prov .sg-providers .sg-rule .sg-same .sg-save .sg-switch .sg-test .sg-two .sg-where .sg-wide .sh-li .sh-li-act .sh-list .sh-state .sh-thumb .sh-title-edit .sheet .sheet-body .sheet-sec .sheet-stats .small .spk-admin-head .spk-dot .spk-final .spk-head .spk-panel .spk-pitch-foot .spk-range .spk-range-row .spk-voices .square .sr-access .sr-addbar .sr-ep .sr-handle .sr-image .sr-move .sr-num .sr-poster .sr-savebtns .sr-season-head .sr-season-tools .sr-toggle .sr-tools .st-failed .st-ready .st-running .stat .state-draft .state-err .state-live .state-review .state-run .state-sched .step-err .step-none .step-ok .step-run .step-wait .studio .studio-admin .studio-backdrop .studio-brand .studio-burger .studio-group .studio-group-title .studio-search .studio-side .studio-soon .studio-stats .studio-table .studio-table-wrap .studio-talk .studio-thumb .studio-user .sub .table-wrap .th-fs .thumb-actions .thumb-cur .thumb-opts .thumb-row .thumbs .todo .track-err .track-head .track-state .tt-bar .tt-card .tt-check .tt-err .tt-field .tt-fields .tt-group .tt-list .tt-orig .tt-pager .tt-save .tt-save-btns .tt-search .two .upbar .upbar-top .upname .users-bar .users-table .warn .watch-add .watch-list .watch-new .watch-row .watch-thumb .wiz-actions .wiz-form .wiz-grid .wiz-right .xp-best .xp-form .xp-item .xp-lang .xp-list .xp-table

#### globals.css (2087 classes)

.aa .aa-banner .aa-bar .aa-checks .aa-filters .aa-form .aa-head .aa-help .aa-kpi .aa-list .aa-note .aa-pick .aa-rvprog .aa-search .aa-seg .aa-selall .aa-sw .aa-tag-warn .aa-tags .aa-theme .about-text .ac-bar .ac-chip .ac-count .ac-hours .ac-kind .ac-main .ac-page .ac-pos .ac-state .ac-task .ac-title .accepted .acct .acct-prayer-link .acct-sec .achieved .act .adm-between .adm-bulk .adm-card .adm-danger .adm-dialog .adm-field .adm-form .adm-group .adm-group-head .adm-help .adm-label .adm-modal .adm-ok .adm-row .adm-savebar .adm-secret .adm-sub .adm-table .adm-table-wrap .adm-tabs .admin .admin-card .admin-cards .admin-table .adp .adp-open .adr-axis .adr-curve .adr-kpis .adr-page .adr-table .adr-table-wrap .advanced .ai .al-center .al-end .al-m-center .al-m-end .al-m-start .already .alt .ap .ap-actions .ap-chev .ap-ctl .ap-editor .ap-font-form .ap-font-list .ap-fonts .ap-frame-box .ap-group .ap-issues .ap-label .ap-layout .ap-mini .ap-more .ap-more-menu .ap-msg .ap-num .ap-opacity .ap-page .ap-pill .ap-preview .ap-preview-bar .ap-row .ap-save .ap-search .ap-seg .ap-status .ap-tag .ap-theme .ap-top .ap-versions .ap-views .app-promo .app-promo-cta .app-promo-drawer .app-promo-link .app-promo-logo .app-promo-os-row .app-promo-text .approved .archived .ask-a .ask-actions .ask-adm-item .ask-bar .ask-box .ask-form .ask-note .ask-q .ask-refusal .ask-src .ask-turn .ask-turns .at .at-ar .at-card .at-cats .at-goal .at-h .at-item .at-layout .at-list .at-listhead .at-main .at-moment .at-moments .at-n .at-ph .at-prefs .at-ref .at-row .at-sb-l .at-sb-m .at-sb-s .at-side .at-size-btn .at-size-l .at-size-s .at-sizes .at-state .at-streak .at-sw .at-tap .at-tr .attest .attest-code .attest-date .attest-facts .attest-lead .attest-name .attest-note .attest-page .attest-print .attest-series .audio-badge .audio-stage .audio-veil .aw-bar .aw-bar-tools .aw-box .aw-btn .aw-card .aw-cats .aw-chapters .aw-cont .aw-cont-card .aw-cont-link .aw-cont-row .aw-ctl .aw-dark .aw-desc .aw-h1 .aw-h2 .aw-head .aw-hero .aw-hero-art .aw-hero-bg .aw-info .aw-list .aw-ph .aw-row .aw-search .aw-seek .aw-tag .aw-talk .aw-thumb .aw-thumb-ph .aw-title .aw-tools .ay-badge .ay-chapter .ay-form .ay-src .ay-table .back .bad .badge .badge-inline .banner .banner-bg .banner-body .banner-dots .banner-meta .banner-shade .banner-summary .banner-video .base .beginner .best .big .billing .bk-bar .bk-block .bk-card .bk-col .bk-control .bk-cover .bk-coveredit .bk-desc .bk-ed .bk-eds .bk-files .bk-grid .bk-head .bk-langs .bk-links .bk-panel .bk-pdf .bk-row .bk-shop .bk-targets .blocked .btn .btn-lg .c-3 .c-4 .camp-admin .camp-form .camp-info .camp-item .camp-thumb .card .card-lite .card-remove .cast-ctl .cast-panel .cat-add .cat-bar .cat-edit .cat-list .cat-sub .catalogue .cg-chips .cg-filters .cg-subs .ch-avatar .ch-avatar-img .ch-avatar-lg .ch-banner .ch-banner-sm .ch-chip .ch-facts .ch-featured .ch-filter .ch-followed .ch-followed-sec .ch-head .ch-head-text .ch-img-actions .ch-li-text .ch-links .ch-new .ch-owner .ch-pick .ch-picker .ch-sec .ch-socials .ch-tagline .ch-team .changed .chapters .check .chip .chip-err .chips .chk .cinema-on .cit-ar .cit-card .cit-compact .cit-fr .cit-framed .cit-label .cit-main .cit-mark .cit-more .cit-share .claimed .clamp .co-editor .co-hits .co-items .co-list .co-row .col .col-body .col-card .col-grid .col-thumb .compact .continue .cpk .cpk-box .cpk-child .cpk-chip .cpk-chosen .cpk-empty .cpk-list .cpk-panel .cpk-row .cpk-tabs .cpk-tag .cpk-tools .cr-actions .cr-btn .cr-done .cr-form .cr-ok .crit .crumbs .ct .ct-stats .ct-tools .ctg-crumbs .ctg-empty .ctg-head .ctg-ico .ctg-n .ctg-page .ctg-pager .ctg-subs .ctg-tile .ctg-tiles .cur .cut .d .danger .dash-h .dash-health .dash-list .dash-ok .dash-todo .db-add .db-add-grid .db-adv .db-audio .db-avatar .db-bar .db-check .db-crumbs .db-edit .db-engine .db-filter .db-gl-pair .db-gl-preview .db-glossary .db-head-actions .db-job-top .db-keep .db-listen .db-page .db-queue .db-row .db-say .db-segs .db-slider .db-slider-top .db-st .db-table .db-tag .db-text .db-textcell .db-vcard .db-vcard-txt .db-voice-main .db-voice-name .details .dirty .done .dot .down .dr .dr-backdrop .dr-foot .dr-kids .dr-lang .dr-nav .dr-sep .dr-top .dr-who .dropzone .dub .dub-badge .dub-card .dub-done .dub-dot .dub-missing .dub-missing-act .dub-note .dub-opt .dub-opts .dub-row .dur .edit-on .el-bb .el-bc .el-br .el-ir .el-tc .el-ts .el-tw .el-xc .el-xs .em-actions .em-bar .em-body .em-head .em-hint .em-hover .em-key .em-panel .em-pen .empty .empty-actions .empty-body .empty-compact .empty-ico .empty-text .empty-title .end .engine-table .err .error .ev-cols .ev-item .ev-list .ev-month .evn-actions .evn-badge .evn-band .evn-card .evn-desc .evn-form .evn-head .evn-list .evn-note .evn-player .ext-cc .ext-frame .ext-player .ext-sub .eyebrow .fail .failed .fav .fc .fc-bar .fc-chapters .fc-foot .fc-kicker .fc-mark .fc-noprint .fc-note .fc-notes .fc-summary .fd-band .fd-body .fd-fs .fd-icon .fd-text .fd-title .fit .fld .flow .flow-dot .flow-label .flow-step .fmt-badge .fmt-chip .fmt-grid .fmt-tile .footer .footer-brand .form .free .ft-el .ft-group .ft-knob .ft-switch .ft-text .ft-zone .full .future .g-l .g-s .gate .gf-actions .gf-card .gf-code .gf-form .gf-links .gf-list .gf-offer .gf-opt .gf-opts .gf-page .gf-state .gf-void .ghost .gift .gold .good .gr .gr-fhead .gr-table .gr-track .grey .grid .h-l .h-s .has-banner .has-bg .has-border .has-fmt .has-image .has-img .has-side .hb-all .hb-bar .hb-chan .hb-chan-link .hb-chan-n .hb-channels .hb-col .hb-col-kind .hb-col-n .hb-col-title .hb-cols .hb-dots .hb-eyebrow .hb-feature .hb-follow .hb-head .hb-hero .hb-hero-bg .hb-hero-body .hb-hero-cta .hb-hero-meta .hb-hero-shade .hb-hero-sum .hb-resume .hb-resume-btn .hb-resume-card .hb-resume-label .hb-resume-left .hb-resume-thumb .hb-resume-title .hb-resume-who .hb-title .hb-wait .hc .hc-actions .hc-body .hc-btn .hc-desc .hc-media .hc-meta .hc-sound .hc-speaker .hc-thumb .hc-title .hc-vid .hc-video .hd .hd-account .hd-avatar .hd-avatar-btn .hd-burger .hd-center .hd-cta .hd-el .hd-footer-menu .hd-icon .hd-kids .hd-kids-m .hd-lang .hd-left .hd-link .hd-login .hd-menu .hd-menu-lang .hd-menu-out .hd-menu-title .hd-menu-who .hd-nav .hd-right .hd-round .hd-search-wrap .hd-x .header .health .health-actions .health-badge .health-banner .health-bar .health-block .health-gauge .health-gauge-head .health-lines .health-pct .health-pill .health-spark .health-tables .hero .hero-cta .hero-image-prev .hero-note .hit .hit-body .hit-series .hit-snippet .hit-thumb .hot .hs-dot .hs-error .hs-off .hs-ok .hs-warn .icon-btn .imp-panel .imp-thumb .imp-title .import .import-history .import-list .import-row .inline .insights .intermediate .invite .invite-actions .invite-compact .invite-list .invite-text .is-aligned .is-click .is-done .is-link .is-next .is-picked .is-playing .is-rest .is-soon .is-sun .is-today .is-white .k-cycle .k-speaker .k-theme .ka-add .ka-after .ka-box .ka-done .ka-item .ka-list .ka-note .ka-text .ka-title .kc .kc-age .kc-chip .kc-chips .kc-glass .kc-row .kc-search .kc-shelf .kd-about .kd-age .kd-almost .kd-avatar .kd-back .kd-badge .kd-badge-img .kd-badge-inline .kd-badge-name .kd-badges .kd-badges-big .kd-band .kd-band-cta .kd-band-head .kd-band-list .kd-band-name .kd-band-title .kd-banner .kd-banner-brand .kd-banner-emblem .kd-banner-id .kd-banner-name .kd-banner-top .kd-bar .kd-bars .kd-brand .kd-brand-name .kd-card .kd-card-title .kd-cardstars .kd-catalog .kd-check .kd-chip .kd-chip-stars .kd-chips .kd-ctrl .kd-form .kd-grid .kd-header .kd-hello .kd-hero .kd-hero-btn .kd-hero-main .kd-hero-shade .kd-hero-text .kd-hide .kd-home .kd-howto .kd-l .kd-l0 .kd-l1 .kd-l2 .kd-l3 .kd-list .kd-manage .kd-me .kd-modal .kd-modal-box .kd-moon .kd-newbadge .kd-num .kd-ok .kd-opt .kd-option .kd-options .kd-overlay .kd-page .kd-pbar .kd-pcard .kd-perks .kd-pick .kd-pico .kd-profile .kd-profiles .kd-progress .kd-quiz .kd-quiz-btn .kd-quizcard .kd-quizcard-ico .kd-report .kd-reports .kd-review .kd-row .kd-seen .kd-shell .kd-side .kd-side-note .kd-stage .kd-stars .kd-step .kd-step-title .kd-steps .kd-summary .kd-tagline .kd-theme .kd-thumb .kd-tile .kd-tiles .kd-timeleft .kd-timeup .kd-topbar .kd-total .kd-watch-title .kd-word .keep .kept .kh .kh-bar .kh-done .kh-end .kh-end-actions .kh-grid .kh-head .kh-today .kh-tools .ko .kp-badge .kp-banner .kp-pref .kpi .kr-new .kr-pick .kr-row .ku-ico .ku-page .ku-pager .ku-serie-head .ku-tile .ku-tiles .ku-title .langs .learning .legal .level .lg-anchor .lg-badge .lg-bar .lg-bilan .lg-bilan-g .lg-bilan-t .lg-block .lg-card .lg-commits .lg-cta .lg-dim .lg-empty .lg-ghost .lg-group .lg-h2 .lg-head .lg-intro .lg-jump .lg-kicker .lg-lock .lg-mini .lg-poster .lg-quran .lg-resume .lg-resume-body .lg-ring .lg-ring-label .lg-ring-row .lg-side .lg-step .lg-steps .lg-subtabs .lg-three .lg-thumb .lg-top .lg-txt .lg-week .lg-week-head .lib-note-group .lic-item .lic-list .lic-page .line .link .linkbox .linkline .linkrow .live .lk-banner .lk-cta .lk-ico .lk-page .lk-tile .lk-tiles .lock .lock-cta .lock-list .logo .logo-emblem .logo-text .logo-word .low .lr-block .lr-curve .lr-facts .lr-recent .lr-score .lr-series .lr-series-act .lr-series-head .lr-top .ls-body .ls-edit .ls-head .ls-item .ls-list .ls-menu .ls-move .ls-new .ls-page .ls-pop .ls-quick .ls-share .ls-talks .lv-box .lv-dot .lv-ev-more .lv-head .lv-meta .lv-off .lv-on .lv-player .lvl .m .manage .manage-title .mc .mc-actions .mc-answer .mc-back .mc-bar .mc-card .mc-free .mc-from .mc-front .mc-label .mc-new .mc-quote .mc-replay .mc-stats .mc-top .md-fields .md-head .meta .mh-m .mine .missing .mn-acc .mn-acc-btn .mn-acc-list .mn-chev .mn-dd .mn-dd-btn .mn-dd-list .mod .moments .more .mp-kind .mp-list .mp-main .mp-state .ms .ms-bar .ms-group .ms-main .ms-nav .ms-side .ms-sub .ms-title .ms-toggle .mt-actions .mt-add .mt-block .mt-center .mt-chev .mt-clock .mt-dress-banner .mt-dress-card-in .mt-dress-title .mt-field .mt-frame-box .mt-free .mt-guide .mt-head .mt-hint .mt-item .mt-items .mt-kv .mt-left .mt-legend .mt-logo-card .mt-mclip .mt-modal-box .mt-music-row .mt-notice .mt-panel .mt-playhead .mt-preview .mt-readonly .mt-render-bar .mt-render-kind .mt-render-video .mt-render-what .mt-right .mt-round .mt-row .mt-savetpl .mt-screen .mt-seg .mt-slider .mt-sum .mt-sw .mt-tag .mt-tclip .mt-text .mt-titles .mt-tools .mt-top-actions .mt-trbtn .mt-two .mt-ver .mt-ver-form .mt-why .mt-zoom .mt-zoom-btns .mts .mts-cap .mts-check .mts-form .mts-len .mts-manual .mts-manual-row .mts-screen .mts-tab .mts-times .mts-title .mts-track .mts-transport .mtw-align .mtw-lang .mtw-msg .mtw-search .mtw-tabs .mtw-w .muted .mw-full .mw-narrow .mw-wide .mx-checks .mx-dot .mx-keep .mx-lead .mx-media .mx-row .mx-rows .mx-steps .mx-two .mx-warn .n .n-1 .n-2 .n-3 .n-4 .ne .ne-add .ne-head .ne-moveto .ne-tabs .ne-view .ne-zone .ne-zones .next .nf-follow .nf-list .not_yet .note .note-body .note-btns .note-edit .note-time .notes .notes-actions .notes-form .notes-list .notice .now .ob .ob-actions .ob-badge .ob-card .ob-cards .ob-ico .ob-intro .ob-text .off .ok .ok-msg .on .open .orig .other .outside .over .page .page-shell .panel .panel-actions .panel-title .part .pass .paused .pay-chip .pay-country .pay-methods .pb .pb-actions .pb-an-down .pb-an-fade .pb-an-left .pb-an-right .pb-an-up .pb-an-zoom .pb-anim .pb-armed .pb-bm .pb-bt .pb-card .pb-card-body .pb-cards .pb-col .pb-cols .pb-divider .pb-faq .pb-flag .pb-global .pb-h .pb-hero .pb-hide-d .pb-hide-m .pb-hide-t .pb-home .pb-image .pb-in .pb-page .pb-placeholder .pb-quote .pb-rich .pb-seen .pb-sub .pb-talks .pb-topbar .pb-video .pb-zone .pb-zone-label .pbh-bg .pbh-bright .pbh-glow .pbh-lift .pbh-tx .pbh-zoom .pbsh-soft .pbsh-strong .pd-dash .pd-label .pd-legend .pd-page .pd-table .pd-vis .pe .pe-block .pe-block-edit .pe-block-head .pe-block-main .pe-blocks .pe-btns .pe-check .pe-checks .pe-color .pe-dots .pe-editor .pe-err .pe-f .pe-fields .pe-gallery .pe-hex .pe-item .pe-item-body .pe-item-head .pe-lab .pe-langbar .pe-layout .pe-list .pe-list-view .pe-media .pe-media-btns .pe-media-empty .pe-menu-link .pe-meta .pe-mini .pe-modal .pe-modal-box .pe-modal-head .pe-new .pe-pages .pe-row .pe-show .pe-slug .pe-style .pe-sub .pe-sum .pe-tabs .pe-thumb .pe-thumb-name .pe-title .pe-types .pe-types-title .pe-zone .pending .ph-t .pick .pick-chip .pick-chips .pill .pill-select .pills .plan .plan-list .plan-save .plans .play .player .player-stage .player-wrap .pn .pn-actions .pn-acts .pn-actv .pn-add .pn-auto .pn-bar .pn-body .pn-c .pn-chip .pn-chips .pn-ck .pn-col .pn-colact .pn-date .pn-dd .pn-dh .pn-dl .pn-dls .pn-dm .pn-dots .pn-fa .pn-fl .pn-flag .pn-form .pn-goal .pn-head .pn-it .pn-kinds .pn-legend .pn-list .pn-mh .pn-mine .pn-modal .pn-month .pn-nav .pn-ok .pn-pb .pn-picked .pn-rem .pn-remg .pn-res .pn-rest .pn-row .pn-sd .pn-seg .pn-sp .pn-strip .pn-sw .pn-tag .pn-ti .pn-title .pn-warn .pn-week .pq .pq-aim .pq-badge .pq-bigname .pq-dates .pq-deg .pq-dial .pq-from .pq-grid .pq-hub .pq-hub-card .pq-hub-grid .pq-kaaba .pq-kicker .pq-left .pq-live .pq-month .pq-monthbar .pq-n .pq-n-main .pq-n-other .pq-nav .pq-needle .pq-next .pq-noprint .pq-place .pq-printtitle .pq-qibla .pq-ring .pq-switch .pq-t .pq-table .pq-tablewrap .pq-tabs .pq-times .pq-tomorrow .prem .premium .prev .preview-end .preview-tag .price .pricing .processing .progress .pry .pry-actions .pry-backdrop .pry-big .pry-buttons .pry-card .pry-checks .pry-eyebrow .pry-fs .pry-grid .pry-help .pry-left .pry-list .pry-moon .pry-msg .pry-name .pry-pill .pry-place .pry-pop .pry-pop-title .pry-results .pry-row .pry-set .pry-sub .pry-time .pry-today .pt-m .pt-t .published .pwa-apkmeta .pwa-apknotes .pwa-btn .pwa-card .pwa-h3 .pwa-hero .pwa-icon .pwa-installed .pwa-n .pwa-page .pwa-perks .pwa-sha .pwa-soon .pwa-steps .pz-block .pz-body .pz-chosen .pz-clist .pz-commit .pz-commit-item .pz-consent .pz-ctext .pz-group .pz-hl .pz-item .pz-list .pz-niyya .pz-note .pz-notetext .pz-over-close .pz-overdue .pz-own .pz-seek .pz-size .pz-text .pz-title .pz-tools .pz-upsell .qa-kinds .qa-lic .qa-opt .qa-state .qa-steps .qa-tabs .qa-title .qp-actions .qp-bar .qp-expl .qp-fs .qp-head .qp-learn .qp-line .qp-msg .qp-newbadges .qp-opt .qp-report .qp-review .qp-review-next .qp-rq .qp-score .qp-title .qp-tools .qpl-bar .qpl-stop .qpl-title .qr .qr-ar .qr-badge .qr-card .qr-grid .qr-head .qr-hit .qr-in-tab .qr-layout .qr-leg .qr-legend .qr-listhead .qr-main .qr-name-ar .qr-names .qr-nav .qr-notes .qr-now .qr-num .qr-options .qr-ph .qr-play .qr-playall .qr-player .qr-preset .qr-read .qr-results .qr-resume .qr-resume-k .qr-search .qr-side .qr-size-1 .qr-size-3 .qr-size-4 .qr-sorts .qr-tf .qr-tr .qr-verse .qr-verses .qr-w .qr-wm .qr-words .quiz .quiz-banner .quiz-card .quiz-offer .quiz-on .quiz-overlay .quiz-slot .qz-card .qz-count .qz-expl .qz-form .qz-group .qz-list .qz-list-head .qz-minute .qz-opt-edit .qz-opts .qz-origin .qz-proof .qz-q .qz-reported .qz-talk .qz-warn .r-1-2 .r-2-1 .rb .rb-card .rb-cards .rb-ended .rb-note .ready .ref-actions .ref-link .ref-note .ref-stats .reg-card .reg-form .results .resume .resume-btn .review .review-note .rf-ar .rf-card .rf-fr .rf-head .rf-item .rf-label .rf-list .rf-panel .rf-quote .right .rights .rm-actions .rm-ar .rm-day .rm-days .rm-filters .rm-fr .rm-item .rm-items .rm-list .rm-page .rm-remind .rm-row .rm-status .rm-tag .rm-tw .rm-tw-more .role-card .row .row-arrow .row-badge .row-click .row-head .row-item .row-rail .row-wrap .rows .rp .rp-done .rp-form .run .running .rv-admin .rv-card .rv-email .rv-list .rv-note .rv-page .rv-reminder .s-medium .s-small .s-wide .s1 .s2 .s3 .s4 .sa-admin .sale .sale-box .sale-opt .sale-opt-h .sale-opt-p .sale-opt-t .sale-opts .sale-owned .sale-owned-line .savebar .saved .saving .sc-add .sc-archived .sc-block .sc-cell .sc-day .sc-frise .sc-goal .sc-link .sc-list .sc-remind .sc-st-achieved .sc-st-not_yet .sc-st-progress .sc-title .sd-act-title .sd-bar .sd-card .sd-card-head .sd-chip .sd-dash .sd-dl .sd-h2 .sd-head-actions .sd-job .sd-last-info .sd-lines .sd-meter .sd-note .sd-pill .sd-side-bar .sd-side-head .sd-side-space .sd-todo .sd-tool .se-form .se-help .se-panel .se-sum .sec-tabs .seg .seg-row .seg-share .segs .sel .seo-box .seo-checks .seo-extra .seo-preview .series-body .series-card .series-cta .series-desc .series-ep .series-ep-side .series-ep-text .series-eps .series-hero .series-hero-in .series-listhead .series-num .series-prereq .series-season-title .series-seasons .series-thumb .set-badge .set-card-main .set-crumb .set-fields .set-fold .set-help .set-hits .set-ic .set-pending .set-pill .set-pills .set-search .set-state .set-theme .set-theme-title .set-title .set-wrap .sev-error .sev-warn .sg-bar .sg-chip .sg-grid .sg-item .sg-item-main .sg-kpi .sg-num .sg-page .sg-prov .sg-rule .sh-back-pm .sh-badge .sh-bar .sh-card .sh-card-dur .sh-card-meta .sh-card-play .sh-card-thumb .sh-card-title .sh-chan .sh-empty .sh-feed .sh-frame .sh-full .sh-grid .sh-info .sh-item .sh-li-text .sh-meta .sh-mute .sh-nav .sh-page .sh-paused .sh-rail .sh-stage .sh-state .sh-studio .sh-title .sh-title-edit .sh-video .share-note .shc .shc-actions .shc-back .shc-fmt .shc-formats .shc-head .shc-preview .sheet .sheet-back .sheet-head .sheet-list .sheet-sec .sheet-stats .sheet-warn .shut .side-dur .side-head .side-info .side-item .side-list .side-season .side-series .side-thumb .similar .site-footer .site-footer-top .sk .sk-bar .sk-big .sk-goal .sk-hidden .sk-pick .sk-prog .sk-week .skip-link .sm .small .solo .soon .sp-backdrop .sp-bar .sp-body .sp-esc .sp-filters .sp-panel .sp-series .sped .speed-pill .spk-admin .spk-bio .spk-card .spk-follow .spk-list .spk-max .spk-name .spk-page .spk-pick .spk-plain .spk-range-row .sr-addbar .sr-addseason .sr-all .sr-cands .sr-cont .sr-cont-body .sr-cont-card .sr-cont-img .sr-danger .sr-empty .sr-ep .sr-ep-text .sr-eps .sr-only .sr-season .sr-season-title .sr-toggle .ss-band .ss-body .ss-btns .ss-card .ss-cards .ss-icon .ss-lang .ss-text .ss-title .ss-when .st .st-axis .st-bar .st-card .st-chart .st-cur .st-delta .st-dl .st-doing .st-done .st-empty .st-export .st-grid .st-grid2 .st-hbars .st-head .st-hl .st-ht .st-hv .st-kpi .st-kpis .st-not_yet .st-note .st-practice .st-privacy .st-range .st-seg .st-sel .st-src .st-src-url .st-t .st-table .st-tablewrap .st-tabs .stat .state .status .step .steps .studio .studio-avatar .studio-bar .studio-bar-extra .studio-bar-title .studio-brand .studio-burger .studio-empty .studio-foot .studio-group-title .studio-head .studio-link .studio-main .studio-narrow .studio-nav .studio-out .studio-page .studio-search .studio-side .studio-soon .studio-stats .studio-table .studio-talk .studio-talk-text .studio-thumb .studio-title .studio-toggle .studio-tools .studio-who .sub .tab .tab-panel .tablist .tabs .tabs-body .tabs-layout .tabs-v .talk .talk-head .talk-tabs .talk-wrap .tf .tf-actions .tf-badge .tf-codelist .tf-count .tf-field .tf-form .tf-key .tf-panel .tf-reset .tf-toggle .th-actions .th-card .th-chip .th-chips .th-desc .th-detail .th-fs .th-grid .th-group .th-lead .th-note .th-page .th-picker .th-step .th-steps .th-talks .thumb .thumb-cur .thumb-opt .thumb-orig .tier .tier-current .tier-head .tier-learning .tier-tag .time .timeline .tl .tl-msg .tl-text .today .today-box .today-compact .today-count .today-go .today-head .today-label .today-left .today-list .today-more .todo .tone-err .tone-gold .tone-ok .tone-run .tone1 .tone2 .tone3 .topbar .tour .tour-actions .tour-back .tour-bubble .tour-count .tour-hole .tour-nav .tp-transcript .tpanel .tpl .track .track-body .tracks .transcript .transcript-body .transcript-head .ts .tt .tt-bar .tt-card .tt-check .tt-field .tt-save .tv-btns .tv-code .tv-confirm .tv-done .tv-link .u .up .up-done .up-failed .upbar .upbar-top .upnext .upnext-btns .users-bar .users-table .v-center .v-end .v-start .validated .vertical .vt .vt-badge .vt-box .vt-card .vt-card-hot .vt-center .vt-chap .vt-cta .vt-days .vt-expl .vt-foot .vt-go .vt-hero .vt-hero-bg .vt-hero-card .vt-hero-glow .vt-hero-in .vt-hero-meta .vt-hero-thumb .vt-hero-txt .vt-hl .vt-ico .vt-kids .vt-kidsban .vt-kidsban-cta .vt-kidsban-img .vt-lab .vt-lead .vt-more .vt-n .vt-opt .vt-pills .vt-play .vt-poster .vt-poster-ph .vt-price .vt-q .vt-quiz .vt-sec .vt-sec-head .vt-step .vt-step-hot .vt-steps .vt-sum .vt-three .vt-two .vt-wait .waiting .waiver .warn .watch .watch-admin .watch-b .watch-blocks .watch-grid .watch-info .watch-item .watch-main .wb-act .wb-back .wb-banner .wb-bar .wb-card .wb-cast .wb-chan-name .wb-channel .wb-chips .wb-grid .wb-hero .wb-ico .wb-info .wb-item .wb-lbl .wb-learn .wb-main .wb-menu .wb-more .wb-next .wb-notes .wb-num .wb-pset .wb-pset-btn .wb-pset-menu .wb-pset-note .wb-row .wb-side .wb-side-below .wb-side-hidden .wb-side-left .wb-speeds .wb-step .wb-thumb .wb-txt .welcome .window .wiz .wiz-form .wiz-or .wiz-preview .wl-msg .wp-actions .wp-box .wrap .x .y

#### skin-bleu.css (157 classes)

.about-text .ac-count .ac-pos .adm-group .badge .badge-inline .banner .banner-bg .banner-body .banner-cat .banner-dots .banner-meta .banner-shade .banner-summary .big .btn .btn-lg .card .cat-bar .catalogue .cg-all .cg-chips .cg-feat .cg-feat-body .cg-feat-cat .cg-feat-meta .cg-feat-sum .cg-feat-tags .cg-filters .cg-mosaic .cg-mosaic-wrap .cg-search .cg-search-x .cg-stream .cg-subs .cg-top .crumbs .done .dot .dropzone .dur .em-panel .evn-band .evn-card .evn-list .eyebrow .fd-band .fmt-badge .form .ghost .grid .has-fmt .has-image .hb-hero .hc .hc-btn .hd-kids .hd-nav .header .hero .hero-cta .hero-list .hero-play .insights .kd-band .kd-header .kd-theme .kh .lg-empty .lg-lock .lg-poster .lg-resume .link .lvl .meta .ms .ms-bar .ms-main .ms-side .n1 .n2 .n3 .n4 .no-img .notice .ob .ob-card .on .over .panel .ph-t .plain .plan .play .player .player-wrap .prem .premium .progress .rb .row .row-arrow .row-head .row-item .row-rail .row-wrap .sd-todo .sec-tabs .series-card .side-series .site-footer .sk-bleu .sk-classic .ss-band .st-home .st-learn .st-univ .studio-avatar .studio-nav .studio-thumb .tab .tablist .talk .talk-head .thumb .today .today-box .today-go .today-head .today-left .today-list .vt-hero-thumb .vt-poster .vt-poster-ph .waiver .watch-b .wb-act .wb-bar .wb-card .wb-chan-name .wb-chips .wb-grid .wb-hero .wb-ico .wb-info .wb-learn .wb-menu .wb-meta-base .wb-next .wb-notes .wb-num .wb-pset-menu .wb-row .wb-side .wb-step .wb-thumb .wb-txt

#### skin-nuit.css (35 classes)

.banner .btn .cit-framed .done .eyebrow .hd-avatar .header .hero .invite .kh .kp-banner .lg-card .lg-empty .lg-head .lg-lock .lg-poster .lg-resume .lg-thumb .logo-text .lr-block .ms-bar .ms-side .ob .panel .rb .row-head .site-footer .skin-pick .tabs .talk .thumb .today .today-box .today-head .today-list

#### skin-premium-admin.css (256 classes)

.ac-heavy .ac-hours .ac-window .adm-card .adm-dialog .adm-group .adm-table .adm-table-wrap .adm-tabs .admin .admin-card .admin-cards .admin-table .adp-kbd .adp-label .adp-open .alt .amber .ay-chapter .ay-chapters .ay-form .ay-stack .banner .bm-app .bm-audio-layout .bm-ax-module .bm-ax-module-footer .bm-ax-modules-grid .bm-ax-pill .bm-ax-pill-row .bm-ax-ramadan-hero .bm-ax-season-card .bm-badge .bm-cols .bm-data-table .bm-detail-layout .bm-dubbing-layout .bm-embed .bm-form .bm-inline-tools .bm-metrics .bm-page .bm-panel .bm-search-field .bm-sx-live-sources .bm-sx-preview-art .bm-watch-card .bo-alerts .bo-apps .bo-av .bo-avatar .bo-badge .bo-burger .bo-crumb .bo-crumb-space .bo-dot .bo-drop .bo-has-quick .bo-icon .bo-kpi-ico .bo-kpis .bo-me-id .bo-none .bo-open .bo-panel .bo-pop .bo-pop-title .bo-qs-dl .bo-qs-head .bo-qs-links .bo-qs-open .bo-qs-poster .bo-qs-steps .bo-qs-x .bo-quick .bo-quick-grid .bo-quick-sheet .bo-row .bo-search-slot .bo-spacer .bo-split .bo-sub .bo-switch .bo-top .bo-user .bo-user-name .bo-who .btn .cadm-del .cadm-lang .cadm-row .cadm-talks .cadm-tile .card .ch-avatar .ch-contents .ch-owner .ch-p-identity .ch-p-links .ch-p-list .ch-p-rights .ch-team .check .chip .chk .col .cut .danger .danger-zone .dash-cols .dash-h .dash-health .dash-ok .dash-todo .db-actions .db-avatar .db-grid .dropzone .dub .err .error .eyebrow .failed .form .form-grid .ghost .gray .green .grey .insights .keep .kpi .level .link .logo-text .meta .mt-add .mt-badge .mt-block .mt-bottom .mt-cap .mt-clip .mt-clip-body .mt-editor .mt-field .mt-gold .mt-head .mt-lane .mt-left .mt-logo-card .mt-mclip .mt-panel .mt-playhead .mt-right .mt-round .mt-row .mt-screen .mt-sw .mt-tclip .mt-tick .mt-titles .mt-tl .mt-tools .mt-top .mtw-tabs .na .ok .on .orig .part .pd-dash .pd-table .pill .play .processing .ready .red .row-click .run .sd-bar .sd-big .sd-card .sd-card-head .sd-chip .sd-chipbtn .sd-job .sd-more .sd-note .sd-pill .sd-poster .sd-see .sd-side-space .sd-todo .sd-tool-ico .sel .sev-error .sev-warn .sg-bm .sg-chip .sg-grid .sg-item .sg-items .sg-link .sg-num .sg-prov .sg-providers .sg-rule .sg-test .sg-wide .sheet .sheet-back .sheet-head .sheet-sec .sk-bleu .sk-classic .sm .sr-ep .sr-ep-text .stat .state-err .state-live .state-run .step-err .step-ok .step-run .step-wait .studio .studio-avatar .studio-brand .studio-foot .studio-group .studio-group-title .studio-head .studio-link .studio-main .studio-nav .studio-page .studio-search .studio-side .studio-soon .studio-table-wrap .studio-thumb .studio-title .studio-toggle .studio-tools .studio-user .studio-who .sub .table-wrap .tablist .tabs .track-err .upbar .users-bar .users-table .violet

#### skin-premium.css (328 classes)

.acct .badge .badge-inline .badge-premium .banner .banner-cat .banner-meta .banner-shade .best .btn .btn-lg .card .card-lite .cg-feat .cg-stream .cinema-on .crumbs .done .dot .dur .evn-card .eyebrow .form .ghost .has-image .hero .hero-cta .hero-list .hero-play .insights .kd-band .kd-modal .kd-theme .learning .link .lk-banner .lk-tiles .meta .mn-dd .mn-dd-btn .mn-dd-list .ms-bar .no-img .ob .on .page .page-shell .panel .pb .pb-in .pbt-pm_cat_chips .pbt-pm_cat_cross .pbt-pm_cat_hero .pbt-pm_cat_rails .pbt-pm_cat_results .pbt-pm_collections .pbt-pm_continue .pbt-pm_hero .pbt-pm_kids .pbt-pm_learn .pbt-pm_rows .pbt-pm_shorts .pbt-pm_universes .ph-t .plan .plan-list .plan-save .plans .player .player-wrap .pm-about .pm-account .pm-arr .pm-avatar-guest .pm-blk .pm-blocks-cat .pm-blocks-home .pm-card .pm-card-art .pm-card-badge .pm-card-bar .pm-card-done .pm-card-play .pm-card-sub .pm-card-title .pm-cat-all .pm-cat-bar .pm-cat-chips .pm-cat-eyebrow .pm-cat-filters .pm-cat-formats .pm-cat-grid .pm-cat-hero .pm-cat-intro .pm-cat-search .pm-cat-sort .pm-cat-tools .pm-chev .pm-chip-more .pm-clamp .pm-discover .pm-empty .pm-ep-art .pm-ep-dur .pm-ep-play .pm-footer-opts .pm-hero-video .pm-home .pm-ins .pm-kd-art .pm-kd-body .pm-kd-dur .pm-kd-leave .pm-kd-me .pm-kd-play .pm-kd-seen .pm-kids .pm-kids-promo .pm-kids-title .pm-ln-avatar .pm-ln-back .pm-ln-body .pm-ln-extra .pm-ln-flow .pm-ln-focus-art .pm-ln-focus-empty .pm-ln-nothing .pm-long .pm-menu .pm-menu-opts .pm-menu-out .pm-menu-who .pm-muted .pm-nohero .pm-note .pm-on .pm-ott .pm-ott-blk .pm-ott-body .pm-ott-cat .pm-rail .pm-rail-head .pm-rail-track .pm-rel-art .pm-season .pm-season-next .pm-season-prog .pm-seasons .pm-sh-card .pm-sh-copy .pm-sh-dur .pm-sh-empty .pm-sh-eyebrow .pm-sh-grid .pm-sh-intro .pm-sh-play .pm-sh-tag .pm-sh-themes .pm-sh-track .pm-shc .pm-shc-back .pm-shc-bar .pm-shc-chan .pm-shc-link .pm-shc-meta .pm-shc-miss .pm-shc-mute .pm-shc-nav .pm-shc-paused .pm-shc-side .pm-shc-stage .pm-shc-theme .pm-shc-x .pm-shorts-hub .pm-shorts-rail .pm-side-more .pm-solo .pm-spot .pm-spot-cards .pm-spot-copy .pm-spot-cta .pm-spot-kicker .premium .price .pricing .progress .row .row-head .row-rail .row-sep .row-wrap .series-card .sh-back-pm .sh-page .side-series .sk-bleu .sk-classic .skin-pick .small .soon .st-home .st-learn .st-univ .tablist .tabs-body .tabs-layout .talk .talk-head .tf .tf-count .tf-field .tf-panel .tf-reset .tf-toggle .thumb .tier .tier-head .today .v20-active .v20-app .v20-banner-progress .v20-big-learn-banner .v20-brand .v20-btn .v20-btn-primary .v20-continue-text .v20-cv11-card-copy .v20-cv11-card-visual .v20-cv11-cross .v20-cv11-empty .v20-cv11-eyebrow .v20-cv11-fav .v20-cv11-format-filters .v20-cv11-more .v20-cv11-search .v20-cv11-side-link .v20-cv11-side-title .v20-cv11-sidebar .v20-cv11-toolbar-end .v20-exact-avatar .v20-exact-header .v20-exact-nav .v20-faithful-hero .v20-faithful-home .v20-heritage-v9 .v20-hero .v20-hero-arrow .v20-hero-copy .v20-hero-home .v20-hero-inner .v20-hv9-course-link .v20-hv9-episode-art .v20-hv9-hero .v20-hv9-hero-art .v20-hv9-hero-copy .v20-hv9-learn-icon .v20-hv9-learning-card .v20-hv9-locked .v20-hv9-meta .v20-hv9-related-art .v20-hv9-ring .v20-hv9-tabs .v20-is-overlay .v20-kids-category .v20-kids-head-nav .v20-kids-hero-visual .v20-kids-page .v20-kids-topbar .v20-kids-v8 .v20-kids-v8-feature-card .v20-kids-v8-hero-copy .v20-kids-v8-title .v20-lv10-bottom-grid .v20-lv10-flow-art .v20-lv10-flow-head .v20-lv10-flow-wrap .v20-lv10-goal .v20-lv10-hero .v20-lv10-hero-art .v20-lv10-hero-label .v20-lv10-inline-link .v20-lv10-kicker .v20-lv10-mid-grid .v20-lv10-overview-grid .v20-lv10-primary .v20-lv10-progress-card .v20-lv10-review-card .v20-lv10-review-icon .v20-meta .v20-mv20-footer-links .v20-next .v20-part .v20-poster-copy .v20-prev .v20-preview-mobile .v20-preview-player .v20-preview-tv .v20-signature-home .v20-topbar .v20-ui-glyph .waiver .watch-b .watch-blocks .wb-act .wb-back .wb-banner .wb-banner-text .wb-card .wb-grid .wb-hero .wb-ico .wb-info .wb-item .wb-learn .wb-main .wb-menu .wb-next .wb-notes .wb-num .wb-pset-btn .wb-pset-menu .wb-row .wb-side .wb-side-below .wb-side-hidden .wb-side-left .wb-step .wb-thumb
