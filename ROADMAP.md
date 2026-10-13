# Feuille de route Mejliss TV

Chaque étape est livrée complète (code, tests, README, commandes de déploiement à copier-coller), puis validée sur le VPS avant la suivante. L'étape 9 passe avant tout le reste : elle est nécessaire avant d'encaisser de vrais clients. L'étape 8 (socle technique) est reportée à la fin, à la demande d'Epok.

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
- 12.5 Passage en revue mobile et arabe (de droite à gauche) sur tous les écrans visiteur.

### Phase C — Faire venir et garder les abonnés

**13. Référencement Google**
- Une page publique par conférence, rendue côté serveur : titre, résumé, chapitres, extrait de la transcription, données structurées `VideoObject`, balises de partage.
- Une page par intervenant : présentation, toutes ses conférences, bouton **Suivre**.
- Sitemap automatique, URL lisibles (`/conferences/la-patience-dans-l-epreuve`), versions linguistiques (`hreflang`).
- Partage d'un passage précis : lien vers la conférence à la minute choisie.

**14. Confort de lecture**
- **Mode audio** : écoute écran éteint, comme un podcast.
- Vitesse de lecture (1×, 1,25×, 1,5×, 2×).
- Marque-pages et notes personnelles sur un passage de la transcription, retrouvés dans Ma bibliothèque.

**15. Mesure d'audience et statistiques**
- Umami hébergé sur le VPS (sans cookie publicitaire).
- Statistiques internes : vues, temps de visionnage, taux de fin, conférences et intervenants les plus regardés, conversion de l'aperçu vers l'essai.
- Tableau de bord admin et statistiques par organisateur dans le Studio.

**16. Playlists et séries**
- Collections éditoriales (par l'équipe) : cycles, séries d'un même intervenant, thèmes du moment.
- Listes personnelles des abonnés, partageables.

**17. Modération**
- Rôle **relecteur** : les conférences des organisateurs externes sont validées avant d'être en ligne.
- Signalement d'un contenu par les spectateurs, avec une file de traitement dans le back-office.
- Journal des actions des admins (qui a modifié quoi).

**18. Notifications et cadeaux**
- E-mails : nouvelles conférences des intervenants suivis, sélection de la semaine, avec désinscription en un clic.
- **Abonnement à offrir** : carte cadeau (1, 3 ou 12 mois) payée par Stripe, code à activer.

### Phase D — Au-delà du site

**19. Applications**
- Android (Kotlin) : catalogue, lecture, mode audio, **téléchargement hors ligne**, reprise synchronisée, notifications.
- Android TV : navigation à la télécommande, lecture, reprise.

**20. Diffusion à grande échelle** (déclencheur : bande passante du VPS proche de la limite)
- CDN pour les vidéos (par exemple Bunny), avec les jetons d'accès premium conservés.
- Si besoin, conversion et transcription sur une machine séparée.

### Phase E — Reportée à la fin

**8. Socle technique et sécurité** (à faire avant un trafic important)
- Sauvegardes automatiques chaque nuit : base PostgreSQL (`pg_dump`) et vidéos Garage, avec rotation (7 jours, 4 semaines, 6 mois), copie hors du VPS et **test de restauration** documenté.
- Surveillance avec Uptime Kuma : alerte (e-mail ou téléphone) si un service tombe, si un conteneur redémarre en boucle ou si le disque dépasse 80 %.
- Réseau Docker dédié `mejliss` entre l'API, Meilisearch et les services : plus de dépendance à une adresse IP qui change.
- Rotation des secrets : mot de passe de la base (apparu dans une capture) et `GARAGE_RPC_SECRET`.

## Idées mises de côté (à étudier plus tard, pas planifiées)
- **Quiz sur la vidéo** : questions à choix multiples générées à partir de la transcription (relues et corrigées par l'organisateur dans le Studio), proposées après la lecture.
- **Section « Cours » en quiz, par niveau** : parcours de quiz classés par niveau (débutant, intermédiaire, avancé), avec progression du visiteur.
- **Vignettes interactives style plateforme de streaming** (inspiration : captures de Prime Video fournies par Epok) : au survol, la carte grossit ; si la souris reste dessus, un **aperçu vidéo** démarre dans la carte, avec les infos (titre, intervenant, durée, catégorie, langue, accès, note…). **Toutes les informations affichées sur la carte sont paramétrables** (Administration → Paramètres : choisir lesquelles apparaissent, délai avant l'aperçu, aperçu activé ou non). À prévoir : sur mobile (pas de survol), un appui long ou un bouton ; respect de « réduire les animations » ; pas d'aperçu pour les conférences premium non accessibles au visiteur sans l'accord prévu. À rapprocher de l'étape 12 (accueil vitrine).
- **Haut du site avec bannière photo / vidéo** : grande bannière en tête d'accueil (conférence vedette en image ou en vidéo muette, titre, boutons « Regarder » et « Plus d'infos », points de navigation entre plusieurs vedettes), choisie et programmable depuis le Studio. À rapprocher de l'étape 12 (accueil vitrine).

## Rappels
- TriMaint (port 7001) n'est jamais touché.
- Après chaque redéploiement : `/root/apply-limits.sh`, puis vérifier le port nginx de l'API (7000).
- Les clés ne passent jamais par un chat : DockPanel ou Admin → Paramètres uniquement.
