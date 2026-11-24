# Audit — éditeur visuel « no-code » du site (24/11/2026)

Demande d'Epok : Admin → Apparence doit devenir **un seul endroit** pour modifier la totalité du thème, en no-code, avec glisser-déposer façon Elementor, et les sélecteurs de couleur / polices doivent marcher sur le thème Premium.

**Méthode et limites.** Audit fait en lisant le code et la ROADMAP (`api/src/themeCss.js`, `api/src/routes/appearance.js`, `pages.js`, `web/lib/blocks.js`, `PagesAdmin.js`, `PageBlocks.js`, `EditMode.js`, `web/app/page.js`, `skin-premium.css`, `public/premium/v20.css`). Je n'ai pas relancé l'éditeur dans un navigateur pour cet audit : les points marqués « à vérifier » restent à confirmer.

---

## 1. Ce qui existe

| Brique | Étape | Ce qu'elle fait | Fonctionne sur Premium ? |
|---|---|---|---|
| **Apparence** (thèmes) | I1 | ~110 réglages : couleurs de base, polices (texte, titres, arabe, Kids), arrondis, espacements, en-tête, menu latéral, barre du bas, boutons, cartes, badges, champs, onglets, pied, citation, Kids. Sélecteur de couleur natif + « reprendre une couleur de base ». Plusieurs thèmes, brouillon, publication, historique (50 versions), activation, import de polices (2 Mo), alerte de contraste WCAG. | **Non** (voir 2.A) |
| **Pages en blocs** | I3 | Pages `/p/<nom>`, blocs avant/après n'importe quelle page existante (hors admin, Studio, Kids), 12 types de blocs. Par bloc : textes fr/en/ar, visibilité par appareil et par public, style (couleur texte/fond, alignement, largeur, espaces haut/bas, arrondi). Brouillon, aperçu à la taille de l'appareil, publication, historique (20), référencement (SEO), bibliothèque d'images. | Pages et blocs avant/après : oui (non vérifié visuellement) |
| **Accueil des membres en blocs** | H | +8 blocs de données (À la une, Ma progression, Chaînes, Collections, Citation, Séries, Rangées par catégorie, bande Kids). | **Non** : `web/app/page.js` envoie toujours vers `PmHome` quand le thème est Premium, la page `/_home` est ignorée |
| **En-tête, menus, pied de page** | I4 + Menus | Barre d'annonce, blocs au-dessus du pied de page, réglages de navigation, menus affectés à des emplacements. | Zones : à vérifier ; `PmHeader`/`PmFooter` ont des liens codés (à vérifier si les menus d'Admin → Menus les pilotent) |
| **Mode édition sur la page** | I5 | Bouton « Modifier cette page » : clic sur un bloc ou un texte pour le changer à côté de la page. | Blocs : partiel ; textes : oui |
| **Textes** | — | Tous les textes fr/en/ar modifiables (Admin → Textes). | Oui |
| **Choix du thème** | D | Paramètres → Général : thème par défaut (Classique / Nuit / Bleu / Premium) + choix par les visiteurs. | Oui |

## 2. Ce qui bloque ou manque

