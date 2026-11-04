# Dhikr du pèlerinage et du tasbih — fiche de relecture

19 entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.

## Ce qu’il faut vérifier

1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.
2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.
3. **Choix de l’assistant** : seules les formules à dire sont reprises. Non repris : l’invocation du jour de ‘Arafa (même texte que le tasbih n° 2, mentionnée dans son renvoi) ; les descriptions sans formule (takbir à la Pierre noire, au Mash‘ar al-Haram, aux jamarat), la crainte du mauvais œil (consigne), la prosternation de gratitude, les hadiths sur l’istighfar sans formule précise, la manière de compter le tasbih, les dernières « bonnes manières ». Plusieurs formules existent peut-être déjà ailleurs (matin et soir) : l’application écarte les doublons exacts. Chaque phrase du tasbih est une entrée à part, avec le compteur du hadith (100 ou 10) quand il est donné.
4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).
5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; certains renvois sont abrégés ou regroupent des formules ; le renvoi d’origine en arabe est donné sous chaque entrée.
6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment la talbiya, le texte sur as-Safa et la prière contre les démons rebelles). **Phonétique** : générée par règles, sans tajwid.

## Les invocations

### Talbiya du pèlerin n° 1

**Arabe** : لَبَّيْكَ اللَّهُمَّ لَبَّيْكَ، لَبَّيْكَ لاَ شَرِيكَ لَكَ لَبَّيْكَ، إِنَّ الْحَمْدَ، وَالنِّعْمَةَ، لَكَ وَالْمُلْكَ، لاَ شَرِيكَ لَكَ

**Phonétique** : Labbayka llahoumma labbayka, labbayka la charika laka labbayka, inna l-hamda, wan-niʿmata, laka wal-moulka, la charika lak

**Français** : Me voici, ô Allah, me voici ; me voici, Tu n’as aucun associé, me voici. Certes, la louange, le bienfait et la royauté T’appartiennent ; Tu n’as aucun associé. (talbiya du pèlerin en ‘umra ou en hajj)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Talbiya du pèlerin », invocation n° 1. Al-Bukhari, Fath al-Bari 3/408 ; Muslim 2/841.

*Renvoi d’origine (arabe)* : البخاري مع الفتح 3/ 408 ، ومسلم 2/841

### Entre le coin yéménite et la Pierre noire n° 1

**Arabe** : رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ

**Phonétique** : Rabbana atina fi d-dounya hasanatan wafi l-’akhirati hasanatan waqina ʿadhaba n-nar

**Français** : Notre Seigneur, accorde-nous une belle part ici-bas et une belle part dans l’au-delà, et protège-nous du châtiment du Feu. (Coran 2:201 ; à dire entre le coin yéménite et la Pierre noire)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Entre le coin yéménite et la Pierre noire », invocation n° 1. Abu Dawud 2/179 ; Ahmad 3/411 ; al-Baghawi, Sharh as-sunna 7/128 ; jugé hassan par al-Albani (Sahih Abi Dawud 1/354) ; le verset est tiré de sourate al-Baqara, 201.

*Renvoi d’origine (arabe)* : أبو داود 2/ 179 وأحمد 3/411 والبغوي في شرح السنة 7/128 ،وحسنه الألباني في صحيح أبي داود 1/ 354 ، والآية من سورة البقرة ، 201

### Sur as-Safa et al-Marwa n° 1

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ، أَنْجَزَ وَعْدَهُ، وَنَصَرَ عَبْدَهُ، وَهَزَمَ الْأَحْزَابَ وَحْدَهُ

**Phonétique** : La ilaha illa llahou wahdahou la charika lahou, lahou l-moulkou walahou l-hamdou wahouwa ʿala koulli chay’in qadiroun, la ilaha illa llahou wahdahou, andjaza waʿdahou, wanasara ʿabdahou, wahazama l-ahzaba wahdah

