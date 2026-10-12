# Majlis TV — Étape 1A : socle (API + authentification)

Nom provisoire : « Majlis TV » (modifiable via `APP_NAME`).

## Description
Plateforme de conférences vidéo à la demande. Cette étape fournit une API Node.js (Fastify) + PostgreSQL :
- inscription / connexion (JWT, mots de passe bcrypt)
- rôles `user`, `organizer`, `admin` (le statut abonné viendra avec le paiement)
- migrations SQL automatiques au démarrage, création de l'admin initial
- helmet, CORS, limitation de débit sur les routes sensibles

À venir : front-end (thème sombre bleu ciel, i18n + arabe RTL), upload, vidéo, paiement.

## Arborescence
```
├── Dockerfile              (utilisé par DockPanel Git Deploy)
├── .dockerignore
├── .env.example
├── README.md
├── local/docker-compose.yml   (test local uniquement)
├── web/                       (étape 1B : front-end Next.js, voir web/README.md)
└── api/
    ├── Dockerfile
    ├── package.json
    ├── migrations/001_init.sql
    └── src/ index.js, config.js, db.js, routes/auth.js, routes/admin.js
```
Important : ne pas remettre de `docker-compose.yml` à la racine du dépôt, DockPanel passerait en mode Compose et refuserait le build.

## Prérequis
Docker et Docker Compose (Ubuntu 24 : `curl -fsSL https://get.docker.com | sudo sh`), pour le test local. Pour la production : un VPS avec DockPanel.

## Configuration (.env)
```bash
cp .env.example .env
```
Modifier `POSTGRES_PASSWORD` (alphanumérique), `JWT_SECRET` (`openssl rand -hex 32`, 32 caractères minimum), `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

## Lancement en local
```bash
cd local
docker compose --env-file ../.env up -d --build
docker compose logs -f api
```
API sur `http://127.0.0.1:3000`.

## Exemples d'utilisation
Remplacer l'URL de base par ton domaine en production.
```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/config

curl -X POST http://127.0.0.1:3000/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"motdepasse123","name":"Test","locale":"ar"}'

curl -X POST http://127.0.0.1:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"VOTRE_MOT_DE_PASSE"}'

curl http://127.0.0.1:3000/auth/me -H 'Authorization: Bearer TOKEN'
curl http://127.0.0.1:3000/admin/users -H 'Authorization: Bearer TOKEN'
curl -X PATCH http://127.0.0.1:3000/admin/users/ID/role -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' -d '{"role":"organizer"}'
```
Note : `GET /` renvoie 404, c'est normal (pas de page d'accueil dans l'API).

## Déploiement : DockPanel (Git Deploy) sur VPS Ubuntu 24
1. **Base PostgreSQL** : DockPanel → Docker Apps → PostgreSQL (ex. `postgres-majlisstv`). Noter l'utilisateur, la base et le mot de passe (variables du conteneur).
2. **Adresse du conteneur** :
   ```bash
   docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{$v.IPAddress}}{{"\n"}}{{end}}' dockpanel-app-postgres-majlisstv
   docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' dockpanel-app-postgres-majlisstv | grep -E 'POSTGRES_(USER|DB)='
   ```
3. **Git Deploy → New Deploy** :
   - Name : minuscules uniquement (ex. `majlistv`), sinon Docker refuse le nom d'image
   - Repository URL, Branch `main`, Dockerfile Path `Dockerfile`, Container Port `3000`
   - Domain : ton sous-domaine API (DNS vers le VPS), HTTPS avec certificat automatique
4. **Variables d'environnement** (sans guillemets) :
```
DATABASE_URL=postgres://UTILISATEUR:MOTDEPASSE@172.17.0.3:5432/NOMBASE
JWT_SECRET=<openssl rand -hex 32>
APP_NAME=Majlis TV
CORS_ORIGIN=https://url-du-futur-front
ADMIN_EMAIL=ton@email.fr
ADMIN_PASSWORD=un_mot_de_passe_long
```
   Si le mot de passe contient `@ / # ? : %`, les encoder (`%40 %2F %23 %3F %3A %25`).
5. Create, puis Deploy. Vérifier `https://ton-domaine/health` → `{"status":"ok"}`.

## Debug
- Logs : `docker logs --tail 50 dockpanel-git-majlistv`
- 502 Bad Gateway : le conteneur redémarre en boucle, lire les logs. `Invalid URL` = `DATABASE_URL` mal formée ; `password authentication failed` = mauvais mot de passe ; `ECONNREFUSED` = mauvaise IP ou port de la base.
- L'IP du conteneur PostgreSQL peut changer s'il est recréé : refaire l'étape 2 et mettre à jour `DATABASE_URL`.
- « Deploy blocked: active critical/major incident » : résoudre les incidents actifs dans DockPanel (page Incidents).
- « Docker Compose refused » : supprimer tout `docker-compose.yml` de la racine du dépôt.
- Fichiers uploadés plus tard (vidéos) : prévoir un stockage séparé (MinIO), le conteneur Git Deploy n'a pas de stockage persistant.

