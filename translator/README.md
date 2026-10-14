# Traducteur de sous-titres (Majlis TV)

## Description
Service qui traduit automatiquement la transcription d'une conférence dans les langues choisies par l'organisateur, avec l'**API Claude** (Anthropic). Il lit les demandes de la table `transcript_translations`, traduit les segments par paquets de 40 (avec les 3 dernières phrases du paquet précédent comme contexte, pour garder la cohérence), puis enregistre le résultat dans `transcript_segments` avec **les mêmes horodatages** que la transcription d'origine. Le site en tire, sans autre changement :
- des **sous-titres** supplémentaires dans le lecteur (la langue de l'interface est activée d'office si elle existe) ;
- le **panneau de transcription cliquable** dans chaque langue ;
- la **recherche** reste faite sur la langue d'origine.

Une langue n'apparaît dans le lecteur qu'une fois **entièrement** traduite (enregistrement atomique).

Cycle de vie d'une traduction : `pending` → `processing` (progression en %) → `ready` ; `failed` après 3 tentatives (ou tout de suite si la clé API est refusée). Une demande dont la transcription est indisponible passe en `failed` (« Transcription indisponible »). Une langue identique à celle de la conférence est ignorée.

## Prérequis
- API déployée avec la migration `006_translations.sql` (appliquée au démarrage de l'API) : **déployer l'API avant le traducteur**.
- Transcription (étape 3B) en place : on ne traduit que les conférences dont la transcription est `ready`.
- Un compte Anthropic avec une **clé API** (https://console.anthropic.com → API keys) et du crédit. Conseil : fixer une **limite de dépense mensuelle** dans la console.
- Le VPS doit pouvoir joindre `https://api.anthropic.com` (sortie HTTPS standard).
- Ressources : très légères (≈ 100 Mo de RAM, presque pas de CPU : le calcul se fait chez Anthropic).

## Installation (DockPanel Git Deploy)
Nouveau déploiement :
- Nom : `majlistv-translator` (minuscules)
- Dépôt / branche : les mêmes que l'API
- Dockerfile : `translator/Dockerfile`, contexte de build : `.`
- Port du conteneur : `3000` (page de santé), **aucun domaine**, aucun volume
- Variables d'environnement :
```
DATABASE_URL=<même valeur que majlistv-api : hôte 172.17.0.1>
ANTHROPIC_API_KEY=<ta clé, saisie uniquement dans DockPanel>
CLAUDE_MODEL=claude-haiku-5-5
```
Si DockPanel affiche « port is already allocated », imposer un port hôte libre (exemple 7050) puis Deploy Now :
```bash
ss -ltn | grep ':7050 ' || echo "7050 libre"
docker exec dockpanel-postgres sh -c 'psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -c "UPDATE git_deploys SET host_port=7050 WHERE name='"'"'majlistv-translator'"'"';"'
```
Limites de ressources conseillées (à rejouer après chaque redéploiement) :
```bash
docker update --cpus 0.5 --memory 256m --memory-swap 256m $(docker ps -aq --filter name=translator)
```

> **Réglages dans le site (étape 5)** : toutes les variables de moteurs, clés et modèles ci-dessous se règlent désormais dans **Admin → Paramètres** (prise en compte en moins de 10 s, sans redéploiement). Seule `SETTINGS_KEY` (identique à l'API) et `DATABASE_URL` restent obligatoires ici. Les variables listées servent de valeur de secours.

## Configuration (.env)
| Variable | Défaut | Rôle |
|---|---|---|
| `DATABASE_URL` | obligatoire | même base que l'API (mot de passe avec `@` : écrire `%40`) |
| `TRANSLATE_PROVIDER` | `claude` | moteur par défaut : `claude`, `azure` ou `deepseek` |
| `ANTHROPIC_API_KEY` | si moteur `claude` ou langues forcées | clé API Anthropic. **Jamais dans Git, jamais dans un chat** |
| `CLAUDE_MODEL` | `claude-haiku-5-5` | modèle de traduction. `claude-sonnet-5-5` : meilleure qualité (arabe, vocabulaire spécialisé), plus cher |
| `TRANSLATE_CHUNK_SEGMENTS` | `40` | segments traduits par appel (baisser si « réponse tronquée ») |
| `TRANSLATE_CHUNK_CHARS` | `3000` | caractères maximum par appel |
| `TRANSLATE_MAX_CHARS` | `600000` | **garde-fou de coût** : une transcription plus longue est refusée |
| `AZURE_TRANSLATOR_KEY` | si moteur `azure` | clé 1 ou 2 de la ressource Azure |
| `AZURE_TRANSLATOR_REGION` | — | région de la ressource (ex. `francecentral`) ; obligatoire pour une ressource régionale |
| `AZURE_TRANSLATOR_ENDPOINT` | endpoint global | ne changer que pour un endpoint dédié |
| `DEEPSEEK_API_KEY` | si moteur `deepseek` | clé API DeepSeek (platform.deepseek.com) |
| `DEEPSEEK_MODEL` | `deepseek-flash` | nom du modèle ; à vérifier dans api-docs.deepseek.com si DeepSeek renomme ses modèles |
| `DEEPSEEK_THINKING` | `off` | `off` désactive le mode « réflexion » de DeepSeek (indispensable : sinon réponses vides ou trop lentes/chères) |
| `DEEPSEEK_CHUNK_SEGMENTS` / `DEEPSEEK_CHUNK_CHARS` | `40` / `3000` | taille des paquets (baisser si « réponse tronquée ») |
| `TRANSLATE_CLAUDE_LANGS` / `TRANSLATE_AZURE_LANGS` / `TRANSLATE_DEEPSEEK_LANGS` | vide | mode hybride : langues cibles forcées vers ce moteur (ex. `TRANSLATE_CLAUDE_LANGS=ar,ur`). Les clés des moteurs utilisés doivent exister |
| `AZURE_CHARS_PER_MINUTE` | `30000` | débit max vers Azure (limite F0 ≈ 33 300/min), `0` = aucune limite |
| `POLL_SECONDS` | `10` | fréquence de recherche de nouvelles demandes |
| `ANTHROPIC_API_URL` | API officielle | pour les tests locaux avec la fausse API |

Changer de modèle = modifier la variable puis Deploy Now. Les traductions déjà faites ne sont pas refaites (voir Debug pour les relancer).

## Moteur Azure AI Translator (gratuit jusqu'à 2 M caractères/mois)
1. Portail Azure → Créer une ressource → **Translator** → niveau tarifaire **Free F0** (une seule F0 par abonnement) → créer.
2. Ressource → *Clés et point de terminaison* : copier **Clé 1** et la **Région**.
3. Dans DockPanel, variables de `majlistv-translator` : `TRANSLATE_PROVIDER=azure`, `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION`. Save puis Deploy.
4. **Hybride recommandé** : ajouter `TRANSLATE_CLAUDE_LANGS=ar` et `ANTHROPIC_API_KEY` ; l'arabe (où la qualité compte le plus) passe par Claude, le reste par Azure.

Bon à savoir : Azure traduit segment par segment sans contexte, donc qualité inférieure à Claude (surtout arabe, vocabulaire religieux/spécialisé). Environ 50 000 caractères par heure de conférence et par langue : ~40 heures-langues/mois gratuites. Quota épuisé = erreur HTTP 403 (« quota gratuit épuisé ? ») : la traduction passe en `failed`, relançable depuis l'interface le mois suivant ou en repassant sur Claude. Si Azure ne supprime pas de blocage, repasser `TRANSLATE_PROVIDER=claude` suffit (aucune perte de données).

## Moteur DeepSeek (API payante, très économique)
1. Créer un compte sur platform.deepseek.com, recharger un petit solde, créer une clé API.
2. DockPanel, variables de `majlistv-translator` : `TRANSLATE_PROVIDER=deepseek` et `DEEPSEEK_API_KEY` (clé uniquement dans DockPanel). Save puis Deploy.
3. Qualité : modèle de langage avec contexte, donc meilleur qu'Azure, probablement un peu en dessous de Claude en arabe (à tester).
4. Confidentialité : les textes sont envoyés à des serveurs en Chine. Conférences publiques : acceptable ; contenus privés : à éviter.
5. Erreur HTTP 402 = solde épuisé (traduction `failed`, relançable après recharge). Un contenu vide occasionnel de l'API en mode JSON est réessayé automatiquement.

### Combiner les moteurs
Exemples (dans DockPanel) : `TRANSLATE_PROVIDER=azure` + `TRANSLATE_CLAUDE_LANGS=ar` (arabe par Claude, reste gratuit par Azure) ; ou `TRANSLATE_PROVIDER=deepseek` + `TRANSLATE_CLAUDE_LANGS=ar`. Changer de moteur n'efface rien : seules les nouvelles traductions utilisent le nouveau moteur.

## Résumé, points clés et chapitres (étape 3D)
Le même conteneur génère, pour chaque conférence dont la transcription est prête :
- un **résumé** (3 à 6 phrases), 4 à 8 **points clés** et des **chapitres** horodatés (un tous les 4 à 10 minutes) dans la langue d'origine, en un seul appel IA qui lit toute la transcription ;
- puis, pour chaque langue de sous-titres prête, une **traduction** de ce résumé (mêmes chapitres, mêmes instants).

Moteur : `INSIGHTS_PROVIDER` = `deepseek` ou `claude` (Azure Translator ne sait pas résumer). Sans cette variable : DeepSeek si `DEEPSEEK_API_KEY` existe, sinon Claude si `ANTHROPIC_API_KEY` existe, sinon la fonction est désactivée (message au démarrage). `INSIGHTS_ENABLED=off` la coupe. Prérequis : migration `007_insights.sql` (appliquée par l'API au déploiement).

Coût : un appel par conférence (≈ 15 000 jetons pour une heure) + des petits appels de traduction ; quelques centimes avec DeepSeek. Garde-fou : transcription de plus de `INSIGHTS_MAX_CHARS` (200 000) caractères refusée.

Debug :
```sql
SELECT talk_id, lang, status, error, jsonb_array_length(chapters) AS chapitres FROM talk_insights ORDER BY updated_at DESC LIMIT 20;
-- Refaire un résumé (ou bouton « Régénérer le résumé » dans Mes conférences) :
UPDATE talk_insights SET status = 'pending', attempts = 0, error = NULL WHERE talk_id = '…';
```
`curl -s http://127.0.0.1:7050/health` affiche aussi `insights` (moteur et dernier succès).

## Lancement et vérification
```bash
docker logs -f --tail 20 dockpanel-git-majlistv-translator   # « Traducteur prêt (modèle … ) »
curl -s http://127.0.0.1:7050/health                         # adapter le port hôte
```

## Utilisation
- **À l'envoi d'une conférence** (« Mes conférences » → fichier vidéo) : cocher les langues dans « Sous-titres traduits ». Les liens YouTube/Vimeo n'ont pas de transcription, donc pas de traduction.
- **Après coup** : sur la ligne de la conférence, menu « + Langue » pour ajouter une langue ; « Relancer » sur une traduction en échec ; « × » pour retirer une traduction (jamais la langue d'origine).
- Côté public : dans le lecteur, bouton de sous-titres ; dans le panneau de transcription, menu de langue.

## Coût (à vérifier sur ta console Anthropic)
Une conférence d'une heure représente environ 700 segments, soit de l'ordre de 15 000 jetons de texte à lire et autant à écrire **par langue cible** (plus pour l'arabe), plus quelques milliers de jetons de consignes répétées à chaque paquet. Multiplie par le prix des jetons du modèle choisi (https://www.anthropic.com/pricing) et par le nombre de langues. Mesure sur 2 ou 3 conférences réelles dans la console (Usage), puis décide de proposer les traductions à toutes les conférences ou seulement aux plus vues. `TRANSLATE_MAX_CHARS` empêche une très longue transcription de coûter trop cher par erreur.

## Debug
- État des traductions (dans le conteneur PostgreSQL de l'application, base `appmajlistv`) :
```sql
SELECT left(talk_id::text,8) AS talk, lang, status, progress, attempts, left(error,80) AS erreur FROM transcript_translations ORDER BY created_at DESC;
```
- Relancer une traduction en échec : `UPDATE transcript_translations SET status='pending', attempts=0, error=NULL WHERE talk_id='<id>' AND lang='<fr>';`
- Refaire une traduction déjà prête (changement de modèle) : `DELETE FROM transcript_segments WHERE talk_id='<id>' AND lang='fr'; UPDATE transcript_translations SET status='pending', attempts=0 WHERE talk_id='<id>' AND lang='fr';`
- `HTTP 401` : clé refusée ou expirée → corriger `ANTHROPIC_API_KEY` dans DockPanel, redéployer, relancer les traductions en échec. `HTTP 429` / `529` : limite de débit ou surcharge, le service réessaie tout seul (jusqu'à 5 fois par appel).
- `HTTP 400` avec « credit balance » : crédit épuisé → recharger le compte Anthropic.
- « Réponse tronquée (max_tokens) » : baisser `TRANSLATE_CHUNK_SEGMENTS` (ex. 20).
- Un seul traducteur doit tourner.

## Sécurité
- La clé API ne se saisit que dans les variables DockPanel ; elle n'apparaît ni dans le dépôt ni dans les logs.
- Le texte transcrit est traité comme une donnée à traduire, jamais comme des instructions (consigne explicite + sortie imposée par un outil structuré). Le modèle ne peut rien faire d'autre que renvoyer des phrases traduites.
- En cas de fuite d'une clé : la révoquer dans la console Anthropic, en créer une autre, la mettre dans DockPanel.

## Développement local
```bash
cd translator && pip install -r requirements.txt
# Test sans clé ni coût : fausse API Anthropic
MOCK_PORT=8099 python tests/mock_claude.py &
DATABASE_URL=postgres://... ANTHROPIC_API_KEY=test-key ANTHROPIC_API_URL=http://127.0.0.1:8099/v1/messages python src/main.py
```
La fausse API renvoie « [fr] texte » : utile pour vérifier toute la chaîne (base, lecteur, interface) sans appeler le vrai service. `MOCK_MODE=flaky|badlen|401` simule une limite de débit, une réponse incohérente, une clé refusée.

## Mise en pratique (étape 29)
Le même conteneur génère aussi les propositions d'action de « Et maintenant, que faire ? » (file `practice_jobs`, logs `[pratique …]`, santé : champ `practice`). Même moteur et mêmes réglages que les résumés ; aucune nouvelle variable. Garde-fous : passage cité mot pour mot dans la transcription, aucun texte religieux ni citation, brouillon relu par un humain. Test sans coût : `python3 translator/tests/test_practice_clean.py` ; de bout en bout avec la fausse API : `api/tests/test_practice_gen.py`.
