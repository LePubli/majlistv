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