## Étape 2A : conférences (liens YouTube/Vimeo), catalogue, espace organisateur
Nouveautés API (migration `002_talks.sql` appliquée automatiquement au démarrage) :
- `GET /categories`, `POST /categories` (admin)
- `GET /talks?q=mot&category=ID&limit=24&offset=0` (public), `GET /talks/:id` (public)
- `POST /talks` (organisateur/admin), `GET /me/talks`, `DELETE /talks/:id` (propriétaire ou admin)

Nouveautés site : catalogue avec recherche et filtre par catégorie, page de lecture (`/talks/ID`), espace `/organizer`.

Déploiement : push sur `main`, puis **Deploy Now** sur `majlistv-api` ET sur `majlistv-web` (aucune variable à changer).

Tester :
1. Donner le rôle organisateur à ton compte de test (connecté en admin) :
```bash
TOKEN=$(curl -s -X POST https://api-majlisstv.le-publicitaire.fr/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ADMIN_EMAIL","password":"ADMIN_PASSWORD"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
curl https://api-majlisstv.le-publicitaire.fr/admin/users -H "Authorization: Bearer $TOKEN"
curl -X PATCH https://api-majlisstv.le-publicitaire.fr/admin/users/ID_UTILISATEUR/role \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"role":"organizer"}'
```
2. Se reconnecter avec ce compte : le lien « Mes conférences » apparaît. Ajouter une conférence avec un lien YouTube, puis vérifier le catalogue.

Limites de cette étape : l'accès « premium » est seulement un marquage (le blocage viendra avec l'abonnement), les catégories sont en français, et la miniature n'existe que pour YouTube.

## Étape 2B-1 : stockage vidéo Garage
Voir `garage/README.md` (déploiement DockPanel et initialisation). Le code d'upload arrive à l'étape 2B-2.