**Français** : Il n’y a de divinité qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est capable de toute chose. Il n’y a de divinité qu’Allah, Seul : Il a tenu Sa promesse, secouru Son serviteur et mis en déroute les coalisés à Lui seul. (le Prophète le disait trois fois sur as-Safa, en invoquant entre chaque fois, puis faisait de même sur al-Marwa)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Sur as-Safa et al-Marwa », invocation n° 1. Muslim 2/888 (longue description du hajj du Prophète).

*Renvoi d’origine (arabe)* : مسلم 2/888

### Étonnement et nouvelle réjouissante n° 1

**Arabe** : سُبْحَانَ اللَّهِ

**Phonétique** : Soubhana llah

**Français** : Gloire à Allah ! (à dire par étonnement)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Étonnement et nouvelle réjouissante », invocation n° 1. Al-Bukhari, Fath al-Bari 1/210, 1/390, 1/414 et 8/441 ; Muslim 4/1857 (renvois du chapitre, regroupés).

*Renvoi d’origine (arabe)* : البخاري مع الفتح 1/210 و390 و414 ومسلم 4/ 1857

### Étonnement et nouvelle réjouissante n° 2

**Arabe** : اللَّهُ أَكْبَرُ

**Phonétique** : Allahou akbar

**Français** : Allah est le plus grand ! (à dire par étonnement)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Étonnement et nouvelle réjouissante », invocation n° 2. Al-Bukhari, Fath al-Bari 1/210, 1/390, 1/414 et 8/441 ; Muslim 4/1857 (renvois du chapitre, regroupés).

*Renvoi d’origine (arabe)* : البخاري الفتح8/ 441 وانظر صحيح الترمذي 2/103 و2/235 ومسند أحمد 5/ 218

### Douleur dans le corps n° 1

**Arabe** : أَعُوذُ بِاللَّهِ وَقُدْرَتِهِ مِنْ شَرِّ مَا أَجِدُ وَأُحَاذِرُ

**Phonétique** : Aʿoudhou billahi waqoudratihi min charri ma adjidou wa’ouhadhir

