# Problèmes à régler — registre suivi à chaque étape

Règle d'Epok (17/10/2026) : **garder une trace de chaque problème constaté et le régler en même temps que les « go » suivants.**
À chaque étape : relire ce registre, régler ce qui peut l'être avec l'étape, mettre à jour l'état ici, le dire dans le compte rendu.

États : 🔴 à régler · 🟡 en attente d'une décision ou d'un essai réel · ✅ réglé (avec l'étape et la date).

## Ouverts

| # | Constaté | Problème | Effet | Proposition | État |
|---|---|---|---|---|---|
| 3 | S2, 17/10 | Quand le service de doublage efface d'anciennes écoutes de 60 s déjà archivées, leur copie d'archive reste chez le fournisseur (PlanetHoster). | Un peu de place perdue chez le fournisseur, pas de panne. | À la suppression, le service prévient l'API, qui efface aussi la copie d'archive. | 🔴 à régler avec E4b (remplacement et archivage des originaux) |
| 5 | D2, E1 | Lecture vidéo H.264 jamais testée automatiquement : le Chromium de test ne lit que le VP9. Concerne le lecteur avec version française (D2) et l'aperçu de l'éditeur (E1). | Risque faible : même lecteur hls.js que le reste du site. | Essai réel d'Epok dans Chrome / Firefox / Safari après déploiement. | 🟡 essai réel |
| 6 | D2, E1 | Pas d'essai sur un vrai téléphone (iPhone notamment), ni sur une tablette tactile pour l'éditeur. | — | Essai réel d'Epok. | 🟡 essai réel |
| 7 | E1, 17/10 | Éditeur jamais essayé sur une vraie conférence d'une heure (milliers de phrases, fluidité de la timeline). | — | Essai réel après déploiement d'E1 ; les phrases hors écran ne sont déjà pas dessinées. | 🟡 essai réel |
| 8 | 0 bis, 16/10 | Voix « Tom » (Piper fr_FR-tom-medium) : licence à valider avec l'auteur avant un service payant. | Juridique. | Écrire à l'auteur, ou changer de voix en D3. | 🟡 décision d'Epok |
| 9 | Cadrage | Module `studio` (nouveau Studio activable, ancien Studio si désactivé) non fait : depuis l'étape D, le nouveau Studio est le seul. | — | Confirmer avec Epok que ce n'est plus voulu. | 🟡 décision d'Epok |
| 10 | E2, 18/10 | Réduction du bruit (afftdn de FFmpeg, réglages « légère » et « forte ») jamais essayée sur une vraie voix bruitée. | Réglage peut-être trop faible ou trop fort. | Essai à l'oreille d'Epok avec les boutons « Sans / Avec réduction » ; ajuster les réglages avant E4. | 🟡 essai réel |
| 11 | E2, 18/10 | Les analyses du son tournent dans le conteneur de l'API (FFmpeg) : sur une conférence d'une heure, environ 1 min de calcul, non mesurée sur le VPS, avec les limites de `apply-limits.sh`. | L'API pourrait ralentir pendant une analyse. | Mesurer après déploiement (`docker stats dockpanel-git-majlistv-api` pendant une analyse) ; si besoin, déplacer l'analyse vers le worker en E4. | 🟡 essai réel |
| 12 | E3, 19/10 | Image finale (FFmpeg) jamais testée avec une vraie vidéo H.264 du VPS ni dans l'image Docker (polices DejaVu, FFmpeg d'Alpine). | Risque faible : image vide ou sans lettres arabes liées. | Essai réel après déploiement d'E3 (« Voir l'image finale » sur une vraie conférence). | 🟡 essai réel |
| 13 | E3, 19/10 | Transition « dissolution » non faite (seulement coupe, fondu au noir, fondu au blanc). Une seule police (DejaVu Sans). | Choix limité. | À ajouter en E4 si besoin (rendu), polices de marque sur demande. | 🟡 décision |
| 14 | E3, 19/10 | Chaque image finale lance FFmpeg dans le conteneur de l'API (2 à la fois au plus). | Charge ponctuelle sur le VPS partagé. | Surveiller après déploiement ; limite déjà posée. | 🟡 à surveiller |
| 15 | E3, 19/10 | Les logos et modèles sont communs à l'organisation : un organisateur peut supprimer un logo qu'il a importé (pas celui des autres, sauf administrateur). | Choix de confidentialité à valider. | Confirmer avec Epok. | 🟡 décision |
| 18 | E4a, 19/10 | Rendu jamais lancé dans l'image Docker du worker (FFmpeg d'Alpine : libass, amultiply, loudnorm ; polices copiées dans /app/fonts) ni sur une vraie conférence d'une heure (temps, disque de /work, mémoire). | Un premier rendu réel pourrait échouer (message affiché) ou être lent. | Après déploiement : commandes de vérification du README (Étape E4a), puis un aperçu rapide et un rendu final d'une vraie conférence ; noter le temps (« calculé en … »). | 🟡 essai réel |
| 19 | E4a, 19/10 | Lecture du fichier rendu (H.264/AAC) dans un vrai navigateur jamais testée automatiquement (Chromium de test sans H.264). | Risque faible (MP4 standard, « faststart »). | Essai réel : « Regarder » puis « Télécharger ». | 🟡 essai réel |
| 20 | E4a, 19/10 | Un rendu est limité à 120 passages (un fichier source ouvert par passage dans FFmpeg) ; les extraits qui se suivent sans transition sont regroupés. | Un montage très découpé est refusé avec un message clair. | Si le besoin apparaît : rendu en plusieurs morceaux assemblés. | 🟡 à surveiller |

## Réglés

| # | Problème | Réglé à | Comment |
|---|---|---|---|
| 1 | Test de retrait des modules : contrôle Stripe en 503 (prix Stripe absents de la base de test) | E2, 18/10 | Le test règle des prix factices (connus du faux serveur Stripe) puis remet les réglages d'avant ; contrôle vérifié : 0 échec. |
| 2 | `test_stats.py` (quiz Kids) faussé par les anciennes données de la base de test | E2, 18/10 | Mesure en écart avant / après l'ajout des essais ; « TOUT OK ». |
| 4 | Modules sans fonction associée encore visibles dans les menus une fois désactivés | E2, 18/10 | Le site lit l'état des modules (`/config` → `modules`) : l'organisateur ne voit plus l'entrée ni les liens ; l'administrateur garde l'entrée et la page l'invite à activer le module. Testé dans `web/tests/e2_audio.py`. |
| 16 | Versions automatiques : l'enregistrement d'une version ignorait les changements de son et d'habillage (comparaison des seuls extraits) | E3, 19/10 | La comparaison porte sur extraits + audio + habillage. |
| 17 | Studio → Activité : mettre en pause une analyse du son (file « editor », étape E2) échouait dans la base (file inconnue de la contrainte de la table activity_controls) | E4a, 19/10 | Migration editor/004_render.sql : la contrainte accepte « editor » et « render » ; vérifié dans test_editor_e4a.py. |
