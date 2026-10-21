# Reconstruire Mejliss TV de zéro (VPS perdu, migration ou réinstallation)

Guide de secours, écrit le 21/10/2026 à partir des README de chaque service et des scripts du dépôt. **Il n'a pas été rejoué sur un VPS vierge** : chaque étape décrit ce que le dépôt documente, mais le premier vrai essai reste à faire (voir « Essai à blanc » à la fin). Pour la reconstruction, ne rien inventer : en cas d'écart, lire le message d'erreur et le donner à Claude.

Durée prévue : une demi-journée si les sauvegardes sont lisibles et si les secrets ci-dessous sont retrouvés.

---

## 0. À rassembler AVANT (sans ces éléments, les données ne sont pas lisibles)

| Élément | Où le retrouver | Pourquoi |
|---|---|---|
| `SETTINGS_KEY` | gestionnaire de mots de passe (valeur identique sur api, translator, transcriber, dubbing) | déchiffre les clés saisies dans Admin → Paramètres (Stripe, IA, SMTP…). **Perdue = tout ressaisir.** |
| `PRACTICE_KEY` | idem (API seulement) | déchiffre « Mes engagements » des membres. **Perdue = engagements illisibles.** |
| `JWT_SECRET` | idem | perdue : tout le monde doit se reconnecter (sans gravité) |
| `GARAGE_RPC_SECRET` | idem | secret du stockage |
| Clé S3 de l'API (`S3_ACCESS_KEY` / `S3_SECRET_KEY`) | idem (ou la recréer, étape 3) | accès au bucket `majlis-videos` |
| Mot de passe PostgreSQL (utilisateur, base) | idem | `DATABASE_URL` |
| `MEILI_MASTER_KEY` | idem | recherche (l'index se reconstruit tout seul) |
| `RESTIC_PASSWORD` et clé SSH `id_backup` | gestionnaire de mots de passe | **sans eux la sauvegarde est inutilisable** |
| Clés Stripe, Azure/Anthropic/DeepSeek, SMTP | comptes des fournisseurs | à ressaisir si `SETTINGS_KEY` est perdue |

**Photographier l'état actuel (à faire dès maintenant, sur le VPS qui marche)** — copie des variables de chaque service, à ranger dans le gestionnaire de mots de passe (jamais dans Git ni dans un chat) :
```bash
for s in api web worker transcriber translator search storage dubbing; do
  echo "=== majlistv-$s"
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' dockpanel-git-majlistv-$s 2>/dev/null | grep -vE '^(PATH|HOME|NODE_|YARN_|LANG|PYTHON|GPG_KEY|HOSTNAME)='
done > /root/env-majlistv.txt; chmod 600 /root/env-majlistv.txt
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -i majlis        # ports hôte attribués
cat /root/apply-limits.sh                                           # limites de ressources (propre au VPS, hors dépôt)
```
Le fichier `/root/apply-limits.sh` et `/etc/nginx` sont déjà dans la sauvegarde nocturne (restic) ; `/root/env-majlistv.txt` n'y est PAS : le copier à part.

---

## 1. Le serveur

1. VPS Ubuntu 24.04 (6 cœurs / 16 Go conseillés ; 4 cœurs / 8 Go pour le doublage si on l'active ; ≥ 100 Go de disque dont ~40 Go pour Garage).
2. Docker, nginx et **DockPanel** installés (même procédure que le VPS actuel). Si le VPS héberge aussi d'autres projets (Miel & Compagnie, TriMaint), **ne pas toucher à leurs ports** : `7001` = TriMaint.
3. DNS des 3 sous-domaines vers le VPS : `majlisstv.le-publicitaire.fr` (site), `api-majlisstv.le-publicitaire.fr` (API), `s3-majlisstv.le-publicitaire.fr` (stockage S3).
4. Récupérer ce dépôt (GitHub `LePubli/majlistv`, branche `main`) : DockPanel le clone lui-même à chaque déploiement. **Ne jamais mettre de `docker-compose.yml` à la racine du dépôt** (DockPanel passerait en mode Compose).
5. Remettre `/root/apply-limits.sh`, la sauvegarde (`ops/backup/README.md`) et ce script de contrôle :
```bash
cp ops/verify/verify-deploy.sh /root/verify-deploy.sh && chmod 700 /root/verify-deploy.sh
```

## 2. Ordre de construction (chaque service = DockPanel → Git Deploy → New Deploy, même dépôt, branche `main`)

| # | Nom (minuscules) | Dockerfile Path | Contexte | Port conteneur | Domaine | Volumes persistants | Port hôte |
|---|---|---|---|---|---|---|---|
| 1 | `postgres-majlisstv` | (Docker App PostgreSQL de DockPanel) | | 5432 | non | celui de l'app | — |
| 2 | `majlistv-storage` | `garage/Dockerfile` | `.` | 3900 | `s3-majlisstv…` (HTTPS) | `/var/lib/garage/meta`, `/var/lib/garage/data` | automatique (vérifier) |
| 3 | `majlistv-api` | `Dockerfile` (racine : construit `./api`) | `.` | 3000 | `api-majlisstv…` (HTTPS) | aucun | attribué par DockPanel |
| 4 | `majlistv-web` | `web/Dockerfile` | `.` | 3000 | `majlisstv…` (HTTPS) | aucun | attribué par DockPanel |
| 5 | `majlistv-worker` | `worker/Dockerfile` | `.` | 3000 | non | aucun | ex. 7030 |
| 6 | `majlistv-transcriber` | `transcriber/Dockerfile` | `.` | 3000 | non | `/models` | ex. 7040 |
| 7 | `majlistv-translator` | `translator/Dockerfile` | `.` | 3000 | non | aucun | ex. 7050 |
| 8 | `majlistv-search` | `search/Dockerfile` | `.` | 3000 | non | `/meili_data` | **7060** |
| 9 | `majlistv-dubbing` (facultatif) | `dubbing/Dockerfile` | `.` | 3000 | non | `/models` | ex. 7041 |

Si DockPanel répond « port is already allocated », imposer le port hôte (exemple pour le worker) :
```bash
ss -ltn | grep ':7030 ' || echo "7030 libre"
docker exec dockpanel-postgres sh -c 'psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -c "UPDATE git_deploys SET host_port=7030 WHERE name='"'"'majlistv-worker'"'"';"'
```
(puis « Deploy Now »). Pour l'API et le site, **ne rien imposer** : DockPanel choisit le port hôte et écrit lui-même le vhost nginx (constaté le 21/10 : API 43435, site 34455, stockage 7020). Vérifier qu'ils concordent :
```bash
docker port dockpanel-git-majlistv-api 3000/tcp; docker port dockpanel-git-majlistv-web 3000/tcp
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
```

### Étape 1 — PostgreSQL
DockPanel → Docker Apps → PostgreSQL (`postgres-majlisstv`). Noter utilisateur, base, mot de passe, puis l'adresse du conteneur (elle sert dans `DATABASE_URL`, et **change si le conteneur est recréé**) :
```bash
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{$v.IPAddress}}{{"\n"}}{{end}}' dockpanel-app-postgres-majlisstv
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' dockpanel-app-postgres-majlisstv | grep -E 'POSTGRES_(USER|DB)='
```
`DATABASE_URL=postgres://UTILISATEUR:MOTDEPASSE@IP_DU_CONTENEUR:5432/BASE` (mot de passe avec `@ / # ? : %` : encoder `%40 %2F %23 %3F %3A %25`). Le même `DATABASE_URL` sert à l'API, au worker, au transcripteur, au traducteur et au doublage.
**Si on restaure une sauvegarde** : le faire maintenant, avant l'API (étape 9 plus bas). Sinon l'API crée toutes les tables au premier démarrage.

### Étape 2 — Garage (stockage vidéo)
Variable : `GARAGE_RPC_SECRET` (= `openssl rand -hex 32`). Après le premier déploiement, une seule fois :
```bash
G="docker exec dockpanel-git-majlistv-storage /garage"
$G status                                   # noter l'identifiant du nœud
$G layout assign -z dc1 -c 40G IDENTIFIANT_DU_NOEUD
$G layout apply --version 1
$G bucket create majlis-videos
$G key create majlis-api
$G bucket allow --read --write --owner majlis-videos --key majlis-api
$G key info majlis-api                      # Key ID + secret = S3_ACCESS_KEY / S3_SECRET_KEY (à garder)
$G bucket set-quotas majlis-videos --max-size 40GiB
```
(adapter `40G` à la place libre, `df -h`). Test : `curl -s https://s3-majlisstv.le-publicitaire.fr/` répond une erreur XML « Access Denied » : normal. La configuration CORS du bucket est posée par l'API au démarrage (message « CORS du bucket non configuré » dans ses journaux = bucket absent ou clé refusée).
**Si on restaure les vidéos** : voir « Restaurer les données », avant de mettre des vidéos en ligne.

### Étape 3 — API (`majlistv-api`)
Variables (sans guillemets ; modèle : `.env.example`) :
```
DATABASE_URL=...                         # étape 1
JWT_SECRET=<openssl rand -hex 32>
JWT_EXPIRES=7d
SETTINGS_KEY=<la même que l'ancienne installation>
PRACTICE_KEY=<la même que l'ancienne installation>
APP_NAME=Mejliss TV
CORS_ORIGIN=https://majlisstv.le-publicitaire.fr
ADMIN_EMAIL=<votre e-mail>
ADMIN_PASSWORD=<mot de passe long>      # utilisé seulement si aucun administrateur n'existe encore
S3_ENDPOINT=https://s3-majlisstv.le-publicitaire.fr
S3_REGION=garage
S3_BUCKET=majlis-videos
S3_ACCESS_KEY=<Key ID de majlis-api>
S3_SECRET_KEY=<secret de majlis-api>
MEILI_MASTER_KEY=<la même que le service search>
```
Contrôle : `https://api-majlisstv.le-publicitaire.fr/health` → `{"status":"ok"}` ; journaux : `docker logs dockpanel-git-majlistv-api 2>&1 | grep -i migrat | tail` (« Migration appliquée : … » jusqu'à `061_media_import.sql`). Port hôte : voir plus haut (DockPanel le choisit).

### Étape 4 — Site (`majlistv-web`)
Variables : `API_URL` (adresse de l'API : **reprendre exactement la valeur de `/root/env-majlistv.txt`** — le README historique du site cite l'adresse du site, la valeur réellement utilisée est celle de la sauvegarde des variables), `APP_NAME=Mejliss TV`, `CSP_STORAGE_ORIGINS=https://s3-majlisstv.le-publicitaire.fr` (indispensable : sans lui, miniatures, images de chaînes et envois de fichiers sont bloqués par la politique de sécurité du navigateur). Facultatives : `CSP_MODE`, `CSP_EXTRA_FRAME`.

### Étape 5 — Worker (conversion vidéo)
Variables : `DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION=garage`, `S3_BUCKET=majlis-videos`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (mêmes valeurs que l'API) ; facultatives : `FFMPEG_THREADS` (2 pour ménager le VPS), `POLL_SECONDS`. Journal attendu : « Worker prêt. ». Le worker démarre après l'API (il attend la migration).

### Étape 6 — Transcripteur (Whisper, import, intervenants)
Variables : `DATABASE_URL`, `SETTINGS_KEY` (la même), `S3_*` (comme ci-dessus), `WHISPER_MODEL=small`, `WHISPER_THREADS=4`. Volume `/models` (sinon le modèle est retéléchargé à chaque redéploiement). Journal : « Transcripteur prêt ».

### Étape 7 — Traducteur
Variables : `DATABASE_URL`, `SETTINGS_KEY` (la même), `ANTHROPIC_API_KEY`, `CLAUDE_MODEL=claude-haiku-5-5` ; moteurs (Azure, DeepSeek) et clés se règlent ensuite dans Admin → Paramètres.

### Étape 8 — Recherche
Variable `MEILI_MASTER_KEY`. Volume `/meili_data`. Port hôte 7060. Meilisearch n'est joignable que par l'adresse IP de son conteneur :
```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' dockpanel-git-majlistv-search
```
Cette adresse + la clé se saisissent dans Admin → Paramètres → Recherche, puis « Réindexer tout ».

### Étape 9 — Doublage (facultatif)
Variables : `DATABASE_URL`, `SETTINGS_KEY`, `S3_*`, `DUB_THREADS=4`. Volume `/models` (~1,5 Go téléchargés au premier lancement, accès à huggingface.co requis). Limite conseillée : `docker update --cpus 4 --memory 8g --memory-swap 8g dockpanel-git-majlistv-dubbing`.

### Après chaque déploiement (toujours)
```bash
/root/apply-limits.sh
grep -n proxy_pass /etc/nginx/sites-enabled/*majlisstv*
nginx -t && systemctl reload nginx
bash /root/verify-deploy.sh
```

---

## 3. Restaurer les données (si les sauvegardes existent)

Prérequis : `restic`, la clé SSH `id_backup` et `/root/.config/backup/env` (voir `ops/backup/README.md`).
```bash
set -a; . /root/.config/backup/env; set +a
restic snapshots
mkdir -p /tmp/restore && restic restore latest --target /tmp/restore --include /var/backups/vps-dumps --include /etc/nginx --include /etc/cron.d --include /root/apply-limits.sh
ls -lt /tmp/restore/var/backups/vps-dumps | head
```
- **Base** : avant de démarrer l'API (étape 3), après la création de la base vide :
```bash
gunzip -c /tmp/restore/var/backups/vps-dumps/<fichier mejliss>_<date>.sql.gz | docker exec -i dockpanel-app-postgres-majlisstv sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```
(le nom exact du fichier de dump de Mejliss TV se lit dans `ls` ci-dessus). L'API appliquera ensuite les migrations qui manquent.
- **Vidéos (Garage)** : voir `ops/backup/README.md` § « Vidéos (Garage) » : arrêter le service `majlistv-storage`, remettre `garage/data`, copier le contenu du dernier snapshot dans `meta/` (fichier `data.mdb`), redémarrer. Vérifier ensuite `/garage bucket info majlis-videos` (nombre d'objets).
- Restaurer `/etc/nginx` et `/root/apply-limits.sh` seulement si DockPanel ne recrée pas les vhosts ; sinon les relire comme référence.
- Test mensuel déjà prévu : `/root/backup/restore-test.sh` (« TEST DE RESTAURATION REUSSI »).

## 4. Après la reconstruction : réglages dans le site (Admin → Paramètres)
1. Se connecter avec `ADMIN_EMAIL` / `ADMIN_PASSWORD` (ou le compte restauré).
2. Si `SETTINGS_KEY` a été conservée et la base restaurée : tout est déjà là. Sinon ressaisir : Stripe (clés, prix mensuel `6,99 €` / annuel `69,99 €`, secret du webhook), moteurs de traduction et IA, SMTP, Recherche (adresse IP du conteneur + clé), cookies YouTube si besoin.
3. Stripe → Webhooks : l'adresse de l'API + les événements `invoice.paid`, `charge.refunded`, `checkout.session.async_payment_succeeded` (+ ceux déjà listés dans Admin → Paramètres → Paiement).
4. Admin → Fonctions : vérifier les fonctions activées (réglage `feat_<id>` : restauré avec la base).
5. Admin → Recherche → « Réindexer tout ».

## 5. Contrôle final
```bash
bash /root/verify-deploy.sh
```
Doit finir par « 0 échec ». Puis, à la main : ouvrir le site, se connecter, lire une conférence hébergée (lecture HLS), envoyer une petite vidéo de test (conversion par le worker), vérifier Studio → Activité.

## 6. Pièges connus (rassemblés des README)
- DockPanel refuse un nom avec majuscules ; « Docker Compose refused » = un `docker-compose.yml` traîne à la racine du dépôt ; « Deploy blocked: active critical/major incident » = résoudre l'incident dans DockPanel.
- L'IP du conteneur PostgreSQL change s'il est recréé : mettre à jour `DATABASE_URL` partout (api, worker, transcriber, translator, dubbing).
- Un redéploiement efface les limites de ressources : relancer `/root/apply-limits.sh`.
- 502 : conteneur en boucle (`docker logs --tail 50 …`). `Invalid URL` = `DATABASE_URL` mal formée ; `password authentication failed` = mauvais mot de passe ; `ECONNREFUSED` = mauvaise IP ou port.
- Images de chaînes / miniatures invisibles : `CSP_STORAGE_ORIGINS` du site. Envoi de fichier refusé : CORS du bucket (journaux de l'API).
- Ne jamais changer `SETTINGS_KEY` ni `PRACTICE_KEY` après coup.

## 7. Essai à blanc (à faire une fois, pour que ce guide soit vérifié)
Le guide est écrit, pas rejoué. Pour le fiabiliser : louer un petit VPS jetable (ou une machine virtuelle Ubuntu 24.04), y rejouer les étapes 1 à 9 avec les vraies sauvegardes, noter chaque écart ici, puis supprimer la machine. À la fin, `verify-deploy.sh` doit être vert.
