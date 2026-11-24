# Kit de création de thèmes Mejliss TV

Un **thème** est un fichier `.zip` (jetons de style, feuille de style filtrée, polices, images, pages en blocs, sections globales, modèles). Il ne contient **aucun code**. Il s'installe et s'active depuis **Administration → Apparence → Thèmes Mejliss**.

## Contenu de ce dossier

| Fichier | Rôle |
|---|---|
| `example/` | Thème d'exemple « Aurore » (source) : modèle à copier. |
| `GUIDE-IA.md` | Guide complet **généré depuis le code** : toutes les pages, routes, blocs, réglages, fonctions, classes CSS et une checklist « rien d'oublié ». À donner en entier à une IA. |
| `routes.json` | Annuaire de toutes les pages du site (lu dans `web/app`). |
| `css-hooks.json` | Toutes les classes CSS du site (lues dans `web/app/*.css`). |
| `scan.mjs` | Régénère `routes.json`, `css-hooks.json` et `GUIDE-IA.md`. |
| `validate.mjs` | Contrôle un dossier ou un `.zip` avec les mêmes règles que le site. |
| `build.mjs` | Fabrique le `.zip` d'un dossier (après contrôle). |

## Prérequis

Node 22 (celui de l'API). Rien d'autre : aucune dépendance. Depuis la racine du dépôt (WSL Ubuntu ou le VPS).

## Créer un thème (étape par étape)

1. Télécharger le thème d'exemple et le guide : Administration → Apparence → Thèmes Mejliss (ou copier `api/theme-kit/example` et `api/theme-kit/GUIDE-IA.md`).
2. Donner le guide et l'exemple à une IA avec la demande (modèle de demande : section 11 du guide).
3. Mettre les fichiers dans un dossier `mon-theme/` (`theme.json` à la racine).
4. Contrôler :

       node api/theme-kit/validate.mjs mon-theme/

   Corriger jusqu'à « ✓ Thème valide » (renvoyer les messages à l'IA).
5. Fabriquer le `.zip` :

       node api/theme-kit/build.mjs mon-theme/ mon-theme.zip

6. Administration → Apparence → Thèmes Mejliss → « Envoyer un thème » → « Installer ce thème » → « Activer ».
7. Relire puis **publier** les pages en brouillon depuis l'éditeur visuel (`/editeur`). Rien n'est publié automatiquement.
8. Revenir en arrière : « Désactiver » restaure le thème et les couleurs d'avant.

## Mettre à jour le guide (développeurs)

Quand une page, un bloc, un réglage de style ou une fonction est ajouté au site :

    node api/theme-kit/scan.mjs

puis commiter `routes.json`, `css-hooks.json` et `GUIDE-IA.md`. Le test `node api/tests/test_theme_kit.mjs` échoue tant que ce n'est pas fait.

## Déploiement

Le dossier fait partie de l'API (`COPY api/ .` dans le Dockerfile racine) : Redeploy `majlistv-api` suffit. Migration 134 (table `theme_packs`) appliquée au démarrage.

## Debug

- « Ce thème est refusé » : lire la liste, chaque message nomme le fichier et la clé.
- Le CSS du thème est ajouté à `/theme` (le site le recharge sous 10 à 15 s) : `curl https://api-majlisstv.le-publicitaire.fr/theme`.
- Envoi qui échoue sans message : un thème lourd peut dépasser la limite d'envoi de Nginx pour le domaine du site ; vérifier `grep -n client_max_body_size /etc/nginx/sites-enabled/*majlisstv*`.
