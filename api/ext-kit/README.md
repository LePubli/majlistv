# Kit des extensions Mejliss TV

Une extension est un fichier .zip qui ajoute des **blocs** (gabarits HTML sûrs ou assemblages de blocs du site, données du catalogue comprises),
des **réglages**, des **fonctions activables** et des **textes** FR / EN / AR. Elle ne contient aucun code exécutable.

| Fichier | Rôle |
| --- | --- |
| `GUIDE-EXTENSIONS-IA.md` | Toutes les règles, générées depuis le code (jamais périmées). **À donner à l'IA.** |
| `example/` | Extension d'exemple complète (bandeau, avis, sélection de vidéos, réglages, fonction, textes, CSS). |
| `validate.mjs` | Contrôle un dossier ou un .zip avec les mêmes règles que le site. |
| `build.mjs` | Fabrique le .zip d'un dossier (après contrôle). |
| `generate.mjs` | Régénère `example/` et le guide après une évolution du code. |

## Créer une extension

1. Copier `example/` vers `mon-extension/`, changer `id`, `name`, les blocs.
2. Contrôler : `node api/ext-kit/validate.mjs mon-extension/`
3. Fabriquer : `node api/ext-kit/build.mjs mon-extension/mon-extension.zip`
4. Envoyer le .zip dans Admin → Fonctions → Extensions → « Envoyer une extension » → Installer → Activer.
5. Éditeur visuel → panneau Blocs → groupe « Extensions » : poser les blocs.

Avec une IA : lui donner `GUIDE-EXTENSIONS-IA.md` et `example/`, décrire le bloc voulu, puis lui renvoyer les erreurs du validateur jusqu'à « ✓ ».