## Étape 2B-2 : upload de vidéos vers Garage
Nouveautés : upload par morceaux de 32 Mo directement du navigateur vers le stockage (jusqu'à `MAX_UPLOAD_GB`, 10 par défaut), lecture par liens temporaires de 4 h, migration `003_uploads.sql`, CORS du bucket configuré automatiquement au démarrage de l'API.

Variables à ajouter au déploiement `majlistv-api` (puis Deploy Now) :
```
S3_ENDPOINT=https://s3-majlisstv.le-publicitaire.fr
S3_REGION=garage
S3_BUCKET=majlis-videos
S3_ACCESS_KEY=<Key ID de la clé majlis-api>
S3_SECRET_KEY=<secret de la clé majlis-api>
```
Les logs de l'API doivent contenir `CORS du bucket configuré.` S'ils affichent `CORS du bucket non configuré`, voir Debug.

Taille des morceaux : 32 Mo, donc sous la limite de 64 Mo que DockPanel applique dans Nginx au domaine du stockage. Aucun réglage Nginx n'est nécessaire. Si tu modifies `PART_SIZE` dans `api/src/routes/uploads.js`, garde-le sous cette limite (vérifiable avec `grep -n client_max_body_size /etc/nginx/sites-enabled/s3-majlisstv.le-publicitaire.fr.conf`).

Debug :
- Erreur 413 pendant l'envoi : un morceau dépasse la limite Nginx du domaine du stockage (voir ci-dessus).
- Lecture impossible ou upload bloqué dans le navigateur : ouvrir la console (F12), onglet Réseau ; une erreur CORS signifie que la configuration du bucket n'a pas été appliquée.
- Si l'API ne peut pas configurer le CORS (message dans les logs), l'appliquer avec un client S3 (par exemple awscli) sur le bucket `majlis-videos`, origine `https://majlisstv.le-publicitaire.fr`, méthodes GET/HEAD/PUT, en-tête exposé `ETag`.
- Pas de conversion à cette étape : les fichiers MP4 se lisent directement, les autres formats peuvent échouer jusqu'à l'étape 3.
- Les uploads abandonnés peuvent laisser des morceaux orphelins dans le bucket ; un nettoyage sera ajouté plus tard.

## Étape 3A : conversion HLS (FFmpeg) et miniatures
Nouveautés : nouveau service `worker/` (voir `worker/README.md`) qui convertit les vidéos envoyées en HLS multi-qualités (360p/720p/1080p selon la source), génère miniature et durée ; lecture adaptative avec hls.js ; playlists protégées par un jeton de lecture (les segments sont servis par liens signés temporaires) ; statut de conversion visible dans « Mes conférences » ; le catalogue n'affiche que les vidéos prêtes ; migration `004_transcoding.sql` ; Next.js passé en 14.2.35 (correctif de sécurité).

Ordre de déploiement :
1. **Deploy Now** sur `majlistv-api` (applique la migration 004 ; vérifier le log `Migration appliquée : 004_transcoding.sql`).
2. **Deploy Now** sur `majlistv-web`.
3. Créer le déploiement `majlistv-worker` (procédure dans `worker/README.md`).

Test : envoyer un MP4 depuis `/organizer` → statut « Conversion XX % » → la conférence apparaît dans l'accueil avec miniature ; la lecture doit proposer plusieurs qualités (HLS) ; vérifier dans l'onglet Réseau (F12) que les segments `.m4s` sont chargés depuis le domaine `s3-majlisstv…`.

Limites : pas encore de sous-titres ni de transcription (étape 3B, Whisper) ; pas de sélecteur de qualité manuel ; DRM prévu plus tard (le format fMP4 est déjà compatible).

## Étape 3B : transcription Whisper, sous-titres, texte cliquable
Nouveautés : service `transcriber/` (voir `transcriber/README.md`, faster-whisper sur CPU) ; migration `005_transcripts.sql` ; panneau de transcription cliquable à côté du lecteur (saut dans la vidéo, phrase en cours surlignée, recherche dans le texte) ; sous-titres WebVTT générés par l'API à partir des segments (activables dans le lecteur) ; la recherche du catalogue couvre aussi le contenu parlé ; statut de transcription dans « Mes conférences ». Les routes `/talks/:id/transcript` et `/talks/:id/subs/<langue>.vtt` utilisent le même jeton de lecture que le flux HLS (le contenu premium reste protégé).

Ordre de déploiement :
1. **Deploy Now** sur `majlistv-api` (log attendu : `Migration appliquée : 005_transcripts.sql`).
2. **Deploy Now** sur `majlistv-web`.
3. Créer le déploiement `majlistv-transcriber` (procédure complète, volume `/models` et choix du modèle dans `transcriber/README.md`).

Test : avec `WHISPER_MODEL=small`, la conférence de test (parlée) passe en « Transcription en cours XX % » puis son texte apparaît sous le lecteur. Cliquer une phrase doit sauter à cet instant ; activer les sous-titres dans le lecteur ; chercher un mot prononcé dans la barre de recherche de l'accueil.

Limites : pas de sous-titres traduits ni de chapitres (étape 3C) ; pas de correction manuelle du texte ; pas de diarisation (qui parle).

## Étape 3C : sous-titres traduits automatiquement (API Claude)
Nouveautés : service `translator/` (voir `translator/README.md`) ; migration `006_translations.sql` (table `transcript_translations`) ; l'organisateur choisit les langues de sous-titres à l'envoi d'une conférence (cases « Sous-titres traduits ») et peut en ajouter, relancer ou retirer ensuite depuis « Mes conférences » ; la traduction conserve les horodatages de la transcription, donc sous-titres du lecteur et transcription cliquable existent dans chaque langue ; la langue de l'interface est activée d'office dans le lecteur si elle est disponible. Nouvelles routes : `POST /talks/:id/translations` (`{ "lang": "fr" }`) et `DELETE /talks/:id/translations/:lang`. Le traducteur propose trois moteurs au choix : **Claude** (défaut), **Azure AI Translator** (quota gratuit F0 de 2 M caractères/mois) et **DeepSeek** (très économique), via `TRANSLATE_PROVIDER`, combinables par langue (`TRANSLATE_CLAUDE_LANGS=ar`, etc.). Correctifs du transcripteur : dépendances épinglées (`av`, `huggingface_hub`) et vidéo sans parole = `unavailable` (plus d'échec).

Ordre de déploiement :
1. **Deploy Now** sur `majlistv-api` (log attendu : `Migration appliquée : 006_translations.sql`).
2. **Deploy Now** sur `majlistv-web`.
3. **Deploy Now** sur `majlistv-transcriber` (dépendances corrigées, sans urgence).
4. Créer le déploiement `majlistv-translator` avec la clé `ANTHROPIC_API_KEY` saisie uniquement dans DockPanel (procédure complète dans `translator/README.md`).

Test : envoyer une courte vidéo parlée en cochant une ou deux langues ; « Mes conférences » affiche d'abord la conversion, la transcription, puis les pastilles de langue passent de « en attente » à « XX % » puis « ✓ ». Sur la page de la conférence, le bouton de sous-titres du lecteur et le menu de langue de la transcription proposent les nouvelles langues. Vérifier l'arabe (écriture de droite à gauche) et la cohérence des noms propres.

