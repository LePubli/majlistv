# Diagnostic du stockage N0C Storage (PlanetHoster) — étape 0

**But.** Savoir, par un essai réel, si le stockage S3 de PlanetHoster (« N0C Storage ») peut diffuser les vidéos de Mejliss TV
à la place de Garage (le disque du VPS est presque plein). **Rien n'est modifié** sur le site : le script n'écrit que dans un
dossier `_mejliss-check/` du bucket et l'efface à la fin.

## Ce que le script vérifie (avec le même client que l'API : signature V4, adressage par chemin)
| # | Test | Pourquoi c'est indispensable |
|---|------|------------------------------|
| 1-3 | Connexion, liste, envoi, lecture | Les identifiants et l'adresse sont bons ; le VPS atteint `ht2-storage.n0c.com:5443` |
| 4 | Lecture partielle (Range) | Le lecteur vidéo lit par morceaux |
| 5 | Lien temporaire signé V4 | L'API protège les vidéos (premium, aperçu de 2 min) avec des liens signés. Des retours d'utilisateurs signalent que N0C Storage refuse parfois la signature V4 (`SignatureDoesNotMatch`) : c'est LE point à confirmer |
| 6 | CORS | Le navigateur du site doit pouvoir lire les fichiers HLS venant d'un autre domaine |
| 7 | Envoi en plusieurs parties | Les grosses vidéos |
| 8 | Copie interne | Utilisée par l'éditeur |
| 9 | Débit depuis le VPS | Durée de la future copie des vidéos existantes |
| 10 | Adresse publique (facultatif) | Autre mode de diffusion : `https://<votre domaine>/n0c-storage/…` (lisible par tout le monde) |

## Lancement (depuis le VPS)
1. GitHub Desktop → **Pull origin** pour récupérer `ops/n0c/check.mjs`.
2. Depuis WSL, copier le script sur le VPS (remplacez `IP_DU_VPS`) :
   ```bash
   scp /mnt/c/Users/agenc/Documents/GitHub/majlistv/ops/n0c/check.mjs root@IP_DU_VPS:/root/n0c-check.mjs
   ```
3. Sur le VPS (la clé secrète se tape sans s'afficher ; ne la collez jamais dans une conversation) :
   ```bash
   read -rp "Clé d'accès N0C : " N0C_KEY
   read -rsp "Clé secrète N0C : " N0C_SECRET; echo
   docker exec -i \
     -e N0C_ENDPOINT=https://ht2-storage.n0c.com:5443 \
     -e N0C_REGION=ht2-storage \
     -e N0C_BUCKET=yuxzzjad \
     -e N0C_KEY="$N0C_KEY" -e N0C_SECRET="$N0C_SECRET" \
     dockpanel-git-majlistv-api node --input-type=module - < /root/n0c-check.mjs
   unset N0C_KEY N0C_SECRET
   ```
   Facultatif, pour tester l'adresse publique, ajoutez `-e N0C_PUBLIC_BASE=https://<votre-domaine>/n0c-storage` (l'adresse affichée dans l'écran N0C Storage, avec votre vrai domaine).
4. Copiez le résultat complet dans la conversation (il ne contient pas la clé secrète).

## Lecture du résultat
- **Tout réussi (1 à 9)** : N0C Storage peut remplacer Garage sans changer le mode de protection des vidéos.
- **5 échoue** (signature) : les liens signés ne marchent pas ; il faudra soit un lien public (moins protégé), soit faire passer la lecture par notre serveur.
- **6 échoue** (CORS) : à régler côté PlanetHoster (support) ou en servant les fichiers par un domaine de confiance.
- **1 échoue** : identifiants, pare-feu (le VPS n'atteint pas le port 5443) ou stockage réservé aux sites hébergés chez N0C.
- **10 réussit** : la diffusion publique est possible mais **n'importe qui avec l'adresse lit la vidéo** (pas de verrou premium / aperçu).

## Sécurité
Les clés N0C ne vont jamais dans le dépôt. Si la clé secrète a été montrée ou collée quelque part, utilisez « Réinitialiser l'accès à N0C Storage » dans le panneau PlanetHoster.
