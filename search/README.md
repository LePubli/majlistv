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
- Container Port : `7700` ; **aucun domaine** (service interne)
- Persistent Volume : `/meili_data` (sinon l'index est perdu à chaque redéploiement ; il se reconstruirait tout seul, mais inutilement)
- Variable : `MEILI_MASTER_KEY` = résultat de `openssl rand -hex 32` (à saisir uniquement dans DockPanel, jamais dans un chat ni dans Git)

Port hôte : imposer **7060** (même méthode que pour le translator en 7050), vérifier qu'il est libre avant.

## Configuration (.env)
| Variable | Où | Rôle |
|---|---|---|
| `MEILI_MASTER_KEY` | service `majlistv-search` (DockPanel) | clé maître, 16 caractères minimum (32+ recommandé) |
| Adresse + clé | **Admin → Paramètres → Recherche (Meilisearch)** | `http://172.17.0.1:7060` et la même clé maître |

Variables fixées dans le Dockerfile : `MEILI_ENV=production`, `MEILI_NO_ANALYTICS=true`, `MEILI_MAX_INDEXING_MEMORY=300Mb`, `MEILI_MAX_INDEXING_THREADS=1` (laisse le CPU à Whisper).

`172.17.0.1` est l'adresse de l'hôte vue depuis les conteneurs Docker (réseau `bridge` par défaut). Si le test échoue, voir Debug.

## Lancement et vérification
```bash
docker logs --tail 20 dockpanel-git-majlistv-search
curl -s http://127.0.0.1:7060/health; echo
docker exec dockpanel-git-majlistv-api node -e "fetch('http://172.17.0.1:7060/health').then(r=>r.text()).then(console.log).catch(e=>console.log('ERREUR',e.message))"
```
Attendu : `{"status":"available"}` sur les deux dernières commandes. Ensuite : Admin → Paramètres → Recherche → saisir adresse + clé → Enregistrer → **Tester la connexion** ; le Tableau de bord affiche « N / N indexées » après une à deux minutes.

## Exemples d'utilisation
- Accueil : taper « trous noirs », « relativitée » (faute), « الصبر » (arabe), un mot prononcé dans une conférence ou présent dans ses sous-titres traduits.
- Cliquer un passage « ▶ 2:10 … » : la conférence s'ouvre à 2:10.
- API : `GET /search?q=gravitation&category=1&limit=24&offset=0` → `{ engine: "meilisearch" | "sql", total, hits: [{ …, snippet, moments: [{ ms, text }] }], markers }`.

## Debug
- Tableau de bord « recherche simple » : adresse ou clé non renseignée dans Admin → Paramètres.
- Message d'erreur sous la carte Recherche : le texte vient de Meilisearch (ex. `HTTP 403` = clé différente de `MEILI_MASTER_KEY` ; `fetch failed` = adresse injoignable).
- `fetch failed` depuis l'API : vérifier le port hôte (`docker ps --format '{{.Names}}\t{{.Ports}}' | grep search`) ; si l'API n'est pas sur le réseau `bridge`, trouver l'adresse de passerelle avec `docker inspect dockpanel-git-majlistv-api --format '{{range .NetworkSettings.Networks}}{{.Gateway}} {{end}}'` et l'utiliser à la place de 172.17.0.1.
- Résultats incomplets ou étranges : Admin → Tableau de bord → **Réindexer tout** (la recherche simple prend le relais pendant la reconstruction).
- Conteneur tué (mémoire) : augmenter la limite dans `/root/apply-limits.sh` (règle `majlistv-search`).

## Sécurité
Docker publie le port 7060 sur toutes les interfaces ; la clé maître protège l'accès. Pour bloquer en plus tout accès depuis Internet (l'API passe par l'interface Docker, pas par la carte réseau publique) :
```bash
IF=$(ip route show default | awk '{print $5}'); iptables -I DOCKER-USER -i "$IF" -p tcp --dport 7700 -j DROP && echo "7700 bloqué depuis $IF"
```
(règle perdue au redémarrage du VPS sauf avec `iptables-persistent`).

## Déploiement d'une nouvelle version de Meilisearch
Changer la version dans `search/Dockerfile`, Deploy, puis Admin → **Réindexer tout** (une version majeure peut refuser l'ancien index : supprimer alors le contenu du volume, l'index se reconstruit seul).