**A. Premium n'est pas branché sur l'éditeur (bloquant).**
- `public/premium/v20.css` (233 Ko) et `bo-mock.css` (80 Ko) sont générés depuis la maquette avec des couleurs écrites en dur (`#087cff`, `#061325`, `#031222`… plusieurs centaines d'occurrences) et seulement ~8 `var(--…)`.
- `skin-premium.css` redéfinit les variables sous `html[data-skin="premium"]`, plus spécifique que le thème publié (`:root` / `body`) : les réglages d'Apparence perdent.
- Les polices de Premium sont aussi écrites en dur (`Inter, 'DM Sans'`).
- Conséquence : changer une couleur ou une police dans Apparence ne change rien sur Premium.

**B. Deux endroits pour le thème.** Paramètres → Général choisit la famille de thème ; Apparence règle les couleurs. À fusionner dans Apparence.

**C. Pas de glisser-déposer.** Seulement des boutons ↑ ↓ (`PagesAdmin.js`, `PageFields.js`). Le reconnaît la ROADMAP (« limites connues »). Aucune bibliothèque de glisser-déposer dans `package.json`.

**D. Pas de mise en page libre.** Les blocs sont empilés en une seule colonne : pas de sections, pas de colonnes, pas de grille, pas de modèles de pages ni de sections prêtes à l'emploi.

**E. Style par bloc limité.** 7 réglages seulement. Manquent : dégradé, image de fond, bordure, ombre, survol, animation, police par bloc, réglages différents par appareil (seule la visibilité l'est).

**F. Les écrans Premium ne sont pas des blocs.** `PmHome`, `PmCatalogue`, `PmSeries`, `PmKids`, `PmLearning`, `PmShorts`, `PmOtt`, `PmHeader`, `PmFooter` sont du React figé. On peut ajouter des blocs avant/après une page, jamais réorganiser son intérieur. Les pages Kids, Studio et Admin sont exclues des emplacements.

**G. Deux interfaces d'édition séparées** (Admin → Pages et mode édition sur la page), et Apparence à part. Pas d'éditeur unique. Annuler / rétablir : à vérifier.

**H. Polices.** 5 polices intégrées + Système + Serif ; Poppins, Amiri et Marcellus sont installées mais pas proposées dans le sélecteur ; Premium utilise Inter en dur.

## 3. Plan proposé

| Étape | Contenu | Livrable testé par |
|---|---|---|
| **1. Unifier + brancher Premium** | Choix du thème et « visiteurs peuvent choisir » déplacés dans Apparence (lien dans Paramètres). Couleurs et polices de Premium remplacées par des variables (valeurs par défaut identiques). Palette Premium ~12 couleurs + polices titres/texte/arabe. Catalogue d'une quinzaine de polices auto-hébergées. | Captures avant/après identiques (accueil, catalogue, fiche, back-office ; 390 et 1440 px ; fr et ar) |
| **2. Éditeur visuel unique** | Une seule page « Éditeur du site » : zone de page au centre (aperçu par appareil), palette de blocs à gauche, propriétés à droite. Glisser-déposer pour insérer et réordonner (avec alternative au clavier), dupliquer, supprimer, annuler / rétablir. Fusion de Pages, mode édition et Apparence. | Tests de glisser-déposer + captures |
| **3. Mise en page** | Sections et colonnes (1 à 4), style de section (fond couleur / dégradé / image, espaces par appareil, bordure, ombre), modèles de sections et de pages. | Captures 390 / 820 / 1440, arabe |
| **4. Écrans Premium en blocs** | Accueil Premium recomposable (bannière, Reprendre, rangées, Apprendre, Kids…), puis catalogue et fiche en zones réorganisables ; en-tête et pied Premium pilotés par les menus. | Accueil identique à l'actuel tant qu'on ne touche à rien |
| **5. Finitions** | Survol, animations, police par bloc, styles par appareil, droits d'édition. | — |

## 4. Décision à prendre (Epok)

« La totalité du thème » : je recommande de **tout rendre composable par blocs pour les pages éditoriales** (accueil, catalogue, vitrine, tarifs, pages libres, en-tête, pied de page) et de **limiter les écrans fonctionnels** (lecteur vidéo, quiz, compte, paiement, Studio, administration) **aux réglages de couleur, police et espacement**, car les rendre déplaçables risquerait de casser leur fonctionnement.

## 5. Points de vigilance

- Les couleurs de Premium viennent d'un fichier généré (`web/scripts/build-premium-css.py`) : la conversion en variables doit passer par ce script, sinon elle serait perdue à la prochaine régénération.
- Les réglages publiés sont lus par le site à chaque page : toute nouvelle variable doit avoir une valeur par défaut dans `themeCss.js` (copie identique dans `api` et `web`, vérifiée par `api/tests/test_theme.py`).
- Accessibilité : le glisser-déposer doit rester utilisable au clavier (les boutons ↑ ↓ sont conservés).

## Avancement

- Étape 4a faite 24/11 (accueil Premium en blocs, menus Premium) — registre 353. Étape 4b faite 24/11 (Catalogue Premium en blocs, zones avant/après sur toutes les pages vidéo, série et catégorie) — registre 354. Étape 5 (finitions) : sur « go ».
