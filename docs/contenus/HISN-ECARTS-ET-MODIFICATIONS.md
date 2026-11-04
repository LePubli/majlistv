# Hisn al-Muslim — ce qui n'a pas été repris et ce qui a été modifié (04/11/2026)

Source : recueil *Hisn al-Muslim* (Sa‘id al-Qahtani) via rn0x/Adhkar-json (arabe voyellé, 132 chapitres) et rn0x/hisn_almuslim_json (renvois). Vérifié par comparaison automatique des 250 entrées fournies avec chaque passage du recueil, puis lecture des écarts.

## A. Formules à dire du recueil NON reprises (à décider)

> Mise à jour 04/11 (lot 12, migration 101) : les chapitres 29, 30 et 31 sont désormais repris (fiche `athkar-nuit.md`). Pour le 31, la source ne donne pas de formule : l'arabe est une mise à la 1re personne faite par l'assistant, à valider ou retirer. Les points 1 à 3 ci-dessous sont conservés à titre d'historique.
1. **Chapitre 29 — quand on se retourne la nuit** : « Lā ilāha illā llāhu l-wāḥidu l-qahhār, rabbu s-samāwāti wa-l-arḍi wa mā baynahumā, al-ʿazīzu l-ghaffār ». Oubli de ma part, non signalé dans les fiches.
2. **Chapitre 30 — frayeur dans le sommeil / solitude** : « Aʿūdhu bi-kalimāti llāhi t-tāmmāti min ghaḍabihi wa ʿiqābihi, wa sharri ʿibādihi, wa min hamazāti sh-shayāṭīni wa an yaḥḍurūn ». Oubli de ma part, non signalé dans les fiches.
3. **Chapitre 31 — rêve** : « Aʿūdhu billāhi mina sh-shayṭāni wa min sharri mā ra'ayt » : texte non repris (la source le noie dans une consigne : cracher à gauche, ne le raconter à personne, changer de côté, prier).
4. **Chapitre 40 / 45 (doute, murmures de Satan)** : consigne de se réfugier auprès d'Allah, appel à la prière : sans formule propre (la formule « J'ai cru en Allah et en Ses messagers » et le verset 57:3 sont repris).

## B. Passages écartés volontairement (consignes, récits, hadiths de mérite sans formule), signalés dans les fiches
- Prière sur le Prophète après l'appel, invocation libre entre l'appel et l'iqama (13). Chapitre 107 (mérite de la prière sur le Prophète) : 5 hadiths sans formule nouvelle.
- Après un péché : ablutions et deux rak‘a (44) ; chapitre 50 (visite du malade) ; 52 (souffler la shahada au mourant) ; 74 (invité qui jeûne) ; 88 (Dajjal) ; 108 (propager le salut) ; 110 et 111 (coq, âne, chiens) ; 116, 120, 121 (takbir à la Pierre noire, au Mash‘ar, aux jamarat : descriptions) ; 123 (prosternation de gratitude) ; 125 (« qu'Allah le bénisse » contre le mauvais œil : la source ne donne que la consigne) ; 129 (hadiths sur l'istighfar sans formule précise, sauf une formule reprise) ; 130 n° 5, 8, 11, 12 (déjà couverts ou pas de formule) ; 131 (façon de compter) ; 132 (bonnes manières).
- « Takbir et tasbih pendant le trajet » (récit de Jabir) : repris dans le lot voyage, à garder ou retirer.
- Sourates As-Sajda et Al-Mulk (sommeil n° 12) : seuls les noms sont donnés, écrits par moi ; le texte des sourates n'est pas repris.

## C. Formules identiques : fusionnées ou écartées pour éviter les doublons (l'application ne garde qu'un dhikr par texte arabe)
- « Au nom d'Allah » (ablutions, vêtement ôté, repas, monture qui trébuche) : une seule entrée ; « Subhanaka Allahumma… » (après les ablutions + fin d'assemblée) ; ‘Arafa = tasbih n° 2 ; colère (« Je cherche refuge auprès d'Allah contre Satan ») ; « Rabbi ighfir lī wa tub ʿalayya » ; répétitions de « Allāhu akbar », « lā ilāha illā llāh », « lā ḥawla wa lā quwwata illā billāh ». Les renvois des autres emplacements ne sont pas tous rattachés à l'entrée restante.

## D. Modifications du texte arabe
1. **Voyelles ajoutées ou corrigées** (la source en oublie ou les place mal) : listes `FIX` (common.py) et `FIX3` (chaque build_*.py), plus de 200 paires au total. Exemples : nabiyyinā, ash-shayṭān, yaʿlamūn, double fatha supprimée, « العظيم → الْعَظِيمِ ». À confirmer par un relecteur.
2. **« ﷺ » développé** : « صلى الله عليه وسلم » remplacé par « صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ » ; « رضي الله عنه » par la forme voyellée.
3. **Parenthèses ((…)) et mentions de répétition « (ثلاثاً) » retirées** ; seul le texte à dire est gardé.
4. **Crochets du recueil (variantes)** : supprimés par défaut ; gardés (sans crochets) quand le contenu fait partie de l'invocation (nuit, inclinaison, qunut, éloge, sacrifice) ; mention en français et dans le renvoi.
5. **Récit du hadith retiré** : seul le dhikr est gardé (« Le Prophète disait : … » est enlevé de l'arabe et passe en français entre parenthèses).
6. **Signes « ! » retirés** (étonnement) ; préfixes « يَقُولُ: » retirés.
7. **Textes « soir » obtenus en remplaçant « matin » par « soir »** dans le texte « matin » (matin/soir) : à confirmer.
8. **Versets** : texte Tanzil (et non celui du recueil) pour matin/soir, sommeil, après la prière ; basmala retirée ou ajoutée à part ; versets dans les autres lots (2:201, 57:3…) pris du recueil.
9. **Un tel** conservé en arabe pour les invocations qui nomment le défunt (le français précise).
10. **Découpages** : « 33-33-33 + une » et « 33-33-34 » en 4 / 3 entrées ; « Astaghfirullah ×3 » séparé de « Allahumma anta s-salam » ; avant le repas en 2 ; éternuement en 3 (arabe tiré du hadith) ; bonne/mauvaise nouvelle en 2 ; invocation de voyage coupée avant « au retour » ; prière funéraire pour un enfant en 2 ; tasbih phrase par phrase avec compteur 100/10 ; naissance en 2 (formule + réponse).
11. **Répétitions** : toutes à 1 sauf tasbih (100 et 10) ; les « trois fois » sont dans le français.

## E. Ajouts qui ne viennent pas du recueil
- **Français** : toutes les traductions sont de l'assistant (versets matin/soir : Hamidullah ; versets des autres lots : traduction de l'assistant, à aligner sur Hamidullah).
- **Phonétique** : générée par règles, sans tajwid.
- **Renvois** : traduits du recueil ; la source ne numérote pas les notes, le rattachement texte ↔ renvoi a été fait en lisant les contenus (la moins sûre : matin/soir n° 18 ; « entrée à la mosquée » non précisée) ; certains renvois sont regroupés ou abrégés (étonnement, tasbih) ; « Formule d'an-Nawawi » pour la naissance : à confirmer.
- **Catégories** : toutes « général » sauf matin, soir, après la prière, sommeil (pas de catégorie réveil, prière, voyage, etc.).
- Noms de sourates (As-Sajda, Al-Mulk) et intitulés de chapitres en français : de l'assistant.

## F. À faire
1. Faire relire (en particulier l'entrée « rêve » du lot 12) un savant : arabe, français, renvois, découpages.