**Français** : Je cherche refuge auprès d’Allah et de Sa puissance contre le mal de ce que je ressens et de ce que je crains. (hadith : poser la main sur l’endroit douloureux, dire « Au nom d’Allah » trois fois, puis cette invocation sept fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Douleur dans le corps », invocation n° 1. Muslim 4/1728.

*Renvoi d’origine (arabe)* : مسلم 4/1728

### Frayeur n° 1

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ

**Phonétique** : La ilaha illa llah

**Français** : Il n’y a de divinité qu’Allah ! (à dire en cas de frayeur)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Frayeur », invocation n° 1. Al-Bukhari, Fath al-Bari 6/181 ; Muslim 4/2208.

*Renvoi d’origine (arabe)* : البخاري مع الفتح 6/ 181 ، ومسلم 4/ 2208

### À l’égorgement du sacrifice n° 1

**Arabe** : بِسْمِ اللَّهِ وَاللَّهُ أَكْبَرُ اللَّهُمَّ مِنْكَ وَلَكَ اللَّهُمَّ تَقَبَّلْ مِنِّي

**Phonétique** : Bismi llahi wallahou akbarou llahoumma minka walaka llahoumma taqabbal minni

**Français** : Au nom d’Allah, Allah est le plus grand [Ô Allah, cela vient de Toi et c’est pour Toi]. Ô Allah, accepte-le de ma part. (à dire en égorgeant)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « À l’égorgement du sacrifice », invocation n° 1. Muslim 3/1557 ; al-Bayhaqi 9/287 (qui ajoute la partie entre crochets).

*Renvoi d’origine (arabe)* : مسلم 3/1557 والبيهقي 9/287 وما بين المعكوفين للبيهقي 9/287 وغيره والجملة الأخيرة سقتها بالمعنى من رواية مسلم

### Contre les démons rebelles n° 1

**Arabe** : أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ الَّتِي لاَ يُجَاوِزُهُنَّ بَرٌّ وَلاَ فَاجِرٌ: مِنْ شَرِّ مَا خَلَقَ، وَبَرَأَ وَذَرَأَ، وَمِنْ شَرِّ مَا يَنْزِلُ مِنَ السَّمَاءِ، وَمِنْ شَرِّ مَا يَعْرُجُ فِيهَا، وَمِنْ شَرِّ مَا ذَرَأَ فِي الْأَرْضِ، وَمِنْ شَرِّ مَا يَخْرُجُ مِنْهَا، وَمِنْ شَرِّ فِتَنِ اللَّيْلِ وَالنَّهَارِ، وَمِنْ شَرِّ كُلِّ طَارِقٍ إِلاَّ طَارِقاً يَطْرُقُ بِخَيْرٍ يَا رَحْمَنُ

**Phonétique** : Aʿoudhou bikalimati llahi t-tammati-llati la youdjawizouhounna barroun wala fadjiroun, min charri ma khalaqa, wabara’a wadhara’a, wamin charri ma yanzilou mina s-sama’i, wamin charri ma yaʿroudjou fiha, wamin charri ma dhara’a fi l-ardi, wamin charri ma yakhroudjou minha, wamin charri fitani llayli wan-nahari, wamin charri koulli tariqin illa tariqan yatrouqou bikhayrin ya rahman

**Français** : Je cherche refuge dans les paroles parfaites d’Allah, que ni le pieux ni le pervers ne peuvent transgresser : contre le mal de ce qu’Il a créé, façonné et fait naître ; contre le mal de ce qui descend du ciel et de ce qui y monte ; contre le mal de ce qu’Il a fait naître sur la terre et de ce qui en sort ; contre le mal des épreuves de la nuit et du jour, et le mal de tout visiteur nocturne, sauf celui qui vient avec du bien, ô Tout-Miséricordieux.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Contre les démons rebelles », invocation n° 1. Ahmad 3/419, chaîne authentique ; Ibn as-Sunni n° 637 ; Majma‘ az-zawa’id 10/127. La dernière phrase est rapportée par le sens d’après Muslim.

*Renvoi d’origine (arabe)* : أحمد 3/419 بإسناد صحيح وابن السني برقم 637 وصحح إسناده الأرناؤوط في تخريجه للطحاوية ص 133 وانظر مجمع الزوائد 10/ 127

### Demander pardon à Allah n° 1

**Arabe** : أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ الَّذِي لاَ إِلَهَ إِلاَّ هُوَ الْحَيُّ الْقَيُّومُ وَأَتُوبُ إِلَيْهِ

**Phonétique** : Astaghfirou llaha l-ʿadhima-lladhi la ilaha illa houwa l-hayyou l-qayyoumou wa’atoubou ilayh

**Français** : Je demande pardon à Allah, l’Immense, il n’y a de divinité que Lui, le Vivant, Celui qui subsiste par Lui-même, et je me repens à Lui. (hadith : celui qui le dit, Allah lui pardonne, même s’il a fui le combat)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Demander pardon à Allah », invocation n° 1. Abu Dawud 2/85 ; at-Tirmidhi 5/569 ; al-Hakim 1/511 (jugé authentique, adh-Dhahabi d’accord) ; Sahih at-Tirmidhi 3/182.

*Renvoi d’origine (arabe)* : أخرجه أبو داود 2/85 والترمذي 5/569 والحاكم وصححه ووافقه الذهبي 1/511 وصححه الألباني . انظر صحيح الترمذي 3/182 وجامع الأصول لأحاديث الرسول صلى الله عيه وسلم 4/389 – 390 بتحقيق الأرناؤوط

### Mérite de la glorification, de la louange, de l’unicité et du takbir n° 1

**Arabe** : سُبْحَانَ اللَّهِ وَبِحَمْدِهِ

**Phonétique** : Soubhana llahi wabihamdih

**Français** : Gloire à Allah et par Sa louange. (hadith : celui qui le dit cent fois dans la journée, ses fautes sont effacées, fussent-elles comme l’écume de la mer)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Mérite de la glorification, de la louange, de l’unicité et du takbir », invocation n° 1. Al-Bukhari 7/168 ; Muslim 4/2071.

*Renvoi d’origine (arabe)* : البخاري 7/168 ومسلم 4/ 2071 ، وانظر :فضل من قالها مائة مرة إذا أصبح وإذا أمسى

### Mérite de la glorification, de la louange, de l’unicité et du takbir n° 2

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ

**Phonétique** : La ilaha illa llahou wahdahou la charika lahou, lahou l-moulkou walahou l-hamdou wahouwa ʿala koulli chay’in qadir

**Français** : Il n’y a de divinité qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est capable de toute chose. (hadith : celui qui le dit dix fois est comme celui qui a affranchi quatre âmes parmi les descendants d’Ismaël)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Mérite de la glorification, de la louange, de l’unicité et du takbir », invocation n° 2. Al-Bukhari 7/67 ; Muslim 4/2071. Le même texte est dit le jour de ‘Arafa (at-Tirmidhi, jugé hassan : « la meilleure invocation est celle du jour de ‘Arafa, et le meilleur de ce que j’ai dit, moi et les prophètes avant moi »).

*Renvoi d’origine (arabe)* : البخاري 7/67 ومسلم بلفظه 4/2071 وانظر فضل من قالها في اليوم مائة مرة

### Mérite de la glorification, de la louange, de l’unicité et du takbir n° 3

**Arabe** : سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ

**Phonétique** : Soubhana llahi wabihamdihi, soubhana llahi l-ʿadhim

**Français** : Gloire à Allah et par Sa louange ; gloire à Allah, l’Immense. (hadith : deux paroles légères sur la langue, lourdes dans la balance, aimées du Tout-Miséricordieux)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Mérite de la glorification, de la louange, de l’unicité et du takbir », invocation n° 3. Al-Bukhari 7/167 ; Muslim 4/2072.

*Renvoi d’origine (arabe)* : البخاري 7/167ومسلم 4/2072

### Mérite de la glorification, de la louange, de l’unicité et du takbir n° 4

**Arabe** : سُبْحَانَ اللَّهِ، وَالْحَمْدُ لِلَّهِ، وَلاَ إِلَهَ إِلاَّ اللَّهُ، وَاللَّهُ أَكْبَرُ

**Phonétique** : Soubhana llahi, wal-hamdou lillahi, wala ilaha illa llahou, wallahou akbar

**Français** : Gloire à Allah, louange à Allah, il n’y a de divinité qu’Allah, et Allah est le plus grand. (hadith : « Les dire m’est plus cher que tout ce sur quoi le soleil se lève »)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Mérite de la glorification, de la louange, de l’unicité et du takbir », invocation n° 4. Muslim 4/2072.

*Renvoi d’origine (arabe)* : مسلم 4/2072

### Mérite de la glorification, de la louange, de l’unicité et du takbir n° 5

**Arabe** : سُبْحَانَ اللَّهِ الْعَظِيمِ وَبِحَمْدِهِ

**Phonétique** : Soubhana llahi l-ʿadhimi wabihamdih

**Français** : Gloire à Allah, l’Immense, et par Sa louange. (hadith : un palmier est planté au Paradis pour celui qui le dit)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Mérite de la glorification, de la louange, de l’unicité et du takbir », invocation n° 5. At-Tirmidhi 5/511 ; al-Hakim 1/501, jugé authentique, adh-Dhahabi d’accord (Sahih al-Jami‘ 5/531 ; Sahih at-Tirmidhi 3/160).

*Renvoi d’origine (arabe)* : أخرجه الترمذي 5/511 والحاكم 1/501 وصححه ووافقه الذهبي ، وانظر صحيح الجامع 5/531 وصحيح الترمذي 3/160

### Mérite de la glorification, de la louange, de l’unicité et du takbir n° 6

**Arabe** : لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ

**Phonétique** : La hawla wala qouwwata illa billah

**Français** : Il n’y a de force ni de puissance qu’en Allah. (hadith : un trésor parmi les trésors du Paradis)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Mérite de la glorification, de la louange, de l’unicité et du takbir », invocation n° 6. Al-Bukhari, Fath al-Bari 11/213 ; Muslim 4/2076.

*Renvoi d’origine (arabe)* : البخاري مع الفتح 11/ 213 ومسلم 4/2076

### Mérite de la glorification, de la louange, de l’unicité et du takbir n° 7

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، اللَّهُ أَكْبَرُ كَبِيراً، وَالْحَمْدُ لِلَّهِ كَثِيراً، سُبْحَانَ اللَّهِ رَبِّ الْعَالَمِينَ، لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ الْعَزِيزِ الْحَكِيمِ

**Phonétique** : La ilaha illa llahou wahdahou la charika lahou, Allahou akbarou kabiran, wal-hamdou lillahi kathiran, soubhana llahi rabbi l-ʿalamina, la hawla wala qouwwata illa billahi l-ʿazizi l-hakim

**Français** : Il n’y a de divinité qu’Allah, Seul, sans associé. Allah est le plus grand, d’une grandeur parfaite ; louange à Allah, abondante ; gloire à Allah, Seigneur des mondes ; il n’y a de force ni de puissance qu’en Allah, le Puissant, le Sage. (enseigné à un bédouin qui demandait des paroles à dire)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Mérite de la glorification, de la louange, de l’unicité et du takbir », invocation n° 7. Muslim 4/2072 ; Abu Dawud ajoute : « Il a rempli ses mains de bien » (1/220).

*Renvoi d’origine (arabe)* : مسلم 4/ 2072 وزاد أبو داود : فلما ولى الأعرابي قال النبي صلى الله عليه وسلم : لقد ملأ يديه من الخير 1/ 220

### Mérite de la glorification, de la louange, de l’unicité et du takbir n° 8

**Arabe** : اللَّهُمَّ اغْفِرْ لِي، وَارْحَمْنِي، وَاهْدِنِي، وَارْزُقْنِي

**Phonétique** : Allahoumma-ghfir li, warhamni, wahdini, warzouqni

**Français** : Ô Allah, pardonne-moi, fais-moi miséricorde, guide-moi et pourvois à mes besoins. (réponse du Prophète au bédouin qui demandait ce qu’il y avait pour lui)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Mérite de la glorification, de la louange, de l’unicité et du takbir », invocation n° 8. Muslim 4/2072.

*Renvoi d’origine (arabe)* : مسلم 4/ 2072 وزاد أبو داود : فلما ولى الأعرابي قال النبي صلى الله عليه وسلم : لقد ملأ يديه من الخير 1/ 220

### Mérite de la glorification, de la louange, de l’unicité et du takbir n° 9

**Arabe** : اللَّهُمَّ اغْفِرْ لِي، وَارْحَمْنِي، وَاهْدِنِي، وَعَافِنِي وَارْزُقْنِي

**Phonétique** : Allahoumma-ghfir li, warhamni, wahdini, waʿafini warzouqni

**Français** : Ô Allah, pardonne-moi, fais-moi miséricorde, guide-moi, accorde-moi la santé et pourvois à mes besoins. (que le Prophète faisait dire, après la prière, à celui qui se convertissait à l’islam)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Mérite de la glorification, de la louange, de l’unicité et du takbir », invocation n° 9. Muslim 4/2073.

*Renvoi d’origine (arabe)* : مسلم 4/2073 وفي رواية لمسلم فإن هؤلاء تجمع لك ديناك وآخرتك
