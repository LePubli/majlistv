# Feuille de route Mejliss TV

Chaque étape est livrée complète (code, tests, README, commandes de déploiement à copier-coller), puis validée sur le VPS avant la suivante. L'étape 9 passe avant tout le reste : elle est nécessaire avant d'encaisser de vrais clients. L'étape 8 (socle technique) est reportée à la fin, à la demande d'Epok.

**Nouveau cap décidé le 13/10 :** Mejliss TV ne doit pas rester une plateforme de visionnage, mais devenir une **plateforme d'apprentissage à 360°** — on regarde, on vérifie ce qu'on a compris par un quiz, on révise, on progresse, on obtient des badges, et on peut lire l'ouvrage étudié. Avec le même principe pour les enfants (**Mejliss TV Kids**). C'est l'objet des étapes 24 à 26, qui passent devant les étapes 16.2 à 23.

## Déjà fait

| # | Étape | État |
|---|---|---|
| 1–2 | Base, comptes, catalogue, liens YouTube/Vimeo, stockage Garage, envoi de vidéos | ✅ en ligne |
| 3A–3D | Conversion HLS, transcription Whisper, sous-titres traduits (Claude / Azure / DeepSeek), résumé et chapitres | ✅ en ligne |
| 4 | Abonnements Stripe (essai 7 jours, mensuel/annuel, aperçu 2 min) | ✅ livré, à tester en mode test Stripe |
| 5 | Back-office (utilisateurs, rôles, clés et moteurs IA, Stripe) | ✅ en ligne |
| 6 | Favoris, reprise de lecture, Ma bibliothèque | ✅ livré |
| 7 | Recherche Meilisearch (fautes tolérées, extraits, passages horodatés) | ✅ en ligne |
| — | Maquettes : parcours visiteur → abonné, studio et back-office | ✅ validées |
| 9 | Paiement conforme (renonciation, TVA Stripe Tax, codes promo), e-mails, pages légales, mot de passe oublié | ✅ en ligne |
| 9 bis | Vidéos YouTube/Vimeo transcrites, traduites, indexées ; import de playlists et de chaînes | ✅ en ligne |
| 9 ter | Vidéos archive.org (lecteur Mejliss TV, import de collections) ; résumé toujours en français | ✅ en ligne |
| A | Fonctions activables et désactivables (Administration → Fonctions, mode maintenance) | ✅ livré, à déployer |
| C | Chaînes (intervenant fusionné, propriétaire organisateur, attribution modération, Chaînes suivies) | ✅ livré, à déployer |
| D | Rémunération des chaînes (part des abonnements, temps de visionnage, clôture mensuelle, CSV, suivi des paiements) | ✅ livré, à déployer |
| F | Mobile (plus aucune page plus large que l'écran, tableaux en fiches, zones tactiles) et accessibilité (lien d'évitement, repères, étiquettes, contrastes) | ✅ livré, à déployer |
| G | Fidélité à la maquette : menu latéral repliable (membre + Studio/Admin), texte blanc, citation colorée, espace Apprentissage refait, bannière de vitrine | ✅ livré, à déployer |
| E2 | Avatar et bannière des chaînes (page publique, liste, Studio), journal des actions des modérateurs sur les chaînes | ✅ livré, à déployer |
| E1 | Vitrine visiteur (exemple réel + quiz jouable), citation du jour encadrée | ✅ livré, à déployer |
| B | Menu latéral membre, barre du bas mobile, onglets (compte, apprentissage, bibliothèque), fil d'Ariane | ✅ livré, à déployer |

## À venir