Limites : traduction de la transcription seulement (pas du titre ni de la description) ; pas de correction manuelle du texte traduit ; chapitres automatiques et résumé : étape 3D.

## Étape 3D : résumé, points clés et chapitres automatiques
Nouveautés : migration `007_insights.sql` (table `talk_insights`) ; le service `translator/` génère, une fois la transcription prête, un résumé, des points clés et des chapitres horodatés dans la langue d'origine puis les traduit dans chaque langue de sous-titres prête (moteur DeepSeek ou Claude, voir `translator/README.md`) ; page de la conférence : bloc « Résumé » avec chapitres cliquables (saut dans la vidéo, chapitre en cours surligné) et sélecteur de langue ; « Mes conférences » : pastille « Résumé » avec bouton « Régénérer le résumé ». Nouvelles routes : `GET /talks/:id/insights?lang=&t=` (jeton de lecture) et `POST /talks/:id/insights/regenerate`.

Déploiement : mettre à jour GitHub, puis Deploy de l'API (log « Migration appliquée : 007_insights.sql »), du web, et du traducteur (aucune variable à ajouter si `DEEPSEEK_API_KEY` est déjà définie ; sinon `ANTHROPIC_API_KEY`). Relancer `/root/apply-limits.sh` après chaque deploy et vérifier le port du vhost de l'API (7000).

## Étape 4 : abonnements Stripe (conférences premium)
Nouveautés : migration `008_subscriptions.sql` (tables `subscriptions`, `stripe_events`, colonne `users.stripe_customer_id`) ; paiement par Stripe Checkout (essai gratuit de 7 jours une seule fois par compte, formules mensuelle et annuelle) ; gestion par le portail client Stripe (changer de carte, résilier, factures) ; webhook signé qui tient l'état des abonnements à jour ; une conférence premium n'est lisible en entier que pour un abonné (essai, actif ou paiement en retard), le propriétaire et les admins ; sinon un **aperçu gratuit de 2 minutes** (playlist coupée côté serveur) et le résumé sont proposés avec un bouton « S'abonner ». Pages : `/pricing` (formules, prix lus chez Stripe) et bloc « Abonnement » dans `/account`. Routes : `GET /billing/plans`, `GET /billing/status`, `POST /billing/checkout` (`{ "interval": "month" | "year" }`), `POST /billing/portal`, `POST /billing/webhook`.

Limite à connaître : le verrouillage premium protège les vidéos **envoyées** (fichiers). Une conférence YouTube/Vimeo reste lisible par quiconque connaît le lien de la vidéo.

### Mise en route Stripe (en mode test d'abord)
1. Compte Stripe → activer le **mode test** (interrupteur en haut du tableau de bord).
2. **Catalogue de produits** → Ajouter un produit « Abonnement Majlis TV » avec deux prix récurrents en EUR : un **mensuel** et un **annuel**. Copier l'identifiant de chaque prix (`price_…`).
3. **Développeurs → Clés API** : copier la **clé secrète** (`sk_test_…`).
4. **Développeurs → Webhooks → Ajouter un point de terminaison** : URL `https://api-majlisstv.le-publicitaire.fr/billing/webhook` ; événements : `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`. Copier le **secret de signature** (`whsec_…`).
5. **Paramètres → Facturation → Portail client** : activer, autoriser « annuler l'abonnement » et « mettre à jour le moyen de paiement » (et, si voulu, le changement mensuel/annuel).
6. Dans le site : **Admin → Paramètres → Paiement (Stripe)** : colle la clé secrète, le secret du webhook, les deux identifiants de prix et l'adresse publique du site, puis **Enregistrer** et **Tester la connexion** (étape 5 du back-office ci-dessous). Plus de variable DockPanel ni de redéploiement.
7. Test : créer un compte, ouvrir une conférence premium (aperçu de 2 minutes), cliquer « S'abonner », payer avec la carte de test `4242 4242 4242 4242` (date future, CVC quelconque). Après le paiement, `/account` affiche « Essai gratuit jusqu'au … » et la conférence se lit en entier.
8. **Passage en production** : répéter les étapes 2 à 5 en mode production (nouveaux `price_`, clé `sk_live_…`, nouveau webhook et son `whsec_…`), puis les saisir dans Admin → Paramètres. Un changement de compte ou de mode Stripe demande une confirmation : les abonnements de test sont remis à zéro.

Debug : Stripe → Développeurs → Webhooks → l'endpoint → liste des envois (code de réponse attendu : 200). `docker logs` de l'API pour les erreurs ; en base : `SELECT user_id, status, current_period_end FROM subscriptions;`. Tests locaux sans compte Stripe : `api/tests/mock_stripe.py` (faux serveur) avec `STRIPE_API_BASE=http://127.0.0.1:12111`.

