# Mejliss TV

Nom : « Mejliss TV » (modifiable dans Admin → Paramètres → Général).

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

## Étape 10.1 : nouvelle apparence Mejliss TV
- Nom définitif **Mejliss TV**. La migration `015_brand.sql` remplace l'ancien nom « Majlis TV » enregistré dans le back-office. Un nom personnalisé différent est conservé. Le nom reste modifiable dans Admin → Paramètres → Général.
- Couleurs du logo : fond `#0B0906`, or `#E6A739` / `#F7C863`, bronze `#BD7E2A`, crème `#FCF7F0`. Toutes les couleurs sont des variables CSS en tête de `web/app/globals.css`.
- Polices **auto-hébergées** : Montserrat (titres), DM Sans (texte), Noto Kufi Arabic et Noto Sans Arabic (arabe). Paquets `@fontsource-variable/*` en versions fixes. Aucun appel à Google Fonts, donc rien à déclarer pour le RGPD.
- En-tête collant avec emblème et logotype, navigation qui défile sur mobile, sélecteur de langue. Pied de page avec la marque. Favicon et icône iPhone tirés de l'emblème (`public/favicon.png`, `public/apple-touch-icon.png`).
- Accueil : nouveau bandeau (« Le savoir, à la demande. »), bouton d'essai et mention « N jours offerts ». N vient du réglage `trial_days`, désormais exposé par `GET /config` ; sans essai, la mention disparaît.
- Prix : toujours lus dans Stripe (6,99 €/mois, 69,99 €/an). « 2 mois offerts » est calculé automatiquement.
- Les e-mails avaient déjà la charte (étape 9).

## Étape 10.2 — Studio : « Mes conférences »

Nouvel espace de gestion pour les organisateurs et l'administrateur (web uniquement, **aucun changement API ni base**).

### Ce qui change
- **Menu latéral** commun au Studio et à l'Administration (sur mobile : barre en haut qui défile).
  - Studio : *Mes conférences* (`/studio`), *Nouvelle conférence* (`/studio/new`).
  - Administration (admin seulement) : Tableau de bord, Utilisateurs, Paramètres, Pages légales (`/admin?tab=…`).
- **Mes conférences** : 3 chiffres clés (en ligne / en traitement / à corriger), recherche par titre ou intervenant, filtres, tableau avec miniature, état, 4 pastilles de traitement **V** vidéo · **T** transcription · **S** sous-titres traduits · **R** résumé et chapitres, accès, date. Rafraîchissement automatique toutes les 6 s tant qu'un traitement est en cours.
- **Fiche d'une conférence** (`/studio/<id>`) : état des 4 étapes, relancer la transcription, ajouter / retirer / relancer une langue, régénérer le résumé, supprimer.
- `/organizer` redirige vers `/studio` (anciens liens conservés).

### Déploiement
1. `git add -A && git commit -m "Étape 10.2 : studio" && git push`
2. DockPanel → redéployer **web** uniquement.
3. `/root/apply-limits.sh`

### Vérification
Connecté en admin : `/studio` affiche la liste ; `/organizer` redirige ; `/admin?tab=settings` s'ouvre avec le menu latéral.

## Étape 10.3 — Studio : ajouter une conférence en 2 étapes

Web uniquement (aucun changement API ni base).

1. **Vidéo** : glisser-déposer un fichier (ou « Parcourir mes fichiers »). **L'envoi démarre tout de suite** (par morceaux, avec reprise), ou coller un lien YouTube / Vimeo / archive.org. Le lien est vérifié avant de continuer. L'import de playlist reste en bas de la page.
2. **Informations** : titre (pré-rempli avec le nom du fichier), intervenant, description, langue parlée (français / arabe / anglais en un clic, « Autre… » pour les autres), catégorie et accès (puces cliquables), sous-titres traduits, et **aperçu de la carte** telle qu'elle apparaîtra dans le catalogue (image du fichier ou miniature YouTube). On remplit les infos pendant l'envoi ; « Publier » s'active à la fin de l'envoi.

Après publication, redirection vers la fiche de la conférence (`/studio/<id>`).

### Déploiement
`git add -A && git commit -m "Étape 10.3 : ajout en 2 étapes" && git push`, redéployer **web** seul, puis `/root/apply-limits.sh`.

## Étape 10.4 — Modifier une conférence, brouillons, publication programmée, miniature

Touche **l'API** (migration `016_publication.sql`, appliquée au démarrage), **le worker** et **le web**.

### Fonctionnalités
- **Fiche d'une conférence** (`/studio/<id>`) : on modifie le titre, l'intervenant, la description, la catégorie et l'accès, puis « Enregistrer ».
- **Publication** : *Publiée* (visible de tous), *Brouillon* (visible seulement du propriétaire et des admins) ou *Programmée* (publiée automatiquement à la date choisie, sans tâche planifiée : la condition est évaluée à chaque requête et à chaque synchronisation de la recherche). Un brouillon / une programmée à venir est absente du catalogue, de la recherche, des favoris et de « Continuer à regarder », et sa page répond 404 au public. À la création : bouton « Enregistrer en brouillon ».
- **Miniature** : choix parmi 3 images tirées de la vidéo (vidéos envoyées converties après cette mise à jour), envoi de sa propre image (réduite à 1280×720 dans le navigateur, JPEG/PNG/WebP, 2,5 Mo max), ou retour à la miniature de la plateforme (YouTube, Vimeo, archive.org).
- Les vidéos converties **avant** cette étape n'ont pas les 3 images : elles gardent leur image automatique, et on peut envoyer la sienne.

### API
| Méthode | Route | Rôle |
|---|---|---|
| PATCH | `/talks/:id` | `title, description, speaker, categoryId (null), access, publication, publishAt, posterChoice (-1..2)` |
| POST | `/talks/:id/poster` | `{ image: "data:image/…;base64,…" }` |
| POST | `/talks` | accepte aussi `publication` et `publishAt` |

### Tests
`python3 api/tests/test_publication.py` (API 3055, PG de test 5544, S3 factice) : 43 vérifications.

### Déploiement
```bash
git add -A && git commit -m "Étape 10.4 : édition, brouillons, programmation, miniature" && git push
```
DockPanel : redéployer **api**, **worker** et **web** (l'API en premier, pour la migration), puis `/root/apply-limits.sh` et vérifier le port 7000 dans nginx pour l'API.

## Étape 10.5 — Corriger la transcription, le résumé et les chapitres (+ gestion des catégories)

Touche **l'API** (migration `017_content_edit.sql`) et **le web**. Le worker et les services transcriber / translator ne changent pas.

### Corriger le contenu (`/studio/<id>/content`)
Depuis la fiche d'une conférence : « Corriger la transcription » et « Corriger le résumé et les chapitres ».
- **Transcription** : texte de chaque segment modifiable (horodatages inchangés), dans la langue d'origine **ou** dans une traduction. Recherche dans le texte, « Tout remplacer » (ex. un nom propre mal reconnu), annulation par segment, pagination par 100. Enregistrement en une fois ; on est averti si l'on quitte avec des modifications non enregistrées.
- Après correction de la **langue d'origine**, deux cases (cochées par défaut) : *Refaire les sous-titres traduits* et *Régénérer le résumé et les chapitres*. Elles remettent ces éléments « en attente » : le service translator les refait tout seul à partir du texte corrigé (ce qui remplace leurs éventuelles modifications manuelles).
- Les sous-titres WebVTT, la transcription affichée sous la vidéo et la recherche utilisent aussitôt le texte corrigé (la recherche se réindexe seule en moins de 15 s).
- **Résumé et chapitres** : résumé, points clés, chapitres (heure `12:30` ou `1:02:30` + titre), par langue. Une case permet de retraduire le résumé corrigé dans les autres langues. Un résumé modifié à la main est marqué « modifié à la main ». Si la génération automatique a échoué, on peut écrire le résumé soi-même.

### Catégories (Administration → Catégories)
Ajouter, renommer, supprimer. Le nombre de conférences par catégorie est affiché. Supprimer une catégorie **ne supprime aucune conférence** : elles restent en ligne, sans catégorie. Un renommage met la recherche à jour automatiquement. Réservé aux administrateurs.

### API
| Méthode | Route | Rôle |
|---|---|---|
| GET / PUT | `/talks/:id/studio/transcript` | lire / corriger les segments (`lang`, `changes[{idx,text}]`, `retranslate`, `regenerateInsights`) |
| GET | `/talks/:id/studio/insights` | résumés de toutes les langues |
| PUT | `/talks/:id/studio/insights/:lang` | `summary, keyPoints[], chapters[{ms,title}], translateOthers` |
| GET | `/categories/stats` | catégories avec nombre de conférences (admin) |
| PATCH / DELETE | `/categories/:id` | renommer / supprimer (admin) |

### Tests
`python3 api/tests/test_content_edit.py` (40 vérifications), `python3 api/tests/test_categories.py` (18), `python3 api/tests/test_publication.py` (43). Prérequis : API 3055 et PG de test 5544.

### Déploiement
```bash
git add -A && git commit -m "Étape 10.5 : correction du contenu, catégories" && git push
```
DockPanel : redéployer **api** puis **web** (la migration 017 s'applique au démarrage de l'API), puis `/root/apply-limits.sh` et vérifier le port nginx de l'API.

## Étape 10.6 — Fiche de suivi : chronologie et relances

Touche **l'API** (migration `018_timeline.sql`) et **le web**. Les services worker, transcriber et translator ne changent pas.

### Chronologie
Sur la fiche d'une conférence (`/studio/<id>`), section **Chronologie** : ajout de la conférence, conversion de la vidéo (en attente, démarrée, terminée, échouée), transcription, sous-titres de chaque langue, résumé de chaque langue, corrections manuelles, changements de publication. Les échecs affichent leur message. La fiche se met à jour toute seule pendant le traitement.
- Elle est alimentée par des **déclencheurs PostgreSQL** (table `talk_events`) : aucun service n'a besoin d'être modifié ni redéployé. La progression en pourcentage ne crée pas d'évènement.
- Pour les conférences déjà existantes, l'historique est reconstitué avec les dates connues (ajout, traductions et résumés terminés ou échoués) ; la conversion et la transcription passées n'ont pas de date.

### Relances et langues
- **Relancer la conversion** d'une vidéo envoyée dont la conversion a échoué (`POST /talks/:id/reconvert`).
- **Refaire cette traduction** (↻) sur une langue déjà prête (`POST /talks/:id/translations` avec `force: true` ; une traduction en cours n'est jamais interrompue).
- Relancer une traduction échouée, ajouter ou retirer une langue : comme avant, avec le message d'erreur affiché à côté de la langue concernée.
- Le message d'erreur de la conversion est affiché dans l'étape Vidéo.

### Test
`python3 api/tests/test_timeline.py` (26 vérifications). Prérequis : API 3055 et PG de test 5544. Laisser une minute entre deux jeux de tests (limite de débit de l'API : 100 requêtes par minute).

### Déploiement
```bash
git add -A && git commit -m "Étape 10.6 : fiche de suivi" && git push
```
DockPanel : redéployer **api** puis **web**, puis `/root/apply-limits.sh` et vérifier le port nginx de l'API.


## Étape 11.1 — Back-office : tableau de bord

**Où** : `/admin?tab=dashboard` (administrateurs). Se rafraîchit seul toutes les 30 s.

**Contenu**
- *Abonnés* : payants (actifs + paiement en retard), essais, **revenu mensuel estimé** (abonnements payants ; annuel ÷ 12 ; montants lus chez Stripe, « — » si Stripe n'est pas configuré), résiliations programmées, comptes (+7 j / +30 j), accès offerts, comptes suspendus.
- *Conférences* : en ligne, en traitement, en échec, brouillons/planifiées (chaque carte ouvre le Studio filtré : `/studio?filter=err|run|live|draft`).
- *À traiter* : conversions / transcriptions / traductions / résumés en échec ou **bloqués** (en cours depuis plus de 2–3 h), paiements en retard, e-mails en échec (30 j), erreur de recherche — chaque ligne est un lien. Liste des conférences en échec.
- *État des services* : base, stockage vidéo (test réel du bucket), worker, transcription, traduction, résumés, recherche, Stripe, SMTP. Worker/transcription/traduction sont jugés d'après leurs files d'attente (une tâche bloquée = service à vérifier) : aucune adresse interne à configurer.
- *Dernières inscriptions* (8).

**API** : `GET /admin/dashboard` (admin). Aucun changement de base : pas de migration.

**Tests** : `python3 api/tests/test_dashboard.py` (37 vérifications).

**Déploiement** : api puis web (pas de migration), puis `/root/apply-limits.sh` et vérification des ports nginx.


## Étape 11.2 — Back-office : utilisateurs et fiche latérale

**Où** : `/admin?tab=users`. Cliquer sur une ligne ouvre la **fiche latérale** (l'adresse contient `&user=<id>` : rechargeable et partageable entre admins ; `Échap` ou clic dehors pour fermer).

**Liste** : pastilles de filtre avec compteurs (Tous, Abonnés, Essais, Accès offerts, Sans abonnement, Suspendus), recherche nom/e-mail, filtre par rôle, tri (récents, anciens, nom, dernière lecture), colonne « dernière lecture ».

**Fiche** (chaque bloc s'enregistre seul) :
- *Identité* : nom, e-mail, langue.
- *Rôle* : trois cartes qui expliquent ce que chaque rôle peut faire (Utilisateur / Organisateur / Administrateur). Garde-fous : on ne peut pas changer son propre rôle, ni retirer le dernier administrateur actif.
- *Abonnement et accès* : abonnements Stripe (statut, essai, fin de période, résiliation programmée) ; **accès premium offert** en un clic (+1 mois, +3 mois, +1 an, date précise, retirer).
- *Activité* : favoris, conférences commencées/terminées, dernière lecture, derniers e-mails, conférences du compte (liens vers le Studio).
- *Sécurité* : **lien de réinitialisation envoyé par e-mail** (valable 1 h, l'admin ne voit jamais le mot de passe), ou mot de passe provisoire affiché une seule fois (ferme les sessions ouvertes) ; suspension / réactivation (connexion refusée immédiatement).
- *Zone dangereuse* : suppression. Refusée si abonnement Stripe actif ; si le compte possède des conférences, proposition de les transférer à un organisateur/admin avant suppression.

**API ajoutée** : `GET /admin/users?status=&sort=`, `GET /admin/users-counts`, `GET /admin/users/:id` (fiche), `POST /admin/users/:id/reset-link`. Pas de migration.

**Tests** : `python3 api/tests/test_users_admin.py` (30 vérifications).

**Déploiement** : api puis web (pas de migration), `/root/apply-limits.sh`, vérification des ports nginx.


## Étape 11.3 — Back-office : paramètres par section

**Où** : `/admin?tab=settings` (la section ouverte est dans l'adresse : `&section=email`, `translation`, `payment`…).

- **Navigation par section** (colonne à gauche, pastilles défilantes sur mobile) avec un état : ● prête, ▲ à compléter (ex. « Clé manquante : Azure », « 2/4 champs » pour Stripe, « Aucune clé IA »), ○ non utilisée (« Aucun e-mail envoyé », « Recherche simple »). Un point • signale une section modifiée non enregistrée.
- **Traduction → tableau « Quel moteur pour quelle langue ? »** : une ligne par langue, un menu (Par défaut / Claude / Azure / DeepSeek) et l'état du moteur (clé présente ou manquante). Une langue n'a qu'un seul moteur ; le tableau écrit les listes `translate_*_langs` (aucun changement côté traducteur : même précédence qu'avant).
- **Boutons « Tester la connexion »** conservés sous chaque clé (Stripe, Claude, Azure, DeepSeek, Meilisearch, SMTP) ; ils demandent d'enregistrer d'abord, pour tester ce qui sera réellement utilisé.
- Garde-fou : avertissement du navigateur si on quitte la page avec des modifications non enregistrées, et confirmation avant de changer de section.
- Les réglages sont toujours pris en compte par les services en moins de 10 s, sans redéploiement.

**API** : inchangée (`/admin/settings`, `/admin/settings/test`). **Tests** : `python3 api/tests/test_settings_engines.py`.

**Déploiement** : web seul suffit (aucune migration, API inchangée par rapport à 11.2) puis `/root/apply-limits.sh` et vérification nginx.


## Étape 12.1 — Accueil vitrine : bannière et rangées

**Ce que voit le visiteur** (`/`) : une grande bannière en haut, puis des rangées horizontales façon plateforme de streaming : « Continuer à regarder » (si connecté), « Nouveautés », puis une rangée par catégorie (les plus fournies d'abord, bouton « Tout voir »). Défilement tactile, flèches au survol sur ordinateur, droite-à-gauche géré en arabe. La recherche et le filtre par catégorie restent au-dessus des rangées ; dès qu'on cherche ou filtre, on retrouve la liste de résultats habituelle.

**Bannière — trois modes** (Back-office → Paramètres → *Page d'accueil* → « Bannière du haut de page ») :
- `featured` (défaut) : les conférences **mises en avant** défilent (5 au maximum, la plus récemment mise en avant en premier, change toutes les 8 s, pause au survol/clavier, points pour choisir). Image = miniature de la conférence, titre, intervenant, durée, résumé, boutons « Regarder » / « Plus d'infos ». Sans conférence mise en avant, on retombe sur la bannière texte.
- `custom` : ta propre bannière — image (téléversée dans la même page, recadrée à 1920×820 et réduite automatiquement), titre, texte, bouton (texte + lien `/pricing` ou `https://…`), et vidéo d'ambiance facultative (adresse d'un `.mp4`/`.webm` https, muette, en boucle).
- `text` : titre et texte seuls (comme avant).
Les visiteurs qui ont demandé de réduire les animations n'ont ni défilement automatique ni vidéo.

**Mettre une conférence en avant** : Studio → fiche de la conférence → « Mise en avant » (administrateurs seulement). Elle n'apparaît en bannière que si elle est publiée et prête.

**Autres réglages** : afficher ou non « Nouveautés » et les rangées par catégorie ; nombre de conférences par rangée (4 à 40).

**API** : `GET /home` (public) ; `POST|GET|DELETE /admin/home/hero-image` ; `PATCH /talks/:id` accepte `featured` (admin). **Migration** : `019_home.sql` (colonnes `featured`, `featured_at`, appliquée au démarrage de l'API).

**Tests** : `python3 api/tests/test_home.py` (31 vérifications).

**Déploiement** : api puis web, `/root/apply-limits.sh`, vérification nginx. Après déploiement : mets 3 à 5 conférences en avant depuis le Studio.


## Étape 12.2 — Vignettes interactives (style Prime Video)

**Sur ordinateur (souris)** : quand la souris reste ~0,35 s sur une vignette, elle s'**agrandit** dans une fenêtre flottante (elle n'est jamais coupée par la rangée qui défile) avec : boutons ▶ lire, ♥ favori (renvoie vers la connexion si on n'est pas connecté), ⌄ détails ; titre, intervenant, badge Gratuit/Premium, durée, langue, catégorie et un extrait de la description. Si la souris **reste encore** (1,5 s par défaut), un **court extrait muet** démarre par-dessus la miniature, rejoué en boucle ; un bouton 🔇/🔊 permet d'activer le son. `Échap`, le défilement ou la sortie de la souris referment la fenêtre.
**Sur téléphone / tablette** (écran tactile) et pour les visiteurs qui ont demandé de réduire les animations : la vignette reste simple (pas de fenêtre ni de vidéo).

**D'où vient l'extrait** (`GET /talks/:id/hover`, public) :
- vidéo envoyée : le début du flux HLS avec un *jeton d'aperçu* — le serveur ne délivre jamais plus que la durée de l'aperçu gratuit, **même pour une conférence premium** ;
- YouTube / Vimeo : seulement si la conférence est **gratuite** ; premium : miniature seule ;
- archive.org : miniature seule.

**Tout se règle dans Back-office → Paramètres → Vignettes des conférences** (appliqué à tout le site dès l'enregistrement) : agrandissement au survol, aperçu vidéo, délai avant l'aperçu (500–6000 ms), durée de l'extrait (5–60 s), et affichage on/off de : Gratuit/Premium, durée, intervenant, catégorie, langue, description, bouton favori, barre de progression.

**Correctif** : le proxy `/api` du site renvoyait une erreur 502 pour les réponses « 204 sans contenu » (ajout / retrait d'un favori). Corrigé dans `web/app/api/[...path]/route.js`.

**API** : `/config` expose `cards` ; les listes (`/talks`, `/home`, favoris, reprise) ajoutent `summary` (extrait de 170 caractères). Pas de migration.
**Tests** : `python3 api/tests/test_cards.py` (18 vérifications).
**Déploiement** : api puis web, `/root/apply-limits.sh`, vérification nginx.


## Étape 12.3 — Fiche conférence : aperçu, invitation à l'essai, similaires

**Invitation à s'abonner** (conférence premium, visiteur sans abonnement) :
- un badge « Aperçu gratuit · 2 min » sur la vidéo ;
- sous la vidéo, une carte « Cette conférence est réservée aux abonnés » avec ce qu'apporte l'abonnement (transcription cliquable, sous-titres traduits, reprise de lecture et favoris) ;
- quand l'aperçu se termine (vidéo envoyée, YouTube, Vimeo, archive.org), un voile « L'aperçu est terminé » s'affiche **sur la vidéo** avec les mêmes boutons ;
- boutons : visiteur → « Essayer gratuitement N jours » (inscription puis choix de la formule) et « J'ai déjà un compte » (connexion puis retour sur la conférence) ; connecté sans abonnement → « Essayer gratuitement N jours » ou « Voir les formules » vers la page des formules. Le nombre de jours vient du réglage « Essai gratuit » (Paramètres → Paiement) ; à 0, le bouton devient « S'abonner ».

**Retour après connexion / inscription** : `/login?next=/chemin` et `/register?next=/chemin` ramènent sur la page d'origine (chemins du site uniquement ; un lien externe est ignoré).

**Conférences similaires** : rangée « Dans la même veine » en bas de la fiche (`GET /talks/:id/similar`, public) : même intervenant d'abord, puis même catégorie, puis les plus récentes pour compléter ; 12 au maximum ; jamais la conférence elle-même, ni brouillon, ni conversion en cours.

**API** : `GET /talks/:id/similar`. Pas de migration.
**Tests** : `python3 api/tests/test_similar.py` (9 vérifications).
**Déploiement** : api puis web, `/root/apply-limits.sh`, vérification nginx.


## Étape 12.4 — Inscription courte, formule, bienvenue

**Parcours** : conférence verrouillée → *Créer un compte* (e-mail + mot de passe seulement) → **page de bienvenue** → **choix de la formule** (essai gratuit) → paiement Stripe → retour sur le compte avec le bouton « Reprendre la conférence ». Un bandeau « 1 Créer un compte · 2 Choisir la formule · 3 Profiter » accompagne le visiteur.

- **Inscription courte** : le prénom n'est plus demandé (par défaut : début de l'adresse e-mail, modifiable ensuite). Lien « J'ai déjà un compte » conservé.
- **Page de bienvenue** (`/welcome`) : prénom, **langue des sous-titres** et **thèmes préférés** (jusqu'à 12). Tout est facultatif (« Passer cette étape »). Modifiable à tout moment : *Mon compte → Mes préférences* (`/welcome?edit=1`).
- **Effets des préférences** : la langue choisie devient la langue de sous-titres par défaut sur les fiches (si la conférence l'a, et si ce n'est pas la langue parlée) ; sur l'accueil, les rangées des thèmes préférés passent juste après « Nouveautés » avec la mention « ★ Pour vous ».
- **Page des formules** : bouton « Essayer gratuitement N jours » pour un visiteur (→ inscription, puis retour aux formules), lien « ← Retour » vers la conférence d'origine (`/pricing?from=/talks/<id>`), et le paiement renvoie ensuite à cette conférence (`returnTo` accepté seulement s'il s'agit d'un chemin du site).

**API** : `GET/PUT /me/preferences` (`name`, `subLang`, `categories` ; schéma strict, catégories inconnues ignorées) ; `POST /auth/register` : `name` facultatif ; `GET /home` : `forYou` + ordre pour un compte connecté ; `POST /billing/checkout` : `returnTo`.
**Migration** : `020_onboarding.sql` (appliquée au démarrage de l'API).
**Tests** : `python3 api/tests/test_onboarding.py` (20 vérifications).
**Déploiement** : api puis web, `/root/apply-limits.sh`, vérification nginx.


## Étape 12.5 — Revue mobile et arabe (droite-à-gauche)

**Vérifié** : 13 écrans visiteur (accueil, bibliothèque, fiche conférence verrouillée et gratuite, connexion, inscription, mot de passe oublié, formules, mentions légales, compte, bienvenue, préférences) en **français 390 px**, **arabe 390 px** et **arabe 768 px** : aucun défilement horizontal, aucun élément hors écran, `dir="rtl"` correct.

**Correctif** : sur mobile, le menu du haut défilait horizontalement avec une barre invisible, donc « Connexion », « Créer un compte », « Déconnexion » et le sélecteur de langue étaient hors écran. Le menu passe maintenant sur deux lignes (`web/app/globals.css`, bloc `@media (max-width: 720px)`).

**Pas d'API ni de migration.** Déploiement : web seulement, puis `/root/apply-limits.sh` et vérification nginx.


## Étape 13 — Nouvelle page conférence (structure A)

**Agencement** (`web/app/talks/[id]/page.js`) : grand lecteur à gauche, **colonne « À suivre »** à droite (sous la page sur tablette et mobile), puis sous le lecteur : catégorie, titre, ligne d'infos, boutons **Favoris** et **Partager**, et des **onglets** :
- **À propos** : description (retours à la ligne conservés) et fiche (langue parlée, durée, accès, sous-titres disponibles) ;
- **Chapitres**, **Transcription**, **Résumé** : n'apparaissent que si le contenu existe ; la navigation au clavier (flèches, Début, Fin) respecte le sens droite-à-gauche.
- Arrivée depuis un résultat de recherche (`?t=`) : l'onglet **Transcription** s'ouvre directement sur le passage.

**Partager** : copie (ou ouvre le partage du téléphone) le lien de la conférence **à la minute en cours** si la lecture a dépassé 5 s (`/talks/<id>?t=<secondes>`).

**Colonne « À suivre »** : pour l'instant les conférences proches (même intervenant, même catégorie) ; l'étape 14 y affichera les épisodes de la série quand la conférence en fait partie.

**Pas encore là** : « Mes notes » et « Mode audio » (étape 17).

**Pas d'API ni de migration.** Déploiement : web seulement, puis `/root/apply-limits.sh` et vérification nginx.


## Étape 14.1 — Séries, saisons, épisodes (données et API)

**Modèle** (migration `021_series.sql`, appliquée au démarrage de l'API) :
- une **série** (titre, présentation, intervenant, catégorie, accès par défaut, publiée ou non) ;
- avec ou sans **saisons** (l'ordre donne « Saison 1, 2… » ; le passage sans/avec saisons range les épisodes automatiquement) ;
- des **épisodes** = des conférences existantes (une conférence appartient à une seule série) ; supprimer une série **ne supprime pas** les conférences.

**Règle d'accès** : chaque épisode hérite de l'accès de la série, **sauf s'il a son propre réglage** (il l'emporte). Choisir l'accès d'un épisode dans le Studio fixe son réglage ; le remettre comme la série le fait hériter de nouveau. Changer l'accès de la série ne touche que les épisodes qui héritent. L'accès effectif reste dans `talks.access` : lecture, aperçu gratuit, recherche et verrous fonctionnent sans changement.

**API publique** : `GET /series` (séries publiées avec au moins un épisode en ligne ; accès `free`, `premium` ou `mixed`), `GET /series/:id` (saisons ou liste continue, épisodes numérotés, `resume` = épisode à lancer ou reprendre pour le visiteur connecté), `GET /talks/:id/series` (saison, numéro, précédent / suivant, liste des épisodes pour la colonne latérale ; `{ "series": null }` si la conférence est isolée).
**API Studio** (organisateur propriétaire ou admin) : `GET /studio/series`, `GET /studio/series-candidates`, `POST /series`, `GET|PATCH|DELETE /series/:id`, `GET /series/:id/manage`, saisons (`POST /series/:id/seasons`, `PATCH|DELETE /series/:id/seasons/:sid`, `PUT /series/:id/seasons-order`) et `PUT /series/:id/episodes` (ordre, saison et accès de tous les épisodes en une sauvegarde).
**Tests** : `python3 api/tests/test_series.py` (46 vérifications).
**Déploiement** : api seulement (pas de changement du site pour cette pièce), puis `/root/apply-limits.sh` et vérification nginx.


## Étape 14.2 — Studio : gérer les séries

**Où** : Studio → **Mes séries** (menu de gauche). Création en 3 champs (titre, intervenant, avec ou sans saisons), puis la fiche de la série :
- **Informations** : titre, intervenant, présentation, catégorie, **accès par défaut** (gratuit / premium), **structure** (avec ou sans saisons) ;
- **Image de la série** (JPEG / PNG / WebP, recadrée en 16/9 ; sans image, la miniature du premier épisode sert) ;
- **Publier / repasser en brouillon** (la série n'apparaît au public que publiée et avec au moins un épisode en ligne) ;
- **Saisons** : ajout, titre facultatif, ordre (flèches), suppression d'une saison vide — enregistrés tout de suite ;
- **Épisodes** : glisser-déposer (ou boutons ↑ ↓, utilisables au doigt), changement de saison, retrait, et **accès par épisode** : « Comme la série (…) », Gratuit ou Premium. Une barre « Modifications non enregistrées » apparaît ; **Enregistrer les épisodes** envoie tout d'un coup (Annuler remet l'état enregistré) ;
- **Ajouter des conférences** : recherche dans *mes* conférences qui ne sont dans aucune série, cases à cocher, choix de la saison.

Changer l'accès d'une conférence dans sa propre fiche (Studio) fait de même un réglage « à part » pour l'épisode.

**Correctif de style** : le bandeau « 1 Créer un compte · 2 Choisir la formule · 3 Profiter » (étape 12.4) partageait des noms de classes CSS avec les pastilles V·T·S·R du Studio et pouvait les déformer ; il a été renommé (`.flow`). Même vérification faite pour la page conférence (étape 13).

**API** : `POST|DELETE /series/:id/poster` (nouveau). **Tests** : `python3 api/tests/test_series.py` (52 vérifications).
**Déploiement** : api puis web, `/root/apply-limits.sh`, vérification nginx.


## Étape 14.3 — Page série publique et accueil

**Pour le visiteur**
- **Page d'une série** (`/series/<id>`) : bannière (image de la série, sinon fond uni), titre, intervenant, nombre de saisons / épisodes, accès (gratuit, premium, ou « gratuit et premium »), présentation ; bouton **« Regarder l'épisode 1 »** ou **« Reprendre l'épisode N »** (pour un compte connecté : l'épisode commencé, sinon le premier non terminé) ; **sélecteur de saison** ; liste des épisodes avec miniature, résumé, durée, badge d'accès, **barre d'avancement** et « ✓ Vu » ;
- **Accueil** : rangée **« Séries »** juste après « Nouveautés » (vignettes en pile avec « 2 saisons · 12 épisodes ») ;
- **Page « Séries »** (`/series`) : toutes les séries publiées ; le lien **Séries** du menu n'apparaît que s'il y en a au moins une ;
- Une série brouillon n'est visible que de son propriétaire et des admins (bandeau « Brouillon »).

**Réglage** : Administration → Paramètres → Accueil → **« Afficher la rangée Séries »** (activée par défaut).
**API** : `GET /home` renvoie une rangée `{ key: 'series', series: [...] }` ; `GET /config` renvoie `hasSeries`. Pas de migration.
**Tests** : `python3 api/tests/test_series.py` (54 vérifications).
**Déploiement** : api puis web, `/root/apply-limits.sh`, vérification nginx.

## Étape 14.4 — Page conférence dans une série

Quand une conférence fait partie d'une série, sa page change :
- **Surtitre** : « Titre de la série · Saison 1 · Épisode 3 » (le titre est un lien vers la page série) ; sans série, la catégorie reste affichée ;
- **Boutons « Précédent » et « Épisode suivant »** à côté de Favoris / Partager (flèches inversées en arabe) ;
- **Colonne de droite** : la liste des épisodes de la série (groupés par saison, épisode en cours surligné et amené dans la zone visible, barre d'avancement, « ✓ Vu », badge Premium), puis un bloc réduit **« Dans la même veine »** (4 suggestions). Hors série, la colonne « À suivre » reste inchangée ;
- **Fin de lecture** : un compte à rebours de **8 s** propose l'épisode suivant (« Lancer maintenant » / « Annuler »). La navigation ouvre `/talks/<id>?autoplay=1` : le lecteur (Mejliss TV, YouTube, Vimeo) démarre seul. Pas d'enchaînement pendant un aperçu premium ni après le dernier épisode ;
- si l'épisode suivant est premium et que le compte n'y a pas droit, la page affiche l'invitation habituelle à s'abonner.

**Fichiers** : `web/app/talks/[id]/page.js`, `web/components/VideoPlayer.js` et `ExternalPlayer.js` (prop `autoPlay`), `web/lib/i18n.js` (fr/en/ar), `web/app/globals.css` (section 14.4).
**API / base** : aucun changement (utilise `GET /talks/:id/series`). **Déploiement** : web uniquement, puis `/root/apply-limits.sh` et vérification nginx.

## Étape 14.5 — Séries : recherche, bibliothèque, « Continuer à regarder »

**Pour le visiteur**
- **Recherche** : une rangée **« Séries »** apparaît au-dessus des résultats quand le titre, l'intervenant ou la présentation d'une série contient le mot cherché (6 séries max, première page seulement). Chaque conférence trouvée qui est un épisode affiche en tête « TITRE DE LA SÉRIE · SAISON 1 · ÉPISODE 3 » (lien vers la série) ;
- **Continuer à regarder** (accueil et bibliothèque) : les épisodes en cours montrent « Titre de la série · S1 É3 » à la place de l'intervenant. Quand un épisode est **terminé**, l'**épisode suivant** est proposé avec le badge « Épisode suivant » (au passage à la saison suivante aussi) — sauf si un autre épisode de la série est déjà en cours, ou s'il n'est pas publié. Série terminée : plus rien n'est proposé ;
- **Ma bibliothèque** : nouvelle section **« Mes séries »** (séries commencées, la plus récente d'abord) avec barre d'avancement et « 1 / 4 épisodes vus ».

**API** : `GET /search` renvoie en plus `series` (liste) et `series` sur chaque résultat (`{id, title, seasonNumber, number}` ou `null`) ; `GET /me/continue` ajoute `series` et `nextUp` ; nouvelle route `GET /me/series` (connexion requise). La recherche de séries est en SQL (même avec Meilisearch, qui reste réservé aux conférences). Pas de migration.
**Tests** : `python3 api/tests/test_series_discovery.py` (26 vérifications). `test_home.py` ne suppose plus que toutes les rangées contiennent des conférences.
**Déploiement** : api puis web, `/root/apply-limits.sh`, vérification nginx.

## Étape 15 — Formules visibles sans Stripe, et PayPal

**Page Abonnement (`/pricing`)**
- Les **deux formules et leurs prix s'affichent toujours**, même si Stripe n'est pas configuré. Dans ce cas les boutons indiquent « Bientôt disponible » (aucun paiement possible) ;
- chaque formule liste ses avantages (conférences premium, séries, sous-titres/transcription/résumés, sans engagement) ;
- une ligne « Paiement sécurisé par » montre les moyens acceptés (Carte bancaire, et PayPal si l'option est activée).

**Réglages** — Administration → Paramètres → **Paiement (Stripe)** :
| Réglage | Rôle |
|---|---|
| Prix mensuel affiché / Prix annuel affiché | Montants TTC montrés tant que Stripe n'est pas configuré (défaut 6,99 et 69,99 ; virgule ou point acceptés ; 0 = formule masquée) |
| Devise affichée | eur, usd, gbp, chf, cad |
| Proposer PayPal | Active PayPal à côté de la carte (voir ci-dessous) |

**Règle de vérité des prix** : dès que Stripe est configuré (clé + 2 prix), **les montants lus chez Stripe remplacent ceux du back-office** : ce sont eux qui sont facturés. Mettez donc les mêmes montants dans les deux endroits.
Si Stripe est injoignable, les formules restent visibles mais le paiement est fermé.

**PayPal (via Stripe)** — à faire une fois :
1. Stripe → Paramètres → **Moyens de paiement** → activer **PayPal** (une validation peut être demandée pour les paiements récurrents) ;
2. Paramètres du site → **Proposer PayPal** = oui ;
3. tester en mode test : un abonnement avec essai gratuit, puis le renouvellement.
Quand l'option est active, le site demande « carte + PayPal » à Stripe. **Si Stripe refuse PayPal** (pas encore activé, indisponible pour l'abonnement), le paiement **retombe automatiquement sur le choix normal de Stripe (carte)** : aucun client n'est bloqué. Option désactivée : Stripe affiche les moyens activés dans son tableau de bord.
Le webhook ne change pas : un abonnement PayPal produit les mêmes événements `customer.subscription.*`.

**API** : `GET /billing/plans` renvoie toujours `plans`, plus `enabled` (paiement possible), `source` (`stripe` ou `settings`) et `methods` (`["card"]` ou `["card","paypal"]`). Pas de migration.
**Tests** : `python3 api/tests/test_pricing.py` (17 vérifications ; API lancée avec `STRIPE_API_BASE=http://127.0.0.1:12111` et `python3 api/tests/mock_stripe.py`, qui sait aussi refuser PayPal). `test_compliance.py` repasse (paiement conforme, e-mails).
**Déploiement** : api puis web, `/root/apply-limits.sh`, vérification nginx.

## Étape 16.1 — Référencement Google : les bases

**Ce que voit Google (et les réseaux sociaux)**
- **Conférence** (`/talks/<id>`) : titre « Conférence — Intervenant | Mejliss TV », description (160 caractères), adresse canonique, aperçu de partage (Facebook, WhatsApp, X…) avec la vignette, et données structurées **VideoObject** (nom, description, durée ISO 8601, langue, date de mise en ligne, vignette, lien d'intégration YouTube/Vimeo, appartenance à la série). Une conférence **premium** est déclarée « contenu payant » (`isAccessibleForFree: false`), comme l'exige Google, pour ne pas être prise pour du camouflage ;
- **Série** (`/series/<id>`) : titre, description, aperçu, données structurées **TVSeries** avec la liste des épisodes et des saisons ; la liste des épisodes est aussi dans le HTML (liens explorables) ;
- **Accueil** : titre et description du site, réglable : Administration → Paramètres → Général → **Description du site** ;
- **Le titre et la description sont dans le HTML dès le premier octet** (rendu serveur), puis la page complète prend le relais : pas de page blanche, et jamais d'invitation « premium » affichée par erreur à un abonné pendant le chargement ;
- **Jamais indexés** : brouillons, conférences en conversion, conférences inconnues, et tous les espaces privés (compte, bibliothèque, connexion, inscription, studio, administration) : balise `noindex`.
- **Aucune donnée premium n'est exposée** : ni transcription, ni lien de lecture ; seulement titre, description, intervenant, durée, vignette.

**Fichiers générés automatiquement**
- `https://<votre-site>/sitemap.xml` : accueil, séries, conférences et séries visibles, pages légales (5 000 conférences max) ;
- `https://<votre-site>/robots.txt` : tout est ouvert sauf `/api/`, `/admin`, `/studio`, `/organizer`, `/account`, `/library`, `/welcome`, `/login`, `/register`, `/forgot`, `/reset`, et indique le sitemap.
Ils utilisent l'**adresse publique du site** (Paramètres → Général → Adresse publique du site) : vérifiez qu'elle est exacte (https, sans barre finale).

**Vignettes** : `https://<votre-site>/api/seo/poster/talks/<id>` (et `/series/<id>`) est une adresse stable qui redirige vers l'image (les liens de stockage expirent, pas celle-ci). Le proxy du site transmet désormais les redirections.

**API** (publiques, sans compte) : `GET /seo/site`, `/seo/talks/:id`, `/seo/series/:id`, `/seo/poster/talks|series/:id`, `/seo/sitemap`. Pas de migration.

**À faire une fois en production (≈ 10 min)**
1. Google Search Console → **Ajouter une propriété** → « Préfixe d'URL » `https://majlisstv.le-publicitaire.fr` → vérification (balise HTML ou enregistrement DNS) ;
2. Search Console → **Sitemaps** → ajouter `sitemap.xml` ;
3. Après quelques jours : **Indexation → Vidéos** (pages détectées avec une vidéo) et **Améliorations** (erreurs éventuelles de données structurées) ;
4. Test immédiat : https://search.google.com/test/rich-results avec l'adresse d'une conférence → doit détecter « Vidéo ».
Note : l'indexation prend de quelques jours à quelques semaines ; Google n'indexe une vidéo que si elle est visible sur la page (lecteur intégré). Les conférences au lecteur Mejliss TV n'ont pas de lien de vidéo public (par protection du contenu) : elles sont référencées comme pages, pas comme vidéos.

**Tests** : `python3 api/tests/test_seo.py` (23 vérifications, API) et `python3 api/tests/test_seo_web.py` (30, site : balises, JSON-LD, robots, sitemap, noindex ; site lancé sur 3077).
**Déploiement** : api puis web, `/root/apply-limits.sh`, vérification nginx. Vérifier ensuite : `curl -s https://majlisstv.le-publicitaire.fr/robots.txt` et `curl -s https://majlisstv.le-publicitaire.fr/sitemap.xml | head`.

## Étape 24.1 — Niveaux de difficulté et prérequis

**Niveaux** : *débutant*, *intermédiaire*, *avancé* (ou vide = tous niveaux), choisis par l'organisateur dans le Studio, sur chaque conférence (fiche + création) et chaque série. Un badge de niveau apparaît sur les vignettes, les résultats de recherche et les pages conférence / série.

**Filtres** : sélecteur de niveau sur l'accueil ; API `GET /talks?level=`, `/search?level=`, `/series?level=`.

**Rangée « Pour commencer »** : les conférences de niveau débutant, sur l'accueil. Réglage `home_row_beginner` (Admin → Paramètres, activé par défaut).

**Prérequis de série** : jusqu'à 5 séries conseillées avant celle-ci (Studio → série → Prérequis). Indicatif : jamais bloquant. Le public ne voit que les prérequis publiés. Refusés : une série prérequis d'elle-même, une série inconnue, une boucle (A→B→A).

**Migration** : `022_levels.sql`, appliquée automatiquement au démarrage de l'API.
**Tests** : `python3 api/tests/test_levels.py` (28 vérifications).
**Déploiement** : api puis web, `/root/apply-limits.sh`, vérification nginx.

## Étape 24.2 — Quiz de compréhension : données et Studio

Cette étape prépare le quiz côté organisateur. Le public ne le voit pas encore (étape 24.3).

**Fonctionnement**
- **Studio → conférence → Corriger le contenu → onglet « Quiz »** : activer / désactiver le quiz pour cette conférence (ou suivre le réglage du site), générer des questions, relire, ajouter à la main.
- **Studio → « Quiz à relire »** : toutes les questions en attente de validation, toutes conférences confondues.
- **Génération** : le service `translator` (même moteur et mêmes clés que les résumés : Admin → Paramètres → Résumés et chapitres) lit la transcription et propose des questions à 4 réponses (ordre mélangé).
- **Anti-invention** : chaque question doit citer **mot pour mot** le passage de la transcription qui donne la réponse. Si la citation est introuvable, la question est écartée. La minute est recalée sur le passage réellement trouvé, le chapitre en est déduit. Aucune citation de hadith ou de savant n'est écrite par l'IA.
- **Relecture obligatoire** : les questions arrivent en *brouillon*. Une question n'est *validée* que si elle a une explication et une minute. Lien « Écouter à mm:ss » pour vérifier dans la vidéo. Statuts : brouillon / validée / refusée.
- Une nouvelle génération remplace les anciens brouillons ; les questions validées et saisies à la main sont conservées.

**Réglages** (Admin → Paramètres → Quiz de compréhension) : activé par défaut, seuil de réussite (70 %), minimum (3) et maximum (10) de questions validées, nombre proposé à la génération (8).

**Migration** : `023_quiz.sql` (tables `quiz_questions`, `quiz_jobs`, colonne `talks.quiz_enabled`), appliquée au démarrage de l'API.

**Déploiement** : api, **translator** (il porte la génération), puis web. Ensuite `/root/apply-limits.sh` et la vérification nginx.

**Tests**
- `python3 translator/tests/test_quiz_clean.py` : vérification des citations, mélange, doublons (sans base ni réseau).
- `python3 api/tests/test_quiz.py` : API complète (réglages, droits, validation, plafond, file de relecture, génération). Prérequis : API 3055, PG 5544, `MOCK_PORT=8099 python3 translator/tests/mock_claude.py &`, puis le translator lancé avec `ANTHROPIC_API_KEY=test-key ANTHROPIC_API_URL=http://127.0.0.1:8099/v1/messages POLL_SECONDS=1 python3 translator/src/main.py`.

## Étape 24.3 — Passer le quiz

**Parcours**
- À la fin de la vidéo, si la conférence a un quiz (activé + au moins 3 questions validées) et que le visiteur ne l'a pas encore réussi, une invitation s'affiche sur le lecteur : **Passer le quiz** / **Plus tard**. Dans une série, le compte à rebours de l'épisode suivant ne démarre qu'après ce choix.
- Une carte « Quiz de compréhension » reste sous le lecteur (avec le dernier résultat : « Réussi · 80 % » ou « À revoir · 60 % »).
- Le quiz se passe **une question à la fois**, **gratuit et sans compte**. La correction se fait côté serveur : les bonnes réponses ne sont jamais envoyées avant la validation.
- Résultat : pourcentage (seuil de réussite 70 %, réglable), puis revue de chaque question avec la bonne réponse, l'explication, le lien **« Revoir à mm:ss »** (le lecteur se place sur le passage) et **« Signaler cette question »**.
- Rien n'est bloquant : le quiz non réussi peut être refait ou laissé de côté.

**Visiteur sans compte** : résultat gardé **7 jours** dans le navigateur (aucune donnée en base). **Membre connecté** : chaque tentative est enregistrée (`quiz_attempts`), le meilleur score est conservé.

**Rappels sans blocage**
- Quiz laissé de côté (« Plus tard » ou épisode suivant lancé sans réussir) : bannière discrète sur les pages suivantes (« Quiz à valider : … »), valable 7 jours, fermable.
- Membres : rangée **« Quiz à rattraper »** sur l'accueil (avant « Continuer à regarder ») et dans la bibliothèque. Badge « Quiz à passer » (vidéo terminée sans tentative) ou « À revoir · 60 % » (tenté sans réussite). Un clic ouvre la conférence avec le quiz (`?quiz=1`).

**Signalements** : « Signaler cette question » (membre ou visiteur, motif facultatif). Côté Studio, la question signalée réapparaît dans **« Quiz à relire »** avec le nombre de signalements et les motifs ; bouton **« Ignorer le signalement »**, ou correction de la question (ce qui clôt les signalements).

**API** : `GET /talks/:id/quiz`, `POST /talks/:id/quiz/submit`, `POST /talks/:id/quiz/questions/:qid/report`, `GET /me/quiz/todo`, `POST /studio/quiz/questions/:qid/reports/dismiss` ; la fiche `GET /talks/:id` porte `quiz: { available, count }`.

**Migration** : `024_quiz_attempts.sql` (tables `quiz_attempts` et `quiz_reports`), appliquée au démarrage de l'API.
**Tests** : `python3 api/tests/test_quiz_play.py` (44 vérifications, API et PG de test).
**Déploiement** : api puis web (le translator n'a pas changé), `/root/apply-limits.sh`, vérification nginx.

## Étape 24.4 — Mejliss Apprentissage : score, courbe, badges, attestation

**Le palier** : *Mejliss Apprentissage* (9,99 €/mois · 99,99 €/an) s'ajoute à *Mejliss* (6,99 € / 69,99 € ou les prix que tu as réglés). Le quiz de fin de vidéo reste **gratuit pour tous, même sans compte**. L'Apprentissage ajoute : score, courbe, badges, attestation (et, aux étapes suivantes, révision espacée, rappels, profils Kids complets). Les comptes **admin** ont l'accès Apprentissage.

**À faire côté Stripe (toi, sans code)**
1. Stripe → Produits → créer « Mejliss Apprentissage » avec **2 prix récurrents** : 9,99 € / mois et 99,99 € / an (TTC). Copier leurs identifiants `price_…`.
2. Admin → Paramètres → Paiement : renseigner **« Apprentissage : identifiant du prix mensuel »** et **« … annuel »**. Tant qu'ils sont vides, la formule s'affiche mais le bouton reste « Bientôt disponible ».
3. Stripe → Paramètres → Portail client : autoriser le **changement de formule** entre les deux produits (Mejliss ⇄ Mejliss Apprentissage). Les événements du webhook sont inchangés ; le palier est déduit du prix souscrit.

**Score** : par quiz = meilleur pourcentage × fraîcheur. La fraîcheur baisse doucement sans révision (jusqu'à −40 % en 120 jours, jamais sous 60 % du score). Score global = moyenne des quiz tentés. Tout est calculé à la demande depuis `quiz_attempts` (rien de stocké, donc rien à migrer si la formule change).

**Courbe** : un point par semaine (52 semaines max). **Badges** (8) : Premier quiz, Studieux (5 réussis), Assidu (10), Sans faute, Persévérant (réussi après un échec), Régulier (3 jours de suite), Explorateur (3 thèmes), Série terminée.

**Attestation de suivi** : disponible quand **tous les quiz d'une série** sont réussis. Ce n'est **ni un diplôme ni une ijâza** (mention imprimée). C'est une **page publique vérifiable** `/attestation/<code>` (code de 12 caractères, non indexée, ne montre ni e-mail ni identifiant) ; « Imprimer / enregistrer en PDF » du navigateur produit le PDF (feuille d'impression dédiée). Le membre peut la supprimer.

**Pages** : `/learning` (Mon apprentissage ; teaser pour les autres membres), `/pricing` (deux formules), `/account` (formule), panneau de résultat du quiz (score + nouveaux badges, ou invitation à passer à l'Apprentissage).

**API** : `GET /me/learning` (403 `learning_required` sinon), `POST /me/learning/attestations {seriesId}`, `DELETE /me/learning/attestations/:code`, `GET /attestations/:code` (public), `GET /billing/plans` (+ `learning`), `/billing/status` (+ `tier`), `POST /billing/checkout {tier}`.

**Migration** : `025_learning.sql` (`subscriptions.tier`, table `attestations`), appliquée au démarrage de l'API.
**Tests** : `test_learning_unit.mjs` (depuis `api/`, avec `DATABASE_URL`), `test_learning.py`, `test_pricing_learning.py`, plus non-régression `test_pricing.py`, `test_quiz.py`, `test_quiz_play.py`, `test_home.py`, `test_levels.py`.
**Déploiement** : api puis web (translator inchangé), `/root/apply-limits.sh`, vérification nginx.
**Debug** : `/me/learning` en 403 alors que tu es abonné → vérifier que le prix souscrit est bien l'un des deux prix Apprentissage (Admin → Paramètres → Paiement) ; le palier est relu à chaque événement Stripe.

### Correctif 24.2 — langue des questions du quiz
Les questions sont désormais **écrites en français par défaut, quelle que soit la langue de la vidéo** (une conférence en arabe a un quiz en français, avec ou sans sous-titres traduits). Réglage : Admin → Paramètres → Quiz → **« Langue des questions générées »** (fr / en / ar). La citation qui prouve la réponse est toujours retrouvée mot pour mot dans la transcription d'origine ; elle est **affichée dans la langue des questions si la transcription traduite existe**, sinon dans la langue d'origine. Pour les questions déjà générées en arabe : Studio → onglet Quiz → « Générer des questions » (remplace les brouillons ; les questions déjà validées sont conservées). Déploiement : **api + translator**. Test : `python3 api/tests/test_quiz_lang.py`.

## Étape 24.5 — Révision espacée, rappels, e-mail quotidien (palier Apprentissage)

**Révision espacée** : après un quiz, la conférence entre dans le calendrier **J+1, J+3, J+7, J+21** (comptés depuis la première tentative ou le dernier échec). Réviser = **refaire le quiz** de la conférence.
- Quiz refait **à l'échéance (ou en retard) et réussi** → on avance d'un cran ; après J+21 réussi, la conférence est « acquise » (plus de révision).
- Quiz **raté** → retour à J+1 (ancre = aujourd'hui).
- Quiz refait **avant** l'échéance → le calendrier ne bouge pas. Une échéance n'est jamais placée dans le passé.
- Chaque tentative remet la fraîcheur du score à 100 % (voir 24.4).
- Un membre qui passe à l'Apprentissage voit ses anciens quiz entrer dans le calendrier (échéance : aujourd'hui).
- Limite quotidienne réglable (Admin → Paramètres → Quiz → « Révisions proposées par jour », 5 par défaut) : le reste est reporté, les plus en retard d'abord. Les conférences dépubliées ou sans question validée sont ignorées.

**Où le membre le voit** : rangée « À réviser aujourd'hui » sur l'accueil (badge « À réviser »), section dédiée en haut de **Mon apprentissage** (`/learning`) avec le rappel du jour et la case « e-mail du matin », et, à la fin d'un quiz, « Prochaine révision : mercredi 14 octobre ».

**Bibliothèque de rappels** : depuis l'étape 24.6 elle est **indépendante des quiz** (voir « Étape 24.6 » plus bas). Les trois modes manuels (extrait de transcription, citations d'un quiz validé, saisie avec source) sont dans **Studio → conférence → Contenu → onglet Rappels**, et toute la bibliothèque dans **Studio → Rappels**.

**E-mail quotidien** : à partir de l'heure réglée (Admin → Paramètres → Quiz, 8 h heure de Paris par défaut), chaque membre Apprentissage ayant au moins une révision reçoit **un seul e-mail par jour** (conférences à réviser + rappel du jour). Désactivable par le membre (case sur `/learning`) ou globalement (réglage « E-mail quotidien »). Il faut que l'envoi d'e-mails soit configuré (Admin → Paramètres → E-mails) ; sinon rien n'est mis en file. Le modèle `revision_daily` existe en fr/en/ar.

**API** : `GET /me/revision`, `PUT /me/learning/prefs {dailyEmail}`, `POST /talks/:id/quiz/submit` (renvoie `learning.review`), Studio : `GET|POST /talks/:id/studio/reminders`, `POST …/reminders/from-transcript {fromMs,toMs}`, `POST …/reminders/from-quiz`, `PATCH|DELETE /studio/reminders/:rid`.
**Migration** : `026_revision.sql` (`revision_items`, `reminders`, `learning_prefs`), appliquée au démarrage de l'API.
**Tests** : `python3 api/tests/test_revision.py` (calendrier, rappels, préférences) ; depuis `api/` : `set -a; . /tmp/claude-0/api.env; set +a; node tests/test_revision_mail.mjs` (e-mail quotidien, base de test, SMTP factice).
**Déploiement** : api puis web (translator inchangé), `/root/apply-limits.sh`, vérification nginx.
**Debug** : pas d'e-mail du matin → SMTP configuré ? réglage activé ? heure atteinte (heure de Paris) ? membre avec une révision à échéance et case non décochée ? Voir `email_outbox` (statut, dernière erreur).

## Étape 25 — Ouvrages (livres et documents liés aux conférences)

**Ce que c'est** : une fiche (titre, auteur, présentation, couverture), des **éditions par langue** (un **PDF** et/ou des **liens boutique**), un rattachement à des **conférences** et des **séries**.

**Studio → Ouvrages** (organisateurs ; l'admin voit tout)
1. *Nouvel ouvrage* (titre, auteur) puis, dans la fiche : présentation, couverture, publication.
2. **PDF par langue** : choisir la langue et le fichier, cocher **« Je confirme avoir le droit de diffuser ce PDF »** (obligatoire), envoyer. Le PDF part **directement du navigateur vers le stockage** (pas de limite Nginx), puis l'API vérifie que c'est un vrai PDF non protégé par mot de passe, compte les pages et enregistre. Taille maximale réglable (60 Mo). « Retirer la diffusion » coupe immédiatement le PDF sans le supprimer (droits remis en cause) ; « Rétablir » le remet.
3. **Liens boutique** : jusqu'à 10 par langue (librairie, revendeur, **lien d'affiliation** — à créer par toi chez chaque programme). Adresses http(s) seulement ; affichés avec `rel="sponsored nofollow noopener"` et la mention « certains liens sont des liens d'affiliation ».
4. **Rattachement** : cocher les séries et conférences concernées (un organisateur ne peut lier que les siennes). Un bloc **« L'ouvrage étudié »** apparaît alors sur leur page ; une conférence d'une série liée l'affiche aussi.
5. Publier : il faut au moins un PDF (droits confirmés) ou un lien boutique. Un ouvrage qui n'a plus aucune édition repasse en brouillon.

**Côté public** : menu **Ouvrages** (affiché dès qu'un ouvrage est publié), page `/books` et fiche `/books/<id>` (balises de partage, adresse canonique, données structurées `Book`, dans `sitemap.xml`).

**Téléchargement du PDF — réservé à Mejliss Apprentissage** (admins inclus) :
- le membre demande un **lien personnel à durée limitée** (10 min, réglable), signé ; il expire et ne peut pas être modifié ;
- à chaque téléchargement, le PDF est **fabriqué à la demande avec un filigrane** : e-mail du membre et date en pied de page de chaque page, en diagonale discrète, et dans les métadonnées. Rien n'est stocké, le fichier d'origine n'est jamais exposé ;
- **10 téléchargements par membre et par jour** (réglable) ; chaque téléchargement est journalisé (`book_downloads`) ;
- sans abonnement Apprentissage : message d'invitation (connexion / offre), aucun lien délivré.

**Réglages** (Admin → Paramètres → Ouvrages) : taille maximale d'un PDF, durée du lien, téléchargements par jour.
**API** : public `GET /books`, `GET /books/:id`, `GET /talks/:id/books`, `GET /series/:id/books`, `POST /books/:id/download-link`, `GET /books/download?t=…` ; Studio `GET|POST /studio/books`, `GET|PATCH|DELETE /studio/books/:id`, `POST …/cover`, `POST …/pdf/:lang/upload-url`, `POST …/pdf/:lang/confirm`, `PATCH|DELETE …/pdf/:lang`, `POST|DELETE …/links`, `GET /studio/books-targets` ; SEO `GET /seo/books/:id`, `/seo/poster/books/:id`.
**Migration** : `027_books.sql` (`books`, `book_files`, `book_links`, `book_talks`, `book_series`, `book_downloads`). Nouvelle dépendance API : `pdf-lib` (installée par le build Docker).
**Proxy web** : `/api/*` relaie maintenant le corps en octets et conserve `Content-Disposition` (sinon le PDF arrivait corrompu).
**Test** : `python3 api/tests/test_books.py` (≈ 70 vérifications, nécessite le stockage S3 de test).
**Déploiement** : api puis web (translator inchangé), `/root/apply-limits.sh`, vérification nginx. Le bucket doit autoriser `PUT` depuis le site : l'API applique le CORS au démarrage (comme pour l'envoi des vidéos).
**À faire par toi** : programmes d'affiliation (liens à coller dans « Liens boutique »), et ne téléverser que des PDF dont tu as les droits.


## Étape 24.6 — Rappels indépendants des quiz et citations automatiques (versets, hadiths)

**Ce qui change**
- Les rappels forment une **bibliothèque à part** : menu **Studio → Rappels** (liste, filtres origine/statut, recherche, saisie libre). Ils n'ont plus besoin d'une conférence ni d'un quiz. Sur une conférence, ils ont leur propre onglet **Rappels** (à côté de Quiz). « Reprendre les citations du quiz » reste possible, comme simple source parmi d'autres.
- Le **rappel du jour personnel** (Mon apprentissage et e-mail du matin) est tiré de toute la bibliothèque validée, même pour un membre qui n'a jamais passé de quiz.
- **Citation du jour** (verset ou hadith, texte arabe + français + référence) sur l'**accueil, pour tout le monde**, y compris les visiteurs : la même pour tous, une par jour, en parcourant les citations publiées.

**Comment l'IA ne peut pas halluciner (liste fermée)**
1. Le **corpus** (Coran en arabe + traduction française ; hadiths en arabe + français) est **importé depuis des fichiers publics** (`fawazahmed0/quran-api` et `fawazahmed0/hadith-api` sur GitHub) dans la table `corpus_items`. Chaque texte garde sa référence exacte (« Coran 2:153 (Al-Baqara), trad. Hamidullah », « Sahih al-Boukhari, n° 1 »). Ne sont gardés que les textes disponibles dans les deux langues, de 50 à 700 caractères.
2. L'IA propose d'abord des **mots-clés de thèmes** (patience, gratitude…) d'après les titres de tes conférences : **aucune citation** à ce stade.
3. Le système cherche des **candidats** dans le corpus pour ces thèmes (recherche plein texte française), complète au hasard, exclut ceux déjà publiés, et les **numérote**.
4. L'IA ne renvoie que des **numéros**. Un numéro absent de la liste, en double ou illisible est **écarté** (compté dans « références invalides écartées »).
5. Le rappel créé **copie le texte du corpus**, jamais un texte de l'IA, avec sa référence. Le texte d'une citation du corpus est **verrouillé** (non modifiable). Seul l'administrateur peut les valider, dépublier ou supprimer.

**Réglages** (Admin → Paramètres → « Citations (versets et hadiths) »)
| Réglage | Défaut | Rôle |
|---|---|---|
| Générer automatiquement | oui | toutes les heures, si le stock publié est sous le minimum, l'IA en choisit de nouvelles |
| Validation humaine avant diffusion | non | oui : les citations arrivent en brouillon (Studio → Rappels → « Valider les brouillons ») |
| Stock minimum | 30 | seuil de réapprovisionnement |
| Citations par génération | 15 | plafond d'une demande |
| Traduction française du Coran | Hamidullah | autres choix : Islamic Foundation, Rashid Maash, Shahnaz Saidi Benbetka |
| Recueils de hadiths | bukhari, muslim, nawawi, qudsi | aussi : abudawud, ibnmajah, malik, nasai (seuls ceux qui ont un texte français sont importés) |

**Première mise en route (administrateur)**
1. Déployer (voir ci-dessous).
2. **Studio → Rappels → panneau « Citations automatiques » → Importer le corpus** (quelques dizaines de secondes ; le serveur doit pouvoir joindre `raw.githubusercontent.com`).
3. **Générer des citations maintenant** (ou attendre : la génération automatique démarre d'elle-même dès que le corpus est prêt). Le moteur IA est celui des résumés (clé Claude ou DeepSeek déjà réglée).
4. Vérifier l'accueil : encadré « Citation du jour ».
Changer de traduction ou de recueils : modifier le réglage puis **Réimporter le corpus** (les rappels déjà publiés gardent leur texte et restent rattachés).

**Ce que je te recommande de vérifier** : le corpus vient de dépôts communautaires. Les traductions françaises sont celles de la source (la source n'est pas ré-écrite). Les degrés d'authenticité (sahih, hasan…) ne sont pas fournis par ces fichiers pour Boukhari et Muslim, dont la quasi-totalité des hadiths est considérée authentique ; si tu actives d'autres recueils (Abu Dawud, Ibn Majah…), active aussi la **validation humaine**.

**API** : `GET /citation/today` (public) ; `GET /studio/reminders`, `POST /studio/reminders` (organisateur) ; `GET /admin/citations`, `POST /admin/citations/import`, `/generate`, `/approve-all` (admin).
**Migration** : `028_citations.sql` (`corpus_items`, `corpus_import`, `citation_jobs`, rappels sans conférence, colonnes `text_ar` et `corpus_id`). Le service **translator** gère la sélection (fichier `translator/src/citations.py`).
**Tests** : `python3 api/tests/test_citations.py` (import réel + sélection par la fausse IA, texte identique à la source, droits) ; depuis `api/` : `set -a; . /tmp/claude-0/api.env; set +a; node tests/test_citations_auto.mjs` (réapprovisionnement) ; `python3 api/tests/test_revision.py` mis à jour (rappel du jour sans quiz).

**Déploiement** (api, **translator** et web changent) :
```bash
cd /chemin/du/projet && git add -A && git commit -m "24.6 rappels independants et citations" && git push
# DockPanel : redéployer api, translator, web (dans cet ordre)
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```


## Étape 26.1 — Mejliss TV Kids : profils enfants, code parental, espace enfant

Première partie de l'étape 26. Les quiz, étoiles et badges pour enfants (26.2) et la limite quotidienne avec le rapport parent (26.3) viennent ensuite.

**Ce que c'est** : sous le compte du parent, des **profils enfants** (prénom, avatar, tranche d'âge). L'enfant entre dans un espace à lui, avec de grandes vignettes et des mots simples, et il n'en sort qu'avec le **code parental**.

**Côté parent** (menu **Kids**, page `/kids`)
1. **Code parental** : 4 à 6 chiffres, enregistré haché. Il faut le définir avant d'entrer dans l'espace enfant, car lui seul permet d'en sortir. Le changer exige l'ancien. **5 erreurs de suite** bloquent la saisie pendant 10 minutes (même le bon code est refusé pendant ce temps).
2. **Profils** : prénom ou surnom, avatar, tranche d'âge **3-6**, **7-10** ou **11-14**. Rien d'autre n'est demandé sur l'enfant : ni date de naissance, ni e-mail, ni photo.
3. **Nombre de profils** : 1 avec *Mejliss*, 5 avec *Mejliss Apprentissage* (réglable dans Admin → Paramètres → Mejliss Kids). Les administrateurs ont l'accès comme pour le reste.
4. « Qui regarde ? » : un clic sur un profil ouvre l'espace enfant.

**Côté enfant** (espace verrouillé)
- Il voit **les conférences marquées Kids de sa tranche d'âge et des tranches plus jeunes**, sa tranche en premier. Rien d'autre du catalogue n'apparaît.
- **Reprise de lecture propre à chaque enfant** : elle ne touche pas celle du parent, et deux enfants du même compte ne partagent pas leur avancement.
- En-tête réduit (prénom, avatar, « Quitter l'espace enfant »), pas de pied de page, pas de liens vers le reste du site. Toute tentative d'aller ailleurs ramène à l'espace Kids.
- Si l'abonnement du parent s'arrête, il ne reste que les conférences gratuites.

**Comment l'espace est verrouillé (le détail qui compte)**
- Entrer dans un profil délivre un **jeton « enfant »** (12 h) qui porte l'identifiant du profil.
- Ce jeton est **refusé par l'API partout** sauf sur les quelques routes de l'espace enfant : ni compte, ni favoris, ni bibliothèque, ni Studio, ni administration — même si le parent est administrateur.
- Sur une fiche de conférence, le jeton enfant ne donne accès qu'aux conférences Kids de sa tranche ; les autres répondent « introuvable ».
- La sortie passe par `POST /kids/exit` avec le code parental, qui rend un jeton parent normal.

**Studio** : chaque conférence a un réglage **« Mejliss Kids : tranche d'âge »** (Pas pour les enfants / 3-6 / 7-10 / 11-14), à côté du niveau. Une conférence non marquée n'apparaît jamais dans l'espace enfant.

**Réglages** (Admin → Paramètres → Mejliss Kids) : espace Kids activé, profils autorisés avec *Mejliss*, profils autorisés avec *Mejliss Apprentissage*.

**API** : parent `GET /me/kids`, `PUT /me/kids/pin`, `POST|PATCH|DELETE /me/kids/profiles[/:id]`, `POST /me/kids/profiles/:id/enter` ; enfant `GET /kids/me`, `GET /kids/talks`, `PUT /kids/progress/:id`, `POST /kids/exit`.
**Migration** : `029_kids.sql` (`kid_profiles`, `kid_progress`, `talks.kids_band`, code parental sur `users`).
**Tests** : `python3 api/tests/test_kids.py` (≈ 70 vérifications : droits, limites, code parental, verrouillage du jeton enfant, tranches d'âge, progression).

**Déploiement** (api et web ; le translator ne change pas) :
```bash
cd /chemin/du/projet && git add -A && git commit -m "26.1 Mejliss Kids profils enfants" && git push
# DockPanel : redéployer api puis web
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

**À faire par toi** : marquer dans le Studio les conférences adaptées aux enfants (sans cela, l'espace Kids reste vide), et prévoir une ligne sur les profils enfants dans ta politique de confidentialité (seul un prénom est stocké).


## Étape 26.2 — Kids : quiz, étoiles, badges et révision

**Principe.** Après la vidéo (ou via « Teste-toi ! »), l'enfant répond à **5 questions** tirées des questions **approuvées** de la conférence. Le quiz est gratuit pour tous les profils.

| | Mejliss | Mejliss Apprentissage |
|---|---|---|
| Quiz de fin de vidéo | oui | oui |
| Étoiles (1 à 3 par conférence, total = meilleur résultat de chacune) | oui | oui |
| 7 badges (premier quiz, 3 étoiles, 5 quiz, explorateur, 3 vidéos, mieux qu'avant, 10 étoiles) | non | oui |
| Révision J+1 / J+3 / J+7 (« À rejouer aujourd'hui ») | non | oui |

- **Étoiles** : 1 pour avoir terminé, +1 à partir de 60 %, +1 à partir de 90 %. Jamais de mot « raté » : « Bien essayé ! » et « La bonne réponse était… ».
- **Pas de classement** entre enfants, ni entre profils.
- **Révision** : un bon essai (≥ 60 %) à la date prévue fait avancer ; un essai moyen revient à J+1 ; 3 réussites = « retenu ».
- **Sécurité** : toutes les routes sont `kidOk` et limitées au profil du jeton enfant ; les bonnes réponses ne sont envoyées qu'après la soumission.

### API
- `GET /kids/talks/:id/quiz` · `POST /kids/talks/:id/quiz/submit` (`{answers:[0..n]}`, 5 réponses)
- `GET /kids/summary` → `{learning, stars, quizzes, watched, badges, allBadges, due}`
- `/kids/talks` renvoie en plus `hasQuiz` et `stars`.
- Migration `030_kids_learning.sql` (appliquée au démarrage) : `kid_quiz_attempts`, `kid_badges`, `kid_revision`.

### Déploiement
```bash
cd /chemin/du/projet && git add -A && git commit -m "Etape 26.2 Kids quiz" && git push
# DockPanel : redéployer api puis web (translator inchangé)
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Tests
`python3 api/tests/test_kids_learning.py` (≈ 40 vérifications), puis un test navigateur (étoiles, badges, révision, mobile arabe).

## Étape 26.3 — Kids : contrôle parental (durée, catalogue, rapport)

Tout se règle depuis l'espace parents (`/kids` → « Espace parents : gérer les profils » → **Contrôle parental** à côté de chaque enfant). Ces réglages sont refusés par l'API avec un jeton enfant.

### Durée quotidienne
- Par enfant : sans limite, ou 15 / 30 / 45 / 60 / 90 / 120 / 180 min par jour (API : de 5 à 480 min).
- **Le serveur mesure lui-même le temps** : la page enfant envoie un « ping » toutes les 30 s tant qu'elle est visible (ou qu'une vidéo se lit) ; le serveur ajoute le temps réellement écoulé depuis le ping précédent (60 s au plus d'un coup). Une page qui enverrait une fausse durée n'a aucun effet.
- Le compteur repart à zéro chaque jour (heure de Paris).
- Quand il reste 5 min ou moins : message « Plus que n min ». Une fois la durée écoulée : message doux (« C'est fini pour aujourd'hui ! »), plus aucune vidéo proposée, et le serveur refuse la lecture, le quiz et l'enregistrement de la progression (`403 kid_time_up`). Le parent peut allonger la durée à tout moment.
- Limite connue : un lien de lecture déjà délivré reste valable pendant sa courte durée de vie ; la vidéo en cours s'arrête dès le prochain ping.

### Catalogue autorisé
- **Tout le catalogue Kids de son âge** (par défaut) : le parent décoche ce qu'il veut bloquer ; les nouvelles conférences apparaissent toutes seules.
- **Seulement ma sélection** : l'enfant ne voit que ce qui est coché ; une nouvelle conférence n'apparaît pas tant que le parent ne l'a pas cochée.
- Au changement de mode, l'état actuel est conservé (rien n'apparaît ni ne disparaît sans décision du parent).
- Une conférence bloquée disparaît du catalogue, de « À rejouer aujourd'hui », et son accès direct est refusé (404). La tranche d'âge reste prioritaire : autoriser une conférence trop « grande » ne la rend pas visible.

### Rapport de progression
- Par enfant, sur 7 ou 30 jours : temps passé (et barres par jour), vidéos terminées, quiz faits et moyenne, étoiles gagnées, badges gagnés (Apprentissage), vidéos à reprendre en douceur. **Aucun classement, aucune comparaison** : chaque enfant est présenté seul.
- Disponible avec les deux formules (seuls les badges demandent Apprentissage).
- **E-mail hebdomadaire** : un seul par parent et par jour, au jour et à l'heure réglés (Réglages → Kids : `kids_report_enabled`, `kids_report_weekday` — 0 = dimanche —, `kids_report_hour`, heure de Paris). Pas d'e-mail si aucun enfant n'a été actif, ni si le parent l'a désactivé (case dans le rapport) ou n'a plus d'abonnement. Bouton « M'envoyer le rapport maintenant ». Nécessite l'envoi d'e-mails (SMTP) configuré.

### API
- Enfant : `POST /kids/ping`. `/kids/talks` et `/kids/summary` renvoient `time: {limitMin, usedSec, leftSec, timeUp}`.
- Parent : `GET/PUT /me/kids/profiles/:id/controls` (`dailyLimitMin`, `catalogMode`) · `GET/PUT /me/kids/profiles/:id/catalog` (`{talkIds, allowed}`) · `GET /me/kids/report?days=7|30` · `PUT /me/kids/report-prefs` · `POST /me/kids/report/send`.
- Migration `031_kids_control.sql` (appliquée au démarrage) : `kid_profiles.daily_limit_min / catalog_mode`, `kid_catalog`, `kid_usage`, `users.kids_report_email / kids_report_last`.

### Déploiement
```bash
cd /chemin/du/projet && git add -A && git commit -m "Etape 26.3 Kids controle parental" && git push
# DockPanel : redéployer api puis web (translator inchangé)
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Tests
`python3 api/tests/test_kids_control.py` (≈ 70 vérifications) · `node api/tests/test_kids_report.mjs` (e-mail hebdomadaire) · puis un test navigateur (réglages, rapport, fin de journée, mobile arabe).

## Étape 26.4 — Identité visuelle Kids et bande « Espace Kids » sur l'accueil

- **Thème Kids** (page `/kids` et espace enfant) : nuit étoilée bleu nuit et violet, police arrondie (Fredoka, paquet `@fontsource-variable/fredoka`), logo « Mejliss TV **Kids** » aux lettres colorées, boutons ronds, cadres de vignettes jaune / vert / violet / bleu. Le thème s'active tout seul (classe `kd-theme` sur la page) ; le reste du site garde son style doré.
- **Bandeau** (`components/KidsBanner.js`) : sur la page des parents, version complète avec les 4 étapes numérotées et les 4 engagements (contenus adaptés, pédagogie ludique, suivi de progression, environnement sûr) ; sur l'accueil de l'enfant, version courte. Textes en français, anglais et arabe (clés `kdTagline`, `kdS1T`…`kdS4D`, `kdP1`…`kdP4`).
- **Votre illustration** : déposez une image PNG à fond transparent (le personnage, par exemple) dans `web/public/kids/hero.png` ; elle apparaît à droite du bandeau. Sans fichier, de petites icônes flottantes (🌙 ⭐ 📚 🕌) servent de décor. Les couleurs se changent dans `app/globals.css` (section « Mejliss TV Kids »).
- **Bande sur l'accueil du site** : sous la bannière du haut, un bandeau « Mejliss TV Kids » avec les 10 dernières conférences Kids (vignette, âge, durée) et le bouton « Découvrir l'espace Kids ». Un clic sur une vidéo mène à `/kids` : le parent s'y connecte, choisit le profil, et l'enfant regarde dans son espace protégé. La bande disparaît si l'espace Kids est désactivé ou s'il n'y a aucune conférence Kids.
- API : `GET /home/kids` (public, aperçu seulement : aucun lien de lecture).

### Déploiement
```bash
cd /chemin/du/projet/web && npm install      # nouvelle dépendance : police Fredoka
cd .. && git add -A && git commit -m "Etape 26.4 identite Kids + bande accueil" && git push
# DockPanel : redéployer api puis web
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

## Étape 26.5 — Classement : sous-catégories, plusieurs catégories, plusieurs tranches d'âge Kids

**Ce que ça change**
- **Sous-catégories** (2 niveaux) : Admin → Catégories → « + Sous-catégorie » (ex. Coran › Lecture, Coran › Apprentissage). Chercher ou filtrer « Coran » trouve aussi ses sous-catégories.
- **Catégorie principale + 2 autres au maximum** par conférence (Studio → fiche de la conférence).
- **Kids : plusieurs tranches d'âge** cochables (3-6, 7-10, 11-14). Une conférence cochée « 3 à 6 » + « 7 à 10 » apparaît pour les deux. Les anciennes valeurs sont converties automatiquement (3-6 → toutes, 7-10 → 7-10 et 11-14, 11-14 → 11-14).
- **Case « Visible aussi dans le catalogue des adultes »** : décochée, une conférence Kids n'apparaît ni dans l'accueil, ni dans la liste, ni dans la recherche des adultes (elle reste accessible par lien direct et dans Kids).
- Meilisearch se réindexe tout seul.

**Déploiement** (migration 032 automatique au démarrage de l'API)
```bash
# Copiez le contenu de majlis-tv/ dans C:\Users\agenc\Documents\GitHub\majlistv, puis commit + push
# DockPanel : redéployer majlistv-api, puis majlistv-web
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

**Après le déploiement** : réaffectez les 2 conférences de l'ancienne catégorie « Kids » à de vraies thématiques (Studio), puis supprimez la catégorie « Kids » (Admin → Catégories). Cochez la tranche d'âge Kids sur vos conférences concernées.

**Debug** : `docker logs <conteneur api>` ; une catégorie qui a des sous-catégories ne peut pas être supprimée (409) : supprimez ou déplacez d'abord les sous-catégories. Tests : `api/tests/test_taxonomy.py`.

## Étape 26.6 — Refonte de l'en-tête, du menu mobile, de la recherche, de l'accueil et de Kids

**Ce qui change (web uniquement, l'API ne bouge pas)**
- **En-tête** : Accueil, Séries, Ouvrages, Apprentissage, Ma bibliothèque + bouton coloré « Kids », puis la loupe et le compte. Studio et Administration passent dans le menu de l'avatar, sous le titre « Gestion ». Visiteur non connecté : langue, Connexion et « S'abonner ».
- **Téléphone** : ☰ ouvre un menu latéral (Découvrir / Kids / Gestion, puis compte, abonnement, déconnexion, langue).
- **Recherche** : la barre de l'accueil est supprimée. La loupe ouvre un panneau au centre (le site s'assombrit) avec résultats en direct, filtres catégorie et niveau ; Échap ou clic à côté pour fermer. Le bouton « Tout voir » d'une rangée affiche toujours la grille de la catégorie, avec un bouton « ← Accueil ».
- **Accueil** : la bande Kids passe sous la première rangée (Nouveautés), plus fine et à la largeur du contenu ; la citation du jour tient sur une ligne, l'arabe s'ouvre à la demande.
- **Kids** : en-tête violet-rose entièrement coloré, bannière explicative réduite à une ligne de 4 pastilles (bouton « Masquer », mémorisé dans le navigateur), titres de sections en couleurs, message « Salam 'Aleykoum <prénom> ! ».

**Déploiement** : copier le contenu de `majlis-tv/` dans `C:\Users\agenc\Documents\GitHub\majlistv`, commit + push, redéployer `majlistv-web` (l'API n'a pas changé). Ensuite sur le VPS : `/root/apply-limits.sh`, `grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss`, `nginx -t && systemctl reload nginx`.

## Étape 16.2a/c — Adresses lisibles, chapitres et extrait dans le HTML

**Ce qui change**
- Chaque conférence a une adresse lisible : `/conferences/la-patience-dans-l-epreuve` ; chaque série aussi : `/series/serie-lecture-du-coran`. L'adresse est créée à la première lecture publique et **ne change plus**, même si le titre est modifié (les liens et le référencement restent stables). Titre en arabe : `conference-xxxxxxxx`. Deux titres identiques : `-2`, `-3`.
- Les anciennes adresses (`/talks/<identifiant>`, `/series/<identifiant>`) sont **redirigées en 308 (permanent)** vers l'adresse lisible, en conservant `?t=` (partage à la minute), `?quiz=1`, etc. Une conférence non publique (brouillon d'un organisateur) reste accessible par l'ancienne adresse, en « noindex ».
- Adresse canonique, `sitemap.xml` et données structurées utilisent les adresses lisibles.
- **Conférences gratuites uniquement** : résumé, chapitres (liens `?t=`) et extrait de la transcription (1 200 caractères) sont dans le HTML, dans un bloc repliable « Chapitres et extrait » sous le lecteur, et les chapitres sont déclarés à Google (`Clip`). Rien de ce contenu n'est exposé pour une conférence premium.

**Déploiement** (migration 033 automatique) : redéployer `majlistv-api`, puis `majlistv-web`. Après déploiement, ouvrez `/sitemap.xml` : toutes les adresses lisibles sont créées à ce moment-là. Dans la Search Console, soumettez de nouveau le sitemap.

**Debug** : `curl -I https://VOTRE-SITE/talks/<identifiant>` doit répondre `308` avec `location: /conferences/…`. Tests : `api/tests/test_slugs.py`.

## Étape 16.2b — Pages intervenants

**Ce qui change**
- Chaque intervenant a une page publique : `/intervenants/cheikh-hamza` (présentation, séries, conférences), et la liste `/intervenants` (lien « Intervenants » dans le pied de page).
- L'intervenant reste le nom saisi dans le champ « Intervenant » des conférences. « Cheikh Hamza », « cheikh hamza » et « Cheikh Hamzà » forment **une seule page**. Un nom en arabe donne `intervenant-xxxxxxxx`.
- Seules les conférences publiées et visibles du catalogue adulte comptent (ni brouillons, ni conférences réservées aux enfants).
- **Présentation** : Administration → Intervenants → champ texte (3 000 caractères) → Enregistrer. Elle apparaît dans la page et dans le HTML (Google). Vide = aucune présentation.
- Le nom de l'intervenant sur la fiche d'une conférence est un lien vers sa page. Pages et liste sont dans le `sitemap.xml`, avec des données structurées `Person`.

**Déploiement** (migration 034 automatique) : redéployer `majlistv-api`, puis `majlistv-web`, puis les 3 commandes habituelles (`/root/apply-limits.sh`, grep `proxy_pass`, `nginx -t && systemctl reload nginx`). Ensuite : Administration → Intervenants et rédigez une présentation courte par intervenant.

**Debug** : `curl https://VOTRE-SITE/api/speakers` liste les intervenants détectés. Si deux orthographes très différentes donnent deux pages, harmonisez le champ « Intervenant » dans le Studio. Tests : `api/tests/test_speakers.py`.


## Étape 17a — Vitesse de lecture et mode audio

**Ce que ça fait**
- Sous chaque lecteur : boutons de vitesse **0,75× · 1× · 1,25× · 1,5× · 1,75× · 2×** (vidéos envoyées, archive.org, YouTube, Vimeo). Le choix est mémorisé sur l'appareil.
- Bouton **🎧 Mode audio** (vidéos envoyées uniquement) : le lecteur passe sur une piste audio seule (pochette + lecteur). La position et l'état lecture/pause sont conservés dans les deux sens ; le choix est mémorisé.
- Écran verrouillé / notifications (Media Session) : titre, pochette, lecture-pause, ±15 s.
- Le serveur crée la piste audio **sans ré-encoder** (copie de l'audio du premier rendu) : quelques Mo par heure de vidéo, accès protégé comme la vidéo (jeton, aperçu tronqué pour les non-abonnés).

**Limites honnêtes** : la lecture écran éteint dépend du téléphone et du navigateur (Android/Chrome : généralement oui ; iPhone/Safari : variable selon la version). Pas de mode audio pour YouTube/Vimeo/archive.org (le fichier n'est pas chez nous).

**Déploiement** (migration 035 automatique) : redéployer `majlistv-api`, puis `majlistv-web`, puis **`majlistv-worker`**. Le worker crée la piste audio des vidéos existantes **toutes seules, une à la fois**, quand il n'a pas de conversion en cours. Ensuite : `/root/apply-limits.sh`, `grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss`, `nginx -t && systemctl reload nginx`.

**Suivi / debug** : `select audio_status, count(*) from talks where source='upload' group by 1;` (`pending` = en attente, `ready`, `failed` après 3 essais, `none`). Pour relancer un échec : `update talks set audio_status='pending', audio_attempts=0 where audio_status='failed';`. Logs : `docker logs dockpanel-git-majlistv-worker`.

**Tests** : `node worker/tests/test_audio.mjs /tmp/audio_out` (ffmpeg), puis `python3 api/tests/test_audio.py` (API + S3).

## Étape 17b — Marque-pages et notes personnelles

**Ce que ça fait** (réservé aux utilisateurs connectés, gratuit, strictement privé)
- Sur une conférence : bouton **🔖 Marque-page** sous le lecteur (ajoute un repère à l'instant exact) et onglet **Mes notes** : écrire une note liée à l'instant courant, la modifier, la supprimer, cliquer sur l'heure pour y retourner.
- Dans **Ma bibliothèque** : section « Mes marque-pages et notes », groupée par conférence ; chaque heure ouvre la conférence **au bon passage** (`?t=`), suppression possible sur place.
- Un marque-page posé deux fois au même instant (±1,5 s) n'est pas dupliqué. Limites : 2 000 caractères par note, 300 notes par conférence. Supprimer une conférence supprime les notes associées.
- Fonctionne pour les vidéos envoyées, YouTube, Vimeo et archive.org. Non disponible dans l'espace Kids (jeton enfant refusé par l'API).

**Déploiement** (migration 036 automatique) : redéployer `majlistv-api`, puis `majlistv-web` (le worker n'a pas changé), puis `/root/apply-limits.sh`, `grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss`, `nginx -t && systemctl reload nginx`.

**Debug** : `select count(*) from talk_notes;` ; `select user_id, count(*) from talk_notes group by 1 order by 2 desc limit 5;`.

**Tests** : `python3 api/tests/test_notes.py` (isolation entre utilisateurs, limites, cascade).

## Étape 27 — Modification en lot, quiz sur le lecteur, page vidéo Kids

### 27.1 Modification des conférences en lot (Studio)
Dans **Studio → Mes conférences**, une case à cocher par ligne (et une dans l'en-tête pour tout sélectionner). Dès qu'une conférence est cochée, une barre apparaît : **Modifier en lot**.
On coche uniquement les champs à changer : accès (gratuit/premium), catégorie principale, niveau, publication (publiée/brouillon), intervenant, tranches d'âge Kids (**remplacer / ajouter / retirer**), visibilité dans le catalogue adultes.
Tout est appliqué en **une seule transaction** : si une conférence pose problème, rien n'est modifié. Un organisateur ne peut toucher qu'à ses propres conférences ; l'administrateur à toutes. Limite : 200 conférences par opération.
API : `POST /talks/bulk` `{ ids: [...], changes: {...}, bandsMode: "replace|add|remove" }`.

### 27.2 Le quiz s'affiche sur le lecteur
Le quiz de fin de conférence ne s'ouvre plus **sous** la vidéo mais **par-dessus**, dans la zone du lecteur (la vidéo se met en pause automatiquement). « Revoir à mm:ss » referme le quiz et replace la vidéo au bon endroit. La carte d'invitation reste sous le lecteur quand le quiz est fermé.

### 27.3 Page vidéo de l'espace Kids
La page `/kids/watch/<id>` était réduite à la vidéo. Elle contient maintenant : barre du haut (retour + total d'étoiles), lecteur encadré aux couleurs Kids avec le **quiz en superposition**, titre, puces d'infos (intervenant, durée, tranche d'âge, étoiles obtenues), carte colorée **« Teste-toi ! »** (ou « Rejouer » si l'enfant a déjà des étoiles), bloc **« De quoi ça parle ? »**, et une rangée **« Et ensuite ? »** avec d'autres vidéos de son âge. À la fin de la vidéo, le quiz s'ouvre tout seul s'il existe.

**Déploiement** (aucune migration) : redéployer `majlistv-api`, puis `majlistv-web`, puis `/root/apply-limits.sh`, `grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss`, `nginx -t && systemctl reload nginx`.

**Tests** : `python3 api/tests/test_bulk.py` (droits, transaction, tranches Kids).

## Étape 28 — Audit de sécurité du code (correctifs appliqués)

Revue complète du code et des dépendances des six services. Le détail de ce qui a été vérifié et jugé
correct est en fin de section ; voici d'abord ce qui a été **corrigé**.

### 28.1 Dépendances : deux failles critiques fermées

| Service | Paquet | Avant | Après | Pourquoi |
|---|---|---|---|---|
| api | `@fastify/jwt` (et `fast-jwt`) | 9.1.0 / 5.0.6 | **10.2.4 / 6.3.4** | 10 bulletins, dont trois notés 9,1/10 : acceptation de jetons non signés quand la clé est vide, confusion de cache renvoyant les droits d'un **autre** utilisateur, contournement de la validation quand le contenu du jeton est un tableau JSON. Le jeton d'authentification est la pièce qui décide qui est administrateur : c'était la correction la plus urgente. |
| web | `next` | 14.2.35 | **15.5.28** | Falsification de requête côté serveur (8,6/10), contournement du middleware, empoisonnement de cache, injection de script dans l'App Router, plusieurs dénis de service. Aucune version 14.x ne les corrige. |
| web | `postcss` (dépendance interne de Next) | 8.4.31 | **8.5.30** (via `overrides`) | Lecture de fichiers arbitraires et injection via `sourceMappingURL`. Le passage par `overrides` évite d'imposer Next 16, qui exigerait React 19. |

Résultat : `npm audit` renvoie **0 vulnérabilité** sur `api`, `web` et `worker`.

Next 15 rend `params` asynchrone dans les pages : la compilation a été refaite et les pages du site
vérifiées une par une (accueil, formules, connexion, séries, bibliothèque, Kids, intervenants) ainsi que
la feuille de style produite. Aucune adaptation du code n'a été nécessaire.

### 28.2 Limite anti-force brute contournable (faille réelle, corrigée)

L'API était démarrée avec `trustProxy: true`. Avec ce réglage, l'adresse IP retenue pour un visiteur est
celle qu'il **annonce lui-même** dans l'en-tête `X-Forwarded-For`. En la changeant à chaque essai, on
obtenait un compteur neuf à chaque fois : les limites de débit de `/auth/login` (10 essais par minute) et
de `/auth/forgot` ne s'appliquaient plus, et les mots de passe pouvaient être essayés en série sans frein.

Correctif : `trustProxy` vaut maintenant `'loopback'` (seul le nginx de la machine est digne de confiance),
réglable par `TRUST_PROXY` pour un éventuel proxy distant. Mesuré avant/après :

| Réglage | IP retenue avec l'en-tête `9.9.9.9, <vraie IP>` | Effet |
|---|---|---|
| `true` (avant) | `9.9.9.9` — celle annoncée par le visiteur | limite contournable |
| nombre (`1`, `2`) | `127.0.0.1` — en-tête ignoré | **une seule limite pour tous** : un visiteur bloquerait les autres |
| `'loopback'` (après) | la vraie IP | limite correcte, par visiteur |

Vérification sur l'API : 13 essais de connexion en faisant varier l'en-tête donnent `401 401 401 401 401
401 401 401 401 401 429 429 429` — le blocage revient bien après 10 essais.

### 28.3 Images Docker : versions non garanties (corrigé)

Les quatre Dockerfiles copiaient `package.json` **sans** le fichier de verrouillage, puis lançaient
`npm install` : les versions installées étaient donc celles du jour du build, et rien ne garantissait la
présence des versions corrigées ci-dessus. Ils copient maintenant aussi `package-lock.json` et utilisent
`npm ci`, qui installe exactement les versions validées. Contrôlé en reproduisant l'étape de build :
`@fastify/jwt@10.2.4`, `next@15.5.28`, `postcss@8.5.30`, et 0 vulnérabilité pour les trois services.

### 28.4 En-têtes de sécurité du site public (corrigé)

L'API est protégée par helmet (CSP, HSTS, anti-clickjacking…), mais le **site** ne renvoyait aucun en-tête
de sécurité et annonçait sa technologie (`X-Powered-By: Next.js`). `web/next.config.mjs` pose désormais
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` et
`Strict-Transport-Security`, et supprime `X-Powered-By`.

La `Content-Security-Policy` du site est traitée plus bas (28.6).

### 28.5 Deux points de propreté

- `transcriber/src/external.py` contenait un **espace sans largeur** (U+200B) écrit en clair dans le code,
  donc invisible à la relecture : remplacé par `"​"`, comportement identique (vérifié).
- `api/tests/test_compliance.py` attendait encore `checkout:year` alors que le code écrit
  `checkout:standard:year` depuis l'ajout du palier Apprentissage : test mis à jour (le code était juste).

### Ce qui a été vérifié et qui est correct

- **Injections SQL** : aucune. Toutes les valeurs passent en paramètres (`$1`, `$2`…). Les morceaux de
  requête assemblés par du texte ne contiennent que des noms de colonnes issus de listes fixes
  (`SORT_SQL[sort]`, `STATUS_SQL`), des valeurs validées par `zod` (`z.enum`, entiers bornés) ou des
  constantes ; les caractères `%` et `_` des recherches sont échappés.
- **Mots de passe** : bcrypt à 12 tours. Réinitialisation par jeton aléatoire de 32 octets stocké sous
  forme d'empreinte SHA-256, valable 1 heure, à usage unique, 3 demandes par heure maximum, et réponse
  identique que l'adresse existe ou non (on n'apprend pas qui a un compte). Changer de mot de passe
  déconnecte les sessions antérieures (`sessions_valid_after`).
- **Jetons et rôles** : le rôle est relu en base à chaque requête (un jeton de plusieurs jours ne garde pas
  un ancien rôle), les comptes suspendus sont refusés, et un jeton « espace enfant » est rejeté partout
  sauf sur les routes prévues. Jetons falsifiés testés : `alg=none`, signature modifiée, jeton inventé —
  tous refusés (401).
- **Accès aux vidéos payantes** : les playlists HLS exigent un jeton HMAC-SHA256 propre à la conférence,
  avec expiration, comparaison à temps constant et signature distincte pour l'aperçu. Les chemins acceptés
  sont une liste blanche (`master.m3u8`, `vN/index.m3u8`, `audio/index.m3u8`) : pas de remontée de
  dossiers possible.
- **Envois de fichiers** : l'API ne fait que signer des liens, le type doit correspondre à `video/*`, la
  taille est plafonnée, et un organisateur ne peut compléter ou annuler que ses propres envois.
- **Liens externes (SSRF)** : les URL fournies par les organisateurs ne sont jamais appelées telles quelles.
  Seuls `youtu.be`, `youtube.com`, `vimeo.com` et `archive.org` sont acceptés, et seul l'identifiant extrait
  est conservé ; les services reconstruisent l'adresse à partir d'un domaine inscrit dans le code.
- **Exécution de commandes** : `ffmpeg`, `ffprobe` et `yt-dlp` sont appelés avec une liste d'arguments, sans
  passer par un interpréteur de commandes : pas d'injection possible.
- **Paiement** : le webhook Stripe vérifie la signature sur le corps brut de la requête.
- **Code parental Kids** : comparaison bcrypt, blocage temporaire après 5 erreurs.
- **Secrets** : aucun secret en dur dans le code. `.env` est exclu de Git et des images Docker ; les clés du
  back-office sont chiffrées en base (AES-256-GCM) ; `JWT_SECRET` doit faire au moins 32 caractères, sinon
  l'API refuse de démarrer.
- **Conteneurs** : les six services tournent sous un utilisateur non privilégié.
- **Données JSON-LD** (référencement) : les `<` sont échappés, donc pas d'injection de script par ce biais.

### 28.6 Content-Security-Policy du site (ajoutée et testée)

**À quoi ça sert.** La CSP est la liste de ce que le navigateur a le droit de charger sur une page. Si un jour une faille
permettait d'injecter un script dans le site, le navigateur le refuserait : seuls les scripts du site, marqués d'un code
aléatoire (« nonce ») propre à chaque page vue, s'exécutent.

**Où.** `web/middleware.js` (nouveau). Il pose l'en-tête sur les pages ; les fichiers statiques et le proxy `/api` n'en
ont pas besoin (l'API a déjà la sienne via helmet).

**Ce qui est autorisé** (et rien d'autre) :

| Quoi | Origine autorisée |
|---|---|
| Scripts | le site + code aléatoire ; les scripts chargés par ceux-ci (API YouTube, API Vimeo) via `strict-dynamic` |
| Vidéos envoyées (HLS) | le site (`/api/hls/…`), segments sur le stockage (liens signés), `blob:` pour le lecteur |
| YouTube | cadres `youtube-nocookie.com` et `youtube.com`, miniatures `i.ytimg.com` |
| Vimeo | cadre `player.vimeo.com` |
| Images, affiches | le site, `data:`, `blob:`, `i.ytimg.com`, le stockage |
| Envoi vidéo / PDF | navigateur → stockage (`connect-src`) |
| Polices | le site uniquement (déjà auto-hébergées) |
| Interdit | `object`/`embed` (aucun), cadres venant d'un autre site (`frame-ancestors 'self'`), `<base>` détourné |

Limite connue : les styles en ligne (`style="…"`, très utilisés par React pour les vignettes) ne peuvent pas porter de
nonce, donc `style-src` garde `'unsafe-inline'`. Le risque est bien plus faible que pour les scripts.

**Réglages (facultatifs, variables du service `majlistv-web` dans DockPanel)**

- `CSP_STORAGE_ORIGINS=https://s3-majlisstv.le-publicitaire.fr` — adresse du stockage (la même que `S3_ENDPOINT` de
  l'API). **Recommandé** : la CSP n'autorise alors que ce stockage. Sans cette variable, le site accepte n'importe quel
  `https:` pour les images, médias et envois : tout fonctionne, mais en moins strict.
- `CSP_MODE` — `enforce` (défaut, bloque), `report-only` (le navigateur signale dans la console sans rien bloquer) ou
  `off` (aucune CSP). **C'est le bouton de secours** : si une vidéo ou une image ne s'affiche plus après la mise en
  ligne, mettre `CSP_MODE=report-only`, redéployer `majlistv-web`, puis me transmettre le message de la console
  (touche F12 → Console, lignes « Content Security Policy… »).
- `CSP_EXTRA_FRAME` — autre site à autoriser en cadre (par exemple un futur lecteur), séparé par des virgules.

**Tests réalisés** (Chromium, site compilé en production, stockage simulé) : 15 pages (accueil, connexion, inscription,
tarifs, Kids, conférence vidéo envoyée, conférence YouTube, conférence Vimeo, séries, bibliothèque, studio, nouvelle
conférence, compte, administration, mentions légales) → **0 violation** ; lecture HLS réelle (la vidéo avance, 5 s lues
sur 6) ; API YouTube et Vimeo chargées dynamiquement et cadres ouverts ; envoi direct d'un fichier au stockage ;
vignettes du stockage et de `i.ytimg.com` affichées ; témoins négatifs (un `onclick` injecté ne s'exécute pas, un script
externe inconnu est bloqué) ; modes `report-only` et `off` vérifiés. Non testable ici faute d'accès à Internet : le
chargement des vrais serveurs YouTube/Vimeo (leurs scripts ont été simulés) — d'où le test de contrôle ci-dessous.

**Contrôle après déploiement (2 minutes)** : ouvrir le site, touche F12 → onglet Console, puis visiter l'accueil, une
conférence envoyée (lecture), une conférence YouTube, une conférence Vimeo. Aucune ligne rouge « Refused to … » ne doit
apparaître.

### Deux points à surveiller (pas des failles, des choix à connaître)

- **Le jeton de lecture n'est pas lié à un compte** : il autorise une conférence pendant 6 heures, quel que
  soit celui qui le présente. Un abonné peut donc transmettre son lien. C'est le fonctionnement habituel
  des liens signés ; si le partage devient un problème, il faudra lier le jeton au compte ou à l'adresse IP
  et raccourcir sa durée.
- **`yt-dlp` se met à jour au démarrage du transcripteur** (téléchargement depuis PyPI), ce qui est
  nécessaire pour suivre les changements de YouTube, mais fait entrer du code non figé dans le conteneur.
  Désactivable avec `YTDLP_AUTO_UPDATE=0`, au prix de téléchargements YouTube qui finiront par échouer.

**Déploiement** (aucune migration de base) : redéployer `majlistv-api`, puis `majlistv-web` (après avoir ajouté `CSP_STORAGE_ORIGINS`, voir 28.6), puis
`/root/apply-limits.sh`, `grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss`,
`nginx -t && systemctl reload nginx`. Vérifier ensuite la connexion au site, la lecture d'une conférence
gratuite et d'une conférence premium, et l'espace Kids.

**Tests** : 367 vérifications passées après correctifs — `test_users_admin` (30), `test_publication` (43),
`test_taxonomy` (59), `test_slugs` (20), `test_onboarding` (20), `test_kids` (76), `test_levels` (28),
`test_compliance` (43), `test_kids_report.mjs` (12), `test_learning_unit.mjs` (26),
`test_revision_mail.mjs` (10). Non rejoués faute de prérequis dans l'environnement de test :
`test_citations*` (corpus à importer), `test_audio` (fichiers produits par le worker), `test_quiz*`
(translator + faux Claude), `test_archive` (faux archive.org).

## Étape 18 — Statistiques d'audience (site, Studio, Kids)

Des chiffres d'audience **internes et anonymes**, sans outil externe, sans cookie et sans bandeau supplémentaire.

### 18.1 Ce qui est mesuré

| Quoi | Où le voir |
|---|---|
| Visiteurs et pages vues (par jour), provenance (direct, moteurs de recherche, réseaux sociaux, autres sites + noms de domaine), appareils, langue du navigateur, pays (seulement si un CDN fournit l'en-tête) | Administration → **Statistiques** |
| Par conférence : ouvertures de la page, spectateurs du jour, lectures lancées, **temps réellement regardé**, 25 / 50 / 75 % regardés, lectures terminées, part moyenne regardée ; catégories et intervenants les plus regardés ; variation par rapport à la période précédente | Administration (toutes les conférences) et **Studio → Statistiques** (les siennes seulement, avec filtre par conférence) |
| **Kids** : ouvertures, lectures, temps regardé, fin, quiz joués, score et étoiles moyens par vidéo ; pour l'administrateur : enfants actifs par jour, minutes passées, familles, profils par tranche d'âge | Onglet « Mejliss Kids » des deux écrans |
| Export | Bouton « Exporter en CSV » (ouvre directement dans Excel) |

Périodes : 7 jours, 30 jours, 90 jours, 12 mois. Un « spectateur » est compté une fois par jour (revenu plusieurs jours, il compte plusieurs fois).

### 18.2 Respect de la vie privée (important pour les mentions légales)

- **Aucun cookie, aucune adresse IP enregistrée, aucun identifiant de personne.** Seuls des compteurs par jour sont conservés (≈ 26 mois, puis supprimés automatiquement).
- Pour ne compter qu'une fois un visiteur dans la journée, le serveur calcule une **empreinte du jour** (signature de l'adresse + navigateur + date avec une clé secrète du serveur). Elle ne se retrouve pas en sens inverse et est **supprimée au bout de 2 jours**.
- Les visiteurs qui envoient **« Do Not Track »** ou **« Global Privacy Control »**, les robots, les administrateurs et le propriétaire d'une conférence (pour ses propres vidéos) ne sont **pas comptés**.
- **Kids** : compteurs globaux par vidéo uniquement. Ni provenance, ni appareil, ni langue, ni pays ; **aucun enfant n'est nommé ni identifiable**, y compris pour l'administrateur. Le temps passé vient de la mesure du serveur déjà utilisée pour le contrôle parental.
- Interrupteur : Administration → Paramètres → **Statistiques d'audience** (désactive la collecte ; les chiffres déjà enregistrés restent).
- À ajouter à la page « Confidentialité » (Administration → Pages légales) une phrase du type : « Nous mesurons l'audience de façon anonyme, sans cookie ni conservation de votre adresse IP. »

### 18.3 Fonctionnement technique

- **Base** : migration `037_stats.sql` — `stat_dim_daily` (site entier), `stat_talk_daily` (par conférence et par jour, supprimé avec la conférence), `stat_talk_dim_daily` (provenance/appareil/langue des ouvertures d'une conférence), `stat_seen` (empreintes du jour).
- **Collecte** : `POST /stats/hit` (site) et `POST /kids/stats` (jeton enfant), `api/src/modules/stats/collect.js`. Toujours `204` : une mesure ne gêne jamais le site. Limite : 240 envois / minute / adresse.
- **Navigateur** : `web/lib/stats.js` (`useTalkStats`) et `web/components/StatsBeacon.js`. Le temps est compté uniquement en **lecture continue** : avancer dans la barre ne gonfle ni le temps ni les quartiles (un quartile = part réellement regardée) ; « terminée » exige la fin atteinte **et** au moins la moitié regardée. Fonctionne pour la vidéo envoyée, YouTube, Vimeo et archive.org.
- **Proxy du site** (`web/app/api/[...path]/route.js`) : pour les routes de statistiques seulement, il transmet à l'API le navigateur, la langue et l'adresse du visiteur (en-tête `x-client-ip`, jamais enregistré). Il lit `cf-connecting-ip`, puis `x-real-ip`, puis la dernière adresse de `x-forwarded-for`.
- **Rapports** : `GET /admin/stats` (administrateur) et `GET /studio/stats` (organisateur : ses conférences uniquement, `404` pour celles des autres) ; paramètres `days`, `audience`, `talk`, `format=csv`. `api/src/modules/stats/routes.js`.
- **Écrans** : `web/components/StatsView.js` (graphiques SVG sans bibliothèque, textes en français / anglais / arabe, tableau équivalent au clavier).
- **Entretien** : purge toutes les heures (`startStatsMaintenance`).

### 18.4 Déploiement

Une migration (automatique au démarrage de l'API). Redéployer **`majlistv-api`** puis **`majlistv-web`**, puis `/root/apply-limits.sh`, `grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss`, `nginx -t && systemctl reload nginx`. Rien à régler : la collecte est active par défaut. Les chiffres s'affichent dès les premières visites (le graphique démarre le jour de la mise en ligne).

Pour afficher aussi le **pays** des visiteurs : il faut un CDN qui l'indique (en-tête `CF-IPCountry` de Cloudflare). Sans CDN, la rubrique « Pays » n'apparaît pas.

### 18.5 Contrôle après déploiement

1. Ouvrir le site dans une fenêtre de navigation privée, regarder 30 secondes d'une conférence, fermer.
2. Administration → Statistiques : au bout de quelques secondes, 1 visiteur, des pages vues, 1 lecture, du temps regardé.
3. Studio (compte organisateur) → Statistiques : ses conférences seulement.
4. Si rien n'apparaît : F12 → Console, aucune ligne rouge ne doit mentionner `/api/stats/hit`.

### 18.6 Tests

- `python3 api/tests/test_stats.py` (51 vérifications : collecte, doublons, robots / DNT / admin ignorés, provenance, droits admin / organisateur, CSV, Kids sans aucune donnée personnelle, interrupteur, cascade).
- `node api/tests/test_stats_unit.mjs` (provenance, appareils, langues, pays, empreinte, purge).
- Test de bout en bout dans Chromium (site compilé, CSP active) : lecture réelle d'une vidéo envoyée, quartiles et fin comptés, saut dans la barre non compté, Do Not Track, tableaux de bord admin / Studio / Kids, export CSV, espace enfant — **0 violation de la CSP**.

### 18.7 Pas dans cette étape

- **Umami** (outil externe) : non installé, les statistiques internes couvrent le besoin ; ajout possible plus tard sans rien changer ici.
- **Conversion de l'aperçu gratuit vers l'essai** (prévue dans la feuille de route) : demande de suivre l'inscription après un aperçu ; à faire avec les notifications (étape 21).
- Statistiques par série (les séries se retrouvent par leurs conférences).

### 18.8 Petit correctif joint

Le lien de la vignette animée de l'accueil ne garde plus le focus au clic (avertissement « aria-hidden » de la console).


---

## Étape 29 — Mise en pratique (« Et maintenant, que faire ? » et « Mes engagements »)

### 29.1 Ce que ça fait
Après une conférence (et son quiz), le lecteur passe de l'écoute à l'action.
- **Propositions d'action** : l'IA lit la transcription et propose 3 à 5 actions concrètes en trois tailles (● petit pas, ●● moyen, ●●● ambitieux). Chaque proposition s'appuie sur un passage de l'intervenant, **cité mot pour mot** : un passage introuvable écarte la proposition. L'IA n'écrit **jamais** de texte religieux : une proposition avec guillemets, « hadith », « verset », « sourate », « obligatoire », « interdit », etc. est écartée. Aucune référence n'est produite par l'IA ; le relecteur peut en saisir une à la main.
- **Relecture** : les propositions arrivent en *brouillon*. L'organisateur (ses conférences) ou l'administrateur les relit, les modifie, les valide, les refuse ou en ajoute. Seules les propositions *validées* sont publiques. Le rôle *modérateur* viendra avec l'étape 20.
- **Écran « Et maintenant, que faire ? »** : visible par **tout le monde** (visiteurs compris) en bas de la page conférence, avec une invitation à la fin de la vidéo (si pas de quiz à passer) et un bouton à la fin du quiz.
- **Mes engagements** (offre **Apprentissage**) : le membre choisit une proposition ou écrit la sienne, ajoute une intention (niyya) facultative et une échéance (aujourd'hui / cette semaine / ce mois-ci, jours de Paris). Puis il suit : *à faire / en cours / fait / pas encore*, avec une note privée. Une échéance dépassée affiche « À reprendre » (jamais de pénalité). **Aucun score, total, pourcentage ni classement.** Sans l'offre Apprentissage : la proposition s'affiche et se copie, l'enregistrement est proposé à l'abonnement.

### 29.2 Vie privée
- Texte de l'action, intention et note sont **chiffrés en base** (AES-256-GCM) avec une clé **dédiée** `PRACTICE_KEY`, distincte de `SETTINGS_KEY`. Ni l'équipe, ni les organisateurs, ni les statistiques n'y ont accès.
- **Accord explicite** demandé au premier engagement (case à cocher), date enregistrée.
- **Export** (JSON) et **effacement total** (avec retrait de l'accord) disponibles à tout moment, **même après la fin de l'abonnement**. La suppression du compte efface les engagements.
- Les espaces Kids n'ont pas accès à cette fonction.

### 29.3 Prérequis
Étapes précédentes en place (API, web, translator avec un moteur de résumés configuré, quiz). Migration `038_practice.sql` (appliquée toute seule au démarrage de l'API).

### 29.4 Installation (DockPanel / Ubuntu 24)
1. Sur le serveur, générer la clé : `openssl rand -hex 32`
2. DockPanel → service **majlistv-api** → variables d'environnement : ajouter `PRACTICE_KEY=<la valeur>` (l'API uniquement). **La noter dans un gestionnaire de mots de passe et ne jamais la changer** : les engagements existants deviendraient illisibles. Sans cette variable, l'écran public fonctionne mais l'enregistrement d'un engagement répond « Chiffrement non configuré ».
3. Pousser le code sur GitHub (`LePubli/majlistv`), puis redéployer **dans cet ordre** : `majlistv-api` (log attendu : `Migration appliquée : 038_practice.sql`), `majlistv-translator`, `majlistv-web`.
4. Variables du web et du translator : **aucune nouvelle**.

### 29.5 Réglages (Admin → Paramètres → « Mise en pratique »)
| Réglage | Défaut | Rôle |
|---|---|---|
| Écran « Et maintenant, que faire ? » activé | oui | coupe l'écran sur tout le site |
| Propositions générées par l'IA | 4 (3 à 5) | nombre demandé à l'IA |

La langue des propositions est celle des quiz (Paramètres → Quiz → « Langue des questions générées »).

### 29.6 Utilisation
- **Organisateur** : Studio → ma conférence → onglet **Mise en pratique** → *Générer* (la transcription doit être prête) → relire, *Valider*. File globale : Studio → **Mise en pratique** (menu de gauche). Ajout à la main : « + Ajouter une proposition ».
- **Visiteur** : page conférence → « Et maintenant, que faire ? » → choisir → *Copier*.
- **Membre Apprentissage** : choisir (ou « Écrire ma propre action ») → intention, échéance, case d'accord (1re fois) → *Je m'engage*. Suivi : **Apprentissage → Mes engagements**.

### 29.7 API (résumé)
| Route | Qui | Rôle |
|---|---|---|
| `GET /talks/:id/practice` | tous | propositions validées (+ ses engagements si Apprentissage) |
| `POST /talks/:id/practice/commitments` | Apprentissage | prendre un engagement (`403 learning_required`, `409 consent_required`, `503 no_key`) |
| `GET/PATCH/DELETE /me/practice[/:id]` | Apprentissage | liste, état, note, échéance, retrait |
| `GET /me/practice/export`, `DELETE /me/practice` | tout membre | export, effacement total |
| `GET/POST /talks/:id/studio/practice[/generate\|/suggestions]` | organisateur, admin | état, génération, ajout |
| `PATCH/DELETE /studio/practice/suggestions/:sid`, `GET /studio/practice/review` | organisateur, admin | validation, file de relecture |

### 29.8 Tests
```bash
# API (3055, avec PRACTICE_KEY), PG de test (5544)
node api/tests/test_practice_crypto.mjs
python3 api/tests/test_practice.py
python3 translator/tests/test_practice_clean.py
# Génération de bout en bout : translator + fausse API Claude (voir translator/README.md, « Développement local »)
python3 api/tests/test_practice_gen.py
```
Résultat attendu : « tout est bon » à chaque fois. Attention : l'API limite à 100 requêtes/minute par adresse ; si un test échoue sur une connexion, attendre 1 minute et relancer.

### 29.9 Debug
- **« Aucune proposition exploitable »** : l'IA n'a rien produit de vérifiable (passages introuvables, texte religieux écarté). Relancer la génération ; vérifier que la transcription est prête.
- **Génération bloquée en « en cours »** : regarder les logs du translator (`[pratique …]`) et que le moteur de résumés est configuré (Admin → Paramètres → Résumés et chapitres).
- **« Chiffrement non configuré »** à l'engagement : `PRACTICE_KEY` absente (16 caractères minimum) sur l'API.
- **Engagements affichés vides ou texte manquant** : `PRACTICE_KEY` a été changée ; remettre l'ancienne valeur.
- **L'écran n'apparaît pas sur une conférence** : il faut au moins une proposition *validée*, une conférence publiée, et le réglage du site activé.

### 29.10 Retour arrière
Retirer l'écran sans rien supprimer : Admin → Paramètres → « Mise en pratique » → désactiver. Les données restent en base (tables `practice_suggestions`, `practice_jobs`, `practice_commitments`).

---

## Étape 30 — Mon bilan (*Tazkiyat an-nafs*)

### 30.1 Ce que ça fait
Dans **Apprentissage**, la personne tient deux listes, **à elle** : *qualités à cultiver* et *défauts à corriger*. Elle les choisit dans la base de thèmes (si activée) ou les écrit avec ses mots, jusqu'à **20 objectifs actifs** (on peut en **archiver**, rien n'est perdu). Chaque semaine (lundi → dimanche, heure de Paris) elle note pour chaque objectif : **Réussi / En progrès / Pas encore**, avec une note facultative. Une **frise des 8 dernières semaines** (couleurs douces) montre le chemin ; on peut compléter une semaine passée (8 semaines au plus). Un objectif peut être **relié à un engagement** de l'étape 29.
**Aucun total, score, pourcentage, série de jours, classement ni badge.**

### 30.2 Rappel hebdomadaire par e-mail
Un **seul e-mail par semaine**, au jour choisi par chaque membre (**vendredi par défaut**, réglable dans « Mon bilan »), à partir de l'heure réglée par l'administrateur (**17 h, heure de Paris**, Admin → Paramètres → « Mise en pratique »). Il n'est envoyé que s'il y a quelque chose à dire (engagements en cours ou objectifs sans bilan cette semaine), jamais deux fois la même semaine (même après un redémarrage), jamais sans l'accord de la personne, et chacun peut le désactiver.
⚠️ **Écart volontaire avec la spec** : l'e-mail ne contient que des **chiffres et un lien** (« 2 engagements en cours », « 3 objectifs à faire »), **jamais le texte** des objectifs ou des engagements : un e-mail n'est pas chiffré, et ces textes sont très sensibles. Le lien ouvre directement « Mon bilan ».
Nécessite l'envoi d'e-mails déjà configuré (Admin → Paramètres → E-mails). Sans SMTP, rien n'est mis en file.

### 30.3 Base de thèmes (qualités et défauts)
Les 24 thèmes de `docs/themes-tazkiya-base.md` (12 qualités, 12 défauts, avec leur nom arabe) sont embarqués dans `api/src/themesTazkiya.json`. **Ils ne sont pas proposés tant que vous n'avez pas relu la liste** : Admin → Paramètres → « Mise en pratique » → **« Proposer la base de thèmes »** (désactivé par défaut). Désactivée, chacun écrit ses propres objectifs. Pour corriger un thème : modifier `docs/themes-tazkiya-base.md` **et** `api/src/themesTazkiya.json` (même contenu ; l'import automatique viendra à l'étape 31). Les thèmes ne sont disponibles qu'en français (+ nom arabe) pour l'instant.

### 30.4 Confidentialité (à publier)
- Intitulé, **code du thème**, note : **chiffrés** en base (AES-256-GCM, `PRACTICE_KEY`, la même clé dédiée que l'étape 29). Le code du thème est chiffré lui aussi (il révélerait le défaut choisi).
- Aucune route ne permet à un tiers, **administrateur compris**, de lire le contenu d'un autre compte. Rien n'entre dans `/admin/stats` ni dans les exports de l'étape 18.
- **Accord explicite** au premier objectif ou engagement (case à cocher, partagée avec l'étape 29), date enregistrée.
- **Export** JSON et CSV, **effacement** en un clic (« Effacer mon bilan »), possibles **même après la fin de l'abonnement**. « Tout effacer » de *Mes engagements* efface aussi objectifs et bilans, et retire l'accord. La suppression du compte efface tout (cascade).
- **Texte à ajouter à la page « Politique de confidentialité »** (Admin → Pages légales) :
  > *Mise en pratique et bilan personnel (offre Apprentissage). Si vous utilisez « Mes engagements » et « Mon bilan », les actions que vous choisissez, vos objectifs, vos intentions et vos notes sont enregistrés de façon chiffrée, uniquement pour vous les afficher. Ces informations peuvent révéler des convictions religieuses ; elles ne sont traitées qu'avec votre accord explicite, ne sont jamais visibles par l'équipe, les organisateurs ou les autres membres, et n'entrent dans aucune statistique. Vous pouvez à tout moment les exporter (JSON, CSV) ou les effacer, et retirer votre accord, depuis votre espace Apprentissage. Le rappel hebdomadaire par e-mail ne contient jamais le texte de vos objectifs.*
  (À faire relire par un juriste avant publication.)

### 30.5 Installation (DockPanel / Ubuntu 24)
1. Rien de nouveau côté clés : `PRACTICE_KEY` (étape 29) suffit. **Aucune nouvelle variable.**
2. Dézipper à la racine du dépôt, pousser sur `LePubli/majlistv`, redéployer dans l'ordre : `majlistv-api` (log attendu : `Migration appliquée : 039_selfcheck.sql`), puis `majlistv-web`. Le translator n'est pas concerné.
3. Admin → Paramètres → « Mise en pratique » : vérifier « Rappel hebdomadaire » (activé, 17 h). Activer « Proposer la base de thèmes » **après relecture**.
4. Coller le texte de 30.4 dans la politique de confidentialité.

### 30.6 Utilisation
Apprentissage → **Mon bilan** : « + Ajouter une qualité / un défaut » → (choisir un thème ou écrire) → case d'accord la 1re fois. Chaque semaine : cliquer *Réussi / En progrès / Pas encore*, éventuellement « Ajouter une note ». Le lien de l'e-mail ouvre `/learning#bilan`.

### 30.7 API (résumé)
| Route | Rôle |
|---|---|
| `GET /me/selfcheck[?archived=1]` | objectifs, bilan de la semaine, frise, préférences, engagements reliables |
| `GET /me/selfcheck/themes` | base de thèmes (vide si désactivée) |
| `POST/PATCH/DELETE /me/selfcheck/goals[/:id]` | créer (`409 consent_required`, `409 limit`), modifier, archiver, relier, supprimer |
| `PUT/DELETE /me/selfcheck/goals/:id/checkin` | bilan d'une semaine (état + note) |
| `PUT /me/selfcheck/prefs` | rappel : activé, jour (1 = lundi … 7 = dimanche) |
| `GET /me/selfcheck/export?format=json\|csv`, `DELETE /me/selfcheck` | export, effacement (ouverts sans abonnement) |
Tout est réservé au palier Apprentissage (`403 learning_required`), sauf export et effacement.

### 30.8 Tests
```bash
# API (3055, avec PRACTICE_KEY), PG de test (5544)
python3 api/tests/test_selfcheck.py
cd api && set -a; . /var/tmp/api-test.env; set +a; node tests/test_selfcheck_mail.mjs   # base de test, SMTP factice
```
Résultat attendu : « tout est bon ». L'API limite à 100 requêtes/minute par adresse : en cas d'échec sur une connexion, attendre 1 minute et relancer.

### 30.9 Debug
- **Pas d'e-mail le vendredi** : vérifier Admin → Paramètres → E-mails (SMTP), « Rappel hebdomadaire » activé, l'heure (le rappel part à partir de l'heure réglée, pas avant), que le membre a l'offre Apprentissage, a donné son accord, n'a pas désactivé le rappel, et qu'il a bien quelque chose à faire (sinon aucun e-mail). Table `email_outbox` (type `selfcheck_weekly`).
- **« Chiffrement non configuré »** : `PRACTICE_KEY` absente sur l'API.
- **Intitulés vides après un changement de clé** : remettre l'ancienne `PRACTICE_KEY`.
- **La liste de thèmes n'apparaît pas** : réglage « Proposer la base de thèmes » désactivé.

### 30.10 Retour arrière
Couper le rappel : Admin → Paramètres → « Rappel hebdomadaire » → désactiver. Les données restent en base (`self_goals`, `self_checkins`).

---

## Étape 31 — Thèmes, évolution et retour aux organisateurs

### 31.1 Ce que ça fait
- **Bibliothèque de thèmes** (`/themes`, `/themes/:id`) : 33 thèmes issus de `docs/themes-tazkiya-base.md` (12 qualités, 12 défauts, 9 actions), chacun avec une description, **trois petits pas** (● petit · ●● moyen · ●●● ambitieux) et les conférences du catalogue qui lui sont associées.
- **Étiquettes posées par l'organisateur** : Studio → conférence → *Contenu* → onglet « Mise en pratique » → bloc « Thèmes de la conférence » (3 au maximum). Ces thèmes apparaissent en pastilles sous le titre de la conférence et sur la page du thème. (L'association « par catégorie » du ROADMAP n'est pas faite : les étiquettes la remplacent, plus précises.)
- **S'engager depuis un thème** (Apprentissage) : sur la page d'un thème, choisir un pas, « M'engager sur ce pas » (devient un engagement « cette semaine » dans *Mes engagements*) ou « Ajouter à mes objectifs » (qualités et défauts → *Mon bilan*). Depuis une conférence, on clique sur la pastille du thème.
- **Mon évolution** (Apprentissage → `/learning#evolution`) : mois par mois, **par thème**, ce qui a été appris (conférences terminées, quiz réussis) et ce qui a été mis en pratique (engagements pris et tenus, objectifs de bilan et leurs bilans). Des faits, **aucun score, pourcentage, série ni comparaison**, aucun partage.
- **Retour aux organisateurs** (Studio → Statistiques → bloc « Après la conférence ») : nombre de **personnes** engagées et ayant tenu un engagement, par conférence. **Anonyme**, affiché **seulement à partir de 6 personnes** (au-delà de 5) ; chaque personne est comptée une fois ; jamais de contenu ; pas de chiffre pour le site entier (administrateur) ni pour Kids ; présent dans l'export CSV.

### 31.2 Prérequis
Étapes 18, 29 et 30 en place, `PRACTICE_KEY` définie sur l'API (voir étapes 29 et 30). Aucune nouvelle variable.

### 31.3 Installation / mise à jour
Migration `040_themes.sql` (appliquée automatiquement au démarrage de l'API) : table `talk_themes` et colonne `practice_commitments.theme_enc`. Déployer **l'API d'abord, puis le web** (pas de changement du traducteur).

```bash
cd /chemin/vers/majlistv
unzip -o ~/majlis-tv-etape31-themes-evolution.zip -d /tmp/e31 && cp -r /tmp/e31/. .
git add -A && git commit -m "Etape 31 : themes, evolution, retour organisateurs" && git push
# DockPanel : redéployer majlistv-api, attendre « Running », puis majlistv-web
```

### 31.4 Mise en ligne de la bibliothèque
La bibliothèque est **cachée au public** tant que le réglage **Admin → Paramètres → Mise en pratique → « Proposer la base de thèmes »** est désactivé (il l'est par défaut). Relire d'abord `docs/themes-tazkiya-base.md` (descriptions, petits pas) : toute correction se fait dans `api/src/themesTazkiya.json` (champs `title`, `translit`, `ar`, `desc`, `steps`), puis redéployer l'API. Les textes des thèmes sont en français pour l'instant (l'interface autour est en FR/EN/AR). Aucune citation n'est écrite dans la base.
Les thèmes d'**action** (A1 à A9) ont une description écrite pour le site (le fichier de base n'en contenait pas) : à relire aussi.

### 31.5 Confidentialité
- Engagement pris depuis un thème : texte, intention et thème **chiffrés** (`PRACTICE_KEY`), comme le reste. Même accord, même export, même effacement que les étapes 29 et 30 ; supprimés avec le compte.
- « Mon évolution » est calculée à la demande, rien n'est stocké en plus ; personne d'autre (administrateur compris) ne peut la voir.
- Retour aux organisateurs : uniquement des nombres de personnes distinctes ≥ 6.
- Texte à ajouter à la page légale (à faire relire) : « Les statistiques fournies aux conférenciers indiquent uniquement le nombre de personnes qui se sont engagées après une conférence, à partir de 6 personnes, sans aucune information permettant de les identifier. »

### 31.6 Utilisation
- **Organisateur** : Studio → conférence → Contenu → « Mise en pratique » → choisir jusqu'à 3 thèmes → Enregistrer. Chiffres : Studio → Statistiques.
- **Membre** : Menu → `/themes` → un thème → choisir un pas → *M'engager* ou *Ajouter à mes objectifs*. Suivi : Apprentissage → *Mes engagements*, *Mon bilan*, *Mon évolution*.

### 31.7 API (résumé)
| Route | Rôle |
|---|---|
| `GET /themes`, `GET /themes/:id` | bibliothèque publique (`enabled:false` / 404 si désactivée) |
| `GET/PUT /studio/talks/:id/themes` | étiquettes d'une conférence (organisateur propriétaire ou admin, 3 max) |
| `POST /me/practice/themes/:themeId` | s'engager sur un pas (`size` 1-3, `niyya`, `due`, `consent`) |
| `GET /me/evolution?month=AAAA-MM` | évolution mensuelle par thème (12 derniers mois) |
| `GET /studio/stats` | contient `practice` : personnes engagées, `null` sous le seuil |
`GET /talks/:id` renvoie aussi `themes`. Les routes `/me/*` exigent l'offre Apprentissage (`403 learning_required`).

### 31.8 Tests
```bash
# API (3055, avec PRACTICE_KEY), PG de test (5544)
python3 api/tests/test_themes.py      # attend 1 minute au milieu (limite de 100 requêtes/minute)
python3 api/tests/test_selfcheck.py   # non-régression étape 30
```
Résultat attendu : « TOUT EST OK ».

### 31.9 Debug
- **/themes affiche « bientôt disponible »** : réglage « Proposer la base de thèmes » désactivé.
- **Pas de pastille sur la conférence** : aucun thème choisi dans le Studio, ou base désactivée.
- **« Chiffrement non configuré »** : `PRACTICE_KEY` absente sur l'API.
- **Statistiques sans bloc « Après la conférence »** : vue Kids, ou moins de 6 personnes (message « pas encore assez de personnes »).
- **« Mon évolution » vide** : normal tant que les conférences consultées n'ont pas de thème posé par l'organisateur.

### 31.10 Retour arrière
Désactiver « Proposer la base de thèmes » : la bibliothèque, les pastilles et les choix disparaissent du public. Les données restent en base (`talk_themes`).

### 31.11 Plus tard (31.4 du ROADMAP)
Version Kids (actions du jour validées par le parent), notifications push (Android), partage volontaire avec un proche : non faits.

---

## Étape 20 — Modération

### 20.1 Ce que ça fait
- **Rôle « Modérateur »** (Admin → Utilisateurs → fiche → Rôle) : accède à **Modération** (menu du Studio) et à la validation des propositions d'action (étape 29). Il ne voit ni le back-office, ni les paramètres, ni le journal.
- **Relecture avant mise en ligne** : réglage **Admin → Paramètres → Modération → « Relire les conférences des organisateurs avant leur mise en ligne »** (désactivé par défaut). Activé, toute conférence qu'un **organisateur** publie ou programme passe « en attente » : invisible du public (liste, recherche, page, plan du site) jusqu'à validation. Les conférences déjà en ligne ne bougent pas. Les **administrateurs** et les organisateurs **« de confiance »** (case sur leur fiche utilisateur) sont dispensés. Un brouillon n'est jamais relu : la relecture se déclenche au moment de publier.
- **Décision du modérateur** : *Valider* ou *Refuser* (motif obligatoire). L'organisateur reçoit un e-mail (FR/EN/AR), voit le statut et le motif dans le Studio, corrige puis clique « Corriger puis renvoyer à la relecture ». Le modérateur peut prévisualiser une conférence en attente.
- **Signalement par les spectateurs** : bouton « Signaler » sur la page de chaque conférence (motif : droits d'auteur, contenu inapproprié, trompeur, propos religieux à vérifier, problème technique, autre ; précisions ≤ 1000 caractères). Compte facultatif ; un même membre ne peut avoir qu'un signalement ouvert par conférence ; **5 signalements par heure et par adresse** (anti-abus).
- **Traitement** (Modération → Signalements) : *Classer sans suite*, *Réglé (sans retrait)* ou *Retirer la conférence* (motif obligatoire, envoyé à l'organisateur ; la conférence passe en « refusée », tous ses signalements ouverts sont réglés d'un coup, elle peut être renvoyée puis revalidée). L'identité de la personne qui signale n'est visible que de l'équipe, jamais de l'organisateur.
- **Journal des actions** (Admin → Journal des actions) : qui, quand, quelle action, quelle cible, quels champs modifiés. Enregistre les modifications de l'administrateur (administration, conférences, séries, catégories, ouvrages, imports…) et du modérateur (décisions). **Seuls les noms des champs sont conservés, jamais les valeurs** (mots de passe, clés). Filtres par période, par équipe, recherche, export CSV. En ajout seul : aucune route ne le modifie ni ne le vide.

### 20.2 Prérequis
Rien de nouveau : aucune variable obligatoire. Facultatif : `REPORT_RATE_MAX` (défaut 5) = nombre de signalements par heure et par adresse.

### 20.3 Installation / mise à jour
Migration `041_moderation.sql` (automatique au démarrage de l'API) : rôle `moderator`, colonne `users.trusted_publisher`, colonnes de relecture sur `talks` (+ déclencheur SQL), tables `content_reports` et `audit_log`. Déployer **l'API d'abord, puis le web**.

```bash
cd /chemin/vers/majlistv
unzip -o ~/majlis-tv-etape20-moderation.zip -d /tmp/e20 && cp -r /tmp/e20/. .
git add -A && git commit -m "Etape 20 : moderation" && git push
# DockPanel : redéployer majlistv-api, attendre « Running », puis majlistv-web
```

### 20.4 Mise en service pas à pas
1. Créer le compte du relecteur (Admin → Utilisateurs → Créer) avec le rôle **Modérateur**, ou changer le rôle d'un compte existant.
2. Pour chaque organisateur que vous connaissez bien : fiche → case **« Organisateur de confiance »**.
3. Admin → Paramètres → **Modération** → activer « Relire les conférences… » → Enregistrer.
4. Le modérateur se connecte : menu du compte → **Modération**.

### 20.5 Confidentialité et obligations
- Le journal est une donnée de sécurité : accessible aux seuls administrateurs. Aucune suppression automatique : prévoir une purge manuelle périodique (ex. au-delà de 2 ans) et la mentionner dans la politique de confidentialité.
- Les signalements contiennent éventuellement l'adresse e-mail du membre : visible uniquement de l'équipe. Si vous êtes hébergeur de contenus d'organisateurs externes, conserver aussi le motif de retrait (champ `note`) : il sert de trace en cas de contestation.
- À faire relire juridiquement : la procédure de signalement pour droits d'auteur (mentions légales) avant ouverture aux organisateurs externes.

### 20.6 API (résumé)
| Route | Rôle |
|---|---|
| `POST /talks/:id/report` | signalement (visiteur ou membre ; `429` au-delà de la limite) |
| `GET /moderation/summary`, `GET /moderation/queue?status=pending\|rejected` | compteurs, file de relecture |
| `POST /moderation/talks/:id/decision` | `{decision: approve\|reject, note}` (motif ≥ 5 caractères pour un refus) |
| `GET /moderation/reports?status=open\|handled`, `POST /moderation/reports/:id/resolve` | `{action: dismiss\|resolve\|unpublish, note}` |
| `POST /talks/:id/review/submit` | l'organisateur renvoie une conférence refusée |
| `GET /admin/audit?days&role&q&limit&offset&format=csv` | journal (administrateur) |
`GET /me/talks` renvoie `reviewStatus` et `reviewNote`. Rôles : `/moderation/*` = modérateur ou administrateur.

### 20.7 Tests
```bash
# API (3055, avec REPORT_RATE_MAX élevé dans l'environnement de test), PG de test (5544)
python3 api/tests/test_moderation.py
```
Résultat attendu : « TOUT EST OK ». La limite de 100 requêtes/minute s'applique : en cas d'échec sur une connexion, attendre 1 à 2 minutes.

### 20.8 Debug
- **Une conférence n'apparaît pas après publication** : elle est « en attente » (Studio → état). Vérifier Modération → À relire.
- **Aucune relecture malgré le réglage** : l'organisateur est « de confiance », administrateur, ou la conférence est restée en brouillon.
- **Plus de relecture à demander** : décocher le réglage ; les conférences déjà en attente restent à traiter (ou à valider une par une).
- **Pas d'e-mail de décision** : voir Admin → Paramètres → E-mails (SMTP) ; table `email_outbox` (types `review_approved`, `review_rejected`).
- **Le journal ne montre pas mon action** : seules les modifications (POST/PUT/PATCH/DELETE) de l'administrateur et du modérateur y figurent, pas les lectures ni les gestes personnels (favoris, notes, engagements).

### 20.9 Retour arrière
Désactiver le réglage « Relire les conférences… » : les nouvelles publications sont de nouveau immédiates. Pour remettre en ligne ce qui est en attente : Modération → Valider, ou en SQL `UPDATE talks SET review_status='approved' WHERE review_status='pending';`.

---

## Étape 19 — Collections et listes

### 19.1 Ce que ça fait
- **Collections éditoriales** (`/collections`, `/collections/:id`) : sélections de conférences choisies par l'équipe (type : *cycle*, *série d'un intervenant*, *thème du moment*), dans l'ordre voulu. Visibles seulement si elles sont **publiées** et contiennent au moins une conférence visible (une conférence en brouillon, en attente de relecture ou retirée n'apparaît pas). Une collection **épinglée** passe en tête. Gestion : **Studio → Collections** (modérateurs et administrateurs) : créer, modifier, ajouter des conférences par recherche, réordonner (↑ ↓), publier, supprimer. Chaque action est inscrite au journal (étape 20).
- **Listes personnelles** (`/lists`, lien « Mes listes » dans la Bibliothèque) pour tout membre connecté : jusqu'à **20 listes** de **200 conférences**. Bouton **« Ajouter à une liste »** sur chaque conférence (cocher les listes, ou en créer une à la volée). Réordonner, retirer, renommer, supprimer.
- **Partage** : « Partager par un lien » crée un lien secret `/l/<jeton>` lisible **sans compte**, **non indexé** (`noindex`), qui **n'affiche jamais le membre** (ni nom, ni e-mail). « Nouveau lien » invalide l'ancien ; « Arrêter le partage » coupe l'accès. Une conférence retirée du site disparaît aussi des listes partagées.
- Choix de conception : les listes sont ouvertes à tous les comptes connectés (pas seulement aux abonnés payants), comme les favoris. Les comptes enfants (Kids) n'y ont pas accès.

### 19.2 Prérequis et installation
Aucune variable. Migration `042_collections.sql` (automatique) : `collections`, `collection_items`, `user_lists`, `user_list_items`. Déployer **l'API d'abord, puis le web**.

```bash
cd /chemin/vers/majlistv
unzip -o ~/majlis-tv-etape19-collections.zip -d /tmp/e19 && cp -r /tmp/e19/. .
git add -A && git commit -m "Etape 19 : collections et listes" && git push
# DockPanel : redéployer majlistv-api, attendre « Running », puis majlistv-web
```

### 19.3 Utilisation
- **Équipe** : Studio → Collections → nom → *Créer* → ouvrir la collection → rechercher et *Ajouter* des conférences, ordonner, *Enregistrer les conférences*, cocher *Publiée* → *Enregistrer les informations*.
- **Membre** : page d'une conférence → *Ajouter à une liste* ; Bibliothèque → *Mes listes* → ouvrir une liste → *Partager par un lien* → *Copier le lien*.

### 19.4 API (résumé)
| Route | Rôle |
|---|---|
| `GET /collections`, `GET /collections/:id` | public (publiées, conférences visibles) |
| `GET/POST /studio/collections`, `GET/PATCH/DELETE /studio/collections/:id`, `PUT /studio/collections/:id/items` | équipe (modérateur, administrateur) ; `items` = `{talkIds}` dans l'ordre, 100 au plus |
| `GET/POST /me/lists`, `GET/PATCH/DELETE /me/lists/:id` | listes du membre (`409 limit` au-delà de 20) |
| `PUT/DELETE /me/lists/:id/items/:talkId`, `PUT /me/lists/:id/items` | ajouter / retirer / réordonner (`{talkIds}`) |
| `GET /me/lists/containing/:talkId` | listes qui contiennent cette conférence |
| `POST /me/lists/:id/share` (`{renew}`), `DELETE /me/lists/:id/share` | activer ou renouveler / couper le lien |
| `GET /lists/shared/:token` | lecture publique d'une liste partagée |

### 19.5 Tests
```bash
python3 api/tests/test_collections.py   # API (3055) + PG de test (5544)
```
Résultat attendu : « TOUT EST OK ».

### 19.6 Debug
- **Une collection n'apparaît pas** : elle n'est pas publiée, ou aucune de ses conférences n'est visible (brouillon, relecture, vidéo en cours de traitement).
- **Un lien de liste ne marche plus** : le membre a coupé le partage ou demandé un nouveau lien.
- **« Vous avez déjà 20 listes »** : limite volontaire, supprimer une liste.

### 19.7 Retour arrière
Dépublier une collection (décocher *Publiée*) la retire du site sans rien perdre. Les listes de membres ne s'affichent que pour leur propriétaire ou par lien secret.

## Étape 21 — Notifications et cartes cadeaux

### 21.1 Ce que ça fait
**E-mails d'information** (jamais d'e-mail commercial non demandé) :
- **Suivre un intervenant** : bouton **Suivre** sur la page de l'intervenant (membre connecté, 100 intervenants au plus). Quand de nouvelles conférences de cet intervenant deviennent visibles, le membre reçoit **un seul e-mail groupé** (jamais un par conférence). Chaque conférence n'est annoncée qu'**une fois** (`talks.announced_at`) ; les conférences déjà en ligne au déploiement ne déclenchent rien. Un brouillon, une conférence en attente de relecture, une publication programmée dans le futur ou une conférence « hors catalogue adultes » n'est annoncé qu'au moment où elle devient réellement visible.
- **Sélection de la semaine** : un e-mail par semaine, **uniquement aux membres qui l'ont demandée** (case décochée par défaut, Mon compte → Mes e-mails). Contenu : la **collection** désignée dans les réglages (idéal : une vraie sélection éditoriale que vous changez chaque semaine) ou, à défaut, les **nouveautés des 7 derniers jours**. S'il n'y a rien à proposer, rien n'est envoyé.
- **Désinscription en un clic** : chaque e-mail d'information contient un lien « Se désabonner en un clic » **et** les en-têtes `List-Unsubscribe` / `List-Unsubscribe-Post` (RFC 8058) : Gmail et Apple Mail affichent leur propre bouton « Se désabonner ». Le lien est un **jeton signé** (aucune connexion nécessaire, aucune expiration) qui ne permet **que** de se désabonner de **cette catégorie**. Ouvrir la page ne désinscrit personne tant qu'on ne clique pas (les antivirus qui « visitent » les liens ne désabonnent pas les gens). Un e-mail déjà en file mais dont le destinataire s'est désabonné entre-temps **n'est pas envoyé**.
- **Mon compte → Mes e-mails** : cocher/décocher les deux types, voir et retirer les intervenants suivis.
- Les e-mails de compte et de paiement (bienvenue, mot de passe, facture…) ne sont **pas** concernés : ils ne portent pas de lien de désinscription.

**Cartes cadeaux** (1, 3 ou 12 mois) :
- Page **/gift** (« Offrir un abonnement », lien sur la page des formules et dans Mon compte) : durée, destinataire facultatif (prénom, e-mail), message de 300 caractères, case d'acceptation des conditions de vente (texte, version, date, IP et navigateur conservés comme preuve), puis **paiement unique** sur Stripe Checkout (carte, et PayPal si activé ; TVA automatique si Stripe Tax est activé). Aucun renouvellement.
- Le **code** (`XXXX-XXXX-XXXX`, 12 caractères sans 0/O/1/I) n'existe pour l'acheteur qu'**après confirmation du paiement par Stripe** (webhook). L'acheteur le retrouve dans **Mon compte → Mes cartes cadeaux** (avec un lien d'activation à partager) et par e-mail. Si une adresse de destinataire est saisie, **la carte lui est envoyée tout de suite** avec le message et le prénom de l'expéditeur ; sinon seul l'acheteur reçoit le code.
- **Activation** : page **/redeem** (le lien de l'e-mail préremplit le code ; connexion ou compte gratuit requis). Le code ouvre l'accès à toutes les conférences (formule standard) pour la durée de la carte, via `users.premium_until`. Une 2ᵉ carte s'**ajoute** à la durée restante. Un code ne sert **qu'une fois**, même si deux personnes l'activent au même instant. Sécurité : 10 essais par minute au plus, 32¹² codes possibles.
- Le bénéficiaire peut déjà avoir un abonnement : l'accès offert court **en parallèle dès aujourd'hui** ; s'il résilie son abonnement, il prend le relais sans coupure (l'écran le lui explique).
- L'acheteur est prévenu quand sa carte est activée, **sans voir qui l'a activée**.
- **Administration → Cartes cadeaux** : totaux (disponibles, activées, annulées, ventes), liste filtrable (état, code, e-mail), **génération de cartes offertes** (concours, partenaires : 50 au plus par fois, aucune facturation, aucun e-mail), **annulation** d'une carte non activée. Tout est inscrit au journal des actions (étape 20), sans les codes.
- **Remboursement** : un remboursement **complet** fait dans Stripe annule automatiquement la carte si elle n'a pas été activée (si elle l'était, elle est seulement marquée « remboursée » et l'accès reste : à vous de décider).

### 21.2 Prérequis, réglages, installation
Aucune variable d'environnement. Migration `043_notifications_gifts.sql` (automatique) : `speaker_follows`, colonnes `users.notify_speakers` (vrai par défaut) / `notify_weekly` (faux par défaut) / `weekly_last_week`, `talks.announced_at`, `gift_cards`. Déployer **l'API d'abord, puis le web**.

1. **Envoi d'e-mails** configuré (Admin → Paramètres → E-mails). Sans lui, rien n'est mis en file et rien n'est perdu : les conférences ne sont « annoncées » qu'une fois l'envoi actif.
2. **Délivrabilité** : le domaine d'envoi doit avoir **SPF et DKIM** valides (chez votre fournisseur SMTP). C'est indispensable pour que le bouton « Se désabonner » natif de Gmail s'affiche et que les messages n'aillent pas en spam.
3. **Stripe (cartes cadeaux uniquement)** : dans Stripe → Développeurs → Webhooks, ouvrir le point d'accès existant (`…/api/billing/webhook`) et **ajouter ces 3 événements** si absents : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`. Sans eux, une carte payée resterait « en attente ».
4. **Admin → Paramètres → Notifications par e-mail** : alertes d'intervenants (activées par défaut), sélection de la semaine (désactivée par défaut), collection envoyée (coller son identifiant : Studio → Collections → l'identifiant figure dans l'adresse de la collection, `/collections/<identifiant>`), jour (4 = jeudi) et heure (9 h, Paris), nombre de conférences.
5. **Admin → Paramètres → Cartes cadeaux** : cocher « Vendre des cartes cadeaux », fixer les trois prix (0 = durée non vendue). Les montants sont ceux **réellement facturés** (pas de produit à créer dans Stripe).

```bash
cd /chemin/vers/majlistv
unzip -o ~/majlis-tv-etape21-notifications-cadeaux.zip -d /tmp/e21 && cp -r /tmp/e21/. .
git add -A && git commit -m "Etape 21 : notifications et cartes cadeaux" && git push
# DockPanel : redéployer majlistv-api, attendre « Running », puis majlistv-web
```

### 21.3 Utilisation
- **Membre** : page d'un intervenant → *Suivre* ; Mon compte → *Mes e-mails* pour régler ; *Offrir un abonnement* (ou /gift) pour acheter ; *Activer une carte cadeau* (ou /redeem) pour utiliser un code.
- **Équipe** : pour une vraie sélection de la semaine, créer une collection (Studio → Collections), la publier, coller son identifiant dans le réglage, et le changer chaque semaine.
- **Administrateur** : Administration → Cartes cadeaux.

### 21.4 API (résumé)
| Route | Rôle |
|---|---|
| `PUT/DELETE /speakers/:slug/follow` | suivre / ne plus suivre (connecté) |
| `GET/PUT /me/notifications` | réglages (`speakers`, `weekly`), intervenants suivis, disponibilité des envois |
| `GET /unsubscribe/:token` | lecture seule : catégorie et état (aucun changement) |
| `POST /unsubscribe/:token` | désinscription (JSON ou formulaire `List-Unsubscribe=One-Click`), sans connexion |
| `GET /gifts/options` | durées, prix, texte des conditions (public) |
| `POST /gifts/checkout` | `{months, terms, recipientEmail?, recipientName?, message?}` → `{url}` Stripe |
| `GET /me/gifts` | mes cartes payées (code visible une fois payée) |
| `POST /gifts/redeem` | `{code}` → durée et date de fin (`409` déjà utilisé, `410` annulé, `404` inconnu) |
| `GET /admin/gifts`, `POST /admin/gifts/generate`, `POST /admin/gifts/:id/void` | administration |

### 21.5 Points juridiques à faire valider (avant d'ouvrir la vente)
- **Conditions de vente** : le texte d'acceptation (`GIFT_TERMS_TEXT` dans `api/src/modules/gifts/routes.js`) promet un remboursement dans les 14 jours tant que la carte n'est pas activée. À intégrer dans vos CGV (page légale « cgv ») et à faire relire. Changer le texte : changer aussi `GIFT_TERMS_VERSION`.
- **TVA** : une carte cadeau utilisable dans plusieurs pays peut être un « bon à usage multiple » (TVA due à l'**activation**) ou « à usage unique » (TVA due à la **vente**). À trancher avec votre comptable ; Stripe Tax ne règle pas ce point à votre place.
- **Données personnelles** : l'adresse e-mail d'un destinataire (qui n'a pas de compte) est conservée dans `gift_cards` ; à mentionner dans la politique de confidentialité, avec les intervenants suivis et les préférences d'e-mails. Aucun autre e-mail n'est envoyé à cette adresse.
- **Prospection** : les alertes d'intervenants viennent d'un choix explicite (le membre suit l'intervenant) ; la sélection de la semaine est **opt-in** (décochée par défaut). Ne pas la cocher pour les membres.
- **Durée de validité** : aucune expiration n'est appliquée aux cartes (choix prudent). À revoir avec votre conseil si vous voulez en fixer une.

### 21.6 Tests
```bash
# API (3055, lancée avec STRIPE_API_BASE=http://127.0.0.1:12111), faux Stripe (api/tests/mock_stripe.py), faux SMTP (api/tests/smtp_sink.py 2525), PG de test (5544)
python3 api/tests/test_gifts.py           # achat, webhook, activation simultanée, cumul, annulation, remboursement, admin
python3 api/tests/test_notifications.py   # suivi, réglages, jetons de désinscription, envoi réel avec en-têtes
set -a; . /var/tmp/api-test.env; set +a; node api/tests/test_notify_mail.mjs   # boucles : annonces, sélection, doublons, échappement, arabe
```
Résultat attendu : « TOUT EST OK » / « TOUT OK ». Les contrôles sont limités à 10 requêtes par minute sur l'achat et l'activation : laisser une minute entre deux exécutions.

### 21.7 Debug
- **Aucun e-mail d'alerte** : envoi non configuré, réglage « alertes » désactivé, ou le membre est désinscrit. Les boucles tournent toutes les 10 minutes (journal : « Alertes d'intervenants mises en file »). Le tableau de bord montre les e-mails en attente.
- **Une carte payée reste « en attente »** : le webhook Stripe n'a pas reçu l'événement `checkout.session.completed` (voir 21.2, point 3), ou la signature (`stripe_webhook_secret`) est fausse. Rejouer l'événement depuis Stripe.
- **« Code inconnu »** : le code est mal recopié, ou la carte n'est pas encore payée. L'administrateur retrouve la carte par son code (Cartes cadeaux → recherche).
- **Pas de bouton « Se désabonner » dans Gmail** : SPF/DKIM manquants, ou trop peu d'envois ; le lien en bas du message fonctionne dans tous les cas.
- **Rien dans la sélection de la semaine** : la collection choisie n'est pas publiée / vide, et aucune conférence n'a été publiée ces 7 derniers jours.

### 21.8 Retour arrière
Désactiver les réglages (alertes, sélection, cartes cadeaux) arrête tout sans rien perdre. Les cartes déjà vendues restent activables tant que la page /redeem existe ; ne pas retirer l'API sans avoir honoré les cartes payées.

### 21.9 À savoir
- La carte cadeau donne l'accès **standard** (toutes les conférences, quiz de fin de vidéo). La formule **Apprentissage** (bilan, thèmes, révisions) n'est pas offerte par carte : à décider avec vous (prochaine évolution possible).
- Les erreurs renvoyées par l'API lors de l'activation (« Code inconnu… ») sont en français quelle que soit la langue du site.

## Étape A — Fonctions activables et désactivables

### A.1 Ce que ça fait
Une page **Administration → Fonctions** (menu latéral) avec **un interrupteur par fonction du site**. Une fonction coupée :
- disparaît des **menus** (en-tête, tiroir mobile, menu du Studio et de l'administration) et des **pages** concernées (bouton favori, listes, notes, « Suivre », cartes cadeaux dans Mon compte…) ;
- voit ses **routes API refusées** (`404` avec `code: "feature_off"`), y compris si quelqu'un tape l'adresse à la main ; l'inscription fermée répond `403` ;
- affiche, sur ses pages, « Cette fonction n'est pas disponible » (fr / en / ar) au lieu d'un contenu cassé ;
- arrête ses **e-mails automatiques** (révisions, bilan, alertes d'intervenants).

**Aucune donnée n'est supprimée** : rallumer la fonction remet tout comme avant. Chaque changement est inscrit au **journal des actions** (« Fonctions : Quiz désactivée »).

| Groupe | Fonctions |
|---|---|
| Catalogue | Séries et épisodes · Collections · Ouvrages |
| Apprentissage | Quiz · Mise en pratique · Révision espacée · Mon bilan personnel · Parcours et attestations · Notes |
| Communauté | Favoris · Listes de lecture · Suivre un intervenant · Citation du jour · Mejliss Kids · Statistiques d'audience |
| Argent | Cartes cadeaux |
| Communication | Sélection de la semaine · Annonce des nouvelles conférences |
| Accès | Inscription ouverte · **Mode maintenance** |

Les fonctions qui avaient déjà leur réglage (Kids, cartes cadeaux, mise en pratique, statistiques, sélection de la semaine, annonces) **gardent ce même réglage** : le modifier dans Paramètres ou dans Fonctions revient au même.

**Mode maintenance** : visiteurs et membres voient une page d'attente (API : `503`, `code: "maintenance"`). Restent ouverts : connexion, mot de passe oublié, administration, webhook Stripe. **Un administrateur connecté garde l'accès à tout le site**, pour vérifier avant de rouvrir. Une confirmation est demandée avant de l'activer.

### A.2 Prérequis et installation
Aucune variable d'environnement, **aucune migration** : les interrupteurs sont des réglages (`feat_<nom>`) enregistrés dans la table `app_settings`. Tout est **activé par défaut**, sauf la maintenance : après la mise à jour, le site se comporte exactement comme avant.

```bash
cd /chemin/vers/majlistv
unzip -o ~/majlis-tv-etapeA-fonctions.zip -d /tmp/eA && cp -r /tmp/eA/. .
git add -A && git commit -m "Etape A : fonctions activables" && git push
# DockPanel : redéployer majlistv-api, attendre « Running », puis majlistv-web
```
Après le redéploiement, lancer sur le serveur : `/root/apply-limits.sh`, puis vérifier le port nginx de l'API (7000).

### A.3 Utilisation
Administration → **Fonctions** → cliquer l'interrupteur (or = activée, gris = coupée). Le site se met à jour tout de suite pour les nouveaux visiteurs ; un onglet déjà ouvert se met à jour au prochain rechargement.

### A.4 Ajouter une fonction plus tard (développeur)
Tout est dans `api/src/featuresList.js` : ajouter une entrée `{ id, group, label, hint, rules: [{ re: '^/chemin' }] }`. L'interrupteur, la garde de routes, la route publique `GET /features` et la page d'administration suivent sans autre code. Côté site : `const { feat } = useApp(); feat('id')` pour masquer un bouton, et `web/lib/features.js` pour rattacher une page à une fonction.

### A.5 API (résumé)
| Route | Rôle |
|---|---|
| `GET /features` | état de toutes les fonctions `{ quiz: true, … }` (public ; aussi dans `GET /config`) |
| `GET /admin/features` | groupes, fonctions, état (administrateur) |
| `PUT /admin/features` | `{ values: { quiz: false } }` → nouvel état ; journalisé |

### A.6 Tests
```bash
# API (3055), PG de test (5544). Attendre ~1 min : le cache des réglages dure 5 s et le test coupe puis rallume chaque fonction.
python3 api/tests/test_features.py
```
Résultat attendu : « TOUT EST BON » (49 contrôles : fonctions coupées / rallumées, inscription fermée, maintenance avec accès administrateur, journal, droits).

### A.7 Debug
- **Une fonction coupée apparaît encore** : l'onglet n'a pas été rechargé (le menu vient du chargement de la page) ; recharger.
- **Un membre voit « Fonction indisponible »** : la fonction est coupée dans Administration → Fonctions.
- **Plus d'accès au site** : on ne peut pas se bloquer côté administration (les routes `/admin` ne sont jamais fermées). En cas d'oubli de la maintenance, un administrateur se connecte (`/login` reste ouvert) et rallume le site ; en dernier recours : `DELETE FROM app_settings WHERE key = 'feat_maintenance';` dans la base.
- **Les e-mails ne partent plus** : vérifier que la fonction n'est pas coupée (révision espacée, bilan, suivi d'intervenants).

### A.8 À savoir
- Couper « Suivre un intervenant » masque aussi, dans Mon compte → Mes e-mails, le réglage de la sélection de la semaine (les deux partagent la même page d'API).
- Couper « Séries » retire les séries de l'accueil, des menus et des pages ; les épisodes restent des conférences ordinaires.
- Les abonnements et le paiement Stripe n'ont **pas** d'interrupteur à ce stade : couper le paiement a des conséquences sur l'accès qui sont à décider avec l'étape « Rémunération ».
- Les fonctions à venir (chaînes, rémunération, vitrine visiteur) s'ajouteront à la même liste lors de leur étape.

## Étape B — Menu latéral, onglets et fil d'Ariane (espace membre)

### B.1 Description
Fini le long défilement vertical : l'espace membre a désormais un gabarit commun.
- **Menu latéral à gauche** (ordinateur) pour tout membre connecté : *Découvrir* (Accueil, Séries, Collections, Ouvrages, Intervenants), *Mon espace* (Apprentissage, Ma bibliothèque, Mon bilan), *Compte* (Kids, Mon compte) et, pour les rôles concernés, *Gestion* (Studio / Modération, Administration). La page courante est surlignée.
- **Barre de 5 entrées en bas** (téléphone) : Accueil, Séries (ou Collections si les séries sont coupées), Apprendre, Bibliothèque, Compte. Le menu ☰ de l'en-tête garde tout le reste.
- **Onglets** (au lieu d'une seule page très longue), chacun avec sa propre adresse `?tab=` :
  - **Mon compte** (onglets verticaux) : Profil (dont langue du site), Abonnement, Mes e-mails, Cartes cadeaux.
  - **Apprentissage** : Tableau de bord (score, courbe, badges, derniers résultats), Révisions, Parcours (mise en pratique, séries, attestations), Mon bilan.
  - **Ma bibliothèque** : Reprendre, Favoris, Mes listes, Mes notes. L'ancienne page `/lists` renvoie vers l'onglet *Mes listes*.
- **Fil d'Ariane** en haut de chaque page à onglets.
- Les **interrupteurs de l'étape A** s'appliquent : une fonction coupée disparaît du menu, de la barre du bas et des onglets.
- Visiteurs, Studio/Administration (menu propre), Kids, connexion, tarifs et pages légales : inchangés.

### B.2 Prérequis
Étape A déployée. Aucune migration, aucune variable `.env` nouvelle, **aucune modification de l'API** : seule l'image `web` change.

### B.3 Installation / déploiement
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` en remplaçant les fichiers.
2. GitHub Desktop : *Commit to main*, puis *Push origin*.
3. DockPanel → Git Deploy : *Redeploy* `majlistv-web` uniquement (l'API ne change pas).
4. Sur le VPS (SSH), réappliquer les limites et vérifier nginx :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### B.4 Fichiers
- `web/lib/shell.js` : où le menu latéral s'affiche.
- `web/components/MemberShell.js` : menu latéral + barre du bas (branché dans `app/layout.js`).
- `web/components/Tabs.js` : onglets accessibles (`useTab`, `TabBar`, `TabPanel`), clavier (flèches, Début, Fin), adresse `?tab=`.
- `web/components/Crumbs.js` : fil d'Ariane.
- `web/components/ListsPanel.js` : contenu de « Mes listes », partagé par la bibliothèque.
- Pages remaniées : `app/account`, `app/learning`, `app/library`, `app/lists` (redirection) ; styles `.ms-*`, `.tabs*`, `.crumbs` à la fin de `globals.css` ; textes `bc*`, `ms*`, `tb*`, `ac*` en français, anglais, arabe.

### B.5 Ajouter un onglet ou une entrée de menu
- Onglet : ajouter `{ id, label }` à la liste `tabs` de la page et un `<TabPanel id="…" current={tab}>`.
- Entrée de menu : ajouter une ligne `[adresse, libellé, icône, condition]` dans `groups` de `MemberShell.js` ; la condition reprend l'interrupteur de fonction (`feat('…')`).

### B.6 Debug
- **Pas de menu latéral** : il n'apparaît que connecté, hors Studio/Administration/Kids/connexion/tarifs. Vérifier la session.
- **Un onglet manque** : sa fonction est coupée dans Administration → Fonctions.
- **Retour de paiement** : `/account?billing=success` ouvre directement l'onglet Abonnement (le suivi de l'activation s'y fait).
- **Un lien `?tab=` inconnu** ouvre le premier onglet.

### B.7 Exemples
- Lien direct vers les révisions : `/learning?tab=rev` ; vers les listes : `/library?tab=lists` ; vers l'abonnement : `/account?tab=billing`.

### B.8 À savoir
- Le menu apparaît une fraction de seconde après le chargement (le site attend de connaître la session).
- « Chaînes » remplacera « Intervenants » à l'étape C ; « Historique » et « Chaînes suivies » (maquette) viendront avec elle.
- Le Studio et l'Administration avaient déjà un menu latéral ; l'harmonisation visuelle complète est prévue à l'étape E.
- Tests : `web` compilé et vérifié dans un navigateur (ordinateur, mobile, arabe RTL, clavier, interrupteurs, pas d'erreur CSP).

## Étape E1 — Vitrine visiteur et citation du jour encadrée

### E1.1 Description
- **Vitrine visiteur** : un visiteur non connecté qui ouvre l'accueil voit la promesse *Regarder. Comprendre. Retenir. Mettre en pratique.*, puis **une vraie conférence tirée au hasard parmi les plus vues** (différente à chaque visite) présentée en quatre étapes : 1 lecteur (lien vers la conférence ou son extrait gratuit), 2 résumé et chapitres, 3 **une vraie question de son quiz, jouable sans compte** (correction et explication immédiates, lien vers le quiz complet), 4 mise en pratique et calendrier de révision J+1 / J+3 / J+7 / J+21. Suivent les trois atouts (contenus structurés, compréhension vérifiable, progression personnelle dont enfants), la bande Mejliss Kids, les dernières conférences, les formules (« à partir de », prix lus dans Stripe) et la citation du jour.
- **Citation du jour encadrée** : grand cadre centré en bas de l'accueil (visiteurs et membres), texte arabe puis français mis en valeur, source dessous.
- Les membres connectés gardent l'accueil habituel (avec le menu latéral de l'étape B).

### E1.2 Règles du tirage (API `GET /showcase`, public)
- Candidates : conférences prêtes, publiées, pour adultes, dont le quiz est proposé au public (assez de questions validées, fonction Quiz allumée).
- Classement par audience des 90 derniers jours (une lecture compte triple, une ouverture simple) ; tirage au hasard parmi les **8** premières. Sans statistiques, les plus récentes passent en premier.
- La bonne réponse n'est **jamais** envoyée par `/showcase` : le visiteur répond via `POST /talks/:id/quiz/submit` (rien n'est enregistré sans compte).
- Conférence réservée aux abonnés : les titres de chapitres restent cachés (seul leur nombre est annoncé), comme dans l'aperçu gratuit.
- Si aucune conférence n'a de quiz, la section « exemple » n'est pas affichée (le reste de la vitrine l'est).

### E1.3 Prérequis et déploiement
Étapes A et B déployées. Aucune migration ni variable `.env`. **API puis web** (nouvelle route `/showcase`) :
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` en remplaçant les fichiers.
2. GitHub Desktop : *Commit to main*, puis *Push origin*.
3. DockPanel → Git Deploy : *Redeploy* `majlistv-api` (attendre « running » : la migration s'applique au démarrage), puis `majlistv-web`.
4. Sur le VPS (SSH), réappliquer les limites et vérifier nginx :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
Pour que la vitrine montre un exemple : au moins quelques conférences publiques avec un quiz validé (Studio → Quiz). Idéalement avec un extrait gratuit ou en accès libre.

### E1.4 Interrupteur
Administration → Fonctions → **Vitrine visiteur** (groupe Accès). Coupée : les visiteurs retrouvent l'accueil classique.

### E1.5 Fichiers
`api/src/modules/showcase/routes.js`, `api/src/featuresList.js` (fonction `showcase`), `api/tests/test_showcase.py` ; `web/components/Vitrine.js`, `web/components/CitationCard.js` (variante `framed`), `web/app/page.js`, styles `.vt-*` et `.cit-framed`, textes `vt*` fr/en/ar.

### E1.6 Debug
- **« Voir un exemple » absent** : aucune conférence n'a de quiz proposé au public.
- **Même conférence à chaque fois** : moins de 2 conférences éligibles.
- **Pas de citation** : importer et valider le corpus (Administration → citations) ; sans citation, le cadre n'apparaît pas.
- **Miniature grise** : la conférence n'a pas d'affiche ni de miniature externe.

### E1.7 À savoir
- Reste pour **E2** : page chaîne publique et finitions après l'étape C ; harmonisation visuelle Studio/Administration.
- Les tarifs affichés viennent de Stripe : sans formule configurée, la section « Commencez à votre rythme » n'apparaît pas.

## Étape C — Chaînes (l'intervenant devient une chaîne avec un propriétaire)

### C.1 Description
- **Une chaîne = la page publique d'un intervenant**, désormais fusionnée avec la notion de chaîne : nom, présentation, nombre d'abonnés, bouton *Suivre*, puis onglets **Conférences** / **Séries**, fil d'Ariane. Adresse : `/chaines/<slug>` (le slug est celui de l'ancien intervenant : rien ne change pour les abonnés ni pour les liens).
- **Anciennes adresses** `/intervenants` et `/intervenants/<slug>` : redirection permanente (308) vers `/chaines…`, le référencement suit. Sitemap et adresse canonique mis à jour.
- **Propriétaire** : chaque chaîne appartient à un **organisateur**. À la migration, le propriétaire est l'organisateur qui a le plus de conférences sous ce nom. L'organisateur gère nom et présentation dans **Studio → Ma chaîne**. Il continue de gérer ses propres conférences, séries et épisodes comme avant.
- **Modérateur et administrateur** : **Studio → Chaînes** (menu Modération) liste toutes les chaînes, permet de corriger nom et présentation, **d'attribuer ou de retirer le propriétaire** (organisateur, modérateur ou administrateur). Chaque modification est inscrite au journal des actions.
- **Membre** : Ma bibliothèque → onglet **Chaînes suivies** (avec « Ne plus suivre »). Le menu parle de « Chaînes » partout (menu latéral, pied de page, administration).
- Les e-mails d'alerte des nouvelles conférences continuent d'utiliser les chaînes suivies (même identifiant).

### C.2 Règles
- Les chaînes sont créées automatiquement (au démarrage puis toutes les 10 minutes, et à l'ouverture de Studio → Chaînes) à partir des conférences existantes. Une chaîne apparaît donc dans les 10 minutes qui suivent la première conférence portant ce nom d'intervenant.
- Le nom choisi pour une chaîne n'est **jamais écrasé** par la synchronisation. Le champ « Intervenant » des conférences continue de relier une conférence à sa chaîne (même nom = même chaîne).
- Un propriétaire retiré volontairement par la modération le reste (la synchronisation ne le réattribue pas).
- Vider la présentation (ancien écran Administration → intervenants) ne supprime plus la chaîne.

### C.3 Prérequis et déploiement
Étapes A, B et E1 déployées. **Une migration** (`044_channels.sql`, lancée automatiquement au démarrage de l'API : ajoute nom, propriétaire à la table des présentations). Aucune variable `.env`. API puis web :
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` en remplaçant les fichiers.
2. GitHub Desktop : *Commit to main*, puis *Push origin*.
3. DockPanel → Git Deploy : *Redeploy* `majlistv-api` (attendre « running » : la migration s'applique au démarrage), puis `majlistv-web`.
4. Sur le VPS (SSH), réappliquer les limites et vérifier nginx :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
Après le redéploiement : ouvrir `/chaines`, puis Studio → Chaînes (administrateur) pour vérifier les propriétaires attribués.

### C.4 Interrupteur
Administration → Fonctions → **Chaînes** (groupe Catalogue). Coupé : pages `/chaines`, Studio → Ma chaîne et onglet Chaînes suivies indisponibles (les données restent). L'interrupteur « Suivre un intervenant » reste indépendant.

### C.5 Fichiers
API : `migrations/044_channels.sql`, `src/channels.js`, `src/routes/channels.js`, `src/speakers.js` (nom de chaîne), `src/routes/notifications.js` (nom actuel dans les suivis), `src/featuresList.js`, `tests/test_channels.py`.
Web : `app/chaines/…`, `components/ChannelClient.js`, `components/FollowedChannels.js`, `app/studio/channel/page.js`, `next.config.mjs` (redirections), `StudioShell.js`, `MemberShell.js`, `Footer.js`, `sitemap.js`, styles `.ch-*`, textes `ch*`, `tb Follows` fr/en/ar.

### C.6 Debug
- **Ma chaîne vide** : aucune conférence de l'organisateur n'a de nom d'intervenant, ou la chaîne appartient à un autre organisateur (voir Studio → Chaînes côté modération).
- **Chaîne sans propriétaire** : la modération l'a retirée ; la réattribuer depuis Studio → Chaînes.
- **Une chaîne en double** : deux graphies différentes (ex. « Cheikh Hamza » / « Hamza ») donnent deux chaînes ; harmoniser le champ « Intervenant » des conférences.
- **Ancien lien cassé** : vérifier que le web est redéployé (les redirections sont dans `next.config.mjs`).

### C.7 À savoir
- Pas encore d'image d'avatar ni de bannière : l'avatar est la première lettre du nom (à ajouter plus tard avec les finitions E2).
- Un organisateur ne gère toujours que **ses** conférences ; la chaîne n'ouvre pas la modification des conférences d'un autre organisateur (la modération le peut déjà).
- La rémunération (étape D) s'appuiera sur ce propriétaire.


## Étape D — Rémunération des chaînes (« comme YouTube »)

### D.1 Description
Chaque mois, **une part des abonnements encaissés est répartie entre les chaînes selon le temps passé à regarder leurs conférences**.
```
cagnotte  = encaissé du mois (hors taxes, net des remboursements) × (100 − frais %) × part %
une chaîne = cagnotte × temps de visionnage de la chaîne ÷ temps de visionnage total
```
Valeurs de départ : **part 55 %** (comme YouTube), **frais de paiement 3 %**, **seuil de paiement 20 €**, plafond de **8 h par membre et par jour**, visionnage des membres gratuits **compté**. Tout se règle dans **Administration → Paramètres → Rémunération des chaînes** ; la fonction entière s'active dans **Administration → Fonctions → Rémunération des chaînes** (groupe Argent, **désactivée par défaut**).

- **Organisateur** : Studio → **Revenus** : estimation du mois en cours (modifiable tant que le mois n'est pas clôturé), report des mois précédents, heures par chaîne, relevés des mois clôturés avec leur statut (À payer, Payé, Reporté).
- **Administrateur** : Administration → **Rémunération** : choisir un mois, voir encaissé, cagnotte, heures, part de chaque chaîne ; **Clôturer** un mois terminé (montants figés) ; **Exporter en CSV** pour le virement ; **Marquer payé** (avec une note : référence du virement).
- Chaque clôture et chaque paiement sont inscrits au **journal des actions**.

### D.2 Règles de calcul
- **Encaissé** : factures d'abonnement Stripe (`invoice.paid`), montant **hors taxes**. Un remboursement (`charge.refunded`) réduit la facture au prorata. Les essais gratuits (0 €) et les **cartes cadeaux** ne comptent pas.
- **Temps de visionnage** : mesuré **par le serveur** à chaque reprise de lecture (toutes les ~10 s), jamais plus que le temps réel écoulé : sauter à la fin d'une vidéo ne crédite rien. Indépendant des statistiques d'audience anonymes (qui respectent « Do Not Track »). Plafonné par membre et par jour.
- **Attribution** : le temps est crédité à la chaîne dont le nom d'intervenant figure sur la conférence ; le montant revient au **propriétaire** de la chaîne (étape C).
- **Seuil et report** : sous le seuil, ou si la chaîne n'a pas de propriétaire, la somme est **reportée** au mois suivant (et s'additionne). Dès que le total atteint le seuil et qu'un propriétaire existe, la ligne passe à « À payer ».
- Un mois ne se clôture qu'**une fois terminé**. Après clôture, un remboursement ou un changement de réglage ne le modifie plus (à corriger à la main lors du mois suivant si besoin).
- Seul le visionnage **depuis l'activation de la fonction** est compté : activez-la avant le premier jour du mois à rémunérer. Les factures, elles, sont enregistrées dès cette version (même fonction coupée).

### D.3 Prérequis et déploiement
Étapes A, B, C et E1 déployées. **Une migration** (`045_revenue.sql`, automatique). Aucune variable `.env`. Dans Stripe → Développeurs → Webhooks, l'événement **`charge.refunded`** doit être coché (déjà demandé pour les cartes cadeaux) et `invoice.paid` aussi. API puis web :
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` en remplaçant les fichiers.
2. GitHub Desktop : *Commit to main*, puis *Push origin*.
3. DockPanel → Git Deploy : *Redeploy* `majlistv-api` (attendre « running » : la migration s'applique au démarrage), puis `majlistv-web`.
4. Sur le VPS (SSH), réappliquer les limites et vérifier nginx :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
Mise en route : Fonctions → activer « Rémunération des chaînes » → Paramètres → vérifier part, frais, seuil → le mois suivant, Administration → Rémunération → Clôturer → CSV → virements → Marquer payé.

### D.4 Fichiers
API : `migrations/045_revenue.sql`, `src/revenue.js` (calcul, clôture, crédit), `src/routes/revenue.js`, `src/routes/billing.js` (enregistrement des factures et remboursements), `src/routes/library.js` (crédit à la reprise de lecture), `src/settings.js`, `src/featuresList.js`, `tests/test_revenue.py`.
Web : `app/studio/revenue/page.js`, `components/RevenueAdmin.js`, `app/admin/page.js`, `StudioShell.js`, `lib/features.js`, `lib/i18n.js` (fr/en/ar), `globals.css`.

### D.5 Debug
- **Rien n'est compté** : la fonction est-elle activée ? Les membres regardent-ils des conférences dont le champ « Intervenant » est rempli ? (une conférence sans intervenant n'a pas de chaîne).
- **Cagnotte à 0** : aucune facture `invoice.paid` reçue ce mois-là (vérifier le webhook Stripe), ou devise différente de celle du site (seule la devise du site est comptée).
- **Une chaîne reste « Reporté »** : sous le seuil, ou sans propriétaire (Studio → Chaînes pour l'attribuer).
- **Mois impossible à clôturer** : le mois n'est pas terminé, ou déjà clôturé.

### D.6 À savoir (honnêtement)
- **Les versements sont manuels** (virement, CSV puis « Marquer payé »). Un versement automatique (Stripe Connect) est possible plus tard mais demande l'ouverture de comptes pour chaque organisateur.
- **Aspects légaux et fiscaux** (statut des organisateurs, facturation, TVA, déclarations) : à valider avec un comptable avant les premiers versements ; le site calcule, il ne remplace pas ce conseil.
- Les abonnés de l'offre Apprentissage et de l'offre standard comptent de la même façon ; la répartition ne tient pas compte du prix payé par chaque membre.


## Étape E2 — Avatar et bannière des chaînes

### E2.1 Description
- Chaque chaîne peut avoir une **image de profil** (ronde) et une **bannière** (large, format 4 pour 1). Sans image, la page garde la lettre initiale sur fond de couleur et n'affiche aucune bannière.
- **Où elles apparaissent** : en-tête de la page publique `/chaines/<slug>` (bannière, avatar qui la chevauche), liste `/chaines`, Studio → Ma chaîne.
- **Qui les change** : le propriétaire de la chaîne (Studio → **Ma chaîne** → « Choisir une image » / « Retirer »), ainsi que les modérateurs et administrateurs (Studio → Chaînes).
- Les images sont **recadrées au centre et réduites dans le navigateur** (avatar 384×384, bannière 1600×400, JPEG). Formats acceptés : JPEG, PNG, WebP ; 2,5 Mo au plus après réduction ; le serveur vérifie le type réel du fichier.
- Les actions des modérateurs et administrateurs sur les chaînes (nom, propriétaire, images) sont inscrites au **journal des actions**.

### E2.2 Prérequis et déploiement
Étapes A à D déployées (surtout C : chaînes). **Une migration** (`046_channel_images.sql`, automatique). Aucune variable `.env`. Les images sont stockées avec les miniatures : `CSP_STORAGE_ORIGINS` doit déjà contenir l'adresse du stockage (réglage existant, nécessaire aux miniatures). API puis web :
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` en remplaçant les fichiers.
2. GitHub Desktop : *Commit to main*, puis *Push origin*.
3. DockPanel → Git Deploy : *Redeploy* `majlistv-api` (attendre « running » : la migration s'applique au démarrage), puis `majlistv-web`.
4. Sur le VPS (SSH), réappliquer les limites et vérifier nginx :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### E2.3 Interrupteur
Les images font partie de la fonction **Chaînes** (Administration → Fonctions) : coupée, elles disparaissent avec les pages de chaîne.

### E2.4 Fichiers
API : `migrations/046_channel_images.sql`, `src/channels.js` (`channelImages`), `src/routes/channels.js` (envoi, retrait, listes), `src/routes/seo.js`, `src/audit.js`, `tests/test_channel_images.py`.
Web : `components/ChannelAvatar.js`, `components/ChannelImages.js`, `components/ChannelClient.js`, `app/chaines/page.js`, `app/chaines/[slug]/page.js`, `app/studio/channel/page.js`, `lib/i18n.js`, `globals.css`.

### E2.5 Debug
- **Image envoyée mais invisible** : vérifier `CSP_STORAGE_ORIGINS` (la console du navigateur signale un blocage CSP).
- **« Impossible de lire cette image »** : fichier non JPEG/PNG/WebP (HEIC d'iPhone par exemple) ; l'exporter en JPEG.
- **Ancienne image encore affichée** : les liens d'images sont temporaires et mis en cache 1 minute côté API ; recharger la page.

### E2.6 À savoir
- Pas de recadrage manuel : l'image est centrée automatiquement. Choisir une bannière dont le sujet est au centre.
- L'image de la chaîne n'est pas encore utilisée comme aperçu de partage (réseaux sociaux) : les liens d'images sont temporaires.
- L'harmonisation visuelle complète du Studio et de l'Administration n'est pas incluse ici ; elle sera traitée avec l'étape F (mobile et accessibilité).


## Étape F — Mobile et accessibilité

### F.1 Ce qui a été corrigé
Une page « trop large » sur téléphone est une page où un élément dépasse l'écran : le navigateur la réduit alors pour tout afficher. Un audit automatique (360 et 390 px, 58 pages dont Studio et Administration) avec des contenus volontairement très longs a trouvé et corrigé :
- **Page d'une conférence** : un titre de série ou un mot très long (adresse, nom sans espace) pouvait élargir toute la page (jusqu'à 1900 px). Les textes passent maintenant à la ligne et les colonnes de la page ne peuvent plus être élargies par leur contenu.
- **Administration → Journal des actions** : les routes longues élargissaient la page.
- **Tableaux** (Administration : utilisateurs, cartes cadeaux, rémunération ; Studio : revenus, statistiques) : sur téléphone, chaque ligne devient une **fiche** « Colonne : valeur » au lieu d'un tableau à faire défiler de côté. Mécanisme général : les tableaux futurs en profitent s'ils utilisent les classes existantes (`adm-table`, `st-table`, `studio-table`).
- **Studio → Mes conférences** : la case de sélection (modification en lot) n'écrase plus le titre ; la vignette passe au-dessus du titre sur petit écran.
- **Zones tactiles** : boutons, pastilles, onglets et menus d'au moins 44 px de haut sur écran tactile.

### F.2 Accessibilité
- **Lien « Aller au contenu »** (premier élément atteint au clavier, visible au focus).
- Chaque page a une zone principale (`<main>`) : accueil, vitrine et liste des séries en manquaient.
- Champs de l'Administration → Paramètres reliés à leur étiquette (lecteurs d'écran) ; liens sans texte (« Voir le site » en menu réduit) nommés ; tableau défilant du tableau de bord accessible au clavier.
- Contrastes : badges non obtenus (Apprentissage) et comptes suspendus (Administration) plus lisibles.
- Audit axe-core (WCAG 2 A/AA) sur 18 pages : plus aucune erreur critique ni grave. Reste un avertissement mineur d'ordre des titres sur la liste des séries (titre de carte en `h3` sous le `h1`).

### F.3 Déploiement
Aucune migration, aucun `.env`, **web uniquement** :
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` en remplaçant les fichiers.
2. GitHub Desktop : *Commit to main*, puis *Push origin*.
3. DockPanel → Git Deploy : *Redeploy* `majlistv-web` uniquement (l'API ne change pas).
4. Sur le VPS (SSH), réappliquer les limites et vérifier nginx :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
Vérifier ensuite sur votre téléphone : une conférence, Ma bibliothèque, Studio → Mes conférences, Administration → Utilisateurs.

### F.4 Outils
`ops/audit-mobile/` : les deux scripts d'audit (voir son README) à relancer après chaque évolution de l'interface.

### F.5 À savoir
- Les tableaux se transforment en fiches **en dessous de 700 px** ; au-dessus, ils gardent le défilement latéral si nécessaire.
- L'audit a été fait avec Chromium : un essai sur un vrai iPhone (Safari) reste conseillé ; si une page vous semble encore large, notez son adresse et l'appareil.

## Étape G — Fidélité à la maquette

Ce qui change (front-end uniquement, **aucune migration, aucune variable d'environnement nouvelle**) :

| Point | Détail |
|---|---|
| Texte blanc | `--text` passe de `#FCF7F0` (blanc cassé) à `#FFFFFF` ; `--text-2` éclairci (`#EDE6DA`). |
| Menu latéral repliable | Bouton « Réduire le menu » en haut du menu membre **et** du menu Studio/Administration. Replié = rail d'icônes (68 px membre, 76 px Studio) avec infobulle au survol. Le choix est mémorisé dans le navigateur (`localStorage`, clé `ms-collapsed`, partagée membre/Studio). Par défaut : ouvert à partir de 1280 px, replié en dessous. Sur téléphone (≤ 900 px) : rien ne change, menu ☰ + barre du bas. |
| Citation du jour | Bandeau compact doré (dégradé, liseré, grand guillemet, texte arabe en or clair, texte français en blanc). |
| Espace Apprentissage | Refait selon la maquette : « Bonjour Prénom, reprenons votre apprentissage », onglets **Tableau de bord / Parcours / Révisions (pastille du nombre à revoir) / Mon bilan / Attestations**, carte « Reprendre le cours » (affiche, catégorie, progression, minutes restantes), anneau « Votre parcours », carte « À réviser aujourd'hui », trois raccourcis (continuer le parcours, quiz à passer ou catalogue, historique), bandeau « Mon bilan personnel » (objectif de la semaine), puis score, courbe et badges. |
| Vitrine visiteur | Bannière d'en-tête : image de fond (image de bannière définie dans Admin → Accueil si mode « personnalisé », sinon affiche de la conférence à la une, sinon affiche de la conférence d'exemple) avec voile dégradé, titre en dégradé or, pastilles Regarder / Comprendre / Retenir / Mettre en pratique, boutons, et carte de la conférence d'exemple à droite (dessous sur téléphone). |

### Déploiement
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` en remplaçant les fichiers.
2. GitHub Desktop : *Commit to main*, puis *Push origin*.
3. DockPanel → Git Deploy : *Redeploy* `majlistv-web` uniquement (l'API ne change pas).
4. Sur le VPS (SSH), réappliquer les limites et vérifier nginx :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
5. Vider le cache du navigateur (Ctrl + F5) pour charger le nouveau CSS.

### Vérification rapide
- Membre connecté sur ordinateur : cliquer « Réduire le menu », recharger la page → le menu reste réduit.
- `/learning` : les 5 onglets ; sans activité, la carte « Commencez votre première conférence » s'affiche à la place de « Reprendre ».
- Visiteur déconnecté sur `/` : bannière avec image (si une conférence a une affiche).

### Débogage
- Le menu ne se replie pas : vérifier que le navigateur autorise le stockage local (en navigation privée, l'état n'est pas mémorisé mais le bouton fonctionne).
- Bannière sans image : aucune affiche disponible → fond dégradé or (comportement prévu). Ajouter une image dans Admin → Accueil (mode personnalisé) ou une affiche à la conférence à la une.

## Étape I1 — Apparence réglable (Admin → Apparence)

Première étape du « socle no-code » : les couleurs, polices, arrondis et espacements du site se règlent depuis l'administration, sans toucher au code ni redéployer.

### Ce qui change

| Point | Détail |
|---|---|
| Nouvelle page | **Administration → Apparence** (menu latéral, entre Journal des actions et Fonctions). Réservée au rôle admin. |
| 98 réglages | En 16 groupes : couleurs de base, polices et taille du texte, arrondis, espacements et largeur, en-tête, menu latéral, barre du bas (téléphone), menu du Studio, boutons, cartes et panneaux, badges, champs, onglets, pied de page, citation du jour, espace Kids. |
| Réglages liés | Un réglage de famille (ex. « Fond du bouton principal ») peut reprendre une couleur de base (« = Couleur principale ») avec une opacité. Changer l'or change alors tous les éléments liés d'un coup. |
| Brouillon → aperçu → publier | Chaque changement part dans un brouillon (enregistré tout seul après 1 s). L'aperçu affiche une **vraie page du site** au choix (accueil, bibliothèque, Apprentissage, Kids…, ou n'importe quelle adresse), en largeur téléphone 390 / tablette 768 / petit écran 1024 / grand écran 1440, et en FR / EN / AR. Les visiteurs ne voient rien avant « Publier ». |
| Historique | Chaque publication est gardée (50 dernières par thème). « Recopier dans le brouillon » remet une ancienne version en brouillon, à vérifier puis publier. |
| Plusieurs thèmes | Créer un thème (copie), renommer, activer (un seul actif), supprimer (jamais l'actif), exporter / importer un fichier JSON. |
| Lisibilité | Alerte automatique quand un texte devient peu lisible sur son fond (règle WCAG : 4,5:1 ; 3:1 pour les textes d'exemple des champs), avec lien vers le réglage. Confirmation demandée avant de publier malgré une alerte. |
| Polices | Polices intégrées (DM Sans, Montserrat, Fredoka, Noto Sans Arabic, Noto Kufi Arabic, police de l'appareil, Serif) + **import de vos polices** (WOFF2, WOFF, TTF, OTF, 2 Mo max), hébergées sur votre stockage Garage et servies par le site : aucun appel à Google (RGPD). Une police utilisée par un thème ne peut pas être supprimée. |
| Sécurité | Seules des valeurs contrôlées sont acceptées (codes couleur, longueurs bornées, noms de polices connues) : aucun texte libre n'entre dans la feuille de style. Le fichier de police est vérifié par sa signature, pas par son extension. Toutes les actions sont inscrites au journal des actions. |
| Apparence actuelle | Le thème d'origine (« Mejliss TV (origine) ») reproduit le site à l'identique. Comparaison automatique image par image, avant / après, sur 19 pages (visiteur et membre, 390 et 1440 px, FR et AR) : aucune différence, **sauf l'en-tête sur les pages Kids**, désormais bleu nuit comme le reste de l'espace Kids (il restait noir). |

**Base de données** : migration `047_themes.sql` (tables `themes`, `theme_versions`, `theme_fonts`), appliquée automatiquement au démarrage de l'API.
**Variables d'environnement** : aucune nouvelle.

### Ce qui n'est pas encore réglable (prévu)
- Environ 180 teintes décoratives restent fixes dans `globals.css` : dégradés de la vitrine et de l'espace Apprentissage, couleurs d'état (vert / orange / rouge de l'administration), ombres noires, voiles sur les vidéos, décorations de Kids (étoiles, lettres colorées). Elles deviendront réglables **bloc par bloc** avec les pages en blocs (étape I3) et le mode édition sur la page (étape I5).
- La couleur d'un élément précis sur une page précise : étapes I3 et I5.
- Les textes : étape I2.

### Fichiers
| Fichier | Rôle |
|---|---|
| `api/migrations/047_themes.sql` | Tables des thèmes, de l'historique et des polices ; thème d'origine actif. |
| `api/src/themeCss.js` **et** `web/lib/themeCss.js` | Liste des réglages, validation, fabrication de la feuille de style, calcul du contraste. **Deux copies identiques** (le test le vérifie) : toute modification se fait dans les deux. |
| `api/src/routes/appearance.js` | Routes `/theme`, `/theme/fonts/:id` (publiques) et `/admin/themes…`, `/admin/theme/fonts…` (admin). |
| `web/lib/theme.js` | Lecture du thème actif côté serveur (gardé 10 s en mémoire). |
| `web/app/layout.js` | Injecte le thème dans chaque page (`<style id="theme-vars">`), couleur de barre d'adresse = fond du thème. |
| `web/components/AppearanceAdmin.js` | Page Administration → Apparence. |
| `web/app/globals.css` | Couleurs de base remplacées par les réglages (96 remplacements), nouveaux réglages déclarés en tête, bloc « Étape I1 » à la fin qui branche chaque famille d'éléments. |
| `web/middleware.js` | `frame-src 'self'` ajouté à la CSP (l'aperçu affiche une page du site dans un cadre). |
| `api/src/features.js` | `/theme` reste accessible pendant la maintenance. |
| `api/tests/test_theme.py` | 47 vérifications. |

### Déploiement
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` en remplaçant les fichiers.
2. GitHub Desktop : *Commit to main*, puis *Push origin*.
3. DockPanel → Git Deploy : *Redeploy* **`majlistv-api` d'abord** (la migration 047 s'applique au démarrage), puis **`majlistv-web`**. Le worker ne change pas.
4. Sur le VPS (SSH) :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
5. Vérifier l'API et la migration :
```bash
curl -s https://api-majlisstv.le-publicitaire.fr/health
curl -s https://api-majlisstv.le-publicitaire.fr/theme | head -c 200; echo
docker logs --tail 50 dockpanel-git-majlistv-api 2>&1 | grep -i "047_themes"
```
La deuxième commande doit afficher `{"version":"…","css":":root{--bg:#0B0906;…`.

6. Dans le navigateur : Ctrl + F5 sur le site, puis Administration → Apparence.

### Exemples d'utilisation
- **Changer l'or du site** : Apparence → Couleurs de base → « Couleur principale (or) » → choisir la couleur → regarder l'aperçu (boutons, liens, badges Premium suivent) → Publier.
- **Boutons carrés** : Arrondis → « Arrondi des boutons » → 6 px → Publier.
- **Police arabe personnelle** : Polices et taille du texte → Polices importées → nom « Amiri », fichier `.woff2` → Importer → « Police du texte (arabe) » = Amiri → aperçu en AR → Publier.
- **Thème du Ramadan** : Plus → Nouveau thème (copie) → régler → Publier → « Activer sur le site » le jour venu ; réactiver « Mejliss TV (origine) » ensuite.
- **Revenir en arrière** : Historique → « Recopier dans le brouillon » sur la bonne date → Publier.

### Tests
Prérequis : API sur le port 3055, PostgreSQL de test 5544, stockage S3 de test (moto, bucket `majlis-videos`).
```bash
python3 api/tests/test_theme.py
```
47 vérifications : lecture publique, droits (visiteur, membre, admin), refus des valeurs invalides (dont tentative d'injection CSS), brouillon invisible, publication, activation, un seul thème actif, historique et restauration, import JSON, polices (format vérifié, doublon, service du fichier, @font-face, police utilisée non supprimable), journal des actions, maintenance, retour exact à l'apparence d'origine, et égalité des deux copies de `themeCss.js`. `test_home.py` et `test_features.py` repassés sans erreur.

Testé aussi dans un vrai navigateur (Chromium) : page Apparence à 1440 px et à 390 px en arabe (aucune page plus large que l'écran, aucune erreur JavaScript), aperçu en direct, alertes de lisibilité, publication visible sur le site en moins de 10 s, couleurs Kids, arrondi et police des boutons.
**Non testé** : Safari / iPhone et Firefox réels ; l'aperçu à 768 et 1024 px n'a été vérifié qu'à l'œil sur les captures.

### Débogage
- **La page Apparence affiche « Chargement… » sans fin** : l'API n'a pas appliqué la migration 047 → `docker logs --tail 100 dockpanel-git-majlistv-api` et chercher `047_themes` ou une erreur SQL.
- **L'aperçu reste vide** : la CSP de `majlistv-web` n'est pas à jour (il faut `frame-src 'self'`). Vérifier :
```bash
curl -sI https://majlisstv.le-publicitaire.fr/ | grep -i content-security-policy | grep -o "frame-src[^;]*"
```
- **Publié mais le site ne change pas** : attendre 10 secondes puis Ctrl + F5 ; vérifier que le thème modifié est bien « actif » (sinon « Activer sur le site »).
- **Une police importée ne s'affiche pas** : tester `https://majlisstv.le-publicitaire.fr/api/theme/fonts/<id>` (doit télécharger le fichier) ; vérifier que la licence et le fichier sont corrects (un WOFF2 converti avec un outil en ligne peut être abîmé).
- **Tout casser par erreur** : Apparence → choisir « Mejliss TV (origine) » → Historique → recopier la première version → Publier ; ou, en dernier recours, sur le VPS :
```bash
docker exec -it postgres-majlisstv psql -U majlis -d majlis -c "UPDATE themes SET is_active = (name = 'Mejliss TV (origine)');"
docker restart dockpanel-git-majlistv-api
```
(Adapter `-U` et `-d` à vos valeurs `POSTGRES_USER` et `POSTGRES_DB`.)

## Étape I2 — Textes modifiables (Admin → Textes)

### Description
Tous les textes du site (1 571 intitulés × français, anglais, arabe) se modifient depuis **Admin → Textes**, sans toucher au code ni demander une mise à jour. Les textes d'origine restent dans `web/lib/i18n.js` ; la base ne garde que ce qui a été changé (table `site_texts`, une ligne par clé et par langue). Le site superpose les textes modifiés aux textes d'origine à chaque page, au plus tard 10 secondes après l'enregistrement. « Rétablir l'original » supprime la modification.

Dans la page :
- recherche (sans tenir compte des accents ni des majuscules) dans les clés, les textes actuels et les textes d'origine ;
- filtres : page ou zone du site, langue (une seule ou les trois), « seulement les textes modifiés » ;
- 40 textes par page ; chaque texte montre ses trois langues côte à côte (l'un sous l'autre sur téléphone), l'arabe s'écrit de droite à gauche ;
- les modifications s'accumulent, puis **Enregistrer** (ou Ctrl/Cmd + S) les envoie d'un coup ; **Annuler** les abandonne ; la page prévient si on la quitte avec des modifications non enregistrées ;
- protection : un texte ne peut pas être vide, et les mots entre accolades (`{n}`, `{date}`…) doivent rester, car le site y met un nombre, un nom ou une date ;
- menu « Plus » : exporter les modifications (fichier JSON), importer un fichier JSON (il remplit les modifications en attente, à vérifier puis enregistrer), tout rétablir à l'origine.

Les textes sont du **texte brut** : du HTML tapé dans un texte s'affiche tel quel, il n'est jamais interprété.

### Fichiers
- `api/migrations/048_site_texts.sql` : table `site_texts` ;
- `api/src/routes/texts.js` : `GET /texts` (public), `GET/PUT/DELETE /admin/texts` (administrateur) ;
- `api/src/features.js` : `/texts` reste lisible en mode maintenance ;
- `web/lib/texts.js` : lecture des textes modifiés et fusion avec le dictionnaire ;
- `web/app/layout.js`, `web/app/books/page.js`, `web/app/attestation/[code]/page.js` : utilisent le dictionnaire fusionné ;
- `web/components/TextsAdmin.js`, `web/app/admin/page.js`, `web/components/StudioShell.js` : page Admin → Textes et entrée de menu ;
- `web/lib/i18n.js` : nouveau texte `admTexts` (nom du menu) ; `web/app/globals.css` : styles `.tt-*` ;
- `api/tests/test_texts.py` : 29 contrôles.

### Prérequis
Aucun nouveau réglage, aucune nouvelle variable `.env`. Aucune dépendance ajoutée.

### Déploiement (DockPanel + GitHub Desktop)
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` (remplacer les fichiers), puis GitHub Desktop : **Commit to main**, **Push origin**.
2. DockPanel → Git Deploy → **Redeploy `majlistv-api`** en premier (la migration 048 s'applique au démarrage), puis **`majlistv-web`**. Le worker ne change pas.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Vérifier que ça marche
```
curl -s https://api-majlisstv.le-publicitaire.fr/texts
```
Doit répondre `{"version":"…","texts":{"fr":{},"en":{},"ar":{}}}` tant qu'aucun texte n'est modifié. Ensuite : Admin → Textes, chercher `heroEyebrow`, changer le français, Enregistrer, recharger le site (déconnecté) dans les 10 secondes : le nouveau texte apparaît ; « Rétablir l'original » le fait disparaître.

### Exemples d'utilisation
- Changer la signature du site : chercher « Des conférences qui éclairent », modifier les trois langues, Enregistrer.
- Corriger une traduction arabe : filtrer la langue « العربية », chercher le mot, corriger, Enregistrer.
- Sauvegarder ses textes avant une grosse modification : Plus → Exporter.

### Tests
Depuis la racine du dépôt, avec l'API (port 3055) et la base de test (5544) démarrées : `python3 api/tests/test_texts.py` (29 contrôles : droits, validation, remplacement, rétablissement, journal, maintenance). Les tests de l'étape I1 (`test_theme.py`), `test_features.py` et `test_home.py` passent toujours. Interface testée dans Chromium (1440 px et 390 px, français et arabe). Pas testé : Safari / iPhone réels, Firefox.

### Dépannage
- **Le texte modifié n'apparaît pas** : attendre 10 secondes puis recharger ; vérifier `curl …/texts` (le texte doit y figurer). Si `/texts` répond mais pas le site, vérifier que `majlistv-web` a été redéployé et que `API_URL` du site pointe vers l'API.
- **« Enregistrement impossible »** : session administrateur expirée (se reconnecter) ou texte refusé (vide, trop long : 2000 caractères maximum).
- **Un texte de la page reste inchangé** : il est peut-être écrit directement dans le code et non dans le dictionnaire ; il n'est alors pas modifiable ici (à signaler pour l'ajouter au dictionnaire).
- **Retour à l'origine d'un coup** : Plus → Tout rétablir à l'origine.

## Étape I3 — Pages en blocs (Admin → Pages)

### Description
Depuis **Admin → Pages**, on crée de nouvelles pages et on compose chaque page avec des blocs, sans toucher au code. Deux usages :
- **Pages créées** : adresse `/p/<nom>` (ex. `/p/ramadan-2027`), ajoutées automatiquement au plan du site (`sitemap.xml`) tant qu'elles sont en ligne ;
- **Blocs sur une page existante** : des blocs affichés **avant** et/ou **après** le contenu habituel d'une page du site (Accueil, Tarifs, Bibliothèque…, adresse exacte). Le contenu habituel reste en place. L'administration, le Studio et l'espace Kids ne peuvent pas recevoir de blocs.

**Les 12 types de blocs** : bannière (titre, texte, 2 boutons, image de fond), titre, texte (gras, italique, liens, listes), image, bouton, cartes (2 à 4 colonnes), rangée de conférences (les plus récentes ou d'une catégorie), citation, questions fréquentes, vidéo YouTube/Vimeo (intégration sans cookies), espace, séparateur.

**Réglages de chaque bloc** :
- *Contenu* : textes en français, anglais et arabe (une langue à la fois ; des pastilles montrent les langues remplies ; à défaut, le français s'affiche) ;
- *Affichage* : appareils (téléphone ≤ 700 px, tablette 701–1024 px, ordinateur ≥ 1025 px) et public (tout le monde, visiteurs non connectés, membres connectés, abonnés, membres sans abonnement) ;
- *Style* : couleur du texte et du fond (couleurs du thème, qui suivent Admin → Apparence, ou code libre), alignement, largeur du contenu, espaces au-dessus et en dessous, arrondi.

**Fonctionnement** : comme pour l'apparence, un **brouillon** est enregistré tout seul une seconde après chaque modification ; l'**aperçu** montre la page à la taille de l'appareil choisi (un clic sur un bloc de l'aperçu l'ouvre dans l'éditeur) ; **Publier** met en ligne (et garde la version dans l'**historique**, 20 versions) ; **Mettre hors ligne** retire la page sans rien perdre. Les images se téléversent dans la bibliothèque (PNG, JPEG, WebP, GIF, 3 Mo ; les fichiers SVG sont refusés).

**Public et confidentialité** : un bloc réservé à un public n'est jamais écrit dans le code source de la page pour les autres : le serveur n'envoie que les blocs « tout le monde », puis le navigateur charge les blocs adaptés à la personne connectée. C'est un **ciblage d'affichage**, pas une protection : pour réserver une vidéo, utilisez l'abonnement.

**Sécurité** : les textes sont du texte brut (du HTML tapé s'affiche tel quel, jamais interprété) ; les adresses doivent commencer par `/`, `https://`, `mailto:` ou `tel:` (`javascript:` et `//` sont refusés) ; les images viennent uniquement de la bibliothèque ; les vidéos uniquement de YouTube/Vimeo ; les couleurs sont des codes hexadécimaux ou des couleurs du thème ; tout est revérifié par l'API à chaque enregistrement.

### Fichiers
- `api/migrations/049_site_pages.sql` : tables `site_pages`, `site_page_versions`, `site_page_media` ;
- `api/src/blocks.js` et `web/lib/blocks.js` : **deux copies identiques** (types de blocs, validation) — un test vérifie l'égalité ; si vous en modifiez une, copiez-la sur l'autre ;
- `api/src/routes/pages.js` : routes publiques (`/pages/slots`, `/pages/view`, `/pages/public-list`, `/pages/media/:id`) et d'administration (`/admin/pages…`, `/admin/page-media…`) ;
- `api/src/features.js` : ces pages restent lisibles en mode maintenance ; `api/src/index.js` : enregistrement des routes + réglage facultatif `RATE_LIMIT_MAX` (limite de requêtes par minute, 100 par défaut ; sert aux tests) ;
- `web/components/PageBlocks.js` (rendu des blocs et des emplacements), `web/app/p/[slug]/page.js` (pages créées), `web/app/pb-preview/` (aperçu), `web/lib/pages.js`, `web/app/layout.js` (emplacements autour de chaque page), `web/app/sitemap.js` ;
- `web/components/PagesAdmin.js` et `web/components/PageFields.js` : l'éditeur ; `web/components/StudioShell.js`, `web/app/admin/page.js`, `web/lib/i18n.js` (entrée de menu « Pages ») ;
- `web/app/globals.css` : styles `.pb-*` (blocs) et `.pe-*` (éditeur) ;
- `api/tests/test_pages.py` : 108 contrôles.

### Prérequis
Aucune nouvelle variable `.env`, aucune dépendance. Les images utilisent le stockage Garage déjà en place (dossier `site/pages/`).

### Déploiement (DockPanel + GitHub Desktop)
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` (remplacer les fichiers), puis GitHub Desktop : **Commit to main**, **Push origin**.
2. DockPanel → Git Deploy → **Redeploy `majlistv-api`** en premier (la migration 049 s'applique au démarrage), puis **`majlistv-web`**. Le worker ne change pas.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Vérifier que ça marche
```
curl -s https://api-majlisstv.le-publicitaire.fr/pages/slots
```
Doit répondre `{"version":"…","slots":{}}` tant qu'aucun bloc n'est publié. Ensuite : Admin → Pages → « Nouvelle page » (titre « Test »), « + Ajouter un bloc » → Bannière, tapez un titre, attendez « Brouillon enregistré », **Publier**, puis ouvrez `https://majlisstv.le-publicitaire.fr/p/test` (déconnecté) : la bannière s'affiche. « Plus → Mettre hors ligne » la retire (page « introuvable »).

### Exemples d'utilisation
- **Page de campagne** : Nouvelle page « Ramadan 2027 » → Bannière + Rangée de conférences d'une catégorie + Questions fréquentes → Publier → partager `/p/ramadan-2027`.
- **Bandeau sur Tarifs** : « Blocs sur les pages existantes » → Tarifs → zone « Avant » → Titre + Texte « Offre de rentrée » → Publier.
- **Message pour les nouveaux** : un bloc Texte avec public « Visiteurs non connectés » sur la page d'accueil, et un autre « Membres connectés » pour les inscrits.
- **Bloc seulement sur téléphone** : onglet Affichage → décocher Tablette et Ordinateur.

### Tests
Depuis la racine du dépôt, avec l'API (port 3055) et la base de test (5544) démarrées, et `RATE_LIMIT_MAX=5000` dans l'environnement de l'API de test : `python3 api/tests/test_pages.py` (108 contrôles : droits, validation et refus d'adresses/couleurs dangereuses, images, publication, public visiteur/membre/abonné, emplacements, historique, hors ligne, maintenance). Les tests des étapes précédentes passent toujours. Interface testée dans Chromium : création, aperçu à 390 et 1440 px, arabe, envoi d'image, visibilité par appareil, publication, emplacement sur `/pricing`, navigation sans rechargement, téléphone 390 px. Pas testé : Safari / iPhone réels, Firefox, lecture réelle des vidéos YouTube/Vimeo (réseau bloqué dans l'environnement de test).

### Dépannage
- **La page ne s'affiche pas (« introuvable »)** : elle n'est pas publiée ou elle est hors ligne (badge « En ligne » dans l'éditeur), ou l'adresse a changé.
- **Un bloc n'apparaît pas sur le site** : vérifier l'onglet Affichage (appareil, public) ; l'aperçu l'affiche toujours avec une étiquette.
- **Le bloc ajouté à une page existante n'apparaît pas** : attendre 10 secondes, recharger ; après une navigation sans rechargement d'une session très ancienne, un rechargement est parfois nécessaire.
- **« Certains blocs sont incomplets » à la publication** : un bloc Image sans image, une Vidéo sans adresse ou une rangée « d'une catégorie » sans numéro ; le bloc concerné est entouré en rouge.
- **Aperçu vide** : l'aperçu est une page du site chargée dans un cadre ; si la CSP a été modifiée, vérifier que `frame-src` contient `'self'` (voir étape I1).
- **Image impossible à supprimer** : elle est encore utilisée par une page (le message dit laquelle). Les anciennes versions de l'historique peuvent encore y faire référence : une version restaurée dont l'image a été supprimée affiche un emplacement vide.

## Étape H — Accueil des membres en blocs (Admin → Pages → Accueil des membres)

### Description
L'accueil que voient les membres connectés (et tout le monde si la vitrine visiteurs est coupée) peut être recomposé avec des blocs, dans l'ordre voulu, avec visibilité par appareil et par public. Le modèle de départ suit la maquette « Main » :
1. **À la une + Reprendre** : la conférence mise à la une (Admin → Conférences → « À la une » ; plusieurs défilent, ou une seule fixe) et, à droite, la carte « Reprendre » (dernière conférence en cours, temps restant). Sans conférence à la une, la plus récente est proposée.
2. **Ma progression** ×2 : « À réviser aujourd'hui » et « Quiz à rattraper » (un 3e choix, « Continuer à regarder », existe). Invisibles si la personne n'a rien.
3. **Conférences** « Nouveautés ».
4. **Chaînes à suivre** : bouton Suivre / Suivi ✓ ; ordre au choix (non suivies d'abord, plus suivies, alphabétique).
5. **Collections** (cycles, séries d'un intervenant, thèmes du moment).
6. **Séries**, **Rangées par catégorie** (« Pour vous » d'abord) et **Bande Espace Kids** : ce que l'accueil d'origine affichait déjà.
7. **Citation du jour** (grand cadre ou compacte).

Ces blocs « données du site » se mettent à jour seuls, se taisent quand ils n'ont rien à montrer, et sont disponibles dans n'importe quelle page en blocs (rubrique « Données du site » du choix de bloc). Les titres se changent dans le bloc (par langue) ou dans Admin → Textes (groupe « Accueil membre (blocs) »).

**Sécurité de repli** : tant que « Accueil des membres » n'est pas publié, ou s'il est supprimé ou mis hors ligne, l'accueil d'origine s'affiche, comme avant. Les visiteurs non connectés gardent la vitrine tant qu'elle est activée (Admin → Fonctions).

### Fichiers
- `api/migrations/050_site_pages_home.sql` : autorise le type de page `home` (adresse interne `/_home`) ;
- `api/src/blocks.js` + `web/lib/blocks.js` (deux copies identiques) : 8 types de blocs, `homeTemplate()`, champs « Tout voir » du bloc Conférences ;
- `api/src/routes/pages.js` : création de l'accueil (`POST /admin/pages {"kind":"home"}`), un seul possible ; `api/src/routes/home.js` : `GET /home/featured` ;
- `web/components/HomeBlocks.js` (les 8 blocs), `web/components/PageBlocks.js` (`HomeBlocks`), `web/app/page.js` (choisit accueil en blocs ou d'origine ; `?cat=ID`), `web/components/PagesAdmin.js` (panneau « Accueil des membres », choix de blocs en deux groupes), `web/lib/i18n.js` (6 textes `hb…`), `web/app/globals.css` (`.hb-*`) ;
- `api/tests/test_home_blocks.py` : 31 contrôles.

### Prérequis
Aucune nouvelle variable `.env`, aucune dépendance.

### Déploiement (DockPanel + GitHub Desktop)
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` (remplacer les fichiers), puis GitHub Desktop : **Commit to main**, **Push origin**.
2. DockPanel → Git Deploy → **Redeploy `majlistv-api`** (migration 050), puis **`majlistv-web`**. Le worker ne change pas.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Vérifier que ça marche
```
curl -s https://api-majlisstv.le-publicitaire.fr/home/featured
```
Doit répondre `{"fallback":…,"items":[…]}`. Ensuite : Admin → Pages → **Créer l'accueil à partir du modèle** → regardez l'aperçu → **Publier** → ouvrez `https://majlisstv.le-publicitaire.fr/` connecté : le nouvel accueil s'affiche. Pour revenir à l'ancien : Plus → Mettre hors ligne.

### Exemples d'utilisation
- **Mettre les chaînes avant les nouveautés** : ouvrir le bloc Chaînes, bouton ↑.
- **Message pour les membres sans abonnement** : ajouter un bloc Bannière (public « Membres sans abonnement ») en haut.
- **Moins de rangées sur téléphone** : onglet Affichage d'un bloc → décocher Téléphone.

### Tests
API (avec `RATE_LIMIT_MAX=5000`) : `python3 api/tests/test_home_blocks.py` (31 contrôles), puis les tests des étapes précédentes (relancer `test_pages.py` après ~60 s : limite de connexions). Interface testée dans Chromium : création depuis le modèle, aperçu, publication, À la une, carte Reprendre (« Il vous reste 20 min »), suivi d'une chaîne, ordre « non suivies d'abord », collections, citation, retour à l'accueil d'origine quand la page est hors ligne, `?cat=`, 1440 px, 390 px, arabe (droite à gauche), aucune erreur JavaScript. Pas testé : Safari / iPhone réels, Firefox, grande quantité de chaînes ou de collections.

### Dépannage
- **L'accueil n'a pas changé** : la page doit être publiée et « En ligne » ; attendre 10 secondes, recharger. Un visiteur non connecté voit la vitrine, pas l'accueil membre.
- **Un bloc n'apparaît pas** : il n'a rien à montrer (pas de collection publiée, pas de conférence en cours, Espace Kids coupé, fonction Suivre ou Séries coupée dans Admin → Fonctions).
- **Pas de carte Reprendre** : la personne n'a pas de conférence commencée (plus d'une minute vue, non terminée).
- **« Tout voir » d'une catégorie** : ouvre `/?cat=ID` ; le bouton « retour » de la page ramène à l'accueil.

## Étape I4 — En-tête, menus et pied de page (Admin → Pages → « En-tête, menus et pied de page »)

### Description
Tout ce qui entoure les pages se règle depuis l'administration, sans code :
- **Menu principal** (en-tête ordinateur + menu ☰ du téléphone), **menu latéral des membres** (4 groupes : Découvrir, Mon espace, Compte, Gérer), **barre du bas du téléphone** (5 liens affichés au maximum) et **liens du pied de page** : réordonner (↑ ↓), masquer (case à cocher), changer le texte en FR / EN / AR, ajouter ses propres liens (20 par liste, avec icône pour le menu latéral et la barre du bas), réserver un élément à un appareil (téléphone / tablette / ordinateur) et à un public (tout le monde, visiteurs, membres, équipe).
- **En-tête en 3 zones** (gauche, centre, droite) : logo, menu, loupe, langue, connexion/compte, bouton « S'abonner », plus des liens ou boutons ajoutés. Les éléments ajoutés sont réservés à l'ordinateur par défaut.
- **Pied de page en 2 zones** (gauche, droite) : marque, liens, textes et liens ajoutés ; des blocs (adresse, réseaux, newsletter…) peuvent s'afficher **au-dessus du pied de page**, et une **barre d'annonce** (blocs) tout en haut du site.
- **Garde-fous** : logo et connexion/compte obligatoires dans l'en-tête ; les trois liens légaux (mentions légales, CGV, confidentialité) ne peuvent être ni masqués ni retirés et restent affichés partout ; une fonction coupée dans Admin → Fonctions disparaît toujours des menus ; la barre du bas refuse plus de 5 liens à la publication. Le ciblage par public adapte l'affichage, il ne protège pas un contenu.
- **Sans réglage enregistré, le site est strictement identique à avant.** Page supprimée ou mise hors ligne : retour immédiat aux menus d'origine. Bouton « Rétablir » par partie et « Tout rétablir ».
- Brouillon enregistré tout seul, aperçu en direct (vraie page du site, 390 → 1440 px) avec choix « Aperçu en tant que : moi / visiteur non connecté », historique de 20 publications.

### Fichiers
- `api/migrations/051_site_pages_layout.sql` : autorise le type de page `layout` (adresse interne `/_layout`) ;
- `api/src/navcfg.js` + `web/lib/navcfg.js` (deux copies identiques) : éléments d'origine, valeurs par défaut, validation `cleanNav` ; `api/src/blocks.js` + `web/lib/blocks.js` : zones `topbar` et `footerTop` ;
- `api/src/routes/pages.js` : création `POST /admin/pages {"kind":"layout"}` (une seule), validation souple en brouillon / stricte à la publication, `nav` renvoyée par `/pages/view` ;
- `web/lib/menus.js`, `web/lib/navicons.js`, `web/lib/pages.js` (`siteLayout`), `web/components/` : `Header.js`, `Footer.js`, `MemberShell.js`, `TopBar.js`, `NavLink.js`, `PageBlocks.js` (`LayoutZone`), `Providers.js`, `NavAdmin.js` (éditeur), `PagesAdmin.js` ; `web/app/layout.js`, `web/app/pb-preview/PreviewClient.js`, `web/app/globals.css` ;
- `api/tests/test_layout.py` (validation, publication, droits, repli).

### Prérequis
Aucune nouvelle variable `.env`, aucune dépendance.

### Déploiement (DockPanel + GitHub Desktop)
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` (remplacer les fichiers), puis GitHub Desktop : **Commit to main**, **Push origin**.
2. DockPanel → Git Deploy → **Redeploy `majlistv-api`** (migration 051), puis **`majlistv-web`**. Le worker ne change pas.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Vérifier que ça marche
```
curl -s -o /dev/null -w "%{http_code}\n" "https://api-majlisstv.le-publicitaire.fr/pages/view?path=%2F_layout&ssr=1"
```
Répond `404` tant que rien n'est publié (le site garde ses menus d'origine). Ensuite : Admin → Pages → **Personnaliser l'en-tête, les menus et le pied de page** → modifier → regarder l'aperçu → **Publier** → recharger le site (au plus 10 secondes).

### Exemples d'utilisation
- **Ajouter « Blog » au menu** : onglet Menu principal → « + Ajouter un lien » → texte + adresse.
- **Retirer « Séries » du menu** : décocher la case devant « Séries ».
- **Annonce Ramadan en haut du site** : plus bas, zone « Barre d'annonce » → ajouter un bloc Titre.
- **Bouton « Faire un don » sur ordinateur et tablette** : onglet En-tête → zone Droite → « + Bouton » → cocher Ordinateur et Tablette.
- **Revenir à l'origine** : « Tout rétablir », ou supprimer la page (Plus → Supprimer).

### Tests
API (`RATE_LIMIT_MAX=5000`) : `python3 api/tests/test_layout.py`, puis les tests précédents en laissant ~70 s entre deux fichiers (limite de connexions). Interface testée dans Chromium : en-tête, menus, pied de page, barre d'annonce, aperçu, 390 et 1440 px, arabe (RTL), retour à l'origine hors ligne. **Non testé** : vrai téléphone, lecteurs d'écran.

### Dépannage
- **Rien ne change** : la page doit être publiée et « En ligne » ; attendre 10 secondes, recharger.
- **Publication refusée** : lire le message en rouge (barre du bas > 5 liens, lien sans adresse, lien légal manquant…).
- **Un lien n'apparaît pas** : il est masqué, réservé à un autre appareil ou public, ou sa fonction est coupée dans Admin → Fonctions.
- **Je me suis perdu** : « Tout rétablir ».

### Limites
Les menus sont les mêmes sur tout le site (pas de menu par page) ; le ciblage par public est un affichage, pas une protection ; les icônes sont choisies dans une liste de 14.

## Étape I5 — Mode édition sur la page (administrateur)

### Description
Connecté en administrateur, un bouton **« ✎ Modifier cette page »** apparaît en bas de chaque page du site (pas dans /admin, /studio, /kids, connexion). Une fois le mode actif :
- **Cliquer un bloc** (bannière, titre, texte, cartes, conférences, blocs de l'accueil, barre d'annonce, blocs avant/après une page…) ouvre un panneau avec les mêmes réglages que Admin → Pages : Contenu (FR/EN/AR), Affichage (appareil, public), Style. La page change sous vos yeux ; le brouillon s'enregistre tout seul ; les visiteurs ne voient rien avant **Publier** (qui publie tout le brouillon de cette page).
- **Cliquer un texte du site** (lien de menu, bouton, titre…) ouvre ses trois langues ; **Enregistrer** l'applique comme dans Admin → Textes (visible des visiteurs au plus tard 10 s après) ; **Rétablir l'original** revient au texte du code. Si un même texte sert à plusieurs endroits, une liste de cases permet de choisir lesquels modifier.
- Pendant l'édition, rien ne navigue ni ne se déclenche (liens, boutons). **Terminer** ou la touche Échap ferment le mode / le panneau.
- Les textes qui changent selon la personne ou le contenu (nom, titre d'une conférence, textes à variables {n}) ne sont pas reconnus : le panneau l'indique et renvoie vers Admin → Textes ou Studio.
- Sur téléphone, le panneau s'ouvre en bas de l'écran.

### Fichiers
`web/components/EditMode.js` (barre, panneaux, écouteurs) ; `web/components/Providers.js` (`blockEdits`, `textPatch`) ; `web/components/PageBlocks.js` (`BlocksView` affiche le bloc en cours de modification, `data-pbpath` sur les zones) ; `web/components/PagesAdmin.js` (`MediaPicker` exporté, pour les images) ; `web/app/layout.js` ; `web/app/globals.css`. Aucune modification de l'API ni de la base : le mode réutilise `/admin/pages…` et `/admin/texts`.

### Prérequis
Compte administrateur. Aucune variable `.env`, aucune dépendance, aucune migration.

### Déploiement (DockPanel + GitHub Desktop)
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` (remplacer les fichiers), puis GitHub Desktop : **Commit to main**, **Push origin**.
2. DockPanel → Git Deploy → **Redeploy `majlistv-web`** seulement (l'API et le worker ne changent pas).
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Exemples d'utilisation
- **Changer un titre** : ouvrir la page → « Modifier cette page » → cliquer le titre → modifier → attendre « Brouillon enregistré » → **Publier**.
- **Renommer « Collections » dans le menu** : cliquer le mot dans le menu → changer FR/EN/AR → **Enregistrer**.
- **Cacher un bloc sur téléphone** : cliquer le bloc → onglet Affichage → décocher Téléphone → Publier.

### Tests
Chromium (1440 et 390 px) : bouton absent pour visiteur et membre, présent pour l'administrateur ; clic bloc → panneau, modification instantanée, brouillon API, visiteurs inchangés jusqu'à Publier ; clic texte de menu → 3 langues, enregistrement API, menu mis à jour ; liens inactifs en mode édition ; panneau en bas sur téléphone ; pas de barre dans /admin ; aucune erreur console. Étapes I3, H et I4 revérifiées. **Non testé** : vrai téléphone, lecteur d'écran, Safari/Firefox (la détection du texte sous le clic utilise `caretPositionFromPoint` / `caretRangeFromPoint`).

### Dépannage
- **Pas de bouton** : il faut être connecté avec le rôle administrateur, hors pages /admin, /studio, /kids.
- **« Cette zone n'appartient à aucune page modifiable »** : le bloc vient d'une page dont l'administration n'a pas la fiche ; ouvrir Admin → Pages.
- **Mon texte change sur plusieurs pages** : il est partagé ; décochez les endroits à ne pas toucher dans la liste.
- **Un visiteur ne voit pas ma modification** : publier (blocs) ou attendre 10 secondes (textes), puis recharger.

### Limites
On modifie les blocs existants et leurs textes ; ajouter, déplacer ou supprimer un bloc se fait toujours dans Admin → Pages. Le panneau d'un bloc publie tout le brouillon de la page.

## Étape M1 — Socle des modules (Admin → Modules)

### Description
Une fonction peut maintenant arriver comme un **module** : un dossier `api/src/modules/<nom>/` livré avec le zip, puis redéployé. Il apparaît dans **Admin → Modules** avec sa version, un interrupteur, ses dépendances et ses réglages. Principes :
- **Un module livré est désactivé** tant qu'on ne l'a pas activé (sauf `"defaultEnabled": true` dans sa fiche). Désactivé, toutes ses routes répondent 404 `module_off`. Les données ne sont jamais supprimées.
- **Dépendances** : un module peut en exiger d'autres (`"requires"`) : on ne peut pas l'activer sans eux, ni les couper tant qu'il est actif.
- **Réglages** : déclarés dans la fiche, ils sont validés (nombre, prix, adresse, choix…), les clés secrètes sont chiffrées (variable `SETTINGS_KEY`) et jamais réaffichées. Ils apparaissent aussi dans Admin → Paramètres, sous « Module : <nom> ».
- **Migrations SQL du module** (`migrations/*.sql`) : appliquées une seule fois au démarrage de l'API, dans l'ordre alphabétique. La version installée est mémorisée.
- **Isolation des pannes** : une fiche invalide, une migration qui échoue ou un `index.js` qui plante marque ce module « Erreur » (message lisible dans l'écran) ; le site et les autres modules démarrent normalement.
- **Module pilote : Cartes cadeaux.** Son code (routes, logique, test inchangé) est déplacé dans `api/src/modules/gifts/`. Il est **lié à la fonction « Cartes cadeaux »** : l'interrupteur de Admin → Modules est exactement celui de Admin → Fonctions, et les prix sont réglables des deux côtés (Admin → Paramètres ou Admin → Modules). Comportement des cartes cadeaux inchangé.
- `GET /config` publie maintenant `modules` (`{ "gifts": true, … }`) pour que le site s'adapte.

### Fichiers
`api/src/modules.js` (chargeur, routes `GET /admin/modules` et `PUT /admin/modules/:id`) ; `api/src/index.js` ; `api/migrations/052_modules.sql` (tables `modules` et `module_migrations`) ; `api/src/modules/gifts/` (`module.json`, `index.js`, `routes.js`, `lib.js`, ex-`routes/gifts.js` et `gifts.js`) ; `api/src/routes/billing.js` (import) ; `web/components/ModulesAdmin.js`, `web/app/admin/page.js`, `web/components/StudioShell.js` (entrée de menu « Modules »), `web/lib/i18n.js` (`admModules`) ; `api/tests/test_modules.py` + `api/tests/fixtures/modules/` (modules d'essai).

### Créer un module (pour la suite)
1. Créer `api/src/modules/mon-module/` avec :
   - `module.json` : `{ "id": "mon-module", "name": "Mon module", "version": "1.0.0", "description": "…", "requires": [], "settings": [ { "key": "titre", "type": "text", "label": "Titre", "def": "Bonjour" } ] }` — l'identifiant doit être le nom du dossier. Types de réglage : `text`, `number` (`min`, `max`), `bool`, `select` (`options`), `price`, `url`, `secret`. Un réglage déclaré se range sous la clé `mod_mon_module_titre`. Un module lié à une fonction existante ajoute `"feature": "<id>"` et peut citer par leur clé des réglages existants (`"settings": ["gift_price_1"]`).
   - `index.js` : `export default async function register(app, ctx) { app.get('/mon-module/salut', async () => ({ titre: await ctx.setting('titre') })); }` (`ctx` : `id`, `version`, `enabled()`, `setting(clé)`, `log`).
   - `migrations/001_init.sql` si le module a ses tables (idempotent de préférence : `CREATE TABLE IF NOT EXISTS …`).
2. Livrer, redéployer l'API : le module apparaît **désactivé** dans Admin → Modules ; l'activer, le régler.

### Prérequis
Aucune variable `.env` nouvelle (`SETTINGS_KEY` déjà requise pour les clés secrètes), aucune dépendance.

### Déploiement (DockPanel + GitHub Desktop)
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` (remplacer les fichiers) ; **supprimer les deux anciens fichiers** `api/src/routes/gifts.js` et `api/src/gifts.js` (déplacés dans `api/src/modules/gifts/`) ; GitHub Desktop : **Commit to main**, **Push origin**. (Le commit déjà poussé contient ce déplacement : si vous récupérez le dépôt par GitHub Desktop, rien à supprimer à la main.)
2. DockPanel → Git Deploy → **Redeploy `majlistv-api`** (migration 052), puis **`majlistv-web`**. Le worker ne change pas.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Vérifier que ça marche
Admin → **Modules** : « Cartes cadeaux v1.0.0 » est listé ; son état correspond à celui de Admin → Fonctions. Ou, en ligne de commande, `curl -s https://api-majlisstv.le-publicitaire.fr/config` contient `"modules":{"gifts":…}`. Les cartes cadeaux se comportent comme avant (page « Offrir », activation d'un code, Admin → Cartes cadeaux).

### Tests
Deux API de test : la normale (3055) et une seconde (3056) lancée avec `PORT=3056 MODULES_EXTRA_DIR=api/tests/fixtures/modules`. `python3 api/tests/test_modules.py` : 47 contrôles (droits, module pilote, activation liée aux Fonctions, module livré inactif, migration appliquée une seule fois, module en erreur isolé, dépendances dans les deux sens, réglages et clé secrète chiffrée, journal des actions). `test_gifts.py` (cartes cadeaux, avec le faux Stripe) repasse intégralement. Interface testée dans Chromium (1440 et 390 px). **Non testé** : une vraie livraison par DockPanel d'un second module.

### Dépannage
- **Un module n'apparaît pas** : son dossier doit contenir `module.json` ; vérifier les journaux de `majlistv-api` (« module … : fiche invalide »).
- **« Erreur » sur un module** : le message dit pourquoi (fiche, migration SQL, chargement). Corriger, redéployer.
- **« Absent du code »** : le dossier a disparu (retiré d'une livraison) ; ses routes sont fermées, ses données gardées. Remettre le dossier pour le retrouver.

### Limites (volontaires pour M1)
Les modules ne peuvent pas encore ajouter leurs propres écrans d'administration ni des blocs de pages (à venir avec M2) ; le webhook de paiement Stripe appelle toujours directement la logique des cartes cadeaux ; l'activation d'un module sans « feature » ne masque pas encore les menus du site (`/config` expose `modules` pour le prochain lot).

## Étape M2 (lot 1) — Collections, Listes, Notes et Rémunération en modules

### Description
Quatre fonctions existantes deviennent des modules du socle M1, sans changement de comportement :
| Module | Dossier | Lié à la fonction | Réglages dans Admin → Modules | Écran d'administration |
|---|---|---|---|---|
| Collections | `api/src/modules/collections/` | `collections` | — | Studio → Collections |
| Listes de lecture | `api/src/modules/lists/` | `lists` | — | — |
| Notes sur les conférences | `api/src/modules/notes/` | `notes` | — | — |
| Rémunération des chaînes | `api/src/modules/revenue/` | `revenue` | 6 (part reversée, frais, seuil…) | Admin → Rémunération |
Chacun garde le même interrupteur que dans Admin → Fonctions. Seul le fichier de routes a été déplacé (ex-`api/src/routes/<nom>.js` → `api/src/modules/<nom>/routes.js`) ; les fichiers partagés restent où ils étaient (`api/src/revenue.js` sert aussi à Stripe et à la lecture des vidéos). Les Listes importent la fonction `visibleItems` du module Collections (dépendance de code, pas d'activation : les listes marchent même si Collections est coupé).

Nouveauté du socle : la fiche peut contenir `"admin": { "label": "Ouvrir …", "href": "/admin?tab=revenue" }` ; Admin → Modules affiche alors un lien vers l'écran d'administration du module (Cartes cadeaux et Rémunération en ont un).

**Non converties volontairement** : les citations (leur API démarre des tâches planifiées, il faut d'abord un point d'entrée « démarrage » dans les modules) et les fonctions dont le code est partagé avec beaucoup d'autres (séries, par exemple, importées par 6 fichiers).

### Fichiers
`api/src/modules/{collections,lists,notes,revenue}/` (`module.json`, `index.js`, `routes.js`) ; `api/src/index.js` (imports et enregistrements retirés) ; `api/src/modules.js` (champ `admin`) ; `web/components/ModulesAdmin.js` (lien) ; `api/tests/test_modules.py` (étendu).

### Prérequis, déploiement
Aucune variable, aucune migration, aucune dépendance. Décompresser le zip, **supprimer les 4 anciens fichiers** `api/src/routes/collections.js`, `lists.js`, `notes.js`, `revenue.js` (déjà fait si vous récupérez le dépôt par GitHub Desktop), Commit + Push, puis DockPanel → Redeploy `majlistv-api` puis `majlistv-web`, puis les commandes VPS habituelles :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Vérifier que ça marche
Admin → Modules : 5 modules (Cartes cadeaux, Collections, Listes de lecture, Notes, Rémunération des chaînes), tous en v1.0.0, dont l'état suit Admin → Fonctions. Le site se comporte comme avant.

### Tests
`test_modules.py` étendu (5 modules, état = fonction, réglages de la rémunération, lien d'administration, fermeture et réouverture de `/collections`), puis `test_collections.py` (collections et listes), `test_notes.py`, `test_revenue.py`, `test_features.py` : tous OK. Chromium : écran Modules (8 cartes avec les modules d'essai), lien vers Admin → Rémunération, 1440 et 390 px.

## Étape M2 (complète) — Toutes les fonctions du site en modules

### Description
Après le lot 1, **toutes les fonctions activables** de Admin → Fonctions sont devenues des modules. Admin → Modules en liste 19, chacun en v1.0.0, lié à sa fonction (même interrupteur que Admin → Fonctions), avec ses réglages quand il en a :

| Module (dossier `api/src/modules/…`) | Fonction | Réglages repris dans Admin → Modules | Tâche de fond (`start`) |
|---|---|---|---|
| `gifts` Cartes cadeaux | gifts | 3 prix | — |
| `collections` Collections | collections | — | — |
| `lists` Listes de lecture | lists | — | — |
| `notes` Notes | notes | — | — |
| `revenue` Rémunération des chaînes | revenue | 6 | — |
| `series` Séries et épisodes | series | — | — |
| `books` Ouvrages | books | 3 (taille PDF, lien, téléchargements/jour) | — |
| `quiz` Quiz | quiz | 6 | — |
| `practice` Mise en pratique | practice | 4 | — |
| `revision` Révision espacée | revision | 3 | e-mail quotidien des révisions |
| `selfcheck` Mon bilan personnel | selfcheck | — | rappel hebdomadaire |
| `learning` Parcours et attestations | learning | — | — |
| `channels` Chaînes | channels | — | création des chaînes manquantes |
| `citations` Citation du jour | citations | 7 | reprise d'import du corpus + réapprovisionnement horaire |
| `kids` Mejliss Kids | kids | 5 | rapport hebdomadaire aux parents |
| `showcase` Vitrine visiteur | showcase | — | — |
| `stats` Statistiques d'audience | stats | — | purge des compteurs |
| `follow` Suivre et notifications | follow | 6 (annonces, sélection de la semaine) | alertes et sélection de la semaine |
| `favorites` Favoris | favorites | — | — |

Nouveautés du socle : un module peut exporter `start(app, ctx)` dans son `index.js` (tâches de fond lancées une fois l'API à l'écoute ; une erreur ne bloque pas les autres) ; les favoris ont été sortis de `routes/library.js` (la bibliothèque garde la reprise de lecture).

**Ce qui reste dans le socle (et pourquoi)** : comptes et connexion, catalogue des conférences et lecteur vidéo, envoi / HLS / transcription / traduction / résumés, abonnements et paiement Stripe, recherche, SEO, pages légales, imports YouTube / Vimeo / archive.org, thèmes, outils no-code (apparence, textes, pages, menus), administration (paramètres, fonctions, modules, journal), modération, tableau de bord, accueil. Ce sont les fondations dont tous les modules dépendent ; « Inscription ouverte » et « Mode maintenance » restent des interrupteurs de Admin → Fonctions (ce sont des règles d'accès, pas des fonctions).

**Limite honnête** : ces modules viennent du code d'origine, et le socle appelle encore certaines de leurs fonctions (la page d'une conférence lit le quiz, la mise en pratique et le contrôle parental Kids ; la bibliothèque, la recherche, le SEO et les chaînes lisent les séries ; Stripe et la lecture créditent la rémunération). On peut donc les **activer et désactiver** (données conservées), mais pas **supprimer leur dossier** du dépôt : l'API ne démarrerait plus. Un nouveau module écrit selon le guide de l'étape M1, lui, peut être retiré.

### Fichiers
`api/src/modules/<14 nouveaux dossiers>/` (`module.json`, `index.js`, `routes.js`, et `collect.js` pour les statistiques) — les fichiers de routes ont été **déplacés** depuis `api/src/routes/` (`series`, `books`, `quiz`, `practice`, `reminders` → `revision`, `selfcheck`, `learning`, `channels`, `citations`, `kids`, `showcase`, `stats`, `stats_collect`, `notifications` → `follow`) ; `api/src/modules/favorites/routes.js` (nouveau) ; `api/src/routes/library.js` (favoris retirés) ; `api/src/modules.js` (`startModules`) ; `api/src/index.js` ; chemins d'import mis à jour dans `routes/talks.js`, `themes.js`, `home.js`, `library.js`, `search.js`, `seo.js`, `speakers.js` ; `api/tests/test_modules.py`, `api/tests/test_citations_auto.mjs`.

### Prérequis
Aucune variable, aucune migration, aucune dépendance.

### Déploiement (DockPanel + GitHub Desktop)
**Recommandé : récupérer le dépôt par GitHub Desktop (Fetch / Pull)** : le commit contient les déplacements, rien à supprimer à la main. Avec le zip, il faut en plus supprimer les 14 anciens fichiers de `api/src/routes/` : `series.js`, `books.js`, `quiz.js`, `practice.js`, `reminders.js`, `selfcheck.js`, `learning.js`, `channels.js`, `citations.js`, `kids.js`, `showcase.js`, `stats.js`, `stats_collect.js`, `notifications.js`.
Puis DockPanel → Git Deploy → **Redeploy `majlistv-api`**, puis **`majlistv-web`** (aucun changement de code web dans cette partie, mais le lot 1 en avait). Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Vérifier que ça marche
Admin → Modules : 19 modules, aucun en « Erreur ». Dans DockPanel, les journaux de `majlistv-api` ne doivent contenir aucune ligne « module … : ». Le site se comporte exactement comme avant.

### Tests
- `test_modules.py` (45 contrôles) : 19 modules présents, aucun en erreur (chargement, migrations, tâches de fond), tous liés à leur fonction, plus les contrôles de M1.
- Batterie complète de l'API (49 fichiers de test) relancée. **Tous les tests des fonctions déplacées passent** : séries, ouvrages (une fois corrigé un chemin écrit en dur dans le test), quiz (lecture), révision, bilan, apprentissage, chaînes, Kids (3 suites), vitrine, suivi et notifications, collections, listes, notes, rémunération, cartes cadeaux, ainsi que les tests unitaires des e-mails programmés (révision, bilan, Kids, alertes) et des statistiques.
- 10 tests échouent **à l'identique sur le code d'avant cette étape** (comparaison faite sur la même base de test, code d'avant puis nouveau code) : statistiques (comptage des ouvertures), intervenants (slug arabe), thèmes, modération, publication, accueil, tableau de bord, ouvrages (série liée), conformité, vidéos externes. Ils dépendent de l'état accumulé de la base de test et de services absents ici ; ils ne sont pas causés par les modules, mais restent à examiner sur une base de test neuve.
- Non lancés (services absents ici) : génération des quiz, de la mise en pratique et des citations (traducteur / IA), archive.org, piste audio (worker) ; `test_citations_auto.mjs` demande un corpus importé.
- Chromium : Admin → Modules (22 cartes avec les modules d'essai) à 1440 et 390 px, sans erreur console.

### Dépannage
- **L'API ne démarre plus après la mise à jour** : un ancien fichier `api/src/routes/<nom>.js` est resté alors que son module existe → routes en double. Supprimer les 14 anciens fichiers listés plus haut, Commit, Push, Redeploy.
- **Un module « Erreur » avec « Démarrage impossible »** : sa tâche de fond a échoué (le message dit pourquoi) ; les routes du module restent utilisables.

## Étape M3a — Socle de l'API indépendant des modules

### Description
Avant cette étape, le socle appelait directement le code de 6 modules (10 endroits) et 5 modules s'appelaient entre eux : supprimer un dossier de module empêchait l'API de démarrer. Désormais :
- **Points d'extension** (`api/src/ext.js`) : le socle demande une information sans savoir qui la fournit, avec une réponse de repli si aucun module ne la fournit. Exemple : la fiche d'une conférence demande `talk.quiz` ; sans le module Quiz, la réponse est « pas de quiz ».
- **Événements** : le socle annonce un fait, chaque module intéressé réagit. Exemple : Stripe annonce `stripe.charge.refunded` ; les Cartes cadeaux puis la Rémunération réagissent, dans le même ordre qu'avant et dans la même transaction (une erreur annule tout, comme avant).
- **Code partagé sorti des modules vers le socle** : échéances des engagements (`dueDates.js`, utilisées aussi par les thèmes), fiches de conférences des collections et des listes (`talkCards.js`), format des rappels (`reminderFormat.js`, révision et citations). La logique de la rémunération est passée dans son module (`modules/revenue/lib.js`).
- **Module absent = fonction coupée et masquée** : si le dossier d'un module n'est pas là, sa fonction est considérée comme coupée, disparaît de Admin → Fonctions (impossible de la rallumer) et ses réglages disparaissent de Admin → Paramètres. Le site masque déjà menus et pages des fonctions coupées.

| Point d'extension / événement | Fourni / écouté par | Utilisé par | Réponse sans le module |
|---|---|---|---|
| `talk.quiz` | quiz | fiche conférence, vitrine | pas de quiz |
| `talk.practice` | practice | fiche conférence | pas d'écran « Et maintenant ? » |
| `kids.canSee` | kids | fiche conférence (jeton enfant), statistiques Kids | non (rien n'est visible) |
| `series.list`, `series.episodeLabels`, `series.nextUp` | series | menu, recherche, SEO, bibliothèque, accueil, intervenants, chaînes | aucune série |
| `stripe.checkout.payment` (événement) | gifts | paiement Stripe | rien |
| `stripe.invoice.paid` (événement) | revenue | paiement Stripe | rien |
| `stripe.charge.refunded` (événement) | gifts, revenue | paiement Stripe | rien |
| `watch.progress` (événement) | revenue | enregistrement de la lecture | rien |

Pour qui écrit un module : dans `index.js`, `register(app, ctx)` reçoit `ctx.provide(nom, fonction)` et `ctx.on(événement, fonction)` ; un module autonome (sans `"feature"`) ne répond et ne réagit que s'il est activé dans Admin → Modules. La liste des points d'extension connus est `CATALOG` dans `api/src/ext.js`.

**Ce qui reste** : les modules venus du code d'origine utilisent encore des bibliothèques du socle (accès, réglages, e-mails…), c'est normal (un module dépend du socle, jamais l'inverse). Les écrans web ne sont pas encore modulaires (étape M3b).

### Fichiers
Nouveaux : `api/src/ext.js`, `api/src/dueDates.js`, `api/src/talkCards.js`, `api/src/reminderFormat.js`, `api/tests/test_module_removal.py`. Déplacé : `api/src/revenue.js` → `api/src/modules/revenue/lib.js`. Modifiés : `api/src/index.js`, `modules.js`, `features.js`, `featuresList.js`, `settings.js`, `routes/talks.js`, `billing.js`, `library.js`, `home.js`, `search.js`, `seo.js`, `speakers.js`, `themes.js` ; `index.js` des modules quiz, practice, kids, series, gifts, revenue ; `routes.js` des modules practice, collections, lists, revision, citations, stats (`collect.js`), channels, showcase ; `api/tests/test_modules.py`.

### Prérequis
Aucune variable, aucune migration, aucune dépendance. **Seule l'API change** (pas le site web, pas le worker).

### Déploiement (DockPanel + GitHub Desktop)
Recommandé : GitHub Desktop → **Fetch origin** puis **Pull origin** (le commit contient le déplacement de `revenue.js`). Avec le zip : décompresser dans `C:\Users\agenc\Documents\GitHub\majlistv`, **supprimer `api/src/revenue.js`**, puis **Commit to main** et **Push origin**.
Puis DockPanel → Git Deploy → **Redeploy `majlistv-api`** uniquement. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Vérifier que ça marche
Admin → Modules : 19 modules, aucun en « Erreur » ; le site se comporte comme avant (fiche d'une conférence avec quiz, séries, cartes cadeaux, statistiques…). En ligne de commande :
```
curl -s https://api-majlisstv.le-publicitaire.fr/health
curl -s https://api-majlisstv.le-publicitaire.fr/config
```
La première répond `{"status":"ok"}`, la seconde contient `"modules":{…}` avec les 19 modules.

### Exemples d'utilisation
- **Retirer définitivement une fonction du code** (ex. les Ouvrages) : supprimer le dossier `api/src/modules/books`, Commit, Push, Redeploy `majlistv-api`. La fonction disparaît de Admin → Fonctions et Paramètres, ses routes n'existent plus, ses données restent en base ; remettre le dossier la fait revenir.
- **Écrire un module qui réagit à un remboursement** : dans son `index.js`, `ctx.on('stripe.charge.refunded', async (client, charge) => { … })`.

### Tests
- `test_module_removal.py` : pour chacun des 19 modules, copie de l'API **sans** ce dossier, démarrage, puis 22 vérifications (l'API démarre, fonction coupée et absente de Admin → Fonctions, impossible de la rallumer, route du module disparue, Paramètres et Modules répondent, catalogue, accueil, recherche, SEO, sitemap, reprise de lecture, fiche d'une conférence, enregistrement de la lecture, remboursement Stripe sans erreur, aucune erreur dans le journal) ; puis le **socle seul, sans aucun module**. Résultat : 19 retraits + socle seul, **0 échec**.
- `test_modules.py` étendu (points d'extension et événements déclarés par chaque module).
- Non-régression avec tous les modules : cartes cadeaux, rémunération, séries, Kids (3 suites), quiz, collections et listes, vitrine, chaînes, thèmes, publication, accueil, SEO, apprentissage, révision, bilan, fonctions, ouvrages : OK ; tests unitaires des e-mails programmés et des statistiques : OK. 6 tests (statistiques, tableau de bord, intervenants, modération, conformité, vidéos externes) échouent à l'identique avec le code d'avant cette étape (vérifié côte à côte) : ils dépendent de l'état de la base de test ou de services absents, pas du découplage.
- Le faux Stripe des tests (`tests/mock_stripe.py`) donne désormais des identifiants de session uniques d'un lancement à l'autre.

### Dépannage
- **« Point d'extension … déjà fourni par le module … »** dans Admin → Modules : deux modules fournissent la même information ; en désactiver ou en retirer un.
- **L'API ne démarre plus après la mise à jour par zip** : l'ancien `api/src/revenue.js` est resté ; le supprimer, Commit, Push, Redeploy.

## Étape M3b — Site web modulaire

### Description
La partie web de chaque module est désormais rangée avec lui, et le site s'adapte tout seul aux modules présents :
- **Fiche web du module** : `web/modules/<id>/module.js` (nom, fonctions portées, adresses de ses pages, écrans d'administration, entrées du Studio). Les fiches sont **trouvées automatiquement** à la construction du site : aucune liste à tenir à jour.
- **Pages rangées par module** dans des « groupes de routes » Next.js : `web/app/(module-<id>)/…` et `web/app/studio/(module-<id>)/…`. Le nom entre parenthèses n'apparaît pas dans l'adresse : **toutes les adresses restent identiques** (`/series`, `/gift`, `/studio/quiz`…).
- **Écrans d'administration fournis par les modules** : Cartes cadeaux, Rémunération des chaînes et Statistiques sont maintenant dans leur module (`web/modules/gifts/Admin.js`, `revenue/Admin.js`, `stats/Admin.js`) et chargés à la demande par Admin.
- **Masquage automatique** : une fonction n'est disponible sur le site que si son module est activé côté API **et** que sa partie web est présente. Sinon ses entrées disparaissent des menus (en-tête, menu latéral, barre du bas, Studio, Administration) et ses pages affichent « Cette fonction n'est pas disponible » (ou n'existent plus si le dossier a été retiré).
- **Admin → Modules** indique si les écrans du site d'un module sont présents.

| Module | Pages sur le site | Écran d'administration |
|---|---|---|
| series | /series, /studio/series | — |
| collections | /collections, /studio/collections | — |
| books | /books, /studio/books | — |
| learning | /learning, /attestation | — |
| lists | /lists, /l (lien partagé) | — |
| channels | /chaines, /studio/channel | — |
| kids | /kids | — |
| gifts | /gift, /redeem | Admin → Cartes cadeaux |
| revenue | /studio/revenue | Admin → Rémunération |
| stats | /studio/stats | Admin → Statistiques |
| quiz, practice, revision | /studio/quiz, /studio/practice, /studio/reminders | — |
| selfcheck, notes, favorites, follow, citations, showcase | (affichés dans les pages du socle) | — |

### Ajouter la partie web d'un nouveau module
1. `web/modules/mon-module/module.js` :
```js
const mod = {
  id: 'mon-module', name: 'Mon module', features: ['mon-module'],
  paths: [/^\/mon-module(\/|$)/],                                   // pages masquées si le module est coupé
  admin: [{ tab: 'mon-module', title: 'Mon module', label: 'admMonModule', icon: 'doc', load: () => import('./Admin') }],
  studio: [{ group: 'admin', href: '/admin?tab=mon-module', label: 'admMonModule', icon: 'doc' }], // entrée de menu
};
export default mod;
```
2. Ses pages dans `web/app/(module-mon-module)/mon-module/page.js`, son écran d'administration dans `web/modules/mon-module/Admin.js`.
3. Redéployer `majlistv-web` (Next.js assemble les pages à la construction : un nouveau module demande toujours un redéploiement du site, comme de l'API).

### Fichiers
Nouveaux : `web/lib/modules.js`, `web/modules/<19 modules>/module.js`, `web/modules/gifts/Admin.js` (sorti de `app/admin/page.js`), `web/modules/stats/Admin.js`, `web/tests/module_removal_build.py`. Déplacés : `web/components/RevenueAdmin.js` → `web/modules/revenue/Admin.js`, `web/components/StatsView.js` → `web/modules/stats/StatsView.js`, et les pages de 13 modules vers leurs groupes `(module-<id>)`. Modifiés : `web/app/layout.js`, `web/app/admin/page.js`, `web/lib/features.js`, `web/components/StudioShell.js`, `web/components/ModulesAdmin.js`.

### Prérequis
Aucune variable, aucune dépendance, aucune migration. **Seul le site web change** (l'API ne change pas dans cette étape).

### Déploiement (DockPanel + GitHub Desktop)
**Indispensable : passer par GitHub Desktop → Fetch origin puis Pull origin** (beaucoup de fichiers sont déplacés ; avec le zip, les anciens dossiers resteraient et le site aurait deux fois les mêmes pages, ce qui bloque la construction).
Puis DockPanel → Git Deploy → **Redeploy `majlistv-api`** (correctifs M3a et citations, si pas encore fait) puis **`majlistv-web`**. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Vérifier que ça marche
Ouvrir le site : accueil, `/series`, `/gift`, `/kids`, `/studio/series` s'affichent comme avant. Admin → Cartes cadeaux, Rémunération et Statistiques s'ouvrent. Admin → Fonctions : couper « Cartes cadeaux » → l'entrée disparaît du menu et `/gift` affiche « Cette fonction n'est pas disponible » ; la rallumer.

### Tests
- `web/tests/module_removal_build.py` : pour chacun des 19 modules, copie du site **sans** sa partie web (dossier et pages), construction, démarrage, puis vérification des pages du socle (accueil, connexion, tarifs, bibliothèque, compte, CGV, Studio, Administration), de la disparition des pages du module et de la présence de celles des autres ; puis le **site sans aucun module**.
- Navigateur (Chromium, 1440 et 390 px) : écrans d'administration des modules, menus du Studio, pages des modules, fonction coupée (menu masqué, page « indisponible »), aucune erreur console, pas de défilement horizontal.

### Dépannage
- **La construction du site échoue avec « You cannot have two parallel pages that resolve to the same path »** : un ancien dossier de pages est resté (mise à jour par zip). Supprimer les anciens dossiers `web/app/series`, `collections`, `books`, `learning`, `attestation`, `lists`, `l`, `chaines`, `kids`, `gift`, `redeem` et `web/app/studio/series`, `collections`, `books`, `channel`, `quiz`, `practice`, `reminders`, `revenue`, `stats` (ils sont maintenant dans les dossiers `(module-…)`), ou mieux : récupérer le dépôt par GitHub Desktop.
- **Une entrée de menu a disparu** : sa fonction est coupée (Admin → Fonctions) ou son module est absent (Admin → Modules).

---

## Étape A — Grands écrans et barres de défilement (réorganisation en 5 espaces, lot 1)

### Description
Sur un écran de 27 pouces, le titre et les étiquettes de la bannière d'accueil s'affichaient lettre par lettre à la verticale. Cause : les marges latérales du site (`--gutter`) grandissaient avec la largeur de l'écran, mais le bloc de texte de la bannière était limité à 760 px marges comprises ; il ne restait plus de place pour le texte. Cette étape corrige cela et rend les barres de défilement fines et presque invisibles. Seul `web/app/globals.css` change (fin du fichier) ; aucune base de données, aucune API.

Ce qui change :
- Les marges latérales sont calculées sur la zone réellement disponible à côté du menu latéral (232 px, 68 px replié, 0 sur téléphone).
- Le texte de la bannière (`.banner-body`) et la page intervenant (`.spk-page`) gardent leur largeur de texte quelle que soit la taille de l'écran.
- Barres de défilement de 6 px, couleur très discrète, partout (les défilements volontairement masqués, comme les rangées de vignettes, restent masqués).

### Prérequis
Aucun nouveau. Pour lancer le test : Python 3 avec Playwright et Chromium (déjà présents sur la machine de travail ; sur WSL : `pip install playwright --break-system-packages && python3 -m playwright install chromium`).

### Installation et déploiement (workflow habituel)
1. Décompresser le zip livré dans `C:\Users\agenc\Documents\GitHub\majlistv` (remplacer les fichiers).
2. GitHub Desktop : **Commit to main**, puis **Push origin**.
3. DockPanel → Git Deploy → **Redeploy `majlistv-web`** uniquement (l'API et le worker ne changent pas).
4. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Configuration
Aucune variable `.env` nouvelle.

### Vérifier que ça marche
Ouvrir https://majlisstv.le-publicitaire.fr sur un grand écran (ou élargir la fenêtre à 1990 ou 2560 px) : le titre de la bannière est sur 2 ou 3 lignes, pas lettre par lettre ; le texte reste aligné avec le contenu des rangées. Les barres de défilement sont fines. Vérifier aussi en arabe (langue AR) et à 390 px (téléphone).

### Test automatique
```bash
cd web
python3 tests/responsive_widths.py
```
Charge le vrai `app/globals.css` dans Chromium et vérifie 28 cas (7 largeurs de 390 à 2560 px × français/arabe × menu déplié/replié) : largeur de texte suffisante, titre sur 4 lignes au plus, pas de défilement horizontal, marge raisonnable. Avec l'ancien CSS, 12 cas échouent ; avec le nouveau, tous passent.

### Debug
- Le titre de la bannière est encore écrasé : vider le cache du navigateur (Ctrl+F5) puis vérifier que le redéploiement de `majlistv-web` est bien terminé.
- Un thème publié dans Admin → Apparence peut redéfinir `--gutter-min` / `--gutter-max` : le correctif en tient compte.
- Pour revenir en arrière : supprimer le bloc « Étape A » à la fin de `web/app/globals.css`.

### Exemples d'utilisation
Aucun réglage : le correctif est automatique. Test à la main : ouvrir les outils du navigateur (F12), mode appareil, tester 390, 1440, 1990 et 2560 px.

### Ce qui a été testé / non testé
Testé : le test automatique ci-dessus (Chromium, 28 cas). Non testé : construction complète du site (`next build`, changement CSS seulement), rendu sur le vrai site en ligne, vrai téléphone, navigateurs autres que Chromium.


## Étape B — Formats, page Catalogue et nouveaux menus (réorganisation en 5 espaces, lot 2)

### Description
- **Champ « Format »** : en plus de la catégorie (« de quoi ça parle »), chaque contenu a un format (« ce que c'est ») : Conférence, Cours, Récitation et lecture, Documentaire / entretien / débat, Dessin animé, Rappel. La liste se gère dans **Administration → Catégories et formats** (ajouter, renommer en fr/en/ar, réordonner, supprimer ; supprimer un format ne supprime aucun contenu). Tous les contenus existants passent en « Conférence » à la mise à jour ; on corrige ensuite contenu par contenu (Studio → fiche → **Format**) ou en lot (modification en lot → **Format**). À l'envoi d'un nouveau contenu, un choix « Format » est proposé (par défaut : Conférence).
- **Badge de format** en haut à gauche de chaque vignette (le badge Gratuit / Premium passe en haut à droite).
- **Page Catalogue** (`/catalogue`) : grande bannière (conférences « à la une »), rangée « Nouveautés », puis **une rangée horizontale par format** (seuls les formats qui contiennent des contenus). Pas de filtres. « Tout voir » ouvre la grille du format (`/catalogue?format=cours`) ; une catégorie du menu latéral ouvre sa grille (`/catalogue?cat=12`).
- **Menu du haut** : Accueil · Catalogue · Séries · Apprendre · Kids. Collections, Ouvrages et Ma bibliothèque restent dans le menu latéral (on peut les réafficher en haut dans Admin → Pages → menus).
- **Menu latéral** (membres) : Découvrir · **Catégories** (liste automatique, mêmes noms partout) · Apprendre (Mon parcours, Quiz et révision, Mes engagements, Mon bilan) · Ma bibliothèque (Favoris, Mes listes, Mes notes, Chaînes suivies) · Mon compte (Profil et abonnement, Cartes cadeaux, Notifications) · Gestion. Kids n'y figure plus (il est en haut).
- **Téléphone** : menu ☰ avec les catégories ; **barre du bas** Accueil · Catalogue · Séries · Apprendre · Kids, **aussi pour les visiteurs** (pas sur connexion, inscription, tarifs, pages légales). Sans série dans la bibliothèque, « Collections » remplace « Séries » comme avant.
- **Accueil visiteur : inchangé.**

### Prérequis
Étapes précédentes déployées. **Une migration** (`053_formats.sql`, appliquée automatiquement au démarrage de l'API) : table `formats` + colonne `talks.format_id` (tous les contenus existants → Conférence). Aucune variable `.env` nouvelle.

### Installation et déploiement
Le code est déjà poussé sur GitHub (`main`) ; le zip joint sert de secours (même contenu). Sinon, workflow habituel : décompresser dans `C:\Users\agenc\Documents\GitHub\majlistv`, GitHub Desktop → Commit to main → Push origin. Puis :
1. DockPanel → Git Deploy → **Redeploy `majlistv-api`** (attendre « Running » : la migration 053 s'applique).
2. Puis **Redeploy `majlistv-web`**. Le worker ne change pas.
3. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### API (résumé)
| Route | Rôle |
|---|---|
| `GET /formats` | liste publique (id, slug, nameFr/nameEn/nameAr, position) |
| `GET /formats/stats` | idem avec le nombre de contenus (admin) |
| `POST /formats`, `PATCH /formats/:id`, `DELETE /formats/:id` | gestion (admin) ; code `a-z0-9-`, 409 si déjà pris |
| `GET /catalogue` | `{ hero: { items }, rows: [{ key: 'new' \| 'format:<slug>', format, total, talks }] }` |
| `GET /talks?format=<slug>` | liste filtrée par format ; `formatId` accepté à la création, la modification et en lot |

### Vérifier que ça marche
1. https://majlisstv.le-publicitaire.fr/catalogue : bannière + rangées (au début, tout est en « Conférence » : une seule rangée de format).
2. Studio → une conférence → **Format** : choisir « Cours », enregistrer → la vignette porte le badge « Cours » et le Catalogue a une rangée « Cours ».
3. Téléphone (ou fenêtre étroite 390 px) : barre du bas à 5 entrées, y compris déconnecté.

### Tests
```bash
# API (3055) + PG de test (5544)
python3 api/tests/test_formats.py        # 36 contrôles : liste, droits, ajout/renommage/suppression, défaut, lot, rangées, ?format
# Navigateur : site lancé sur 3001 (API_URL=http://127.0.0.1:3055 npx next start -p 3001)
python3 web/tests/catalogue_menus.py     # menus, barre du bas, catalogue, français + arabe, 390 / 1440 / 1990 px
```

### Debug
- **« Catalogue » ou une rangée n'apparaît pas** : l'API n'est pas redéployée (la migration 053 n'a pas tourné) ou aucun contenu n'a ce format ; vérifier `curl https://api-majlisstv.le-publicitaire.fr/formats`.
- **Les menus gardent l'ancien ordre** : un réglage enregistré dans Admin → Pages → menus prime sur l'ordre d'origine. Les nouvelles entrées (Catalogue…) s'ajoutent en fin de liste ; pour repartir de l'ordre d'origine, supprimer le réglage de menu dans l'éditeur.
- **Les miniatures de la page Catalogue n'ont pas d'image** : vérifier `CSP_STORAGE_ORIGINS` côté web (adresse du stockage).
- **Retour arrière** : redéployer le commit précédent ; la table `formats` reste en base sans gêner l'ancienne version.

### Ce qui a été testé / non testé
Testé : API (36 contrôles formats + tests existants home, cartes, lot, catégories, contenu, fonctions, mise en page : OK), `next build`, navigateur (Chromium émulé, français et arabe, 390 / 1440 / 1990 px, visiteur et administrateur). Non testé : vrai téléphone, vraies miniatures du stockage Garage, rôles organisateur / modérateur dans le navigateur. À noter : dans l'environnement de test, `test_home.py` échoue sur l'envoi d'une image de bannière (stockage S3 absent de l'environnement de test, sans lien avec cette étape).

## Étape C — Apprendre, accueil par format, Séries et mise en pratique sur la vidéo (réorganisation en 5 espaces, lot 3)

### Description
- **Apprendre — tableau de bord** : une bande des **quatre temps** (1 Regarder · 2 Comprendre · 3 Retenir · 4 Mettre en pratique, avec un chiffre chacun), puis le bloc « reprendre » existant, **Mes engagements** (les deux plus récents), « À réviser aujourd'hui », et une rangée **« Pour continuer à apprendre »**. Chaque temps suit les interrupteurs de Admin → Fonctions (révision ou mise en pratique coupée = temps masqué).
- **Onglets** : Tableau de bord · Parcours (séries et progression) · **Quiz et révision** · **Mes engagements** (nouvel onglet `?tab=commit`, avant mélangé avec Parcours) · Mon bilan · Attestations. Le menu latéral et les liens « Voir mes engagements » pointent sur ce nouvel onglet.
- **Écran verrouillé** (membre sans formule Apprentissage) : bannière « Allez plus loin que le visionnage », 4 tuiles avec cadenas (Comprendre, Retenir, Mettre en pratique, Mon bilan), invitation « Passer à la formule » vers les tarifs, puis les contenus accessibles dès maintenant. Aucun prix n'est écrit en dur : il reste sur la page Tarifs.
- **Accueil connecté** : tuiles **« Explorer par format »** (une par format qui contient des contenus, avec leur nombre), placées avant les rangées ; chaque tuile ouvre la grille du format. Masquées s'il n'y a qu'un seul format.
- **Séries** : bloc **« Continuer »** (série commencée la plus récente, avec barre de progression et bouton « Reprendre la série »), puis « Toutes les séries ».
- **Fiche d'une conférence** : « Et maintenant, que faire ? » s'ouvre **sur la vidéo**, comme le quiz (avant : on descendait sous le lecteur). Sans lecteur (contenu verrouillé), l'ancien comportement (descente vers le bloc) est conservé.

### Prérequis
Étapes A et B déployées. **Aucune migration, aucune variable `.env`.** Un petit ajout d'API : `GET /formats?used=1` (formats utilisés + nombre).

### Déploiement
Le code est poussé sur GitHub (`main`). Puis :
1. DockPanel → Git Deploy → **Redeploy `majlistv-api`**, puis **`majlistv-web`** (le worker ne change pas).
2. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Vérifier que ça marche
1. Connecté avec la formule Apprentissage : https://majlisstv.le-publicitaire.fr/learning → bande des quatre temps, onglets « Quiz et révision » et « Mes engagements ».
2. Connecté avec un abonnement standard : même adresse → écran verrouillé avec l'invitation.
3. Accueil connecté : tuiles de formats (visibles dès deux formats utilisés).
4. Fin d'une vidéo avec mise en pratique : le bouton « Et maintenant » ouvre les propositions sur la vidéo.

### Tests
```bash
python3 api/tests/test_formats.py        # 38 contrôles (dont ?used=1)
python3 web/tests/etape_c.py             # navigateur : Apprendre, verrouillé, tuiles, Séries ; fr + ar ; 390 / 1440 px
python3 web/tests/catalogue_menus.py     # non-régression étape B
```

### Debug
- **Pas de tuiles de formats** : un seul format est utilisé (normal), ou l'API n'est pas redéployée (`curl https://api-majlisstv.le-publicitaire.fr/formats?used=1`).
- **« Mes engagements » vide alors qu'il y en a** : l'ancien lien `/learning#engagements` mène au tableau de bord ; utiliser `/learning?tab=commit`.
- **Le bouton « Et maintenant » descend encore sous la vidéo** : contenu verrouillé (pas de lecteur) ou page non rechargée (Ctrl+F5).

### Ce qui a été testé / non testé
Testé : `next build`, navigateur (Chromium émulé, fr + ar, 390 et 1440 px, administrateur et membre standard), test API formats. **Non testé** : l'ouverture de la mise en pratique sur la vidéo dans le navigateur (compilé, mais pas déclenché de bout en bout : il faut une vidéo avec quiz et propositions) ; vrai téléphone ; données réelles du site en ligne.
**Volontairement pas fait** : les onglets « Toutes / Séries / Cycles / Parcours » de la maquette Séries, car le site n'a aucune notion de « cycle » ou de « parcours » distincte d'une série (aucun champ). À décider avec vous.

## Correctifs du 16/10 (retours d'Epok après l'étape C)

### Description
- **Menu du haut conservé une fois connecté** (Accueil · Catalogue · Séries · Apprendre · Kids) : il était masqué par une règle de l'étape B ; elle est supprimée.
- **Rangées (carrousels) bien centrées** dans les pages à largeur limitée (Apprendre verrouillé, Séries, comptes…) : elles ajoutaient la grande marge de l'accueil et étaient décalées vers la droite. Corrigé pour toutes les pages concernées.
- **Bannières avec de vraies images** : l'écran Apprendre verrouillé utilise votre bannière (`web/public/brand/learning-banner.jpg`, partie droite de l'image fournie, texte réel à gauche donc traduisible) ; l'accueil visiteur remplace l'ancien encart Kids par la bannière **Mejliss TV Kids** (`web/public/brand/kids-banner.jpg`) cliquable, avec un bouton en dessous. Pour changer une image : remplacer le fichier du même nom puis redéployer `majlistv-web`.
- **Fiche d'une conférence** : fil d'Ariane (Catalogue › Format › Titre), puce de format, onglets dans l'ordre de la maquette (Résumé · Transcription · Mes notes · Chapitres · À propos, le premier disponible s'ouvre), **chapitres cliquables dans la colonne de droite**, lecteur plus large dans l'espace membre.
- **Barre d'outils du lecteur alignée** : vitesses à gauche, Marque-page / Mode audio / **Mode cinéma** à droite, tous de même hauteur ; retour à la ligne propre sur téléphone.
- **Mode cinéma** : bouton « Mode cinéma » sous le lecteur → menus, colonne latérale, titre et onglets masqués, lecteur le plus grand possible (sans dépasser la hauteur de l'écran). **Échap** (ou le même bouton) pour quitter.

### Déploiement
Code déjà poussé sur GitHub. DockPanel → Redeploy **majlistv-web** uniquement (aucun changement d'API), puis sur le VPS : `/root/apply-limits.sh`, `grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss`, `nginx -t && systemctl reload nginx`.

### Test
```bash
python3 web/tests/retours_16oct.py   # menu du haut, alignement des rangées, bannières, barre d'outils, cinéma ; fr + ar ; 390 / 1440 / 1990 px
```

### Non fait / à décider
- « Langue de l'audio » de la maquette : seulement avec le doublage (étape 0 / S…).
- Bannière Kids dans l'espace Kids lui-même : non touchée (thème Kids conservé) en attendant votre avis.
- Test sur vrai lecteur vidéo : l'environnement de test n'a pas accès à YouTube, le cinéma a été vérifié avec le lecteur indisponible (même mise en page).

## Étape D — Studio et Administration séparés (réorganisation en 5 espaces, lot 4)

### Description
- **Deux habillages distincts** : le Studio (`/studio…`) et l'Administration (`/admin…`) ont chacun leur menu latéral repliable (composants `StudioShell.js` et `AdminShell.js`, sur un habillage commun `ManageShell.js`). Plus aucune « Administration » dans le menu du Studio.
- **Studio — 8 entrées** (maquette) : Tableau de bord · Contenus · Données analytiques · Sous-titres · Audio et doublage · Éditeur · Activité · Paramètres. Les administrateurs ont en plus **Modération** (dans le Studio, comme décidé). Un **modérateur seul** n'a que ses outils de modération (file, collections, chaînes, mise en pratique) et arrive directement sur la file de modération.
- **Rangement des anciens écrans (adresses inchangées)** :
  - *Contenus* : onglets Conférences et cours · Séries · Collections (équipe) · Ouvrages. L'ancienne liste « Mes conférences » est maintenant **`/studio/contents`** (la page `/studio` est le nouveau tableau de bord).
  - *Données analytiques* : onglets Audience (`/studio/stats`) · Revenus (`/studio/revenue`).
  - *Paramètres* : ma chaîne + **Outils** (Quiz, Mise en pratique, Rappels de révision, Ouvrages, Collections, et toute entrée ajoutée par un nouveau module).
- **Nouvelles pages réelles** : *Tableau de bord* (dernier contenu publié avec vues et % regardé sur 30 jours, données de la chaîne : abonnés, vues, heures d'écoute, production en cours, à faire), *Sous-titres* (langue transcrite et état de chaque langue par contenu, filtres, lien « Gérer »), *Activité* (traitements en cours ou en erreur, dernières mises en ligne, rafraîchi automatiquement).
- **Annoncés « Bientôt », sans rien simuler** : *Audio et doublage* (arrive avec l'étape doublage) et *Éditeur* (montage, pas encore développé). La page l'explique.
- **Administration — 4 groupes** : Pilotage (Tableau de bord, Utilisateurs, Statistiques globales) · Catalogue (Catégories et formats, Intervenants, Cartes cadeaux) · Réglages (Fonctions, Modules, Paramètres, Apparence, Pages, Textes, Pages légales) · Sécurité (Journal d'audit). Liens « Aller au Studio » et « Voir le site ». Un organisateur ou un modérateur voit « accès refusé » et n'a aucun lien vers l'Admin. Les écrans eux-mêmes (onglets `?tab=…`) sont inchangés.
- Aucune migration SQL et **aucun changement d'API** : cette étape ne touche que le site web.

### Prérequis
Étapes A à C déployées. Aucune variable `.env`.

### Déploiement (workflow habituel)
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` (remplacer), GitHub Desktop → Commit to main → Push origin (ou déjà poussé : voir le message de livraison).
2. DockPanel → Git Deploy → **Redeploy `majlistv-web`** uniquement (API et worker inchangés).
3. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Vérifier que ça marche
1. Connecté en administrateur : https://majlisstv.le-publicitaire.fr/studio → 8 entrées + Modération ; le pied contient « Administration » → ouvre un menu à 4 groupes avec « Aller au Studio ».
2. Connecté en organisateur : pas de lien Administration, et `/admin` affiche un accès refusé.
3. Connecté en modérateur : `/studio` redirige vers `/studio/moderation`.
4. Anciennes adresses : `/studio/series`, `/studio/quiz`, `/studio/books`… fonctionnent et allument « Contenus » ou « Paramètres ».

### Tests
```bash
python3 web/tests/etape_d.py          # navigateur : menus par rôle, accès, onglets, pages ; fr + ar ; 390 / 1440 / 1990 px
python3 web/tests/catalogue_menus.py  # non-régression (menus du site)
python3 web/tests/etape_c.py          # non-régression Apprendre
python3 web/tests/module_removal_build.py series stats quiz revenue   # le site se construit sans ces modules
```

### Debug
- **Un lien « Revenus » ou « Statistiques » n'apparaît pas** : la fonction correspondante est coupée dans Admin → Fonctions (ou le module est retiré). Normal.
- **Ancien favori `/studio` qui montrait la liste** : la liste est maintenant sur `/studio/contents`.
- **Modérateur qui ne voit pas « Contenus »** : volontaire, il n'a que la modération.

### Ce qui a été testé / non testé
Testé : `next build`, navigateur Chromium émulé (administrateur, organisateur, modérateur ; fr + ar ; 390, 1440 et 1990 px, sans débordement), non-régression des étapes B et C et des retours du 16/10.
**Non testé / limites** : vrai téléphone ; données réelles (le tableau de bord a été vu avec les données de test : vues à 0). Le bloc « Espace de stockage » de la maquette n'est **pas repris** : l'API n'expose pas l'occupation du stockage (à ajouter plus tard si vous le souhaitez). « Chaînes » du groupe Catalogue de l'Admin et « Extraits » / « Archivés » des Contenus n'existent pas encore (pas de fonction correspondante) : non ajoutés plutôt qu'inventés. Les textes des nouveaux écrans sont dans le dictionnaire (fr/en/ar) mais les anciens écrans Admin gardent leurs libellés écrits en français dans le code.

## Accueil de l'enfant (Kids) : menu latéral et cartes de progression (retour d'Epok du 16/10, soir)

### Description
- L'accueil de l'enfant (`/kids`, une fois le profil ouvert) a maintenant un **menu latéral** (Accueil · Regarder · Apprendre), qui devient une barre en haut sur téléphone.
- **Accueil** : bannière Kids (inchangée), salutation, temps restant, grande carte « Regarder » (reprise de la dernière vidéo, sinon la première à voir), **cartes de progression** (étoiles, badges obtenus sur le total, vidéos vues sur le total avec barre, « à rejouer aujourd'hui »), badges, à rejouer, à continuer, « Pour toi » (8 premières, lien « Voir toutes les vidéos »).
- **Regarder** (`/kids?tab=watch`) : à continuer + toutes les vidéos de son âge. **Apprendre** (`/kids?tab=learn`) : étoiles, tous les badges avec leur explication (grisés tant qu'ils ne sont pas gagnés), vidéos à rejouer.
- Couleurs et logo Kids inchangés. Aucune migration, aucun changement d'API : web seulement (redéployer `majlistv-web`).

### À décider
La « **bonne action de la semaine** » / « Mes petites actions » de la maquette (actions validées par un parent) n'existe pas encore côté données (aucun écran, aucune table). Elle n'est donc **pas** ajoutée : voir les questions posées à Epok.

### Test
```bash
python3 web/tests/kids_menu.py   # navigateur : profil enfant, menu, cartes, onglets ; fr + ar ; 390 / 1440 / 1990 px
```

## Kids : « Mes petites actions » (proposées et validées par les parents)

### Description
- **Le parent propose** des actions concrètes à chaque enfant (ex. « Dire bonjour avec le sourire ») : page `/kids` (espace parent) → *Gérer les profils* → lien **Petites actions** à côté du profil. 20 actions en cours au maximum par enfant. Rien n'est généré par l'IA.
- **L'enfant les voit** : à la fin d'un quiz (« Bravo ! Une petite action pour continuer », 3 au plus), sur son accueil (carte « Mes petites actions »), dans l'onglet **Agir** du menu, et un compteur « Actions validées » dans ses cartes de progression. Il appuie sur **« Je l'ai fait »** : l'action passe « en attente d'un parent ». **L'enfant ne peut jamais valider** (le jeton enfant est refusé sur les routes parent).
- **Le parent valide** (ou supprime) depuis le même écran, y compris sans attendre que l'enfant ait appuyé.
- Migration **054_kid_actions.sql** (table `kid_actions`, statuts à faire → fait par l'enfant → validée). API : `GET/POST /me/kids/profiles/:id/actions`, `POST …/:aid/validate`, `DELETE …/:aid` (parent) ; `GET /kids/actions`, `POST /kids/actions/:aid/claim` (enfant) ; `/kids/summary` renvoie `actions: {todo, claimed, validated}`.

### Prérequis
Étape D et menu Kids déployés. Aucune variable `.env`.

### Déploiement
Code poussé sur GitHub. DockPanel → Git Deploy → **Redeploy `majlistv-api`** (la migration 054 s'applique au démarrage), puis **`majlistv-web`**. Worker inchangé. Puis sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Vérifier que ça marche
1. Connecté en parent : https://majlisstv.le-publicitaire.fr/kids → *Espace parents* → *Petites actions* → ajouter une action.
2. Ouvrir le profil de l'enfant, terminer un quiz : l'action apparaît sous les étoiles ; « Je l'ai fait ».
3. Revenir en parent (code parental) : l'action est « Fait par l'enfant, à valider » → **Valider**.

### Tests
```bash
python3 api/tests/test_kid_actions.py   # 27 contrôles : droits, isolation entre familles, enfant ne valide pas, limite, suppression du profil
python3 web/tests/kids_actions.py       # navigateur : parent propose, enfant déclare (accueil, Agir, fin de quiz), parent valide ; fr + ar ; 390 / 1440 px
python3 web/tests/kids_menu.py          # non-régression du menu Kids
```

### Debug
- **Le lien « Petites actions » n'apparaît pas** : le web n'est pas redéployé (Ctrl+F5) ; **erreur 404/500 sur `/kids/actions`** : l'API n'est pas redéployée (migration 054 non appliquée).
- **Rien après le quiz** : aucune action « à faire » pour cet enfant (normal).

### Testé / non testé
Testé : API (27 contrôles), navigateur Chromium émulé (fr + ar, 390 et 1440 px, sans débordement), fin de quiz avec 5 questions de test. **Non testé** : vrai téléphone ; rapport hebdomadaire aux parents (il ne mentionne pas encore les actions validées : possible suite) ; modèles d'actions prêtes à choisir (volontairement absents : le parent écrit les siennes).


## Étape 0 du doublage — test de voix et mesures

Banc d'essai **hors site** dans `dubbing/etape0/` (aucune migration, aucun redéploiement DockPanel, aucun port). Il sert à décider du moteur de voix avant de construire le module. Documentation complète, commandes VPS, fichiers à fournir et lecture du rapport : `dubbing/etape0/README.md`.

- **Description** : sous-titres français + audio d'origine → voix française (Chatterbox, CPU) calée sur les créneaux, mixée avec l'original à 15 %, rapport `report.md`/`report.json`.
- **Prérequis** : Docker sur le VPS, accès à huggingface.co, ~8 Go de disque, échantillon de ta voix (10–30 s) et 3 conférences courtes (ar, tr, en) avec sous-titres français.
- **Commandes** (VPS) :
```bash
mkdir -p /root/dubbing-test/in /root/dubbing-test/out /root/dubbing-test/models && cd /root/dubbing-test
git clone --depth 1 https://github.com/LePubli/majlistv.git src || (cd src && git pull)
docker build -t majlis-dub-test src/dubbing/etape0
docker run --rm --entrypoint python majlis-dub-test test_pipeline.py
cd src/dubbing/etape0 && ./run.sh arabe1 --max-segments 10
```
- **Debug** : voir `dubbing/etape0/README.md` (consentement, noms de fichiers, mémoire, téléchargement du modèle).
- **Testé / non testé** : chaîne complète testée avec un faux moteur (15 contrôles). Le vrai modèle n'a pas pu être téléchargé ici : vitesse et qualité inconnues jusqu'à tes mesures.

### Étape 0 bis du doublage (moteurs légers)
Mesure réelle de l'étape 0 : voix Chatterbox ressemblante mais RTF 34 (trop lent). Étape 0 bis dans `dubbing/etape0/README.md` : réglages Chatterbox (`--cfg-weight 0`, `--threads 4`), moteurs Piper et Kokoro, conversion vers la voix d'Epok (`--vc-voice`). Commandes VPS : `cd /root/dubbing-test/src && git pull && docker build -t majlis-dub-test dubbing/etape0`, puis les quatre essais A à D du README de l'étape. Testé avec de faux moteurs (27 contrôles) ; vrais moteurs légers non testés.

## Étape S1 — Module « Doublage français » : réglages, voix et écran Audio et doublage

### Description
Premier module du doublage, **sans génération de voix** : tout ce qui se règle et se prépare avant que le moteur (étape D1a) existe.
- **Module `dubbing`** (API `api/src/modules/dubbing/`, site `web/modules/dubbing/`), inactif tant que l'administrateur ne l'active pas (Admin → Modules → « Doublage français »). Retirer ses deux dossiers et `web/app/studio/(module-dubbing)/` le retire du site sans rien casser (testé).
- **Studio → Audio et doublage** (administrateurs) : l'entrée du menu n'est plus « Bientôt ». Quatre onglets :
  - **Conférences** : conférences dont la langue n'est pas le français, avec le nombre de phrases françaises (ou « Manquant »), le temps de calcul estimé et le type de réglages (par défaut / propres).
  - **Réglages par défaut** : voix de base, voix cible, préréglages (Rapide, Équilibré, Qualité), niveau de la voix d'origine (15 %), accélération maximale (× 1,35), réglages avancés (étapes de conversion : 3, blocs : 20 s, silence emprunté, vitesse et variations de la voix de base).
  - **Voix** : les 6 voix françaises de Piper (Tom par défaut, siwis, gilles, upmc 0 et 1, mls_1840) avec leur licence ; ajout d'une **voix cible** (échantillon audio + date et nom du consentement + case à cocher, obligatoires) ou d'une voix de base Piper ; écoute de l'échantillon ; désactivation (l'échantillon et la trace du consentement sont gardés).
  - **Langue d'écoute** : temps d'écoute de l'audio d'origine et de la version française (7, 30 ou 90 jours).
- **Fiche d'une conférence** (`/studio/dubbing/<id>`, maquette « Studio v2 », écran 3) : fil d'Ariane, boutons « Écouter 60 secondes » et « Lancer le doublage » **désactivés** avec la mention « Disponible avec le moteur de doublage (étape D1a) », onglets Détails · Audio et doublage · Montage, carte « Voix du doublage », carte « Réglages » (langue d'origine, curseurs, relecture et glossaire annoncés pour l'étape D1b), carte « Piste française » avec l'estimation du temps de calcul, tableau des **segments** (début, texte, durée, état) filtrable « Tous / À doubler / Voix d'origine », mention « Doublage par voix de synthèse ». Seules les valeurs qui diffèrent des réglages par défaut sont enregistrées pour la conférence.
- **Phrases protégées** : une phrase française qui commence par `#` (verset, hadith, invocation) est comptée « Voix d'origine » et exclue du temps de parole à doubler.
- **Estimation** : temps de calcul = secondes de parole × (voix de base + conversion : part fixe + part par étape × étapes). Coefficients réglables dans Admin → Modules → Doublage français (valeurs de départ tirées des mesures du 16/10/2026 : 2,0 ; 0,3 ; 0,42).
- **Analytique** : la reprise de lecture (`PUT /me/progress/:id`) accepte `audioLang` (`orig` par défaut, ou `fr`) ; le module compte le temps d'écoute par langue (table `dub_listen`). Tant que le lecteur n'a pas de version française (étape D2), tout compte pour l'audio d'origine.
- Un lien « Audio et doublage » apparaît pour l'administrateur dans la fiche Studio d'une conférence.

### Prérequis
- Rien de nouveau : pas de variable `.env`, pas de nouveau service, pas de port. Le stockage (Garage) sert aux échantillons de voix, comme pour les PDF des ouvrages.
- Migrations : celles du module (`api/src/modules/dubbing/migrations/001_dubbing.sql`), appliquées au démarrage de l'API.

### Déploiement (GitHub Desktop + DockPanel)
1. Récupérer le code (déjà poussé sur `main`) ou décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, puis GitHub Desktop → Commit to main → Push origin.
2. DockPanel → Git Deploy → **Redeploy `majlistv-api`** (applique la migration du module), puis **Redeploy `majlistv-web`**. Le worker n'a pas changé.
3. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
4. Sur le site : **Admin → Modules → « Doublage français » → Activer**, puis Studio → Audio et doublage.

### Exemples d'utilisation
- Ajouter ta voix : Audio et doublage → Voix → « Ajouter une voix cible » → nom « Ma voix », fichier `epok.wav`, date du consentement, ton nom, case cochée → Ajouter.
- Régler une conférence : Conférences → Ouvrir → choisir « Ma voix » → curseurs → Enregistrer. « Revenir aux réglages par défaut » efface ses réglages propres.
- Vérifier la migration sur le VPS :
```bash
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT slug, name, model, license FROM dub_voices ORDER BY created_at"'
```

### Debug
- **« Le module est désactivé »** dans le Studio : Admin → Modules → Doublage français → Activer.
- **Erreur 404 sur `/studio/dubbing/...`** côté API alors que le module est activé : l'API n'a pas été redéployée (module absent) ; vérifier Admin → Modules (version 0.1.0, aucune erreur).
- **L'envoi d'un échantillon échoue** : le stockage doit accepter les envois du navigateur (même réglage que les PDF des ouvrages) ; vérifier `S3_*` dans DockPanel et le message de la console du navigateur. Taille maximale : 15 Mo (réglable dans Admin → Modules).
- **Une conférence n'est pas dans la liste** : elle est déjà en français (langue ou transcription `fr`).
- **« Manquant » dans la colonne Texte français** : demander la traduction en français dans la fiche de la conférence (sous-titres).

### Tests
- API : `python3 api/tests/test_dubbing.py` (54 contrôles : activation, droits, plages, voix, consentement, envoi de l'échantillon, estimation, langue d'écoute) — nécessite un stockage S3 de test (moto, port 5599 : `S3_ENDPOINT=http://127.0.0.1:5599 S3_ACCESS_KEY=test S3_SECRET_KEY=test`).
- Site : `python3 web/tests/s1_dubbing.py [dossier] fr` puis `... ar` (390, 1440, 1990 px, sans débordement).
- Retrait du module : `python3 api/tests/test_module_removal.py dubbing` et `python3 web/tests/module_removal_build.py dubbing`.

### Testé / non testé
Testé ici : API (54 contrôles), navigateur Chromium (fr et ar, 390 / 1440 / 1990 px), retrait du module (API et site), non-régression de l'étape D, des modules et de la rémunération (hors contrôles Stripe, non configuré dans mon environnement de test). **Non testé** : envoi d'un échantillon vers le vrai Garage (testé avec un faux stockage S3), vrai téléphone. Aucune voix n'est générée à cette étape.

## Étape D1a — Service de doublage (`dubbing/`) branché sur le Studio

### Description
- **Nouveau service** `dubbing/` (Python, processeur seul) : voix de base Piper **gardée en mémoire**, calage, conversion vers la voix cible **par blocs** (ChatterboxVC), mélange avec la voix d'origine baissée, fichiers AAC dans le stockage. Détails : `dubbing/README.md`.
- **Module « Doublage français » 0.2.0** (migration `002_jobs.sql`) : file `dub_jobs`, signe de vie `dub_engine`, piste en service `dub_tracks` ; réglages ajoutés dans Admin → Modules : plage de nuit (1 h – 7 h), mode `night` / `always`, cœurs (4), durée de l'écoute rapide (60 s).
- **Studio → Audio et doublage** : « Écouter 60 secondes » et « Lancer le doublage » sont **actifs** ; barre de progression et « Annuler » ; la page se met à jour seule ; lecteur de l'écoute rapide et de la piste complète (version française, voix seule) ; état de chaque phrase (**Calé**, **Calé (accéléré)**, **À revoir**, **Voix d'origine**) avec la durée et l'accélération, filtre « À revoir » ; bandeau « Moteur prêt / hors ligne » ; file d'attente sur l'écran d'accueil ; colonne « Piste » dans la liste.
- **Estimation** : la vitesse réellement mesurée par le service remplace l'estimation théorique dès qu'il a doublé au moins 20 s de parole avec la même configuration.
- Correctif : la durée de l'écoute rapide utilisait par erreur le réglage « aperçu gratuit » du site (même nom) ; les réglages du module sont désormais lus avec leur nom complet.

### Prérequis
- Étape S1 en place. Accès du VPS à huggingface.co au premier lancement du service. 4 cœurs / 8 Go pour le service.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull** (le code est déjà poussé sur `main`).
2. DockPanel → Git Deploy → **Redeploy `majlistv-api`** (migration du module), puis **Redeploy `majlistv-web`**.
3. DockPanel → Git Deploy → **nouveau déploiement `majlistv-dubbing`** : Dockerfile `dubbing/Dockerfile`, contexte `.`, port conteneur `3000`, aucun domaine, volume persistant `/models`, variables :
```
DATABASE_URL=<même valeur que majlistv-api>
SETTINGS_KEY=<même valeur que majlistv-api>
S3_ENDPOINT=https://s3-majlisstv.le-publicitaire.fr
S3_REGION=garage
S3_BUCKET=majlis-videos
S3_ACCESS_KEY=<même valeur que majlistv-api>
S3_SECRET_KEY=<même valeur que majlistv-api>
DUB_THREADS=4
```
4. Sur le VPS :
```bash
/root/apply-limits.sh
docker update --cpus 4 --memory 8g --memory-swap 8g dockpanel-git-majlistv-dubbing
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
docker logs --tail 20 dockpanel-git-majlistv-dubbing
```
Si DockPanel refuse le port : voir `dubbing/README.md` (port hôte 7041 par exemple ; jamais 7000, 7001, 7010).

### Exemples d'utilisation
- Studio → Audio et doublage → une conférence → **Écouter 60 secondes** : quelques minutes plus tard, « Écouter les 60 secondes ». Changer les curseurs, Enregistrer, réécouter.
- **Lancer le doublage** : la demande attend la nuit ; le matin, « Doublage terminé · durée · N passages à revoir » et le lecteur de la piste.
- Pour tester tout de suite un doublage complet : Admin → Modules → Doublage français → « Quand lancer les doublages complets » = `always`.

### Debug
Voir `dubbing/README.md` (journaux, requête d'état des demandes, plage de nuit, mémoire, accès à huggingface.co).

### Tests
- `python3 dubbing/tests/test_pipeline.py` (19 contrôles) ; `DUB_PY=python3.11 python3 dubbing/tests/test_service.py` (31 contrôles, aussi avec le vrai Piper) ; `python3 api/tests/test_dubbing.py` ; `DUB_PY=python3.11 python3 web/tests/d1a_dubbing.py` puis `python3 web/tests/s1_dubbing.py [dossier] fr|ar`.

### Testé / non testé
Testé ici : logique audio, service complet avec de faux moteurs **et avec le vrai Piper** (voix française d'essai siwis-low : ≈ 0,05 s de calcul par seconde de voix une fois chargée), file d'attente, plage de nuit, annulation, reprise après arrêt brutal, nettoyage des anciens fichiers, navigateur (fr / ar, 390 / 1440 px). **Non testé ici** : la **conversion vers ta voix** (ChatterboxVC ne se télécharge pas depuis mon environnement : testée seulement sur le VPS aux étapes 0 ter / quater), la voix Tom elle-même, la construction de l'image Docker (pas de Docker dans mon environnement : mêmes paquets que le banc d'essai qui s'est construit sur le VPS), un vrai téléphone, une conférence d'1 h (mémoire et durée réelles à mesurer).

## Étape D2 — Version française dans le lecteur (page d'une conférence)

### Description
- **Carte « Langue de l'audio »** à côté du titre (maquette « Studio v2 », écran 7), quand la conférence a une piste française : **Version française** (« voix d'origine en arrière-plan ») ou **Voix d'origine** (« avec sous-titres français »), rappel « les versets et invocations restent dans la voix d'origine », **Mode audio seul**. Mention **« Version française · doublage par voix de synthèse »** sur la vidéo. Le choix est mémorisé sur l'appareil.
- **Vidéos envoyées** : la vidéo est coupée et la piste française (voix française + voix d'origine baissée) est jouée **en phase** avec elle (lecture, pause, saut, vitesse ; recalage au-delà de 0,35 s d'écart). Le bouton « son » du lecteur règle alors le volume de la version française. En mode audio seul, la piste française est lue directement.
- **YouTube / Vimeo / archive.org** : le son de la vidéo est baissé au niveau choisi au doublage (15 %) et la voix française seule est jouée par-dessus.
- **Pas encore de version française** (conférence qui n'est pas en français) : « Cette conférence n'a pas encore de version française » + **« Demander la version française »** (abonnés ; administrateurs pour essayer), nombre de demandes, « Retirer ma demande ». Membre gratuit → lien vers les formules ; visiteur → connexion. Quand la piste est prête, les membres qui l'avaient demandée reçoivent un **e-mail** (une seule fois).
- **Droits** : les liens des pistes ne sont donnés qu'avec un jeton de **lecture complète** (gratuit, abonné, propriétaire) ; un aperçu de conférence premium n'obtient pas la piste entière.
- **Analytique** : la reprise de lecture envoie la langue écoutée (`fr` ou `orig`) : Studio → Audio et doublage → Langue d'écoute compte enfin la version française.
- **Studio** : colonne « Demandes » dans la liste (les plus demandées en premier) et nombre de demandes dans la fiche.
- Module « Doublage français » **0.3.0** (migration `003_requests.sql` : table `dub_requests`), modèle d'e-mail `dub_ready` (fr / en / ar). Le panneau est fourni par le module (`talkPanel` de `web/modules/dubbing/module.js`) : sans le module, la page d'une conférence est inchangée (testé).

### Prérequis
- Étapes S1 et D1a en place (une piste française existe quand un doublage complet a réussi). Envoi des e-mails configuré (Admin → Paramètres → E-mails) pour l'avertissement « version française disponible ».

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull**.
2. DockPanel → Git Deploy → **Redeploy `majlistv-api`** (migration du module), puis **Redeploy `majlistv-web`**. Le service `majlistv-dubbing` n'a pas changé.
3. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Exemples d'utilisation
- Une conférence doublée (piste « prête » dans Studio → Audio et doublage) : ouvrir sa page, choisir « Version française », lancer la vidéo.
- Une conférence en arabe sans version française, connecté avec un compte abonné : « Demander la version française ». Dans le Studio, la colonne « Demandes » passe à 1.
- Vérifier les demandes sur le VPS :
```bash
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT t.title, count(*) AS demandes, count(r.notified_at) AS prevenus FROM dub_requests r JOIN talks t ON t.id = r.talk_id GROUP BY t.title ORDER BY 2 DESC"'
```

### Debug
- **Pas de carte « Langue de l'audio »** : le module est désactivé, la conférence n'a pas de piste (« Piste : prête » dans le Studio), ou elle est verrouillée (aperçu premium).
- **« La version française s'écoute avec l'accès complet »** : visiteur sur une conférence premium (aperçu) ; normal.
- **Décalage entre l'image et la voix** : la piste est recalée automatiquement au-delà de 0,35 s ; si le décalage est constant, c'est le doublage lui-même (relecture, étape D1b).
- **Pas d'e-mail** : vérifier Admin → Paramètres → E-mails ; la tâche passe toutes les 2 minutes quand le module est activé.

### Tests
- API : `python3 api/tests/test_dubbing_d2.py` (23 contrôles). Navigateur : `python3 web/tests/d2_player.py [dossier]` (22 contrôles : synchronisation réelle de la vidéo HLS et de la piste, demande, fr/ar 390/1440 px). Non-régression : `test_dubbing.py`, `test_modules.py`, `s1_dubbing.py`, `d1a_dubbing.py`, `etape_c.py`, `retours_16oct.py`, retrait du module.

### Testé / non testé
Testé ici dans Chromium (la vidéo HLS et les pistes de test sont en VP9 / Opus car le Chromium de test ne lit pas le H.264 / AAC ; Chrome, Safari et Firefox lisent l'AAC des vraies pistes). **Non testé** : un vrai téléphone (notamment iPhone, où deux sons simultanés et la lecture écran éteint dépendent de Safari), les lecteurs YouTube / Vimeo réels (réseau fermé dans mon environnement : seule la logique est testée), l'envoi réel de l'e-mail.

## Étape D1b — Relecture avant doublage, voix d'origine, glossaire de prononciation

### Description
- **Tableau des phrases modifiable** (Studio → Audio et doublage → une conférence) :
  - **Corriger** une phrase française. La correction vaut aussi pour les **sous-titres français** (même texte).
  - Case **« Voix d'origine »** : la phrase (verset, hadith, invocation) n'est pas lue par la voix de synthèse ; la voix d'origine est gardée à 100 % et le texte reste en sous-titre. L'ancien préfixe « # » reste compris ; décocher la case retire aussi ce « # ».
  - Colonne **Prononciation** : ce que la voix lira à la place d'un terme, d'après le glossaire.
  - **Contrôle qualité** : après une écoute ou un doublage, une phrase « À revoir » (trop longue pour son créneau) peut être raccourcie avec « Corriger » ou **« Accepter tel quel »**. Une phrase acceptée sort du filtre « À revoir ». Si on modifie son texte, l'acceptation est retirée.
- **Relecture** (réglages de la conférence) :
  - **« Valider la relecture »** enregistre qui a validé et quand.
  - Si un texte ou une case change ensuite, la relecture passe **« À refaire »**.
  - Tant qu'elle n'est pas validée, **« Lancer le doublage » est grisé**, avec une explication. L'écoute de 60 s reste possible.
  - Le réglage `require_review` (Admin → Modules → Doublage français) rend la relecture **facultative** (par défaut : obligatoire).
  - La liste des conférences affiche une colonne **Relecture** (« Relue » / « À relire »).
- **Glossaire de prononciation** : nouvel onglet **Glossaire** dans Studio → Audio et doublage.
  - Il y a **un seul glossaire pour tout le site**. On peut ajouter, rechercher, modifier, désactiver et supprimer des termes.
  - Options par terme : « mot entier seulement » (par défaut) et « respecter les majuscules ».
  - Zone **« Essayer »** : on tape une phrase et on voit ce que la voix va lire.
  - Le glossaire ne change **que la voix** : les sous-titres gardent l'orthographe écrite.
- **Droits** : administrateurs et modérateurs (comme le reste de l'écran doublage).
- Module « Doublage français » **0.4.0**.
  - Migration `004_review.sql` : tables `dub_segments` (cases et acceptations), `dub_reviews` (empreinte du texte relu) et `dub_glossary`.
  - Service `majlistv-dubbing` **0.3.0** : il lit les cases et le glossaire.

### Prérequis
- Étapes S1, D1a et D2 en place.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull** (ne pas décompresser de zip par-dessus).
2. DockPanel → Git Deploy, dans cet ordre :
   1. **Redeploy `majlistv-api`** (applique la migration `004_review.sql`) ;
   2. **Redeploy `majlistv-web`** ;
   3. **Redeploy `majlistv-dubbing`** (le service a changé).
3. Sur le VPS :
```bash
docker update --cpus 4 --memory 8g --memory-swap 8g dockpanel-git-majlistv-dubbing
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
docker logs --tail 20 dockpanel-git-majlistv-api | grep -i "004_review"
docker logs --tail 20 dockpanel-git-majlistv-dubbing | grep -i "prêt"
```
La première commande `grep` doit afficher « Module dubbing : migration appliquée 004_review.sql ». La seconde doit afficher « Service de doublage 0.3.0 prêt ».

### Exemples d'utilisation
- **Glossaire** : onglet Glossaire → terme « Ibn Outhaymine », se prononce « Ibne Outhaïmine » → Ajouter. Dans « Essayer », taper « l'Imam Ibn Outhaymine a dit » : la voix lira « l'Imam Ibne Outhaïmine a dit ».
- **Relecture d'une conférence** :
  1. Ouvrir la conférence.
  2. Cocher « Voix d'origine » sur les versets.
  3. Corriger les phrases mal traduites.
  4. Lancer « Écouter 60 secondes ».
  5. Raccourcir ou « Accepter tel quel » les phrases « À revoir ».
  6. Cliquer sur « Valider la relecture », puis sur « Lancer le doublage ».
- **Voir le glossaire et les relectures sur le VPS** :
```bash
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT term, say, whole_word, case_sensitive, active FROM dub_glossary ORDER BY lower(term);
SELECT t.title, rv.reviewed_at, u.name FROM dub_reviews rv JOIN talks t ON t.id = rv.talk_id LEFT JOIN users u ON u.id = rv.reviewed_by ORDER BY rv.reviewed_at DESC LIMIT 20;
SQL
```

### Debug
- **« Lancer le doublage » grisé** : la relecture n'est pas validée, ou elle est « À refaire » parce qu'un texte ou une case a changé. Cliquer sur « Valider la relecture ». Pour la rendre facultative : Admin → Modules → Doublage français → `require_review` = `false`.
- **Erreur « review_required »** (via l'API) : même cause.
- **Le glossaire n'est pas appliqué à la voix** :
  - vérifier que le terme est **actif** ;
  - vérifier que « mot entier » est cohérent (« Imam » ne remplace pas « Imamat ») ;
  - relancer une écoute : le glossaire est lu au **début** de chaque travail ;
  - vérifier que `majlistv-dubbing` a bien été redéployé (journal « 0.3.0 prêt »).
- **« Ce terme est déjà dans le glossaire »** : les majuscules sont ignorées pour les doublons (« imam » = « Imam »).

### Tests
- API : `python3 api/tests/test_dubbing_d1b.py` (31 contrôles : glossaire, doublons, essai, cases, « # », relecture, « à refaire », refus `review_required`, réglage facultatif, droits).
- Service : `python3 dubbing/tests/test_pipeline.py` (29 contrôles) et `DUB_PY=python3.11 python3 dubbing/tests/test_service.py` (36 contrôles : case et glossaire réellement pris en compte par le service).
- Navigateur : `DUB_PY=python3.11 python3 web/tests/d1b_dubbing.py [dossier]` (41 contrôles, fr/ar, 390/1440 px).
- Non-régression : `test_dubbing.py`, `test_dubbing_d2.py`, `test_modules.py`, retrait du module, `s1_dubbing.py`, `d1a_dubbing.py`, `d2_player.py`.

### Testé / non testé
**Testé ici** :
- tout ce qui précède avec des moteurs de voix factices ;
- la règle du glossaire, identique en JavaScript et en Python.

**Non testé** :
- l'effet du glossaire sur la vraie voix Tom ou ta voix clonée. Il faut l'écouter sur le VPS : une orthographe « phonétique » peut demander quelques essais (« Outhaïmine », « Outhaïmîne »…) ;
- un vrai téléphone.

## Étape S2 — Stockage et archivage

### Description
- Nouveau module **« Stockage et archivage »** (`api/src/modules/storage/`, `web/modules/storage/`), version **0.1.0**. Il est inactif par défaut : on l'active dans Administration → Modules.
- L'écran **Studio → Paramètres → Stockage et archivage** suit la maquette « Studio v2 », écran 6. Il est réservé aux administrateurs.
  - **Trois chiffres :**
    - **Diffusion (Garage)** : l'espace utilisé sur la capacité réglée, avec une barre et le pourcentage. La mesure se fait au plus toutes les 5 minutes, ou avec « Mesurer maintenant ».
    - **Archives** : la taille et le nombre de fichiers archivés.
    - **Originaux en attente** : il affichera les vidéos remplacées à partir de l'étape E4. Pour l'instant, il indique « — ».
  - **Où archiver vos fichiers** : **PlanetHoster** (SFTP, par défaut, port 5022), **Stockage S3** (Backblaze B2, Wasabi, Scaleway, Cloudflare R2, AWS), **WebDAV** (Nextcloud…) ou **Aucun**.
    - Pour SFTP : un mot de passe **ou une clé privée**.
    - Options avancées : le dossier des archives (`studio` par défaut) et une phrase de **chiffrement** facultative.
  - **« Tester la connexion »** enregistre d'abord les changements. Il crée ensuite le dossier, écrit un petit fichier, le relit et l'efface. Une pastille indique « Connexion réussie · il y a 2 min » ou l'échec.
  - **« Archiver un fichier d'essai »** : un petit fichier est écrit dans Garage, envoyé chez le fournisseur, vérifié, puis effacé de Garage. On le restaure ensuite depuis **« Dans les archives »**.
  - **Règles automatiques :**
    - archiver les pistes audio de travail après **30 jours** (0 = jamais) ;
    - garder l'original après un remplacement : **7 jours** (appliqué à l'étape E4) ;
    - alerte quand l'espace libre passe sous **15 %** ;
    - capacité de Garage : **30 Go** (à vérifier avec `df -h /`) ;
    - sauvegarde nocturne : **inchangée**.
    - Les règles passent une fois par jour, ou tout de suite avec « Appliquer maintenant ».
  - **Dans les archives** : chaque fichier a un bouton **Restaurer** (ou **Réessayer** en cas d'échec), et l'historique liste les fichiers restaurés.
- **Ce que la règle automatique archive aujourd'hui** (fichiers de travail du module doublage) :
  - les écoutes de 60 s de plus de N jours ;
  - la « voix française seule » des vidéos envoyées (le lecteur utilise le mélange).
  - La piste servie aux spectateurs n'est **jamais** archivée.
  - Dans Audio et doublage, un fichier archivé affiche « Ce fichier est dans les archives » avec un bouton **Restaurer**.
- **Sécurité :**
  - les identifiants sont **chiffrés** dans la base (SETTINGS_KEY) et ne sont jamais renvoyés à l'écran ;
  - un fichier n'est effacé de Garage qu'**après vérification** de la copie (même taille). Une restauration est vérifiée avant que la copie d'archive soit effacée ;
  - les actions sont inscrites au journal d'audit.
- **Moteur** : **rclone**, ajouté à l'image de l'API (`Dockerfile` racine et `api/Dockerfile` : `apk add rclone`). La configuration passe par variables d'environnement, jamais par un fichier ni par la ligne de commande.
- Le socle des modules accepte maintenant les réglages `secret_text` (secret sur plusieurs lignes, pour une clé privée).
- Le module doublage passe en 0.4.1 (fichiers de travail archivables).

### Prérequis
- Étapes précédentes en place. `SETTINGS_KEY` défini sur l'API (déjà le cas) pour chiffrer les identifiants.
- Un accès SFTP PlanetHoster. On peut réutiliser le compte de la sauvegarde nocturne (`node228-eu.n0c.com`, port 5022, voir `ops/backup/README.md`) avec **une clé dédiée** au module et le dossier `studio` (séparé de `backups-vps`).

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull**.
2. DockPanel → Git Deploy → **Redeploy `majlistv-api`**. L'image est reconstruite avec rclone et la migration `001_storage.sql` s'applique. Puis **Redeploy `majlistv-web`**. Les services `majlistv-worker` et `majlistv-dubbing` n'ont pas changé.
3. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
docker exec dockpanel-git-majlistv-api rclone version | head -1
docker logs --tail 50 dockpanel-git-majlistv-api 2>&1 | grep -i "storage"
```
L'avant-dernière commande doit afficher « rclone v1.… ». La dernière doit afficher « Module storage : migration appliquée 001_storage.sql ».
4. **Clé dédiée au module** (sur le VPS) :
```bash
ssh-keygen -t ed25519 -f /root/.ssh/id_mejliss_archive -N "" -C mejliss-archive
cat /root/.ssh/id_mejliss_archive.pub
```
Ajoute la clé publique affichée dans PlanetHoster (Hébergement → SSH → Ajouter une clé), puis vérifie :
```bash
ssh -i /root/.ssh/id_mejliss_archive -p 5022 yuxzzjad@node228-eu.n0c.com 'mkdir -p ~/studio && df -h ~ | tail -1'
cat /root/.ssh/id_mejliss_archive
```
Copie la clé privée affichée (de `-----BEGIN` à `END …-----`) **directement** dans le Studio, champ « Clé privée ». Ne l'envoie jamais par le chat ni par e-mail.
5. Administration → Modules → **Stockage et archivage** → Activer.
6. Studio → Paramètres → **Stockage et archivage** :
   1. PlanetHoster : adresse `node228-eu.n0c.com`, port `5022`, identifiant `yuxzzjad` ;
   2. « Utiliser une clé privée à la place », puis colle la clé ;
   3. **Tester la connexion** ;
   4. **Archiver un fichier d'essai** ;
   5. **Restaurer**.

### Exemples d'utilisation
- **Recette** : « Tester la connexion » affiche « Connexion réussie ». Le fichier d'essai passe « Dans les archives », puis « Restaurer » le ramène dans « Restaurés récemment ».
- **Voir ce qui est chez PlanetHoster** :
```bash
ssh -i /root/.ssh/id_mejliss_archive -p 5022 yuxzzjad@node228-eu.n0c.com 'ls -laR ~/studio | head -40; du -sh ~/studio'
```
- **Voir les archives dans la base** :
```bash
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT kind, status, label, pg_size_pretty(bytes) AS taille, archived_at, restored_at, left(error, 100) AS erreur
FROM archive_items ORDER BY updated_at DESC LIMIT 20;
SQL
```

### Debug
- **« rclone est introuvable »** : l'image de l'API n'a pas été reconstruite. Refaire Redeploy `majlistv-api`, puis `docker exec dockpanel-git-majlistv-api rclone version`.
- **« Échec de la connexion »** : le message vient de rclone. Les cas courants :
  - mauvais port (5022 chez PlanetHoster) ;
  - clé publique non ajoutée chez PlanetHoster ;
  - mauvais identifiant ;
  - le conteneur n'atteint pas l'hôte. Pour le vérifier :
```bash
docker exec dockpanel-git-majlistv-api sh -c 'nc -zv -w 5 node228-eu.n0c.com 5022'
```
- **Archivage en échec** : le fichier est **resté** dans Garage (rien n'est effacé avant vérification). Corrige la connexion, puis « Réessayer ».
- **Restauration refusée « archive chiffrée »** : la phrase de chiffrement a été retirée ou changée. Remets la même phrase, puis « Réessayer ».
- **Espace Garage à 0 ou absent** : variables `S3_*` de l'API.
- **Les écoutes de 60 s anciennes ne partent pas** : le module « Doublage français » doit être activé ; la règle passe une fois par jour (ou « Appliquer maintenant ») et ne prend que les fichiers de plus de N jours.

### Tests
- API : `python3 api/tests/test_storage_s2.py` (51 contrôles). Il utilise un serveur SFTP et un serveur WebDAV de test, lancés en local avec `rclone serve` (voir l'en-tête du fichier), et le S3 de test. Il couvre : mot de passe et clé privée, chiffrement, échec sans perte, S3, WebDAV, règle automatique du doublage, espace, audit.
- Navigateur : `python3 web/tests/s2_storage.py [dossier]` (28 contrôles : écran, test de connexion, fichier d'essai archivé puis restauré, règles, restauration depuis la fiche doublage, fr/ar 390/1440 px).
- Non-régression : `test_modules.py`, `test_dubbing*.py`, retrait du module, `s1_dubbing.py`, `d1a_dubbing.py`, `d1b_dubbing.py`, `d2_player.py`.

### Testé / non testé
**Testé ici** :
- SFTP, S3 et WebDAV avec des serveurs de test locaux (rclone 1.68) ;
- chiffrement, échecs et reprises.

**Non testé** :
- le vrai serveur PlanetHoster : c'est la recette à faire de ton côté ;
- la construction de l'image Docker avec `apk add rclone` : pas de Docker ici. Le paquet existe bien dans le dépôt « community » d'Alpine ;
- de très gros fichiers (plusieurs Go) : rclone les envoie en flux, sans passer par le disque de l'API.

## Étape S3 — Tableau de bord, Contenus et Activité du Studio

### Description
- **Tableau de bord** (Studio → Tableau de bord), selon la maquette « Studio v2 », écran 1 :
  - en haut : boutons « Ouvrir l'éditeur » et « + Nouvelle conférence » ;
  - **Dernière conférence publiée** (publiée, visible et vidéo prête) : miniature avec durée, vues depuis la publication, temps de visionnage moyen, version française écoutée, et liens vers les données analytiques, Audio et doublage, la fiche et l'éditeur (« Bientôt ») ;
  - **Données de la chaîne** (28 derniers jours) : abonnés de mes chaînes et nouveaux de la semaine, vues avec l'évolution par rapport à la période précédente, heures d'écoute, écoute en français ;
  - **Production en cours** : les 3 premières tâches, par exemple « Doublage 64 % » ou « Écoute de 60 s · en attente » ;
  - **À faire** : relectures de traduction avant doublage, passages « à revoir », demandes de version française, conférences en erreur, validations avant mise en ligne, brouillons, tâches en échec ;
  - **Espace de stockage** (administrateur, module Stockage activé) : Garage et archives, alerte d'espace.
  - Un bloc dont le module est désactivé n'apparaît pas.
- **Menu du Studio** :
  - pastille sur **Activité** : nombre de tâches en cours ou en attente ;
  - encart **STOCKAGE** (administrateur, module Stockage activé) : pourcentage, barre, « x utilisés sur 30 Go », avec un lien vers Stockage et archivage.
- **Contenus**, selon la maquette, écran 2 :
  - colonnes Conférence (durée, « envoyée le », ou « YouTube (non montable) »), **Langue** (« AR → FR »), **Production** et **Visibilité** (Publique / Brouillon / Programmée / Validation), **Vues** ;
  - la colonne **Production** montre les 7 étapes Importée › Transcrite › Traduite › Relue › Montée › Doublée › Publiée et une étiquette (« Doublée », « Doublage 64 % », « Relecture à faire », « Traduction en cours », « Conversion 42 % »…) ;
  - filtres **Toutes / À doubler / À relire / Publiées**, plus Brouillons, En traitement, En erreur et Validation quand il y en a ;
  - la recherche porte aussi sur la langue et l'étape. La modification en lot reste disponible.
  - **Montée** reste grisée tant que l'éditeur n'existe pas (étapes E1 à E5). Relue et Doublée viennent du module Doublage.
- **Activité** : toutes les tâches de fond (conversion vidéo, transcription, traduction des sous-titres, doublage, écoute de 60 s, archivage, restauration), **dans l'ordre où les services vont les prendre**. Elles sont rangées en En cours (avec progression), En attente (numérotées), En pause, et En échec (30 derniers jours).
  - **Administrateur :**
    - **Mettre en pause / Reprendre** une tâche ;
    - **Passer en priorité / Priorité normale** ;
    - **Mettre en pause les tâches lourdes** (conversion, transcription, doublage complet) ;
    - **Limiter les tâches lourdes à une plage horaire** (heure de Paris, par exemple 22 h à 7 h).
  - Une **demande de doublage en cours** peut être mise en pause : le service s'arrête au prochain bloc et la remet dans la file, en pause. Elle repartira du début.
  - Une conversion ou une transcription déjà en cours va jusqu'au bout.
  - Les écoutes de 60 s, les traductions et les archivages ne sont pas retenus par la pause générale ni par la plage horaire.
  - **Organisateur :** il voit les tâches de ses conférences, sans action.
  - Les actions sont inscrites au journal d'audit.
- **Technique :**
  - migration `055_activity.sql` : table `activity_controls` et fonctions SQL `activity_allows`, `activity_paused`, `activity_priority`, lues par les services au moment de prendre une tâche ;
  - réglages `activity_*` (Admin → Paramètres → Activité) ;
  - routes `/studio/activity`, `/studio/overview` et `/studio/production` ;
  - les modules ajoutent leurs données par événements (`activity.collect`, `activity.pause`, `studio.overview`, `studio.production`) ;
  - versions : statistiques 1.1.0, chaînes 1.1.0, doublage 0.5.0, stockage 0.2.0, service de doublage 0.4.0 ;
  - le **worker**, le **transcripteur**, le **traducteur** et le **service de doublage** ont changé. Chacun garde sa file d'origine si la migration 055 manque.

### Prérequis
- Étapes S1 à S2 en place. Aucune variable d'environnement à ajouter.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull**.
2. DockPanel → Git Deploy, **dans cet ordre** :
   1. **Redeploy `majlistv-api`** (migration `055_activity.sql`, obligatoire avant les services) ;
   2. **Redeploy `majlistv-web`** ;
   3. **Redeploy `majlistv-worker`**, **le transcripteur**, **le traducteur** et **`majlistv-dubbing`** (les quatre ont changé).
3. Sur le VPS :
```bash
docker update --cpus 4 --memory 8g --memory-swap 8g dockpanel-git-majlistv-dubbing
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
docker logs --tail 80 dockpanel-git-majlistv-api 2>&1 | grep -i "055_activity"
docker ps --format '{{.Names}}' | grep -i majlistv | while read c; do echo "== $c"; docker logs --tail 200 "$c" 2>&1 | grep -i "pause et priorité indisponibles" | tail -1; done
```
- La commande `grep -i "055_activity"` doit afficher « Migration appliquée : 055_activity.sql ».
- La dernière commande ne doit **rien** afficher sous les noms des services. Si « Pause et priorité indisponibles » apparaît, un service a été redéployé avant l'API : redéploie-le.

### Exemples d'utilisation
- **Recette** :
  1. Studio → Tableau de bord : l'encart Stockage et les tâches en cours apparaissent.
  2. Studio → Activité : sur une tâche en attente, « Mettre en pause ». Elle passe dans « En pause » et n'est pas traitée.
  3. « Reprendre » : elle revient dans la file.
- **Calcul la nuit seulement** : Studio → Activité → cocher « Limiter les tâches lourdes à une plage horaire », de 22 h à 7 h, puis « Enregistrer ».
- **Voir les réglages en base** :
```bash
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT queue, ref, paused, priority, updated_at FROM activity_controls ORDER BY updated_at DESC LIMIT 20;
SELECT key, value FROM app_settings WHERE key LIKE 'activity_%';
SELECT activity_allows('video') AS taches_lourdes_autorisees;
SQL
```

### Debug
- **Une tâche ne démarre jamais** : regarde dans Activité si elle est « En pause », si les tâches lourdes sont en pause, ou si l'on est hors de la plage horaire (pastille en haut de la carte « Tâches lourdes »). Une transcription « attend la vidéo » tant que la conversion n'est pas finie.
- **La pause d'une demande de doublage en cours ne fait rien** : le service doit être en version 0.4.0 (journal « Service de doublage 0.4.0 prêt »).
- **Pastille ou encart absents** : la pastille n'apparaît que s'il y a des tâches en cours ou en attente. L'encart demande le rôle administrateur et le module Stockage activé.
- **Vues à « — »** : module Statistiques désactivé, ou conférence pas encore publiée.

### Tests
- API : `python3 api/tests/test_studio_s3.py` (47 contrôles, dont la pause d'une vraie demande de doublage en cours avec le service et des moteurs factices).
- Services : `python3 api/tests/test_activity_claims.py` (19 contrôles). Il utilise le **vrai code** de réservation du worker, du transcripteur, du traducteur et du service de doublage, et vérifie aussi la file simple sans la migration 055.
- Navigateur : `python3 web/tests/s3_studio.py [dossier]` (41 contrôles, fr/ar, 390/1440 px).
- Non-régression : `test_modules.py`, `test_dubbing*.py`, `test_storage_s2.py`, `test_stats.py`, `test_channels.py`, `etape_c.py`, `etape_d.py`, `retours_16oct.py`, `responsive_widths.py`, `catalogue_menus.py`, `s1/d1a/d1b/d2/s2`, retrait des modules.

### Testé / non testé
**Testé ici** : tout ce qui précède, avec la base de test et les services lancés en local.

**Non testé** :
- la construction des images Docker des quatre services (pas de Docker ici). Seul le code de réservation a changé, plus un module `claim.js` pour le worker ;
- le comportement réel sur le VPS pendant une longue conversion ;
- un vrai téléphone.

## Étape E0 — Prototype du moteur de rendu (point de décision)

### Description
- **Prototype jetable**, non déployé : `studio-proto/e0/` (voir son README).
  - Un montage de 2 minutes décrit en JSON est rendu par **une seule commande FFmpeg**.
  - Il gère :
    - les génériques d'ouverture et de fin ;
    - les coupes et les fondus enchaînés ;
    - le logo, les bandeaux et les sous-titres recalés après les coupes (l'arabe s'affiche de droite à gauche) ;
    - la voix française et la musique, avec ducking ;
    - le volume normalisé ;
    - l'aperçu en 360p.
- **Rapport de choix** (moteurs de rendu, base de l'éditeur, licences, ce que Garage conserve, mesures) : document partagé avec Epok.
- **Ce que Garage conserve** (lu dans `worker/src/index.js` et `api/src/routes/uploads.js`) :
  - le fichier **original envoyé** (`talks/<uuid>`) est **gardé** après la conversion ;
  - il n'est effacé qu'à la suppression de la conférence ;
  - s'y ajoutent les 3 qualités HLS, la version audio et les miniatures (`hls/<id>/`).
  - Le montage pourra donc partir de l'original, et la qualité 360p déjà produite peut servir d'aperçu.

### Prérequis
- Aucun pour le site. Pour la mesure : accès SSH au VPS et le zip de l'étape.

### Déploiement
- **Aucun redéploiement.** Le dossier `studio-proto/` n'est construit par aucun service.

### Exemples d'utilisation (mesure sur le VPS)
```bash
cd /root && rm -rf e0 && python3 -m zipfile -e majlistv-etape-E0.zip e0 && cd e0/studio-proto/e0
sh run_vps.sh
sh run_vps.sh /root/arab1.mp4
```
Pour mesurer ce qu'occupent les originaux, les qualités HLS et le doublage dans Garage :
```bash
docker exec dockpanel-git-majlistv-api sh -c 'export RCLONE_CONFIG_G_TYPE=s3 RCLONE_CONFIG_G_PROVIDER=Other RCLONE_CONFIG_G_ENDPOINT="$S3_ENDPOINT" RCLONE_CONFIG_G_ACCESS_KEY_ID="$S3_ACCESS_KEY" RCLONE_CONFIG_G_SECRET_ACCESS_KEY="$S3_SECRET_KEY" RCLONE_CONFIG_G_REGION="${S3_REGION:-garage}" RCLONE_CONFIG_G_FORCE_PATH_STYLE=true; for p in talks hls dubbing; do printf "%s : " "$p"; rclone size --config /tmp/none.conf --s3-no-check-bucket "G:${S3_BUCKET:-majlis-videos}/$p" | tr "\n" " "; echo; done'
```

### Debug
- Voir `studio-proto/e0/README.md`.

### Tests
- `node studio-proto/e0/render.mjs` sur les médias de `make_media.sh` : aperçu et 1080p rendus, ducking mesuré (−15 dB), sous-titres recalés (5 gardés, 1 retiré), arabe vérifié sur les images.

### Testé / non testé
**Testé ici** : sur 2 cœurs, avec des médias synthétiques (FFmpeg 6.1).

**Mesuré sur le VPS par Epok (17/10/2026, image du worker, 4 fils sur 6 cœurs)** : aperçu 360p en 34 s pour 118 s de montage (RTF 0,29) ; 1080p en 100 s (RTF 0,85), soit environ 51 min pour une conférence d'une heure.

**Décision d'Epok (17/10/2026)** : moteur **FFmpeg piloté par notre code** ; temps de rendu jugé correct ; pas de licence Remotion. MLT reste le plan B.

**Non testé** :
- une vraie conférence (mesure abandonnée, à la demande d'Epok) ;
- les transitions autres que le fondu.

## Étape E1 — Éditeur de montage : timeline multipiste

### Description
- Nouveau module **« Éditeur de montage »** (`editor`, version 0.1.0), **désactivé par défaut** : à activer dans Admin → Modules.
- **Studio → Éditeur** (`/studio/editor`) :
  - **Montages** : titre, durée montée sur la durée d'origine, nombre d'extraits, dernière modification et qui l'a faite, mention « En cours de modification par … » ;
  - **Conférences à monter** : bouton **« Monter »**, qui crée le montage (la vidéo entière en un seul extrait) et ouvre l'éditeur ;
  - les vidéos YouTube, Vimeo et archive.org sont signalées « non hébergée, ne se monte pas », et une vidéo pas encore convertie est signalée elle aussi ;
  - accès : l'organisateur sur ses conférences, l'administrateur sur toutes. Le modérateur n'a pas accès.
- **L'éditeur**, plein écran et fidèle à la maquette « Studio v2 », écran 4 :
  - **en-tête** : retour au Studio, titre, « Version N · enregistré automatiquement il y a … », badge « Aperçu 360p · le rendu final sera en haute qualité », **Annuler**, **Rétablir**, **Versions**, et **Rendre la vidéo**, grisé jusqu'à l'étape E4 ;
  - **gauche** : Ajouter (titre, bandeau de nom, logo, musique, intro et écran de fin, transition) et Modèles de la chaîne. Ils sont **affichés mais désactivés**, avec l'étape où ils arrivent (E2 ou E3) ;
  - **centre** : **aperçu 360p** (la qualité déjà produite par la conversion, lue par hls.js) **qui suit le montage** : à la fin d'un extrait, la lecture saute au début du suivant. Boutons −10 s / lecture / +10 s, horloge du montage, sous-titre du moment ;
  - **droite**, « Piste sélectionnée » :
    - pour un extrait : début et fin dans la vidéo d'origine (modifiables au clavier, par exemple `1:50,0`), durée, place dans le montage, « Aller au début », « Supprimer le passage » ;
    - pour les autres pistes : ce qu'elles font, et ce qui arrive en E2 ou E3 ;
  - **bas** : **Couper**, **Supprimer le passage**, **Aimanter**, résumé (« Montage : 1:35 sur 2:00 · 2 extraits · vidéo d'origine à 0:45,0 »), **Zoom**, puis la **timeline à 6 pistes** :
    1. **Vidéo** : les extraits. On les **déplace** à la souris, on change leur début ou leur fin en tirant leurs bords. Un raccord hachuré marque un passage coupé ou déplacé ;
    2. **Voix d'origine** : suit la vidéo ;
    3. **Voix française** : les phrases du doublage, placées selon le montage. Un passage gardé en voix d'origine est en pointillés. Vide sans version française ;
    4. **Musique** : arrive à l'étape E2 ;
    5. **Titres et logo** : arrivent à l'étape E3 ;
    6. **Sous-titres** : les phrases (en français si elles existent), placées selon le montage ; une phrase coupée est raccourcie.
  - La **timeline se lit de gauche à droite, même en arabe**. Le reste de l'écran passe de droite à gauche.
  - L'**aimant** colle la tête de lecture, les coupes et les bords des extraits aux raccords et au début ou à la fin des phrases, pour éviter de couper au milieu d'un mot.
  - **Raccourcis** : Espace = lecture ; C = couper ; Suppr = supprimer ; ← → = 1 s (Maj : 10 s) ; Alt + ← → = déplacer l'extrait ; Ctrl+Z = annuler ; Ctrl+Maj+Z ou Ctrl+Y = rétablir ; M = aimant.
  - **Annuler / Rétablir** : jusqu'à 200 gestes.
  - **Ordinateur seulement** : sous 1024 px de large, un message demande d'utiliser un ordinateur. La liste des montages s'affiche bien sur téléphone.
- **Sauvegarde automatique** : environ 1 s après chaque geste. Un dernier enregistrement part quand on ferme l'onglet ou qu'on revient au Studio.
- **Versions** :
  - une **copie automatique** est faite au premier enregistrement de chaque séance de travail ;
  - on peut enregistrer des **versions nommées** (par exemple « Montage validé ») ;
  - **« Revenir à cette version »** copie d'abord le montage actuel : rien n'est perdu ;
  - les 30 copies automatiques les plus récentes sont gardées, et toutes les versions nommées.
- **Verrou : une seule personne modifie à la fois.**
  - Le verrou est renouvelé toutes les 25 s et expire après 75 s sans nouvelles (onglet fermé, ordinateur en veille).
  - **Les autres voient le projet en lecture seule**, mis à jour toutes les 10 s, avec « Lecture seule : X modifie ce projet (depuis …) ».
  - Le même compte dans un autre onglet obtient « Modifier ici ».
  - L'administrateur peut **« Reprendre la main »** : l'autre personne passe en lecture seule, avec un message, et ses changements déjà enregistrés sont gardés. Cette reprise est inscrite au journal d'audit.
  - Si deux onglets écrivent quand même, le second reçoit le montage à jour en lecture seule : rien n'est écrasé sans qu'on le sache.
- **Studio → Contenus** : l'étape **« Montée »** devient « en cours » dès qu'un montage existe. Elle passera à « fait » avec le rendu (étape E4).
- **Liens** :
  - tableau de bord : « Ouvrir l'éditeur », et « Modifier dans l'éditeur » sur la dernière conférence si c'est une vidéo envoyée ;
  - Audio et doublage : onglet « Montage » (vidéos envoyées seulement) ;
  - ces liens disparaissent si le module est désactivé.
- **La vidéo publiée ne change pas** : le montage n'est qu'un document. Le rendu et le remplacement de la vidéo arrivent à l'étape E4.
- **Technique :**
  - module API `api/src/modules/editor/` : `module.json`, `migrations/001_editor.sql` (tables `editor_projects` et `editor_versions`), `timeline.js` (document de montage v1 et sa vérification), `routes.js`, `index.js` ;
  - partie web `web/modules/editor/` : `Editor.js`, `Timeline.js`, `Preview.js`, `Versions.js`, `EditorHome.js`, `ops.js`. Les opérations de montage sont du code sans React, testées seules ;
  - pages dans `web/app/studio/(module-editor)/editor/` ;
  - événement `editor.media` : le module Doublage (version **0.6.0**) y ajoute les phrases de la voix française ;
  - les sauvegardes automatiques et le renouvellement du verrou ne remplissent pas le journal d'audit ;
  - le tableau de bord reçoit la source de la dernière conférence (`/studio/overview`).
- Le **document de montage** (`timeline`, version 1) est `{ v: 1, duration, clips: [{ id, in, out }], ui }`, en secondes de la vidéo d'origine. Le moteur FFmpeg de l'étape E4 le lira, et E2 et E3 y ajouteront leurs pistes.

### Prérequis
- Étapes S1 à S3 en place, vidéos converties (HLS, avec la qualité 360p `v0`).
- Aucune variable d'environnement à ajouter. `CSP_STORAGE_ORIGINS` (site web) doit contenir l'adresse du stockage, comme pour les miniatures. C'est déjà le cas en ligne.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull**.
2. DockPanel → Git Deploy :
   1. **Redeploy `majlistv-api`** : la migration du module, `editor/001_editor.sql`, s'applique au démarrage ;
   2. **Redeploy `majlistv-web`**.
   Le worker, le transcripteur, le traducteur et `majlistv-dubbing` n'ont **pas** changé.
3. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
docker logs --tail 120 dockpanel-git-majlistv-api 2>&1 | grep -i "module editor"
```
La dernière commande doit afficher « Module editor : migration appliquée 001_editor.sql ».
4. Admin → Modules → **Éditeur de montage** → **Activer**.

### Exemples d'utilisation
- **Recette** :
  1. Studio → Éditeur → **Monter** sur une conférence envoyée.
  2. Place la tête de lecture, puis **Couper**. Coupe encore, clique l'extrait du milieu, puis **Supprimer le passage**.
  3. **Glisse** un extrait à une autre place, puis **Annuler** et **Rétablir**.
  4. Le titre affiche « enregistré automatiquement ». Recharge la page : le montage est là.
  5. Ouvre le même projet avec un autre compte (ou en navigation privée avec le compte administrateur) : **lecture seule**, outils grisés.
- **Voir les montages en base** :
```bash
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT p.id, t.title, p.rev, jsonb_array_length(p.timeline->'clips') AS extraits, p.updated_at,
       (p.lock_until > now()) AS verrou_actif, u.name AS modifie_par
  FROM editor_projects p JOIN talks t ON t.id = p.talk_id LEFT JOIN users u ON u.id = p.lock_user ORDER BY p.updated_at DESC LIMIT 20;
SELECT project_id, n, label, auto, created_at FROM editor_versions ORDER BY created_at DESC LIMIT 20;
SQL
```
- **Libérer un verrou bloqué** (ne devrait pas servir : il expire seul après 75 s) :
```bash
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "UPDATE editor_projects SET lock_until = NULL;"'
```

### Debug
- **« Studio → Éditeur » dit que le module est désactivé** : Admin → Modules → Éditeur de montage → Activer.
- **« L'aperçu 360p ne se charge pas »** :
  - la conférence doit être convertie, avec la playlist `hls/<id>/v0/index.m3u8` dans Garage ;
  - `CSP_STORAGE_ORIGINS` du site doit contenir l'adresse du stockage ;
  - la console du navigateur (F12) affiche les erreurs « Content Security Policy » ou CORS ;
  - le petit temps de chargement aux raccords est normal : c'est un aperçu.
- **« Monter » refusé** : vidéo YouTube, Vimeo ou archive.org (non hébergée), ou vidéo pas encore convertie (Studio → Activité).
- **Toujours en lecture seule** : une autre personne ou un autre onglet modifie (le bandeau dit qui). Sans nouvelles pendant 75 s, le verrou expire et « Modifier » apparaît.
- **« Enregistrement impossible »** : regarder le journal de l'API :
```bash
docker logs --tail 100 dockpanel-git-majlistv-api 2>&1 | grep -i "editor"
```

### Tests
- API : `python3 api/tests/test_editor_e1.py` (61 contrôles). Ils couvrent :
  - les droits, la création, le refus des vidéos externes et en conversion ;
  - l'aperçu 360p réellement lu (vraie vidéo HLS fabriquée par FFmpeg) ;
  - les sous-titres et la voix française liés ;
  - le verrou (autre onglet, autre personne, reprise par l'administrateur, expiration) ;
  - la sauvegarde, le conflit (409), les montages invalides refusés ;
  - les versions (copie automatique, nommée, retour en arrière, limite de 30) ;
  - le journal d'audit, Studio → Contenus, la suppression, le module désactivé.
- Opérations de montage : `node web/tests/e1_ops.mjs` (22 contrôles : couper, supprimer, déplacer, raccourcir, pistes liées, aimant, temps).
- Navigateur : `python3 web/tests/e1_editor.py [dossier]` (49 contrôles). Le parcours complet est fait à la souris et au clavier, avec deux comptes et deux onglets, en fr/ar, à 1440, 1024 et 390 px. Le Chromium de test ne lit pas le H.264 : la vidéo de test y est en VP9, par le même chemin HLS et le même lecteur.
- Non-régression : `test_studio_s3.py`, `test_dubbing_d1b.py`, `test_dubbing_d2.py`, `test_moderation.py`, `s1_dubbing.py`, `s3_studio.py`, `etape_d.py`, retrait du module (API et construction du site sans `editor`).

### Testé / non testé
**Testé ici** : tout ce qui précède, avec la base de test, un S3 de test et de vraies vidéos HLS fabriquées par FFmpeg.

**Non testé** :
- une vraie conférence d'une heure (nombre de phrases réel, fluidité de la timeline) ;
- la lecture H.264 dans un vrai Chrome, Firefox ou Safari : elle passe par le même lecteur hls.js que le site, mais le navigateur de test ne lit que le VP9 ;
- un écran tactile (tablette) ;
- le VPS.
- Retrait du module de l'API : le contrôle « Stripe : remboursement traité » échoue (503) pour tous les modules, même ceux qu'E1 n'a pas touchés. La base de test locale n'a pas les prix Stripe réglés ; ce n'est pas lié à E1.

## Étape E2 — Éditeur de montage : audio pro

### Description
- **Réglages du son**, dans le panneau de droite (« Piste sélectionnée »), selon la maquette « Studio v2 », écran 4. On clique sur le nom d'une piste pour l'ouvrir.
  - **Voix d'origine** :
    - volume (−40 à +12 dB) et case « Couper la voix d'origine » ;
    - **fondu aux raccords** (30 ms par défaut, contre les « clics » aux coupes) ;
    - **réduction du bruit** (désactivée, légère, forte) ;
    - **niveau sonore mesuré** (LUFS) ;
    - boutons **« Sans réduction » / « Avec réduction »** : 10 s de la voix d'origine à l'endroit de la tête de lecture, préparées par l'API avec FFmpeg, pour comparer à l'oreille.
  - **Voix française** (piste liée au doublage) :
    - « Utiliser la voix française dans ce montage » ;
    - volume ;
    - **voix d'origine sous la voix française** (15 % par défaut, repris des réglages du doublage de la conférence) ;
    - **fondu d'entrée / sortie** (0,5 s) ;
    - niveau mesuré.
  - **Musique** :
    - liste des musiques du montage et bouton « Ajouter une musique » ;
    - pour une musique : volume (−12 dB par défaut), début et durée (saisie au clavier), fondus d'entrée et de sortie, **en boucle**, **baisse automatique sous la voix** (−12 dB) et « Retirer du montage ».
  - **Mixage final**, visible dans chaque panneau son : **niveau sonore homogène** (−14, −16 recommandé, −18 ou −23 LUFS).
  - Un réglage tiré au curseur compte pour **un seul geste** dans Annuler / Rétablir.
- **Timeline** :
  - **formes d'onde** de la voix d'origine (placées selon le montage), de la voix française (dans ses phrases) et des musiques ;
  - **courbe or du volume de la voix d'origine**, qui descend sous la voix française et à chaque raccord ;
  - la piste Musique accepte de **déplacer** une musique, de la **raccourcir ou rallonger par ses bords** (l'aimant colle aux raccords et à la tête de lecture), de la sélectionner, et de la supprimer avec Suppr ;
  - en-têtes des pistes : « 15 % » (voix d'origine baissée), « Coupée », « Liée » ou « Non utilisée », « Baisse auto ».
  - **Supprimer un passage de la vidéo supprime ses blocs de voix française** (pistes liées depuis E1) ; les musiques restent à leur place dans le temps du montage.
- **Aperçu** : le son suit les réglages.
  - La voix d'origine est baissée sous la voix française, avec les fondus. La voix française (piste « voix seule » du doublage) joue calée sur la vidéo d'origine. Les musiques jouent avec leurs fondus, leur boucle et leur baisse automatique.
  - Limite : l'aperçu ne monte pas au-dessus de 100 % (un gain positif ne s'entend qu'au rendu).
  - La réduction du bruit et le niveau homogène s'appliquent au rendu final (étape E4), sauf l'écoute de 10 s.
- **Bibliothèque de musiques**, bouton « Musique de fond » à gauche :
  - commune à tous les montages ;
  - **l'administrateur importe** (mp3, m4a, aac, wav, ogg, flac, webm ; 60 Mo au plus), avec un titre et la source ou la licence. Le fichier va directement dans le stockage ;
  - l'API analyse chaque musique : durée, forme d'onde, niveau ;
  - tout le monde écoute et **ajoute au montage** à la tête de lecture : jusqu'à la fin du montage, en boucle si la musique est plus courte ;
  - une musique utilisée par un montage, ou par une de ses versions, ne peut pas être supprimée.
- **Analyses du son** (formes d'onde, LUFS) : une file dans l'API, une analyse à la fois, avec FFmpeg.
  - Sources : voix d'origine = son de la qualité 360p ; voix française = piste du doublage ; musiques.
  - Une nouvelle piste française est réanalysée toute seule.
  - Les analyses apparaissent dans **Studio → Activité** (« Analyse du son… », tâches légères : pause et priorité possibles).
- **Registre des problèmes réglés avec cette étape** (`docs/PROBLEMES-A-REGLER.md`) :
  1. **Test de retrait des modules** : il règle des prix Stripe factices puis les remet ; le contrôle du remboursement vérifie de nouveau quelque chose.
  2. **`test_stats.py`** : les statistiques de quiz Kids sont mesurées en écart avant / après, sans dépendre des anciennes données de la base de test.
  3. Point 4 du registre : **un module sans fonction associée (Doublage, Stockage, Éditeur) désactivé disparaît des menus et des liens des organisateurs**. L'administrateur garde l'entrée, et la page l'invite à activer le module.
- **Technique :**
  - module `editor` **0.2.0** : migration `editor/002_audio.sql` (`editor_assets`, `editor_waveforms`), `audio.js` (analyse FFmpeg, file, extraits), document de montage étendu (`audio`), routes `/studio/editor/projects/:id/audio`, `…/audio/retry`, `…/denoise-sample`, `/studio/editor/music` (+ `upload-url`, `:id`) ;
  - module doublage **0.7.0** (lien de la voix française et réglage de la baisse pour l'éditeur) ;
  - file `editor` ajoutée à Studio → Activité ;
  - **FFmpeg ajouté à l'image de l'API** (Dockerfile racine et `api/Dockerfile`) ;
  - partie web : `AudioPanel.js`, `MusicLibrary.js`, calculs du son dans `ops.js` (`mixAt`, enveloppes, musiques), formes d'onde dans `Timeline.js`, son de l'aperçu dans `Preview.js`.

### Prérequis
- Étape E1 en place, module « Éditeur de montage » activé. Aucune variable d'environnement à ajouter.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull**.
2. DockPanel → Git Deploy :
   1. **Redeploy `majlistv-api`** : l'image reçoit FFmpeg (construction un peu plus longue), et la migration `editor/002_audio.sql` s'applique ;
   2. **Redeploy `majlistv-web`**.
   Ni le worker, ni le transcripteur, ni le traducteur, ni `majlistv-dubbing` n'ont changé.
3. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
docker exec dockpanel-git-majlistv-api ffmpeg -hide_banner -version | head -1
docker logs --tail 150 dockpanel-git-majlistv-api 2>&1 | grep -i "module editor"
```
- La commande `ffmpeg` doit afficher « ffmpeg version … ».
- La dernière doit afficher « Module editor : migration appliquée 002_audio.sql ».

### Exemples d'utilisation
- **Recette** :
  1. Ouvre le montage d'une conférence qui a une version française.
  2. Clique sur la piste **Voix française** : sous la voix française, la courbe or de la voix d'origine descend à 15 %. Écoute l'aperçu : la voix d'origine baisse quand la voix française parle.
  3. Coupe un passage puis « Supprimer le passage » : ses blocs de voix française disparaissent.
  4. « Musique de fond » → importe une musique (administrateur), puis « Ajouter au montage » : elle baisse toute seule sous la voix.
- **Voir les analyses et les musiques en base** :
```bash
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT kind, talk_id, asset_id, status, round(duration_s, 1) AS secondes, lufs, error, updated_at FROM editor_waveforms ORDER BY updated_at DESC LIMIT 20;
SELECT id, title, license, round(bytes / 1048576.0, 1) AS mo, created_at FROM editor_assets ORDER BY created_at DESC;
SQL
```
- **Relancer toutes les analyses en échec** :
```bash
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "UPDATE editor_waveforms SET status = '"'"'queued'"'"', attempts = 0, error = NULL WHERE status = '"'"'failed'"'"';"'
```

### Debug
- **« Analyse du son en cours… » qui ne finit jamais** :
  - Studio → Activité : la tâche est-elle en pause ?
  - FFmpeg est-il dans l'image ? Lance `docker exec dockpanel-git-majlistv-api ffmpeg -version` ; s'il manque, redéploie `majlistv-api`.
  - Regarde le journal :
```bash
docker logs --tail 200 dockpanel-git-majlistv-api 2>&1 | grep -i "forme d'onde\|Éditeur"
```
- **« Analyse du son impossible »** : le message donne la raison (fichier illisible, piste française supprimée…). Le bouton de relance est dans l'API (`…/audio/retry`), ou utilise la commande SQL ci-dessus.
- **L'import d'une musique échoue (« L'envoi du fichier a échoué »)** : le stockage doit autoriser l'adresse du site (CORS, réglé au démarrage de l'API avec `CORS_ORIGIN`). Comme pour l'envoi des vidéos, `CORS_ORIGIN` doit contenir `https://majlisstv.le-publicitaire.fr`.
- **Pas de voix française dans l'aperçu** : il faut un doublage complet terminé (piste « voix seule »). La piste Voix française indique « Aucune » sinon.
- **Les écoutes « avec / sans réduction » répondent « FFmpeg est absent »** : redéploie `majlistv-api`.

### Tests
- API : `python3 api/tests/test_editor_e2.py` (41 contrôles). Il couvre :
  - de vraies analyses FFmpeg : forme d'onde à 100 ms, LUFS, voix française parlée ou silencieuse ;
  - la nouvelle piste française réanalysée ;
  - les écoutes avec et sans réduction ;
  - la bibliothèque (droits, formats, taille, import, analyse, licence, suppression refusée si utilisée) ;
  - les réglages enregistrés et les réglages invalides refusés ;
  - Studio → Activité et le journal.
- Calculs du son : `node web/tests/e2_mix.mjs` (20 contrôles : baisse, fondus, raccords, musiques, boucle, formes d'onde).
- Navigateur : `python3 web/tests/e2_audio.py [dossier]` (32 contrôles). Il vérifie :
  - le volume réel de la vidéo dans l'aperçu (15 % puis 20 % sous la voix française) ;
  - un seul « Annuler » pour un réglage au curseur ;
  - la voix d'origine coupée, l'écoute de la réduction du bruit ;
  - l'import d'une musique à travers l'écran, la musique plus basse sous la voix, le déplacement à la souris, Suppr puis Ctrl+Z ;
  - la sauvegarde, la lecture de la voix française avec la vidéo ;
  - l'arabe, 1024 px, et les menus d'un module désactivé.
- Non-régression : `test_editor_e1.py`, `e1_editor.py`, `e1_ops.mjs`, `test_studio_s3.py`, `test_dubbing_d1b.py`, `test_dubbing_d2.py`, `test_stats.py`, `s1_dubbing.py`, `s3_studio.py`, `etape_d.py`, retrait des modules `editor` et `dubbing` (API, désormais sans échec Stripe) et construction du site sans `editor`.

### Testé / non testé
**Testé ici** : tout ce qui précède, avec la base de test, un S3 de test, FFmpeg 6.1 et de vrais fichiers son.

**Non testé** :
- la construction de l'image de l'API avec FFmpeg (pas de Docker ici ; paquet `ffmpeg` d'Alpine) ;
- l'analyse d'une vraie conférence d'une heure : environ 1 min de calcul attendue, non mesurée sur le VPS ;
- la réduction du bruit sur une vraie voix bruitée : les réglages d'afftdn sont à juger à l'oreille avec les boutons d'écoute ;
- le son dans un vrai Chrome, Firefox ou Safari avec la vidéo H.264/AAC : le navigateur de test ne lit que VP9/Opus.


## Étape E3 — Éditeur de montage : habillage

### Description
Tout se règle dans l'éditeur (Studio → Éditeur), avec les boutons **« Ajouter »** à gauche et le panneau de droite. L'habillage se calcule dans le temps du **montage** (il suit donc les coupes) et s'affiche en direct sur l'aperçu.
- **Titres et bandeaux** (« Ajouter un titre » / « Ajouter un bandeau ») : texte, sous-titre, début, durée (0,5 s à 10 min), position (centre, haut, bas), côté du bandeau, taille (50 à 200 %). Les mots `{titre}` et `{intervenant}` sont remplacés par ceux de la conférence. Ils se déplacent et se raccourcissent à la souris sur la piste « Titres et logo ». Jusqu'à 100 par montage.
- **Logo** : bibliothèque de logos (PNG, JPEG ou WebP, 3 Mo) ou image de la chaîne ; coin, taille (4 à 40 %), opacité, de… à…. Un logo utilisé par un montage, une version ou un modèle ne peut pas être supprimé.
- **Écran d'ouverture et écran de fin** : durée (1 à 15 s), titre, sous-titre (fond noir, filet or). Ils ne sont ajoutés à la vidéo qu'au rendu (étape E4).
- **Transitions** entre extraits : « Coupe », « Fondu au noir », « Fondu au blanc » (0,2 à 3 s), pour tous les raccords ou raccord par raccord (losange sur la piste vidéo). Le fondu en dissolution n'existe pas encore.
- **Sous-titres incrustés** : dessinés dans l'image au rendu (taille, haut/bas, fond sombre). Texte français ou arabe (écriture de droite à gauche, lettres liées).
- **Modèles** : « Habillage standard » et « Conférence avec intro » fournis ; l'organisateur enregistre un modèle pour sa chaîne, l'administrateur aussi pour toutes les chaînes. Appliquer un modèle remplace l'habillage (un seul « Annuler » le rétablit).
- **« Voir l'image finale »** : l'API compose avec FFmpeg l'image exacte du rendu à l'instant de la tête de lecture (ou de l'écran d'ouverture / de fin). C'est la référence ; l'aperçu du navigateur peut différer de quelques pixels (formes des lettres).
- Module `editor` **0.3.0**, migration `editor/003_dress.sql` (table `editor_templates`, colonne `meta` des logos). Police : DejaVu Sans, fournie avec le code (`api/src/modules/editor/fonts/`).
- Registre des problèmes : un défaut ancien est réglé (les versions automatiques ignoraient les changements de son et d'habillage).

### Prérequis
- Étape E2 déployée, module « Éditeur » actif. FFmpeg est déjà dans l'image de l'API (E2). Aucune variable `.env` nouvelle.
- Pour les logos importés : le stockage Garage doit accepter le dépôt depuis le navigateur (comme pour les musiques).

### Déploiement (GitHub Desktop + DockPanel)
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` (remplacer les fichiers).
2. GitHub Desktop : **Commit to main**, puis **Push origin**.
3. DockPanel → Git Deploy → **Redeploy `majlistv-api`** (la migration `003_dress.sql` s'applique au démarrage), puis **`majlistv-web`**. Le worker ne change pas.
4. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Exemples d'utilisation
- Ouvrir un montage, placer la tête de lecture à 0:05, **Ajouter un titre**, écrire `{titre}`, régler la durée à 5 s.
- **Ajouter un bandeau** avec `{intervenant}` en texte et la chaîne en sous-titre, côté gauche.
- **Ajouter un logo** → importer le logo de l'agence (ou « Image de la chaîne »), coin bas gauche, 12 %.
- **Ajouter une transition** → « Fondu au noir » 0,8 s pour tous les raccords.
- **Voir l'image finale** pour contrôler le résultat, puis **Enregistrer comme modèle**.

### Debug
- « Image impossible » (502) à « Voir l'image finale » : voir `docker logs` de `majlistv-api` (ligne « Éditeur : image finale impossible »). Au plus 2 images à la fois (sinon 429, réessayer).
- Logo « illisible » : le fichier n'est pas une image PNG/JPEG/WebP décodable par FFmpeg.
- Texte arabe sans lettres liées : la police n'est pas trouvée ; vérifier la présence de `api/src/modules/editor/fonts/*.ttf` dans l'image.
- Conflit 409 / 423 : le montage a été modifié ailleurs ou est pris par un autre éditeur (comme E1).

### Tests
```
cd api && python3 tests/test_editor_e3.py        # API : validation, droits, logos, modèles, images (FFmpeg)
cd web && node tests/e3_dress.mjs                # calculs de l'habillage (39 contrôles)
cd web && python3 tests/e3_dress.py              # navigateur : panneaux, timeline, image finale, modèles, lecture seule, arabe, 1024 px
```
Les tests E1 et E2 sont mis à jour (module 0.3.0 ; tous les boutons « Ajouter » sont actifs).

### Testé / non testé
**Testé** : tests ci-dessus (API, calculs, navigateur Chromium avec vidéo VP9), arabe et RTL, 1024 et 1440 px, lecture seule, rendu visuel vérifié sur planche de captures.
**Non testé** : construction de l'image Docker (polices, FFmpeg) ; conférence réelle d'une heure ; image finale depuis une vidéo H.264 réelle sur le VPS ; téléphone réel ; transition en dissolution (non faite) ; écrans d'ouverture/fin dans une vidéo (E4) ; différences de lettres entre l'aperçu navigateur et FFmpeg.


## Étape E4a — Éditeur de montage : rendu de la vidéo

### Description
Le bouton **« Rendre la vidéo »** de l'éditeur fabrique enfin le vrai fichier MP4 du montage. Remplacer la vidéo publiée par ce fichier sera l'étape **E4b**.
- **Deux choix** :
  - **Aperçu rapide** : 640 × 360, pour vérifier le montage, environ 0,3 × la durée de calcul ;
  - **Rendu final** : qualité de la source (360p, 720p ou 1080p selon l'original, en 16:9), H.264 + AAC, niveau sonore homogène en deux passes, environ 1 × la durée sur le VPS.
- **Ce qui est rendu** : le montage **enregistré**, avec :
  - les coupes ;
  - la voix d'origine (volume, coupure, petit fondu à chaque raccord, réduction du bruit, baisse sous la voix française) ;
  - la voix française ;
  - les musiques (boucle, fondus, baisse sous la voix) ;
  - les titres et bandeaux, le logo, les écrans d'ouverture et de fin, les fondus au noir et au blanc, les sous-titres incrustés (arabe compris).
- Ces réglages sont les mêmes que l'aperçu du site et « Voir l'image finale ». Seule différence assumée : le rendu applique un volume au-dessus de 100 %, ce que l'aperçu du navigateur ne sait pas faire.
- **Qui calcule** : le **worker** (`majlistv-worker`), un rendu à la fois, après les conversions de vidéos envoyées.
  - L'API prépare un **plan de rendu** (`api/src/modules/editor/plan.js`) : fichiers à lire, graphe FFmpeg, textes, courbes de volume.
  - Le worker (`worker/src/render.js`) télécharge les fichiers, mesure le son puis encode.
  - Source : l'original envoyé, ou, s'il n'existe plus, la meilleure qualité convertie.
- **Suivi** :
  - dans la fenêtre : en attente (place dans la file), préparation, mesure du son, encodage (%), envoi, puis « Prêt » ;
  - « Regarder », « Télécharger » (le fichier porte le titre et la date), « Effacer », « Annuler » (en attente ou en cours) ;
  - « Le montage a changé depuis ce rendu » quand on a modifié le montage après.
- **Studio → Activité** : « Aperçu du montage » / « Rendu du montage », avec priorité et pause (en attente). Le rendu est une **tâche lourde** : il suit la pause générale et la plage horaire des conversions, et la fenêtre de rendu prévient quand c'est le cas.
- **Limites** :
  - un rendu à la fois par montage ;
  - les 3 plus récents sont gardés (fichiers compris) ;
  - au plus 120 passages (les extraits qui se suivent sans transition sont regroupés) ;
  - 2 essais puis « en échec » avec le message de FFmpeg.
- **Registre des problèmes réglé** : la pause d'une analyse du son (file « editor », étape E2) échouait dans la base. La contrainte accepte maintenant « editor » et « render ».
- Versions :
  - module `editor` **0.4.0** (migration `editor/004_render.sql`, table `editor_renders`) ;
  - module `dubbing` **0.7.1** (la clé du fichier de la voix française est donnée au rendu, jamais au navigateur) ;
  - worker : `render.js` et les polices DejaVu dans son image (paquet Alpine `font-dejavu`).

### Prérequis
- Étapes E1 à E3 déployées, module « Éditeur de montage » actif.
- **Le worker doit être redéployé** : il contient le moteur de rendu et les polices. Aucune variable nouvelle. `FFMPEG_THREADS` (déjà prévu) limite les cœurs utilisés.
- Disque du VPS : pendant un rendu, le worker télécharge l'original (≈ 4 Go par heure en 1080p) et écrit le fichier rendu (≈ 1 à 2 Go par heure). Ces fichiers temporaires sont effacés à la fin.

### Déploiement (GitHub Desktop + DockPanel)
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv` (remplacer les fichiers), ou faire **Fetch origin** puis **Pull** (le commit est déjà poussé).
2. Si vous avez décompressé le zip : GitHub Desktop → **Commit to main**, puis **Push origin**.
3. DockPanel → Git Deploy, dans cet ordre :
   - **Redeploy `majlistv-api`** (la migration `004_render.sql` s'applique au démarrage) ;
   - puis **`majlistv-web`** ;
   - puis **`majlistv-worker`** (obligatoire pour cette étape).
4. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
5. Vérifier que le worker a bien les polices et FFmpeg :
```
docker exec dockpanel-git-majlistv-worker ls /usr/share/fonts/dejavu
docker exec dockpanel-git-majlistv-worker sh -c "ffmpeg -hide_banner -filters | grep -E ' (ass|amultiply|loudnorm|afftdn) '"
```
La première commande doit lister `DejaVuSans.ttf` et `DejaVuSans-Bold.ttf` (paquet `font-dejavu` de l'image du worker, depuis le correctif du 19/10), la seconde quatre lignes.

### Exemples d'utilisation
- Ouvrir un montage → **Rendre la vidéo** → **Aperçu rapide** → **Lancer le rendu**. La ligne passe à « Prêt » toute seule → **Regarder**.
- Satisfait ? **Rendu final** → **Lancer le rendu**, puis **Télécharger**. Vous pouvez fermer l'éditeur pendant le calcul.
- Pour suivre de l'extérieur : Studio → Activité.

### Debug
- Le rendu reste « En attente » :
  - le worker est arrêté ou occupé par une conversion : `docker logs --tail 50 dockpanel-git-majlistv-worker` ;
  - ou les tâches lourdes sont en pause, ou hors de leur plage horaire : Studio → Activité.
- « En échec » : le message de FFmpeg est affiché sous la ligne. Le journal complet est visible avec `docker logs dockpanel-git-majlistv-worker | grep rendu`.
- « Trop d’extraits pour un rendu » : plus de 120 passages. Supprimez ou regroupez quelques coupes.
- « Une musique du montage n’est plus dans la bibliothèque » : retirez-la du montage ou choisissez-en une autre.
- Texte en carrés ou arabe non lié : les polices manquent dans le worker (voir la commande de vérification ci-dessus ; le worker cherche dans `FONTS_DIR`, `/app/fonts`, puis `/usr/share/fonts/dejavu`).
- Le worker a été redéployé pendant un rendu : le rendu repart du début tout seul.

### Tests
```
cd api && node tests/test_render_plan.mjs        # plan + moteur avec le vrai FFmpeg : durées, fondu au noir, logo, textes, baisses du son mesurées, LUFS
cd api && python3 tests/test_editor_e4a.py       # API + worker : file, annulation (en attente / en cours), source de secours, 2 essais, 3 gardés, Activité, droits, audit
cd web && python3 tests/e4a_render.py            # navigateur : fenêtre, progression, prêt, télécharger, annuler, lecture seule, arabe, 1024 px
```
Les tests E1 à E3 sont mis à jour : module 0.4.0, bouton « Rendre la vidéo » actif.

### Testé / non testé
**Testé** :
- les trois tests ci-dessus et les régressions E1 à E3 (API, calculs, navigateur), plus le test du worker ;
- mesures sur un rendu de synthèse :
  - voix d'origine baissée de 14,9 dB sous la voix française (16,5 attendus, fenêtre de mesure de 1 s) ;
  - musique baissée de 10,3 dB sous la voix (12 attendus) ;
  - niveau final −17,3 LUFS pour une cible de −16 ;
  - durée exacte, fondu au noir au raccord, logo aux bons endroits.

**Non testé** :
- l'image Docker du worker (FFmpeg d'Alpine avec libass et amultiply, polices copiées) ;
- un rendu d'une vraie conférence d'une heure sur le VPS (temps, disque, mémoire) ;
- la lecture du fichier rendu (H.264) dans un vrai navigateur : le Chromium de test ne lit pas le H.264 ;
- un vrai téléphone (l'éditeur reste réservé à l'ordinateur).


## Étape E4b — Éditeur de montage : remplacer la vidéo publiée

### Description
Un **rendu final** prêt (étape E4a) peut maintenant **remplacer la vidéo publiée**. Le bouton « Remplacer la vidéo publiée » se trouve dans la fenêtre « Rendre la vidéo », à côté du rendu. Il ouvre l'écran de la maquette (« Studio v2 », écran 5) :
- **Avant / après** : durée (avec la différence), son, habillage, aperçu du rendu.
- **Ce qui sera mis à jour** :
  - transcription, traductions, résumé et chapitres ;
  - index de recherche ;
  - notes et reprises de lecture des spectateurs (comptées) ;
  - **version française à refaire** si la conférence a une piste de doublage ;
  - **quiz à revoir** : les questions dont le passage cité a été coupé, avec le lien « Voir les questions ».
- La case **« Conserver mes corrections de traduction au lieu de tout relancer »** évite de relancer quoi que ce soit : tout est seulement recalé.
- **Votre original est protégé** : l'ancienne vidéo est gardée 7 jours (réglage du module Stockage et archivage), puis archivée. L'écran affiche la place qu'elle occupe.
- **Étapes du remplacement**, suivies en direct (on peut fermer la page) :
  1. rendu ;
  2. préparation de la nouvelle version (qualités, miniatures) par le worker ;
  3. **bascule** ;
  4. nouvelle transcription ;
  5. traductions, résumé, chapitres, recherche.

**Choix d'Epok (19/10)** : la bascule a lieu dès que la nouvelle vidéo est prête, sans attendre la nouvelle transcription. À cet instant, tout est recalé d'un seul coup grâce à la **carte du temps** :
- les sous-titres de toutes les langues (phrase coupée : retirée ; intro : décalage) ;
- les chapitres ;
- les quiz, les actions « Et maintenant ? » et les rappels (passage coupé : « à revoir », donc dépublié) ;
- les notes et les reprises de lecture (instant coupé : début du passage suivant).

La nouvelle transcription, les traductions et les résumés arrivent ensuite et remplacent le texte recalé. Les quiz sont alors rattachés au texte de leur passage dans la nouvelle transcription.

Les spectateurs déjà en lecture gardent l'ancienne version jusqu'au bout : elle reste servie **6 heures**, puis elle est effacée.

Autres effets du remplacement :
- **Doublage** : la piste française suit l'ancienne vidéo, elle est donc retirée et à refaire dans Audio et doublage. Les demandes de doublage en cours sont annulées.
- **Montage** : le montage d'avant est rangé en version nommée (« Montage publié le … »). Le projet repart de la nouvelle vidéo entière, qui contient déjà les coupes et l'habillage.
- **Restaurer l'original** (sur le même écran, après la bascule) annule le dernier remplacement :
  - l'original est reconverti ; s'il a été archivé, le module Stockage et archivage le fait d'abord revenir des archives ;
  - tout revient comme avant : vidéo, phrases, traductions, résumés, quiz, actions, rappels, notes, piste française et montage ;
  - ce qui a été créé entre-temps (nouvelles notes…) est recalé.
- **Studio → Activité** : « Nouvelle version de la vidéo » ou « Restauration de l'original » (tâche lourde : pause, priorité, plage horaire).
- **Studio → Contenus** : l'étape « Montée » passe à « faite » après un remplacement.
- **Stockage et archivage** : la carte « Originaux en attente » affiche les originaux gardés. Ils sont archivés automatiquement après N jours.
- **Registre, point 3 réglé** : quand le doublage efface un fichier de travail déjà archivé, sa copie chez le fournisseur est maintenant effacée elle aussi (statut « copie d'archive effacée », relançable en cas d'échec).

Versions :
- `editor` **0.5.0** (migration `editor/005_replace.sql`) ;
- `dubbing` **0.8.0** et service de doublage 0.4.1 ;
- `storage` **0.3.0** (migration `storage/002_cleanup.sql`) ;
- migration du socle `056_media_prefix.sql` (dossier HLS de la version publiée) ;
- worker : `replace.js`.

### Prérequis
- Étape E4a déployée (le worker calcule les rendus).
- Pour l'archivage de l'original : le module « Stockage et archivage » doit être actif et son fournisseur réglé. Sans cela, l'original est gardé dans Garage, sans limite.
- Place sur Garage : l'original reste N jours en plus de la nouvelle version (l'écran affiche sa taille). L'ancienne version HLS est effacée 6 h après la bascule.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull** (le commit est déjà poussé). Ou bien décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, puis **Commit to main** et **Push origin**.
2. DockPanel → Git Deploy, dans cet ordre :
   - **`majlistv-api`** (migrations `056_media_prefix.sql`, `editor/005_replace.sql`, `storage/002_cleanup.sql`) ;
   - **`majlistv-web`** ;
   - **`majlistv-worker`** ;
   - **`majlistv-dubbing`** (petit changement : copies d'archive signalées).
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Exemples d'utilisation
- Éditeur → **Rendre la vidéo** → **Rendu final** → attendre « Prêt » → **Remplacer la vidéo publiée**. Vérifier l'écran avant / après, puis cliquer sur **Remplacer la vidéo publiée** et confirmer.
- Pour garder des sous-titres corrigés à la main, cocher **« Conserver mes corrections »** avant de remplacer.
- Après la bascule, revoir les questions signalées (**Voir les questions**) et relancer le doublage (Audio et doublage).
- Pour revenir en arrière : Éditeur → projet → `/replace` (ou le même écran) → **Restaurer l'original**.

### Debug
- Le remplacement reste à « Préparation » : vérifier que le worker tourne (`docker logs --tail 50 dockpanel-git-majlistv-worker | grep "nouvelle version"`) et que les tâches lourdes ne sont pas en pause (Studio → Activité).
- La bascule n'arrive pas alors que la préparation est finie : l'API attend qu'une transcription ou une traduction en cours d'écriture se termine (pour ne pas mélanger l'ancienne et la nouvelle vidéo). Voir `docker logs dockpanel-git-majlistv-api | grep -i remplacement`.
- « L'original n'est ni dans le stockage ni dans les archives » : le fichier a été supprimé à la main ; la restauration n'est plus possible.
- Restauration « en attente de l'archive » : la suite dépend du module Stockage et archivage (Studio → Paramètres → Stockage et archivage, ligne de l'original).

### Tests
```
cd api && node tests/test_timemap.mjs            # carte du temps : instants, phrases, chapitres, carte inverse, passages cités
cd .. && python3 api/tests/test_editor_e4b.py    # API + worker : remplacement complet, suite, nettoyage, restauration, archives, annulation, registre 3
python3 api/tests/test_storage_e4b.py            # avec un vrai serveur SFTP de test : copie d'archive effacée, original archivé puis restauré
cd web && python3 tests/e4b_replace.py           # navigateur : écran avant/après, remplacement, suivi, restauration, arabe, 1440 / 1024 / 390 px
```
Les tests E1 à E4a, `test_modules.py` et `test_module_removal.py` (modules editor, dubbing, storage) sont à jour et passent.

### Testé / non testé
**Testé** :
- les tests ci-dessus, avec le vrai FFmpeg, le vrai code du worker et un vrai serveur SFTP de test ;
- les régressions de l'éditeur, du lecteur (version française), du doublage (service avec moteurs factices) et du stockage.

**Non testé** :
- les images Docker (worker, API) ;
- un remplacement d'une vraie conférence d'une heure sur le VPS (temps de conversion, puis Whisper et traductions) ;
- la lecture d'un spectateur réel pendant la bascule (le mécanisme v= est testé, pas un vrai lecteur en cours) ;
- un vrai fournisseur PlanetHoster (seulement le serveur SFTP de test).

## Étape E5a — Éditeur de montage : montage par le texte

### Description
Dans l'éditeur, la colonne de droite a maintenant deux onglets : **Réglages** (comme avant) et **Texte**. L'onglet Texte élargit la colonne et affiche la transcription de la conférence, dans l'ordre de la vidéo d'origine :
- **clic sur un mot** : la vidéo y va (le mot lu est surligné pendant la lecture, le texte défile tout seul) ;
- **glisser** sur des mots, ou **Maj + clic**, pour sélectionner ;
- **« Couper la sélection »** ou la touche **Suppr** : le passage est retiré de la vidéo (les mots coupés sont **barrés**, la timeline montre les nouveaux extraits) ;
- **« Rétablir »** sur des mots barrés : le passage revient (l'extrait voisin est rallongé) ;
- **Ctrl+Z / Ctrl+Maj+Z** annulent et rétablissent comme les autres gestes ; **Échap** efface la sélection ;
- **recherche** dans le texte (sans accents ni majuscules, arabe sans voyelles) : Entrée sélectionne le résultat suivant, prêt à être coupé (pratique pour les « euh ») ;
- **langue** : la langue parlée se coupe **mot à mot** ; une traduction (ex. le français d'une conférence en arabe) se coupe **phrase par phrase**.

Ce que l'on coupe : du début du premier mot au début du mot suivant (si le silence fait moins d'une seconde), sinon jusqu'à 0,1 s après le dernier mot. Un passage repris deux fois dans le montage est coupé partout. Le montage garde toujours au moins un passage.

**Place des mots** (affichée sous le texte) :
- **précise** : la transcription Whisper horodate désormais chaque mot (nouveau réglage Admin → Paramètres → Transcription → « Horodater chaque mot », activé par défaut, environ 10 à 20 % de calcul en plus) ;
- **estimée** : conférences transcrites avant cette étape, sous-titres de l'auteur (YouTube, Vimeo), phrase corrigée à la main, traduction. La durée de la phrase est alors répartie entre ses mots selon leur longueur. Couper une phrase entière reste exact ; couper un mot isolé peut être décalé de quelques dixièmes de seconde.
- Après un remplacement de la vidéo (E4b), les mots horodatés de l'ancienne vidéo sont effacés ; la nouvelle transcription les refait.

**Registre** :
- point 23 réglé : à la restauration de l'original, une version française faite entre-temps sur la vidéo remplacée est retirée et ses fichiers effacés (copies d'archive comprises) ;
- point 24 ouvert (décision d'Epok) : place exacte des mots pour les conférences déjà transcrites ;
- point 25 : essai réel avec le vrai Whisper à l'étape F.

Versions : module `editor` **0.6.0** ; module `dubbing` (correctif du point 23, même version 0.8.0) ; migration du socle `057_transcript_words.sql` ; service de transcription (mots horodatés).
Pas de maquette pour cet écran dans « Studio v2 » : il reprend le style de l'éditeur (cartes arrondies, accents or, texte blanc).

### Prérequis
- Étapes E1 à E4b déployées.
- Rien à installer : faster-whisper sait déjà horodater les mots.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull** (le commit est déjà poussé). Ou bien décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, puis **Commit to main** et **Push origin**.
2. DockPanel → Git Deploy, dans cet ordre :
   - **`majlistv-api`** (migration `057_transcript_words.sql`) ;
   - **`majlistv-web`** ;
   - **`majlistv-transcriber`** (mots horodatés).
   - Le worker n'a pas changé.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
4. Vérifier la migration :
```
docker logs dockpanel-git-majlistv-api 2>&1 | grep 057
```

### Exemples d'utilisation
- Studio → Éditeur → un projet → onglet **Texte** → glisser sur « euh… » → **Suppr**.
- Rechercher « euh » → **Entrée** → **Couper la sélection** → **Entrée** (résultat suivant) → **Couper la sélection**…
- Couper toute une digression : clic sur le premier mot, **Maj + clic** sur le dernier, **Suppr**.
- Se tromper : **Ctrl+Z**, ou sélectionner les mots barrés puis **Rétablir**.

### Debug
- « Pas encore de texte » : la transcription de la conférence n'est pas prête (Studio → Contenus, étape « Transcrite »).
- Place des mots toujours « estimée » sur une nouvelle conférence : vérifier le réglage « Horodater chaque mot », puis la ligne « … mots horodatés » dans les journaux :
```
docker logs --tail 100 dockpanel-git-majlistv-transcriber 2>&1 | grep "mots horodatés"
```
- Voir quelles conférences ont des mots horodatés (20 dernières par nombre de mots) :
```
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT t.title, w.lang, count(*) AS mots FROM transcript_words w JOIN talks t ON t.id = w.talk_id GROUP BY t.title, w.lang ORDER BY 3 DESC LIMIT 20"'
```

### Tests
```
node web/tests/e5a_ops.mjs                 # couper / rétablir un passage, passage d'un mot, recherche (arabe compris)
python3 transcriber/tests/test_words.py    # faux Whisper + vraie base : mots enregistrés, réglage, sous-titres de l'auteur
python3 api/tests/test_editor_e5a.py       # route des mots : précis / estimés, traduction, droits
cd web && python3 tests/e5a_text.py        # navigateur : onglet Texte, couper, annuler, rétablir, recherche, phrase par phrase, lecture seule, arabe, 1024 px
```
Les tests E1 à E4b sont à jour (version 0.6.0) et passent ; `test_editor_e4b.py` vérifie aussi l'effacement des mots à la bascule et à la restauration.

### Testé / non testé
**Testé** : les tests ci-dessus (vraie base, vraie API, vrai site dans Chromium, Whisper simulé).
**Non testé** :
- le vrai faster-whisper avec `word_timestamps=True` (le modèle ne peut pas être téléchargé ici) : à vérifier sur le VPS à l'étape F ;
- une vraie conférence d'une heure (environ 8 000 mots) : la page est prévue pour (seule la phrase lue est redessinée), mais pas mesurée sur un vrai poste ;
- Safari et Firefox (Chromium seulement).

## Étape E5b — Éditeur de montage : extraits courts 9:16

### Description
Nouvelle page **Studio → Éditeur → un projet → « Extraits 9:16 »** (bouton doré dans l'en-tête de l'éditeur, adresse `/studio/editor/<projet>/shorts`). Elle fabrique de courts extraits **verticaux 1080 × 1920** pour les réseaux sociaux (Reels, Shorts, TikTok) :
- **« Nouvel extrait »** : crée un extrait de 30 s à l'endroit de la lecture (de 1 s à 3 min, 30 extraits au plus par conférence) ; chaque extrait est un petit projet à part (le montage principal n'est pas touché) ;
- **passage** : début et fin en secondes, ou **clic dans le texte** de la conférence (1er clic = phrase de début, 2e clic = phrase de fin) ;
- **cadre vertical** : un cadre doré, à faire glisser sur la vidéo 16:9 (ou flèches du clavier), choisit la partie de l'image gardée ; un aperçu vertical (téléphone) le montre en direct ;
- **titre** affiché en haut pendant les 4 premières secondes (peut être masqué) ;
- **sous-titres courts** : 5 mots au plus par groupe, grosse police blanche, d'après l'horodatage des mots (E5a) ; langue parlée ou traduction ;
- **voix française** (si un doublage existe) à la place de la voix d'origine ;
- **enregistrement automatique** des réglages (0,7 s après le dernier geste) ;
- **« Rendre l'extrait »** : aperçu rapide **360 × 640** ou rendu final **1080 × 1920** (720 × 1280 si la source est en 720p, 360 × 640 si elle est plus petite), niveau sonore −14 LUFS (réseaux sociaux), MP4 à télécharger. Le calcul se fait sur le serveur (worker) et continue si on quitte la page ; il apparaît dans Studio → Activité ; les 3 derniers rendus sont gardés.

Un extrait vertical **ne peut pas remplacer la vidéo publiée** (le lien « Remplacer » n'existe pas pour lui, et le serveur le refuse). Supprimer le montage d'une conférence supprime ses extraits.

Versions : module `editor` **0.7.0** ; migration du module `006_shorts.sql` (colonne `short`) ; le **worker change** (formats verticaux). Pas de maquette dans « Studio v2 » : style de l'éditeur (cartes arrondies, accents or, texte blanc), responsive 390 → 1440 px, arabe en RTL.

### Prérequis
- Étapes E1 à E5a déployées. Les sous-titres courts sont les plus justes avec des mots horodatés (E5a) ; sinon la place des mots est estimée.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull** (le commit est déjà poussé). Ou bien décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, puis **Commit to main** et **Push origin**.
2. DockPanel → Git Deploy, dans cet ordre :
   - **`majlistv-api`** (migration du module `006_shorts.sql`) ;
   - **`majlistv-web`** ;
   - **`majlistv-worker`** (rendu vertical).
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
4. Vérifier la migration :
```
docker logs dockpanel-git-majlistv-api 2>&1 | grep -i "editor" | grep -i 006
```

### Exemples d'utilisation
- Éditeur → **Extraits 9:16** → **Nouvel extrait** → régler début/fin → faire glisser le cadre sur le visage du conférencier → **Rendre l'extrait** → **Aperçu rapide** → regarder → **Rendu final** → **Télécharger**.
- Choisir une citation : clic sur la première phrase dans « Choisir le passage dans le texte », puis sur la dernière.
- Sous-titres en français pour une conférence arabe : « Langue des sous-titres » → FR (traduction, place estimée).

### Debug
- Rendu « échoué » : le message est dans la fenêtre de rendu ; journaux :
```
docker logs --tail 100 dockpanel-git-majlistv-worker 2>&1 | grep -i render
```
- Pas de sous-titres dans le rendu : la case « Sous-titres courts » est décochée, ou la conférence n'a pas de transcription.
- Liste des extraits d'une conférence (base) :
```
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT title, short->>'"'"'lang'"'"' AS langue, updated_at FROM editor_projects WHERE kind = '"'"'short'"'"' ORDER BY updated_at DESC LIMIT 20;"'
```

### Tests
```
node api/tests/test_short.mjs              # moteur : passage, sous-titres courts, cadre, rendu FFmpeg réel (moitié rouge / moitié bleue, pixels vérifiés)
python3 api/tests/test_editor_e5b.py       # routes, révisions, droits, rendu par le worker 360×640 puis 720×1280, remplacement refusé, suppression, activité
cd web && python3 tests/e5b_shorts.py     # navigateur : création, cadre glissé, texte, titre, sous-titres, rendu, suppression, arabe, 390 / 1024 / 1440 px
```
**Testé** : tout ce qui précède (FFmpeg, S3 de test, Chromium). **Non testé** (étape F) : image Docker du worker (police, FFmpeg d'Alpine), vraie vidéo H.264 du VPS, lecture sur les réseaux (registre 26, 27).

## Étape E5c — Éditeur de montage : « Préciser la place des mots »

### Description
Dans l'éditeur → onglet **Texte**, quand la place des mots est seulement **estimée** (conférence transcrite avant l'étape E5a, texte corrigé à la main), un bouton **« Préciser la place des mots »** apparaît sous le texte :
- le serveur **réécoute l'audio** de la conférence (même Whisper que pour la transcription) ;
- pour chaque phrase, il retrouve **les mots du texte existant** dans ce que Whisper entend (sans tenir compte des accents, des majuscules, de la ponctuation, ni des voyelles arabes) et note le **moment exact** de chacun ;
- **le texte et les traductions ne changent jamais** (même les phrases corrigées à la main) ;
- un mot que Whisper n'a pas entendu (un « euh » supprimé, par exemple) est placé entre ses voisins ;
- une phrase dont **moins de la moitié des mots** sont retrouvés (texte trop différent de ce qui est dit) n'est **pas touchée** : elle garde sa place d'avant ;
- la page se met à jour toute seule à la fin (suivi toutes les 4 secondes) : « Terminé : N phrases précisées sur M. » ; le calcul continue si on quitte la page.

Réservé aux conférences **envoyées sur le site** et déjà transcrites (les vidéos YouTube / Vimeo ne sont pas hébergées : le serveur n'a pas leur son). Compter quelques minutes (même ordre de grandeur que la transcription, sans le texte à produire). Le calcul passe après les transcriptions en attente et respecte la pause du Studio → Activité.

Versions : module `editor` **0.7.1** ; migration du socle `058_word_align.sql` (table `word_align_jobs`) ; **service de transcription** modifié (`align.py`, tâche `process_align`).

### Prérequis
- Étapes E1 à E5b déployées.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull** (le commit est déjà poussé). Ou bien décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, puis **Commit to main** et **Push origin**.
2. DockPanel → Git Deploy, dans cet ordre :
   - **`majlistv-api`** (migration `058_word_align.sql`) ;
   - **`majlistv-web`** ;
   - **`majlistv-transcriber`** (calcul des mots).
   - Le worker n'a pas changé.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
4. Vérifier la migration :
```
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\\d word_align_jobs"'
```

### Exemples d'utilisation
- Studio → Éditeur → un projet → onglet **Texte** → en bas : **Préciser la place des mots** → attendre « Terminé » → le pied de page indique « place de chaque mot précise ».
- Ensuite, couper un mot isolé (« euh ») est exact au dixième de seconde.

### Debug
- Voir les demandes en cours ou échouées :
```
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT t.title, j.status, j.progress, j.aligned, j.total, j.error, j.updated_at FROM word_align_jobs j JOIN talks t ON t.id = j.talk_id ORDER BY j.updated_at DESC LIMIT 20;"'
```
- Journaux du service : `docker logs --tail 100 dockpanel-git-majlistv-transcriber 2>&1 | grep "place des mots"`.
- Une demande reste « en attente » : une transcription est en cours (elle passe d'abord), ou la file est en pause (Studio → Activité).
- « Terminé : 0 phrases précisées » : le texte ne ressemble pas à ce que Whisper entend (mauvaise langue déclarée, texte très corrigé).
- Demande interrompue (redémarrage du service) : elle est remise en attente toute seule au démarrage.

### Tests
```
python3 transcriber/tests/test_align.py    # alignement (accents, arabe, mots non entendus), tâche complète avec faux Whisper et vraie base
python3 api/tests/test_editor_e5c.py       # route : demande, suivi, refus (externe, pas de texte, droits), migration
cd web && python3 tests/e5c_align.py       # navigateur : bouton, attente, calcul, mise à jour automatique, coupe d'un mot, arabe
```
**Non testé** (étape F, registre 25) : le vrai Whisper (le faux entend exactement le texte) et une conférence d'une heure.

## Étape D3a — Doublage : banc d'essai des nouvelles voix (Voicebox, Qwen3-TTS)

### Description
Première partie de l'étape D3 (voix variées). Décisions d'Epok (19/10) : **banc d'essai d'abord**, voix voulues : **femme adulte, fille, garçon, autre homme (âgé ou jeune)** ; les échantillons sont fabriqués par Epok avec **Voicebox** sur son PC.

Recherche (licences, français, vitesse sans carte graphique) :

| Outil / moteur | Licence | Français | Sans carte graphique |
|---|---|---|---|
| Voicebox (voicebox.sh, studio de voix) | MIT | selon le moteur | oui, plus lent |
| Qwen3-TTS 0.6B / 1.7B (clonage) | Apache 2.0 | oui | ~2,5 à 3 s de calcul par seconde de voix (chiffre publié, 4 cœurs) |
| Qwen VoiceDesign 1.7B (voix par description) | Apache 2.0 | oui (moins précis qu'en anglais) | lent, 16 à 32 Go de mémoire : sur un PC, pas sur le VPS |
| Chatterbox Multilingual | MIT | oui | trop lent (11 à 34, mesuré à l'étape 0) |

Le banc (dossier `dubbing/d3bench/`, rien n'est branché au site) compare pour chaque échantillon la **méthode actuelle** (Tom + conversion ChatterboxVC) et **Qwen3-TTS** (clonage direct), sur 40 phrases d'une conférence, et écrit un tableau (vitesse, mémoire, débordements) + les fichiers à écouter. Le banc de l'étape 0 gagne le moteur `qwen` et l'option `--synthetic` (voix de synthèse : pas de consentement à fournir, noté dans le rapport).

Tout le mode d'emploi (descriptions des voix à coller dans Voicebox, texte à faire lire, commandes) est dans **`dubbing/d3bench/README.md`**.

### Prérequis
- Banc de l'étape 0 sur le VPS (`/root/dubbing-test`), Voicebox sur le PC d'Epok.

### Déploiement
Rien à redéployer dans DockPanel (le site, l'API et le service de doublage n'ont pas changé). Sur le VPS :
```
cd /root/dubbing-test
(cd src && git pull)
docker build -t majlis-dub-test src/dubbing/etape0
docker build -t majlis-dub-d3 -f src/dubbing/d3bench/Dockerfile src/dubbing
docker run --rm --entrypoint python majlis-dub-d3 test_d3.py
mkdir -p /root/dubbing-test/in/voix
cp src/dubbing/d3bench/texte-reference.txt /root/dubbing-test/in/voix/texte.txt
```
Puis déposer les échantillons dans `/root/dubbing-test/in/voix/` (WinSCP) et lancer :
```
cd /root/dubbing-test
src/dubbing/d3bench/run_d3.sh arabe1 40
cat /root/dubbing-test/out/arabe1/d3/comparaison.md
```

### Exemples
- Voir `dubbing/d3bench/README.md` (une seule voix à la main, grand modèle 1.7B, refaire le tableau).

### Debug
- Journal d'un essai : `tail -40 /root/dubbing-test/out/arabe1/d3/<voix>-<méthode>.log`.
- `Killed` (code 137) : mémoire insuffisante (modèle 1.7B) → rester sur 0.6B.

### Tests
```
python3 dubbing/d3bench/test_d3.py         # faux Qwen : moteur, --synthetic, refus, tableau (17 contrôles)
python3 dubbing/etape0/test_pipeline.py    # banc de l'étape 0 inchangé
```
**Non testé** : le vrai Qwen3-TTS, l'image Docker, Voicebox (rien ne se télécharge depuis mon environnement). Registre : point 29.

### Suite
D3b : intégrer au service de doublage la méthode choisie à l'écoute (nouvelles voix dans Studio → Audio et doublage → Voix), puis D3c : détection automatique des intervenants.

**Complément D3a (20/10)** : le banc accepte aussi de **vraies voix déjà enregistrées** (sans Voicebox). Pour chacune : un fichier `<voix>.consent` d'une ligne `AAAA-MM-JJ|Nom` (autorisation, obligatoire pour une vraie personne ; sans lui la voix est traitée comme une voix de synthèse), et si possible `<voix>.txt` avec le texte exact lu. Détails : `dubbing/d3bench/README.md` §1 bis.

**Complément D3a (20/10, après écoute)** : Epok a essayé ses voix de femmes et d'enfants avec la méthode actuelle (Tom + conversion) : « on n'entend que Tom ». Constat : la conversion garde le rythme et l'intonation de Tom et ne convient qu'à une voix d'homme proche. Le banc se lance donc avec Qwen seul : `METHODS=qwen ONLY="…" src/dubbing/d3bench/run_d3.sh arabe1 40`. Voix reçues : 9 fichiers (3 enfants sur 5 annoncés, 3 hommes, 3 femmes), convertis en WAV 24 kHz mono.

## Complément (20/10) — Télécharger les sous-titres (.vtt) depuis le Studio

### Description
Studio → Contenu → onglet Transcription : à côté du choix de la langue, le bouton **« Télécharger les sous-titres (.vtt) »** enregistre sur votre ordinateur les sous-titres de la langue affichée, au format WebVTT (`sous-titres-fr.vtt`). C'est la version **enregistrée** : le bouton est grisé tant que des corrections ne sont pas enregistrées. Il remplace la commande de base de données utilisée pour préparer le banc d'essai du doublage.

Côté API : `GET /talks/:id/studio/subs/<langue>.vtt` (connexion obligatoire ; réservé à l'organisateur de la conférence ou à l'administrateur ; 404 si la langue n'a pas de sous-titres).

### Prérequis
Aucun (pas de migration, pas de nouveau réglage).

### Déploiement
GitHub Desktop (Commit to main, Push origin), puis DockPanel → Git Deploy → Redeploy : **majlistv-api**, puis **majlistv-web**. Pas besoin du worker ni des autres services. Ensuite sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Exemples d'utilisation
- Récupérer le français d'une conférence pour le banc d'essai : bouton, puis déposer le fichier dans `/root/dubbing-test/in/` sous le même nom que la vidéo (`ma-conf.vtt` + `ma-conf.mp4`).
- Relire ou corriger les sous-titres dans un autre outil.

### Debug
- Le bouton est grisé : enregistrer ou annuler les corrections en cours.
- Message « Impossible de télécharger les sous-titres » : session expirée (se reconnecter) ou langue sans sous-titres.

### Tests
```
python3 api/tests/test_studio_vtt.py     # API : format, échappement, droits, langues (12 contrôles)
cd web && npx next build && python3 tests/vtt_export.py   # navigateur : téléchargement réel FR/EN/AR, 390 px
```
Testé : les deux (voir ci-dessus). **Non testé** : sur le serveur réel.

## Étape E5d — Extraits 9:16 : le cadre suit le visage

### Description
Décision d'Epok du 20/10 : dans un extrait vertical, **le cadre doit suivre le conférencier** au lieu de rester fixe. Sur la page **Studio → Éditeur → Extraits 9:16** :
- une case **« Le cadre suit le visage »** : en la cochant, l'extrait demande une **analyse** au serveur (le service de transcription lit les images du passage, repère les visages, et garde **le plus grand et le plus présent**, comme décidé) ;
- l'avancement s'affiche tout seul (« en attente », « en cours : 40 % », « terminée : visage repéré 90 % du temps ») ; on peut quitter la page, le calcul continue ;
- le cadre doré se **déplace avec la vidéo** dans la fenêtre de lecture, et l'aperçu vertical aussi ; le rendu (aperçu rapide ou final) utilise la même trajectoire ;
- le cadre bouge comme un cadreur : il **reste immobile** tant que le visage reste dans la zone centrale, puis le rattrape **en douceur** (vitesse limitée, pas de secousse) ;
- **corrections à la main** (choisies par Epok) : quand le suivi se trompe sur un passage, on **met en pause et on glisse le cadre doré** : une correction de 3 s est créée à cet endroit, le cadre y reste à la position choisie et glisse en 0,4 s avant et après. Les corrections se règlent dans une liste (début, fin, position en %), se suppriment, et le bouton « Ajouter une correction ici » en crée une à l'instant de la vidéo. Elles marchent aussi **sans suivi** (par-dessus un cadre fixe) ;
- si l'on **change le passage** de l'extrait, l'analyse n'est plus à jour : « à refaire » (en attendant, le rendu garde le cadre fixe et affiche un avertissement) ; les corrections sont recoupées au nouveau passage ;
- si aucun visage n'est trouvé : message clair, le cadre reste fixe.

Réservé aux vidéos **envoyées sur le site** (comme tout l'éditeur). Détection : modèle **YuNet** (OpenCV, licence MIT, 230 Ko, sur processeur, sans réseau ni carte graphique) ; environ 3 images par seconde de passage, réduites à 640 px de large. Le cadre ne bouge que **horizontalement** (il garde toute la hauteur de l'image, pas de zoom).

Versions : module `editor` **0.8.0** ; migration du socle `059_face_track.sql` (table `face_track_jobs`) ; **service de transcription** modifié (`track.py`, `faces.py`, modèle `models/face_detection_yunet_2023mar.onnx`, dépendance `opencv-python-headless`). Le worker n'a **pas** changé (il lit la trajectoire dans le plan envoyé par l'API).

### Prérequis
- Étapes E1 à E5c déployées.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull** (le commit est déjà poussé). Ou bien décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, puis **Commit to main** et **Push origin**.
2. DockPanel → Git Deploy → Redeploy, dans cet ordre :
   - **`majlistv-api`** (migration `059_face_track.sql`) ;
   - **`majlistv-web`** ;
   - **`majlistv-transcriber`** : l'image est reconstruite (OpenCV s'installe : la première fois, quelques minutes de plus).
   - Le worker n'a pas changé.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
4. Vérifier la migration et le service :
```
docker logs --tail 80 dockpanel-git-majlistv-api 2>&1 | grep -i 059
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\\d face_track_jobs"'
docker exec dockpanel-git-majlistv-transcriber python -c "import cv2; print('OpenCV', cv2.__version__)"
docker exec dockpanel-git-majlistv-transcriber ls -la /app/models
```
Le dernier doit lister `face_detection_yunet_2023mar.onnx` (232 589 octets).

### Exemples d'utilisation
- Studio → Éditeur → un projet → **Extraits 9:16** → ouvrir un extrait → cocher **Le cadre suit le visage** → attendre « Analyse terminée » → lire le passage : le cadre doré suit le conférencier → **Rendre l'extrait**.
- Corriger un moment : mettre la vidéo en pause à l'endroit où le cadre se trompe → glisser le cadre doré sur la bonne personne → une correction de 3 s apparaît dans la liste ; ajuster début / fin / position si besoin.
- Changer le passage de l'extrait → cliquer **Refaire l'analyse**.

### Debug
- Voir les analyses :
```
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT t.title, j.status, j.progress, j.from_s, j.to_s, j.coverage, j.faces, j.error, j.updated_at FROM face_track_jobs j JOIN talks t ON t.id = j.talk_id ORDER BY j.updated_at DESC LIMIT 10;"'
```
- Journaux du service : `docker logs --tail 100 dockpanel-git-majlistv-transcriber 2>&1 | grep "suivi du visage"`.
- « En attente » longtemps : le service traite d'abord les transcriptions, puis « Préciser la place des mots », puis le suivi du visage (une demande à la fois).
- « Aucun visage repéré » : le conférencier est trop petit, de dos, ou la scène trop sombre ; le cadre reste fixe, utiliser les corrections à la main.
- « seules les vidéos envoyées sur le site… » : vidéo YouTube / Vimeo, non analysable.
- Le cadre saute d'une personne à l'autre : corriger à la main le passage (une correction garde le cadre en place), ou choisir un passage où une seule personne est à l'image.
- Le rendu affiche « Le suivi du visage n'est pas prêt pour ce passage » : analyse absente, en cours ou périmée (passage changé) → la relancer ; le rendu a utilisé le cadre fixe.

### Tests
```
python3 transcriber/tests/test_track.py      # calcul de la trajectoire (visages → points clés) : 26 contrôles
python3 transcriber/tests/test_faces.py      # vraie détection OpenCV + YuNet sur une vidéo d'essai (vrai visage qui marche), de bout en bout
python3 transcriber/tests/test_track_job.py  # le service traite une vraie demande : base, stockage, vidéo, échecs, reprise
cd api && node tests/test_follow.mjs         # trajectoire, corrections, expression FFmpeg, rendu réel (vrai FFmpeg) : le cadre avance
python3 api/tests/test_editor_e5d.py         # routes (analyse, corrections, périmée), rendu du worker, suppression
cd web && python3 tests/e5d_follow.py        # navigateur : case, avancement, cadre qui bouge, glisser = correction, arabe, 390 px
```
Les essais des anciens extraits (`test_short.mjs`, `test_editor_e5b.py`, `e5b_shorts.py`) passent toujours : sans suivi, le cadre fixe donne exactement le même rendu qu'avant.

### Testé / non testé
- **Testé** : tout ce qui précède, avec un **vrai visage** (photo de l'astronaute de scikit-image, domaine public) déplacé sur un fond, de vraies images lues par FFmpeg depuis le stockage de test, la vraie détection YuNet, un vrai rendu FFmpeg (le rouge au centre de l'image verticale suit la trajectoire).
- **Non testé** (étape F, registre 30) : une vraie conférence (éclairage, barbe, voile, profil, plusieurs personnes, changements de plan), l'image Docker du transcripteur avec OpenCV, le temps d'analyse sur le serveur, la qualité du résultat vu avec vos yeux.
- Limites connues : le cadre bouge seulement de gauche à droite (pas de zoom) ; un changement de plan de caméra fait « sauter » le cadre vers la personne la plus présente ; l'analyse n'apparaît pas dans Studio → Activité (registre 31).



## Étape D3b — Doublage : voix de synthèse, catégories, choix de la voix de conversion

### Description
Décision d'Epok du 20/10 : **on garde la méthode actuelle** (voix de base Piper, puis conversion de voix ChatterboxVC) ; Qwen3-TTS est abandonné (inutilisable sur processeur seul, registre 29). Cette étape ajoute, dans **Studio → Audio et doublage** :
- **Voix → Ajouter une voix cible** : case **« Voix de synthèse »** (voix fabriquée avec Voicebox ou un outil du même genre, **aucune personne réelle**). Cochée, la date et le nom du consentement ne sont plus demandés ; **décochée, tout reste obligatoire comme avant** (case de consentement, date, nom). Qui a déclaré la voix et quand est toujours enregistré ;
- la liste des voix affiche l'étiquette **« Synthèse »** et, pour une vraie voix, la ligne « Consentement du … » comme avant ;
- **filtre par catégorie** (Femme, Homme, Enfant) au-dessus de la liste ; la catégorie « Enfant » couvre fille et garçon ;
- **Réglages par défaut** et réglages d'une conférence : la voix de conversion est **rangée par catégorie**, avec un bouton **« Écouter »** (échantillon) et un rappel que la conversion allonge le calcul (l'estimation s'appuie sur les doublages déjà faits avec la même configuration).

Rien ne change côté service de doublage : une voix de synthèse sert d'échantillon exactement comme une voix autorisée.

Vitesse (mesures réelles du VPS, `dub_jobs`) : voix de base seule **0,18 à 0,32** (une heure de conférence ≈ 11 à 20 min). Avec conversion de voix : **jamais encore mesurée en service** ; le banc D3a (3 phrases, 2 cœurs) donnait 7,05, chiffre trop pessimiste (coûts fixes sur un échantillon court) ; l'estimation de l'écran utilise le modèle 2,0 + 0,3 + 0,42 × étapes (≈ 3,6 à 4,4) tant qu'aucun vrai doublage avec conversion n'a été fait. Le premier aperçu avec voix cible donnera la vraie valeur.

Versions : module `dubbing` **0.9.0** ; migration du module **`005_synthetic_voices.sql`** (colonne `synthetic`, contraintes : une voix cible a un consentement **ou** est une voix de synthèse ; une voix de base n'est jamais « synthèse »).

### Prérequis
- Module « Doublage français » actif (étapes S1 à D2 déployées).

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull** (le commit est poussé). Ou décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, puis **Commit to main** et **Push origin**.
2. DockPanel → Git Deploy → Redeploy : **`majlistv-api`** (migration 005), puis **`majlistv-web`**. Le worker, le transcripteur et le service de doublage ne changent pas.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
4. Vérifier la migration :
```
docker logs --tail 200 dockpanel-git-majlistv-api 2>&1 | grep -i "005_synthetic"
docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d dub_voices"' | grep -i -E "synthetic|target_ok"
```

### Debug
- « Cochez la case de consentement… » en ajoutant une voix : c'est une vraie personne → saisir date et nom ; ou cocher « Voix de synthèse » si personne réelle n'est derrière.
- « L'envoi du fichier a échoué » : l'envoi direct vers le stockage a été refusé (CORS du bucket ou `CSP_STORAGE_ORIGINS` du site) ; même cause que pour les logos.
- Migration non appliquée : relancer `majlistv-api` et relire ses journaux (commande ci-dessus).

### Exemples d'utilisation
- Studio → Audio et doublage → **Voix** → remplir le nom, choisir l'échantillon (wav/mp3/m4a), catégorie **Enfant**, cocher **Voix de synthèse** → **Ajouter**.
- **Réglages par défaut** (ou une conférence) → **Voix de conversion** → groupe **Enfant** → la voix ajoutée → **Écouter** pour contrôler l'échantillon → **Écouter 60 secondes** pour un essai (le temps réel de la conversion apparaît ensuite dans l'estimation).
- Les 4 échantillons d'Epok (femme-victoire, homme-hugo, fille-6ans, garçon) s'ajoutent de la même façon ; pour une vraie personne : décocher « Voix de synthèse » et saisir le consentement.

Tests : `api/tests/test_dubbing.py` (14 contrôles ajoutés : synthèse sans consentement, organisateur refusé, consentement toujours exigé sinon, contraintes de la base), `web/tests/d3b_voices.py` (formulaire, étiquettes, filtre, choix par catégorie, FR + AR, 390 / 1440 px).


## Étape E6a — Éditeur : timeline lisible, zoom de la frise et de l'aperçu

### Description
Retours d'Epok du 20/10 : les éléments de la timeline « se confondent », la vidéo n'est pas zoomable. **E6a** (la partie d'affichage ; E6b = placer les éléments sur la vidéo, E6c = format et qualité du rendu) :
- **Cause d'un vrai défaut trouvée** : le bandeau de nom de la timeline portait aussi la classe `.banner` du bandeau d'accueil du site (hauteur 380 à 640 px) : il recouvrait les pistes voisines. Corrigé.
- **Une couleur par piste** (repère coloré à gauche du nom) : Vidéo or, Voix d'origine brun, Voix française blanc cassé, Musique turquoise, Titres et logo violet (bandeaux en bleu), Sous-titres vert ; les phrases voisines des sous-titres alternent deux teintes.
- **Titres qui se chevauchent dans le temps** : rangés sur des **lignes séparées** (la piste grandit) ; le **logo a sa propre ligne** en bas de la piste.
- **Zoom de la timeline** : boutons **−** / **+**, **Tout voir**, curseur (jusqu'à 5 secondes visibles, au lieu de 20), et **Ctrl + molette** (ou pincement sur pavé tactile) : le point sous le curseur reste en place.
- **Zoom de l'aperçu** : **Ajusté / 150 % / 200 %** au-dessus de la vidéo ; l'habillage (titres, logo, sous-titres incrustés) grandit avec l'image ; la zone défile si elle dépasse.

Aucune donnée ni service modifié : seulement le site (web). Module `editor` inchangé (0.8.0).

### Prérequis
- Étapes E1 à E5d déployées.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull** (le commit est poussé), ou décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, puis **Commit to main** et **Push origin**.
2. DockPanel → Git Deploy → **Redeploy de `majlistv-web`** uniquement (ni API, ni worker).
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
4. Dans le navigateur : **Ctrl + Maj + R** sur l'éditeur pour vider le cache de la page.

### Debug
- Les anciennes couleurs persistent : cache du navigateur (Ctrl + Maj + R).
- Ctrl + molette zoome la page entière au lieu de la timeline : pointer d'abord la timeline (zone des pistes) ; les boutons + / − fonctionnent partout.
- Aperçu à 200 % coupé : c'est voulu, la zone défile ; revenir à « Ajusté ».

### Exemples d'utilisation
- Ajouter deux titres qui se chevauchent (Ajouter → Titre, à deux moments proches) : ils s'affichent l'un sous l'autre, le logo reste en bas.
- Zoomer sur 10 secondes pour caler un titre au mot près : **Ctrl + molette** sur la timeline, ou **+** ; revenir avec **Tout voir**.
- Vérifier la netteté d'un bandeau de nom : aperçu **200 %**.

Tests : `web/tests/e6a_timeline.py` (lignes séparées, logo, couleurs, zoom bouton et molette centré, aperçu 200 %, FR + AR, 1024 / 1440 px) ; `e1_editor.py`, `e2_audio.py`, `e3_dress.py` relancés : « Tout est bon ».


## Étape E6b — Éditeur : placer les éléments directement sur la vidéo

### Description
Retour d'Epok du 20/10 : placer et déplacer les éléments **sur la vidéo**, pas seulement avec les boutons haut / bas / coins.
- Dans l'aperçu de l'éditeur, **titres, bandeaux de nom, logo et sous-titres incrustés se prennent à la souris** et se posent où l'on veut. Un clic sur l'élément ouvre ses réglages à droite.
- Pendant le glissé : **zone de sécurité** (pointillés à 5 % des bords) et **repères dorés** ; **aimant** au centre de l'image (titres, sous-titres) et aux marges (bandeaux, logo).
- **Clavier** : cliquer l'élément puis **flèches** (0,5 %), **Maj + flèches** (5 %). **Ctrl+Z** annule chaque déplacement.
- Panneau de droite : « **Position libre** » et bouton **Revenir à la position prédéfinie** ; choisir Haut / Centre / Bas (ou un coin pour le logo) revient aussi au placement prédéfini.
- La position est enregistrée en **% de l'image** (indépendante de la taille de l'aperçu et de la qualité du rendu) ; **le rendu final et « Voir l'image finale » la respectent** (mêmes repères : centre du titre, bord gauche du bandeau, coin haut-gauche du logo, milieu des sous-titres). Le logo reste toujours entier dans l'image.
- Les montages existants ne changent pas (sans position libre = placement prédéfini comme avant).

Versions : module `editor` **0.9.0** (document « dress » : `x`, `y` pour les titres et le logo, `y` pour les sous-titres ; aucune migration SQL : le montage est un document JSON). Fichiers : `api/src/modules/editor/dress.js` (validation 0–100 %, `\pos` dans l'ASS, `logoXY`), `plan.js` (rendu du worker), `web/modules/editor/DressOverlay.js`, `DressPanel.js`, `Editor.js`, `ops.js`. Worker inchangé (il reçoit le plan).

### Prérequis
- Étapes E1 à E6a déployées.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull** (le commit est poussé), ou décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, puis **Commit to main** et **Push origin**.
2. DockPanel → Git Deploy → Redeploy : **`majlistv-api`** puis **`majlistv-web`**. Le worker n'a pas changé.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
docker logs --tail 200 dockpanel-git-majlistv-api 2>&1 | grep -i -E "module editor|fiche invalide"
```
La dernière commande ne doit afficher **aucune** ligne « fiche invalide ».
4. Dans l'éditeur : **Ctrl + Maj + R**.

### Debug
- L'élément ne bouge pas : vous êtes en lecture seule (un autre onglet ou une autre personne a la main : « Reprendre la main »).
- Le texte du rendu dépasse légèrement par rapport à l'aperçu : polices différentes (navigateur / DejaVu Sans) ; contrôler avec **Voir l'image finale**.
- Revenir au placement d'avant : bouton **Revenir à la position prédéfinie**.

### Exemples d'utilisation
- Mettre un bandeau de nom en haut à droite : le glisser sur la vidéo jusqu'à la zone voulue ; ajuster aux flèches.
- Remonter les sous-titres incrustés au-dessus d'un bandeau : cocher « Incruster les sous-titres », puis glisser la phrase affichée vers le haut.
- Poser le logo dans un coin non standard : le glisser ; il se cale aux marges de 2 % à l'approche des bords.

Tests : `api/tests/test_editor_e6b.py` (validation, relecture, image finale du vrai FFmpeg : titre trouvé à 25,2 % / 29,5 % pour 25 / 30, logo exactement à 40 / 55, sous-titres à 19,9 % pour 20), `api/tests/test_place_e6b.mjs` (plan + moteur du worker : fichier rendu, titre à 69,7 / 25,0 pour 70 / 25, logo à 10,0 / 60,0), `web/tests/e6b_place.py` (glisser, aimant, clavier, Ctrl+Z, panneau, logo, sous-titres, rechargement, arabe, 1024 px) ; tous les tests de l'éditeur (API E1 à E5d, navigateur E1, E3, E5b, E6a) relancés : bons.


## Étape E6c — Éditeur : format et qualité du rendu

### Description
Retour d'Epok du 20/10 : choisir le format et la qualité du rendu. Dans **Rendre la vidéo** :
- **Format** : **16:9** (paysage, par défaut), **9:16** (vertical : Shorts, Reels, TikTok), **1:1** (carré : Instagram, Facebook).
- Hors 16:9, **Remplissage** : **Image entière, fond flouté** (par défaut : toute la conférence reste visible, au-dessus d'une copie agrandie, floutée et assombrie ; pas de bandes noires) ou **Recadrer au centre** (l'image remplit le cadre, les côtés sont coupés).
- **Qualité** (rendu final) : **Auto (la meilleure)**, **360p**, **720p**, **1080p** (côté court de l'image : 9:16 en 1080p = 1080 × 1920). Les qualités au-dessus de la vidéo d'origine sont **grisées** (« Vidéo d'origine : 360p au mieux ») ; si elles sont demandées quand même (API), le rendu se fait dans la meilleure qualité possible avec un avertissement. L'**aperçu rapide** reste en 360p, dans le format choisi.
- Les titres, le logo et les sous-titres gardent leur place **en % de l'image** et leur taille suit le format (textes calculés pour 1920 × 1080, 1080 × 1920 ou 1080 × 1080).
- La liste des rendus affiche le format et la qualité (« Rendu final · 9:16 · recadré · 360p ») ; le fichier téléchargé porte le format dans son nom.
- Les extraits 9:16 (page Extraits) ne changent pas.

Fichiers : `api/src/modules/editor/plan.js` (format, remplissage, textes), `render.js` (choix reçus, qualité de la source lue dans `master.m3u8`, avertissement, affichage), **`worker/src/render.js`** (taille de l'image), `web/modules/editor/RenderPanel.js`. Aucune migration (le choix est rangé dans le plan du rendu).

### Prérequis
- Étapes E4a à E6b déployées.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull** (le commit est poussé), ou décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, puis **Commit to main** et **Push origin**.
2. DockPanel → Git Deploy → Redeploy : **`majlistv-api`**, puis **`majlistv-web`**, puis **`majlistv-worker`** (il a changé : taille de l'image selon le format).
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
docker logs --tail 50 dockpanel-git-majlistv-worker 2>&1 | tail -5
```

### Debug
- 720p / 1080p grisés : la vidéo d'origine n'existe qu'en qualité plus basse (on ne peut pas inventer de détails).
- Le titre tombe mal en 9:16 : l'habillage est placé pour le 16:9 de l'éditeur ; le déplacer (E6b) puis refaire un aperçu rapide en 9:16.
- Un rendu reste « en attente » : le worker fait d'abord les conversions de vidéos ; Studio → Activité montre la file.
- Journal du worker pendant un rendu : `docker logs -f dockpanel-git-majlistv-worker` (ligne « source … → 720x1280 »).

### Exemples d'utilisation
- Un extrait vertical d'une conférence entière pour les réseaux : Rendre la vidéo → **9:16** → **Image entière, fond flouté** → Aperçu rapide pour vérifier → Rendu final **1080p**.
- Une version carrée légère : **1:1** → **Recadrer au centre** → **720p**.

Tests : `api/tests/test_format_e6c.mjs` (tailles, plafond à la source, plan, rendu réel par le moteur du worker : 720 × 1280 sans bande noire, titre à 20,0 % de la hauteur, 360 × 360, 1280 × 720), `api/tests/test_editor_e6c.py` (API : valeurs refusées, qualité de la source, avertissement, plan enregistré), `web/tests/e6c_render.py` (panneau, qualités grisées, demande envoyée, liste, arabe) ; relancés : tests de rendu E4a, extraits E5b/E5d, placement E6b.


## Fiche vidéo — proposition B (20/10)

### Description
Retour d'Epok : la fiche vidéo avait trop de boutons (6 vitesses, marque-page, cinéma, favoris, partager, liste, signaler, grande carte de version française). Deux maquettes ont été proposées (artifact « Mejliss TV – Fiche vidéo (2 propositions) ») ; **Epok a choisi la B**. La page devient :
- **un bandeau sombre** avec le lecteur, le titre, le niveau, la langue, la durée, la reprise (« Reprise à 26:04 · Depuis le début »), la chaîne et **Suivre** ;
- **5 actions en icônes avec leur nom** : **Favori**, **Ma liste**, **Partager**, **Marque-page**, **Plus**. Le menu **Plus** contient la **vitesse**, **Écouter sans l'image**, le **mode cinéma**, les **épisodes précédent / suivant** (séries) et **Signaler** ;
- une carte **« Apprendre avec cette conférence »** : **Comprendre** (quiz, score), **Retenir** (révision), **Agir** (mise en pratique, ouverte sur la vidéo) et le lien **Mes notes** ;
- des **onglets réduits** : Résumé · Chapitres · Transcription · Mes notes · À propos ;
- **« À suivre »** en rangée de vignettes en bas de page (défilement horizontal sur téléphone) ; la liste des épisodes d'une série reste à droite ;
- la demande de **version française** devient une ligne discrète.
Sur téléphone, la carte « Apprendre » passe avant les onglets et les 5 actions tiennent sur une ligne. Arabe : tout s'inverse (RTL).

Fichiers : `web/app/talks/[id]/TalkClient.js`, nouveau `web/components/WatchBar.js`, `web/components/ListButton.js` (bouton en icône), `web/app/globals.css`, `web/lib/i18n.js` (clés `wb*`). Ni API ni base de données.

### Prérequis
- Rien de nouveau.

### Déploiement (GitHub Desktop + DockPanel)
1. GitHub Desktop : **Fetch origin** puis **Pull** (le commit est poussé), ou décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, puis **Commit to main** et **Push origin**.
2. DockPanel → Git Deploy → **Redeploy de `majlistv-web`** uniquement.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
4. Ouvrir une conférence avec **Ctrl + Maj + R**.

### Debug
- La carte « Apprendre » n'apparaît pas : la conférence n'a ni quiz validé ni action de mise en pratique validée (Studio), et le membre n'est pas connecté (notes).
- « Ma liste » ou « Marque-page » absents : réservés aux membres connectés ; Favori / Ma liste dépendent aussi des fonctions activées (Admin → Fonctions).
- Ancien affichage : cache du navigateur (Ctrl + Maj + R).

### Exemples d'utilisation
- Changer la vitesse : **Plus** → 1,5×.
- Passer le quiz : carte **Apprendre** → **Commencer** (le quiz s'ouvre sur la vidéo).
- Partager à la minute en cours : **Partager** (lien copié avec le moment).

Tests : `web/tests/fiche_b.py` (barre d'actions, menu Plus, vitesse appliquée, favori enregistré, listes, carte Apprendre, quiz et mise en pratique ouverts sur la vidéo, notes, onglets, téléphone, arabe, 390 / 1024 / 1440 px) ; `retours_16oct.py` adapté ; `d2_player.py`, `s1_dubbing.py`, `s3_studio.py`, `kids_actions.py` relancés : bons.

### Ajustements de la fiche vidéo B (20/10)
- **Réglages de lecture sur le lecteur** : bouton engrenage (affiche la vitesse, ex. « 1,5× ») en haut du lecteur → 6 vitesses et « écouter sans l'image ». Le menu « Plus » garde mode cinéma, épisode précédent/suivant, signaler.
- **Résumé** est l'onglet ouvert par défaut (puis Chapitres, Transcription, Mes notes, À propos).
- Le bloc « Chapitres et extrait » est placé **au-dessus** de « À suivre ».
- Correction mobile : plus de débordement horizontal à 390 px (onglets défilables).
- Déploiement : Redeploy de **majlistv-web** uniquement. Test : `python3 web/tests/fiche_b.py`.

## Chaînes riches et plusieurs chaînes (20/10)

**Ce que ça fait** : une personne peut gérer plusieurs chaînes (sélecteur en haut de Studio → Ma chaîne), en créer de nouvelles (même vides), et remplir une page riche : accroche, présentation, images, site web, e-mail de contact (public), YouTube / Instagram / X / Facebook / TikTok, pays, langue, conférence à la une. Un propriétaire peut ajouter des **éditeurs** (comptes organisateurs) qui modifient la page de la chaîne. **Une vidéo n'a jamais l'obligation d'avoir une chaîne** : le sélecteur de chaîne des formulaires est facultatif (« Aucune chaîne »), la saisie libre de l'intervenant reste possible.

**Prérequis** : étapes précédentes déployées. **Migration** : `060_channels_rich.sql` (colonnes ajoutées avec valeur par défaut + table `channel_members`), appliquée au démarrage de l'API. Rien n'est supprimé ni déplacé.

**Déploiement** (DockPanel + GitHub Desktop) : décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, Commit to main, Push origin ; Redeploy **majlistv-api** puis **majlistv-web** (pas le worker) ; sur le VPS : `/root/apply-limits.sh`, `grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss`, `nginx -t && systemctl reload nginx`.

**Droits** : propriétaire = tout (équipe, suppression d'une chaîne vide) et reçoit les revenus ; éditeur = page de la chaîne seulement ; modérateur/administrateur = toutes les chaînes. Un organisateur peut posséder 10 chaînes au plus.

**Debug** : « Une chaîne porte déjà ce nom » = le nom donne le même identifiant qu'une chaîne existante ; une chaîne vide n'apparaît pas dans le catalogue public tant qu'aucune conférence publiée ne porte son nom (la ligne « Pour rattacher une conférence : … » indique le texte exact) ; adresses https:// uniquement.

**Tests** : `python3 api/tests/test_channels_rich.py` (API 3055) et `python3 web/tests/chaines_riches.py` (site 3001 ; captures dans /tmp). Non testé : envoi réel d'images vers le stockage de production, vrai téléphone.

### Droits des éditeurs sur les conférences d'une chaîne (20/10)
Le propriétaire d'une chaîne et ses éditeurs gèrent aussi les conférences qui portent le nom de la chaîne, même créées par quelqu'un d'autre : liste Studio « Contenus », modification (infos, accès, publication, miniature), modification en lot, transcription, traduction, relance de conversion, étiquettes, quiz, pratique, révision, aperçu des brouillons. **Suppression** : créateur et administrateur seulement. Une conférence **sans chaîne** reste visible et modifiable par son seul créateur. **Pas encore couvert** (restent au créateur) : séries, statistiques, éditeur vidéo, doublage, livres, citations. Code : `api/src/channelAccess.js`. Test : `python3 api/tests/test_channel_editors.py`. Déploiement : Redeploy **majlistv-api** puis **majlistv-web**.

## Kids : un vrai catalogue (20/10)

**Ce que ça fait** : l'espace enfant (Regarder) devient un catalogue : barre de recherche, pastilles de **rubriques Kids**, case « seulement pour mon âge », et des rangées : *Reprendre*, *Parce que tu as aimé « … »*, *Pour ton âge*, *Nouveautés*, *Les plus regardés* (à partir de 3 vidéos regardées, totaux anonymes, aucun enfant comparé) et une rangée par rubrique. L'accueil enfant existant (héros, progression, actions) est conservé.

**Rubriques** : Admin → Rubriques Kids (créer, renommer en fr/en/ar, pictogramme, cacher, ordonner, supprimer — supprimer une rubrique ne supprime aucune vidéo). 8 rubriques de départ : Histoires, Les prophètes, Valeurs et bonne conduite, Coran et invocations, Sciences et nature, Chants et comptines, Jeux et créativité, Apprendre l'arabe. **Classer les vidéos** : Studio → fiche d'une conférence (visible dès qu'une tranche Kids est cochée, enregistrement immédiat) ou, pour beaucoup à la fois, Studio → Contenus → cocher → modification en lot → « Rubriques Kids » (ajouter / remplacer / retirer). Tant qu'une vidéo n'est dans aucune rubrique, elle apparaît dans Nouveautés / Pour ton âge mais dans aucune rangée de rubrique.

**Règles** : un enfant ne voit que ce qu'il voyait déjà (prête, publiée, sa tranche d'âge, catalogue choisi par le parent, gratuites sans abonnement, limite de temps). La recherche enfant est une recherche SQL simple (titre, intervenant, description, rubrique) : pas de Meilisearch, jamais d'extrait de transcription ni de contenu adulte.

**Prérequis / migration** : module Kids 1.1.0, migration de module `001_rubrics.sql` (2 tables, 8 rubriques), appliquée au démarrage de l'API ; rien n'est supprimé.

**Déploiement** (DockPanel + GitHub Desktop) : décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, Commit to main, Push origin ; Redeploy **majlistv-api** puis **majlistv-web** (pas le worker) ; sur le VPS : `/root/apply-limits.sh`, `grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss`, `nginx -t && systemctl reload nginx` ; Ctrl+Maj+R dans le navigateur.

**Debug** : une rubrique n'apparaît pas chez l'enfant = elle est cachée, ou aucune vidéo visible pour ce profil n'y est classée ; « Les plus regardés » absent = moins de 3 vidéos regardées ces 30 jours ; recherche vide = vérifier la tranche d'âge du profil et le catalogue autorisé par le parent.

**Tests** : `python3 api/tests/test_kids_catalog.py` (API 3055) et `python3 web/tests/kids_catalog.py` (site 3001, captures dans /tmp/shots-kc). Non testé : vrai téléphone, grand volume (le catalogue enfant renvoie 200 vidéos au plus).

## Shorts publics (20/10)

### Description
Une chaîne publie des **shorts** : des extraits verticaux 9:16 montés dans l'éditeur (Studio → Éditeur → Extraits 9:16). Publier **copie** le dernier rendu vers `shorts/<id>.mp4` : le short reste en ligne même si l'extrait est retouché ou le rendu nettoyé.
- Fil vertical : `/shorts` (tous), `/shorts?channel=<chaîne>`, `/shorts/<id>` (ce short, puis la suite).
- Accueil : bloc **Shorts** (Admin → Pages → Accueil des membres). Page de la chaîne : onglet **Shorts**.
- Studio → **Shorts** : « Prêts à publier » (extraits dont le rendu est terminé), « Mes shorts » (titre, brouillon / publié, copier le lien, mettre à jour la vidéo, supprimer). Depuis l'éditeur, le bouton « Publier sur la chaîne » y mène.
- Vues : comptées à part, après 2 s sur un short, une par personne et par jour.
- **Espace Kids** : `/kids/shorts` et rangée sur l'accueil et l'onglet Regarder, avec les mêmes règles que le catalogue Kids (conférence classée Kids pour sa tranche d'âge, catalogue choisi par le parent, gratuites sans abonnement, temps du jour). Une conférence réservée aux adultes n'apparaît jamais côté enfant ; une conférence Kids seule n'apparaît jamais côté adultes. Pas de lien vers les chaînes côté enfant.
- Téléphone et tablette : on glisse au doigt ; des boutons ▲ ▼ sont aussi là. Ordinateur : molette, touches ↑ ↓ (ou J / K), M coupe ou rétablit le son.
- Droits Studio : créateur de la conférence, propriétaire et éditeurs de la chaîne, modérateurs, administrateurs. Une conférence premium peut avoir des shorts publics (aperçu).

### Prérequis
Modules « Éditeur de montage » (pour fabriquer les extraits) et fonction « Shorts » active (Admin → Fonctions). Aucune variable d'environnement nouvelle. Migration automatique `api/src/modules/shorts/migrations/001_shorts.sql`.

### Déploiement (DockPanel + GitHub Desktop)
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, GitHub Desktop → Commit to main → Push origin.
2. DockPanel → Git Deploy → Redeploy **majlistv-api** (la migration s'applique), puis **majlistv-web**. Le worker n'a pas changé.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
4. Navigateur : Ctrl + Maj + R.

### Utilisation
Studio → Éditeur → ouvrir une conférence → Extraits 9:16 → régler et lancer le rendu → « Publier sur la chaîne » → Publier. Pour l'accueil : Admin → Pages → Accueil des membres → ajouter le bloc « Shorts » (présent dans le modèle de départ ; un accueil déjà publié ne change pas tout seul).

### Debug
- Rien dans la rangée : aucun short publié, ou conférence non visible (brouillon, relecture) : Studio → Shorts indique « Publié, mais la conférence n'est pas visible ».
- Vidéo qui ne se lit pas : vérifier `CSP_STORAGE_ORIGINS` côté web (adresse du stockage) ; liens temporaires de 4 h.
- Enfant : rien ? Vérifier la tranche d'âge de la conférence (Studio → Kids), le catalogue du profil et le temps du jour.
- Tests : `python3 api/tests/test_shorts.py` (API) et, depuis `web/`, `python3 tests/shorts_publics.py` (Playwright : téléphone, tablette, ordinateur, français, arabe, Kids, glissement tactile).

### Limites connues
Registre n°48 (fichiers non effacés à la suppression d'une conférence) et n°49 (pas d'entrée de menu, affiche = miniature de la conférence).

## Registre : points réglés le 20/10 (soir)

### Description
- **n°47 — Recherche Kids** : sans accents ni majuscules (« deuxieme » trouve « Deuxième »), arabe sans voyelles courtes (harakat), alif avec ou sans hamza, tâ marbûta = hâ. Si rien n'est trouvé, nouvel essai sur le début des mots (« histoirr » trouve « Histoire »). Code : `api/src/fold.js` (aucune extension Postgres).
- **n°48 — Suppression d'une conférence** : les fichiers des shorts (vidéo + affiche) et des rendus de l'éditeur sont effacés du stockage (événement `talk.deleting`).
- **n°49 — Shorts** : lien « Shorts » dans le menu principal et le menu latéral (barre du bas : disponible, masqué par défaut, Admin → Pages → Menus) ; affiche tirée de la vidéo (`shorts/<id>.jpg`, image à 1 s).
- **n°28 / n°31 — Studio → Activité** : nouvelles files « Place des mots » et « Suivi du visage », avec pause, priorité et **Annuler** (aussi dans l'onglet Texte et la page des extraits). En attente : annulé tout de suite ; en cours : le service de transcription s'arrête dans les secondes qui suivent sans rien changer.
- **n°13 — Fondu enchaîné** : nouvelle transition. Les deux images se mélangent et la durée du montage ne change pas. Le fondu est raccourci s'il manque de l'image autour du raccord. L'aperçu du navigateur montre une coupure : le fondu se voit au rendu.
- **n°33 — Mot dit en or** dans les sous-titres des shorts, activé par défaut, décochable (« Mot prononcé en couleur »).

### Déploiement (DockPanel + GitHub Desktop)
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, GitHub Desktop → Commit to main → Push origin.
2. DockPanel → Git Deploy → Redeploy **majlistv-api** (migrations : module éditeur 007, module shorts 002), puis **majlistv-web**, puis **majlistv-worker** (fondu enchaîné et mot dit en or passent par le rendu), puis le service **transcriber** (annulation et pause de la place des mots et du suivi du visage).
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
4. Navigateur : Ctrl + Maj + R.

### Debug
- Annuler ne fait rien sur une tâche en cours : le service de transcription n'a pas été redéployé (il ignore la demande et va au bout).
- Pas d'affiche sur un short : FFmpeg absent de l'image de l'API (il y est depuis l'étape E2) ; la miniature de la conférence est utilisée à la place.
- Tests : `python3 api/tests/test_shorts.py`, `python3 api/tests/test_kids_catalog.py`, `python3 api/tests/test_jobs_activity.py`, `cd api && node tests/test_render_plan.mjs && node tests/test_short.mjs`, `cd transcriber && python3 tests/test_track_job.py`, depuis `web/` : `python3 tests/shorts_publics.py` et `python3 tests/activite_annuler.py`.

### Ce qui reste ouvert
- Essais réels sur le VPS (n°18, 19, 21, 25, 26, 30) : étape F.
- Décisions : n°15 (un organisateur peut-il supprimer un logo commun ?), n°32 (zoom / suivi de celui qui parle, après essai réel).
- À surveiller : n°14 (charge de « Voir l'image finale »), n°20 (limite de 120 passages par rendu).

## Registre : décisions d'Epok du 20/10 (n°9, 15, 32)
- **n°9** : seul le nouveau Studio existe (déjà le cas depuis l'étape D). Rien à déployer.
- **n°15** : un organisateur peut supprimer un logo qu'il a lui-même importé : gardé tel quel.
- **n°32 — le cadre suit la personne qui parle** (extraits 9:16, case « Le cadre suit le visage ») : avec plusieurs personnes, le service de transcription compare la bouche de chacune d'une image examinée à l'autre (3 images par seconde) et suit celle qui parle ; il ne change de personne que si l'autre parle nettement plus pendant au moins 1 seconde. Une seule personne, ou personne qui ne parle : comportement d'avant. Code : `transcriber/src/track.py`, `transcriber/src/faces.py`. Tests : `cd transcriber && python3 tests/test_track.py && python3 tests/test_speaker_faces.py`.
- **Déploiement** : Redeploy du service **transcriber** (et **majlistv-web** pour le texte d'aide). Commandes VPS habituelles :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
- **Debug** : `docker logs <conteneur transcriber> 2>&1 | grep "suivi du visage"` affiche « suit la personne qui parle (n changement(s)) » quand ce mode a servi.


## Étape D3c — Plusieurs intervenants et hauteur de la voix (21/10)

### Ce que ça fait
- **Détection des intervenants** : le service de transcription écoute la voix de chaque phrase française, calcule une « empreinte de voix » (petit modèle libre, processeur seul) et regroupe les phrases qui se ressemblent. Chaque groupe est un intervenant (jusqu'à 10, 6 par défaut). Il estime aussi la hauteur moyenne de chaque voix et **suggère** une catégorie (homme, femme, enfant) : c'est une suggestion, à vérifier à l'oreille.
- **Une voix et une hauteur par intervenant** (Studio → Contenus → [conférence] → Audio et doublage → carte « Intervenants »). Règle : un intervenant qui n'a rien choisi garde les voix de la conférence ; dès qu'il a choisi une voix de base OU une voix cible, il a SA voix (voix de base manquante = celle de la conférence, voix cible manquante = aucune conversion).
- **Hauteur de la voix** : curseur de −4 à +4 demi-tons (pas de 0,5), durée inchangée. Réglage par défaut (tout le site), par conférence, et par intervenant. FFmpeg « rubberband » si présent, sinon méthode de secours (les deux testées). Un vrai changement (femme → homme) passe par la voix cible, pas par ce curseur.
- **Corrections** : intervenant de chaque phrase modifiable (liste dans le tableau des phrases, filtre par intervenant), plage de phrases (« de 12:30 à 15:10 → intervenant 2 »), noms modifiables, « Proposer des voix » (une voix cible de la catégorie suggérée pour les femmes et les enfants ; les hommes gardent la voix de la conférence ; jamais de voix déjà choisie écrasée).
- **Aperçu rapide d'une hauteur** : rejoue la voix déjà fabriquée (piste en service, sinon dernière écoute de 60 s) en changeant la vitesse de lecture sans garder la hauteur : approximatif (la vitesse change aussi). L'écoute de 60 secondes donne le rendu exact.
- Studio → Activité : la file « Détection des intervenants » (pause, priorité, annulation).

### Prérequis
API (module doublage 0.10.0, migration `006_speakers.sql`), transcripteur (nouveau paquet `sherpa-onnx`, redéploiement de l'image), service de doublage 0.5.0. Texte français (traduction) présent ; **vidéos envoyées sur le site seulement** (YouTube, Vimeo, archive.org : une seule voix).
Le modèle d'empreinte (~40 Mo, `3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx`, publié avec sherpa-onnx sur GitHub) est téléchargé une seule fois dans `/models/speakers` au premier usage. Variables facultatives du transcripteur : `SPEAKER_THRESHOLD` (0,5 : plus bas = moins de voix distinctes), `SPEAKER_MODEL_URL`, `SPEAKER_MODEL_FILE`.

### Déploiement (workflow habituel)
1. Décompresser le zip dans `C:\Users\agenc\Documents\GitHub\majlistv`, GitHub Desktop → Commit to main → Push origin.
2. DockPanel → Git Deploy → Redeploy : **majlistv-api** d'abord (migrations), puis **majlistv-web**, puis **transcriber** (nouvelle image), puis **dubbing** (service de doublage). Le worker n'a pas changé.
3. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```

### Utilisation
1. Ouvrir la conférence → Audio et doublage → carte **Intervenants** → « Détecter les intervenants » (le service la prend dans les minutes qui suivent ; suivi dans Studio → Activité).
2. Renommer, « Proposer des voix », régler voix et hauteur de chacun, corriger les phrases mal attribuées.
3. « Écouter 60 secondes » pour juger, puis « Lancer le doublage ».
Une nouvelle détection **remplace** noms, voix choisies et corrections (une confirmation est demandée). « Revenir à une seule voix » efface tout.

### Debug
- Détection bloquée « en attente » : le service de transcription traite les files dans l'ordre (transcription d'abord) ; regarder `docker logs` du transcripteur (lignes « intervenants : … »).
- « modèle de voix téléchargé incomplet » : le conteneur n'atteint pas GitHub ; déposer le fichier `.onnx` dans `/models/speakers/` à la main.
- Trop ou pas assez de voix : régler « Nombre maximal de voix », ou `SPEAKER_THRESHOLD` (0,4–0,6).
- Résultat d'un doublage : `result.speakers` (voix et hauteur de chaque intervenant) et `result.pitchEngine` (`rubberband` ou `atempo`) dans la fiche de la demande.

### Ce qui a été testé (21/10) — et ce qui ne l'a pas été
Testé : calcul de regroupement (voix factices, 1800 phrases), **vrai modèle** sur 3 voix de synthèse (espeak-ng, flite) : 91/91 paires de phrases bien rapprochées ou séparées ; hauteur F0 ; ~60 contrôles API ; service de doublage avec faux moteurs (un son par voix : les phrases sortent avec la bonne voix et la bonne hauteur, ±4 demi-tons mesurés par analyse du son) ; écran dans Chromium (1440, 820, 390 px, arabe RTL, clavier).
**Non testé** : conférences réelles (voix humaines, bruit de salle, arabe, chevauchements) ; qualité à l'oreille de rubberband sur la voix convertie ; FFmpeg de l'image de doublage (le moteur est détecté et la méthode de secours existe) ; télécharger le modèle depuis le VPS. → étape F.

## Étape Import — copier une vidéo externe chez nous (21/10)

### Ce que ça fait
- Une vidéo qui vit ailleurs (**YouTube, Vimeo, archive.org, n'importe quel site contenant une vidéo, ou un lien direct vers un fichier .mp4/.webm/…**) peut être **copiée dans notre stockage Garage**. Elle devient alors une vidéo hébergée comme une vidéo envoyée : lecture HLS multi-qualités, mode audio, éditeur, doublage mixte, extraits 9:16.
- **Facultatif pour chaque vidéo** : sans copie, la vidéo reste lue depuis sa plateforme (comportement d'avant).
- **Deux chemins** :
  - *Nouvelle conférence* (Studio → Nouvelle conférence → coller le lien) : pour YouTube / Vimeo / archive.org, une case « Importer la vidéo chez nous » (facultative) ; pour tout autre site ou lien direct, la copie est obligatoire. La conférence reste invisible (état « importing ») jusqu'à la fin.
  - *Conférence déjà au catalogue* (YouTube / Vimeo / archive.org) : fiche → carte Traitement → « Importer chez nous ». La conférence reste lisible depuis sa plateforme pendant la copie, puis bascule d'un seul coup en vidéo hébergée.
- **Garde-fou des droits** : case d'attestation obligatoire (texte versionné « v1 ») + **journal** (Studio → Activité → « Journal des imports » : qui, quand, adresse, texte de la déclaration). Réservé aux organisateurs et administrateurs ; un organisateur ne voit que ses imports, l'administrateur voit tout. La déclaration vaut aussi accord pour la transcription et la traduction.
- Suivi dans Studio → Activité (files « Téléchargement de la vidéo » et « Conversion de la vidéo importée » : pause, priorité, annulation) ; annulation possible tant que la conversion n'a pas démarré.
- Réglages (Admin → Paramètres) : `import_max_gb` (8 Go par défaut) et `import_max_height` (1080 p). Fonction désactivable : Admin → Fonctions → « Import de vidéos externes ».

### Comment ça marche
1. L'API (`POST /talks` avec `importVideo`, ou `POST /talks/:id/import`) vérifie l'adresse (http/https, pas de réseau interne), l'attestation, la place libre du stockage, puis ouvre une demande dans `media_imports` (migration 061).
2. Le **transcripteur** (`transcriber/src/importer.py`, boucle `media_import_loop`) la prend : contrôle DNS anti-SSRF, téléchargement (archive.org et liens directs : téléchargement direct avec redirections contrôlées ; autres sites : yt-dlp, qualité ≤ `import_max_height`, une seule vidéo), contrôle ffprobe, envoi dans Garage (`talks/<uuid>`).
3. Le **worker** (`worker/src/importconv.js`) convertit en HLS (`hls/<conférence>/`), puis bascule la conférence (`source='upload'`, prête) dans une transaction.
4. La suppression d'une conférence efface aussi le fichier copié et les conversions.

### Prérequis
API (migration `061_media_import.sql`), transcripteur (déjà muni de yt-dlp, boto3, ffprobe), worker (FFmpeg). Place libre : ≥ 2 Go dans le dossier de travail du transcripteur et du worker, et dans Garage (~30 Go au total : une vidéo 1080p d'1 h pèse ~1 à 3 Go + sa version HLS).

### Déploiement (DockPanel + GitHub Desktop)
Les modifications sont poussées directement sur `main` (LePubli/majlistv). Dans DockPanel → Git Deploy → Redeploy, **dans cet ordre** : **majlistv-api** (migration), **majlistv-web**, **majlistv-worker**, **transcriber**. Puis sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
```
Aucune nouvelle variable obligatoire. Si YouTube refuse (« confirmez que vous n'êtes pas un robot ») : Admin → Paramètres → cookies YouTube (réglage existant).

### Utilisation
1. Studio → Nouvelle conférence → coller l'adresse (ou une page contenant une vidéo, ou un lien direct) → cocher la déclaration des droits → remplir les informations → Publier.
2. Ouvrir la fiche : l'avancement s'affiche (téléchargement → envoi → conversion) ; « Annuler l'import » tant que la conversion n'a pas démarré.
3. Conférence YouTube / Vimeo / archive.org existante : fiche → « Importer chez nous » (cocher la déclaration).
4. Voir le journal : Studio → Activité, en bas de la liste des tâches.

### Debug
- Import « en attente » longtemps : le transcripteur traite les demandes une par une, après ses autres tâches ; `docker logs` du transcripteur (lignes `[import …]`). Pause générale ou plage horaire : Studio → Activité.
- « En attente de conversion » : c'est le worker ; `docker logs` du worker (`[import …]`). Une conversion échouée est retentée une fois, puis la demande passe en échec avec le message.
- Messages d'erreur : « adresse n'est pas un site public » (réseau interne refusé), « page web, pas un fichier vidéo », « plus que la limite de N Go », « plus assez de place disque », « stockage presque plein ».
- Requêtes utiles : `SELECT id, status, stage, progress, error FROM media_imports ORDER BY created_at DESC LIMIT 10;`

### Ce qui a été testé (21/10) — et ce qui ne l'a pas été
Testé : `api/tests/test_media_import.py` (création, refus, droits d'accès, annulation, relance, journal, suppression, fonction désactivée), `transcriber/tests/test_importer.py` (anti-SSRF avec 10 types d'adresses, redirections, taille maximale, annulation, yt-dlp simulé, ffprobe, envoi S3), `api/tests/test_media_import_e2e.py` (de bout en bout avec un serveur vidéo local, le vrai transcripteur et le vrai worker FFmpeg : HLS, audio, bascule, échecs, nettoyage), `web/tests/import_studio.py` (interface en français 1440 px et arabe 390 px).
**Non testé** : un vrai téléchargement depuis YouTube / Vimeo / un site depuis le VPS (réseau externe indisponible ici ; yt-dlp simulé) → étape F. Limites connues : YouTube bloque souvent les serveurs, et ses conditions d'utilisation interdisent de télécharger une vidéo dont on n'a pas les droits (d'où l'attestation) ; la protection contre l'accès au réseau interne pour yt-dlp contrôle l'adresse de départ et celles des flux choisis (au mieux).

## Étape F — Contrôle du VPS et reconstruction (21/10)

### Ce que c'est
- `ops/verify/verify-deploy.sh` : **script de contrôle après déploiement**, à lancer sur le VPS (root). Il ne modifie rien. Il vérifie : les conteneurs (en marche, pas en boucle, pas tués par manque de mémoire), les ports (7000 API, 7010 site, 7001 = TriMaint intact), la santé de chaque service et des adresses publiques, nginx (`nginx -t`, `proxy_pass`), les limites de ressources, les migrations de la base (jusqu'à la 061), les conversions ou imports en échec ou bloqués, les polices et filtres FFmpeg du worker, yt-dlp / deno / modèles du transcripteur, Garage (cluster, bucket), le disque, la sauvegarde nocturne, la charge du VPS et les journaux récents. Sortie : OK / ATTENTION / ÉCHEC et un résumé ; code de sortie 1 s'il y a un ÉCHEC.
- `docs/RECONSTRUIRE-DE-ZERO.md` : guide pour tout remonter sur un VPS vierge (secrets à avoir, ordre des services, variables, volumes, ports, Garage, restauration des sauvegardes, réglages après coup, pièges).
- `docs/ETAPE-F-VERIFICATIONS.md` : la liste des essais réels à cocher avec Claude.

### Prérequis
VPS Ubuntu 24.04 avec Docker et les conteneurs nommés `dockpanel-git-majlistv-*` et `dockpanel-app-postgres-majlisstv` (noms de DockPanel déjà utilisés dans tout le dépôt).

### Utilisation (commandes complètes)
```
# une seule fois, sur le VPS :
cd /root && curl -fsSL https://raw.githubusercontent.com/LePubli/majlistv/main/ops/verify/verify-deploy.sh -o verify-deploy.sh && chmod 700 verify-deploy.sh
# après chaque redéploiement (avec les 3 commandes habituelles) :
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/* | grep -i mejliss
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh            # complet ; options : --quick (sans charge ni journaux), --no-public (sans les adresses publiques)
```
Variables facultatives : `EXPECT_MIGRATION` (dernière migration attendue, défaut `061_media_import.sql`), `SITE_URL`, `API_URL_PUBLIC`, `S3_URL_PUBLIC`.

### Debug
- Un ÉCHEC « port hôte ≠ 7000 » : DockPanel a attribué un autre port ; voir la commande `UPDATE git_deploys SET host_port=…` du guide de reconstruction, puis corriger nginx.
- « dernière migration appliquée » trop ancienne : redéployer `majlistv-api` et lire `docker logs dockpanel-git-majlistv-api 2>&1 | grep -i migrat`.
- Le script suppose les noms de conteneurs ci-dessus ; en cas de doute : `docker ps --format '{{.Names}}' | grep -i majlis`.

### Ce qui a été testé (21/10) — et ce qui ne l'a pas été
Testé : `bash ops/verify/test-verify.sh` (faux `docker`, `curl`, `nginx` + la vraie base de test locale : les requêtes SQL sont valides sur le vrai schéma, les échecs réels sont détectés — conversions et imports en échec de nos tests —, une migration manquante est signalée). Syntaxe vérifiée par `bash -n`.
**Non testé** : le script sur le vrai VPS (noms de conteneurs, ports hôte, volumes, sorties réelles de `docker`) ; le guide de reconstruction sur un VPS vierge. Tout se découvre lors de la première exécution : copier les lignes ÉCHEC / ATTENTION à Claude.

> **Mise à jour du 21/10 (après le premier passage sur le VPS)** : les ports hôte de l'API et du site sont choisis par DockPanel (43435 et 34455 le 21/10) et ses vhosts nginx suivent ; il ne faut plus compter sur 7000 / 7010. La commande de routine devient `grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*` (l'ancienne, `… | grep -i mejliss`, ne trouvait rien). Premier passage : 60 OK, 0 échec, après `apply-limits.sh` à jour (règle du doublage ajoutée) et nettoyage du disque (80 % → 63 %).

## Correctif stockage — débit des qualités plafonné par la source (21/10)

### Ce que ça change
Le worker convertissait chaque qualité à un débit fixe (360p : 800, 720p : 2 800, 1080p : 5 000 kbit/s). Une conférence YouTube de 48 min (source ≈ 0,95 Mbit/s) devenait ainsi 3,1 Go de vidéo convertie (+ 342 Mo d'original), cinq fois plus que la source, sans gain d'image (registre n°57). Désormais :
- le worker lit le débit vidéo de la source (`probe` → `videoKbps` : débit de la piste, sinon débit total moins l'audio, sinon taille / durée) ;
- chaque qualité reçoit au plus son débit d'avant ET au plus le débit de la source en proportion de sa hauteur (1080p d'une source 1080p : débit de la source ; 720p : × 720/1080 ; 360p : × 360/1080), avec un plancher (250 / 500 / 800 kbit/s) qui ne dépasse jamais le débit de la source ;
- une source de bonne qualité garde exactement les débits d'avant ; débit illisible : réglages d'avant.
Pour la conférence de 48 min : 1080p 820, 720p 547, 360p 273 kbit/s ≈ 0,7 Go converti au lieu de 3,1 Go. Concerne toutes les conversions (envois, imports, reconversions). Le rendu de l'éditeur et l'audio seul ne changent pas.

### Déploiement
DockPanel → Git Deploy → Redeploy **majlistv-worker** seulement (ni l'API ni le site ne changent). Puis :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```

### Réduire une conférence déjà convertie
La conférence est **indisponible pendant sa reconversion** (≈ durée de la vidéo ou plus) ; l'original est gardé, et en cas d'échec le worker réessaie. Exemple pour la conférence de test :
```
docker exec dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "UPDATE talks SET video_status = '"'"'pending'"'"', video_progress = 0, video_error = NULL, transcode_attempts = 0 WHERE id = '"'"'e6ad96de-4744-43a6-86ae-13aa13ae7a7e'"'"' AND source = '"'"'upload'"'"';"'
```
Suivi : `docker logs -f dockpanel-git-majlistv-worker` (« terminé »), puis la taille :
```
docker exec dockpanel-git-majlistv-storage /garage bucket info majlis-videos | grep -iE "size|objects"
```

### Debug
- Journal du worker : la ligne « … s, 1080p, audio=true : conversion » précède la conversion ; les débits utilisés sont dans les arguments FFmpeg (`worker/src/transcode.js`, `videoKbpsFor`).
- Image trop dégradée sur une source très compressée : relever les planchers (`FLOOR` dans `worker/src/transcode.js`).

### Tests (21/10)
`node worker/tests/test_bitrate_cap.mjs` : règle de calcul (source pauvre, riche, inconnue ; cas des 48 min) + vraie conversion FFmpeg d'une source 720p à 400 kbit/s (720p convertie pas plus grosse que la source). Non-régression : `node worker/tests/test_audio.mjs`, `python3 api/tests/test_media_import_e2e.py` (import complet avec le vrai worker). **Non testé** : la qualité à l'œil sur une vraie conférence, et le gain réel sur le VPS (à mesurer après reconversion).

## Étape 22a — Site installable (PWA) (21/10)

### Ce que ça fait
- **Installer Mejliss TV comme une application**, sans magasin : icône sur l'écran d'accueil (téléphone, tablette, ordinateur), ouverture en plein écran sans la barre du navigateur.
  - Chrome, Edge, Android : bouton « Installer » (invite du navigateur) sur la page **/application** (« Télécharger l'application », lien dans le pied de page).
  - iPhone / iPad : la page explique les 3 gestes dans Safari (Partager → « Sur l'écran d'accueil » → Ajouter) ; hors Safari, elle demande d'ouvrir la page dans Safari (seul navigateur qui installe sur iOS).
  - Ordinateur : explications Chrome / Edge et Safari (Mac).
- **Page « Vous êtes hors connexion »** (FR / EN / AR, sens RTL en arabe) quand le réseau manque, avec un bouton « Réessayer ».
- **Ouverture plus rapide** : les fichiers du site qui ne changent jamais (scripts, styles, polices), les icônes et le logo sont gardés par le téléphone.
- **Rien de privé n'est gardé** : jamais une page, jamais une réponse de l'API, jamais une vidéo ni un fichier du stockage S3 (vérifié par le test). Le visionnage hors connexion (téléchargement) viendra avec l'application Android/iPhone (étape 22b).
- Fonction activable : Admin → Fonctions → « Application installable » (`app_install`, activée par défaut). Coupée : la page /application et le lien disparaissent, et le service worker déjà installé chez les visiteurs est retiré à leur visite suivante (fichiers gardés effacés).
- Couleurs de l'icône et de la barre du téléphone : thème publié (Admin → Apparence) ; nom : Admin → Paramètres.
- Paiement : uniquement sur le site (rappel sur la page).

### Fichiers
`web/app/manifest.js` (manifeste, servi à `/manifest.webmanifest`), `web/public/sw.js` (service worker), `web/components/PwaRegister.js` (enregistrement / retrait, invite d'installation), `web/lib/pwa.js`, `web/app/application/page.js`, icônes `web/public/icon-192.png`, `icon-maskable-192.png`, `icon-maskable-512.png` (version « maskable » d'Android, logo réduit à 78 % sur le fond du thème), traductions `pwa*` (FR / EN / AR) ; `api/src/featuresList.js` (fonction `app_install`), menus du pied de page (`api/src/navcfg.js` = `web/lib/navcfg.js`, élément « Télécharger l'application »).

### Prérequis
Site servi en HTTPS (déjà le cas). Aucune variable à ajouter, aucune migration.

### Déploiement
DockPanel → Git Deploy → Redeploy : **majlistv-api** (nouvelle fonction dans Admin → Fonctions), puis **majlistv-web**. Le worker et les autres services ne changent pas. Puis :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
Contrôle rapide :
```
curl -s https://majlisstv.le-publicitaire.fr/manifest.webmanifest | head -c 300; echo
curl -sI https://majlisstv.le-publicitaire.fr/sw.js | grep -iE "^HTTP|cache-control"
```

### Utilisation
- Android (Chrome) : ouvrir le site → pied de page « Télécharger l'application » → « Installer » (ou menu ⋮ → « Installer l'application »).
- iPhone (Safari) : Partager → « Sur l'écran d'accueil » → Ajouter.
- Ordinateur (Chrome / Edge) : icône d'installation dans la barre d'adresse.

### Debug
- Le bouton « Installer » n'apparaît pas : le navigateur ne propose l'invite que s'il juge le site installable et pas déjà installé ; les explications pas à pas s'affichent à la place. Chrome : Outils de développement → Application → Manifest (erreurs d'installabilité).
- Une mise à jour du site tarde : le service worker est relu à chaque visite (`Cache-Control: no-cache`) ; les fichiers gardés portent une empreinte dans leur nom, une nouvelle version les remplace d'elle-même. En dernier recours : couper puis rallumer la fonction (Admin → Fonctions) retire le service worker chez tout le monde.
- Page hors connexion vide de logo : `/brand/emblem.png` est gardé à l'installation ; il manque si la première visite a été interrompue.

### Tests (21/10)
`python3 web/tests/pwa_22a.py` (site en production local, API, base de test) : manifeste et icônes (tailles réelles), service worker actif et servi sans cache, **Chromium juge le site installable** (seule réserve : navigation privée du robot de test), contenu des caches (fichiers du site, ni API ni pages), page hors connexion en coupant vraiment le serveur (français 1440 px, arabe 390 px RTL), page /application (fr 1440, ar 390 iPhone, Android), lien du pied de page, fonction coupée (service worker retiré, caches effacés, page et lien fermés). Variable facultative `WEB_URL` (adresse du site testé).
**Non testé** : vraie installation sur un vrai iPhone, un vrai Android et un ordinateur (le robot ne peut pas cliquer l'invite du navigateur) → à faire par Epok après déploiement.

## Étape 22b-1 — Application Android + iPhone/iPad : socle et lecture (21/10)

### Ce que ça fait
Première tranche de l'application **Mejliss TV** en React Native (Expo SDK 58), dossier `mobile/`, un seul code pour Android, iPhone et iPad. Décisions d'Epok : APK fabriqué par **GitHub Actions**, identifiant `fr.lepublicitaire.mejlisstv`, première livraison « socle + lecture », **paiement jamais dans l'application** (abonnement géré sur le site).
- Connexion / création de compte (jeton dans le coffre sécurisé), parcours visiteur (aperçu de 2 min).
- Accueil (bannière, « Continuer à regarder », rangées du catalogue), Conférences (recherche, catégories, défilement infini), Compte (langue FR / EN / AR en RTL, état de l'abonnement, lien vers la gestion sur le site).
- Lecteur : HLS, plein écran, incrustation, ±10 s, vitesse, **audio seul**, **son écran éteint** (notification de lecture), **reprise synchronisée avec le site**, résumé, points clés, chapitres, favori.
- **Aucun changement de l'API, de la base ni du site** : pas de migration, pas de redéploiement DockPanel.

### Fichiers
`mobile/` (voir `mobile/README.md` : architecture, tests, debug), `.github/workflows/mobile-android.yml` (fabrication de l'APK), `.gitignore` (dossiers générés).

### Prérequis
Aucun sur le VPS. Pour installer : un téléphone Android (64 bits) autorisant l'installation d'applications inconnues.

### Fabriquer et installer l'APK
GitHub → `LePubli/majlistv` → Actions → « Application Android (APK) » → Run workflow (ou automatique à chaque push sur `main` touchant `mobile/`) → en bas de l'exécution, télécharger l'artifact `mejliss-tv-android` → copier l'APK sur le téléphone et l'ouvrir. Signé avec la clé de test d'Android : installable à la main, **pas publiable sur Google Play** (clé de publication : étape « magasins »).

### Tests (21/10)
- `cd mobile && npm run check` : typage TypeScript (0 erreur) + **26 tests** (client d'API : jeton, erreurs, délai, 401 ; reprise : cadence 10 s, pause, aperçu, réseau coupé ; choix de la source : HLS, audio, archive.org, YouTube/Vimeo ; langues : mêmes clés et variables en fr/en/ar ; formats).
- `API_TEST_URL=… npx tsx mobile/tests/api_contract.ts` : essai de bout en bout contre une **vraie API** locale : inscription, connexion, accueil, catégories, catalogue, recherche, fiche, résumé, progression → « Continuer à regarder » → reprise relue (125 000 ms), favori, abonnement, session expirée (401 → déconnexion), conférence inconnue (404). « TOUT EST OK ».
- `npm run bundle` : le paquet Android complet se compile (Metro + Hermes, 3 Mo) ; `expo prebuild` génère un projet Android contenant : service de lecture en arrière-plan, incrustation, RTL, trafic non chiffré interdit, signature de l'APK.
- **Non testé** : l'application sur un téléphone ou un émulateur, la fabrication Gradle de l'APK (elle se fait chez GitHub), l'iPhone. → registre n° 60 à 63.

### Debug
Voir `mobile/README.md` (APK qui ne s'installe pas, « impossible de charger », vidéo qui ne démarre pas, son coupé écran éteint, échec du workflow).
## Étape 22b-2a — Application : Bibliothèque, Apprendre, quiz, mise en pratique (21/10)

### Ce que ça fait
Deuxième tranche de l'application (dossier `mobile/`), première moitié : tout ce qui relie la vidéo à l'apprentissage. **Aucun changement de l'API, de la base ni du site** : l'application utilise les routes existantes (pas de migration, pas de redéploiement DockPanel).
- **Barre du bas à 5 onglets** : Accueil, Conférences, **Apprendre**, **Bibliothèque**, Compte.
- **Bibliothèque** : mes favoris ; mes listes (création, ouverture, retrait d'une conférence, suppression). Sur la fiche d'une conférence : bouton **« Ajouter à une liste »** (coche / décoche, création d'une liste à la volée).
- **Quiz** : bouton « Passer le quiz » sur la fiche (visible seulement si la conférence a un quiz) ; une question à la fois, correction détaillée à la fin (bonne réponse, explication de l'intervenant), seuil de réussite du site, « Refaire le quiz » ; en visiteur : corrigé mais « Connectez-vous pour enregistrer votre résultat ».
- **Mise en pratique** (« Et maintenant, que faire ? ») : propositions d'action de la conférence, action écrite par le membre, intention, échéance (aujourd'hui / cette semaine / ce mois-ci / sans), accord d'enregistrement chiffré (une seule fois). Offre Apprentissage requise : sinon message et lien vers le site.
- **Apprendre** : « À réviser aujourd'hui » (révision espacée) + rappel du jour, « Quiz à passer / à revoir » (ouvert à tout membre), **score et 8 badges**, **mes engagements** (statut : à faire / en cours / fait / pas encore ; en retard en premier). Pour un membre sans l'offre Apprentissage : un seul encadré « fait partie de l'offre Mejliss Apprentissage » + lien vers le site (l'application ne vend rien).
- Tout en français, anglais et arabe (RTL) ; les nouveaux textes sont contrôlés par le test des langues.

### Fichiers
`mobile/src/app/(tabs)/learn.tsx`, `(tabs)/library.tsx`, `list/[id].tsx`, `quiz/[id].tsx`, `practice/[id].tsx`, `mobile/src/components/AddToListModal.tsx`, `mobile/src/lib/learn.ts` (fonctions pures testées), types et textes ajoutés, méthode `patch` du client d'API.

### Prérequis et déploiement
Aucun sur le VPS, rien à redéployer. Pour essayer : refabriquer l'APK (GitHub → Actions → « Application Android (APK) » → Run workflow, ou automatique au push) puis l'installer par-dessus l'ancien. Pour voir les écrans Apprendre en entier : un compte avec l'offre **Apprentissage**, un quiz et des propositions d'action validés dans le Studio sur au moins une conférence.

### Tests (21/10)
- `cd mobile && npm run check` : typage (0 erreur) + **32 tests** (dont : fonctions du quiz, des engagements, erreur « offre requise », libellés des 8 badges dans les 3 langues, méthode PATCH).
- `API_TEST_URL=… npx tsx mobile/tests/api_contract.ts` contre une **vraie API** locale (base et stockage de test, `PRACTICE_KEY` définie) : listes (création, ajout, « contient », détail, retrait, suppression) ; quiz (3 questions créées et validées par le Studio, bonnes réponses non envoyées avant validation, tout faux → 0 %, tout juste → 100 %, visiteur non enregistré) ; membre sans offre → 403 `learning_required` sur `/me/revision`, `/me/learning`, `/me/practice` et « Je m'engage », **sans déconnexion** ; compte avec offre : révision, score, badge « first_quiz », accord exigé (409), engagement avec proposition, texte libre, changement de statut, compteurs, suppression. « TOUT EST OK ».
- `npm run bundle` : le paquet Android se compile.
- **Non testé** : les écrans sur un téléphone, l'arabe de droite à gauche sur ces écrans, un compte réellement abonné à l'offre Apprentissage (l'essai utilise le compte administrateur, qui a l'accès complet), la révision espacée avec des échéances réelles (liste vide dans l'essai). → registre n° 64 et 65.

### Debug
- Onglet Apprendre vide ou encadré « offre Apprentissage » alors que le compte l'a : `GET /me/learning` avec le jeton doit répondre 200 (sinon `learning_required` = abonnement de palier « learning » non actif).
- « Mettre en pratique » répond `no_key` / 503 : `PRACTICE_KEY` n'est pas définie sur `majlistv-api` (ne jamais la changer ensuite : les engagements deviendraient illisibles).
- Pas de bouton « Passer le quiz » : la conférence n'a pas assez de questions validées (réglage « minimum de questions », 3 par défaut) ou le quiz est coupé (Admin → Fonctions).
- Autres cas : `mobile/README.md`.

## Étape 22b-3 — Application : refonte fidèle à la PWA (22/10)

**Ce que c'est.** L'application reprend le design et le contenu de la PWA, en natif : mêmes couleurs (noir chaud, or, texte blanc pur), mêmes polices (Montserrat, DM Sans, Noto Kufi / Noto Sans Arabic en arabe), mêmes textes FR / EN / AR (573 textes du site importés tels quels par `mobile/scripts/import-web-texts.mjs`).

**Ce qui change pour l'utilisateur**
- En-tête avec logo, recherche et menu latéral (accueil, catalogue, séries, collections, catégories, apprendre, bibliothèque, compte, langue).
- Accueil : bannière, rangées (révision, quiz à rattraper, reprise), formats, rangées du site (séries incluses), bandeau Kids, citation du jour.
- Fiche conférence : lecteur (vidéo du serveur, archive.org, **YouTube et Vimeo lus dans l'application**, plus de renvoi vers le site), actions (favori, liste, partager, audio seul, incrustation), « Apprendre avec cette conférence » (quiz, mise en pratique), onglets Résumé / Chapitres / Transcription cliquable / Mes notes / À propos, thèmes, suivre l'intervenant, panneau de la série, « Dans la même veine », carte d'aperçu verrouillé (l'abonnement se prend sur le site).
- Catalogue (catégories, formats, niveau, grille), recherche (titres, passages de transcription, séries), séries, collections, thèmes, page intervenant.
- **Inscription** : l'écran de création de compte s'ouvre depuis les boutons « Essai gratuit » ; si les inscriptions sont fermées (Admin → Fonctions → « Inscription ouverte »), le message du serveur s'affiche au lieu d'un texte trompeur.

**Prérequis.** Aucun changement serveur : ne rien redéployer (API, site, worker inchangés). Seule l'application est refabriquée.

**Refabriquer l'APK.** GitHub → Actions → « Application Android (APK) » → Run workflow (branche `main`) → télécharger l'artifact `mejliss-tv-android` → installer par-dessus (version 0.3.0).

**Vérifications faites (environnement de développement).** `npm run check` (typage + 38 tests, dont le lecteur intégré : identifiants refusés s'ils sont douteux, page générée, messages), essai contre une vraie API (inscription, connexion, routes séries / collections / thèmes / chaînes / recherche / formats / catégories), compilation du paquet Android (`npm run bundle`).

**Non vérifié (aucun téléphone ici).** Lecteur YouTube / Vimeo (WebView), affichage réel des polices et de l'arabe, mise en page sur téléphone et tablette.

**Debug.**
- YouTube affiche « erreur 153 » ou une vidéo grise : l'origine envoyée au lecteur est `SITE_URL` (réglable par `EXPO_PUBLIC_SITE_URL`) ; vérifier que la vidéo autorise l'intégration.
- Inscription refusée : lire le message affiché ; « Les inscriptions sont fermées » = fonction désactivée côté Admin.
- Un texte manquant : relancer `node scripts/import-web-texts.mjs` dans `mobile/` après avoir ajouté un `t('clé')`.

**Exemples.** Ouvrir une conférence YouTube → elle se lit dans la fiche ; toucher un passage de la transcription → le lecteur y saute ; menu ☰ → Catalogue → filtrer par format.

## Étape 23a — Prière : horaires internes, pastille d'en-tête, pause souple (22/10)

**Description.** À l'heure de chaque prière cochée, la lecture en cours (vidéo ou audio avec son, y compris YouTube / Vimeo) se met en pause et un écran propose « J'ai prié » ou « Continuer quand même ». Le blocage est **souple** : on peut toujours continuer, et la pause s'arrête d'elle-même après la durée choisie (10 min par défaut). Une **pastille** à côté de la loupe affiche « prochaine prière + compte à rebours » (dorée quand il reste ≤ 10 min). Elle s'applique aussi à Mejliss TV Kids. Les horaires sont **calculés dans le navigateur** (aucun service externe, aucune clé) ; Mawaqit viendra à l'étape 23b.

**Réglages.**
- Visiteur : `/priere` ou la pastille → « Tous les réglages ». Membre : Compte → onglet « Prière ». Les choix sont enregistrés sur le compte (`GET/PUT /me/prayer`), ou dans le navigateur pour un visiteur ou l'espace Kids.
- Lieu : automatique (ville du fuseau horaire de l'appareil, sinon ville par défaut), ville choisie (97 villes intégrées) ou « Me localiser » (position arrondie à 0,1° ≈ 11 km, demandée seulement au clic).
- Méthode : UOIF 12°/12° (défaut), Ligue islamique mondiale, Umm al-Qura, Égypte, Turquie (Diyanet), ISNA. École Asr : standard ou hanafite. Durée de pause, prières concernées, pastille on/off, pause on/off.
- Admin : Admin → Fonctions → « Prière » (active/désactive tout) ; Admin → Paramètres → « Module : Prière » (activée par défaut, pastille, méthode, école, durée et durée maximale, ville par défaut).

**Prérequis.** Aucun nouveau service, aucune variable d'environnement. Migration `api/src/modules/prayer/migrations/001_prayer.sql` (table `user_prayer_prefs`) appliquée au démarrage de l'API.

**Déploiement (DockPanel).** Git Deploy → Redeploy `majlistv-api` (migration), puis `majlistv-web`. Rien d'autre. Puis sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```

**Tests (poste de développement).**
```
node web/tests/prayer.mjs
# comparaison facultative avec la bibliothèque adhan :
# mkdir /tmp/pt && cd /tmp/pt && npm i adhan && cd - && ADHAN_PATH=/tmp/pt/node_modules/adhan/lib/esm/Adhan.js node web/tests/prayer.mjs
```
Attendu : « TOUT EST OK » (écart maximal 1,4 min avec adhan sur 6 méthodes × 97 villes).

**Debug.**
- Pas de pastille : Admin → Fonctions → « Prière » est-elle active ? `curl https://api-majlisstv.le-publicitaire.fr/config` doit contenir `"prayer"`.
- Horaire décalé : vérifier la ville et la méthode dans `/priere` ; l'heure affichée suit le fuseau de la ville choisie.
- Pas de pause : la pause ne touche que la lecture **avec son** ; une vidéo muette ou en boucle est ignorée. Elle n'a lieu que dans la fenêtre [heure, heure + durée] et une seule fois par prière (mémorisée dans le navigateur, clé `prayerDone`).

**Exemples.** Paris le 22/10/2026 : Fajr 07:12, Chourouk 08:21, Dhuhr 13:35, Asr 16:17, Maghrib 18:47, Isha 19:56 (UOIF). Pour essayer : choisir une prière dont l'heure est proche, lancer une conférence avec le son, attendre l'heure.

**Honnêteté sur les essais.** Vérifié : 40+ tests du calcul, API (GET vide, PUT borné et arrondi, corps invalide → 400, sans jeton → 401), compilation du site, essai Playwright (Chromium, horloge simulée) en ordinateur, mobile 390 px et arabe : pastille, fenêtre, pause de la vidéo, reprise après « J'ai prié », aucune seconde interruption. **Non essayé** : téléphone réel, Safari / Firefox, boîte de dialogue de géolocalisation, lecteurs YouTube / Vimeo réels (testés via l'adaptateur seulement). Règles pour les latitudes élevées : réglage `highLat` sans interface, « angle » par défaut. Pas encore dans l'application mobile ni la TV.

## Étape 22b-4 — Notifications et prière dans l'application (22/10, application 0.4.0)

**Description.** Trois choses, sur le téléphone :
1. **Rappel à l'heure de la prière, application fermée.** Les horaires sont calculés SUR le téléphone (même calcul que le site, copie de `web/lib/prayer*.js` dans `mobile/src/lib/prayer/`) ; l'application programme les rappels des 7 prochains jours à chaque ouverture. Aucun serveur, aucune clé, aucune connexion nécessaire.
2. **Prière dans l'application** : pastille « prochaine prière + compte à rebours » dans l'en-tête, pause souple de la lecture (vidéo du serveur, YouTube, Vimeo) avec « J'ai prié » / « Continuer quand même », écran de réglages (Compte → « Réglages de la prière ») : lieu (ville, position approximative), méthode, école Asr, durée de pause, prières concernées, rappel on/off. Mêmes réglages que le site, enregistrés sur le compte.
3. **Notifications du serveur** (Firebase Cloud Messaging) : nouvelles conférences des intervenants suivis, sélection de la semaine, révision du jour. Elles partent EN PLUS des e-mails (mêmes réglages, mêmes déclencheurs). Un interrupteur « Actualités de Mejliss TV » dans Compte → Notifications.
Toucher une notification ouvre la bonne page (la conférence, la collection, « Apprendre »).

**Prérequis.** Rien de nouveau pour les rappels de prière. Pour les notifications du serveur : un projet Firebase gratuit (voir ci-dessous). Sans Firebase, tout le reste marche.

### Mettre en place Firebase (une seule fois, environ 15 minutes)
1. Aller sur https://console.firebase.google.com → **Ajouter un projet** → nom « Mejliss TV » → (Google Analytics : inutile, on peut le refuser) → Créer.
2. Dans le projet : **Ajouter une application → Android**. Nom du package Android : `fr.lepublicitaire.mejlisstv` (exactement). Surnom : « Mejliss TV ». Cliquer **Enregistrer l'application**, puis **Télécharger google-services.json**. Les étapes suivantes (SDK, Gradle) sont à passer : **Suivant → Suivant → Continuer vers la console**.
3. Sur GitHub, dépôt `LePubli/majlistv` → **Settings → Secrets and variables → Actions → New repository secret**. Nom : `GOOGLE_SERVICES_JSON`. Valeur : tout le contenu du fichier `google-services.json` (ouvrir le fichier avec le Bloc-notes, tout sélectionner, copier, coller).
4. Dans Firebase : roue dentée ⚙ → **Paramètres du projet → Comptes de service → Générer une nouvelle clé privée → Générer la clé**. Un second fichier .json se télécharge. **C'est un secret : ne l'envoyer à personne, pas même dans une conversation.** (Si le bouton parle d'activer l'« API Firebase Cloud Messaging (V1) », elle l'est par défaut dans un nouveau projet ; sinon l'activer dans Paramètres du projet → Cloud Messaging.)
5. Sur le site : **Admin → Paramètres → Notifications (e-mails et téléphone)** → champ « Notifications sur téléphone : fichier de clé Firebase (JSON) » → coller tout le contenu du second fichier → **Enregistrer** → bouton **Tester** (la clé est vérifiée auprès de Google ; si votre téléphone est déjà enregistré, il reçoit une notification de test).
6. GitHub → **Actions → « Application Android (APK) » → Run workflow** (environ 14 min) → télécharger l'APK (version **0.4.0**) → l'installer par-dessus la version précédente.
7. Sur le téléphone : ouvrir l'application, accepter les notifications quand Android le demande, se connecter. Retourner dans Admin → Paramètres → **Tester** : la réponse doit être « Notification envoyée à 1 appareil ».

**Déploiement (DockPanel).** Seule l'API change côté serveur : Git Deploy → Redeploy **`majlistv-api`** (migration `062_push_devices.sql` au démarrage : table `device_tokens`, colonne `users.notify_push`). Le site n'est pas modifié. Puis sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
Résultat attendu : 0 échec.

**Nouvelles routes API.** `PUT /me/push-token` `{ token, platform?, locale? }` (enregistre ce téléphone ; un téléphone = un seul compte ; 10 appareils maximum par compte), `DELETE /me/push-token` `{ token }` (déconnexion), `GET/PUT /me/notifications` (+ `push`, `devices`, `available.push`), `POST /admin/settings/test` `{ target: "push" }`. Nouveau réglage `fcm_service_account` (secret chiffré, Admin → Paramètres). Variable d'environnement facultative : `FCM_SERVICE_ACCOUNT` (même contenu, à la place du réglage de l'admin).

**Tests (poste de développement).**
```
cd api && set -a; . /var/tmp/api-test.env; set +a
node tests/test_push.mjs          # faux serveur Google : signature, envoi, textes fr/en/ar, jeton périmé, 3 boucles → « TOUT EST OK »
python3 tests/test_push_api.py    # routes téléphone → « TOUT EST OK »
cd ../mobile
npm run check                      # typage + 47 tests
API_TEST_URL=http://127.0.0.1:3055 npx tsx tests/api_contract.ts   # application ↔ vraie API
```

**Debug.**
- Le test de l'admin dit « Google a refusé la clé Firebase » : le fichier collé n'est pas celui du **compte de service** (celui qui contient `private_key`), ou la clé a été supprimée dans Firebase.
- « Aucun téléphone enregistré » : l'APK n'a pas été fabriqué avec le secret `GOOGLE_SERVICES_JSON` (regarder le journal du workflow : « Firebase : projet … »), ou les notifications sont refusées dans Android (Réglages → Applications → Mejliss TV → Notifications).
- Le rappel de prière arrive en retard de quelques minutes : Android 12+ doit autoriser les « alarmes exactes » (Compte → Réglages de la prière → « Heure exacte » → Autoriser) ; certaines marques (Xiaomi, Huawei, Oppo…) tuent aussi les applications en arrière-plan : désactiver l'« économie de batterie » pour Mejliss TV.
- Aucun rappel de prière : Compte → Réglages de la prière → « Rappel à l'heure de la prière » activé ? Notifications autorisées ? Au moins une prière cochée ? Les rappels sont reprogrammés à chaque ouverture : ouvrir l'application une fois.
- Pas de notification du serveur alors que tout est en place : la fonction « Suivre un intervenant » est-elle active (Admin → Fonctions) ? L'interrupteur « Actualités » du compte est-il actif ? Les boucles tournent toutes les 10 minutes (alertes d'intervenants) ou à l'heure réglée (sélection de la semaine, révision).

**Exemples.** Un membre suit un intervenant, vous publiez une conférence de cet intervenant → dans les 10 minutes : un e-mail ET une notification « Nouvelle conférence — titre — intervenant » ; un toucher ouvre la fiche. Rappel de prière : « C'est l'heure de la prière — Dhuhr · 13:35 ».

**Honnêteté sur les essais.**
- Vérifié : serveur contre un faux Firebase (signature RS256 du jeton, envoi, jeton périmé supprimé, textes fr/en/ar, les 3 boucles, interrupteurs) ; routes ; typage ; 47 tests de l'application dont le planning des rappels (5 prières × 7 jours, heure d'été, prières cochées) et la correspondance des chemins de notification ; essai de l'application contre la vraie API ; compilation du paquet Android ; génération du projet natif avec et sans `google-services.json`.
- **Jamais essayé sur un vrai téléphone** : ni l'invite d'autorisation, ni le rappel de prière application fermée, ni une notification réelle de Firebase, ni les écrans (pastille, pause, réglages) vus à l'écran. Calcul des dates dans Hermes (`Intl` avec fuseau horaire) non vérifié sur appareil.
- **Pas fait** : iPhone (il faudrait un compte développeur Apple et la clé APNs dans Firebase : traité avec les magasins), pause à l'heure de la prière dans les lecteurs externes autres que YouTube / Vimeo, son d'adhan. Les rappels de prière n'existent pas dans la version « installable » du site (PWA) : réservés à l'application.
- Les notifications du serveur n'envoient rien tant que la clé Firebase n'est pas enregistrée ; les e-mails continuent comme avant.

## Étape 22b-5 — Mises à jour de l'application depuis notre serveur (22/10, application 0.5.0)

### Description
L'application Android n'a plus besoin d'être retéléchargée à la main. Au démarrage (et au retour dans l'application, au plus toutes les 6 h), elle demande à **notre serveur** quelle est la dernière version publiée. Si elle est plus récente, un bandeau « Nouvelle version disponible » apparaît ; un toucher ouvre les nouveautés, puis **Mettre à jour** télécharge l'APK depuis notre stockage (Garage), vérifie son empreinte SHA-256 et lance l'installation. **Android demande toujours de confirmer l'installation**, et, une seule fois, d'autoriser « Installer des applications inconnues » pour Mejliss TV (bouton « Autoriser l'installation » dans l'écran). Les données et la connexion sont conservées (c'est une mise à jour par-dessus).
Le GitHub workflow publie lui-même chaque nouvel APK sur le serveur (secret `APP_PUBLISH_TOKEN`) : plus aucun téléchargement manuel.
Un réglage « version minimale » (Admin → Paramètres) permet de rendre une mise à jour **obligatoire** pour les très anciennes versions.
La **partie 2** (mise à jour du *contenu* sans réinstaller, via `expo-updates` hébergé sur notre serveur) est décrite en fin de section (« Partie 2 »).

### Ce qui a été ajouté
- **API** : module `appupdates` (fonction activable Admin → Fonctions « Mises à jour de l'application », réglages `mod_appupdates_*`), migration `001_app_releases.sql`.
  - Public : `GET /app/latest?platform=android&versionCode=N`, `GET /app/download/:versionCode` (ou `latest`, redirection signée), `GET /app/updates/manifest` et `GET /app/updates/assets/:sha256` (protocole `expo-updates`, partie 2).
  - Publication (jeton) : `POST /app/publish/apk/init` + `/commit`, `POST /app/publish/update/init` + `/commit` + `/rollback`, `GET /app/publish/releases`.
  - Le serveur refuse un numéro de build inférieur ou égal au dernier publié, contrôle taille et SHA-256 du fichier réellement stocké (sinon il l'efface), garde les 5 dernières versions.
- **Application** : `src/lib/appUpdate.ts` (logique pure), `src/components/AppUpdate.tsx` (bandeau + écran), permission Android `REQUEST_INSTALL_PACKAGES`, textes FR/EN/AR (`au.*`), version 0.5.0 / build 3.
- **Numéro de build** : sur GitHub, `versionCode = 1000 + numéro d'exécution du workflow` (`mobile/app.config.js`) ; toujours croissant.
- **Workflow** : étape « Publier l'APK sur notre serveur » (ignorée sans le secret) ; script `mobile/scripts/publish-release.mjs` ; nouveautés dans `mobile/release-notes.json` (fr / en / ar, à modifier avant un push pour changer le texte affiché).

### Prérequis
- Étape 22b-4 déployée (module de notifications, workflow APK qui fonctionne).
- Stockage Garage opérationnel (variables `S3_*` de l'API déjà en place) et lien `https://api-majlisstv.le-publicitaire.fr` joignable depuis les téléphones.
- Le téléchargement de l'APK passe par un lien signé vers `https://s3-majlisstv.le-publicitaire.fr` (déjà utilisé pour les vidéos).

### Déploiement (dans cet ordre)
1. **GitHub** : rien à faire pour pousser (c'est fait par Claude sur `main`). L'exécution du workflow APK démarre toute seule.
2. **DockPanel** → Git Deploy → **Redeploy `majlistv-api`** (la migration `app_releases` / `app_updates` s'applique au démarrage). Le site (`majlistv-web`) n'est pas concerné.
3. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
Attendu : 0 échec.
4. **Créer le jeton de publication** (une seule fois) :
```bash
openssl rand -hex 32
```
   - Copier le résultat dans **Admin → Paramètres → Mises à jour de l'application → Jeton de publication (GitHub Actions)** → Enregistrer.
   - Le coller aussi dans **GitHub → dépôt → Settings → Secrets and variables → Actions → New repository secret** : nom `APP_PUBLISH_TOKEN`.
   - Ne le collez jamais dans une conversation : c'est un secret, comme la clé Firebase.
5. **Relancer le workflow** : GitHub → Actions → « Application Android (APK) » → Run workflow. À la fin, le journal de l'étape « Publier l'APK sur notre serveur » doit afficher « Publié : version 0.5.0 (build 10xx) ».
6. **Installer ce premier APK à la main** (téléchargé depuis Artifacts, comme d'habitude) : c'est le **dernier téléchargement manuel**. Il contient le mécanisme de mise à jour. Les APK suivants se proposent tout seuls.
7. Vérifier côté serveur (remplacer le jeton) :
```bash
curl -s "https://api-majlisstv.le-publicitaire.fr/app/latest?versionCode=3"
curl -s -H "Authorization: Bearer VOTRE_JETON" https://api-majlisstv.le-publicitaire.fr/app/publish/releases
```

### Utilisation au quotidien
1. Claude pousse une modification de `mobile/` sur `main` → le workflow fabrique l'APK et le publie.
2. Sur le téléphone, au prochain démarrage de l'application : bandeau « Nouvelle version disponible » → **Mettre à jour** → **Installer** → confirmer dans la fenêtre d'Android.
3. Rendre une mise à jour obligatoire : Admin → Paramètres → Mises à jour de l'application → « Version minimale obligatoire (numéro de build) » = le numéro de build à exiger (visible dans la réponse de `/app/latest`, champ `versionCode`). Les applications plus anciennes affichent un écran sans bouton « Plus tard ».
4. Couper la fonction : Admin → Fonctions → « Mises à jour de l'application » (les téléphones ne voient plus rien ; l'APK du site et les téléchargements manuels restent possibles).

### Debug
- **Le bandeau n'apparaît pas** : `curl -s "https://api-majlisstv.le-publicitaire.fr/app/latest?versionCode=3"` — si `latest` est `null`, rien n'est publié (secret `APP_PUBLISH_TOKEN` absent ou différent du réglage ; lire le journal du workflow). L'application ne vérifie qu'une fois toutes les 6 h : fermer complètement puis rouvrir ne suffit pas toujours ; vider les données de l'application force la vérification.
- **Workflow : « Jeton de publication invalide » (401)** : le secret GitHub et le réglage Admin ne sont pas identiques. **503** : réglage vide.
- **Workflow : « déjà publié ou dépassé »** : normal si le numéro de build n'est pas supérieur au dernier publié (relancer le workflow donne un nouveau numéro).
- **Téléchargement en échec** : vérifier que `https://s3-majlisstv.le-publicitaire.fr` répond ; le champ « Adresse publique de l'API » (réglage `mod_appupdates_api_url`) doit avoir **le même domaine** que l'API utilisée par l'application, sinon l'application refuse le lien (protection).
- **« Le fichier reçu ne correspond pas »** : téléchargement tronqué (réessayer) ; si cela se répète, republier l'APK.
- **Android refuse d'installer (« application non installée / signature différente »)** : l'APK est signé avec la clé de test d'Android, la même à chaque fabrication ; si une ancienne version a été signée autrement, il faut la désinstaller une fois. La mise à jour par-dessus conserve les données seulement quand la signature est identique.
- **L'installation ne démarre pas** : toucher « Autoriser l'installation », activer l'option pour Mejliss TV, revenir, toucher « Installer ».

### Honnêteté sur les essais
- **Vérifié** : le serveur de bout en bout contre un stockage S3 de test (publication en 3 morceaux d'un fichier de 70 Mo, empreinte, refus d'un fichier altéré, numéros de build non croissants, ménage, version minimale, redirection de téléchargement, jeton, fonction coupée) ; le script de publication ; la logique de l'application (validation de la réponse, refus des liens d'un autre serveur, fréquence de vérification, textes FR/EN/AR) ; le typage ; la génération du projet Android (permission `REQUEST_INSTALL_PACKAGES`, numéro de build).
- **Jamais essayé sur un téléphone** : le bandeau, le téléchargement dans l'application et surtout **l'ouverture de l'installateur d'Android** (le lien vers le fichier et les droits de lecture sont écrits d'après la documentation d'Expo et d'Android, pas vérifiés). Si l'installateur ne s'ouvre pas, le téléchargement manuel de l'APK reste possible.
- **Limite d'Android** : l'installation demande toujours un geste de confirmation ; certaines marques ajoutent leurs propres avertissements. Aucune mise à jour silencieuse sans un appareil géré (hors sujet ici).
- **Limite de la clé de signature** : l'APK reste signé avec la clé de test d'Android (non publiable sur Google Play). À l'étape « magasins », changer de clé obligera une réinstallation manuelle une fois.

### Partie 2 — le contenu se met à jour sans réinstaller (expo-updates, sur notre serveur)
**Principe.** Une grande partie des changements (textes, écrans, corrections de code) ne touche pas au « code natif » d'Android. Pour ceux-là, le workflow publie aussi le *contenu* de l'application sur notre serveur ; chaque application installée le télécharge en arrière-plan au démarrage et l'applique au démarrage suivant. Un bandeau « Une mise à jour du contenu est prête — Redémarrer » permet de l'appliquer tout de suite. Rien à toucher, aucune confirmation d'Android.
**Ce qui ne passe PAS par là** : tout ce qui change le code natif (nouvelle bibliothèque, nouvelle permission, nouveau plugin, changement de `version`). Il faut alors un nouvel APK, que la partie 1 propose à l'application (« Nouvelle version disponible »).
**Sécurité de compatibilité.** `mobile/runtimeVersion.js` calcule une « version d'exécution » = version + empreinte (dépendances, permissions, plugins), par exemple `0.5.0-bee48835`. Une application ne reçoit que le contenu publié pour *sa* version d'exécution : ajouter une bibliothèque change l'empreinte, donc les anciennes applications ne reçoivent plus un contenu qui ne leur convient pas.

**Ce qui a été ajouté** : `expo-updates` (app.json : adresse `…/app/updates/manifest`, vérification au démarrage, démarrage sans attente) ; `src/components/OtaBanner.tsx` ; `mobile/scripts/publish-update.mjs` (export Android → envoi des fichiers manquants au stockage → publication) ; étape « Publier la mise à jour du contenu » du workflow (même secret `APP_PUBLISH_TOKEN`) ; côté serveur, `GET /app/updates/manifest` (protocole d'Expo : multipart, directive de retour arrière) et `GET /app/updates/assets/:sha256` (fichiers à adresse stable, cache illimité) — déjà livrés avec la partie 1.

**Déploiement** : aucun supplémentaire si la partie 1 est en place (API déjà redéployée, jeton créé). Il faut seulement **installer une fois l'APK de cette version** (il contient `expo-updates`) ; ensuite, chaque push qui change uniquement du contenu arrive sans réinstaller.

**Exemples**
```bash
# Voir ce qui est publié (remplacer le jeton)
curl -s -H "Authorization: Bearer VOTRE_JETON" https://api-majlisstv.le-publicitaire.fr/app/publish/releases
# Ce que reçoit une application (version d'exécution à adapter : voir le journal du workflow)
curl -s -H "expo-protocol-version: 1" -H "expo-platform: android" -H "expo-runtime-version: 0.5.0-bee48835" -H "accept: application/expo+json" https://api-majlisstv.le-publicitaire.fr/app/updates/manifest
# Revenir au contenu intégré à l'APK (retour arrière, remplacer la version d'exécution)
curl -s -X POST -H "Authorization: Bearer VOTRE_JETON" -H "content-type: application/json" -d '{"runtimeVersion":"0.5.0-bee48835"}' https://api-majlisstv.le-publicitaire.fr/app/publish/update/rollback
```

**Debug**
- Rien ne change sur le téléphone : l'application ne reçoit le contenu qu'au démarrage, l'applique au démarrage suivant (ou via le bandeau). Vérifier que le journal du workflow affiche « Publié : mise à jour … » et que la version d'exécution est la même que celle de l'APK installé (elle change si une bibliothèque, une permission ou un plugin change).
- Aucune mise à jour dans l'application de développement (`expo start`) : normal, `expo-updates` y est désactivé.
- Publication refusée (401 / 503) : voir « Debug » de la partie 1 (jeton).
- Retour arrière : voir l'exemple `rollback` ci-dessus ; la prochaine ouverture revient au contenu de l'APK.

**Honnêteté sur les essais (partie 2)**
- Vérifié : export Android réel (101 fichiers + bundle Hermes de 3,4 Mo) publié sur le serveur de test, manifeste servi dans les deux formats, **empreintes SHA-256 de tous les fichiers recontrôlées**, deuxième publication sans renvoi des fichiers déjà présents, génération du projet natif (`expo prebuild` : adresse du serveur et version d'exécution bien écrites dans le manifeste Android).
- **Jamais essayé** : la fabrication de l'APK avec `expo-updates` par Gradle (GitHub Actions) et la réception d'une mise à jour par une vraie application. Si le workflow échoue à cause d'`expo-updates`, me donner le message : le retrait de la partie 2 n'affecte pas la partie 1.
- Le premier démarrage après une mise à jour peut afficher un instant l'ancien contenu (démarrage sans attente, voulu pour ne pas ralentir l'ouverture).
- Chaque fabrication publie aussi son contenu : une application qui vient d'installer cet APK peut télécharger une fois un contenu identique à ce qu'elle contient déjà (sans effet visible).


## Étape 22b-6 — Hors connexion : télécharger une conférence dans l'application (22/10, application 0.6.0)

### Description
Dans la fiche d'une conférence hébergée chez nous, le bouton **Télécharger** propose : **audio seul** (≈ 28 Mo par heure), **vidéo 360p** ou **vidéo 720p**, avec la taille estimée. Le serveur prépare **un seul fichier** (MP4 pour la vidéo, M4A pour l'audio) en recopiant la conférence sans la reconvertir (quelques secondes à quelques minutes la première fois, immédiat ensuite) ; l'application le télécharge, **contrôle son empreinte SHA-256**, le garde dans son stockage privé et le relit **sans réseau** depuis l'écran **Mes téléchargements** (menu ☰ → « Mes téléchargements », aussi proposé sur l'accueil quand le réseau manque).
- **Réservé aux abonnés** (abonnement en cours, accès offert, propriétaire / modérateur / administrateur), **même pour une conférence en accès libre** (précisé à l'étape 22b-6 bis).
- **Valable 30 jours** (réglable : Admin → Paramètres → « Durée de validité d'un téléchargement »). Dès que le téléphone se reconnecte, l'application **renouvelle** les téléchargements dont l'abonnement est toujours actif (au plus toutes les 12 h) ; si l'abonnement est terminé ou si la conférence a été retirée, le téléchargement est **supprimé**.
- **Pas de limite de nombre** (décision d'Epok) : seulement l'espace libre du téléphone. L'écran « Mes téléchargements » montre l'espace utilisé, les jours restants et permet de supprimer.
- Reprise de lecture : la position regardée hors connexion est gardée sur le téléphone et **envoyée au serveur à la reconnexion** (même reprise que sur le site).
- Déconnexion voulue : tous les téléchargements du compte sont effacés ; un autre compte qui se connecte sur le téléphone efface ceux du précédent. Hors connexion (jeton gardé, session non vérifiée), rien n'est effacé.
- **Pas disponible** : vidéos YouTube / Vimeo / archive.org lues depuis leur plateforme (message clair), 1080p. (Résumé, chapitres, transcription et quiz : disponibles hors connexion depuis l'étape 22b-6 bis.)

### Ce qui a été ajouté
- **API** : module `offline` (fonction activable Admin → Fonctions « Hors connexion (application) », réglage `mod_offline_valid_days`), migration `001_offline_files.sql` (table `offline_files`).
  - `GET /me/offline/:id/options` (audio, qualités, tailles estimées), `POST /me/offline/:id` (`{kind, height?, retry?}` → 202 « preparing » à rappeler, 200 « ready » + lien signé / taille / empreinte / fin de validité, 502 « failed » + message), `GET /me/offline/:id/status`, `POST /me/offline/renew` (`{talkIds}` → accordé / refusé).
  - Préparation : FFmpeg copie la playlist HLS (variante 360p ou 720p, ou piste audio) vers un MP4 / M4A (`-c copy`, aucune reconversion), 2 préparations en parallèle au plus, fichier gardé dans le stockage (`offline/<conférence>/<version>/…`) et réutilisé ; effacé avec la conférence.
- **Application** : `src/lib/downloads.ts` (logique pure), `src/lib/downloadStore.tsx` (téléchargement, index, renouvellement), `src/components/DownloadSheet.tsx` (fenêtre « Regarder sans connexion »), `src/app/downloads.tsx` (liste), `src/app/offline/[id].tsx` (lecteur hors connexion), bouton dans la fiche, entrée du menu, accueil hors connexion ; textes FR/EN/AR (`dl.*`) ; dépendance `expo-network` ; version 0.6.0 / build 4.

### Prérequis
- Étape 22b-5 en place (publication des APK) ; stockage Garage opérationnel ; l'API contient FFmpeg (déjà le cas : image Alpine avec `ffmpeg`).
- **Espace disque de l'API** : la préparation écrit un fichier temporaire (jusqu'à ≈ 0,5 Go pour une heure en 720p) dans le dossier temporaire du conteneur, effacé aussitôt.

### Déploiement (dans cet ordre)
1. **DockPanel** → Git Deploy → **Redeploy `majlistv-api`** (la migration `offline_files` s'applique au démarrage). Le site (`majlistv-web`) n'est pas concerné.
2. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
Attendu : 0 échec.
3. **Application** : le workflow GitHub fabrique l'APK 0.6.0 et le publie sur le serveur (étape 22b-5) ; sur le téléphone, « Nouvelle version disponible » → Mettre à jour (ou installer l'APK du workflow à la main). `expo-network` est une nouvelle bibliothèque native : **le contenu ne se met pas à jour tout seul de 0.5.0 à 0.6.0, il faut installer ce nouvel APK**.
4. Vérifier côté serveur : Admin → Fonctions → « Hors connexion (application) » activée ; Admin → Paramètres → « Durée de validité d'un téléchargement » = 30.

### Utilisation
1. Compte abonné → ouvrir une conférence hébergée chez nous → **Télécharger** → choisir audio / 360p / 720p → attendre la préparation puis le téléchargement (barre de progression ; **Annuler** possible).
2. **Regarder hors connexion** (même fenêtre) ou ☰ → **Mes téléchargements** → toucher la conférence. Mettre le téléphone en mode avion pour l'essayer.
3. Supprimer : corbeille dans la liste, ou « Supprimer le téléchargement » dans la fenêtre de la conférence.
4. Renouvellement : automatique à la reconnexion ; bouton « Renouveler maintenant » dans la liste si un téléchargement est expiré.
5. Changer la durée de validité : Admin → Paramètres → « Durée de validité d'un téléchargement (jours) ».
Exemples serveur (remplacer le jeton d'un abonné et l'identifiant de la conférence) :
```bash
curl -s -H "Authorization: Bearer JETON" https://api-majlisstv.le-publicitaire.fr/me/offline/ID_CONFERENCE/options
curl -s -X POST -H "Authorization: Bearer JETON" -H "content-type: application/json" -d '{"kind":"audio"}' https://api-majlisstv.le-publicitaire.fr/me/offline/ID_CONFERENCE
```

### Debug
- **« Préparation sur le serveur… » qui dure** : FFmpeg lit la conférence dans Garage ; compter quelques minutes pour une longue vidéo. Journal : `docker logs --tail 100 dockpanel-git-majlistv-api 2>&1 | grep -i "hors connexion"`. Le bouton Annuler arrête l'attente.
- **Échec de préparation (message affiché)** : voir la ligne `Hors connexion : préparation impossible (…)` du journal ; cause fréquente : disque temporaire plein ou playlist absente. État en base : `docker exec -it dockpanel-app-postgres-majlisstv psql -U <utilisateur> -d <base> -c "select talk_id, kind, height, status, error from offline_files order by updated_at desc limit 10;"`. Pour forcer une nouvelle préparation d'un fichier : supprimer la ligne concernée (la prochaine demande repart de zéro).
- **« Le fichier reçu est incomplet »** : téléchargement tronqué (réseau) : réessayer.
- **« Réservé aux abonnés »** : le compte n'a pas d'abonnement actif (Admin → Utilisateurs / abonnements).
- **Un téléchargement a disparu après une reconnexion** : l'abonnement est terminé ou la conférence a été retirée (voulu).
- **Lecture impossible hors connexion** : « Supprimez le téléchargement puis téléchargez-le de nouveau » ; me donner l'écran et la marque du téléphone.

### Honnêteté sur les essais
- **Vérifié** : le serveur avec un **vrai FFmpeg** (HLS fMP4 à 2 qualités + audio fabriqué comme le worker) contre un stockage S3 de test : audio M4A, vidéo 360p et 720p relus par FFprobe (hauteur, son, durée), empreinte et taille, lecture partielle (Range) du lien signé, droits (visiteur, sans abonnement, libre, externe, pas prêt, pas d'audio), renouvellement accordé / refusé, échec signalé sans boucle puis nouvel essai, suppression avec la conférence, fonction coupée ; la logique de l'application (index, expiration, renouvellement, réponses du serveur, textes FR/EN/AR) avec 72 tests ; **le client contre une vraie API** (`mobile/tests/offline_contract.ts` : options, attente de préparation, téléchargement, empreinte, renouvellement, refus) ; typage, compilation du paquet Android, génération du projet natif.
- **Jamais essayé sur un téléphone** : le téléchargement par `expo-file-system` (progression, annulation, redirection du lien signé, déplacement du fichier), le **lecteur `expo-video` sur un fichier local**, la détection du réseau (`expo-network`), les écrans, le mode avion réel, le comportement après un redémarrage du téléphone. Les noms d'API d'Expo ont été vérifiés dans leurs définitions de types, pas à l'usage.
- **Protection** : voir l'étape 22b-6 bis (licence signée, horloge de confiance) et ses limites sur un téléphone « rooté ».
- **Stockage serveur** : les fichiers préparés sont temporaires depuis l'étape 22b-6 bis (ménage automatique).
- Profils enfants (Kids) : le téléchargement n'est pas prévu (étape « Kids natif »).

## Étape 22b-6 bis — Hors connexion complet et protégé (22/10, application 0.7.0)

### Description
Suite à vos remarques sur l'étape 22b-6 :
1. **Abonnés seulement, sans exception** : même une conférence en accès libre ne se télécharge qu'avec un abonnement actif (ou en tant que propriétaire / modérateur / administrateur). Mon choix précédent (« libre = tout compte connecté ») est retiré.
2. **Les fichiers s'accumulent sur le téléphone, pas dans Garage** : le serveur ne garde un fichier préparé que **3 heures** (réglable : variable `OFFLINE_FILE_TTL_MIN`, minimum 15 min). Quand l'application confirme avoir bien reçu le fichier (`POST /me/offline/:id/done`), il est effacé du stockage **10 minutes** plus tard. Un ménage tourne au démarrage de l'API, toutes les 30 minutes et à chaque demande (au plus 1 fois par minute) ; les préparations en échec de plus d'1 h sont aussi effacées. Un nouveau téléchargement re-prépare simplement le fichier. Les téléchargements s'accumulent donc sur le téléphone de l'abonné (pas de limite de nombre), sans compter dans le plafond de 30 Go.
3. **Résumé, chapitres, transcription et quiz fonctionnent hors connexion.** À chaque téléchargement, l'application reçoit un **pack** (`GET /me/offline/:id/pack`, abonnés seulement) : résumé + points clés + chapitres, transcription dans **toutes** les langues disponibles, quiz avec **bonnes réponses et explications**. Il est enregistré à côté du fichier et **mis à jour une fois par jour** quand le téléphone est en ligne. Le lecteur hors connexion a 4 onglets : Résumé, Chapitres (toucher = aller à ce passage), Transcription (suivie pendant la lecture, toucher = aller à ce passage, choix de la langue), Quiz.
   - **Quiz hors connexion** : corrigé sur le téléphone (même calcul que le serveur : vérifié par un test contre la vraie API). Le résultat est **mis en file** puis **envoyé au serveur à la reconnexion** (`POST /talks/:id/quiz/submit`) : il compte alors pour les badges, le score Apprentissage et la révision espacée (la date enregistrée est celle de l'envoi). Si le réseau est disponible au moment de terminer, l'envoi est immédiat et le résultat affiché est celui du serveur.
4. **Protection** (voir « Limites » ci-dessous, soyons précis sur ce qu'elle fait et ne fait pas) :
   - **Licence signée** : à chaque téléchargement et à chaque renouvellement, le serveur signe (Ed25519) un petit document qui lie **le compte, la conférence, l'empreinte du fichier et la date de fin**. L'application ne lit un fichier que si la signature est valide, que c'est le bon compte, le bon fichier et que la date de fin n'est pas passée. Modifier à la main la date de fin dans les fichiers de l'application ne sert donc à rien (la signature ne correspond plus).
   - **Horloge de confiance** : l'application retient la **plus haute heure vue** (téléphone et serveur) dans le coffre sécurisé d'Android (Keystore, `expo-secure-store`). La date de fin est comparée à cette heure et non à l'heure affichée par le téléphone : **reculer la date du téléphone ne prolonge plus rien**, et un message l'indique dans « Mes téléchargements ». Seule l'heure du serveur, reçue en ligne, peut corriger cette heure (par exemple si le téléphone avait été réglé par erreur très loin dans le futur).
   - **Pas de capture ni d'enregistrement d'écran** pendant la lecture hors connexion et le quiz (`expo-screen-capture`, drapeau Android « sécurisé »).
   - **Sauvegarde Android désactivée** (`allowBackup: false`) : le dossier de l'application n'est plus extractible par `adb backup` ni par la sauvegarde Google.
   - Les téléchargements faits avec l'application 0.6.0 n'ont pas de licence : après la mise à jour, ils demandent de se reconnecter une fois (renouvellement automatique) puis fonctionnent.

### Ce qui a été ajouté
- **API** (module `offline`) : migration `002_offline_license.sql` (table `offline_keys`, une ligne : paire de clés Ed25519 créée au premier besoin, clé privée chiffrée avec `SETTINGS_KEY`) ; `license.js` (signature), `pack.js` (construction du pack), `prepare.js` (`sweep()` : ménage) ; routes `GET /me/offline/:id/pack`, `POST /me/offline/:id/done`, `POST /me/offline/:id` (réponse « ready » : + `licence`, `publicKey`, `serverTime`), `POST /me/offline/renew` (forme `{ files: [{ talkId, kind, height, sha256 }] }` → licence neuve par fichier + `serverTime` ; l'ancienne forme `{ talkIds }` reste acceptée, sans licence).
- **Application** : `src/lib/license.ts` (vérification de la signature avec `tweetnacl`, états `ok / expired / invalid / wrong_user / wrong_file`, horloge de confiance), `src/lib/offlineGuard.ts` (coffre sécurisé : plus haute heure vue, clé publique), `src/lib/offlinePack.ts` (pack, correction locale du quiz, file d'attente), `src/components/OfflineTabs.tsx`, `src/app/offline/quiz/[id].tsx`, `downloadStore.tsx` / `downloads.ts` mis à jour. Nouvelles dépendances : `expo-screen-capture`, `tweetnacl` (la première est native : **nouvel APK obligatoire**, pas de mise à jour du contenu seule depuis 0.6.0).
- **Tests** : serveur `api/tests/test_offline.py` (53 vérifications : abonné seulement même en accès libre, licence vérifiée avec une vraie bibliothèque Ed25519 et falsification refusée, pack, `done`, ménage des objets et des lignes) ; application `npm test` (84 tests dont `tests/license.test.ts` et `tests/offlinePack.test.ts`, licences signées par Node et vérifiées par `tweetnacl`) ; essai contre une vraie API `tests/offline_contract.ts` (licence signée par le serveur acceptée par l'application, pack, **quiz corrigé localement = quiz corrigé par le serveur**, refus d'un compte sans abonnement sur une conférence libre).

### Prérequis
Étape 22b-6 en place. Aucune nouvelle variable obligatoire ; `SETTINGS_KEY` doit rester inchangée (elle chiffre la clé de signature : si elle changeait, la clé deviendrait illisible, les licences existantes seraient refusées et il faudrait recréer la ligne `offline_keys`).

### Déploiement (dans cet ordre)
1. **DockPanel** → Git Deploy → **Redeploy `majlistv-api`** (la migration `offline_keys` s'applique au démarrage). Le site (`majlistv-web`) n'est pas concerné.
2. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
Attendu : 0 échec.
3. **Application 0.7.0** : le workflow GitHub fabrique l'APK et le publie (étape 22b-5). Sur le téléphone : « Nouvelle version disponible » → Mettre à jour. **Important** : l'application 0.6.0 ne peut pas recevoir 0.7.0 par mise à jour du contenu seule (nouvelle bibliothèque native) ; passer par l'APK.
4. Nettoyage des anciens fichiers de l'étape 22b-6 déjà dans Garage : ils seront effacés tout seuls par le ménage (3 h après leur dernière utilisation ; au premier démarrage de l'API, ceux des 3 dernières heures restent un peu plus longtemps). Pour vérifier : `docker exec dockpanel-app-postgres-majlisstv psql -U <utilisateur> -d <base> -c "select kind, height, status, updated_at from offline_files order by updated_at desc limit 20;"`.

### Utilisation
1. Abonné : ouvrir une conférence → **Télécharger** → choisir audio / 360p / 720p. Quand c'est terminé, le fichier **et** le pack sont sur le téléphone.
2. Mode avion → ☰ → **Mes téléchargements** → toucher la conférence : lecture, puis onglets **Résumé / Chapitres / Transcription / Quiz**.
3. Passer le quiz hors connexion : le résultat s'affiche avec les explications ; à la prochaine connexion il est envoyé (le nombre de quiz en attente est visible dans l'onglet Quiz).
4. Changer la durée de vie des fichiers sur le serveur (facultatif) : variable `OFFLINE_FILE_TTL_MIN` de `majlistv-api` (minutes, défaut 180).

### Debug
- **« Licence à renouveler »** dans la liste : téléchargement de l'ancienne version ou clé de signature changée ; se connecter à Internet (renouvellement automatique) ou toucher « Renouveler maintenant ».
- **Message « La date de ce téléphone a été reculée »** : l'horloge du téléphone est en arrière de la dernière heure connue. Se connecter à Internet une fois remet l'heure du serveur.
- **Onglets vides (« Résumé, transcription et quiz ne sont pas encore sur ce téléphone »)** : le pack n'a pas pu être téléchargé (réseau coupé juste après le fichier) ; il arrive à la prochaine connexion.
- **Voir ce que le serveur garde** : `docker exec dockpanel-app-postgres-majlisstv psql -U <utilisateur> -d <base> -c "select talk_id, kind, height, status, updated_at from offline_files;"` et, côté Garage, le dossier `offline/` du bucket `majlis-videos`.
- **Journal du ménage** : `docker logs --tail 100 dockpanel-git-majlistv-api 2>&1 | grep -i "Hors connexion"`.

### Limites (honnêtes)
- **Ce qui n'est PAS empêché** : un téléphone « rooté » (accès administrateur) peut copier le fichier MP4 lui-même hors de l'application, pendant qu'il est valide, et le lire ailleurs. Seule une protection par chiffrement et DRM (Widevine, magasins d'applications) l'empêcherait réellement ; ce n'est pas fait. Sur un téléphone « rooté », le coffre sécurisé et l'application elle-même peuvent aussi être contournés. La protection ajoutée vise le cas courant : un abonné ordinaire qui recule la date ou modifie les fichiers.
- Un abonné dont l'abonnement se termine garde ses fichiers **jusqu'à la date de fin de la licence en cours** (30 jours au plus) s'il ne se reconnecte jamais ; à la reconnexion, ils sont supprimés (voulu).
- **Jamais essayé sur un téléphone** : les nouveautés natives (`expo-screen-capture`, coffre sécurisé pour l'horloge, lecture des onglets, quiz local, envoi à la reconnexion). Voir le registre, point 84.
- Le pack contient les bonnes réponses du quiz (nécessaire pour corriger sans réseau) : il n'est servi qu'aux abonnés, mais un téléphone « rooté » pourrait les lire dans le fichier du pack.
- La date de la tentative de quiz enregistrée sur le serveur est celle de l'envoi (reconnexion), pas celle du moment où le quiz a été passé.

### Complément (22/10) — vérifier les mises à jour depuis l'application
Écran **Compte → Mises à jour** : affiche la version installée (et son numéro de build), la version du contenu, et le bouton **Rechercher une mise à jour**. Il vérifie l'APK (serveur `GET /app/latest`) puis le contenu (`expo-updates`) et **affiche la cause exacte d'un échec** (code HTTP du serveur, réponse invalide, aucune version publiée, réseau). Si une nouvelle version existe, la fenêtre « Nouvelle version disponible » s'ouvre aussitôt. Rappel : Android impose toujours une confirmation de l'utilisateur pour installer un APK (aucune application ne peut s'installer seule) ; seule la mise à jour du **contenu** (JavaScript) s'applique sans confirmation, au redémarrage.
Contrôle côté serveur (remplacer 5 par le numéro de build affiché dans l'application) :
```bash
curl -s "https://api-majlisstv.le-publicitaire.fr/app/latest?platform=android&versionCode=5"
```

## Étape 22b-7 — Page « Télécharger l'application » avec l'APK (22/10, site)

### Description
La page du site `/application` (lien « Télécharger l'application » du pied de page) propose maintenant, sous l'installation du site (PWA), une carte **Application Android** : version, taille, date, nouveautés (dans la langue de la personne), bouton **Télécharger l'application (APK)**, 4 étapes d'installation et empreinte SHA-256 du fichier. Les données viennent de `GET /app/latest` (la dernière version publiée par le workflow GitHub, étape 22b-5) : à chaque nouvelle publication, la page est à jour sans toucher au site. Le bouton pointe vers `/app/download/<build>` de l'API, qui redirige vers un lien signé du stockage. Sans version publiée (ou si la fonction « Mises à jour de l'application » est coupée), l'ancien message « Bientôt » reste affiché. Sur iPhone et ordinateur, une phrase précise que le fichier est pour Android. Français, anglais et arabe (RTL) ; sans défilement horizontal à 390 px. Aucun achat : l'abonnement reste sur le site.

### Ce qui a été ajouté
`web/app/application/page.js` (carte APK), `web/lib/i18n.js` (clés `pwaApk*` en fr / en / ar), `web/app/globals.css` (quelques styles). Aucune modification de l'API.

### Prérequis
Étape 22b-5 en place et au moins une version publiée (workflow GitHub vert à l'étape « Publier l'APK sur notre serveur »).

### Déploiement
1. DockPanel → Git Deploy → **Redeploy `majlistv-web`** (l'API n'est pas concernée).
2. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
Attendu : 0 échec.

### Utilisation / vérification
Ouvrir https://majlisstv.le-publicitaire.fr/application : la carte « Application Android » doit afficher la dernière version. Contrôle de la source : `curl -s "https://api-majlisstv.le-publicitaire.fr/app/latest?platform=android&versionCode=0"`.

### Debug
- Carte « Bientôt » alors qu'une version est publiée : la commande `curl` ci-dessus ne renvoie pas `latest` (fonction coupée : Admin → Fonctions → « Mises à jour de l'application », ou aucune version publiée) ; ou le site n'a pas été redéployé.
- Le téléchargement échoue (404) : la version a été retirée ; republier depuis GitHub Actions.
- Android refuse l'installation : autoriser une fois le navigateur à installer des applications (étape 3 affichée sur la page).

### Honnêteté sur les essais
Vérifié : compilation du site (`next build`), page lue dans un vrai navigateur (Playwright) contre l'API de test : sans version → « Bientôt » ; avec une version → version, taille, nouveautés, bouton, étapes, empreinte, lien `/app/download/<build>`, pas de défilement horizontal à 390 px ; iPhone → avertissement Android. **Non vérifié** : le téléchargement réel de l'APK depuis le navigateur d'un téléphone et l'installation (dépend du VPS et d'Android) ; l'affichage arabe n'a pas été relu visuellement.



## Étape 22b-8 — Encart « Télécharger l'application » dans le menu (22/10, site)

**Description.** Sur le site et dans le site installé (PWA), un encart doré « Télécharger l'application » (logo Mejliss TV, logos Android et iPhone, bouton « Télécharger ») s'affiche :
- en bas du menu latéral (ordinateur / tablette large), toujours visible même quand la liste défile ; menu replié : seul le logo reste ;
- en bas du menu ☰ (téléphone).
Il renvoie vers `/application`. Il est masqué : sur la page `/application` elle-même, pour les enfants (Mejliss TV Kids), si la fonction « Application » est coupée (Admin → Fonctions), et dans l'application native (qui n'affiche pas ce menu).

**Fichiers.** `web/components/AppPromo.js` (nouveau), `MemberShell.js`, `Header.js`, `web/lib/i18n.js` (`promoTitle`, `promoText`, `promoCta` en fr/en/ar), `web/app/globals.css` (bloc « Étape 22b-8 »).

**Prérequis.** Aucun (pas de migration, pas de variable).

**Déploiement.** DockPanel → Git Deploy → Redeploy `majlistv-web` seulement, puis sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```

**Debug.** Encart absent : vérifier Admin → Fonctions → « Application » (`app_install`), ne pas être sur `/application`, ni en session enfant ; vider le cache du navigateur / recharger le site installé.

**Exemples.** Ordinateur : bas du menu de gauche. Téléphone : ☰ puis bas du menu. Clic → page `/application`.

**Testé / non testé.** Testé (navigateur Chromium automatisé) : 1440 px (menu ouvert et replié), 390 px (menu ☰), pas de débordement horizontal, absence sur `/application`. Non testé : sur un vrai téléphone, en arabe (RTL) visuellement, site installé (PWA) réel.


## Étape 22b-10 — Diffusion sur la télévision : Chromecast et AirPlay (22/10, application 0.8.0 + API)

**Description.** Sur la fiche d'une conférence de l'application, une case « Diffuser » (4ᵉ case de la première rangée d'actions) :
- **Android → Chromecast** (bibliothèque `react-native-google-cast` 4.9.1, récepteur multimédia par défaut de Google `CC1AD845`, pas de compte développeur Google à créer). On touche l'icône, on choisit l'appareil : le téléphone met sa lecture en pause, le téléviseur charge le même flux HLS (avec le jeton de lecture) à la même position. Pendant la diffusion, l'écran de lecture affiche « Diffusion en cours sur <appareil> » et les boutons lecture / pause / −10 s / +10 s commandent le téléviseur ; la progression continue d'être enregistrée (reprise identique au site). À la déconnexion, le téléphone reprend à la dernière position du téléviseur.
- **iPhone / iPad → AirPlay** (bouton système `VideoAirPlayButton` d'`expo-video`) : la lecture est transmise par le système, rien à gérer.
- **Pas de diffusion** pour : YouTube / Vimeo (lus depuis leur plateforme), une vidéo hors connexion (fichier sur le téléphone, protégé par licence), une conférence pas encore convertie. Une conférence verrouillée (non abonné) diffuse seulement l'aperçu, coupé par le serveur comme sur le téléphone.
- **Serveur** : le téléviseur lit lui-même les playlists depuis un autre domaine, donc (1) les playlists HLS (`/hls/…`) répondent `Access-Control-Allow-Origin: *` (l'accès reste porté par le jeton dans l'adresse, aucun cookie) ; (2) le bucket S3 reçoit au démarrage de l'API une 2ᵉ règle CORS en lecture seule (GET, HEAD) ouverte à toute origine, l'envoi (PUT) restant limité au site. Les liens de segments sont signés et valables 4 h.

**Fichiers.** API : `api/src/routes/hls.js`, `api/src/storage.js`, test `api/tests/test_cast.py`. Application : `mobile/src/lib/cast.ts` (logique pure), `components/CastBridge.android.tsx` / `.ios.tsx` / `.tsx` (pont par plateforme), `CastTile.tsx`, `app/talk/[id].tsx`, `lib/i18n.ts` (`cast.*` fr/en/ar), `app.json` (plugin, version 0.8.0, déclarations réseau local iOS), `release-notes.json`, `package.json`, test `mobile/tests/cast.test.ts`.

**Prérequis.** Un Chromecast (ou téléviseur avec Chromecast intégré) sur le **même réseau Wi-Fi** que le téléphone ; pour AirPlay, une Apple TV ou un téléviseur compatible. Aucune variable, aucune migration.

**Déploiement.**
1. DockPanel → Git Deploy → Redeploy `majlistv-api` (en-tête CORS + règle du bucket, appliquée au démarrage). Le site (`majlistv-web`) n'a pas changé.
2. Sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
3. Contrôle de l'en-tête (remplacer l'identifiant par celui d'une conférence prête ; l'adresse complète avec jeton se lit dans la réponse de `GET /talks/<id>`) :
```
curl -sI -H "Origin: https://www.gstatic.com" "https://api-majlisstv.le-publicitaire.fr/hls/<id>/master.m3u8?t=<jeton>" | grep -i access-control
```
4. L'application : le workflow GitHub fabrique l'APK 0.8.0 (nouvelle bibliothèque native : **pas** de mise à jour du contenu seule, il faut installer le nouvel APK ; la bannière « Nouvelle version disponible » le propose).

**Debug.**
- Pas d'icône Cast : la bibliothèque n'est présente que dans l'APK 0.8.0 ou plus ; la case n'apparaît que pour une vidéo du serveur (pas YouTube / Vimeo, pas hors connexion).
- L'appareil n'apparaît pas : même Wi-Fi, pas de « isolation des appareils » sur la box ou le Wi-Fi invité, Chromecast allumé.
- Le téléviseur affiche une erreur au chargement : vérifier l'en-tête CORS (commande ci-dessus) et que le bucket a bien reçu la règle (journal de l'API au démarrage : « CORS du bucket configuré. »). Si le stockage Garage refuse une règle CORS à origine `*`, le journal affiche « CORS du bucket non configuré ».
- Le son passe mais pas l'image / flux refusé : le récepteur par défaut lit du HLS H.264 / AAC ; un fichier d'une autre nature (codec rare) ne passera pas.
- Journal du téléphone : `adb logcat | grep -i cast`.

**Exemples.** Ouvrir une conférence → case « Diffuser » → choisir « Salon » → la vidéo démarre sur la télévision à la position du téléphone → « +10 s » avance la télévision → toucher de nouveau l'icône → « Arrêter la diffusion » : le téléphone reprend où la télévision s'est arrêtée.

**Testé / non testé (honnêteté).** Testé : logique pure (`canCast`, requête de chargement HLS, reprise, cohérence de la configuration : 5 tests ajoutés, 90 au total), typage, génération du projet Android (`expo prebuild` : le plugin ajoute bien le fournisseur d'options Cast, l'identifiant du récepteur et l'initialisation dans `MainActivity`), API : en-têtes CORS des playlists et règle du bucket (test_cast.py, test_offline.py toujours vert). **Non testé** : la compilation Gradle de l'APK avec la nouvelle bibliothèque native (bibliothèque 4.9.x en « mode de compatibilité » avec la nouvelle architecture de React Native 0.88 — à confirmer par le workflow GitHub), la diffusion réelle sur un Chromecast, le pont lecture / pause / reprise sur un vrai téléphone, AirPlay (aucune version iPhone n'est encore fabriquée : code écrit, jamais exécuté), la règle CORS `*` sur le vrai Garage (testée seulement sur le S3 de test), et l'arabe visuellement. Limites : la vitesse de lecture (×1,25 …) ne s'applique qu'au téléphone ; pas de sous-titres sur le téléviseur ; la version de la bibliothèque Google Cast côté Android n'est pas figée (`+`).

### Complément 22b-10 — Chromecast sur le site et la PWA, et correction de la fabrication de l'APK (22/10)

**Correction de l'APK.** Le premier essai de l'APK 0.8.0 a échoué (« Module was compiled with an incompatible version of Kotlin… 2.4.0, expected 2.2.0 ») : la version du SDK Google Cast Android n'était pas figée (`+`), et Google a publié la 23.0.0 le 19/10/2026, compilée avec un Kotlin plus récent que celui d'Expo SDK 58. La version est désormais **figée à 22.3.1** (`app.json`, option `androidPlayServicesCastFrameworkVersion`, vérifiée par un test et dans le projet Android généré). À ne changer qu'avec une montée de version d'Expo.

**Description (site et PWA).** Sur la page d'une conférence, un bouton Cast (icône officielle de Google) apparaît en haut à gauche du lecteur, **si le navigateur sait diffuser et si un appareil est détecté sur le réseau** : Chrome, Edge, Opera, Brave (ordinateur et Android, PWA installée comprise). Au choix de l'appareil : le lecteur local se met en pause et un panneau « Diffusion en cours sur <appareil> » propose Lecture / Pause, −10 s, +10 s, Arrêter la diffusion ; un clic dans la transcription, un chapitre ou un raccourci qui change la position du lecteur local est répercuté sur la télévision ; à l'arrêt, le lecteur reprend à la position de la télévision. Récepteur multimédia par défaut de Google (aucun compte développeur). **Safari (Mac, iPhone, iPad)** : AirPlay est déjà dans les commandes natives du lecteur (attribut `x-webkit-airplay="allow"` ajouté). Firefox et navigateurs iOS autres que Safari : pas de diffusion (limite des navigateurs). Pas de diffusion pour YouTube / Vimeo / archive.org ni pour l'espace Kids web.

**Fichiers.** `web/lib/cast.js` (logique pure), `web/components/CastButton.js`, `web/app/talks/[id]/TalkClient.js`, `web/components/VideoPlayer.js`, `web/app/api/[...path]/route.js` (le relais laisse passer l'en-tête CORS des playlists), `web/middleware.js` (CSP : `https://www.gstatic.com` pour le SDK), `web/lib/i18n.js` (`cast*` fr/en/ar), `web/app/globals.css`, test `web/tests/cast.mjs`.

**Déploiement.** DockPanel → Redeploy `majlistv-api` (en-têtes CORS, voir plus haut) **puis** `majlistv-web`, puis les commandes VPS habituelles (`/root/apply-limits.sh`, `grep -n proxy_pass …`, `nginx -t && systemctl reload nginx`, `bash /root/verify-deploy.sh`). Aucune variable. Contrôle : depuis Chrome, ouvrir une conférence, onglet Réseau : le chargement de `cast_sender.js` (gstatic.com) doit réussir, sans erreur de politique de sécurité dans la console.

**Debug.** Pas de bouton : navigateur non compatible, aucun appareil sur le même réseau Wi-Fi (le SDK masque le bouton sinon), ou SDK bloqué (extension anti-pub, réseau d'entreprise) ; console : `cast_sender.js`. Le téléviseur affiche une erreur : vérifier l'en-tête CORS (`curl -sI -H "Origin: https://www.gstatic.com" "https://majlisstv.le-publicitaire.fr/api/hls/<id>/master.m3u8?t=<jeton>" | grep -i access-control`) et la règle CORS du bucket. Le site doit être en **https** (le récepteur refuse http).

**Testé / non testé.** Testé (Chromium automatisé, SDK Google **simulé**) : bouton absent sous Safari et Firefox, présent sous Chrome ; démarrage d'une session → un seul chargement avec l'adresse https complète, le type `application/x-mpegurl`, la position de reprise et le récepteur par défaut ; panneau, pause et +10 s transmis au téléviseur ; arrêt → reprise locale à la position du téléviseur ; logique pure et CSP (`web/tests/cast.mjs`). **Non testé** : le vrai SDK Google et un vrai Chromecast, la PWA installée (le SDK web est annoncé pour Chrome ; son comportement dans une PWA installée n'a pas été vérifié), AirPlay sous Safari, l'arabe. Limites : l'enregistrement de la progression pendant la diffusion suit la position du téléviseur mais le suivi d'audience (statistiques) considère le lecteur local en pause ; pas de sous-titres sur le téléviseur ; la vitesse de lecture ne s'applique pas au téléviseur.

## Étape 22b-9a — Espace Kids natif : entrée, profils, code parental, accueil enfant (22/10, application 0.9.0)

**Description.** L'application mobile embarque désormais « Mejliss TV Kids » (avant : simple lien vers le site). Le parent (connecté, abonné) crée un **code parental** (4 à 6 chiffres, saisi deux fois), puis des **profils d'enfants** (prénom, avatar, tranche d'âge). Choisir un profil ouvre l'espace enfant : accueil (bonjour, temps restant, recherche, rubriques, « seulement pour mon âge », rangées), lecture (HLS, archive.org ; YouTube/Vimeo en lecteur intégré) avec reprise, vidéos suivantes. L'enfant ne sort que par le **cadenas + code parental** ; le bouton retour d'Android ne quitte jamais l'espace. Pas de téléchargement, de diffusion TV ni d'incrustation dans l'espace enfant (choix validé). Couleurs Kids inchangées (bleu nuit, or vif).

**Sécurité.** L'enfant reçoit un jeton **distinct** (12 h) que le serveur refuse hors des routes Kids ; le jeton du parent n'est plus utilisé pendant la session enfant. Le jeton enfant est renouvelé en silence avant expiration (après 9 h). Code parental : 5 erreurs = blocage 10 min (règle du serveur). La limite quotidienne est comptée par le serveur (battement toutes les 30 s).

**Prérequis.** Aucun changement API ni site : API et web inchangés. Seulement une nouvelle version de l'application (0.9.0, sans nouveau module natif → mise à jour automatique possible).

**Déploiement.**
1. Pousser sur `main` (le workflow GitHub fabrique l'APK car `mobile/**` change et publie la version).
2. Sur le téléphone : Compte → vérifier la mise à jour, ou installer depuis la page « Télécharger l'application ».
3. Aucun redéploiement DockPanel nécessaire.

**Essai sur téléphone.** Menu → Kids → connexion → créer le code → créer un profil → l'ouvrir → lancer une vidéo → toucher le cadenas → saisir le code → retour au compte parent. Vérifier aussi : bouton retour Android (rien ne se passe), fermeture/réouverture de l'application (l'enfant reste dans son espace), arabe (disposition de droite à gauche).

**Debug.** Pas de vidéo : vérifier que le profil a une tranche d'âge et que des conférences Kids existent (Admin → Kids). « Session expirée » : l'application rouvre le choix du profil. Code oublié : le parent le change depuis le site (Mon compte → Kids).

**Tests.** `cd mobile && npm run check` (types + 103 tests dont `tests/kids.test.ts`). Contrat réel contre l'API : `export KIDS_FIXTURE="$(python3 api/tests/kids_fixture.py | tail -1)"; cd mobile && API_URL=http://127.0.0.1:3055 npx tsx tests/kids_contract.ts` (état parent, code, profil, entrée + verrou, catalogue, recherche, lecture + reprise, temps, sortie).

**Honnêteté.** Testé : types, tests unitaires, contrat avec la vraie API, bundle Metro Android. **Non testé** : les écrans sur un vrai téléphone (affichage, lecture vidéo, bouton retour, arabe). Reste (sur « go ») : 9b (quiz et étoiles, courts Kids, petites actions, pause de prière) et 9c (espace parent : limite, sélection du catalogue, validation des actions, rapport, changement de code, modification de profil).

## Étape 22b-9b — Espace Kids natif : quiz et étoiles, courts, petites actions, pause de prière (22/10, application 0.10.0)

**Description.** Suite de 22b-9a dans l'application :
- **Quiz** : sur la page d'une vidéo (carte « Teste-toi ») et à la fin de la lecture (bouton sur l'écran de fin). Une question à la fois, gros boutons, sans chronomètre, 5 questions tirées par le serveur (jamais les réponses avant l'envoi). Résultat en **1 à 3 étoiles** (jamais « raté »), bonnes réponses et explications, **badges** gagnés, prochaine révision (formule Apprentissage). Rejouer ne fait jamais baisser les étoiles. L'accueil affiche le total d'étoiles, les badges, les vidéos « à revoir » (Apprentissage).
- **Courts** : bouton « 🎬 Shorts » sur l'accueil (si la fonction est activée dans Admin → Fonctions) → file verticale, glisser vers le haut pour le suivant, toucher pour pause/lecture, bouton « Regarder » vers la conférence complète. Le serveur ne propose que les courts de l'âge de l'enfant et du catalogue choisi par le parent.
- **Petites actions** : le parent propose (depuis le site), l'enfant touche « Je l'ai fait » (accueil ou fin de quiz), le parent valide.
- **Pause de prière** : la pause existante s'applique aussi à l'espace enfant (vidéos et courts), avec un écran bleu nuit et de gros boutons.

**Prérequis.** Aucun changement API ni site. Les quiz doivent exister et être approuvés (Admin → Quiz) ; sans quiz, la carte n'apparaît pas.

**Déploiement.** Pousser sur `main` → le workflow fabrique l'APK/OTA 0.10.0 (pas de nouveau module natif). Aucun redéploiement DockPanel.

**Essai sur téléphone.** Kids → profil → ouvrir une vidéo avec quiz → « Teste-toi » → répondre → voir étoiles + explications → retour à l'accueil (étoiles mises à jour). Accueil → « Shorts » → glisser. Ajouter une action côté parent (site), la voir sur l'accueil, « Je l'ai fait », la valider côté parent. Heure de prière : la lecture se met en pause.

**Debug.** Pas de carte quiz : la vidéo n'a pas assez de questions approuvées (réglage « quiz_min_questions »). « Shorts » absent : fonction coupée ou aucun court publié pour l'âge. Courts qui ne se lisent pas : adresse temporaire expirée → quitter/rouvrir l'écran.

**Tests.** `cd mobile && npm run check` (types + 111 tests). Contrat réel : `export KIDS_FIXTURE="$(python3 api/tests/kids_fixture.py | tail -1)"; cd mobile && API_URL=http://127.0.0.1:3055 npx tsx tests/kids_contract.ts` (ajouts : questions sans réponses, 1 puis 3 étoiles, total non décroissant, actions todo → claimed → validated, courts + vue).

**Honnêteté.** Testé : types, tests unitaires, contrat avec la vraie API, bundle Android. **Non testé** : tout l'affichage sur un vrai téléphone (quiz, glissement vertical des courts, lecture vidéo des courts, pause de prière version enfant, arabe). Le temps du jour continue de compter pendant la pause de prière. Reste : 9c (espace parent dans l'application).

## Étape 22b-9c — Espace Kids natif : espace parents (22/10, application 0.11.0)

**Description.** Tout ce que le parent faisait sur le site se fait maintenant dans l'application (Kids → « Espace parents : gérer les profils »), avec son compte normal (jamais avec le jeton enfant ; l'écran renvoie à l'accueil enfant si un enfant est dans l'espace) :
- **Rapport** de progression (7 ou 30 jours) : temps, vidéos terminées, quiz, moyenne, étoiles gagnées, graphique par jour, badges, vidéos à reprendre, limite en place. Sans classement ni comparaison. Case « rapport par e-mail » et bouton « Envoyer maintenant ».
- **Par profil** : temps par jour (aucune limite, 15 à 180 min), catalogue (tout le catalogue de l'âge, ou sélection vidéo par vidéo, tout autoriser / tout bloquer ; changer de mode garde ce que l'enfant voit déjà), petites actions (proposer, valider, supprimer), modification du prénom / avatar / tranche d'âge, suppression.
- **Code parental** : changement avec l'ancien code (blocage de 10 min après 5 erreurs, règle du serveur).

**Prérequis.** Aucun changement API ni site. L'e-mail du rapport dépend de l'envoi d'e-mails déjà réglé sur le serveur.

**Déploiement.** Pousser sur `main` → APK/OTA 0.11.0 (pas de nouveau module natif). Aucun redéploiement DockPanel.

**Essai sur téléphone.** Kids → « Espace parents » → ouvrir un profil → Temps : choisir 15 min → entrer dans le profil, le temps restant s'affiche. Catalogue : passer en sélection, bloquer une vidéo → l'enfant ne la voit plus. Actions : proposer, l'enfant touche « Je l'ai fait », valider ici. Code : changer, puis vérifier la sortie de l'espace enfant avec le nouveau code.

**Debug.** Liste vide dans « Catalogue » : aucune vidéo Kids prête pour cette tranche d'âge. Changement de code refusé : ancien code faux (ou blocage 10 min). « Envoyer maintenant » en erreur : aucun profil, ou e-mail du serveur non réglé.

**Tests.** `cd mobile && npm run check` (types + 117 tests). Contrat réel (`tests/kids_contract.ts`, voir 22b-9a) : ajouts rapport, limite (valeurs refusées hors 5–480), mode catalogue + blocage visible côté enfant, modification de profil, changement de code (mauvais ancien code refusé) puis sortie avec le nouveau code.

**Honnêteté.** Testé : types, tests unitaires, contrat avec la vraie API, bundle Android. **Non testé** : l'affichage sur un vrai téléphone (graphique, listes longues du catalogue, clavier sur les champs de code, arabe) et l'envoi réel de l'e-mail du rapport. Avec 9c, l'espace Kids natif est complet ; restent 22c (Android TV) et 22d (Apple TV).


## Étape 23a — Dailymotion comme source vidéo (26/10, API + site + transcripteur + application 0.12.0)

**Description.** On peut ajouter des conférences **Dailymotion** comme YouTube et Vimeo : coller `dailymotion.com/video/…`, `dai.ly/…` ou un lien d'intégration dans Studio → Nouvelle conférence, dans les blocs vidéo des pages, ou dans « Importer chez nous » (copie sur notre stockage). La vidéo se lit depuis Dailymotion. Les sous-titres, la transcription (avec l'accord de l'auteur), les chapitres et la recherche fonctionnent comme pour YouTube.
- **Avec un Player ID** (Admin → Paramètres → « Vidéos YouTube, Vimeo et Dailymotion » → *Player ID Dailymotion*) : lecteur piloté par le site et l'application → transcription cliquable, reprise de lecture, pause de prière, aperçu limité des conférences premium, sous-titres traduits superposés.
- **Sans Player ID** : simple cadre Dailymotion (pas de reprise ni de pause de prière) ; une conférence premium à aperçu limité n'est alors pas lisible ; dans l'application, la vidéo s'ouvre sur le site.
- Le Player ID s'obtient dans Dailymotion → Partner HQ → Players (« Créer un lecteur » puis copier l'identifiant, ex. `x1a2b`). Seuls les caractères A-Z, a-z, 0-9 (3 à 20) sont acceptés.

**Prérequis.** Migration `063_dailymotion.sql` (appliquée au démarrage de l'API). Redéployer **api**, **web** et **transcriber** ; l'application passe en 0.12.0 (pas de nouveau module natif).

**Déploiement (DockPanel).** Git Deploy → Redeploy `majlistv-api`, puis `majlistv-web`, puis `majlistv-transcriber`. Puis sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
**Essai.** Studio → Nouvelle conférence → coller une vidéo Dailymotion publique → la miniature et le titre s'affichent, publier, ouvrir la fiche : la vidéo se lit. Avec un Player ID : lancer la lecture, quitter, revenir → reprise ; cliquer dans la transcription → saut.

**Debug.** « Adresse YouTube, Vimeo ou Dailymotion attendue » : lien non reconnu (essayer `https://www.dailymotion.com/video/x…`). Lecteur noir avec Player ID : Player ID faux ou domaine non autorisé dans Partner HQ (ajouter `majlisstv.le-publicitaire.fr`). Vidéo « indisponible » : vidéo privée ou intégration interdite par son auteur. Importer chez nous échoue : Dailymotion bloque parfois l'IP du serveur (comme YouTube) ; le réglage de cookies existant s'applique.

**Tests.** `python3 api/tests/test_dailymotion.py` (contre l'API de test), `python3 transcriber/tests/test_external.py`, `cd mobile && npm run check` (types + 120 tests), `cd web && npx next build`.

**Honnêteté.** Testé : lecture des adresses (toutes formes), enregistrement et refus côté API, migration, transcripteur (identifiants, adresse), page générée pour l'application, types, compilation du site. **Non testé** : lecture réelle d'une vidéo Dailymotion (pas d'accès réseau à Dailymotion dans l'environnement de développement), le lecteur piloté avec un vrai Player ID, l'import chez nous d'une vidéo Dailymotion, l'application sur un téléphone, l'arabe (RTL).


## Étape 23b — Veille des chaînes YouTube / Dailymotion / Vimeo (26/10, API + site + transcripteur)

**Description.** Admin → **Veille** (entrée du menu, avec une pastille « (n) » quand il y a des vidéos à traiter). L'administrateur colle l'adresse d'une chaîne, d'un compte, d'une playlist ou d'un album YouTube, Dailymotion ou Vimeo. Toutes les **6 heures** (réglable), le transcripteur relit chaque source avec yt-dlp (sans rien télécharger) et range les nouvelles vidéos dans la liste « À traiter », **visible de l'administrateur seul** (aucun e-mail, aucune notification ailleurs).
- **Première lecture = référence** : les vidéos déjà publiées sont notées « déjà vues » et ne déclenchent aucune alerte ; seules les suivantes sont signalées.
- Pour chaque nouvelle vidéo : **Voir** (ouvre la plateforme), **Ajouter…** (formulaire : intervenant, catégorie, accès gratuit/premium, langue, **case « J'ai l'accord de l'auteur »** ; sans elle la vidéo est ajoutée sans transcription ni traduction), **Ignorer** (récupérable via « Ignorées » → « Remettre à traiter »). « Tout ignorer » vide la liste d'un coup.
- Par source : **Vérifier maintenant** (pris dans la minute), **Pause / Reprendre**, **Supprimer**, dernier contrôle, nombre de vidéos lues, dernière erreur lisible (ex. « YouTube bloque l'accès depuis le serveur »).
- Une vidéo déjà au catalogue n'est jamais signalée ; si elle y est ajoutée entre-temps, « Ajouter » la rattache sans doublon.
- Fonction activable : Admin → Fonctions → « Veille des chaînes » (coupée : menu et routes fermés). Réglages : Admin → Paramètres → « Vidéos YouTube, Vimeo et Dailymotion » → *intervalle (heures)* et *nombre de vidéos récentes lues par contrôle* (30).

**Prérequis.** Migration `064_watch.sql` (tables `watch_sources`, `watch_items`, appliquée au démarrage de l'API). Redéployer **api**, **web** et **transcriber** (c'est lui qui fait les contrôles). Les cookies / proxy YouTube déjà réglés dans Admin → Paramètres servent aussi à la veille.

**Déploiement (DockPanel).** Git Deploy → Redeploy `majlistv-api`, puis `majlistv-web`, puis `majlistv-transcriber`. Puis sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
**Essai.** Admin → Veille → coller l'adresse d'une chaîne → « Suivre » → attendre 1 à 2 minutes → la ligne affiche « OK · n vidéo(s) lues » (aucune alerte : c'est la référence). Publier une vidéo sur cette chaîne (ou, pour tester, supprimer la source puis la rajouter après une publication), cliquer « Vérifier maintenant » → la vidéo apparaît dans « À traiter » et la pastille du menu s'allume. Voir les contrôles côté serveur : `docker logs --tail 50 dockpanel-git-majlistv-transcriber | grep veille`.

**Debug.** État « Erreur : YouTube bloque l'accès… » : ajouter des cookies ou un proxy (Admin → Paramètres → Vidéos YouTube, Vimeo et Dailymotion), puis « Vérifier maintenant ». Rien ne se passe après « Suivre » : transcripteur non redéployé ou arrêté (voir les journaux ci-dessus). Chaîne qui publie beaucoup : augmenter « nombre de vidéos récentes lues ». Une source en erreur n'est relue qu'à l'intervalle suivant (ou à « Vérifier maintenant »). La pastille se met à jour toutes les 2 minutes, la page toutes les minutes.

**Tests.** `python3 transcriber/tests/test_watch.py` (logique : référence, nouveautés, doublons, intervalle borné) ; `python3 api/tests/test_watch.py` (contre l'API de test : droits, ajout / doublon / mauvaise adresse, ignorer / remettre, ajout avec et sans attestation, déjà au catalogue, pause, suppression, journal d'audit, fonction coupée) ; `cd web && npx next build`. Page vérifiée dans un navigateur de test (ordinateur et 390 px, sans débordement, flux Ajouter / Ignorer / Suivre).

**Honnêteté.** Testé : API et base, logique de détection, requêtes SQL du contrôle jouées sur la base de test, interface. **Non testé** : la lecture réelle d'une chaîne par le transcripteur (pas d'accès à YouTube / Dailymotion / Vimeo en développement) — notamment la forme des adresses de comptes Dailymotion et Vimeo avec yt-dlp, et le risque que YouTube bloque l'IP du serveur ; l'arabe (l'écran de la Veille est en français, comme le reste de l'admin).

## Correctif 23c — Menu en tiroir latéral sur téléphone (Administration et Studio) (26/10, site)

**Description.** Sur écran étroit (900 px et moins), le menu de l'Administration et du Studio n'est plus une barre qui défile en haut : une barre fine affiche un bouton ☰ ; il ouvre le menu complet en **tiroir latéral** (groupes, pied avec site, langue, compte) avec fond assombri. Il se ferme en touchant une entrée, le fond, ou avec la touche Échap. En arabe (RTL) le tiroir s'ouvre à droite. Sur ordinateur, rien ne change.

**Prérequis / déploiement.** Site seulement : DockPanel → Git Deploy → Redeploy `majlistv-web`, puis les commandes VPS habituelles (`/root/apply-limits.sh`, `grep -n proxy_pass …`, `nginx -t && systemctl reload nginx`, `bash /root/verify-deploy.sh`).

**Essai.** Téléphone : Admin ou Studio → ☰ → choisir une entrée (le tiroir se ferme).

**Debug.** Bouton absent sur ordinateur : normal (menu latéral fixe). Menu qui ne s'ouvre pas : vider le cache / recharger la page après le redéploiement.

**Tests.** Navigateur de test à 390 px : barre, ouverture, fermeture (bouton, Échap, lien), bureau inchangé. `cd web && npx next build`.

**Honnêteté.** Non testé sur un vrai téléphone ni en arabe (RTL) ; le tiroir y est écrit en miroir mais non relu visuellement.


## Étape 24a — Nouvelle page de lecture dans l'application (26/10, application 0.13.0)

**Description.** La fiche d'une conférence (maquette « Lecture B — étude », validée) :
- **Lecteur épinglé en haut**, avec le chapitre en cours affiché dessus ; plein écran pour les vidéos lues par l'appli (les commandes d'origine reviennent alors).
- **Une seule barre de commandes** sous le lecteur : progression (toucher pour aller à un endroit), temps, −10 s, chapitre précédent / suivant, lecture-pause, vitesse. Elle sert aussi aux vidéos YouTube / Vimeo / Dailymotion, dont les commandes d'origine sont masquées (fini le doublon). Toucher la vidéo native = lecture / pause.
- **Titre compact** (série / catégorie, titre, intervenant + « Suivre », durée, niveau), bouton **Favori** et bouton **⋯** qui ouvre « Actions » : Ma liste, Partager, Mode audio, Incrustation, Diffusion TV, Télécharger.
- **Onglets** : Chapitres ouverts par défaut s'il y en a (sinon Résumé), puis Texte, Notes, À propos ; chapitre en cours surligné.
- **Barre du bas** fixe : « Quiz : retenir » (si un quiz existe) et « Prendre une note » (ouvre l'onglet Notes).
- Le reste (carte Apprendre, série, « Dans la même veine ») défile sous les onglets au lieu d'occuper l'écran en bas.

**Prérequis / déploiement.** Application seulement (aucun changement API ni site, pas de nouveau module natif) : poussé sur `main` → APK / mise à jour automatique 0.13.0. Aucun redéploiement DockPanel.

**Essai sur téléphone.** Ouvrir une conférence envoyée (vidéo native) puis une conférence YouTube : une seule barre de commandes ; toucher la barre de progression ; chapitre suivant ; vitesse ; « ⋯ » → Mode audio ; plein écran ; « Prendre une note » → l'onglet Notes s'ouvre.

**Debug.** Commandes YouTube encore visibles : vidéo dont l'auteur impose son lecteur (rare) ou application pas à jour. Vimeo : le masquage des commandes ne fonctionne que pour les comptes Vimeo qui l'autorisent. Dailymotion : commandes d'origine non masquables (à vérifier avec un vrai Player ID). Plein écran absent : normal pour YouTube / Vimeo / Dailymotion (lecteur de la plateforme).

**Tests.** `cd mobile && npm run check` (types + 120 tests, dont chapitres précédent / suivant et appui sur la barre) ; bundle Android `npx expo export --platform android`.

**Honnêteté.** Testé : types, tests unitaires, compilation du bundle. **Non testé** : l'affichage sur un vrai téléphone (placement des boutons, barre du bas, feuille « Actions », arabe RTL), la lecture réelle, le plein écran, Chromecast depuis la feuille « Actions », les commandes masquées de YouTube / Vimeo. La barre de progression ne se glisse pas au doigt : on touche l'endroit voulu.

## Étape 24b — Shorts dans l'application (26/10, application 0.14.0)

**Description.** Les Shorts ne font plus sortir de l'appli vers le site. Menu → « Shorts » ouvre un fil vertical plein écran (maquette validée) :
- **On glisse vers le haut** pour le short suivant (une page = un short, lecture automatique, en boucle). Les suivants se chargent au fur et à mesure (12 par 12).
- Un seul lecteur actif à la fois ; **toucher** l'écran = pause / lecture ; bouton **son** en haut à droite (le choix reste d'un short à l'autre).
- Colonne à droite : **Favori**, **Liste** (Ma liste), **Partager** ; non connecté → page d'inscription.
- En bas : nom de la chaîne (ouvre l'intervenant), titre, bouton **« Voir la conférence complète »** (ouvre la fiche dans l'appli ; la vidéo du short se met en pause) et fine barre de progression.
- Une vue est comptée par personne, par short et par jour (route existante `POST /shorts/:id/view`). La pause de prière coupe la lecture comme ailleurs.
- Le fil respecte déjà l'espace adulte / enfants côté serveur ; Kids garde son propre écran.

**Prérequis / déploiement.** Application seulement : aucun changement API, site ni base ; aucun redéploiement DockPanel, aucune commande VPS. Poussé sur `main` → mise à jour automatique 0.14.0. La fonction « Shorts » doit être activée (Admin → Fonctions) pour que l'entrée apparaisse dans le menu, et il faut des shorts publiés.

**Essai sur téléphone.** Menu → Shorts : le premier démarre ; glisser vers le haut ×3 ; toucher pour pause ; couper le son ; Favori puis Liste ; Partager ; « Voir la conférence complète » puis retour ; flèche retour.

**Debug.** Écran noir avec le seul titre : le lien de la vidéo n'a pas pu être lu (stockage) — vérifier `https://s3-majlisstv.le-publicitaire.fr`. « Aucun short » : aucun short publié ou fonction coupée. Logs : `docker logs dockpanel-git-majlistv-api --tail 100`.

**Tests.** `cd mobile && npm run check` (types + 124 tests, dont liste lisible, pages sans doublon, reste-t-il des shorts, progression) ; bundle `npx expo export --platform android`.

**Honnêteté.** Testé : types, tests unitaires, compilation du bundle. **Non testé** : le défilement et la lecture sur un vrai téléphone (fluidité, hauteur de page avec barres système, son, pause au retour de la fiche, arabe RTL).

## Étape 24c — Publicité plein écran au lancement (26/10, API + site + application 0.15.0)

**Description.** Une publicité (photo ou courte vidéo, maquette « Pub » validée) s'affiche en **plein écran à chaque lancement** de l'application : mention « Publicité », bouton « Passer dans N s » puis « Passer », annonceur, titre, phrase, bouton d'action (« En savoir plus » par défaut, modifiable) qui ouvre le lien de l'annonceur.
- **Plusieurs publicités** : toutes celles qui sont « en cours » tournent, une différente à chaque lancement (la suivante dans l'ordre de création, puis retour à la première). Le réglage « Nombre de publicités à la suite » (1 à 3) permet d'en montrer plusieurs l'une après l'autre au même lancement.
- **Dates et heures** : chaque publicité peut avoir un début et une fin (date + heure) ; sans date, elle est montrée tout de suite et jusqu'à ce qu'on la mette en pause. Situations : En cours, Programmée, Terminée, En pause.
- **Abonnés payants** (essai compris) : réglage Admin → Paramètres → « Publicité au lancement » → « masquer » (par défaut) ou « afficher ».
- **Prière** : pas de publicité pendant l'heure de prière (même fenêtre que la pause de prière, si la fonction Prière est active chez la personne). **Espace Kids** : jamais de publicité.
- **Photo** : durée réglable (6 s par défaut). **Vidéo** : jusqu'à la fin (bouton son disponible). « Passer » apparaît après 5 s (réglable, 0 à 15).
- Si le serveur est lent (plus de 6 s après le lancement), hors ligne ou en erreur : **aucune publicité**, l'application démarre normalement.
- **Statistiques** par publicité : affichages, clics (taux), « passer », et les 7 derniers jours (Admin → Publicités). Aucune donnée personnelle.

**Où on règle quoi.**
- Admin → **Publicités** : créer / modifier / mettre en pause / supprimer, envoi du visuel (photo png, jpeg, webp 8 Mo max ; vidéo mp4, webm 40 Mo max ; format vertical 9:16, 1080 × 1920, conseillé), dates, compteurs.
- Admin → **Paramètres** → « Publicité au lancement » : abonnés payants, nombre à la suite, durée de « Passer », durée d'une photo.
- Admin → **Fonctions** → « Publicité au lancement de l'application » : interrupteur général (coupé : l'API répond 404 et l'appli n'affiche rien).

**Prérequis / déploiement.** Migration `065_ads.sql` (tables `ads`, `ad_stats`, appliquée au démarrage de l'API). Redéployer dans l'ordre (DockPanel → Git Deploy → Redeploy) : **majlistv-api**, puis **majlistv-web**. Pas de worker, transcripteur, traducteur ni doublage. Application : poussée sur `main` → mise à jour 0.15.0 (nouveau module natif : aucun). Puis sur le VPS :
```
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
L'envoi du visuel va directement vers le stockage (`https://s3-majlisstv.le-publicitaire.fr`, comme les logos de l'éditeur) : aucune limite supplémentaire côté nginx de l'API.

**Essai pas à pas.**
1. Admin → Publicités → « Nouvelle publicité » : photo verticale, annonceur, titre, phrase, lien `https://…`, Créer.
2. Fermer complètement l'application puis la rouvrir : la publicité apparaît ; « Passer dans 5 s » puis « Passer » ; le bouton d'action ouvre le lien.
3. Créer une 2e publicité (vidéo) : au lancement suivant, c'est elle qui apparaît (rotation).
4. Compte abonné payant : aucune publicité (tant que le réglage est « masquer »). Espace Kids : jamais.
5. Admin → Publicités : compteurs mis à jour.

**Debug.** Rien ne s'affiche : fonction coupée (Admin → Fonctions), publicité en pause / programmée / terminée (voir sa situation), compte abonné payant, application déjà ouverte depuis un moment (la publicité n'est proposée qu'au lancement), réseau lent. Visuel qui ne s'envoie pas : format ou taille refusés (message affiché), ou stockage non configuré (bandeau rouge dans Admin → Publicités). Logs : `docker logs dockpanel-git-majlistv-api --tail 100`.

**Tests.** `python3 api/tests/test_ads.py` (API de test : droits, formats, liens, dates, rotation, pause, abonnés payants, compteurs, fonction coupée, suppression), `node api/tests/test_ads_lib.mjs`, `cd mobile && npm run check` (types + 129 tests), `npx expo export --platform android`, `next build` du site.

**Honnêteté.** Testé : API (ci-dessus), règles pures, types, compilation de l'appli et du site. **Non testé** : l'affichage sur un vrai téléphone (plein écran, vidéo, son, bouton retour Android, arabe RTL), l'écran d'administration vu dans un navigateur (compilé seulement), le cas « enfant » côté API (jeton enfant → liste vide : écrit mais non joué), l'heure de prière en situation réelle. Les textes de l'écran Admin → Publicités sont en français seulement.

## Étape 25 — Widgets Android : Prière, Réviser, Citation du jour (26/10, application 0.16.0)

**Description.** Trois widgets pour l'écran d'accueil du téléphone, chacun en **petit (2 × 2)** et **grand (4 × 2)**, noir et or, textes en blanc pur, coins arrondis, redimensionnables. Un appui ouvre l'application au bon endroit.
- **Prière** : petit = prochaine prière + heure + lieu ; grand = les cinq horaires du jour, la prochaine en or, les passées atténuées. Horaires **calculés sur le téléphone** (mêmes réglages que l'écran Prière : lieu, méthode) : fonctionne sans réseau. Appui → écran Prière. Si la prière n'est pas activée : message « Activez la prière dans Mejliss TV ».
- **Réviser** : petit = nombre de conférences à réviser aujourd'hui ; grand = nombre + 2 titres + ce qui arrive cette semaine + bouton « Réviser ». Appui → onglet Apprendre. Réservé à l'offre **Apprentissage** (comme l'écran « À réviser aujourd'hui ») : sinon le widget l'indique ; non connecté : « Connectez-vous pour réviser ». Sans réseau : dernier état connu.
- **Citation du jour** : petit = court extrait + référence ; grand = texte arabe + traduction + référence. Même citation que l'accueil de l'application.
- Langue : français, anglais ou arabe selon la langue de l'application. Les noms dans la liste des widgets d'Android restent en français.

**Comment ça marche.** Bibliothèque `react-native-android-widget` (0.24.0). Les widgets sont dessinés par une tâche de fond de l'application (`mobile/index.js` → `src/widgets/`). L'application leur laisse les réglages de prière et les redessine à chaque retour au premier plan, changement de réglage, de langue ou de compte. Android les rafraîchit aussi seul **environ toutes les 30 minutes** (minimum imposé par Android).

**Prérequis / déploiement.** Application seulement : **aucun changement API, site ni base, aucun redéploiement DockPanel, aucune commande VPS.** Ce lot ajoute du code natif (la bibliothèque des widgets) : la version d'exécution change, donc les téléphones **doivent installer le nouvel APK** (l'écran « Nouvelle version disponible » de l'application le propose, ou télécharger l'APK de GitHub Actions) ; la mise à jour de contenu seule ne suffit pas. Poussé sur `main` → GitHub Actions « Application Android (APK) » fabrique l'APK 0.16.0.

**Poser un widget.** Appui long sur le fond de l'écran d'accueil → Widgets → **Mejliss TV** → choisir « Prière (petit) », « Réviser (grand) », etc. → le glisser sur l'écran. Il se remplit tout de suite.

**Essai pas à pas.**
1. Installer l'APK 0.16.0, ouvrir l'application une fois (connexion, écran Prière avec un lieu, langue).
2. Poser « Prière (grand) » : cinq horaires ; la prochaine en or. Poser « Prière (petit) ».
3. Poser « Citation (grand) » et « Citation (petit) » : la citation du jour de l'accueil.
4. Poser « Réviser (petit / grand) » avec un compte Apprentissage : nombre de conférences à réviser ; avec un compte gratuit : « Offre Apprentissage requise » ; déconnecté : « Connectez-vous pour réviser ».
5. Appuyer sur chaque widget : l'application s'ouvre sur Prière / Apprendre / accueil.
6. Mode avion : les widgets Prière et Citation gardent leur affichage ; Réviser montre le dernier état.

**Debug.** Widget vide ou « Impossible de charger le widget » : ouvrir l'application une fois, puis retirer et reposer le widget. Heure de la prochaine prière en retard (par ex. Asr encore affiché après son heure) : normal jusqu'au prochain rafraîchissement d'Android (≈ 30 min, plus long en économie d'énergie) — ouvrir l'application le redessine aussitôt. Réviser reste sur « Connectez-vous » : se reconnecter dans l'application. Journaux d'un téléphone branché : `adb logcat | grep -i -E "RNWidget|ReactNativeJS"`. Compilation GitHub Actions : onglet Actions → « Application Android (APK) ».

**Tests.** `cd mobile && npm run check` (types + 138 tests, dont 9 pour les widgets : prochaine prière, horaires du jour, après Isha, arabe, états de Réviser, lecture sûre des réponses du serveur, extraits de citation, liens) ; `npx expo export --platform android` (bundle) ; `npx expo prebuild --platform android` (les six widgets sont bien déclarés : récepteurs, descriptions, tailles).

**Honnêteté.** Testé : logique des widgets, types, bundle JavaScript, génération du projet Android avec les six widgets. **Non testé** : la compilation du code natif (pas de SDK Android ici : le premier APK fabriqué par GitHub Actions en sera l'essai), l'affichage réel des widgets (tailles, coupures de texte, arabe, texte long de citation), le rafraîchissement automatique, l'appui qui ouvre l'application. Pas de compte à rebours « en direct » (Android ne le permet pas toutes les secondes). Pas d'image d'aperçu dans la liste des widgets d'Android. Widgets iPhone : plus tard (autre technique).

## Correctif 25b — Widgets vides et envoi du visuel d'une publicité (26/10)

**Widgets vides (application).** Cause : la bibliothèque des widgets ne sait pas dessiner les « fragments » React (`<>…</>`) que j'avais utilisés ; le dessin échouait et l'erreur était ignorée → widget vide (un appui ouvrait quand même l'application). Corrigé : plus aucun fragment ; **un widget de secours** (« Mejliss TV ») s'affiche si un dessin échoue, avec la trace dans les journaux (`adb logcat | grep MejlissWidget`). Nouveau test `tests/widgetsTree.test.ts` : les six widgets (tous leurs états) passent dans le vrai constructeur d'arbre de la bibliothèque ; il reproduit l'ancienne erreur (« jsxTree.type is not a function ») sur l'ancien code. **Même numéro de version (0.16.0)** : le correctif arrive par la mise à jour de contenu de l'application (fermer complètement l'application, la rouvrir deux fois), sans réinstaller ; puis retirer / reposer les widgets s'ils restent vides.

**Envoi du visuel d'une publicité (site).** Le formulaire restait sur « Envoi… » sans rien dire. Désormais : pourcentage d'envoi + barre de progression, taille vérifiée avant l'envoi, délai maximal de 15 minutes, et **message précis** si le stockage répond une erreur (réseau / CORS / CSP, accès refusé, trop gros). Le bouton ne reste plus jamais bloqué. Redéployer **majlistv-web** (DockPanel → Git Deploy → Redeploy), puis sur le VPS : `/root/apply-limits.sh`, `grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*`, `nginx -t && systemctl reload nginx`, `bash /root/verify-deploy.sh`.
**Cause réelle de l'envoi bloqué : non établie** (je n'ai pas accès à ton navigateur ni à ton stockage). Si le message affiché après redéploiement parle de réseau / CORS : vérifier que `CSP_STORAGE_ORIGINS` (site) contient `https://s3-majlisstv.le-publicitaire.fr` et que le stockage autorise l'origine du site ; si « trop gros » : réduire la vidéo (40 Mo max, photo 8 Mo max).

**Correctif 25c — cause probable de « Failed to fetch » (26/10).** Ton capture montre « Failed to fetch » pendant la création d'une publicité, alors que le stockage n'est jamais atteint. Cause probable : une **extension de blocage de publicités** du navigateur bloquait les adresses contenant `/ads/` (`/api/admin/ads/upload-url`, fichiers rangés sous `ads/…`). Corrigé : les adresses d'administration sont maintenant **`/api/admin/campaigns…`** et les visuels sont rangés sous **`campaigns/…`** (l'ancien dossier `ads/` reste accepté). Le message d'erreur du formulaire explique aussi ce cas (« extension du navigateur qui bloque la page »). Redéployer **majlistv-api**, puis **majlistv-web** (DockPanel → Git Deploy → Redeploy), puis sur le VPS : `/root/apply-limits.sh`, `grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*`, `nginx -t && systemctl reload nginx`, `bash /root/verify-deploy.sh`. Les routes publiques de l'application (`/ads/next`…) ne changent pas (l'application n'a pas de bloqueur). Si l'erreur persiste après cela : essayer en navigation privée (sans extensions) et me dire le message. **Non vérifié sur ton navigateur.**

## Étape 26 — Animation du logo au lancement (26/10, application 0.16.0, piste C « Cinéma »)

**Description.** À l'ouverture de l'application : écran de démarrage Android → **animation du logo (≈ 3 s)** → publicité éventuelle → application. L'animation : le contour doré « néon » du logo se trace de bas en haut, le logo se remplit et rayonne, le nom « Mejliss TV » et le slogan **« Des vidéos qui éclairent »** apparaissent, puis zoom à travers le logo et fondu vers l'application. Un **toucher** ou le **bouton Retour** passe l'animation. Elle n'est jouée **qu'une fois par lancement** et **jamais dans l'espace Kids**. Si le téléphone a « réduire les animations » activé, version fixe de 1,2 s.

**Limite honnête.** Tu n'as pas le logo en SVG : le contour est **calculé à partir de l'image du logo** (`assets/brand/intro-outline.png`, `intro-glow.png`) et « tracé » par deux rideaux de la couleur du fond. Le rendu est proche d'un vrai tracé mais ce n'est pas un tracé vectoriel ; avec le SVG, on pourrait faire mieux (module natif en plus).

**Slogan.** « Des vidéos qui éclairent » n'est utilisé **que dans l'animation** (clé `intro.tagline`, fr/en/ar). Le slogan global du site/de l'appli (« Des conférences qui éclairent ») n'est **pas modifié**. À confirmer par Epok.

**Prérequis.** Aucun : pas de nouvelle dépendance, pas de réglage, pas de changement API/site. Version identique (0.16.0) : arrive **par mise à jour automatique (OTA)** si l'APK 0.16.0 est déjà installé ; sinon installer le nouvel APK du workflow GitHub Actions.

**Déploiement.** Rien à redéployer sur le VPS. Sur le téléphone : **fermer complètement l'application puis la rouvrir deux fois** (la 1re ouverture télécharge la mise à jour, la 2e l'applique).

**Fichiers.** `mobile/src/components/LogoIntro.tsx` (animation), `src/lib/intro.ts` (calendrier), `src/lib/launch.ts` (relais : la publicité attend la fin de l'animation et y renonce si elle n'est pas prête 3 s après), `AdGate.tsx`, `_layout.tsx`, clés `intro.*` de `lib/i18n.ts`, `tests/intro.test.ts`.

**Tests / debug.**
```bash
cd mobile
npm run check        # tsc + 143 tests (dont calendrier de l'animation et relais publicité)
npx expo export --platform android --output-dir /tmp/exp
```
Debug : l'animation ne s'affiche pas → vérifier que ce n'est pas l'espace Kids, ou que le 2e lancement n'est pas une reprise d'arrière-plan (jouée seulement à froid). La publicité n'apparaît plus → attendue après l'animation ; voir étape 24c. **Jamais vu sur un vrai téléphone** (pas d'émulateur ici) : durées et rendu à valider par Epok.

**Correctif 26b — publicité absente de la liste Admin (26/10).** L'application affichait bien la publicité mais la liste d'Admin → Publicités restait vide. Cause probable : les **bloqueurs de publicités masquent les éléments dont la classe contient « ads- »** (`ads-list`, `ads-item`…). Toutes les classes de l'écran sont renommées `camp-*` (sans changement visuel). Redéployer **majlistv-web** seulement (DockPanel → Git Deploy → Redeploy), puis `/root/apply-limits.sh`, `grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*`, `nginx -t && systemctl reload nginx`, `bash /root/verify-deploy.sh`. Puis actualiser Admin → Publicités (Ctrl+F5). Si la liste reste vide : ouvrir la console du navigateur (F12 → Réseau), actualiser, et me dire le code de la ligne `campaigns`. **Non vérifié sur ton navigateur.**

**Réglage 26c — animation plus longue (26/10).** Durée passée de ≈ 3 s à **≈ 5,4 s** (toutes les étapes ralenties de ×1,8 ; le slogan reste lisible ≈ 1,2 s). Garde-fou porté à 8 s. Réglable en un seul endroit : `mobile/src/lib/intro.ts` (`PLAN`). Mise à jour OTA (version inchangée 0.16.0) : fermer complètement l'appli, la rouvrir deux fois.

## Étape 27a — Affichage complet (26/10, application 0.17.0)

**Constat** (capture d'Epok) : une bande grise claire apparaissait sous la barre d'onglets, à l'endroit des boutons de navigation d'Android. C'est le « voile de contraste forcé » que le système pose par-dessus le bas de l'application.

**Correctif.** Petit plugin `mobile/plugins/withFullScreen.js` (déclaré dans `app.json`) : désactive ce voile (`enforceNavigationBarContrast`, `enforceStatusBarContrast` = false) et impose des icônes claires aux barres d'état et de navigation. L'application occupe tout l'écran, la barre d'onglets noire descend jusqu'en bas.

**⚠ Code natif modifié → nouvel APK obligatoire** (version 0.17.0, versionCode 14) : la mise à jour automatique ne suffit pas. GitHub → Actions → dernier « Mobile Android » → télécharger l'APK et l'installer par-dessus l'ancien.

**Vérifié** : `npm run check` (143 tests), `expo prebuild` (styles.xml généré avec les 4 lignes). **Non vérifié sur téléphone** : surtout sur Samsung (One UI), qui peut garder un léger fond sous les boutons ; à me dire si la bande persiste. Avec la navigation par gestes, rien à voir de toute façon.

## Étape 27b — Nouveau design des widgets, « version B » (26/10, application 0.17.0)

**Description.** Les trois widgets (petit et grand) adoptent le design validé par Epok : fond **dégradé brun doré → noir** (vrai dégradé), bordure or fine, coins arrondis, **logo Mejliss TV** (emblème seul en petit, emblème + nom en grand), accents or.
- **Prière** : prochaine échéance en grand avec **l'heure en très grand** (or) ; en bas, les six moments de la journée : Fajr, **Shuruk**, Dhuhr, Asr, Maghrib, Isha (le Shuruk, qui n'est pas une prière, est en teinte atténuée ; la prochaine échéance est en or ; les passées sont atténuées). Si la prochaine échéance est le Shuruk, il est affiché en grand avec le libellé « Prochain : lever du soleil ». Ville et date en haut à droite. Petit format : « Shuruk 08:07 · ville » en bas.
- **Réviser** : gros chiffre or, « à réviser aujourd'hui », titres (1 ligne chacun), bouton plein « ▶ Réviser maintenant » (petit : « ▶ Réviser »). États « connectez-vous », « offre requise », « indisponible » : message + bouton « Ouvrir ».
- **Citation** : logo, texte arabe doré centré, traduction centrée en blanc, source « — Coran 68:48 » en or.
- FR / EN / AR : nouvelles clés `wd.sunrise`, `wd.nextSun`, `wd.reviseToday`, `wd.reviseNow`, `wd.reviseGo`.

**Fichiers.** `mobile/src/widgets/ui.tsx` (dessin), `model.ts` (Shuruk, date, textes), `images.ts` + `mobile/assets/widget/emblem.png` et `wordmark.png` (logo réduit, léger), tests `tests/widgets.test.ts` et `tests/widgetsTree.test.ts` (le vrai constructeur d'arbre de la bibliothèque dessine les widgets : Shuruk présent, logo présent, dégradé présent).

**Prérequis / déploiement.** Aucune dépendance ajoutée, rien à redéployer sur le VPS. Version 0.17.0 inchangée : arrive **par mise à jour automatique (OTA)** sur l'APK 0.17.0 (étape 27a). Fermer complètement l'appli puis la rouvrir deux fois ; les widgets se rafraîchissent alors (sinon : les retirer et les remettre, ou attendre ≈ 30 min).

**Debug.** Widget vide ou « Mejliss TV » seul : dessin de secours → me le dire (les erreurs sont journalisées sous `MejlissWidget`). Logo absent : vérifier que l'APK est bien le 0.17.0. Pas de Shuruk : le widget Prière affiche les horaires calculés par l'appli (méthode et lieu choisis dans Prière).

**Honnêteté.** Testé : typage, 144 tests, export Android, constructeur d'arbre réel de la bibliothèque. **Jamais vu sur un téléphone** : tailles de texte, coupures (titres longs, arabe), rendu du dégradé et du logo à valider par Epok ; il est possible que je doive ajuster les tailles après ta capture.

**Correctif 27c — bas des écrans sous les boutons de navigation (26/10).** Avec l'affichage complet (27a), les écrans ouverts par-dessus les onglets laissaient leur bas passer sous les boutons d'Android (capture : bouton « Fermer » de la page Réglages de la prière coupé). Corrigé : marge de bas d'écran (zone sûre) ajoutée sur Réglages prière, Page (gabarit commun), Recherche, Listes, Conférence hors ligne, Conférence (lecteur), et sur la feuille « Ajouter à une liste » ; le bas de la page Prière a aussi plus de marge. Les onglets, Kids, quiz, pratique, connexion, téléchargements l'avaient déjà. Mise à jour automatique (OTA) sur l'APK 0.17.0 : fermer/rouvrir l'appli deux fois. **Non vérifié sur téléphone** ; à me signaler : tout écran dont le bas reste coupé.

## Étape 28 — Admin → Paramètres : accueil par thèmes (27/10)

**Description.** Constat d'Epok : la page Paramètres de l'admin était une longue liste de sections (48 avec les modules) aux pastilles et sous-titres décalés. Nouvelle présentation (proposition A validée) :
- **Accueil des Paramètres** : barre de **recherche** (réglages par nom, aide ou section ; 2 lettres minimum) et **cartes par thème** — *Site et contenu* (Général, Page d'accueil, Vignettes, Citations, Ouvrages), *Argent* (Stripe, Cartes cadeaux, Rémunération des chaînes, Publicité au lancement), *Intelligence artificielle* (Traduction, Résumés, Transcription, Quiz, Mise en pratique), *Communauté et communication* (E-mails, Notifications, Modération, Kids), *Technique* (Recherche, Vidéos externes, Statistiques, Activité) et *Réglages des modules* (les 26 sections « mod_… », repliées par défaut).
- Chaque carte : icône, explication, **état** (Prêt / Non configuré / Clé manquante…, calculé comme avant) et « • » si la section contient des modifications non enregistrées.
- **Section ouverte** : fil d'Ariane « ← Paramètres / thème », pastilles des sections voisines, champs en blocs sur deux colonnes (une colonne sur téléphone), barre « Enregistrer / Annuler » toujours visible avec le nombre de modifications non enregistrées.
- Inchangé : tous les réglages et leurs valeurs, tests de clés, enregistrement, protection « modifications non enregistrées » (les brouillons sont gardés en changeant de section), API, adresses `?tab=settings&section=<id>` (sans `section` → accueil).

**Fichiers.** `web/components/SettingsHub.js` (thèmes, cartes, recherche, en-tête de section), `web/app/admin/page.js` (composant Settings), `web/app/globals.css` (`.set-*`). Aucun changement d'API. Une section nouvelle non listée tombe automatiquement dans « Autres » ; une section de module (`mod_…`) dans « Réglages des modules ».

**Déploiement (DockPanel).** Redeploy **majlistv-web** uniquement, puis sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
Puis Ctrl+F5 dans l'admin.

**Debug.** Page blanche ou ancien affichage : Ctrl+F5 (cache). Section manquante : elle dépend d'un module désactivé (Admin → Modules). Si des cartes disparaissent avec un bloqueur de pub : me le dire (classes `set-*`, sans « ads »).

**Testé** (navigateur réel Chromium sur un API de test) : accueil (6 thèmes, 48 cartes), recherche, ouverture d'une section, brouillon conservé en changeant de section avec confirmation, indicateur « • », retour à l'accueil, mobile 390 px sans défilement horizontal, aucune erreur JavaScript, build Next. **Non testé** : l'arabe (l'admin est en français), les vrais états de ton serveur (Stripe, e-mails, clés IA).

## Étape 29 — Santé du serveur et alerte disque (27/10)

**Description.** Nouvel écran **Admin → Santé du serveur** : disque, mémoire, charge du processeur (jauges avec niveau « Tout va bien / À surveiller / Critique »), courbe des 7 derniers jours, tendance (« plein dans environ N jours »), taille de la base de données et plus grosses tables, état des alertes. Le serveur mesure toutes les 10 minutes, garde 35 jours d'historique et **envoie un e-mail** quand le disque (80 % attention, 90 % critique) ou la mémoire (92 %) dépasse un seuil : une alerte au franchissement, un rappel toutes les 24 h (critique) ou 72 h (attention) tant que ça dure, un message « retour à la normale » ensuite. Pas d'e-mail quand on passe de critique à attention.

**Prérequis.** L'envoi d'e-mails doit être configuré (Admin → Paramètres → E-mails), sinon l'écran fonctionne mais aucune alerte ne part (l'écran le signale).

**Réglages** (Admin → Paramètres → Technique → *Santé du serveur*) : alertes oui/non, seuil disque attention (80), seuil disque critique (90), seuil mémoire critique (92), destinataires (vide = tous les administrateurs). Variable facultative `HEALTH_DISK_PATH` (défaut `/`) pour choisir le dossier dont on mesure le disque.

**Fichiers.** API : `api/migrations/066_health.sql` (tables `health_samples`, `health_alerts`), `api/src/healthLib.js` (calculs purs), `api/src/health.js` (mesures, alertes, rapport), `api/src/routes/health.js` (`GET /admin/health`, `POST /admin/health/check`, `POST /admin/health/test-alert`), modèle d'e-mail `health_alert` (fr/en/ar), réglages. Web : `web/components/HealthAdmin.js`, onglet `?tab=health`, entrée de menu « Santé du serveur ».

**Déploiement (DockPanel).** Redeploy **majlistv-api** (migration 066 au démarrage), puis **majlistv-web**. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
Puis Admin → Santé du serveur → **Mesurer maintenant** et **Tester l'alerte e-mail**.

**Exemples.** Pour voir une vraie alerte : Paramètres → Santé du serveur, mettre « seuil attention » à 10 (minimum) puis « Mesurer maintenant » : un e-mail arrive ; remettre 80 ensuite (un e-mail « retour à la normale » part).

**Debug.** « Envoi d'e-mails non configuré » : renseigner Paramètres → E-mails. Pas d'alerte reçue : regarder le dossier spam, `docker logs dockpanel-git-majlistv-api | grep -i health`, et la file : `docker exec -i dockpanel-app-postgres-majlisstv psql -U <utilisateur> -c "select to_email,status,last_error from email_outbox where kind='health_alert' order by id desc limit 5;"`. Tendance absente : il faut ~6 h de mesures.

**Limites (honnêtes).** Le disque mesuré est la partition qui porte Docker, vue depuis le conteneur de l'API : on s'attend au même chiffre que `df -h /` sur le VPS (à confirmer sur ton serveur). Mémoire et charge sont celles de tout le VPS (partagé avec Miel & Co et TriMaint). Les images Docker et le cache de construction ne sont pas visibles depuis le site (l'API n'a pas accès à Docker, volontairement) : l'écran affiche les commandes de nettoyage à lancer en SSH.

**Testé** : calculs (28 vérifications Node, `node api/tests/test_health_lib.mjs`), API (`python3 api/tests/test_health.py` : droits, rapport, mesure, alerte, absence de doublon, retour à la normale, alertes coupées, e-mail d'essai, purge), envoi réel vers un serveur SMTP factice, écran en navigateur réel (ordinateur et 390 px, sans défilement horizontal). **Non testé** : sur ton VPS, avec ton vrai SMTP ; arabe (écran admin en français).

## Étape 30 — Tests automatiques à chaque envoi sur GitHub (27/10)

**Description.** À chaque envoi sur `main` (et sur toute demande de fusion), GitHub lance trois contrôles indépendants, **sans rien déployer** (le déploiement reste DockPanel) : **API** (syntaxe de tout le code, 19 tests Node (dont ceux du moteur de rendu, avec FFmpeg) et 44 tests de l'API sur un PostgreSQL jetable), **Site** (tests Node du site + construction Next.js), **Application** (typage + tests, comme avant l'APK). Rouge = quelque chose est cassé : regarde avant de déployer. Aucun secret n'est utilisé.

**Premier bénéfice déjà obtenu.** En préparant ces tests, l'un d'eux a détecté une vraie dérive : `web/lib/blocks.js` n'avait pas le texte « Dailymotion » de `api/src/blocks.js` (les deux fichiers doivent être identiques). Corrigé dans cette étape (libellé du bloc « Vidéo » de l'éditeur de pages).

**Où voir le résultat.** GitHub → dépôt `LePubli/majlistv` → onglet **Actions** → « Tests automatiques » : coche verte ✅ ou croix rouge ❌ ; cliquer sur l'exécution puis sur le contrôle en échec montre les dernières lignes du test cassé. Lancement manuel : Actions → Tests automatiques → **Run workflow**. Tu reçois aussi un e-mail GitHub en cas d'échec.

**Fichiers.** `.github/workflows/tests.yml` (les trois contrôles), `ops/ci/run-api-tests.sh` (lance les tests et résume), `api/tests/ci-suite.txt` (liste des tests Python de l'API lancés : ajouter/retirer une ligne), `web/lib/blocks.js` (correction), `api/src/routes/auth.js` (variable facultative `AUTH_RATE_MAX`, réservée aux tests : sans elle, la limite reste 10 connexions/minute et 5 « mot de passe oublié »/10 min comme avant).

**Prérequis.** Aucun : tout tourne chez GitHub. Pas de déploiement DockPanel nécessaire pour la partie tests ; la correction du libellé `blocks.js` et `AUTH_RATE_MAX` partent avec le prochain Redeploy de **majlistv-api** puis **majlistv-web** (inchangé en production tant que la variable n'est pas définie).

**Lancer les tests chez toi (WSL, facultatif).** Avec un PostgreSQL de test (base, utilisateur `majlis`, mot de passe `pw`, port 5544) et l'API de test démarrée sur 3055 avec `RATE_LIMIT_MAX=100000 AUTH_RATE_MAX=100000 REPORT_RATE_MAX=100000` (variables complètes : voir `.github/workflows/tests.yml`, étape « Démarrer l'API de test »), puis :
```bash
pip install requests psycopg2-binary
bash ops/ci/run-api-tests.sh
```

**Ajouter un test.** Écrire `api/tests/test_xxx.py` (même modèle que les autres) puis ajouter `test_xxx.py` dans `api/tests/ci-suite.txt`. Les tests Node `api/tests/*.mjs` sont lancés automatiquement.

**Debug.** Un contrôle rouge : ouvrir l'exécution → le contrôle → « Lancer les tests » (résumé et dernières lignes de chaque échec) ; « Journal de l'API » s'affiche en cas d'échec. Un test qui échoue seulement chez GitHub : le relancer (Re-run jobs) ; s'il échoue encore, le copier ici avec son message.

**Pas encore couvert (limites).** Tests de l'API qui exigent le stockage S3 (moto), l'IA, le transcripteur ou Stripe simulé (≈ 45 fichiers : éditeur de montage, import vidéo, cartes cadeaux, quiz/pratique générés, etc.) et `test_citations_auto.mjs` (corpus de citations), `test_jobs_activity.py` (transcripteur Python) : ils restent à lancer à la main pour l'instant ; les couvrir demande d'ajouter ces services de test au workflow (étape ultérieure possible). Pas de test de navigateur (Playwright) dans le contrôle automatique.

**Testé.** Le script a été lancé sur une base **vierge** : 62 réussis, 0 échec en local (18 tests Node, 44 tests API) ; le premier passage chez GitHub a révélé deux différences d'environnement (modules du worker non installés, test du transcripteur Python) corrigées ensuite (43 tests API dans la liste) ; construction du site avec une API injoignable (comme chez GitHub) : OK ; les 6 tests Node du site : OK ; syntaxe de l'API : OK. **Chez GitHub** : les trois contrôles sont verts (4e exécution, après correction des différences d'environnement trouvées aux trois premières). **Non vérifié** : le message e-mail d'échec de GitHub (dépend de tes réglages de notifications GitHub).

## Étape 31 — Double authentification (2FA) (27/10)

**Description.** Chaque membre (administrateurs compris) peut activer, **facultativement**, la double authentification dans **Mon compte → Sécurité** : en plus du mot de passe, un code à 6 chiffres de son application d'authentification (Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden…) est demandé à chaque connexion, **sur le site et dans l'application**. À l'activation : QR code (ou clé à saisir à la main), confirmation par un premier code, puis **10 codes de secours** affichés une seule fois (copier / télécharger). Aucun compte n'est obligé de l'activer (choix d'Epok).

**Protections.** Code conforme à la norme TOTP (RFC 6238, tolérance ± 30 s) ; un même code ne sert qu'une fois ; **5 erreurs de suite = compte verrouillé 15 minutes** ; l'étape « code » est un défi à part valable 5 minutes et 5 essais (jamais utilisable comme jeton) ; la clé secrète est chiffrée en base (SETTINGS_KEY), les codes de secours ne sont gardés que sous forme d'empreinte ; désactiver ou regénérer les codes demande le mot de passe **et** un code. Un « mot de passe oublié » ne désactive pas la 2FA.

**Compte perdu (téléphone et codes de secours perdus).** Admin → Utilisateurs → ouvrir le compte → Sécurité → **Réinitialiser la double authentification** (ferme aussi ses sessions ; action inscrite au journal d'audit). À faire seulement après avoir vérifié l'identité de la personne. La fiche et la liste indiquent si la 2FA est activée.

**Fichiers.** API : `api/migrations/067_two_factor.sql`, `api/src/totp.js` (calculs, sans dépendance), `api/src/twofactor.js` (base de données), `api/src/routes/twofactor.js`, `api/src/routes/auth.js` (la connexion renvoie `{ twoFactor: true, challenge }` au lieu d'un jeton quand la 2FA est active), `api/src/routes/admin.js` (indicateur). Routes : `POST /auth/2fa/verify`, `GET /me/2fa`, `POST /me/2fa/setup|enable|disable|recovery`, `POST /admin/users/:id/2fa/reset`. Site : `web/components/TwoFactor.js`, `QrCode.js` (QR en SVG, nouvelle dépendance `qrcode`), `AuthForm.js` (2e étape), onglet Sécurité de `web/app/account/page.js`, bouton dans la fiche utilisateur de l'admin, textes fr/en/ar. Application : `mobile/src/lib/twoFactor.ts`, `session.tsx`, `src/app/login.tsx` (écran du code), textes fr/en/ar, note de version.

**Prérequis.** `SETTINGS_KEY` définie sur l'API (déjà le cas : elle sert aux réglages chiffrés). Sans elle l'activation est refusée avec un message clair.

**Déploiement (DockPanel).** Redeploy **majlistv-api** (migration 067 au démarrage), puis **majlistv-web**. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
Application : le push sur `main` lance la fabrication de l'APK (GitHub → Actions → « Application Android (APK) »). Aucun changement natif (version d'exécution inchangée) : les applications déjà installées reçoivent l'écran du code par **mise à jour du contenu**, sans réinstaller ; fermer/rouvrir l'appli deux fois.

**Essai conseillé.** Mon compte → Sécurité → Activer, scanner le QR avec ton téléphone, confirmer, **noter les codes de secours**. Te déconnecter, te reconnecter : le code est demandé. Tester aussi dans l'application.

**Debug.** « Code incorrect » alors qu'il paraît bon : l'heure du téléphone doit être automatique (écart toléré 30 s) ; un code déjà utilisé est refusé, attendre le suivant. « Trop d'essais » : attendre 15 min ou réinitialiser depuis l'admin. Activation impossible (« SETTINGS_KEY manquante ») : voir Prérequis. Base : `select email, totp_enabled_at, totp_failures, totp_locked_until from users where totp_enabled_at is not null;`.

**Limites (honnêtes).** Une **ancienne version de l'application** (avant la mise à jour du contenu) ne sait pas afficher l'écran du code : un compte avec 2FA y verrait une erreur à la connexion tant que l'application n'est pas mise à jour. L'activation se fait sur le site (pas dans l'application). Pas de 2FA obligatoire pour l'administration (peut être ajoutée sur demande). Les codes par SMS ou e-mail ne sont pas proposés (application d'authentification seulement).

**Testé.** Calculs : 22 vérifications dont les vecteurs officiels de la RFC 6238 (`node api/tests/test_totp_lib.mjs`). API : 47 vérifications (`python3 api/tests/test_two_factor.py` : activation, connexion en deux temps, rejeu refusé, code de secours à usage unique, défi expiré/épuisé, verrou, nouveaux codes, désactivation, réinitialisation par l'admin + journal). Site en navigateur réel (ordinateur et 390 px) : activation, QR code **relu avec un décodeur** (adresse `otpauth` exacte), codes de secours, connexion en deux temps, code faux/réutilisé refusés, désactivation. Application : typage et 5 tests de lecture des réponses du serveur (149 tests au total). **Non testé** : avec une vraie application d'authentification sur téléphone, et l'écran du code sur un vrai appareil Android.

## Étape 32 — Partager en image : citation du jour et phrases d'une conférence (27/10)

**Description.** Nouveau bouton **« Partager en image »** sous la **citation du jour** (accueil) et, dans l'onglet **Transcription** d'une conférence, un petit bouton **« ↗ Image »** à côté de chaque phrase. Il ouvre une fenêtre avec l'aperçu d'une carte noir et or aux couleurs Mejliss TV (logo, texte en blanc, référence en or, adresse du site), en **3 formats** : **Carré** 1080×1080 (WhatsApp, Instagram, X), **Story** 1080×1920 (Instagram, WhatsApp statut, TikTok), **Paysage** 1200×630 (Facebook, LinkedIn). Trois boutons : **Partager** (feuille de partage du téléphone avec l'image ; sur ordinateur, téléchargement), **Télécharger l'image**, **Copier le lien**. Le lien d'une phrase de conférence ouvre la conférence **à cet instant** (`?t=`), celui de la citation ouvre l'accueil.

**Détails.** Les cartes sont dessinées **dans le navigateur** (canvas) avec les polices du site : l'arabe est correctement assemblé (lettres liées, sens de lecture, voyelles), le texte arabe de la citation est au-dessus de la traduction, la taille du texte s'ajuste à la longueur (un texte très long est raccourci avec « … »). Une phrase de transcription en arabe donne une carte en arabe. Fonctionne en français, anglais et arabe (libellés). Aucune donnée n'est envoyée au serveur : rien à déployer côté API, pas de migration. Les conférences réservées aux abonnés n'exposent pas de transcription : pas de bouton.

**Fichiers.** `web/lib/shareCard.js` (calculs : sens de lecture, retour à la ligne, ajustement de la taille, noms de fichiers ; dessin), `web/components/ShareCardModal.js` (fenêtre), `web/components/CitationCard.js` (bouton), `web/components/Transcript.js` et `web/app/talks/[id]/TalkClient.js` (bouton par phrase), `web/app/globals.css` (`.shc-*`, `.seg-row`), textes fr/en/ar dans `web/lib/i18n.js`, test `web/tests/share_card.mjs`.

**Déploiement (DockPanel).** Redeploy **majlistv-web** uniquement (l'API ne change pas). Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
Puis Ctrl+F5.

**Exemples.** Accueil → sous la citation du jour → « Partager en image » → Story → Partager → Instagram. Conférence → onglet Transcription → survoler une phrase → « ↗ Image » → Carré → Télécharger l'image.

**Debug.** L'aperçu reste vide ou le texte arabe est dans une police par défaut : recharger (Ctrl+F5), les polices du site se chargent à la première utilisation. « Partager » télécharge au lieu d'ouvrir la feuille de partage : le navigateur (ordinateur, Firefox) ne permet pas le partage de fichiers, c'est normal. Pas de bouton sous une phrase : la conférence n'est pas accessible en transcription (réservée ou en cours de transcription).

**Limites (honnêtes).** Application mobile : non incluse (le site, ouvert dans le navigateur du téléphone, donne déjà la feuille de partage). Les aperçus de liens (WhatsApp, Facebook) restent ceux déjà en place (vignette de la conférence) ; une image de carte propre à chaque citation ou phrase, vue directement dans l'aperçu du lien, n'est pas faite (elle demanderait de dessiner l'image sur le serveur). Les pages de conférences référencées par Google (idée 1.1) n'ont pas été modifiées dans cette étape.

**Testé.** Calculs : 18 vérifications (`node web/tests/share_card.mjs`, lancé aussi par les tests automatiques). Navigateur réel (Chromium, ordinateur et 390 px, sans défilement horizontal) : bouton sous la citation, 3 formats aux bonnes tailles, téléchargement (fichier `….png`), copie du lien (`/talks/<id>?t=4` pour la 2e phrase), fermeture par Échap, bouton sur chaque phrase de transcription, carte d'une phrase en arabe ; rendu des images contrôlé à l'œil (arabe voyellé et assemblé, texte long ajusté). **Non testé** : la feuille de partage native d'un vrai téléphone (Android/iPhone) et l'envoi vers Instagram/WhatsApp.


## Étape 33 — E-mails automatiques de cycle de vie (27/10)

**Description.** Trois e-mails automatiques, chacun envoyé **au plus une fois par situation** : **Reprise** (« Reprenez là où vous vous êtes arrêté » : conférence commencée, au moins 2 minutes, non terminée, laissée de côté depuis 3 jours), **Par où commencer** (compte créé depuis 3 jours qui n'a encore rien regardé : trois conférences à découvrir, gratuites d'abord), **Retour** (abonnement terminé depuis 14 jours et plus aucun accès : les nouveautés depuis le départ). Les e-mails de fin d'essai, de paiement refusé et de résiliation existent déjà (étape 4) et ne sont pas modifiés. Français, anglais, arabe (sens de lecture droite-gauche).

**Couvertures (ajout du 27/10).** Dans ces trois e-mails, ainsi que dans « Nouveautés des intervenants suivis » et « Sélection de la semaine », chaque conférence s'affiche en **carte avec son image de couverture** à côté du titre et de l'intervenant (cliquable vers la conférence). L'image passe par l'adresse stable `/api/seo/poster/talks/<id>` (le lien de stockage expire, pas celle-ci) ; sans couverture, la carte n'a que le titre. Certains logiciels de messagerie masquent les images tant qu'on ne les autorise pas : le titre reste alors lisible. Redeploy majlistv-api seulement pour cet ajout.

**Tout est désactivé d'office.** Interrupteur général **Admin → E-mails de cycle de vie** (ou Paramètres → « E-mails de cycle de vie » → « Activer »). L'écran donne un **aperçu en direct** : combien d'e-mails partiraient maintenant, par situation, avec des adresses masquées en exemple, **sans rien envoyer**. Boutons : Activer / Désactiver, « Lancer un passage maintenant », et un exemple de chaque modèle envoyé à votre adresse.

**Garde-fous.** Préférence du membre (case « Recevoir des rappels utiles » dans Mon compte → Mes e-mails, cochée par défaut) ; lien de désinscription en un clic dans chaque e-mail (+ en-têtes List-Unsubscribe) ; **un seul e-mail de ce type par personne tous les 7 jours** (réglable) ; plage d'envoi 10 h – 19 h heure de Paris (réglable ; mêmes bornes = toute la journée) ; **plafond de 100 e-mails par jour** (réglable, à monter progressivement pour protéger la réputation du domaine d'envoi) ; journal `lifecycle_log` ; clé anti-doublon dans la file d'envoi ; si l'interrupteur est coupé après la mise en file, les e-mails en attente sont abandonnés ; comptes suspendus exclus ; la reprise n'est proposée que si la personne a accès à la conférence.

**Prérequis.** Envoi d'e-mails configuré (Admin → Paramètres → E-mails). Aucune nouvelle variable d'environnement.

**Fichiers.** API : `api/migrations/068_lifecycle.sql` (colonne `users.notify_lifecycle`, table `lifecycle_log`), `api/src/lifecycle.js` (sélection des personnes, envoi, aperçu), `api/src/lifecycleLib.js` (règles pures), `api/src/routes/lifecycle.js` (`GET /admin/lifecycle`, `POST /admin/lifecycle/run`, `POST /admin/lifecycle/test`), modèles `resume_talk` / `welcome_nudge` / `winback` dans `api/src/emails.js`, catégorie `lifecycle` dans `api/src/unsubscribe.js`, préférence dans `api/src/modules/follow/routes.js`, 11 réglages `lifecycle_*` dans `api/src/settings.js`. Site : `web/components/LifecycleAdmin.js` (écran admin), `EmailPrefs.js` (case), page `/unsubscribe/[token]`, clés i18n `nfLife`, `unLifecycle`, `admLifecycle`.

**Déploiement (DockPanel).** Redeploy **majlistv-api** d'abord (la migration 068 s'applique au démarrage), puis **majlistv-web**. Worker, transcripteur, traducteur, doublage : inchangés. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```
Puis Ctrl+F5 sur le site.

**Mise en route conseillée.** (1) Admin → E-mails de cycle de vie : lire l'aperçu. (2) Boutons « Reprise », « Par où commencer », « Retour » : recevoir un exemple et le relire. (3) Dans Paramètres → E-mails de cycle de vie, garder le plafond à 100 pour commencer. (4) Activer. Le premier passage a lieu dans les 15 minutes, dans la plage horaire.

**Exemples.** Un membre regarde 20 minutes d'une conférence puis ne revient pas : au bout de 3 jours il reçoit « Reprenez … là où vous vous êtes arrêté » (une seule fois pour cette conférence). Un compte créé lundi sans lecture reçoit jeudi « Par où commencer ». Un ancien abonné reçoit, 14 jours après la fin, les nouveautés. Une personne qui remplit deux situations le même jour ne reçoit qu'un e-mail.

**Debug.** Rien ne part : l'interrupteur est coupé, l'envoi d'e-mails n'est pas configuré, on est hors de la plage horaire, ou le plafond du jour est atteint (l'écran admin le dit). L'aperçu indique 0 : tout le monde a déjà reçu un e-mail il y a moins de 7 jours, ou a refusé. Vérifier la file : `docker exec -it dockpanel-app-postgres-majlisstv psql -U <utilisateur> -d <base> -c "select kind, status, to_email, created_at from email_outbox where kind in ('resume_talk','welcome_nudge','winback') order by id desc limit 20;"`. Journal : `select kind, count(*) from lifecycle_log group by 1;`. Journaux API : DockPanel → majlistv-api → Logs (« E-mails de cycle de vie mis en file »).

**Limites (honnêtes).** Pas de notification sur téléphone pour ces trois messages (e-mail seulement) ; pas de case dans l'application mobile (la préférence se règle sur le site ou par le lien de désinscription) ; les textes sont les miens, à relire (ton, promesses) avant d'activer ; aucun suivi d'ouvertures/clics ; la reprise ne tient pas compte des conférences vues seulement sur l'application Kids.

**Testé.** Règles pures : 28 vérifications (`node api/tests/test_lifecycle_lib.mjs`). API sur base réelle : `api/tests/test_lifecycle.py` (droits, désactivé par défaut, aperçu, les trois situations, cas exclus, un seul e-mail par personne, pas de doublon, plage horaire, plafond, préférence, désinscription en un clic, signature falsifiée, exemple) ; les deux sont lancés par les tests automatiques GitHub. Site compilé ; PAS testé : l'envoi réel vers une vraie boîte (Gmail/Outlook) ni le rendu dans les clients de messagerie.


## Étape 34 — Lettre hebdomadaire personnalisée (27/10)

**Description.** La « sélection de la semaine » (opt-in existant, étape 21) devient une **lettre personnelle**. Chaque membre qui l'a demandée (Mon compte → Mes e-mails → « Recevoir la sélection de la semaine ») reçoit, le jour et à l'heure réglés, un e-mail avec des **cartes à couverture** : **À reprendre** (sa conférence commencée la plus récente, 30 jours max), **Nouveau chez vos intervenants** (jusqu'à 3 conférences publiées depuis 7 jours par les intervenants qu'il suit), **Notions à réviser cette semaine : N** (révision espacée, si la fonction est active) et **Notre sélection** (celle de Admin : collection choisie, sinon nouveautés des 7 jours). Une section vide disparaît ; si la personne n'a **rien de personnel**, elle reçoit la sélection simple comme avant. FR / EN / AR.

**Réglages.** Admin → Paramètres → Notifications : nouvel interrupteur **« Lettre personnalisée »** (activé par défaut ; décoché = tout le monde reçoit la même sélection). Les réglages existants restent valables : activation de la sélection, jour, heure, collection, nombre de conférences. L'envoi reste limité aux membres qui ont coché la case et au plus une fois par semaine ; désinscription en un clic dans chaque lettre.

**Fichiers.** `api/src/notifyMailer.js` (`weeklyContext`, `personalLetter`, choix lettre / sélection), `api/src/weeklyLetterLib.js` (règles pures), modèle `weekly_letter` + titres de sections (`sec`) dans `api/src/emails.js` (rendu générique des sections `?{cardsXxx}`), `api/src/unsubscribe.js` (catégorie), `api/src/settings.js` (`weekly_personal`). Aucune migration, aucun changement du site ni de l'application.

**Correctif au passage.** Le texte du bouton des e-mails acceptait mal les variables : « Revenir sur {app} » (e-mail « Retour », étape 33) aurait affiché `{app}` tel quel. Corrigé et testé.

**Déploiement (DockPanel).** Redeploy **majlistv-api** uniquement. Sur le VPS :
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```

**Exemples.** Jeudi 9 h : Amal (suit un intervenant qui a publié lundi, a laissé une conférence à 12 min, a 3 notions à réviser) reçoit les quatre sections. Karim (rien de tout cela) reçoit « La sélection de la semaine » comme avant.

**Debug.** Rien ne part : « Envoyer la sélection de la semaine » est décoché, jour/heure pas encore atteints, envoi d'e-mails non configuré, ou personne n'a coché la case. Vérifier : `select kind, status, to_email, created_at from email_outbox where kind in ('weekly_letter','weekly_selection') order by id desc limit 20;` (dans la base `postgres-majlisstv`). Logs API : « Sélections de la semaine mises en file ».

**Limites (honnêtes).** Pas de test d'envoi manuel depuis l'admin pour cette lettre (le premier envoi réel a lieu au jour réglé : pour l'essayer plus tôt, mettre temporairement le jour d'envoi sur aujourd'hui et l'heure sur 0, avec un seul compte de test qui a coché la case) ; la notification téléphone reste celle de la sélection simple ; pas de suivi d'ouvertures.

**Testé.** Règles pures et rendu des 3 langues : 25 vérifications (`node api/tests/test_weeklyletter_lib.mjs`). Sur base réelle (`api/tests/test_weekly_letter.py`, qui lance le vrai passage hebdomadaire) : lettre personnelle avec ses trois sections, sélection simple sans personnel, un seul envoi par semaine, interrupteur, membre non inscrit. PAS testé : envoi vers une vraie boîte, rendu dans Gmail/Outlook.
