# Problèmes à régler — registre suivi à chaque étape

Règle d'Epok (17/10/2026) : **garder une trace de chaque problème constaté et le régler en même temps que les « go » suivants.**
À chaque étape : relire ce registre, régler ce qui peut l'être avec l'étape, mettre à jour l'état ici, le dire dans le compte rendu.

États : 🔴 à régler · 🟡 en attente d'une décision ou d'un essai réel · ✅ réglé (avec l'étape et la date).

## Ouverts

| # | Constaté | Problème | Effet | Proposition | État |
|---|---|---|---|---|---|
| 1 | E1, 17/10 | Test de retrait des modules (`api/tests/test_module_removal.py`) : le contrôle « Stripe : remboursement traité » répond 503 pour **tous** les modules. Cause : la base de test locale n'a pas les prix Stripe réglés (`stripe_price_monthly`, `stripe_price_yearly`) : l'API répond « Le paiement n'est pas configuré ». | Test seulement, pas le site en ligne. Mais le contrôle ne vérifie plus rien. | Le test règle lui-même des prix Stripe factices (faux serveur Stripe `mock_stripe.py`) au début et les remet comme avant à la fin. | 🔴 à régler à l'étape E2 |
| 2 | S3, 17/10 | `api/tests/test_stats.py` (quiz Kids) échoue sur la base de test locale à cause d'anciennes données laissées par d'autres tests. | Test seulement. | Rendre le test indépendant des données existantes (ses propres conférences et profils, nettoyés à la fin). | 🔴 à régler à l'étape E2 |
| 3 | S2, 17/10 | Quand le service de doublage efface d'anciennes écoutes de 60 s déjà archivées, leur copie d'archive reste chez le fournisseur (PlanetHoster). | Un peu de place perdue chez le fournisseur, pas de panne. | À la suppression, le service prévient l'API, qui efface aussi la copie d'archive. | 🔴 à régler avec E4 (remplacement et archivage des originaux) |
| 4 | M3b → E1, 17/10 | Les modules **sans fonction associée** (Doublage, Stockage, Éditeur) gardent leur entrée dans le menu du Studio quand ils sont désactivés. La page explique alors que le module est désactivé. Le site ne lit pas encore l'état des modules (`/config` → `modules`). | Entrée visible mais inutile pour un organisateur. | Le site lit `modules` dans `/config` et masque l'entrée du menu (et les liens) d'un module désactivé. | 🔴 à régler à l'étape E2 |
| 5 | D2, E1 | Lecture vidéo H.264 jamais testée automatiquement : le Chromium de test ne lit que le VP9. Concerne le lecteur avec version française (D2) et l'aperçu de l'éditeur (E1). | Risque faible : même lecteur hls.js que le reste du site. | Essai réel d'Epok dans Chrome / Firefox / Safari après déploiement. | 🟡 essai réel |
| 6 | D2, E1 | Pas d'essai sur un vrai téléphone (iPhone notamment), ni sur une tablette tactile pour l'éditeur. | — | Essai réel d'Epok. | 🟡 essai réel |
| 7 | E1, 17/10 | Éditeur jamais essayé sur une vraie conférence d'une heure (milliers de phrases, fluidité de la timeline). | — | Essai réel après déploiement d'E1 ; les phrases hors écran ne sont déjà pas dessinées. | 🟡 essai réel |
| 8 | 0 bis, 16/10 | Voix « Tom » (Piper fr_FR-tom-medium) : licence à valider avec l'auteur avant un service payant. | Juridique. | Écrire à l'auteur, ou changer de voix en D3. | 🟡 décision d'Epok |
| 9 | Cadrage | Module `studio` (nouveau Studio activable, ancien Studio si désactivé) non fait : depuis l'étape D, le nouveau Studio est le seul. | — | Confirmer avec Epok que ce n'est plus voulu. | 🟡 décision d'Epok |

## Réglés

| # | Problème | Réglé à | Comment |
|---|---|---|---|
| — | — | — | — |