**Socle no-code (décidé avec Epok le 15/10/2026, passe avant le reste)** — tout se modifie depuis l'administration, sans repasser par le code :
- ✅ **I1 Apparence** : couleurs, polices (dont polices importées), arrondis et espacements, par familles d'éléments ; brouillon, aperçu sur une vraie page (390 → 1440 px, FR/EN/AR), publication, historique, plusieurs thèmes, alertes de lisibilité. Migration 047.
- ✅ **I2 Textes modifiables** : les 1 571 intitulés × 3 langues dans Admin → Textes (recherche sans accents, filtre par page et par langue, variables {n} protégées, enregistrement groupé, rétablir l'original, export/import JSON, journal des actions). Migration 048. Limite connue : seuls les textes du dictionnaire (web/lib/i18n.js) sont modifiables ; les écrans Studio/Admin et quelques libellés écrits directement dans le code restent à reprendre dans le dictionnaire au fil des étapes suivantes.
- ✅ **I3 Pages en blocs** : Admin → Pages. Pages créées dans l'administration (adresse /p/<nom>, ajoutées au plan du site) et blocs ajoutés AVANT / APRÈS n'importe quelle page existante (hors administration, Studio, Kids). 12 types de blocs : bannière, titre, texte, image, bouton, cartes, rangée de conférences, citation, questions fréquentes, vidéo YouTube/Vimeo, espace, séparateur. Chaque bloc : textes fr/en/ar, visibilité par appareil (téléphone, tablette, ordinateur) et par public (tous, visiteurs, membres, abonnés, membres sans abonnement), style propre (couleur du texte et du fond, alignement, largeur, espaces, arrondi). Brouillon enregistré tout seul, aperçu à la taille de l'appareil, publication, historique (20 versions), mise hors ligne, bibliothèque d'images. Migration 049. Limites connues : pas de glisser-déposer (boutons ↑ ↓), pas de colonnes libres, pas de modèles de pages prêts à l'emploi.
- ✅ **H Accueil des membres en blocs** : Admin → Pages → « Accueil des membres » (modèle d'après la maquette « Main »). 8 nouveaux blocs qui lisent les données du site : À la une + carte Reprendre, Ma progression (à réviser / quiz à rattraper / en cours), Chaînes à suivre (avec bouton Suivre, non suivies d'abord), Collections, Citation du jour, Séries, Rangées par catégorie (« Pour vous » d'abord), bande Espace Kids ; le bloc Conférences gagne un lien « Tout voir ». Tant que la page n'est pas publiée (ou si elle est supprimée / hors ligne), l'accueil d'origine reste en place. « Tout voir » d'une catégorie passe par l'adresse /?cat=ID (le bouton retour du navigateur fonctionne). Migration 050, route GET /home/featured. Limites connues : pas de bloc Tarifs ; les boutons « Une autre citation », « Copier » et « Voir la conférence associée » de la maquette ne sont pas faits (pas de donnée correspondante côté API) ; aucun bloc ne propose encore le glisser-déposer.
- **H Accueil membre** refait en blocs selon la maquette « Accueil » (À la une + Reprendre, Nouveautés, Chaînes à suivre, Collections).
- ✅ **I4 En-tête, menus et pied de page** : Admin → Pages → « En-tête, menus et pied de page ». Menu principal, menu latéral (4 groupes), barre du bas du téléphone (5 liens max) et liens du pied de page : réordonner, masquer, renommer (FR/EN/AR), ajouter ses liens, visibilité par appareil et par public. En-tête en 3 zones (gauche, centre, droite), pied de page en 2 zones, barre d'annonce tout en haut et blocs au-dessus du pied de page. Logo, connexion et liens légaux toujours présents. Aperçu en direct (connecté / visiteur). Sans réglage : le site d'origine, à l'identique.
- ✅ **I5 Mode édition sur la page** (administrateur) : bouton « Modifier cette page » ; clic sur un bloc → panneau Contenu / Affichage / Style, vu tout de suite sur la page, brouillon enregistré tout seul puis « Publier » ; clic sur un texte du site → réécriture en FR/EN/AR (enregistrée comme dans Admin → Textes), « Rétablir l'original ». Pas de menu ni de bouton actif pendant l'édition (aucun lien ne navigue).
- ✅ **M1 Socle des modules** : un module = un dossier `api/src/modules/<nom>/` (fiche `module.json`, `index.js`, migrations SQL, réglages), livré par zip puis redéployé. Admin → Modules : version, activer / désactiver, dépendances entre modules, réglages (clés secrètes chiffrées). Un nouveau module arrive désactivé ; un module cassé est signalé sans bloquer les autres. Module pilote : **Cartes cadeaux** (déménagé dans `api/src/modules/gifts`, lié à l'interrupteur de Admin → Fonctions).
- ✅ **M2 lot 1** : Collections, Listes de lecture, Notes et Rémunération des chaînes deviennent des modules (`api/src/modules/<nom>/`), liés à leur fonction ; lien « Ouvrir l'administration » dans Admin → Modules (champ `admin` de la fiche).
- ✅ **M2 complet** : toutes les fonctions activables du site sont des modules (19) : Cartes cadeaux, Collections, Listes, Notes, Rémunération, Séries, Ouvrages, Quiz, Mise en pratique, Révision espacée, Bilan personnel, Parcours et attestations, Chaînes, Citation du jour, Mejliss Kids, Vitrine visiteur, Statistiques, Suivre et notifications, Favoris. Le socle lance leurs tâches de fond (`start`). Restent dans le socle : comptes, catalogue et lecture vidéo, envoi/transcription/traduction, paiement, recherche, SEO, pages légales, imports, outils no-code, administration, modération.
- ✅ **M3a Socle API indépendant des modules** : points d'extension et événements (`api/src/ext.js`) ; plus aucun import du socle vers un module ni d'un module vers un autre ; fonctions et réglages d'un module absent masqués ; test automatique qui retire chaque module (et tous à la fois) et vérifie que l'API démarre et que le site répond.
- ✅ **M3b Web modulaire** : partie web de chaque module dans `web/modules/<id>/` (fiche `module.js` trouvée automatiquement, écrans d'administration) et pages rangées dans des groupes de routes `(module-<id>)` (adresses inchangées) ; menus, Studio, Administration et pages masqués automatiquement si le module est coupé ou absent ; test de construction du site sans chaque module et sans aucun module.
- ✅ **Étape A (réorganisation en 5 espaces, lot 1)** : correctif d'affichage sur grand écran (marges calculées sur la zone disponible à côté du menu latéral, texte de la bannière jamais écrasé) et barres de défilement fines et discrètes sur tout le site ; test automatique de 390 à 2560 px, en français et en arabe. Suite : B (champ Format, page Catalogue, menus), C (Apprendre, fiche/lecteur, Séries), D (séparation Studio / Admin), puis étape 0 du doublage. Détail : `docs/TABLEAU-ECARTS.md`.
- ✅ **Étape B (réorganisation en 5 espaces, lot 2)** : champ Format (migration 053, liste administrée, badge sur les vignettes, saisie dans le Studio et en lot), page Catalogue façon Netflix (bannière + une rangée par format, « Tout voir »), menu du haut Accueil · Catalogue · Séries · Apprendre · Kids, menu latéral à 6 groupes avec Catégories automatiques, barre du bas téléphone (aussi pour les visiteurs), catégories dans le tiroir ☰. Accueil visiteur inchangé. Suite : C (Apprendre, fiche/lecteur, Séries), D (séparation Studio / Admin), puis étape 0 du doublage.
- ✅ **Étape C (réorganisation en 5 espaces, lot 3)** : Apprendre (quatre temps, engagements sur le tableau de bord, onglets Quiz et révision / Mes engagements, écran verrouillé façon maquette, « Pour continuer à apprendre »), tuiles « Explorer par format » sur l'accueil connecté, Séries « Continuer », mise en pratique ouverte sur la vidéo. À décider : onglets Séries/Cycles/Parcours (pas de champ). Suite : D (séparation Studio / Admin), puis étape 0 du doublage.
- ✅ **Étape D (réorganisation en 5 espaces, lot 4)** : Studio et Administration séparés (habillages `StudioShell` / `AdminShell`). Studio à 8 entrées (Tableau de bord, Contenus, Données analytiques, Sous-titres, Audio et doublage, Éditeur, Activité, Paramètres) + Modération pour les administrateurs ; anciens écrans rangés dans des onglets (Contenus, Analytiques) et dans Paramètres → Outils, mêmes adresses ; liste des conférences déplacée en `/studio/contents` ; nouvelles pages Tableau de bord, Sous-titres, Activité ; Doublage et Éditeur annoncés « Bientôt ». Admin à 4 groupes (Pilotage, Catalogue, Réglages, Sécurité), invisible aux organisateurs et modérateurs. Web seulement : aucune migration, aucun changement d'API. Reste : étape 0 du doublage (puis écrans Audio et doublage), éditeur de montage, stockage dans le tableau de bord.
- ✅ **Kids : menu latéral et « Mes petites actions »** : accueil de l'enfant avec menu (Accueil · Regarder · Apprendre · Agir) et cartes de progression ; actions proposées et validées par les parents (migration 054), affichées à l'enfant après le quiz, sur son accueil et dans l'onglet Agir ; l'enfant déclare « je l'ai fait », seul le parent valide. Suite possible : mention des actions validées dans le rapport hebdomadaire.

**Refonte validée (plan « Mejliss TV – Plan des points restants »)** : ~~B menu latéral et onglets~~ (fait) · ~~C chaînes~~ (fait) · ~~D rémunération~~ (fait) · ~~E pages refondues + vitrine visiteur~~ (fait) · ~~F mobile et accessibilité~~ (fait). Chaque étape sur « go ».

### Phase A — Avant d'ouvrir au public

**9. Paiement conforme et e-mails transactionnels** — ✅ livré (voir README, étape 9)
- Prix : 6,99 € par mois et 69,99 € par an (« 2 mois offerts »), créés dans Stripe.
- TVA : Stripe Tax (TVA du pays du client pour les particuliers de l'UE, guichet unique OSS), factures conformes. **À valider avec le comptable.**
- Droit de rétractation : case de renoncement expresse au moment du paiement (contenu numérique), avec la date et le texte accepté conservés.
- Pages légales : mentions légales, CGV/CGU, politique de confidentialité (modèles à faire relire), liens dans le pied de page et au paiement.
- E-mails (réglages SMTP dans le back-office) : bienvenue, rappel 2 jours avant la fin de l'essai, confirmation de paiement, échec de paiement, résiliation.
- Codes promo Stripe (offres de lancement, partenariats), utilisables dans le tunnel d'abonnement.

### Phase B — Nouveau design (d'après les maquettes validées)

**10. Studio de publication** — ✅ livré (10.1 apparence, 10.2 Mes conférences, 10.3 ajout en 2 étapes, 10.4 modifier / brouillons / programmation / miniature, 10.5 correction du contenu, 10.6 fiche de suivi ; + gestion des catégories). 10.1 à 10.4 en ligne, 10.5 et 10.6 à déployer.
- Renommage complet en **Mejliss TV** (logo, couleurs, polices Montserrat et DM Sans).
- Espace de gestion avec menu latéral (Studio et Administration selon le rôle).
- Mes conférences : filtres (En ligne, En traitement, À corriger, Brouillons), recherche, avancement des 4 étapes.
- Ajout en 2 étapes : glisser-déposer ou lien, puis informations pendant l'envoi ; aperçu de la carte, catégorie en un clic, langues de sous-titres en un clic.
- Nouvelles fonctions serveur :
  - modifier une conférence publiée ;
  - brouillons et **programmation de publication** ;
  - miniature au choix (3 images extraites) ou image importée ;
  - **correction de la transcription**, avec les sous-titres et la recherche mis à jour ;
  - modification du résumé et des chapitres ;
  - **import de plusieurs vidéos**, y compris depuis une playlist YouTube.
- Fiche de suivi : chronologie du traitement, langues à ajouter, retirer ou relancer.

**11. Back-office — ✅ terminé (11.1 tableau de bord, 11.2 utilisateurs, 11.3 paramètres)**
- ✅ (11.1 livré) Tableau de bord : abonnés, essais, revenu estimé, conférences, « À traiter », état des services, dernières inscriptions.
- ✅ (11.2 livré) Utilisateurs : tableau avec fiche latérale (rôle expliqué, abonnement, accès offert, mot de passe, suspension, suppression).
- ✅ (11.3 livré) Paramètres par section, avec un tableau « quel moteur pour quelle langue » pour la traduction et des boutons Tester.
- Catégories : ajouter, renommer, ordonner, choisir l'icône.

**12. Parcours visiteur → abonné** (découpé en 5 pièces)
- ✅ 12.1 Accueil vitrine : bannière (conférences mises en avant / bannière personnalisée / texte), rangées Nouveautés et par catégorie, « Continuer à regarder ».
- ✅ 12.2 Vignettes interactives (style Prime Video) : la carte grossit au survol, aperçu vidéo après un court délai, informations affichées réglables depuis le back-office.
- ✅ 12.3 Fiche conférence : aperçu gratuit de 2 min, invitation à l'essai, conférences similaires.
- ✅ 12.4 Inscription courte, choix de la formule, page de bienvenue (langue des sous-titres, thèmes préférés).
- ✅ 12.5 Passage en revue mobile et arabe (de droite à gauche) sur tous les écrans visiteur.

### Phase B2 — Page conférence, séries et paiements (décidé le 13/10)

**13. Nouvelle page conférence** — ✅ livré (structure A : lecteur + colonne latérale)
- Lecteur large, titre, intervenant, actions (favoris, partage à la minute, sous-titres, mode audio), onglets **À propos · Chapitres · Transcription · Résumé · Mes notes**.
- Colonne « épisodes de la série / à suivre » (structure A) ou onglet Épisodes (structure B), « épisode suivant » automatique en fin de lecture.
- Version mobile en une colonne, droite-à-gauche inclus.

**14. Séries et saisons** (les deux structures au choix par série) — découpé en 5 pièces
- ✅ 14.1 Données et API : séries, saisons, épisodes, règle d'accès (série + épisode), contexte pour la fiche conférence.
- ✅ 14.2 Studio : créer et modifier une série, saisons, ajouter / ordonner les épisodes (glisser-déposer), accès par épisode, image de la série.
- ✅ 14.3 Page série publique et accueil : bannière, sélecteur de saison, liste d'épisodes, « Regarder / Reprendre », rangée « Séries ».
- ✅ 14.4 Page conférence : colonne latérale = épisodes de la série, « épisode suivant » à la fin de la lecture, badge « Saison 1 · Épisode 3 ».
- ✅ 14.5 Recherche, bibliothèque et « Continuer » : séries trouvables, reprise à l'épisode en cours.
- Modèle : **Série > Saisons > Épisodes** ou **Série > Épisodes** (sans saisons) ; une conférence peut rester isolée ou devenir un épisode (dans une seule série).
- **Accès au choix, sur les deux niveaux** : réglage par série **et** par épisode ; le réglage de l'épisode l'emporte (ex. épisode 1 gratuit, la suite premium).

**15. Paiements : carte bancaire et PayPal** — ✅ livré côté site (reste : activer PayPal dans Stripe et tester, voir README étape 15)
- Carte bancaire : déjà incluse dans le paiement Stripe actuel (Visa, Mastercard, CB, Apple Pay / Google Pay selon l'appareil).
- **PayPal** : via Stripe (compte français pris en charge, abonnements possibles, **peut nécessiter une validation de Stripe/PayPal** pour les paiements récurrents). À activer dans Stripe → Paramètres → Moyens de paiement, puis tester l'essai gratuit et le renouvellement avec PayPal.
- Côté site : mention des moyens de paiement sur la page des formules, vérification du webhook et de l'essai gratuit avec PayPal. Peu de code : l'essentiel est l'activation et les tests.

### Phase C — Plateforme d'apprentissage 360° (décidé le 13/10)

**Deux règles qui ne changent pas, quelles que soient les étapes :**
1. **Aucune citation ni aucune question n'est publiée sans relecture humaine.** L'IA ne produit jamais un hadith ni une parole de savant. Elle propose des questions **ancrées sur un passage précis de la conférence** (chapitre + minute), la bonne réponse étant justifiée par les mots de l'intervenant ; l'organisateur valide, corrige ou rejette dans le Studio.
2. **Le quiz de fin de vidéo est gratuit pour tout le monde**, visiteur non connecté compris. C'est la meilleure porte d'entrée vers l'inscription. Tout ce qui suit (révision, badges, courbe, attestation) demande un abonnement.

**Les deux formules**

| | Mejliss — 6,99 €/mois · 69,99 €/an | Mejliss Apprentissage — 9,99 €/mois · 99,99 €/an |
|---|---|---|
| Conférences premium, séries, sous-titres, transcription | ✔ | ✔ |
| Quiz de compréhension en fin de vidéo | ✔ (gratuit, même sans compte) | ✔ |
| Révision espacée (J+1, J+3, J+7, J+21), rappels quotidiens | — | ✔ |
| Score, badges, courbe d'apprentissage, attestation de suivi | — | ✔ |
| Ouvrages en PDF | — | ✔ (lien boutique visible par tous) |
| Espace Kids | ✔ visionnage + quiz de fin de vidéo, **1 profil enfant** | ✔ **jusqu'à 5 profils**, avec révision, badges, score et courbe |

Les deux tarifs annuels correspondent bien à « 2 mois offerts ». Techniquement, l'abonnement porte un palier et les fonctions d'apprentissage vérifient ce palier.

**24. Apprentissage (adultes)** — découpé en 5 pièces

- ✅ **24.1 Niveaux et prérequis**
  - Niveau de difficulté sur chaque conférence et chaque série : **débutant, intermédiaire, avancé**, choisi par l'organisateur (vide = tous niveaux).
  - **Prérequis** : une série peut déclarer une ou plusieurs séries à suivre avant elle (« Conseillé après : … »).
  - Badge de niveau sur les vignettes et les pages, filtre par niveau dans le catalogue et la recherche, rangée « Pour commencer » sur l'accueil.

- ✅ **24.2 Quiz : données et Studio** (la grosse étape)
  - Un quiz par conférence : questions à choix multiples, chacune rattachée à un **chapitre et à une minute**, avec l'explication et le passage source.
  - Génération automatique depuis la transcription (moteurs déjà configurés : Claude, Azure, DeepSeek), **jamais publiée telle quelle**.
  - Studio : **file de relecture** pour traiter le fonds existant par lots, écoute du passage source en un clic, valider / corriger / rejeter, et rédaction manuelle de questions.
  - Réglages : nombre de questions (3 à 10), seuil de réussite (70 % par défaut), quiz activé ou non **par conférence**, avec une valeur par défaut dans le back-office.

- ✅ **24.3 Passage du quiz (visiteur)**
  - Proposé à la fin de la vidéo (si activé) et accessible depuis un onglet « Quiz ».
  - Une question à la fois, correction immédiate avec l'explication et le lien « revoir le passage à 12:40 ».
  - Visiteur sans compte : résultat gardé 7 jours dans son navigateur, avec invitation à créer un compte pour le conserver.
  - **Navigation jamais bloquée** : un quiz non validé donne une pastille « À revoir » sur l'épisode, un bandeau discret au lancement de l'épisode suivant, et une carte « Quiz à rattraper » dans « Continuer à regarder ». C'est l'attestation de fin de cours qui exige tous les quiz validés.
  - Bouton « signaler cette question » → file de traitement dans le Studio.

- ✅ **24.4 Score, badges, courbe, attestation — et nouveau palier** (attestation = page publique vérifiable, imprimable en PDF)
  - Score par conférence, par thème et global, qui **s'érode doucement avec le temps** : la courbe redescend si l'on n'entretient pas, ce qui donne son sens à la révision.
  - Niveaux affichés : Découverte, Compréhension, Approfondissement, Maîtrise.
  - Badges : premiers pas, série terminée, thème maîtrisé, régularité…
  - Page « Ma progression » : courbe (instantané quotidien du score), points forts et points faibles par thème, recommandations de conférences.
  - **Attestation de suivi** en PDF à la fin d'un cours, tous quiz validés. Formulation volontairement neutre : une attestation de suivi, ni diplôme ni ijâza.
  - Création du palier **Apprentissage** dans Stripe, règles d'accès, page Abonnement à deux colonnes.

- ✅ **24.5 Révision espacée et rappels quotidiens** (révision = refaire le quiz entier ; désinscription par case dans Mon apprentissage — lien « un clic » dans l'e-mail et séance courte ciblée sur les questions ratées : à reprendre plus tard)
  - Planification **J+1, J+3, J+7, J+21** après un quiz réussi, resserrée sur les questions ratées.
  - File de révision : « 5 questions à réviser aujourd'hui », deux minutes.
  - **Bibliothèque de rappels** dans le Studio : soit un passage extrait mot pour mot d'une de vos conférences (avec le lien vers la minute), soit une citation saisie à la main (auteur, source, recueil, numéro, degré d'authenticité, langue) et marquée « validée ». **Rien de généré par l'IA.**
  - Carte « Rappel du jour » sur l'accueil, e-mail quotidien avec désinscription en un clic, fréquence réglable.

- ✅ **24.6 Rappels indépendants des quiz + citations automatiques** (versets du Coran et hadiths importés d'un corpus public ; l'IA choisit des références dans une liste fermée, le texte affiché est toujours celui de la source ; citation du jour sur l'accueil ; Studio → Rappels)

**25. Ouvrages et boutique** ✅ (filigrane : e-mail + date en pied de page, diagonale et métadonnées)
- Fiche ouvrage : titre, auteur, présentation, couverture, langues disponibles.
- Pour chaque langue : un fichier **PDF** à télécharger **ou** un ou plusieurs **liens boutique** (selon le pays ou le revendeur, liens d'affiliation à mettre en place par Epok).
- Case **« droits confirmés »** obligatoire avant de diffuser un PDF (même principe que pour les vidéos YouTube).
- Téléchargement réservé au palier Apprentissage, **filigrane portant l'adresse e-mail de l'abonné et la date**, lien de téléchargement à durée limitée.
- Rattachement à une conférence et/ou à une série ; bloc « L'ouvrage étudié » sur la page conférence ; page « Ouvrages » publique (bonne pour Google).

**26. Mejliss TV Kids** — découpé en trois parties
- ✅ **26.1 Profils enfants et espace verrouillé** : profils sous le compte du parent (prénom, avatar, tranche d'âge **3-6, 7-10, 11-14**) sans adresse e-mail propre ; sélecteur « Qui regarde ? » ; code parental (haché, blocage après 5 erreurs) pour sortir ; jeton « enfant » refusé partout ailleurs par l'API ; catalogue Kids par tranche d'âge marqué dans le Studio ; reprise de lecture propre à chaque enfant.
- ✅ **26.2 Quiz, étoiles et badges enfants** : quiz de 5 questions (réponses jamais envoyées avant la correction), 1 à 3 étoiles, messages toujours encourageants, correction douce ; avec Apprentissage : 7 badges et révision enfant J+1 / J+3 / J+7 (« À rejouer aujourd'hui ») ; aucun classement entre enfants.
- ✅ **26.3 Contrôle parental** : durée quotidienne par enfant (le serveur mesure le temps lui-même), catalogue « tout sauf ce que je bloque » ou « seulement ma sélection », rapport de progression par enfant (7 ou 30 jours) et e-mail hebdomadaire au parent ; aucun classement ni comparaison entre enfants.
- ✅ **26.4 Identité visuelle Kids et bande d'accueil** : thème « nuit étoilée » coloré (lettres Kids multicolores, quatre étapes numérotées Je regarde / Je fais le quiz / Je progresse / Je retiens durablement, cadres de couleur), bandeau sur la page des parents et sur l'accueil de l'enfant, et bande « Espace Kids » avec les dernières vidéos sur la page d'accueil du site.
- ✅ **26.5 Classement** : sous-catégories (Coran › Lecture…), catégorie principale + 2 autres, plusieurs tranches d'âge Kids par conférence, option « visible dans le catalogue des adultes ».
- ✅ **26.6 Refonte de l'interface** : en-tête allégé et menu du compte (Gestion séparée), menu latéral mobile, recherche en panneau central (loupe), bande Kids fine sous les nouveautés, citation compacte, en-tête et bannière Kids colorés, « Salam 'Aleykoum ».


### Phase C2 — Faire venir et garder les abonnés

**16. Référencement Google** — découpé en deux parties
- ✅ **16.1 Bases techniques** : titre / description / aperçu de partage / adresse canonique pour chaque conférence et série, données structurées `VideoObject` (conférences) et `TVSeries` (séries), titre et description présents dans le HTML dès le premier octet, `sitemap.xml`, `robots.txt`, vignettes à adresse stable, espaces privés en `noindex`. Le partage « à la minute » existe déjà (étape 13).
- ✅ **27 Confort d'édition et d'usage** : modification des conférences en lot dans le Studio, quiz affiché sur le lecteur (et non plus en dessous), page vidéo Kids complète (infos, carte « Teste-toi », « De quoi ça parle ? », « Et ensuite ? »).
- ✅ **17a Vitesse de lecture + mode audio** (livré). ✅ **17b marque-pages et notes personnelles** retrouvés dans Ma bibliothèque (livré).
- ✅ **16.2a/c URL lisibles + chapitres et extrait dans le HTML** (livré). ✅ **16.2b pages intervenants** (livré). 16.2d versions linguistiques (hreflang) reste à décider. Détail d'origine :
- 🧪 **Doublage — étape 0 (test de voix et mesures)** : banc d'essai jetable `dubbing/etape0/` (Chatterbox, CPU) : voix française, voix clonée d'Epok avec consentement daté obligatoire, calage ×1,35 max, original à 15 %, phrases `#` jamais synthétisées, rapport chiffré. Mesure réelle (16/10) : voix clonée ressemblante, mais RTF 34 sur le VPS (trop lent). **Étape 0 bis** : Chatterbox réglé, Piper, Kokoro, conversion vers la voix d'Epok. Rien n'est branché au site. Chaîne testée avec un faux moteur ; **modèle réel non testé** (à mesurer sur le VPS). Ensuite : décision sur le moteur, puis S1.
- ✅ **Étape S1 — module « Doublage français »** : module `dubbing` activable (Admin → Modules), Studio → Audio et doublage (conférences, réglages par défaut, bibliothèque de voix avec consentement daté, langue d'écoute), fiche d'une conférence selon la maquette (voix, curseurs, piste estimée, segments, phrases `#` gardées en voix d'origine), estimation du temps de calcul, suivi de la langue d'écoute. Aucune voix générée : boutons désactivés jusqu'au moteur. Suite : D1a (service de doublage : Piper chargé en mémoire, conversion par blocs, écoute de 60 s, file d'attente de nuit).
- ✅ **Étape D1a — service de doublage** : service `dubbing/` (Piper en mémoire, calage, conversion par blocs vers la voix cible, mélange, fichiers AAC), file d'attente (écoute de 60 s tout de suite, doublage complet la nuit), signe de vie, annulation, reprise après arrêt ; Studio : boutons actifs, progression, lecteurs, état de chaque phrase, vitesse mesurée reprise par l'estimation. Suite : D1b (relecture, marquage voix d'origine, glossaire, contrôle qualité), puis D2 (lecteur version française).
- ✅ **Étape D2 — version française dans le lecteur** : carte « Langue de l'audio » (version française / voix d'origine, mode audio seul), mention sur la vidéo, piste française jouée en phase avec la vidéo envoyée (vidéo coupée) ou par-dessus YouTube / Vimeo / archive.org (son baissé), « Demander la version française » pour les abonnés avec e-mail quand elle est prête, colonne « Demandes » au Studio, langue écoutée comptée. Suite : D1b (relecture, marquage voix d'origine, glossaire, contrôle qualité).
- ✅ **Étape D1b — relecture avant doublage** : tableau des phrases modifiable (correction qui vaut aussi pour les sous-titres, case « Voix d'origine » à la place du « # », « Accepter tel quel » pour les phrases à revoir, colonne Prononciation), validation de la relecture (qui, quand, « à refaire » si le texte change, doublage complet bloqué tant qu'elle n'est pas faite — réglable), glossaire de prononciation commun à tout le site (onglet Glossaire, essai « la voix lira »), service 0.3.0. Suite : S2 (stockage et archivage), S3 (finitions du Studio), E0 (prototype de l'éditeur).
- ✅ **Étape S2 — stockage et archivage** : module « Stockage et archivage » (Studio → Paramètres) : espace Garage, fournisseur au choix (PlanetHoster SFTP par défaut, S3, WebDAV, aucun) avec rclone, identifiants chiffrés, « Tester la connexion », fichier d'essai archivé puis restauré, chiffrement facultatif, règles automatiques (pistes audio de travail du doublage après 30 jours, seuil d'alerte, capacité), restauration en un clic (aussi depuis la fiche doublage). Suite : S3 (tableau de bord, contenus, activité), E0 (prototype de l'éditeur).
- ✅ **Étape S3 — tableau de bord, contenus, activité** : tableau de bord selon la maquette (dernière conférence, données de la chaîne, production en cours, à faire, espace de stockage), encart « Stockage » et pastille « Activité » dans le menu, Contenus avec le parcours de production en 7 étapes, langue AR → FR, visibilité, vues et filtres À doubler / À relire / Publiées, Activité avec pause, reprise, priorité, pause générale des tâches lourdes et plage horaire respectées par le worker, le transcripteur, le traducteur et le service de doublage. Suite : E0 (prototype de l'éditeur, porte de décision).
- ✅ **Étape E0 — prototype du moteur de rendu (porte de décision)** : prototype jetable `studio-proto/e0/` (montage JSON → une commande FFmpeg : coupes, fondus, logo, bandeaux, sous-titres recalés, voix française et musique avec ducking, volume normalisé, aperçu 360p), rapport de choix, constat Garage : l'original envoyé est conservé. Mesure VPS (4 fils) : aperçu RTF 0,29, 1080p RTF 0,85 (≈ 51 min par heure). **Décision d'Epok du 17/10/2026 : FFmpeg piloté par notre code**, temps de rendu correct, pas de Remotion (MLT en plan B).
- ✅ **Étape E1 — éditeur de montage, timeline multipiste** : module `editor` (0.1.0, inactif par défaut) ; Studio → Éditeur (montages, conférences à monter) ; éditeur plein écran selon la maquette (6 pistes : vidéo, voix d'origine, voix française, musique, titres et logo, sous-titres ; pistes liées qui suivent les coupes) ; couper, supprimer un passage, déplacer, raccourcir, aimant, zoom, annuler / rétablir (200 gestes), raccourcis clavier ; aperçu 360p dans le navigateur ; sauvegarde automatique ; versions (automatiques, nommées, retour en arrière) ; verrou (un seul éditeur, les autres en lecture seule, reprise par l'administrateur au journal d'audit) ; étape « Montée » de Studio → Contenus. Ordinateur seulement (≥ 1024 px). Déploiement : API puis web, puis activer le module. Suite : E2 (audio pro), E3 (habillage), E4 (rendu et remplacement), E5 (montage par la transcription, extraits 9:16).
- ✅ **Étape E2 — éditeur de montage, audio pro** : volumes, voix d'origine coupée, fondus aux raccords, réduction du bruit (écoute de 10 s avant / après), voix française liée (utilisée ou non, volume, voix d'origine sous la voix française en %, fondu), musiques de fond (bibliothèque importée par l'administrateur, déplacer, raccourcir, boucle, fondus, baisse automatique sous la voix), niveau sonore homogène (LUFS visés) ; formes d'onde et niveau mesuré par FFmpeg dans l'API (file visible dans Studio → Activité), courbe du volume sur la timeline ; aperçu qui joue le mixage. Module `editor` 0.2.0 (migration editor/002_audio.sql), doublage 0.7.0, FFmpeg dans l'image de l'API. Registre : points 1, 2 et 4 réglés. Déploiement : API puis web.
- ✅ **Étape E3 — éditeur de montage, habillage** : titres et bandeaux (variables `{titre}`, `{intervenant}`), logo (bibliothèque ou image de la chaîne), écrans d'ouverture et de fin, transitions (coupe, fondu au noir / blanc), sous-titres incrustés (arabe compris), modèles par chaîne ou pour toutes les chaînes, « Voir l'image finale » calculée par FFmpeg. Module `editor` 0.3.0 (migration editor/003_dress.sql). Registre : versions automatiques qui ignoraient son et habillage, réglé. Déploiement : API puis web. Suite : E4 (rendu et remplacement de la vidéo), E5 (montage par la transcription, extraits 9:16).
- ✅ **Étape E4a — éditeur de montage, rendu de la vidéo** : bouton « Rendre la vidéo » (aperçu rapide 640×360 ou rendu final à la qualité de la source, H.264/AAC, niveau sonore en deux passes) ; plan de rendu préparé par l'API (plan.js) et calculé par le worker (render.js) : coupes, voix d'origine (fondus aux raccords, réduction du bruit, baisse sous la voix française), voix française, musiques, titres, logo, écrans, fondus au noir / blanc, sous-titres incrustés ; progression, regarder, télécharger, annuler, effacer, 3 rendus gardés ; Studio → Activité (tâche lourde). Module `editor` 0.4.0 (migration editor/004_render.sql), `dubbing` 0.7.1, worker à redéployer. Registre : pause des analyses du son (file « editor ») réglée.
- ✅ **Étape E4b — remplacement de la vidéo publiée** : écran avant / après (maquette écran 5), préparation de la nouvelle version par le worker (hls/<id>/r/<n>/), bascule dès qu'elle est prête (choix d'Epok) avec carte du temps : sous-titres de toutes les langues, chapitres, quiz / actions / rappels (passage coupé : à revoir), notes et reprises recalés ; nouvelle transcription puis traductions et résumés (sauf « Conserver mes corrections ») ; anciens spectateurs servis 6 h (v=) ; doublage retiré, montage remis à zéro ; original gardé N jours puis archivé ; « Restaurer l'original » (même depuis les archives). Registre : point 3 réglé. Modules editor 0.5.0, dubbing 0.8.0, storage 0.3.0, migration 056 du socle. Déploiement : API, web, worker, dubbing.
- ✅ **Étape E5a — montage par le texte** : onglet « Texte » de l'éditeur (colonne élargie) : transcription mot à mot dans l'ordre de la vidéo, clic = la vidéo y va, sélection à la souris ou Maj + clic, « Couper la sélection » / Suppr retire le passage, mots barrés, « Rétablir », Ctrl+Z, recherche (arabe sans voyelles), traduction coupée phrase par phrase. Whisper horodate désormais chaque mot (réglage « Horodater chaque mot », table `transcript_words`, migration 057) ; place estimée pour les conférences plus anciennes. Module editor 0.6.0. Registre : point 23 réglé, points 24 (décision) et 25 (essai réel, étape F). Déploiement : API, web, transcriber.
- ✅ **Étape E5b — extraits courts 9:16** : page « Extraits 9:16 » (bouton dans l'éditeur) : passage (secondes ou clic dans le texte), cadre vertical glissable avec aperçu téléphone, titre, sous-titres courts de 5 mots (mots horodatés E5a), voix française en option, enregistrement automatique, rendu 360×640 ou 1080×1920 (−14 LUFS) par le worker, téléchargement MP4 ; jamais utilisable pour remplacer la vidéo publiée. Module editor 0.7.0, migration `006_shorts`. Registre : points 26 et 27 (essais réels, étape F). Déploiement : API, web, worker.
- ✅ **Étape E5c — « Préciser la place des mots »** : bouton dans l'onglet Texte ; le service de transcription réécoute l'audio et note le moment exact de chaque mot du texte existant (texte et traductions inchangés, phrases non retrouvées laissées telles quelles). Migration `058_word_align`, module editor 0.7.1. Registre : point 24 réglé, point 28 (non visible dans Activité). Déploiement : API, web, transcriber.
- ✅ **Étape D3a — banc d'essai des nouvelles voix** : recherche Voicebox / Qwen3-TTS / Chatterbox (licences MIT et Apache 2.0, français, vitesse sans carte graphique) ; banc `dubbing/d3bench` qui compare, pour chaque échantillon fait dans Voicebox (femme, fille, garçon, autres hommes), la méthode actuelle (Tom + conversion) et Qwen3-TTS (clonage direct). À lancer sur le VPS par Epok, puis écoute. Registre : point 29.
- ✅ **Complément (20/10) — téléchargement des sous-titres** : bouton « Télécharger les sous-titres (.vtt) » dans Studio → Contenu → Transcription (langue affichée, version enregistrée) ; route API `GET /talks/:id/studio/subs/<langue>.vtt` réservée à l'organisateur de la conférence (ou à l'admin). Sert aussi d'entrée au banc d'essai du doublage. Déploiement : API puis web.
- ✅ **Préparation de l'étape F (20/10)** : liste de vérification à cocher sur le VPS, `docs/ETAPE-F-VERIFICATIONS.md` (E4a à E5c, avec les commandes).
- ✅ **Étape E5d — le cadre vertical suit le visage** (20/10) : case « Le cadre suit le visage » sur chaque extrait 9:16 ; le service de transcription repère le visage le plus grand et le plus présent (YuNet, sur processeur) et calcule une trajectoire douce ; corrections à la main (on glisse le cadre en pause : correction de 3 s) ; rendu et aperçu suivent la trajectoire. Migration `059_face_track`, module editor 0.8.0. Registre : point 27 réglé, points 30 à 33. Déploiement : API, web, transcriber.
- ⏳ **Étape D3b** (après l'écoute) : intégrer la méthode choisie au service de doublage (nouvelles voix) ; puis **D3c** : détection automatique des intervenants ; puis **étape F** (finitions + essais réels sur le VPS de E4 à E5c).
- ⏳ **Étape D3 — voix variées et intervenants** (à venir) : ajouter des voix de femmes, d'enfants et de nouvelles voix d'homme pour varier selon les contenus, puis détection automatique des intervenants. À étudier à ce moment-là : **Voicebox** (voicebox.sh, studio local open source ; moteurs Qwen3-TTS, Chatterbox Multilingual…) pour générer des échantillons de voix (déjà utilisables aujourd'hui comme « voix cible » dans Studio → Audio et doublage → Voix) ou comme voix de base ; vérifier le français, la licence de chaque moteur et la vitesse sans carte graphique sur le VPS.
- 16.2 **Contenu et URL** : URL lisibles (`/conferences/la-patience-dans-l-epreuve`, anciennes adresses redirigées), chapitres et extrait de transcription affichés dans le HTML des conférences gratuites, **page par intervenant** (présentation, toutes ses conférences et séries), versions linguistiques (`hreflang`, demande une URL par langue : à décider avec vous).

**17. Confort de lecture**
- **Mode audio** : écoute écran éteint, comme un podcast.
- Vitesse de lecture (1×, 1,25×, 1,5×, 2×).
- Marque-pages et notes personnelles sur un passage de la transcription, retrouvés dans Ma bibliothèque.

**18. Mesure d'audience et statistiques** — *fait (README, étape 18) ; restent Umami (optionnel) et la conversion aperçu → essai*
- Umami hébergé sur le VPS (sans cookie publicitaire).
- Statistiques internes : vues, temps de visionnage, taux de fin, conférences et intervenants les plus regardés, conversion de l'aperçu vers l'essai.
- Tableau de bord admin et statistiques par organisateur dans le Studio.

**19. Collections et listes** (les séries sont dans l'étape 14) — *fait*
- Collections éditoriales (par l'équipe) : cycles, séries d'un même intervenant, thèmes du moment.
- Listes personnelles des abonnés, partageables.

**20. Modération** — *fait (rôle « modérateur » au lieu de « relecteur »)*
- Rôle **relecteur** : les conférences des organisateurs externes sont validées avant d'être en ligne.
- Signalement d'un contenu par les spectateurs, avec une file de traitement dans le back-office.
- Journal des actions des admins (qui a modifié quoi).

**21. Notifications et cadeaux** — *fait*
- E-mails : nouvelles conférences des intervenants suivis, sélection de la semaine, avec désinscription en un clic.
- **Abonnement à offrir** : carte cadeau (1, 3 ou 12 mois) payée par Stripe, code à activer.

### Phase C bis — Du savoir à l'action (décidée avec Epok le 14/10/2026, passe avant 20 à 23)

**Principe** : « l'Islam se vit au quotidien ». Une conférence ne s'arrête pas au quiz : elle débouche sur un acte, suivi dans l'espace Apprentissage, puis sur un bilan personnel régulier. Boucle : **comprendre** (vidéo + quiz) → **choisir une action** → **s'engager** (intention, échéance) → **faire le point** chaque semaine → **revenir** (rappel du vendredi).

Décisions prises : (1) les propositions d'action sont **générées par l'IA puis validées** par l'organisateur de la conférence, un modérateur ou un administrateur (rien n'est publié sans validation) ; (2) l'écran « Et maintenant, que faire ? » est **visible par tous**, le suivi des engagements, le bilan personnel et les rappels sont **réservés à Apprentissage** ; (3) rappel hebdomadaire **le vendredi** ; (4) base de thèmes inspirée de l'*Ihyâ' 'ulûm ad-dîn* d'al-Ghazâlî (qualités et défauts), proposée dans `docs/themes-tazkiya-base.md`, à faire relire.

Règles transversales :
- **Données très sensibles** (pratique religieuse, défauts personnels) : consentement explicite au premier usage (RGPD, convictions religieuses), contenu **chiffré en base** (clé dédiée `PRACTICE_KEY`, distincte de `SETTINGS_KEY`), **jamais** visible par un administrateur, jamais dans les statistiques ni les exports de l'étape 18, **export et suppression en un clic**, mention dans la page Confidentialité.
- **Pas de score, de série de jours, de classement ni de badge** dans le bilan personnel (risque de culpabilité et d'ostentation). États : *à faire / en cours / fait / pas encore*, et pour le bilan *réussi / en progrès / pas encore*. Les étoiles et badges restent réservés à Kids.
- **L'IA ne rédige jamais de texte religieux** : elle propose des idées de mise en pratique ; les références (verset, hadith) viennent du corpus déjà importé (étape 25), comme pour les citations. Chaque proposition affiche : « Idée de mise en pratique, pas un avis religieux. »
- Le rôle **modérateur** arrive avec l'étape 20 ; d'ici là, la validation est faite par l'organisateur (ses conférences) et l'administrateur.

**29. Mise en pratique (après la vidéo et le quiz)** — ✅ fait (README, étape 29)
- *29.1 Propositions d'action* : génération par l'IA à partir de la transcription, du résumé et des points clés (même chaîne que le quiz : brouillon → relecture → approuvé) ; 3 à 5 propositions par conférence en trois tailles (● petit pas, ●● moyen, ●●● ambitieux), avec référence facultative du corpus ; file de validation dans le Studio (organisateur) et dans l'administration ; modification, rejet, ajout manuel.
- *29.2 Écran « Et maintenant, que faire ? »* : affiché à la fin du quiz (ou à la fin de la vidéo s'il n'y a pas de quiz) et en bas de la page de la conférence ; **visible par tous**. Le lecteur choisit une proposition ou écrit la sienne.
- *29.3 Mes engagements* (Apprentissage) : intention (niyya) facultative, échéance (aujourd'hui, cette semaine, ce mois-ci), état *à faire / en cours / fait / pas encore*, note privée ; liste dans l'espace Apprentissage, regroupée par conférence et par thème. Sans abonnement Apprentissage : la proposition s'affiche et peut être copiée, l'enregistrement est proposé en abonnement.
- Tables : `practice_suggestions` (talk_id, texte par langue, taille, origine ia/manuelle, statut brouillon/approuvé/rejeté, validé par, référence), `practice_commitments` (user_id, suggestion_id ou texte libre chiffré, talk_id, intention chiffrée, échéance, état, note chiffrée, dates).
- Tests : droits (qui valide, qui voit quoi), jamais de proposition non validée côté public, chiffrement des champs, isolation entre utilisateurs, suppression en cascade avec le compte.

**30. Bilan personnel — *Tazkiyat an-nafs* (Apprentissage)** — ✅ fait (README, étape 30). Écarts par rapport à la spec : l'e-mail hebdomadaire ne liste pas le texte des engagements ni des objectifs (chiffres et lien seulement, un e-mail n'étant pas chiffré) ; le choix de thèmes dans la base est désactivé par défaut tant qu'elle n'est pas relue (réglage « Proposer la base de thèmes »).
- *30.1 Mes objectifs* : deux listes tenues par la personne, **qualités à cultiver** et **défauts à corriger** ; on les choisit dans la base de thèmes ou on les écrit soi-même ; une personne peut en archiver ; aucun maximum arbitraire mais une limite raisonnable (20 actifs).
- *30.2 Bilan de la semaine* : pour chaque objectif, *réussi / en progrès / pas encore* + note facultative ; historique des 4 à 8 dernières semaines sous forme de petite frise (couleurs douces, aucun total ni pourcentage « de réussite ») ; possibilité de relier un objectif à un engagement de l'étape 29.
- *30.3 Rappel du vendredi* : un **seul** e-mail hebdomadaire (jour par défaut : vendredi, réglable ; heure réglable dans Administration → Paramètres, 17 h par défaut) listant les engagements en cours et le bilan à faire, avec un lien direct ; désactivable par chacun ; réutilise l'envoi d'e-mails de l'étape 9 et la boucle de l'e-mail de révision. Sur l'application Android (étape 22) : notification à la place de l'e-mail.
- *30.4 Confidentialité* : consentement au premier usage, export (JSON et CSV) et suppression complète en un clic, mention légale mise à jour.
- Tables : `self_goals` (user_id, nature qualité/défaut, thème facultatif, intitulé chiffré, dates, archivé), `self_checkins` (goal_id, semaine, état, note chiffrée ; unique par objectif et semaine) ; colonnes `users.practice_consent_at`, `users.practice_email`, `users.practice_weekday`.
- Tests : isolation totale entre comptes, un administrateur ne lit jamais le contenu, e-mail du vendredi (jour, heure, désinscription, une seule fois par semaine), export et suppression, absence de toute donnée dans `/admin/stats`.

**31. Thèmes, parcours et évolution** — *fait (31.1 à 31.3 ; 31.4 reste à faire)*
- *31.1 Bibliothèque de thèmes* : import de la base `docs/themes-tazkiya-base.md` (qualités, défauts, thèmes d'action) une fois relue ; page par thème avec description, petits pas et **conférences du catalogue associées** (par étiquette posée par l'organisateur ou par catégorie) ; on peut « ajouter à mes objectifs » ou « m'engager » depuis une conférence.
- *31.2 Mon évolution* (Apprentissage) : tableau personnel qui rapproche, **par thème**, ce qui a été appris (conférences vues, quiz réussis) et ce qui est mis en pratique (engagements faits, objectifs en progrès) ; vue mensuelle ; aucun partage public, aucune comparaison avec d'autres personnes.
- *31.3 Retour aux organisateurs* : chiffres **anonymes et agrégés** (par exemple « 38 personnes se sont engagées après cette conférence »), affichés seulement au-delà de 5 personnes ; aucun contenu individuel. Ajouté à l'onglet Statistiques de l'étape 18.
- *31.4 Plus tard* : version **Kids** (actions du jour validées par le parent, étoiles), notifications push (Android), partage volontaire d'un engagement avec un proche de confiance.

### Phase D — Au-delà du site

**22. Applications** (décision d'Epok du 20/10 : après l'étape F, dans cet ordre)
- *22a — Site installable (PWA)* : icône sur l'écran d'accueil (téléphone, tablette, ordinateur), ouverture en plein écran, page « hors connexion ». Petite étape. Limites sur iPhone : pas de téléchargement hors ligne fiable des vidéos, notifications limitées.
- *22b — Application Android + iPhone/iPad* en **React Native (Expo)**, un seul code pour les deux (choix fait plutôt que Kotlin + Swift pour ne maintenir qu'une application ; l'application iPhone est fabriquée et envoyée sur l'App Store par les serveurs d'Expo, sans Mac). Lecteur vidéo du téléphone (HLS), plein écran, image dans l'image, son écran éteint (mode audio), reprise synchronisée avec le site, **téléchargement hors ligne**, notifications, espace Kids, **diffusion vers la télé (Chromecast et AirPlay)**. Branchée sur l'API actuelle.
  **Décisions d'Epok (20/10)** : (1) le paiement se fait **uniquement sur le site** (l'application sert à se connecter et regarder, aucun achat dedans) ; (2) l'application s'installe **depuis le site** (page « Télécharger l'application »), pas depuis les magasins.
  Conséquences (vérifiées le 20/10, à revérifier au moment de l'étape) :
  - Android : fichier APK téléchargé depuis le site ; l'application vérifie elle-même ses mises à jour et propose la nouvelle version. Google exige l'enregistrement des développeurs, même hors Play Store : Brésil, Indonésie, Singapour et Thaïlande depuis le 30/09/2026, partout en 2027 ; une application non enregistrée reste installable par un parcours « avancé » (attente de 24 h). → Epok devra enregistrer son identité de développeur chez Google (sans publier sur le Play Store).
  - iPhone / iPad : une installation depuis un site n'est possible qu'en Europe (« Web Distribution » d'Apple, iOS 17.5 ou plus), avec des conditions d'accès (par exemple 2 ans d'adhésion au programme développeur et plus d'un million d'installations, ou une des autres garanties financières demandées par Apple), la notarisation par Apple et une commission de 5 % sur les transactions. Hors de portée au départ. → Décision à prendre par Epok : version installable du site (PWA, ajoutée à l'écran d'accueil depuis Safari) ou App Store (paiement toujours sur le site).
  - Android TV : installation depuis un site possible mais peu pratique sur une télé (application « Downloader » et un code). → À décider avec Epok au moment de 22c.
  **Décision d'Epok (20/10, 20 h 57)** : rien n'est décidé pour les magasins (App Store, Play Store) pour le moment. **Premiers essais hors magasins** : Android avec le fichier APK téléchargé depuis le site ; iPhone avec la version installable du site (PWA), seule voie hors App Store sans compte développeur Apple.
- *22c — Android TV / Google TV* : même base de code, navigation à la télécommande, lecture, reprise.
- *22d — Apple TV* : seulement si la demande est là (même base de code) ; Apple TV ne s'installe que par l'App Store.
- Plus tard, si besoin : applications Samsung (Tizen) et LG (webOS), chacune à part.

**23. Diffusion à grande échelle** (déclencheur : bande passante du VPS proche de la limite)
- CDN pour les vidéos (par exemple Bunny), avec les jetons d'accès premium conservés.
- Si besoin, conversion et transcription sur une machine séparée.

### Phase E — Reportée à la fin

**8. Socle technique et sécurité** (à faire avant un trafic important)
- Sauvegardes automatiques chaque nuit : base PostgreSQL (`pg_dump`) et vidéos Garage, avec rotation (7 jours, 4 semaines, 6 mois), copie hors du VPS et **test de restauration** documenté.
- Surveillance avec Uptime Kuma : alerte (e-mail ou téléphone) si un service tombe, si un conteneur redémarre en boucle ou si le disque dépasse 80 %.
- Réseau Docker dédié `mejliss` entre l'API, Meilisearch et les services : plus de dépendance à une adresse IP qui change.
- Rotation des secrets : mot de passe de la base (apparu dans une capture) et `GARAGE_RPC_SECRET`.

## Idées mises de côté (à étudier plus tard, pas planifiées)
- **Vignettes interactives style plateforme de streaming** (inspiration : captures de Prime Video fournies par Epok) : au survol, la carte grossit ; si la souris reste dessus, un **aperçu vidéo** démarre dans la carte, avec les infos (titre, intervenant, durée, catégorie, langue, accès, note…). **Toutes les informations affichées sur la carte sont paramétrables** (Administration → Paramètres : choisir lesquelles apparaissent, délai avant l'aperçu, aperçu activé ou non). À prévoir : sur mobile (pas de survol), un appui long ou un bouton ; respect de « réduire les animations » ; pas d'aperçu pour les conférences premium non accessibles au visiteur sans l'accord prévu. À rapprocher de l'étape 12 (accueil vitrine).
- **Haut du site avec bannière photo / vidéo** : grande bannière en tête d'accueil (conférence vedette en image ou en vidéo muette, titre, boutons « Regarder » et « Plus d'infos », points de navigation entre plusieurs vedettes), choisie et programmable depuis le Studio. À rapprocher de l'étape 12 (accueil vitrine).

## Suggestions ajoutées (à valider, non planifiées)
- **Page intervenant** (déjà dans « Référencement ») avec ses séries, à rapprocher de l'étape 14.
- *(Le quiz sur la vidéo, les cours par niveau et le certificat de progression sont devenus les étapes 24 à 26.)*
- **Reprise automatique** : « Continuer » mène à la bonne minute et au bon épisode.
- **Cercle de sous-titres** : traduction à la demande d'une langue manquante par un abonné (file d'attente côté Studio).
- **Liste de lecture « À regarder plus tard »** distincte des favoris.
- **Essai sans carte** (option Stripe) pour réduire la friction à l'inscription.
- **Paiement local** : Apple Pay / Google Pay (inclus avec la carte), virement SEPA, ou autres moyens selon ta clientèle.
- **Pays et langues** : page d'accueil et e-mails traduits (déjà fr/en/ar) ; ajout du turc, de l'indonésien ou de l'ourdou si la clientèle le justifie.

## Ordre de travail retenu

Socle no-code en cours : I1 (apparence), I2 (textes) et I3 (pages en blocs) et H (accueil des membres en blocs) I4 (en-tête, menus, pied de page) I5 (mode édition sur la page) M1, M2 (toutes les fonctions en modules), M3a (socle API indépendant) et M3b (site web modulaire) faits ; suite : vérification finale globale, module Studio (autre session) à intégrer. Fait : 24 à 28, 28b (CSP), 18 (statistiques), 29 (mise en pratique), 30 (bilan personnel) 31 (thèmes, évolution), 20 (modération), 19 (collections, listes) 21 (notifications, cartes cadeaux) A (fonctions activables/désactivables) B (menu latéral et onglets) E1 (vitrine visiteur) et C (chaînes). **Suite : 22** (applications Android), 23 (CDN), 16.2d (hreflang). L'étape 8 (sauvegardes, surveillance) reste en dernier, avant un trafic important. Refonte complète de TriMaint : projet séparé, à planifier après Mejliss.

## Rappels
- **Problèmes à régler** : registre `docs/PROBLEMES-A-REGLER.md`, relu et mis à jour à chaque « go » (règle d'Epok du 17/10/2026).
- TriMaint (port 7001) n'est jamais touché.
- Après chaque redéploiement : `/root/apply-limits.sh`, puis vérifier le port nginx de l'API (7000).
- Les clés ne passent jamais par un chat : DockPanel ou Admin → Paramètres uniquement.


## Correctif 20/10 — aperçu de l'éditeur
- L'aperçu 360p (éditeur et page Shorts) utilise maintenant hls.js d'abord ; la lecture native du navigateur n'est qu'un secours (les Chrome récents l'annoncent mais échouent sur nos segments fMP4). Fichiers : `web/modules/editor/Preview.js`, `ShortsPage.js`. À confirmer sur le VPS avec arab1.


## Étape D3b (20/10) — voix de synthèse et catégories
- Méthode actuelle gardée (Piper + ChatterboxVC) ; Qwen abandonné. Module `dubbing` 0.9.0, migration `005_synthetic_voices.sql`. Case « Voix de synthèse » (sans consentement), filtre par catégorie, choix de la voix de conversion par catégorie avec écoute. Reste D3c (détection automatique des intervenants), puis E6, puis le plan du 20/10 (fiche vidéo, chaînes, Kids catalogue, Shorts, Créateur), puis F.


## Étape E6a (20/10) — timeline lisible et zoom
- Bandeau `.banner` corrigé, pistes colorées, titres sur lignes séparées, logo sur sa ligne, zoom frise (boutons, Ctrl + molette, jusqu'à 5 s) et aperçu (150/200 %). Reste E6b (placer sur la vidéo), E6c (format et qualité), puis fiche vidéo, chaînes, Kids catalogue, Shorts, Créateur, D3c (+ hauteur de voix), F.


## Étape E6b (20/10) — placer les éléments sur la vidéo
- Titres, bandeaux, logo, sous-titres glissés à la souris (aimant, zone de sécurité, flèches, Ctrl+Z), positions en % de l'image respectées par le rendu et l'image finale. Module editor 0.9.0. Reste E6c (format et qualité du rendu).


## Étape E6c (20/10) — format et qualité du rendu
- 16:9 / 9:16 / 1:1 (fond flouté ou recadrage), qualité 360 / 720 / 1080 plafonnée à la source. E6 terminée. Suite proposée : fiche vidéo allégée (2 maquettes), chaînes riches + multi-chaînes, Kids catalogue, Shorts publics, Créateur, D3c (+ hauteur de voix), F.


## Fiche vidéo B (20/10)
- Proposition B choisie et codée (bandeau, 5 actions, menu Plus, carte Apprendre, À suivre en vignettes). Suite : chaînes riches + multi-chaînes, Kids catalogue, Shorts publics, Créateur, D3c, F.
- Ajustements (20/10) : réglages de lecture (vitesse, écoute sans l'image) sur le lecteur ; onglet Résumé ouvert par défaut ; « Chapitres et extrait » au-dessus de « À suivre » ; fiche sans débordement à 390 px.

## Chaînes riches + multi-chaînes (20/10)
- Migration 060 : champs riches, équipe d'éditeurs, création de chaînes vides, sélecteur de chaîne facultatif (conférence, import, série). Suite : Kids catalogue, Shorts publics, Créateur, D3c, F.

## Kids catalogue (20/10)
- Rubriques Kids (Admin), classement (fiche + lot), rangées de suggestions, recherche enfant, filtre d'âge. Suite : Shorts publics, Créateur, D3c (+ hauteur de voix), F.

## Shorts publics (20/10)
Module `shorts` : publier un extrait vertical de l'éditeur (copie du rendu), brouillon / publié, vues à part (une par personne et par jour), fil vertical `/shorts`, rangée d'accueil (bloc « Shorts »), onglet « Shorts » de la chaîne, Studio → Shorts. Espace Kids : `/kids/shorts` (conférences Kids de son âge). Défilement au doigt et boutons sur téléphone et tablette. Registre n°38 réglé ; n°48 et 49 ouverts.

## Points du registre réglés (20/10, soir)
n°13 fondu enchaîné · n°28 et 31 place des mots et suivi du visage dans Studio → Activité (pause, priorité, annulation) · n°33 mot dit en or dans les shorts · n°47 recherche Kids sans accents ni petites fautes · n°48 fichiers effacés avec la conférence · n°49 lien Shorts dans les menus et affiche tirée de la vidéo. Restent : essais réels sur le VPS (étape F) et décisions d'Epok (15, 32 ; 14 et 20 à surveiller).

### Décision d'Epok (20/10, 20 h 58) : Créateur en dernier
- Le Créateur sera disponible en version web uniquement (pas dans les applications) : il passe en toute fin de plan, après D3c (+ hauteur de voix), l'étape F et les applications (étape 22).
- Ordre actuel : D3c (+ hauteur de voix) → F (vérifications sur le VPS) → 22 (applications) → Créateur.

## Étape D3c (21/10) — intervenants et hauteur de voix
- Détection des intervenants par la voix (transcripteur, modèle libre sherpa-onnx), voix + hauteur (±4 demi-tons) par intervenant, corrections de phrases, propositions de voix, aperçu rapide d'une hauteur, file dans Studio → Activité. Module doublage 0.10.0 (migration 006), service de doublage 0.5.0. Voir README « Étape D3c ». Reste : essais réels (étape F). Ordre : F → 22 (applications) → Créateur.

## Étape Import (21/10) — copier une vidéo externe chez nous
- Une vidéo YouTube / Vimeo / archive.org (ou de n'importe quel site, ou un lien direct) peut être copiée dans Garage et devient une vidéo hébergée (HLS, mode audio, éditeur, doublage mixte, shorts 9:16). Facultatif pour chaque vidéo ; case d'attestation des droits + journal (Studio → Activité). Organisateurs et administrateurs. Migration 061 (table `media_imports`), fonction `media_import` (Admin → Fonctions), réglages `import_max_gb` et `import_max_height`. Voir README « Étape Import ». Reste : essais réels sur le VPS (étape F). Aide en images / module d'aide avec moteur de recherche : plus tard (registre n°52). Ordre : F → 22 (applications) → Créateur.

## Étape F (21/10) — contrôle du VPS et reconstruction
- Script de contrôle après déploiement `ops/verify/verify-deploy.sh` (conteneurs, ports, nginx, limites, migrations, FFmpeg, yt-dlp, Garage, disque, sauvegarde, charge, journaux), guide `docs/RECONSTRUIRE-DE-ZERO.md`, liste `docs/ETAPE-F-VERIFICATIONS.md` mise à jour. Les essais réels (conférence d'une heure, doublage, import, rendu, téléphone) se déroulent sur le VPS avec Epok : la liste se coche au fur et à mesure. Ordre : F → 22 (applications) → Créateur.

## Correctif stockage (21/10) — débit des qualités plafonné par la source
- Le worker ne convertit plus une vidéo à un débit supérieur à celui de sa source (registre n°57) : une conférence de 48 min passe de ≈ 3,4 Go à ≈ 1,1 Go (original compris). Worker seul à redéployer. Voir README « Correctif stockage ».

## Étape F — bilan (21/10, 17 h)
- Liste de vérification déroulée sur le VPS : contrôle automatique (0 échec), import (archive.org, Vimeo, YouTube sans cookies, annulation, relance, adresse interne refusée), conférence de test de 48 min importée, éditeur, son, image finale, rendu, remplacement, montage par le texte, extraits 9:16, intervenants : validés par Epok. Restent au registre : n°57 (gain de stockage à mesurer après reconversion), n°58 (fichier archive.org), n°50 (arabe, voix de femme / d'enfant, licence). Suite : étape 22 (applications) sur le « go » d'Epok.

## Étape 22a (21/10) — site installable (PWA)
- Manifeste, icônes (dont « maskable »), service worker (fichiers du site gardés, page hors connexion FR/EN/AR, jamais de page, d'API ni de vidéo), page « Télécharger l'application » (/application : bouton d'installation, explications iPhone / Android / ordinateur), lien du pied de page, fonction `app_install` (Admin → Fonctions). Voir README « Étape 22a ». Reste : essai sur vrais appareils (Epok). Suite : 22b (application React Native / Expo) sur « go ».

## Étape 22b-1 (21/10) — application Android + iPhone/iPad : socle et lecture
- Dossier `mobile/` (Expo SDK 58, React Native, TypeScript) : connexion, accueil, conférences, lecteur (HLS, plein écran, incrustation, audio seul et son écran éteint, reprise synchronisée, résumé, chapitres, favori), compte (langue FR/EN/AR en RTL, lien vers l'abonnement sur le site). APK fabriqué par GitHub Actions. API et site inchangés. Voir README « Étape 22b-1 » et `mobile/README.md`. Reste (tranche 2, sur « go ») : téléchargement hors connexion, Apprendre, Bibliothèque, Kids, notifications, Chromecast / AirPlay, séries ; puis page « Télécharger l'application » avec l'APK, 22c Android TV, 22d Apple TV.

## Étape 22b-2a (21/10) — application : Bibliothèque, Apprendre, quiz, mise en pratique
- 5 onglets (Accueil, Conférences, Apprendre, Bibliothèque, Compte) ; favoris et listes ; quiz ; mise en pratique (engagements chiffrés) ; Apprendre (révision du jour, quiz à passer, score, 8 badges, engagements, encadré « offre Apprentissage » avec lien vers le site). API et site inchangés, rien à redéployer. 32 tests + essai contre une vraie API. Voir README « Étape 22b-2a ». Reste de la tranche 2 (sur « go ») : 2b téléchargement hors connexion, 2c Mejliss TV Kids, 2d notifications + Chromecast / AirPlay (+ séries) ; puis page « Télécharger l'application » avec l'APK, 22c Android TV, 22d Apple TV.

## Étape 22b-3 (22/10) — application : refonte fidèle à la PWA
- Design, polices et textes de la PWA en natif ; en-tête + menu ; accueil complet ; fiche conférence complète avec YouTube / Vimeo lus dans l'application ; catalogue, recherche, séries, collections, thèmes, intervenants ; correction de l'inscription (message du serveur). Rien à redéployer côté serveur. 38 tests + essai contre une vraie API + compilation. Voir README « Étape 22b-3 ». Prochaines étapes (sur « go ») : 23 Prière (pause à l'heure de la prière, calcul interne, site + PWA puis appli + TV), 22b-4 notifications, hors connexion, Kids natif, Chromecast / AirPlay, page « Télécharger l'application », 22c Android TV, 22d Apple TV.

## Étape 23a (22/10) — prière sur le site et la PWA
- Horaires calculés en interne (6 méthodes, 97 villes, géolocalisation arrondie), pastille « prochaine prière » à côté de la loupe, pause souple de la lecture (« J'ai prié » / « Continuer »), Kids inclus, réglages Compte → Prière et `/priere`, fonction activable (Admin → Fonctions « Prière ») et réglages `mod_prayer_*`. Déploiement : API puis web. Voir README « Étape 23a ». Suite (sur « go ») : 23b mosquée via l'API Mawaqit (avec repli sur le calcul interne), 22b-4 notifications (dont heure de prière application fermée), prière dans l'application et la TV, hors connexion, Kids natif, Chromecast / AirPlay, page « Télécharger l'application », 22c Android TV, 22d Apple TV.

## Étape 22b-4 (22/10) — notifications et prière dans l'application (0.4.0)
- Rappel à l'heure de la prière sur le téléphone (calcul embarqué, 7 jours programmés, application fermée) ; pastille, pause souple et réglages de la prière dans l'application ; notifications du serveur par Firebase (nouvelles conférences des intervenants suivis, sélection de la semaine, révision) en plus des e-mails ; toucher une notification ouvre la bonne page. Serveur : table `device_tokens`, réglage `fcm_service_account` (Admin → Paramètres), test depuis l'admin. Déploiement : API seule ; APK à refabriquer. Voir README « Étape 22b-4 ». **23b (mosquée / Mawaqit) abandonnée** : on garde le calcul interne. Suite (sur « go ») : hors connexion, Kids natif, Chromecast / AirPlay, page « Télécharger l'application », 22c Android TV, 22d Apple TV, iPhone (APNs) avec les magasins.

## Étape 22b-5 (22/10) — mises à jour de l'application depuis notre serveur (0.5.0)
- Module API `appupdates` : dernière version, téléchargement de l'APK (liens signés Garage), publication par jeton avec contrôle d'empreinte, version minimale obligatoire, fonction activable. Application : bandeau « Nouvelle version disponible », téléchargement avec progression, vérification SHA-256, installation (Android demande confirmation). Le workflow GitHub publie chaque APK sur le serveur (secret `APP_PUBLISH_TOKEN`). Déploiement : API, jeton (Admin + secret GitHub), relancer le workflow, installer l'APK 0.5.0 à la main une dernière fois. Voir README « Étape 22b-5 ». Partie 2 : le contenu de l'application (écrans, textes, JavaScript) se met aussi à jour sans réinstaller (`expo-updates` hébergé sur notre serveur, version d'exécution liée au code natif, retour arrière possible) ; ce qui touche au code natif passe par la nouvelle version de l'APK. Reste (sur « go ») : hors connexion, Kids natif, Chromecast / AirPlay, page « Télécharger l'application » (peut utiliser `/app/download/latest`), 22c Android TV, 22d Apple TV.

## Étape 22b-6 (22/10) — hors connexion : télécharger une conférence dans l'application (0.6.0)
- Bouton « Télécharger » (audio seul, vidéo 360p ou 720p, taille estimée) ; le serveur prépare un MP4 / M4A sans reconversion (module API `offline`, fonction activable) ; l'application contrôle l'empreinte, relit sans réseau (« Mes téléchargements », lecteur hors connexion), reprise de lecture envoyée à la reconnexion ; abonnés, valable 30 jours (réglable), renouvelé automatiquement, supprimé si l'abonnement est terminé ; pas de limite de nombre. Déploiement : API, puis nouvel APK 0.6.0 (nouvelle bibliothèque native : pas de mise à jour du contenu seule). Voir README « Étape 22b-6 ». Reste (sur « go ») : transcription / chapitres / quiz hors connexion, Kids natif, Chromecast / AirPlay, page « Télécharger l'application », 22c Android TV, 22d Apple TV.

## Étape 22b-6 bis (22/10) — hors connexion complet et protégé (0.7.0)
- Téléchargement réservé aux abonnés (même conférences libres) ; fichiers préparés temporaires sur le serveur (ménage 3 h, effacés 10 min après réception) et conservés sur le téléphone ; pack hors connexion (résumé, chapitres, transcription multilingue, quiz avec explications) avec onglets dans le lecteur et quiz corrigé localement puis envoyé à la reconnexion ; licence signée Ed25519 (compte + fichier + fin de validité), horloge de confiance (plus haute heure vue, coffre sécurisé), capture d'écran bloquée, sauvegarde Android désactivée. Limite assumée : pas de DRM (un téléphone « rooté » peut copier le fichier). Déploiement : API, puis nouvel APK 0.7.0 (module natif ajouté : pas de mise à jour du contenu seule). Voir README « Étape 22b-6 bis ». Reste (sur « go ») : Kids natif, Chromecast / AirPlay, page « Télécharger l'application », 22c Android TV, 22d Apple TV.

## Étape 22b-7 (22/10) — page « Télécharger l'application » avec l'APK
- La page `/application` du site affiche la dernière version de l'APK publiée (version, taille, nouveautés, bouton de téléchargement, étapes d'installation, empreinte), mise à jour automatiquement à chaque publication GitHub. Déploiement : `majlistv-web` seulement. Voir README « Étape 22b-7 ». Reste (sur « go ») : réglage des horaires de prière (écart avec la mosquée, laissé de côté), Kids natif, Chromecast / AirPlay, 22c Android TV, 22d Apple TV.


## Étape 22b-8 (22/10) — encart « Télécharger l'application » dans le menu
- Encart avec logos (application, Android, iPhone) dans le menu latéral et le menu ☰, vers `/application`. Déploiement : `majlistv-web` seulement. Voir README « Étape 22b-8 ».

## Étape 22b-10 (22/10) — diffusion Chromecast / AirPlay
- Case « Diffuser » sur la fiche : Chromecast (Android, bibliothèque Google Cast, récepteur par défaut), AirPlay (iPhone, bouton système) ; le téléphone devient télécommande, la reprise est conservée. API : CORS ouvert sur les playlists HLS et en lecture sur le bucket (le téléviseur lit depuis un autre domaine). Déploiement : `majlistv-api`, puis nouvel APK 0.8.0 (module natif ajouté). Voir README « Étape 22b-10 ». Reste (sur « go ») : Kids natif, réglage des horaires de prière, 22c Android TV, 22d Apple TV.
- 22b-10 (complément, 22/10) : APK 0.8.0 corrigé (SDK Google Cast Android figé à 22.3.1, la 23.0.0 exigeait un Kotlin plus récent) ; Chromecast aussi sur le site et la PWA (Chrome, Edge…), AirPlay sous Safari via les commandes natives. Déploiement : `majlistv-api` puis `majlistv-web`. Voir README « Complément 22b-10 ».
- Réglage des horaires de prière (écart avec la mosquée) : abandonné (décision d'Epok, 22/10). Le calcul astronomique actuel est conservé. Reste (sur « go ») : Kids natif, 22c Android TV, 22d Apple TV.

## Étape 22b-9a (22/10) — Kids natif : entrée, profils, code parental, accueil, lecture
- Espace enfant dans l'application 0.9.0 : profils, code parental, accueil, recherche, lecture avec reprise, temps restant, sortie par code. API et site inchangés. Voir README « Étape 22b-9a ». Reste (sur « go ») : 9b (quiz/étoiles, courts, petites actions, prière), 9c (espace parent), 22c Android TV, 22d Apple TV.

## Étape 22b-9b (22/10) — Kids natif : quiz/étoiles, courts, petites actions, prière
- Application 0.10.0 : quiz + étoiles + badges, courts verticaux, petites actions, pause de prière aux couleurs Kids. API et site inchangés. Voir README « Étape 22b-9b ». Reste (sur « go ») : 9c (espace parent), 22c Android TV, 22d Apple TV.

## Étape 22b-9c (22/10) — Kids natif : espace parents
- Application 0.11.0 : rapport, temps, catalogue, petites actions, profils, code parental depuis l'application. API et site inchangés. Voir README « Étape 22b-9c ». Kids natif complet. Reste (sur « go ») : 22c Android TV, 22d Apple TV.


## Étape 23a (26/10) — Dailymotion comme source vidéo
- Nouvelle source `dailymotion` (API, site, transcripteur, application 0.12.0, migration 063) + réglage « Player ID Dailymotion ». Voir README « Étape 23a ». Reste (sur « go ») : 23b (veille des chaînes YouTube / Dailymotion / Vimeo, alertes dans l'admin), 22c Android TV, 22d Apple TV.

## Étape 23b (26/10) — Veille des chaînes
- Admin → Veille : sources YouTube / Dailymotion / Vimeo relues toutes les 6 h, nouvelles vidéos listées pour l'administrateur seul (Ajouter avec attestation des droits / Ignorer), migration 064, fonction activable. Voir README « Étape 23b ». Reste (sur « go ») : 22c Android TV, 22d Apple TV.

## Correctif 23c (26/10) — Admin / Studio : menu en tiroir latéral sur téléphone
- Barre fine + bouton ☰ + tiroir (fond assombri, Échap). Site seulement. Voir README « Correctif 23c ».