## Étape 5 : back-office d'administration (`/admin`)
Tout se règle désormais dans le site, sans toucher aux variables DockPanel ni redéployer : lien **Admin** dans l'en-tête (visible uniquement par les administrateurs).

**Onglets**
- **Tableau de bord** : nombre d'utilisateurs, d'abonnements, état des transcriptions, traductions, résumés.
- **Utilisateurs** : recherche, filtre par rôle, **ajout** (mot de passe provisoire généré et affiché une seule fois), **modification** (nom, email, rôle, langue), **suspension / réactivation**, **accès premium offert jusqu'à une date**, **réinitialisation du mot de passe**, **suppression** (refusée si abonnement Stripe actif ; si l'utilisateur possède des conférences, tu choisis à qui les transférer). Les changements de rôle ou de suspension s'appliquent en quelques secondes, sans reconnexion. Protections : on ne peut pas se retirer soi-même l'accès admin, se suspendre ou se supprimer, et il reste toujours au moins un admin actif.
- **Paramètres** : nom du site, Stripe (clés, prix, essai, aperçu), moteurs de traduction (Claude / Azure / DeepSeek, langues forcées par moteur, clés, modèles), résumés et chapitres, Whisper (modèle, threads, mode de langue). Boutons **Tester la connexion** (une toute petite requête réelle avec les valeurs enregistrées).

