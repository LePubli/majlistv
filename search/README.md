# Recherche Meilisearch (Majlis TV)

## Description
Moteur de recherche plein texte des conférences : titres, intervenants, catégories, descriptions, **transcriptions** et **sous-titres traduits**. Tolère les fautes de frappe (« relativitée » trouve « relativité »), gère l'arabe, et renvoie des **extraits surlignés** et des **passages horodatés** cliquables (la vidéo s'ouvre au bon moment).

L'API alimente l'index toute seule (synchronisation toutes les 15 s) : aucune action manuelle quand une conférence est ajoutée, modifiée, traduite ou supprimée. Tant que Meilisearch n'est pas configuré ou s'il est arrêté, le site utilise automatiquement la recherche SQL simple (sans tolérance aux fautes) : rien ne casse.

Protection premium : une conférence premium apparaît dans les résultats, mais ses extraits de transcription et ses passages ne sont montrés qu'aux abonnés, à son organisateur et aux admins.

## Prérequis
- DockPanel sur le VPS Ubuntu 24, même dépôt Git que les autres services.
- Environ 500 Mo de RAM et un peu de disque (l'index pèse quelques dizaines de Mo pour des centaines de conférences).
- API à l'étape 7 (migration `011_search.sql`).

## Installation (DockPanel → Git Deploy → New Deploy)
- Name : `majlistv-search`
- Dépôt / branche : les mêmes que l'API
- Dockerfile Path : `search/Dockerfile` ; Build Context : `.`
- Container Port : `3000` (Meilisearch écoute sur 3000 comme les autres services) ; **aucun domaine** (service interne)
- Persistent Volume : `/meili_data` (sinon l'index est perdu à chaque redéploiement ; il se reconstruirait tout seul, mais inutilement)
- Variable : `MEILI_MASTER_KEY` = résultat de `openssl rand -hex 32` (à saisir uniquement dans DockPanel, jamais dans un chat ni dans Git)

Port hôte : imposer **7060** (même méthode que pour le translator en 7050), vérifier qu'il est libre avant.

## Configuration (.env)
| Variable | Où | Rôle |
|---|---|---|
| `MEILI_MASTER_KEY` | service `majlistv-search` (DockPanel) | clé maître, 16 caractères minimum (32+ recommandé) |
| Adresse + clé | **Admin → Paramètres → Recherche (Meilisearch)** | `http://IP_DU_CONTENEUR:3000` (ex. `http://172.17.0.9:3000`) et la même clé maître |

Variables fixées dans le Dockerfile : `MEILI_ENV=production`, `MEILI_NO_ANALYTICS=true`, `MEILI_MAX_INDEXING_MEMORY=300Mb`, `MEILI_MAX_INDEXING_THREADS=1` (laisse le CPU à Whisper).

DockPanel place les conteneurs sur le réseau Docker `bridge` par défaut, où les noms ne sont pas résolus : l'API joint Meilisearch par l'**adresse IP du conteneur** (même principe que `DATABASE_URL`). Le port hôte 7060 n'est ouvert que sur 127.0.0.1 (tests depuis le VPS). Obtenir l'IP :
```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' dockpanel-git-majlistv-search
```
Après un redémarrage du VPS ou un redéploiement de `majlistv-search`, l'IP peut changer : le Tableau de bord affiche alors une erreur sous la carte Recherche (la recherche simple prend le relais) ; reprendre l'IP et la mettre à jour dans Admin → Paramètres. Si le test échoue, voir Debug.

## Lancement et vérification
```bash
docker logs --tail 20 dockpanel-git-majlistv-search
curl -s http://127.0.0.1:7060/health; echo
IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' dockpanel-git-majlistv-search); echo "IP : $IP"
docker exec dockpanel-git-majlistv-api node -e "fetch('http://$IP:3000/health').then(r=>r.text()).then(console.log).catch(e=>console.log('ERREUR',e.message))"
```
Attendu : `{"status":"available"}` sur les deux dernières commandes. Ensuite : Admin → Paramètres → Recherche → saisir adresse + clé → Enregistrer → **Tester la connexion** ; le Tableau de bord affiche « N / N indexées » après une à deux minutes.

## Exemples d'utilisation
- Accueil : taper « trous noirs », « relativitée » (faute), « الصبر » (arabe), un mot prononcé dans une conférence ou présent dans ses sous-titres traduits.
- Cliquer un passage « ▶ 2:10 … » : la conférence s'ouvre à 2:10.
- API : `GET /search?q=gravitation&category=1&limit=24&offset=0` → `{ engine: "meilisearch" | "sql", total, hits: [{ …, snippet, moments: [{ ms, text }] }], markers }`.

## Debug
- Tableau de bord « recherche simple » : adresse ou clé non renseignée dans Admin → Paramètres.
- Message d'erreur sous la carte Recherche : le texte vient de Meilisearch (ex. `HTTP 403` = clé différente de `MEILI_MASTER_KEY` ; `fetch failed` = adresse injoignable).
- `fetch failed` depuis l'API : l'IP du conteneur a changé (redéploiement, redémarrage du VPS). La reprendre avec la commande `docker inspect` ci-dessus et la mettre à jour dans Admin → Paramètres.
- Résultats incomplets ou étranges : Admin → Tableau de bord → **Réindexer tout** (la recherche simple prend le relais pendant la reconstruction).
- Conteneur tué (mémoire) : augmenter la limite dans `/root/apply-limits.sh` (règle `majlistv-search`).

## Sécurité
DockPanel publie le port hôte sur `127.0.0.1` uniquement : Meilisearch n'est pas joignable depuis Internet. La clé maître protège en plus chaque requête.

## Déploiement d'une nouvelle version de Meilisearch
Changer la version dans `search/Dockerfile`, Deploy, puis Admin → **Réindexer tout** (une version majeure peut refuser l'ancien index : supprimer alors le contenu du volume, l'index se reconstruit seul).
