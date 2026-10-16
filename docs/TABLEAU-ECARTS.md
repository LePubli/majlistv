# Tableau des écarts : maquettes et site actuel (Mejliss TV)

Date : 16/10/2026. Établi en LISANT le code du dépôt (commit db8d745), pas en testant le site en ligne. Les écarts marqués « à vérifier » n'ont pas été lus en détail. Aucun code modifié.
Maquettes : https://claude.ai/artifact/XevbycqkP3UdNU2kUAnFPk

**Avancement (16/10/2026)** : étape A faite (commit 5eea1a2) ; étape B faite (commit 86423c1) : §1 menu du haut, §2 menu latéral et barre du bas (visiteurs inclus), §5 Catalogue, §9 champ Format, tiroir ☰ avec catégories. Reste : C (§3 « Explorer par format » sur l'accueil connecté, §6 Séries, §7 fiche/lecteur, §8 Apprendre), D (§12 Studio, §13 Admin), puis doublage.

Légende effort : S = petit (quelques fichiers), M = moyen, L = gros chantier.

## 0. Bug responsive grand écran (priorité 1)
- Constat (capture Mac 27 pouces) : sur la bannière d'accueil, titre et étiquettes s'affichent lettre par lettre à la verticale.
- Cause probable trouvée dans web/app/globals.css : `--gutter` grandit avec la largeur d'écran (formule `(100vw − 1320px) / 2 + 32px`, soit environ 367 px de chaque côté à 1990 px). Or `.banner-body` est limité à `max-width: 760px` ET a `padding: 0 var(--gutter)` : la zone de texte devient nulle ou négative, donc le texte passe à la ligne à chaque lettre.
- Correction prévue : borner la largeur utile (`max-width: calc(760px + 2 * var(--gutter))`) et vérifier les autres blocs qui combinent `--gutter` et `max-width` (.hero, .row-head, .series-hero, .site-footer…). À confirmer par un test à 1440, 1920 et 2560 px, en français et en arabe.
- Effort : S à M.

## 1. Menu du haut
| | Site actuel | Maquette | Écart | Effort |
|---|---|---|---|---|
| Entrées | Accueil, Séries, Collections, Ouvrages, Apprentissage, Bibliothèque, Kids (réglable dans Admin → Pages → menus) | Accueil · Catalogue · Séries · Apprendre · Kids | Ajouter « Catalogue » (la page n'existe pas, voir §5), renommer « Apprentissage » en « Apprendre », retirer Collections, Ouvrages, Bibliothèque du haut (restent dans le menu latéral) | S |
| Boutons de droite | Recherche, langue, compte (Compte, Formules, Studio/Admin, Déconnexion), Se connecter + S'abonner | Identiques | Aucun (décision : inchangés) | – |
| Logo | Vrai logo (emblème + mot) | Vrai logo | Aucun | – |

## 2. Menu latéral (membre connecté) et barre du bas du téléphone
| | Site actuel | Maquette | Écart | Effort |
|---|---|---|---|---|
| Repli | Déjà repliable (bouton « Réduire le menu », état mémorisé, replié par défaut sous 1280 px) | Repliable | Aucun sur le principe ; barre de défilement du menu à rendre très fine | S |
| Groupes | Découvrir (Accueil, Séries, Collections, Ouvrages, Chaînes) · Mon espace (Apprentissage, Bibliothèque, Mon bilan) · Compte (Kids, Mon compte) · Gérer (Studio, Administration) | Découvrir · Catégories · Apprendre · Ma bibliothèque · Mon compte · Gestion | Ajouter le groupe « Catégories » (liste venant de la base, mêmes noms partout) ; éclater « Mon espace » en Apprendre (Parcours, Quiz et révision, Engagements, Bilan) et Ma bibliothèque (Favoris, Listes, Notes, Historique) ; sortir Kids du menu latéral (il passe en haut) ; ajouter « Catalogue » | M |
| Barre du bas (téléphone) | 5 entrées pour les membres : Accueil, Séries (ou Collections), Apprentissage, Bibliothèque, Compte | Accueil · Catalogue · Séries · Apprendre · Kids | Changer les 5 entrées ; décider si les visiteurs ont aussi la barre (aujourd'hui non) ; le compte passe par la pastille en haut | S à M |
| Hamburger du haut (téléphone) | Existe déjà (menu ☰ dans l'en-tête) | Hamburger + catégories dedans | Ajouter les catégories dans le tiroir | S |

## 3. Accueil connecté
| Site actuel | Maquette | Écart | Effort |
|---|---|---|---|
| Bannière carrousel (conférences à la une, image ou vidéo d'ambiance), rangées horizontales style Netflix, « Reprendre », « À réviser », citation du jour, bande Kids, accueil éditable en blocs | À la une + Reprendre + Explorer par format + Nouveautés + Séries et cycles + Chaînes à suivre | La structure ressemble déjà beaucoup. Manques : bloc « Explorer par format » et badges de format sur les vignettes (il faut le champ Format, §9) ; rangée « Chaînes à suivre » à vérifier ; bug responsive (§0) | M (dépend du champ Format) |

## 4. Accueil visiteur
Décision d'Epok : INCHANGÉE (page actuelle conservée). Seul le menu du haut change (§1).

## 5. Catalogue
| Site actuel | Maquette | Écart | Effort |
|---|---|---|---|
| Aucune page « Catalogue ». L'accueil sait afficher une grille filtrée par catégorie (`/?cat=12`), et la recherche est dans la loupe | Page Netflix : bannière + rangées horizontales par format, sans filtres | Créer `/catalogue` (rangées par format, « Tout voir » par format) ; nouvelle route API de rangées par format ; dépend du champ Format | M à L |

## 6. Séries
Page existante (module séries). La maquette ajoute des onglets Toutes/Séries/Cycles/Parcours, une carte « Continuer » et des images. À vérifier en lisant la page : non relevé en détail. Effort probable : S à M.

## 7. Fiche et lecteur
| Site actuel | Maquette | Écart | Effort |
|---|---|---|---|
| Le quiz s'affiche déjà en superposition sur la vidéo à la fin, avec une invitation « Et maintenant, que faire ? » (mise en pratique) ; onglets À propos, Chapitres, Transcription, Résumé, Notes ; colonne latérale série et « dans la même veine » ; vitesses de lecture | Quiz et « Et maintenant ? » sur la vidéo ; onglets Résumé, Transcription, Notes ; langue de l'audio ; épisode suivant | Écart faible. À vérifier : que l'engagement s'affiche bien sur la vidéo (et pas sous) ; regrouper les onglets pour limiter le défilement ; sélecteur « Langue de l'audio » seulement avec le doublage (plus tard) | S |

## 8. Apprendre
| Site actuel | Maquette | Écart | Effort |
|---|---|---|---|
| Page `/learning` à onglets (parcours, quiz/révision, engagements, bilan, attestations) | Tableau de bord des 4 temps + reprendre + à réviser + engagements ; version verrouillée avec invitation pour la formule standard | Créer l'écran de synthèse (l'API fournit déjà les données) ; écran verrouillé : à vérifier comment un abonné standard est traité aujourd'hui (réglage de fonction `learning`) ; images/bannière | M |

## 9. Champ « Format » (transversal)
Aujourd'hui aucun champ « type de contenu » : tout est une conférence. À créer : migration 053 (colonne format + liste administrée), saisie dans le Studio, filtre API, badge sur les vignettes, administration dans Admin → Catégories et formats. Liste de travail à valider : Conférence, Cours, Récitation/lecture, Documentaire/entretien/débat, Dessin animé, Rappel. Effort : M.

## 10. Kids
Le site a déjà le thème Kids (fond bleu nuit, bannière, 4 étapes, lettres colorées, profil enfant, code parent). Les maquettes ont été refaites d'après ce code, donc l'écart devrait être faible : à vérifier en comparant à l'écran. Rien à changer sur le logo ni les couleurs. Effort : S.

## 11. Téléphone et arabe
Hamburger et barre du bas existent déjà. Reste : nouvelles entrées (§2), catégories dans le tiroir, test sur vrai téléphone en arabe (de droite à gauche), cibles tactiles de 44 px. Non testé de mon côté (je ne peux qu'émuler).

## 12. Studio
| Site actuel | Maquette | Écart | Effort |
|---|---|---|---|
| Un seul habillage (`StudioShell`) mélange Modération, Studio et Administration | Studio à 8 entrées : Tableau de bord, Contenus, Données analytiques, Sous-titres, Audio et doublage, Éditeur, Activité, Paramètres ; modération pour modérateurs et admins ; quiz, mise en pratique, rappels, ouvrages, collections, citations rangés dans Paramètres et Contenus | Retirer l'Administration du Studio ; nouveau menu à 8 entrées ; regrouper les écrans existants ; Sous-titres, Audio/doublage, Éditeur, Activité sont de NOUVEAUX écrans (modules du Studio) | L |

## 13. Admin
| Site actuel | Maquette | Écart | Effort |
|---|---|---|---|
| `/admin` est une page à onglets (tableau de bord, utilisateurs, stats, catégories, cartes cadeaux, revenus, journal, apparence, pages, textes, fonctions, modules, paramètres, légal) dans l'habillage du Studio | Habillage propre à l'Admin, menu à 4 groupes (Pilotage, Catalogue, Réglages, Sécurité), lien « Aller au Studio » | Créer un `AdminShell` ; répartir les onglets existants dans les 4 groupes ; la modération reste dans le Studio ; l'Admin n'est jamais visible aux modérateurs et organisateurs | M à L |

## 14. Transversal
- Barres de défilement fines et discrètes sur tout le site : S.
- Vraies images et bannières : le site utilise déjà les affiches des vidéos et des bannières personnalisées ; les illustrations des maquettes ne sont que des remplaçants : S.
- Responsive de 390 px à 2560 px et arabe sur toutes les pages touchées : à tester à chaque étape.

## Ordre proposé pour la suite (à valider)
1. Étape A : correctif responsive grand écran + barres de défilement fines (rapide, visible tout de suite).
2. Étape B : champ Format + page Catalogue + menu du haut + menu latéral (catégories) + barre du bas.
3. Étape C : écrans Apprendre (synthèse, version verrouillée) et finitions fiche/lecteur, Séries.
4. Étape D : séparation Studio / Admin (nouveaux habillages).
5. Puis étape 0 du doublage (test voix et mesures).
Chaque étape : code complet, tests, README, ROADMAP, zip, sur votre « go ».