**Comment ça marche**
- Les valeurs sont stockées dans la table `app_settings` (migration `009_admin.sql`). Les **clés secrètes sont chiffrées** (AES-256-GCM) avec `SETTINGS_KEY` et ne sont jamais renvoyées au navigateur (seulement `••••` + 4 derniers caractères).
- Ordre de priorité d'une valeur : **back-office → variable d'environnement → valeur par défaut**. Les anciennes variables continuent donc de fonctionner en secours ; vider un champ dans le back-office revient à elles.
- Le traducteur, le transcripteur et les résumés relisent les réglages toutes les 10 secondes : un changement de clé ou de moteur est pris en compte sans redéploiement (un job déjà en cours termine avec l'ancien réglage).

**Variables d'environnement qui restent** : `DATABASE_URL`, `JWT_SECRET`, `SETTINGS_KEY`, clés S3/Garage, `ADMIN_EMAIL` / `ADMIN_PASSWORD` (1er démarrage), `CORS_ORIGIN`, `PORT`, `API_URL` (web).

**`SETTINGS_KEY` (à faire une seule fois)** : générer avec `openssl rand -hex 32`, puis mettre **exactement la même valeur** dans les variables de l'**API**, du **translator** et du **transcriber** (DockPanel). Ne jamais la changer ensuite : les clés enregistrées deviendraient illisibles (il suffirait de les ressaisir). Si elle manque côté API, l'onglet Paramètres l'indique et refuse d'enregistrer des clés.

**Mise en service**
1. Ajouter `SETTINGS_KEY` aux 3 déploiements, pousser le code sur GitHub, redéployer API (log attendu : `Migration appliquée : 009_admin.sql`), web, translator, transcriber.
2. Relancer `/root/apply-limits.sh` et vérifier le port nginx de l'API (7000).
3. Se connecter en admin → **Admin → Paramètres** : saisir les clés, Enregistrer, Tester.
4. Quand tout fonctionne, supprimer de DockPanel les anciennes variables de clés (`ANTHROPIC_API_KEY`, `AZURE_TRANSLATOR_KEY`, `DEEPSEEK_API_KEY`, `STRIPE_*`…), qui ne servent plus que de secours.

Routes API (admin) : `GET/POST /admin/users`, `PATCH/DELETE /admin/users/:id`, `POST /admin/users/:id/password`, `GET/PUT /admin/settings`, `POST /admin/settings/test` (`{ "target": "stripe|azure|deepseek|claude" }`), `GET /admin/status`.

Debug : « SETTINGS_KEY manquante » dans les logs du translator/transcriber = variable absente de ce déploiement ; « Clé X non renseignée » = la saisir dans Admin → Paramètres puis « Relancer » la traduction concernée ; clé illisible après changement de `SETTINGS_KEY` = la ressaisir.

## Étape 6 : favoris et reprise de lecture
Nouveautés : migration `010_library.sql` (tables `favorites` et `watch_progress`, supprimées automatiquement avec l'utilisateur ou la conférence) ; bouton **♡ Ajouter aux favoris** sur chaque conférence (y compris YouTube/Vimeo) ; **reprise de lecture** des vidéos envoyées : la position est enregistrée toutes les 10 s, à la pause, à la fin et quand on quitte la page, et la lecture repart de là au retour (message « Reprise à 12:34 · Depuis le début ») ; page **Ma bibliothèque** (`/library`, lien dans l'en-tête) avec « Continuer à regarder » (barre de progression, bouton × pour retirer) et « Mes favoris » ; rangée « Continuer à regarder » en haut de l'accueil pour les utilisateurs connectés.

Règles : une conférence est « terminée » quand il reste moins de 5 % (ou 30 s) à lire, elle quitte alors « Continuer à regarder » ; revoir le début la fait réapparaître ; en dessous de 5 s de lecture rien n'est enregistré ; l'aperçu gratuit d'une conférence premium n'enregistre pas de position. Limite : les conférences YouTube/Vimeo (lecteur intégré) peuvent être mises en favoris mais n'ont pas de reprise de lecture.

Routes (connexion requise) : `GET /me/favorites`, `PUT|DELETE /me/favorites/:id`, `GET /me/continue`, `PUT /me/progress/:id` (`{ "positionMs": 120000, "durationMs": 600000 }`), `DELETE /me/progress/:id`. `GET /talks/:id` renvoie en plus `favorite` et `resumeMs` pour un utilisateur connecté.

Mise en service : pousser sur GitHub, Deploy de l'**API** (log attendu : `Migration appliquée : 010_library.sql`) puis du **web**, relancer `/root/apply-limits.sh` et vérifier le port nginx de l'API (7000). Aucune variable à ajouter ; translator et transcriber ne changent pas.

## Étape 7 : recherche Meilisearch (fautes tolérées, extraits, passages horodatés)
Nouveau service `search/` (Meilisearch 1.55, voir `search/README.md`), migration `011_search.sql` (table `search_state`), route publique `GET /search`, synchronisation automatique de l'index par l'API (toutes les 15 s : ajouts, modifications, traductions, suppressions), réglages dans **Admin → Paramètres → Recherche**, carte « Recherche » et bouton **Réindexer tout** dans le Tableau de bord.

Sur le site : la barre de recherche de l'accueil affiche des résultats avec **extrait surligné** (transcription, sous-titres traduits ou description) et jusqu'à 3 **passages horodatés** par conférence ; un clic ouvre la vidéo au passage (`/talks/:id?t=SECONDES`). Les fautes de frappe sont tolérées et l'arabe est géré. Extraits et passages d'une conférence premium : réservés aux abonnés, à l'organisateur et aux admins. Sans Meilisearch (pas configuré ou arrêté), la recherche SQL d'avant prend le relais automatiquement.

Mise en service : voir la réponse de livraison ou `search/README.md` (nouveau déploiement `majlistv-search`, port hôte 7060, variable `MEILI_MASTER_KEY`, puis Admin → Paramètres → Recherche).

## Étape 9 : paiement conforme, e-mails, pages légales, mot de passe oublié
Nouveautés : migration `012_compliance.sql` (tables `consents`, `legal_pages`, `email_outbox`, `password_resets`, colonne `users.sessions_valid_after`), dépendance `nodemailer` 10.0.12.

- **Renonciation au droit de rétractation** : sur la page Abonnement, les boutons restent grisés tant que la case n'est pas cochée. Chaque acceptation est enregistrée : texte exact, version, date, adresse IP, navigateur. Elle est visible par l'admin (`GET /admin/users/:id/consents`). Le serveur refuse tout paiement sans cette case.
- **TVA** : réglage « TVA automatique (Stripe Tax) » dans Admin → Paramètres → Paiement. Une fois activé, Stripe calcule la TVA selon l'adresse du client, demande l'adresse de facturation et accepte un numéro de TVA (clients professionnels).
- **Codes promo** : déjà acceptés au paiement. On les crée dans Stripe → Catalogue de produits → Coupons → Codes promotionnels.
- **Formule annuelle** : le badge « N mois offerts » est calculé à partir des prix Stripe (6,99 € × 12 = 83,88 € contre 69,99 € → « 2 mois offerts »).
- **E-mails**, dans la langue du compte (fr, en, ar) : bienvenue, mot de passe oublié, rappel 3 jours avant la fin de l'essai (événement Stripe), paiement reçu (avec lien vers la facture), échec de paiement, résiliation enregistrée, fin d'abonnement.
  - Ils passent par une file d'attente : jamais deux fois le même envoi ; jusqu'à 5 essais espacés si le serveur d'envoi ne répond pas ; abandon après 48 h si l'envoi n'est pas configuré.
  - Réglages dans Admin → Paramètres → E-mails, avec un bouton « Tester la connexion » qui vous envoie un e-mail.
- **Mot de passe oublié** : lien sous le formulaire de connexion. Le lien est valable 1 heure et ne sert qu'une fois ; seule son empreinte est stockée. Changer de mot de passe déconnecte les sessions ouvertes. Même chose quand un admin réinitialise un mot de passe.
- **Pages légales** : mentions légales, CGV/CGU, confidentialité. Ce sont des modèles à compléter (passages entre crochets) dans Admin → Pages légales, puis à faire relire. Elles sont liées en pied de page de tout le site, à l'inscription et sur la page Abonnement.

### Réglages Stripe à faire (mode test d'abord)
1. **Prix** : Catalogue de produits → votre produit → ajouter un prix récurrent de 6,99 € par mois et un de 69,99 € par an, avec le comportement fiscal « TVA incluse ». Copiez les deux `price_…` dans Admin → Paramètres → Paiement.
2. **Webhook** : Développeurs → Webhooks → votre point de terminaison. Ajoutez les événements `customer.subscription.trial_will_end`, `invoice.paid` et `invoice.payment_failed`, en plus des quatre existants.
3. **TVA**, à faire valider par votre comptable : Stripe → Taxes. Renseignez l'adresse de l'entreprise, ajoutez l'immatriculation France (et le guichet unique OSS si besoin), puis activez « TVA automatique » dans le back-office.

### E-mails
Choisissez un service d'envoi qui fournit un accès SMTP (par exemple Brevo, Mailgun ou celui de votre hébergeur de messagerie). Validez votre domaine chez lui (enregistrements DNS SPF et DKIM qu'il vous donne). Saisissez ensuite serveur, port, identifiant, clé et expéditeur dans Admin → Paramètres → E-mails, puis cliquez sur « Tester la connexion ».

