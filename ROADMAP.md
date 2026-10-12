# Feuille de route Majlis TV

Chaque étape est livrée complète (code, tests, README, commandes de déploiement), puis validée sur le VPS avant la suivante.

| # | Étape | État |
|---|---|---|
| 1–2 | Base, comptes, catalogue, liens YouTube/Vimeo, stockage Garage, upload | ✅ en ligne |
| 3A–3D | Conversion HLS, transcription Whisper, sous-titres traduits (Claude / Azure / DeepSeek), résumé et chapitres | ✅ en ligne |
| 4 | Abonnements Stripe (essai 7 jours, mensuel/annuel, aperçu 2 min) | ✅ livré, à tester en mode test Stripe |
| 5 | Back-office admin (utilisateurs, rôles, clés et moteurs IA, Stripe) | ✅ en ligne |
| 6 | Favoris, reprise de lecture, Ma bibliothèque | ✅ livré |
| 7 | Recherche Meilisearch : fautes tolérées, extraits, passages horodatés | 🚚 livré, à déployer |
| 8 | **Refonte du parcours utilisateur et du design** | ⏭ suivante |
| 9 | Playlists et séries (collections éditoriales + listes perso) | à faire |
| 10 | Modération et statistiques (validation avant publication, signalements, vues et temps de visionnage) | à faire |
| 11 | Notifications (e-mails : bienvenue, fin d'essai, nouvelles conférences ; SMTP dans le back-office) | à faire |
| 12 | Applications Android (mobile, Kotlin) et Android TV | à faire |

## Pourquoi la refonte passe en 8
Playlists, modération, statistiques et notifications ajoutent beaucoup d'écrans : les construire sur le design actuel obligerait à les refaire. La refonte vient donc avant.

Contenu prévu de l'étape 8 (à valider ensemble avant de coder) :
1. **Parcours** : visiteur (découvrir → essayer → s'abonner), abonné (reprendre, chercher, sauvegarder), organisateur (publier → suivre le traitement → partager), admin. Points de friction actuels et parcours cibles.
2. **Identité** : logo, couleurs, typographies, ton ; il faudra tes références (sites aimés, couleurs imposées, logo existant).
3. **Système de design** : composants communs (boutons, cartes, rangées, formulaires, modales, toasts), clair/sombre, arabe (RTL), mobile d'abord, accessibilité.
4. **Écrans** : accueil type plateforme vidéo (bannière vedette, rangées par catégorie, « Continuer à regarder »), fiche conférence et lecteur, recherche, inscription et tunnel d'abonnement, compte, espace organisateur, back-office.
5. Maquettes à valider, puis intégration écran par écran.

## Chantiers transverses (à caser entre deux étapes)
- Sauvegardes automatiques : base PostgreSQL (`pg_dump` quotidien) et vidéos Garage, avec test de restauration.
- Sécurité : changer le mot de passe de la base (apparu dans une capture), régénérer `GARAGE_RPC_SECRET`.
- Surveillance : alerte si un service redémarre en boucle ou si le disque dépasse 80 %.
