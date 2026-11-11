# Navigation et parcours — proposition du 11/11/2026 (audit, étape 5) — À VALIDER PAR EPOK, aucun code écrit

Page de présentation (constats, écrans avant / après, lots, décisions) : https://claude.ai/artifact/2ajhEdcydv2Pq2zgQdmpmU

## Base de l'analyse
Lecture du code des menus (site, Studio, Admin, application) et 38 captures du site en local (1280 px et 390 px, français, base de test).
Non vu : arabe, vrai téléphone, application installée. Aucun chiffre d'usage réel : regarder Admin → Statistiques avant de retirer une entrée.

## Constats
1. Site, membre connecté : deux menus à la fois (6 liens en haut + menu latéral de 5 groupes : 12 + 6 + 4 + 3 + 2 liens, plus les catégories). Accueil, Catalogue, Séries dans les deux ; « Coran » deux fois dans le menu latéral.
2. Page d'une vidéo : le menu latéral reste à côté du lecteur.
3. Apprendre : deux vocabulaires (menu latéral : Mon parcours, Coran, Adhkar, Quiz et révision, Mes engagements, Mon bilan ; onglets de la page : Aujourd'hui, Mon planning, Coran et athkar, Vidéos, Mes progrès).
4. Téléphone : barre du site (Accueil, Catalogue, Séries, Apprendre, Kids) ≠ barre de l'application (Accueil, Catalogue, Apprendre, Bibliothèque, Compte).
5. Studio : 8 entrées de la maquette + 6 ajoutées par les modules à la suite (Audyn, Corrections de sous-titres, Événements, Références, Shorts, Modération).
6. Admin : 31 écrans en 4 groupes ; « Catalogue » en contient 14 (dont publicités, tests A/B, cartes cadeaux, parrainage, régions, saisons, vendredi, adhkar, ramadan, coran).
7. Kids : l'écran « Qui regarde ? » garde l'en-tête adulte.

## Proposition
Cinq destinations, identiques sur ordinateur, site téléphone et application : **Accueil · Explorer · Apprendre · Pratique · Bibliothèque**. Kids (bouton coloré) et le compte (avatar) restent en haut.
- Explorer : Vidéos, Séries, Shorts, Collections, Chaînes, Audio, Ouvrages, En direct en onglets ; catégories en filtres.
- Apprendre : Mon parcours, Quiz et révisions, Mes engagements, Mon bilan.
- Pratique (nouveau) : Prière, Coran, Adhkar, Ramadan (en saison).
- Bibliothèque : Favoris, À voir plus tard, Listes, Notes, Chaînes suivies, Téléchargements.
- Menu latéral = sous-menu de la rubrique ouverte ; aucun menu latéral sur la page d'une vidéo.
- Studio en 5 groupes (Tableau de bord, Contenus, Production, Audience, Paramètres) ; Admin en 6 (Pilotage, Catalogue, Pratique et saisons, Croissance, Site, Technique). Mêmes écrans, mêmes adresses.
- Kids : en-tête dédié dès « Qui regarde ? » ; couleurs et logos inchangés.

## Lots (chacun sur « go »)
A Studio et Admin regroupés · B en-tête Kids · C vocabulaire d'Apprendre · D page Explorer · E rubrique Pratique + menu à 5 · F menu latéral lié à la rubrique, lecteur pleine largeur · G même barre sur le site téléphone et l'application.
A à C : sans changement d'adresse, risque faible. D à G : risque moyen.

## Décisions attendues
1. Les cinq destinations ? 2. « Explorer » ou « Catalogue » ? 3. « Pratique » séparée d'« Apprendre » ? 4. Kids hors de la barre du bas sur téléphone ? 5. Par quel lot commencer (recommandé : A, B, C) ?