Tests locaux : `api/tests/smtp_sink.py` (faux serveur SMTP qui enregistre les e-mails en fichiers) et `api/tests/mock_stripe.py`.

## Étape 9 bis : vidéos YouTube et Vimeo traitées comme les vidéos hébergées, import de playlists et de chaînes
Nouveautés : migration `013_external.sql` (colonnes `talks.rights_confirmed`, `external_thumb`, `transcript_method`, table `import_jobs`). Le transcripteur embarque yt-dlp et Deno, le moteur JavaScript que yt-dlp exige désormais pour YouTube.

**Accord de l'auteur obligatoire.** Une vidéo YouTube ou Vimeo n'est transcrite que si l'organisateur coche « J'ai l'accord de l'auteur… », à l'ajout, à l'import ou plus tard avec « Transcrire et traduire ». Sans cette case, la vidéo est seulement intégrée, comme avant.

**Récupération du texte** (réglable dans Admin → Paramètres → Vidéos YouTube et Vimeo) :
1. Sous-titres publiés par l'auteur dans la langue de la conférence : rapide, rien n'est téléchargé.
2. Sinon, seulement la piste audio, transcrite par Whisper puis supprimée.
3. En dernier recours (audio bloqué), sous-titres automatiques de YouTube, regroupés en phrases.

Ensuite tout est identique à une vidéo envoyée : sous-titres traduits, résumé et chapitres, recherche avec passages horodatés, reprise de lecture, favoris. La durée, la miniature et la description (si elle est vide) sont récupérées sur la plateforme.

**Lecteur piloté.** Le lecteur YouTube ou Vimeo est commandé par le site :
- un clic dans la transcription, un chapitre ou un résultat de recherche fait sauter la vidéo au bon moment ;
- les sous-titres traduits s'affichent par-dessus la vidéo (menu en haut à droite du lecteur) ;
- conférence premium et visiteur non abonné : la lecture s'arrête à la fin de l'aperçu (2 min) et l'invitation à l'essai s'affiche ; la transcription et les sous-titres restent réservés aux abonnés.

**Import de playlists et de chaînes** (Mes conférences → « Importer une playlist ou une chaîne ») :
1. Coller l'adresse d'une playlist, d'une chaîne (`https://www.youtube.com/@nom`, onglet Vidéos) ou d'un album ou d'une chaîne Vimeo, puis cliquer sur « Analyser ». La liste arrive en quelques secondes ; rien n'est téléchargé.
2. Cocher les vidéos. Celles déjà au catalogue sont signalées et ignorées.
3. Choisir les réglages communs : langue, intervenant, catégorie, accès, accord de l'auteur, langues de sous-titres.
4. Cliquer sur « Importer ». Les conférences sont créées et traitées une par une.

Le maximum est de 200 vidéos par import ; c'est réglable dans le back-office. Les imports échoués peuvent être relancés.

