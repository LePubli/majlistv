# Mejliss TV — application Android et iPhone/iPad (Expo / React Native)

Une seule application pour Android, iPhone et iPad, branchée sur l'API existante (aucune modification du serveur).
Nom de code `majlistv`, identifiant d'application `fr.lepublicitaire.mejlisstv`.

## Ce que fait l'application (étape 22b : tranche 1 « socle + lecture », tranche 2a « apprendre », tranche 3 « refonte fidèle à la PWA »)

- **Connexion / création de compte** (le jeton est gardé dans le coffre sécurisé du téléphone) ; parcours visiteur possible (aperçu de 2 minutes, comme sur le site).
- **Accueil** : bannière, « Continuer à regarder », rangées du catalogue (mêmes réglages que le site : nouveautés, pour commencer, catégories, thèmes préférés).
- **Conférences** : recherche, filtre par catégorie, chargement au fil du défilement.
- **Lecteur** : vidéo HLS multi-qualités, **plein écran**, **incrustation** (image dans l'image), **reculer / avancer de 10 s**, **vitesse**, **audio seul** (flux audio du serveur : économise batterie et données), **le son continue écran éteint** avec la notification de lecture, **reprise synchronisée avec le site** (même position des deux côtés), résumé, points clés, **chapitres cliquables**, **favori**.
- **Compte** : langue (français / anglais / arabe en **RTL**), état de l'abonnement, bouton vers la gestion de l'abonnement **sur le site**.
- Paiement : **jamais dans l'application** (décision d'Epok) ; l'abonnement se prend et se gère sur le site.

**Tranche 2a (ajoutée)** :
- **Bibliothèque** : favoris et listes personnelles (création, retrait, suppression) ; bouton « Ajouter à une liste » sur la fiche d'une conférence.
- **Quiz** : une question à la fois, correction détaillée, badges gagnés ; bouton visible seulement si la conférence a un quiz.
- **Mise en pratique** : propositions d'action ou action personnelle, intention, échéance, accord chiffré (offre Apprentissage).
- **Apprendre** : à réviser aujourd'hui + rappel du jour, quiz à passer / à revoir, score et 8 badges, engagements avec changement de statut. Sans l'offre Apprentissage : encadré + lien vers le site (rien ne se vend dans l'application).

**Tranche 3 (22b-3, version 0.3.0)** : design, polices et textes de la PWA ; en-tête + menu latéral ; accueil complet ; fiche conférence complète (YouTube / Vimeo lus dans l'application grâce à une page intégrée pilotée par messages — `src/lib/embed.ts`, `src/components/ExternalVideo.tsx` —, onglets, apprendre, série, « dans la même veine », aperçu verrouillé) ; catalogue (catégories, formats, niveau) ; recherche ; séries ; collections ; thèmes ; page intervenant ; écran de création de compte (message du serveur si inscriptions fermées). Les textes viennent du site : `node scripts/import-web-texts.mjs` régénère `src/lib/webTexts.ts` (à relancer après tout nouveau `t('clé')`). Voir le README racine « Étape 22b-3 ».

**Tranche 4 (22b-4, version 0.4.0)** : prière (pastille, pause souple, réglages, rappel programmé sur le téléphone — calcul copié du site : `node scripts/import-prayer.mjs`) et notifications du serveur par Firebase (`src/lib/notifications.ts`, `src/lib/prayerStore.tsx`, `app.config.js` : Firebase facultatif via le secret GitHub `GOOGLE_SERVICES_JSON`). Voir le README racine « Étape 22b-4 ».

**Pas encore là (tranche 2, suite)** : téléchargement hors connexion (2b), espace Mejliss TV Kids (2c), diffusion Chromecast / AirPlay (2d), séries. Les vidéos **YouTube / Vimeo** ne se lisent pas dans le lecteur du téléphone (elles se lisent depuis leur plateforme) : l'application renvoie vers la page du site.

**Étape M1 (« go mobile », 03/11)** : thème **« Nuit et or »** suivi depuis le réglage de l'administrateur (`/config` → `skin.def`, gardé en mémoire pour le démarrage suivant ; sélecteur dans Compte seulement si le site laisse chaque visiteur choisir) — `src/lib/theme.ts` (`applySkin`, `veil`), polices Marcellus / Amiri dans `assets/fonts` (licence OFL) ; bloc **« Aujourd'hui »** sur l'accueil et dans Apprendre (`src/components/TodayBlock.tsx`, `src/lib/today.ts`, `GET /me/today`) ; **« À regarder plus tard »** (bouton horloge sur la fiche, onglet « Plus tard » de la bibliothèque, rangée de l'accueil — `GET/PUT/DELETE /me/watchlater`). Essai contre une vraie API : `API_TEST_URL=http://127.0.0.1:3055 npx tsx tests/m1_contract.ts`. Voir le README racine « Étape M1 ».

**Étape M2 (03/11)** : **Coran** dans l'application — écran `src/app/quran/index.tsx` (programme « 30 jours », recherche, 114 sourates) et `src/app/quran/[n].tsx` (verset par verset : arabe en Amiri, traduction, phonétique, notes, tafsir, récitation verset par verset lue chez la source avec enchaînement, mot à mot, couleurs du tajwid, taille du texte ; réglages gardés sur le téléphone ; `?aya=` ouvre sur un verset) ; « Lire le Coran en 30 jours » : `src/components/QuranPlan.tsx` ; logique pure : `src/lib/quran.ts`. Accès : menu, Apprendre, bloc « Aujourd'hui », notification du rappel (`/coran/<n>#v<aya>` → écran du verset). Essai contre une API de test : `API_TEST_URL=http://127.0.0.1:3055 npx tsx tests/m2_contract.ts` (crée puis supprime des données fictives ; refuse de tourner contre le site réel).

**Étape M3 (03/11)** : **athkar** — écran `src/app/athkar.tsx` (offre Apprentissage ; moments, compteur au toucher avec envois groupés, objectif du jour, série, rappel, remise à zéro ; `?cat=morning`) ; **bandeaux de saison et du vendredi** sur l'accueil — `src/components/SeasonBands.tsx` (Al-Kahf ouverte dans le Coran de l'application ; bouton Ramadan vers le site en attendant M4) ; logique pure : `src/lib/athkar.ts`. Essai contre une API de test : `API_TEST_URL=http://127.0.0.1:3055 npx tsx tests/m3_contract.ts`.

