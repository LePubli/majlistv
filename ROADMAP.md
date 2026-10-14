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

## À venir

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
- 16.2 **Contenu et URL** : URL lisibles (`/conferences/la-patience-dans-l-epreuve`, anciennes adresses redirigées), chapitres et extrait de transcription affichés dans le HTML des conférences gratuites, **page par intervenant** (présentation, toutes ses conférences et séries), versions linguistiques (`hreflang`, demande une URL par langue : à décider avec vous).

**17. Confort de lecture**
- **Mode audio** : écoute écran éteint, comme un podcast.
- Vitesse de lecture (1×, 1,25×, 1,5×, 2×).
- Marque-pages et notes personnelles sur un passage de la transcription, retrouvés dans Ma bibliothèque.

**18. Mesure d'audience et statistiques** — *fait (README, étape 18) ; restent Umami (optionnel) et la conversion aperçu → essai*
- Umami hébergé sur le VPS (sans cookie publicitaire).
- Statistiques internes : vues, temps de visionnage, taux de fin, conférences et intervenants les plus regardés, conversion de l'aperçu vers l'essai.
- Tableau de bord admin et statistiques par organisateur dans le Studio.

**19. Collections et listes** (les séries sont dans l'étape 14)
- Collections éditoriales (par l'équipe) : cycles, séries d'un même intervenant, thèmes du moment.
- Listes personnelles des abonnés, partageables.

**20. Modération**
- Rôle **relecteur** : les conférences des organisateurs externes sont validées avant d'être en ligne.
- Signalement d'un contenu par les spectateurs, avec une file de traitement dans le back-office.
- Journal des actions des admins (qui a modifié quoi).

**21. Notifications et cadeaux**
- E-mails : nouvelles conférences des intervenants suivis, sélection de la semaine, avec désinscription en un clic.
- **Abonnement à offrir** : carte cadeau (1, 3 ou 12 mois) payée par Stripe, code à activer.

### Phase D — Au-delà du site

**22. Applications**
- Android (Kotlin) : catalogue, lecture, mode audio, **téléchargement hors ligne**, reprise synchronisée, notifications.
- Android TV : navigation à la télécommande, lecture, reprise.

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

24.1 → 24.2 → 24.3 → 24.4 → 24.5 → 24.6 → 25 → 26, puis 16.2 (référencement : URL lisibles, page intervenant, chapitres dans le HTML), puis 17 à 23. L'étape 8 (sauvegardes, surveillance) reste en dernier, mais elle devient urgente dès qu'il y a de vrais abonnés.

## Rappels
- TriMaint (port 7001) n'est jamais touché.
- Après chaque redéploiement : `/root/apply-limits.sh`, puis vérifier le port nginx de l'API (7000).
- Les clés ne passent jamais par un chat : DockPanel ou Admin → Paramètres uniquement.
