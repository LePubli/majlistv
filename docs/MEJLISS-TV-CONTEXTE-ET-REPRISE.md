# Mejliss TV — Contexte du projet et reprise

Ce document a deux parties :
- **Partie 1 — Instructions du projet** : à coller dans les *instructions personnalisées* du projet Claude « Mejliss TV » (elles s'appliquent à chaque conversation du projet).
- **Partie 2 — Résumé de reprise** : à coller comme **premier message** de la nouvelle conversation.

> Avant d'ouvrir la nouvelle conversation : **commiter sur GitHub tous les zips non encore poussés** (A, B, E1, C, D, E2, F, G, dans cet ordre, ou seulement le dernier si chacun contient tout le dossier concerné). Le dépôt GitHub `LePubli/majlisTV` doit être la seule source de vérité : la nouvelle conversation repartira de lui, pas de l'environnement de travail de celle-ci.

---

## PARTIE 1 — Instructions du projet (à coller dans le projet Claude)

```
PROJET : Mejliss TV (nom de code technique : majlis-tv / majlistv)
Propriétaire : Epok (agence Le Publicitaire). Ne code pas à la main : travaille avec l'IA.
Langue : français. Réponses claires, sans jargon inutile.

CE QU'EST LE PROJET
Plateforme de conférences vidéo à la demande (style Netflix, ambiance sombre noir et or,
signature « Des conférences qui éclairent ») devenue plateforme d'apprentissage « 360° » :
regarder → comprendre (quiz) → retenir (révision espacée) → mettre en pratique (engagements,
bilan personnel). Espace enfants séparé « Mejliss TV Kids ». Interface FR / EN / AR (RTL).

INFRASTRUCTURE (NE PAS SE TROMPER)
- Hébergement : VPS Ubuntu 24.04 chez VeryCloud (6 cœurs / 16 Go), partagé avec Miel & Co et TriMaint.
- Plateforme de déploiement : DOCKPANEL (Git Deploy). JAMAIS Coolify pour ce projet.
- Dépôt : GitHub LePubli/majlisTV, branche main.
- Déploiements DockPanel (Git Deploy, même dépôt) : majlistv-api, majlistv-web, majlistv-worker,
  + services transcriber (Whisper), translator, search (Meilisearch), stockage Garage (majlistv-storage).
- Base : PostgreSQL en Docker App DockPanel (postgres-majlisstv).
- Domaines : site https://majlisstv.le-publicitaire.fr ; API https://api-majlisstv.le-publicitaire.fr ;
  stockage S3 https://s3-majlisstv.le-publicitaire.fr (bucket majlis-videos, région garage).
- Ports hôte : 7000 = API Mejliss ; 7010 = web Mejliss ; 7001 = trimaint_frontend (NE PAS TOUCHER).
- Ne jamais mettre de docker-compose.yml à la racine du dépôt (DockPanel passerait en mode Compose).
- Après chaque redéploiement, sur le VPS :
    /root/apply-limits.sh
    grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
    nginx -t && systemctl reload nginx

WORKFLOW DE MISE À JOUR D'EPOK (sans terminal pour git/npm)
1. Télécharger le zip livré.
2. Le décompresser dans C:\Users\agenc\Documents\GitHub\majlistv (remplacer les fichiers).
3. GitHub Desktop : Commit to main, puis Push origin.
4. DockPanel → Git Deploy → Redeploy : d'abord majlistv-api (les migrations SQL s'appliquent au
   démarrage), puis majlistv-web, et majlistv-worker seulement s'il a changé.
5. Commandes VPS ci-dessus (apply-limits + nginx).
Poste local : Windows + WSL Ubuntu 24.04 (hôte EpokLab, utilisateur epok).

STACK TECHNIQUE
- API : Node.js, Fastify 5, zod, PostgreSQL ; migrations SQL numérotées dans api/migrations,
  appliquées automatiquement au démarrage (dernière : 046_channel_images.sql).
- Web : Next.js 15 (sortie standalone), React 18, CSP avec nonce, proxy /api/[...path] vers l'API.
- Worker : FFmpeg (HLS multi-qualités, miniatures, piste audio).
- Transcription Whisper (auto-hébergée), traduction des sous-titres (Azure AI Translator, Claude, DeepSeek),
  résumés/chapitres par IA (résumé toujours en français), recherche Meilisearch.
- Stockage vidéo : Garage (compatible S3), liens présignés.
- Paiement : Stripe (abonnements 6,99 €/mois et 69,99 €/an, essai 7 jours, aperçu 2 min, Stripe Tax,
  codes promo, PayPal via Stripe, cartes cadeaux). Webhooks utiles : invoice.paid, charge.refunded,
  checkout.session.async_payment_succeeded.
- Sources vidéo : upload, YouTube, Vimeo, archive.org (les vidéos externes ne sont pas hébergées).
- Rôles : user, organizer, moderator, admin. Formules : standard et « Apprentissage ».
- Réglages en base (Admin → Paramètres) ; chaque fonction s'active/désactive (Admin → Fonctions,
  registre api/src/featuresList.js, réglage feat_<id>) ; journal d'audit des actions admin/modérateurs.
- i18n : web/lib/i18n.js (objets fr / en / ar) ; arabe en RTL.
- Variables .env (API) : APP_NAME, API_PORT, CORS_ORIGIN, POSTGRES_*, DATABASE_URL, JWT_SECRET,
  JWT_EXPIRES, SETTINGS_KEY, PRACTICE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, MEILI_MASTER_KEY, + S3/Garage ;
  web : API_URL, CSP_STORAGE_ORIGINS (adresse du stockage, nécessaire aux miniatures et images de chaînes).

RÈGLES DE TRAVAIL
- Avancer étape par étape ; chaque étape démarre sur le « go » d'Epok.
- Livrable COMPLET à chaque étape : code entier (pas de pseudo-code), tests, section README
  « Étape X » (description, prérequis, déploiement, debug, exemples), ROADMAP mise à jour, zip.
- Toujours donner les commandes complètes à copier-coller DANS la réponse (pas seulement « voir README »).
- Déploiement décrit avec DockPanel + GitHub Desktop (workflow ci-dessus), jamais Coolify ni /opt/…
- Suivre fidèlement la maquette validée (artifact Design « Mejliss TV » :
  https://claude.ai/artifact/6f1jq8YPiFRh5MY44HeUfA) : textes en blanc pur, accents or, cartes arrondies.
- Tout doit être responsive (téléphone 390 px → grand écran 1440 px) et fonctionner en arabe (RTL).
- Être honnête sur ce qui a été testé ou non. Ne rien inventer sur l'infra : demander si doute.
```

---

## PARTIE 2 — Résumé de reprise (premier message de la nouvelle conversation)

```
Je reprends le projet Mejliss TV dans une nouvelle conversation (la précédente devenait trop longue).
Lis les instructions du projet. Le code à jour est sur GitHub : LePubli/majlisTV (branche main) —
attache le dépôt et pars de là. Déploiement : DockPanel (pas Coolify).

ÉTAT AU 15/10/2026
En production (déployé et validé) : étapes 1 à 21 et 24 à 31 de la feuille de route — catalogue,
upload + HLS, transcription, sous-titres traduits, résumé/chapitres, Stripe + PayPal, back-office,
bibliothèque, recherche Meilisearch, conformité (TVA, rétractation, légal), YouTube/Vimeo/archive.org,
Studio, séries/saisons, SEO, mode audio, notes, statistiques, modération, collections/listes,
notifications, cartes cadeaux, quiz, score/badges/attestations, révision espacée, ouvrages, Kids,
mise en pratique, bilan personnel (Tazkiyat an-nafs), thèmes, audit de sécurité + CSP.

Refonte « Plan des points restants » — livrée en zips, DÉPLOIEMENT À CONFIRMER par moi :
- A  : fonctions activables/désactivables + mode maintenance (Admin → Fonctions).
- B  : menu latéral membre, barre du bas mobile, onglets, fil d'Ariane.
- E1 : vitrine visiteur (exemple réel + quiz jouable), citation du jour.
- C  : chaînes (l'intervenant devient une chaîne avec propriétaire organisateur) — migration 044.
- D  : rémunération des chaînes « comme YouTube » (part des abonnements au prorata du temps de
       visionnage, clôture mensuelle, seuil/report, CSV, paiements manuels) — migration 045,
       fonction désactivée par défaut. Webhooks Stripe invoice.paid + charge.refunded requis.
- E2 : avatar et bannière des chaînes — migration 046.
- F  : mobile (aucune page plus large que l'écran, tableaux en fiches) + accessibilité.
- G  : fidélité à la maquette : texte blanc pur, menu latéral repliable (rail d'icônes, mémorisé)
       pour membre ET Studio/Admin, citation du jour compacte dorée, espace Apprentissage refait
       (Bonjour Prénom, onglets Tableau de bord / Parcours / Révisions / Mon bilan / Attestations,
       carte Reprendre, anneau de parcours, À réviser, raccourcis, bandeau bilan), bannière
       d'en-tête de la vitrine visiteur avec image. Web uniquement.
Ordre de déploiement : API puis web à chaque fois (migrations automatiques au démarrage de l'API).

CE QUI RESTE À FAIRE (par priorité)
1. Accueil membre selon la maquette « Main » : bloc « À la une » + carte « Reprendre »,
   « Chaînes à suivre », collections au style maquette.
2. Comparer et aligner les autres planches de la maquette non encore vérifiées : Conférence,
   Bibliothèque, Compte, Chaîne, Studio (tableau de bord, Ma chaîne, Modération),
   Admin (tableau de bord, Paramètres, Chaînes).
3. Vérifier en vrai sur téléphone et en arabe l'étape G (768 et 1024 px non testés automatiquement).
4. Décidé mais non codé : listes réservées aux abonnés payants ; cartes cadeaux valables pour
   la formule Apprentissage ; (à décider) interrupteur global abonnements/paiement.
5. Plus tard : applications Android (puis iOS/TV), CDN, hreflang, sauvegardes vers PlanetHoster
   + supervision, revue juridique des pages légales, SPF/DKIM, Umami (optionnel).

Commence par me proposer le plan de l'étape suivante (point 1) et attends mon « go ».
```

---

## Annexe — Repères utiles

| Élément | Valeur |
|---|---|
| Dépôt | `LePubli/majlisTV` (main) |
| Dossier local | `C:\Users\agenc\Documents\GitHub\majlistv` |
| Site | https://majlisstv.le-publicitaire.fr |
| API | https://api-majlisstv.le-publicitaire.fr (`/health` → `{"status":"ok"}`) |
| Stockage | https://s3-majlisstv.le-publicitaire.fr — bucket `majlis-videos` |
| Déploiements DockPanel | `majlistv-api`, `majlistv-web`, `majlistv-worker`, `majlistv-storage`, transcriber, translator, search |
| Ports hôte | 7000 API · 7010 web · 7001 TriMaint (ne pas toucher) |
| Dernière migration | `046_channel_images.sql` |
| Logs | `docker logs --tail 50 dockpanel-git-majlistv-api` (même forme pour `-web`, `-worker`) |
| Maquette | https://claude.ai/artifact/6f1jq8YPiFRh5MY44HeUfA |
| Prix | 6,99 €/mois · 69,99 €/an · essai 7 jours |

**Correction apportée dans ce zip :** les sections de déploiement des étapes B, E1, C, D, E2, F et G du README parlaient à tort de Coolify et de `/opt/majlis-tv`. Elles décrivent maintenant le vrai workflow (dossier GitHub local → GitHub Desktop → DockPanel → apply-limits + nginx).
