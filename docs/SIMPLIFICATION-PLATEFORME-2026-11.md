# Simplification de toute la plateforme — proposition du 15/11/2026 (À VALIDER par Epok)

Base : lecture du code au 15/11 (commit c69840c), tableau du parcours https://claude.ai/artifact/2vZVMRUyvMGswUgwyRpZnG,
proposition de navigation validée le 11/11 (claude/NAVIGATION-PROPOSITION-2026-11.md). Aucun essai avec de vrais utilisateurs,
aucun chiffre d'usage : regarder Admin → Statistiques avant de retirer quoi que ce soit.

## Constat
Depuis la décision du 11/11 (5 destinations), la plateforme a de nouveau grossi : TV en direct (14/11) et Kids sont dans le
menu principal (7 entrées), « Mon compte » a jusqu'à 9 onglets, la bibliothèque 6, Apprendre 4 onglets et 8 sections,
il existe 4 façons de payer, et certaines informations (révisions du jour, bloc « Aujourd'hui ») s'affichent à 3 ou 5 endroits.

## Trois règles
1. **Une promesse** : « Des conférences qui éclairent » — regarder, comprendre, retenir, pratiquer.
2. **Une seule maison par fonction** : chaque chose a un endroit principal ; ailleurs, au plus un lien vers lui.
3. **Les mêmes mots partout** : site, application et télé.

## Proposition, rubrique par rubrique
| Rubrique | Aujourd'hui | Proposé |
|---|---|---|
| Menu principal | 7 entrées | Retour aux 5 : Accueil · Catalogue · Apprendre · Pratique · Bibliothèque. Kids = bouton coloré, compte = avatar. TV en direct va dans le Catalogue. |
| Accueil | ~12 bandes possibles (à réviser, quiz à rattraper, reprendre, plus tard, événements, saisons, vendredi, Kids, citation…) | Un job : reprendre et découvrir. Une carte « À faire aujourd'hui » (lien vers Apprendre), « Reprendre », puis les rangées. Une seule bande de saison à la fois ; événements seulement s'il y en a un. |
| Catalogue | Rangées par format ; Séries, Shorts, Audio, Ouvrages, Chaînes, Événements surtout dans le menu latéral | Tout ce qui se regarde ou s'écoute, avec des puces en haut : Tout · Séries · Shorts · Audio · Ouvrages · Chaînes · En direct (TV + événements). Catégories en filtres. |
| Page vidéo | Quiz, pratique, notes, questions IA, références, ouvrages, encart abonnement ou achat | Toujours le même ordre : regarder → quiz → « que faire maintenant ? ». Sous le lecteur : 3 onglets (À propos · Notes · Questions). Un seul encart de paiement. |
| Apprendre | 4 onglets, 8 sections | 3 onglets sans sous-onglets : Aujourd'hui (actions du jour + « Voir ma semaine ») · Réviser (quiz + cartes en une séance) · Mes progrès (séries, engagements, bilan, attestations). |
| Pratique | 4 cartes + bloc Aujourd'hui | 4 cartes (Prière, Coran, Adhkar, Ramadan en saison). Les réglages de prière quittent « Mon compte » pour la page Prière. |
| Bibliothèque | 6 onglets | 4 : Reprendre · Ma liste (Favoris + À regarder plus tard) · Listes · Notes. « Chaînes suivies » → Catalogue → Chaînes. |
| Mon compte | jusqu'à 9 onglets | 3 : Profil (avec sécurité et mes données) · Abonnement et achats (abonnement, mes achats, cartes cadeaux, parrainage) · Notifications. |
| Payer | Standard, Apprentissage, achat/location, carte cadeau | Page Tarifs : seulement les 2 formules. Achat à l'unité seulement sur la page du contenu. Carte cadeau : lien « Offrir » (pied de page, compte). |
| Kids | Espace séparé | Inchangé. |
| Studio / Admin | Déjà regroupés le 11/11 | Inchangés (outils de l'équipe, pas du public). |

## Fonctions à remettre en question (décision d'Epok, après 4 semaines de statistiques)
Publicité au lancement de l'application (sur une plateforme payante), Tests A/B, Collections (doublon des rangées), Shorts.
Les éteindre dans Admin → Fonctions suffit : rien n'est supprimé.

## Lots (chacun sur « go »)
- **N1** Menu à 5 + « En direct » dans le Catalogue (site et application). Risque faible.
- **N2** Apprendre en 3 onglets (= L1 ; L2 séance de révision unique ensuite).
- **N3** Accueil allégé.
- **N4** Catalogue avec puces.
- **N5** Bibliothèque en 4 onglets, Compte en 3.
- **N6** Page vidéo.
- **N7** Application téléphone et télé alignées.
Les anciennes adresses continuent de fonctionner à chaque lot.

## Décisions attendues
1. TV en direct dans le Catalogue (onglet « En direct ») plutôt que dans le menu ?
2. Barre du bas : « Bibliothèque » (site) ou « Compte » (application depuis le 13/11) ? Il faut la même partout.
3. Fusionner Favoris et À regarder plus tard en « Ma liste » ?
4. Garder la publicité au lancement de l'application ?
5. Ordre des lots (recommandé : N1, N2, N3, puis N4 à N7).