**Si YouTube bloque le serveur** (message « YouTube bloque l'accès depuis le serveur ») :
1. Utilisez un compte Google dédié, pas votre compte principal.
2. Dans un navigateur connecté à ce compte, exportez les cookies de youtube.com au format « Netscape » (cookies.txt), par exemple avec une extension d'export de cookies.
3. Collez le contenu dans Admin → Paramètres → Vidéos YouTube et Vimeo → Cookies YouTube. Il est chiffré et jamais réaffiché.
4. Relancez la vidéo avec « Relancer ».

Un proxy de sortie peut aussi être indiqué. yt-dlp se met à jour automatiquement à chaque démarrage du transcripteur pour suivre les changements de YouTube ; `YTDLP_AUTO_UPDATE=0` désactive cette mise à jour.

**Droits** : les conditions de YouTube interdisent de télécharger une vidéo sans autorisation. N'activez la transcription que pour des vidéos dont vous avez l'accord de l'auteur.

Routes : `POST /talks` (champ `rightsConfirmed`), `POST /talks/:id/transcribe` (`{ "rightsConfirmed": true }`), `POST /imports` (`{ "url": … }`), `GET /imports`, `GET /imports/:id`, `POST /imports/:id/confirm` (`{ ids, language, categoryId, access, speaker, translateTo, rightsConfirmed }`), `POST /imports/:id/retry`, `DELETE /imports/:id`.

Tests :
- `python transcriber/tests/test_external.py` (hors ligne) ;
- `api/tests/test_external_api.py` avec `transcriber/tests/run_transcriber_fake.py` (transcripteur réel, faux yt-dlp et faux Whisper).


## Étape 9 ter : vidéos archive.org (Internet Archive) et résumé toujours en français
Nouveautés : migration `014_archive.sql` (source `archive`, colonne `talks.external_file`), module `api/src/archive.js`, fonctions archive.org dans `transcriber/src/external.py`, réglage « Résumé toujours produit dans ces langues ».

### Résumé dans la langue du visiteur
Avant, le résumé n'était traduit que dans les langues de sous-titres cochées : une conférence en arabe sans sous-titres français avait un résumé en arabe uniquement.
- Le résumé et les chapitres sont maintenant **toujours** traduits dans les langues de Admin → Paramètres → Résumés et chapitres → « Résumé toujours produit dans ces langues » (français par défaut). Les conférences déjà transcrites sont rattrapées automatiquement en quelques minutes, sans rien relancer.
- Le site affiche le résumé dans la langue de l'interface. S'il est encore en préparation, le site l'indique et l'affiche dès qu'il est prêt. À défaut, il affiche le français, puis l'anglais, puis la langue d'origine.

### archive.org
**Ajout par lien** (Mes conférences → Lien YouTube / Vimeo / archive.org) :
- `https://archive.org/details/<élément>` : le meilleur fichier vidéo est choisi automatiquement. Ordre de préférence : MP4 H.264, puis autres MP4, puis 512Kb MPEG4, puis WebM / Ogg, en 1080p maximum.
- `https://archive.org/download/<élément>/<fichier>.mp4` : ce fichier précis est utilisé.
- Titre, durée, miniature et description (si elle est vide) sont repris. Le HTML et les liens vers la plateforme sont retirés de la description.
- Refusés avec un message clair : éléments en accès restreint (prêt uniquement), éléments sans vidéo, collections (à importer, voir plus bas).

**Lecture** : archive.org fournit directement le fichier vidéo. Il est lu avec le **lecteur Mejliss TV**, sans lecteur, logo ni publicité d'archive.org. Lecture par plages, sans téléchargement complet. Les sous-titres traduits s'affichent normalement, et la reprise de lecture, les favoris et les chapitres fonctionnent. Pour une conférence premium et un visiteur non abonné, la lecture s'arrête à la fin de l'aperçu. Le fichier reste public sur archive.org : cette limite protège l'expérience, pas le fichier.

**Transcription** (avec l'accord de l'auteur, comme YouTube et Vimeo) : ffmpeg lit seulement la piste audio depuis l'adresse du fichier, puis Whisper transcrit. Ensuite viennent les traductions, le résumé et la recherche, comme pour les autres vidéos.

**Import** (Mes conférences → « Importer une playlist ou une chaîne ») :
- une collection : `https://archive.org/details/<collection>` (par exemple `https://archive.org/details/movies`) ;
- une recherche : `https://archive.org/search?query=conférence islam`.
Seules les vidéos sont listées, les plus consultées d'abord, dans la limite du réglage « Nombre maximum de vidéos par import » (200). Le fichier de chaque vidéo importée est choisi à son premier affichage ou à sa transcription.

Variable facultative pour les tests : `ARCHIVE_BASE_URL` (API et transcripteur ; par défaut `https://archive.org`).

Tests (hors ligne, faux archive.org) :
```bash
python3 api/tests/fake_archive.py 5600 chemin/vers/video.mp4 &
# API et transcripteur factice lancés avec ARCHIVE_BASE_URL=http://127.0.0.1:5600
python3 api/tests/test_archive.py
```
