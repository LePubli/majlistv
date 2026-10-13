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