**Étape M4 (03/11)** : **Ramadan** — écran `src/app/ramadan.tsx` (30 jours, cases, rattrapage, tarawih avec rakaat et lieu, rappel, `?bilan=1`), bilan `src/components/RamadanBilan.tsx` (note chiffrée) ; **enfants** — `src/components/kids/KidRamadan.tsx` (« Je l'ai fait » sur l'accueil Kids ; section « 🌙 Ramadan » dans la gestion d'un profil pour valider) ; **pastille du parent** — `src/lib/kidsPending.ts` (menu ☰ → Kids), bandeau `src/components/kids/KidsPendingBanner.tsx` (« Valider » ouvre la bonne section), interrupteur e-mail ; logique pure : `src/lib/ramadan.ts`. Essai : `API_TEST_URL=http://127.0.0.1:3055 npx tsx tests/m4_contract.ts` (API datée pendant Ramadan).

**Étape M5 (03/11)** : **Apprendre en 4 onglets** comme le site — `src/app/(tabs)/learn.tsx` (Aujourd'hui · Coran et athkar · Conférences : parcours, quiz et révision, cartes · Mes progrès : engagements, bilan, attestations ; pastille révisions + cartes ; phrase d'explication avec « Compris » ; `?tab=`), **cartes mémoire** `src/components/learn/MemoryCards.tsx`, **bilan personnel et évolution** `src/components/learn/SelfCheck.tsx`, **assistant « Poser une question »** dans la fiche (`src/components/talk/AskPanel.tsx`, onglet de `TalkTabs`) ; logique pure : `src/lib/learnHub.ts`. Essai : `API_TEST_URL=http://127.0.0.1:3055 npx tsx tests/m5_contract.ts`.

**Étape M6 (03/11)** : **premiers pas** — « Par quoi commencer ? » sur l'accueil d'un nouveau compte et **visite guidée** (`src/components/Onboarding.tsx` ; menu ☰ → « Visite guidée » ; `/?tour=1`) ; **parrainage** et **cartes cadeaux** dans Compte (`src/components/account/ReferralGifts.tsx` : lien et partage, code d'un parrain, mes cartes, activation d'une carte ; l'achat reste sur le site) ; états vides utiles (favoris, engagements) ; logique pure : `src/lib/onboarding.ts`. Essai : `API_TEST_URL=http://127.0.0.1:3055 npx tsx tests/m6_contract.ts`.

## Architecture

```
mobile/
├─ app.json                 identité de l'application, permissions, lecture en arrière-plan, incrustation
├─ package.json             dépendances (Expo SDK 58) et commandes
├─ assets/                  icône, icône adaptative Android, écran de démarrage (tirés de l'emblème du site)
├─ src/
│  ├─ app/                  écrans (Expo Router : un fichier = un écran)
│  │  ├─ _layout.tsx        polices, session, navigation
│  │  ├─ (tabs)/            Accueil, Conférences, Apprendre, Bibliothèque, Compte
│  │  ├─ login.tsx          connexion / création de compte
│  │  ├─ talk/[id].tsx      fiche + lecteur
│  │  ├─ list/[id].tsx      contenu d'une liste
│  │  ├─ quiz/[id].tsx      quiz
│  │  └─ practice/[id].tsx  mise en pratique
│  ├─ components/           ui.tsx (boutons, champs, cartes), TalkCard.tsx (vignette), AddToListModal.tsx
│  └─ lib/                  api.ts (client), session.tsx (jeton + langue), i18n.ts (FR/EN/AR),
│                           progress.ts (reprise), playback.ts (choix de la source), learn.ts (quiz, engagements), format.ts, theme.ts, config.ts
└─ tests/                   tests automatiques (Node) + essai contre une vraie API
```

## Prérequis

- Pour **fabriquer l'APK** : rien à installer chez toi, GitHub s'en charge (voir « Fabriquer l'APK »).
- Pour **travailler sur le code** (facultatif) : Node.js 22 et npm 10. Pour lancer l'application sur un téléphone en développement : Android Studio (SDK) ou l'APK de GitHub Actions ; « Expo Go » ne convient pas (modules natifs : voir « Debug »).

## Installation (poste de travail, facultatif)

```bash
cd mobile
npm ci
```

## Configuration (.env)

Adresses du serveur : valeurs par défaut dans `app.json` → `expo.extra` (`apiUrl`, `siteUrl`). Pour les changer le temps d'un essai, créer `mobile/.env.local` :

```
EXPO_PUBLIC_API_URL=https://api-majlisstv.le-publicitaire.fr
EXPO_PUBLIC_SITE_URL=https://majlisstv.le-publicitaire.fr
```

Aucun secret dans l'application (tout ce qui s'y trouve est lisible par un utilisateur).

## Mises à jour de l'application (22b-5)
Au démarrage, l'application interroge `GET /app/latest` sur l'API ; si un APK plus récent est publié, bandeau « Nouvelle version disponible » → téléchargement (expo-file-system) → contrôle SHA-256 → installateur Android (expo-intent-launcher). Code : `src/lib/appUpdate.ts` (logique, testée dans `tests/appUpdate.test.ts`) et `src/components/AppUpdate.tsx`. Le workflow publie chaque APK avec `scripts/publish-release.mjs` (secret `APP_PUBLISH_TOKEN`) ; les nouveautés affichées viennent de `release-notes.json`. Le numéro de build installé est `1000 + numéro d'exécution du workflow` (voir `app.config.js`). Le contenu (JavaScript, textes, images) se met aussi à jour sans réinstaller via `expo-updates` (`runtimeVersion.js`, `scripts/publish-update.mjs`, `src/components/OtaBanner.tsx`) ; en développement (`expo start`) c'est désactivé. Procédure complète : README racine, « Étape 22b-5 ».

## Hors connexion (22b-6)
Bouton « Télécharger » dans la fiche (audio seul / 360p / 720p) : le serveur prépare un MP4 / M4A, l'application le télécharge (`expo-file-system`), contrôle le SHA-256, le garde dans `Paths.document/offline/` avec un index `index.json`, et le relit sans réseau (`src/app/offline/[id].tsx`). Valable 30 jours, renouvelé à la reconnexion (`POST /me/offline/renew`), supprimé à la déconnexion voulue. Code : `src/lib/downloads.ts` (logique, testée dans `tests/downloads.test.ts`), `src/lib/downloadStore.tsx`, `src/components/DownloadSheet.tsx`, `src/app/downloads.tsx`. Essai contre une vraie API : `OFFLINE_FIXTURE=… npx tsx tests/offline_contract.ts` (voir l'en-tête du fichier ; données : `python3 ../api/tests/offline_fixture.py`). Procédure complète : README racine, « Étape 22b-6 ».

## Fabriquer l'APK (sans rien installer)

1. GitHub → dépôt `LePubli/majlistv` → onglet **Actions** → « Application Android (APK) » → **Run workflow** (ou automatiquement à chaque push sur `main` qui touche `mobile/`).
2. Attendre la fin (≈ 10 à 20 minutes la première fois).
3. Ouvrir l'exécution terminée → en bas, **Artifacts** → télécharger `mejliss-tv-android` (un zip contenant `mejliss-tv-<version>-<commit>.apk`).
4. Sur le téléphone Android : copier l'APK, l'ouvrir, autoriser « Installer des applications inconnues » pour l'application qui l'ouvre (Fichiers, Chrome…), installer.

L'APK est signé avec la clé de test d'Android : **installable directement, mais pas publiable sur Google Play** (la clé de publication sera créée à l'étape « magasins »). Il est construit pour les téléphones 64 bits (arm64), c'est-à-dire presque tous les téléphones récents.

## Lancement (développement)

```bash
cd mobile
npm run check        # typage + tests automatiques
npm run bundle       # compile le paquet Android complet (vérifie que tout s'assemble)
npx expo prebuild --platform android      # génère le projet Android natif (dossier android/, ignoré par Git)
npx expo run:android                      # fabrique et lance sur un téléphone branché (Android Studio / SDK nécessaires)
```

## Tests

```bash
cd mobile
npm test             # 32 tests : client d'API, reprise de lecture, choix de la source, langues, quiz et engagements
# Essai contre une vraie API (base de données et stockage de test lancés ; l'API de test doit avoir PRACTICE_KEY) :
# attention : il crée des questions de quiz et des propositions sur une conférence de la base de test (ne jamais le lancer contre la production).
API_TEST_URL=http://127.0.0.1:3055 ADMIN_EMAIL=admin@test.local ADMIN_PASSWORD=… npx tsx tests/api_contract.ts
```

Ce qui est testé : requêtes et erreurs de l'API, cadence d'envoi de la progression, reprise (≥ 5 s, hors fin), URL de lecture (HLS, audio, archive.org, YouTube/Vimeo), chapitre en cours, traductions (mêmes clés et variables en fr/en/ar), fonctions du quiz et des engagements, et — contre une vraie API — inscription, connexion, accueil, catalogue, recherche, fiche, résumé, progression → « Continuer à regarder » → reprise relue, favori, abonnement, listes, quiz (correction, visiteur), offre Apprentissage requise (403), révision, score et badges, engagements, session expirée.

**Non testé** : l'application elle-même sur un téléphone ou un émulateur (écrans, lecteur, plein écran, incrustation, écran éteint, arabe de droite à gauche), la fabrication Gradle de l'APK, et iPhone. Voir le registre `docs/PROBLEMES-A-REGLER.md` (n° 60 à 65).

## Debug

- **L'APK ne s'installe pas** : autoriser l'installation d'applications inconnues ; si « application non installée », désinstaller une ancienne version signée autrement.
- **« Impossible de charger »** : le téléphone n'atteint pas `https://api-majlisstv.le-publicitaire.fr` (réseau, ou API arrêtée) ; ouvrir cette adresse + `/health` dans le navigateur du téléphone : doit afficher `{"status":"ok"}`.
- **La vidéo ne démarre pas** : `GET /talks/<id>` (navigateur, avec le jeton) doit donner `hlsPath` ; la playlist `/hls/<id>/master.m3u8?t=…` doit répondre 200. Une vidéo « pas encore prête » est en cours de conversion (Studio).
- **Le son s'arrête écran éteint** : certaines marques coupent les applications en arrière-plan (économie d'énergie) → désactiver l'optimisation de batterie pour Mejliss TV.
- **L'écran GitHub Actions échoue** : ouvrir l'exécution → étape en rouge → lire la fin du journal ; les étapes sont : dépendances, vérification (typage + tests), génération du projet Android, Gradle.
- **Pas d'Expo Go** : cette application utilise des modules natifs. Le développement se fait avec un build de développement (`npx expo run:android`) ou l'APK de GitHub Actions.
- **Version des dépendances** : l'outil `expo install` n'a pas pu joindre le serveur de versions d'Expo depuis l'environnement de développement de l'étape ; les versions ont été fixées d'après le fichier `node_modules/expo/bundledNativeModules.json` de l'SDK 58. Sur un poste normal : `npx expo install --check` confirme ou corrige.

## Déploiement

Cette étape **ne touche pas au serveur** : aucun redéploiement DockPanel. Seul le workflow GitHub Actions `.github/workflows/mobile-android.yml` fabrique l'APK.

Étapes suivantes prévues : page « Télécharger l'application » du site avec l'APK, comptes développeur Google (publication publique prévue en 2027) puis Apple, fabrication iPhone via EAS Build (sans Mac), Android TV (22c).

## Exemples d'utilisation

- Ouvrir une conférence, regarder 1 minute, quitter : le site, sur le même compte, propose « Reprendre à 1:00 ».
- Appuyer sur **Audio seul**, éteindre l'écran : le son continue, la notification du téléphone affiche titre, intervenant et boutons lecture / pause.
- Appuyer sur **Incrustation** : la vidéo passe dans une petite fenêtre au-dessus des autres applications.
- Compte → **Gérer mon abonnement sur le site** : ouvre `https://majlisstv.le-publicitaire.fr/account` dans le navigateur.
- Compte → Langue → **العربية** : toute l'application passe de droite à gauche.

## Règles d'édition des magasins (à relire avant l'App Store)

Apple impose des règles sur les liens vers un paiement extérieur à l'application (« abonnement géré sur le site »). Le texte actuel dit seulement que l'abonnement se gère sur le site. À valider avant tout envoi sur l'App Store (étape « magasins »), pas pour l'APK installé à la main.

## Hors connexion complet et protégé (22b-6 bis, 0.7.0)
Téléchargement réservé aux abonnés. À chaque téléchargement l'application reçoit aussi un **pack** (`pack-<conférence>.json` : résumé, chapitres, transcription multilingue, quiz avec réponses) lu par `src/components/OfflineTabs.tsx` ; le quiz hors connexion (`src/app/offline/quiz/[id].tsx`) est corrigé localement (`gradeQuiz`) puis mis en file (`quiz-queue.json`) et envoyé à la reconnexion. **Licence signée** (Ed25519, vérifiée avec `tweetnacl` dans `src/lib/license.ts`) et **horloge de confiance** (`src/lib/offlineGuard.ts`, coffre sécurisé) ; capture d'écran bloquée (`expo-screen-capture`) ; `android.allowBackup: false`. Tests : `npm test` (`tests/license.test.ts`, `tests/offlinePack.test.ts`, `tests/downloads.test.ts`) et `tests/offline_contract.ts` contre une vraie API (voir son en-tête ; données : `python3 ../api/tests/offline_fixture.py`). Détails, limites et déploiement : README racine, « Étape 22b-6 bis ».

Essai de mise à jour (22/10) : ce commit sert uniquement à publier un build plus récent que celui installé sur le téléphone.
