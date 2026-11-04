# Dhikr du voyage et des nouvelles — fiche de relecture

14 entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.

## Ce qu’il faut vérifier

1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.
2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.
3. **Découpages décidés par l’assistant** : l’invocation de voyage est coupée avant « Au retour… » (l’ajout du retour est repris dans l’entrée « retour de voyage » et rappelé en français) ; le chapitre « bonne ou mauvaise nouvelle » est séparé en 2 entrées ; l’entrée « Takbir et tasbih pendant le trajet » est un récit de Jabir (pas une formule), à garder ou retirer selon votre avis ; le chapitre « marché » est déjà dans le lot précédent ; « Quand la monture trébuche : Au nom d’Allah » (Abu Dawud 4/296, jugé sahih par al-Albani) n’est pas répété : même texte arabe que « Au nom d’Allah » du lot précédent (l’application écarte les doublons) — pensez à l’ajouter à sa référence si vous le souhaitez.
4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).
5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; les deux entrées « nouvelle agréable / désagréable » partagent un seul renvoi dans la source.
6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment l’invocation de voyage n° 1, très longue, et les formules de départ). **Phonétique** : générée par règles, sans tajwid.

## Les invocations

### Réponse à celui qui dit « Qu’Allah te bénisse » n° 1

**Arabe** : وَفِيكَ بَارَكَ اللَّهُ

**Phonétique** : Wafika baraka llah

**Français** : Et qu’Allah te bénisse aussi.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Réponse à celui qui dit « Qu’Allah te bénisse » », invocation n° 1. Ibn as-Sunni p. 138 n° 278 ; voir Ibn al-Qayyim, al-Wabil as-sayyib p. 304 (éd. Bachir Muhammad ‘Uyun).

*Renvoi d’origine (arabe)* : أخرجه ابن السني ص138 برقم 278 وانظر الوابل الصيب لابن القيم 304 تحقيق بشير محمد عيون

### Invocation contre le mauvais présage n° 1

**Arabe** : اللَّهُمَّ لاَ طَيْرَ إِلاَّ طَيْرُكَ، وَلاَ خَيْرَ إِلاَّ خَيْرُكَ، وَلاَ إِلَهَ غَيْرُكَ

**Phonétique** : Allahoumma la tayra illa tayrouka, wala khayra illa khayrouka, wala ilaha ghayrouk

**Français** : Ô Allah, il n’y a de présage que le Tien, de bien que le Tien, et de divinité en dehors de Toi.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocation contre le mauvais présage », invocation n° 1. Ahmad 2/220 ; Ibn as-Sunni n° 292 ; jugé sahih par al-Albani (as-Sahiha 3/54 n° 1065). Le Prophète aimait le bon augure (al-fa’l) : Abu Dawud, Ahmad (as-Sahiha 2/363).

*Renvoi d’origine (arabe)* : أحمد 2/220 وابن السني برقم 292 وصححه الألباني في الأحاديث الصحيحة 3/54 رقم 1065 ، أما الفأل فكان يعجب النبي صلى الله عليه وسلم ؛ ولهذا سمع من رجل كلمة طيبة فأعجبته فقال : أخذنا فألك من فيك أبو داود وأحمد ،وصححه الألباني في الصحيحة2/363 عند أبي الشيخ في أخلاق النبي

### Invocation en montant sur sa monture n° 1

**Arabe** : بِسْمِ اللَّهِ، وَالْحَمْدُ لِلَّهِ ﴿سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ، وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ﴾ الْحَمْدُ لِلَّهِ، الْحَمْدُ لِلَّهِ، الْحَمْدُ لِلَّهِ، اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، سُبْحَانَكَ اللَّهُمَّ إِنِّي ظَلَمْتُ نَفْسِي فَاغْفِرْ لِي؛ فَإِنَّهُ لاَ يَغْفِرُ الذُّنُوبَ إِلاَّ أَنْتَ

**Phonétique** : Bismi llahi, wal-hamdou lillahi soubhana-lladhi sakhkhara lana hadha wama kounna lahou mouqrinina, wa’inna ila rabbina lamounqaliboun. Al-hamdou lillahi, al-hamdou lillahi, al-hamdou lillahi, Allahou akbarou, Allahou akbarou, Allahou akbarou, soubhanaka llahoumma inni dhalamtou nafsi faghfir li, fa’innahou la yaghfirou dh-dhounouba illa ant

**Français** : Au nom d’Allah. Louange à Allah. « Gloire à Celui qui nous a soumis tout cela, alors que nous n’étions pas capables de le dominer ; et c’est vers notre Seigneur que nous retournerons. » Louange à Allah (trois fois), Allah est le plus grand (trois fois). Gloire à Toi, ô Allah ! Je me suis fait du tort à moi-même : pardonne-moi, car nul ne pardonne les péchés en dehors de Toi.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocation en montant sur sa monture », invocation n° 1. Abu Dawud 3/34 ; at-Tirmidhi 5/501 (voir Sahih at-Tirmidhi 3/156).

*Renvoi d’origine (arabe)* : أبو داود 3/34 والترمذي 5/501 وانظر صحيح الترمذي3/ 156

### Invocation de voyage n° 1

**Arabe** : اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، اللَّهُ أَكْبَرُ، ﴿سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ، وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ﴾ اللَّهُمَّ إِنَّا نَسْأَلُكَ فِي سَفَرِنَا هَذَا الْبِرَّ وَالتَّقْوَى، وَمِنَ الْعَمَلِ مَا تَرْضَى، اللَّهُمَّ هَوِّنْ عَلَيْنَا سَفَرَنَا هَذَا وَاطْوِ عَنَّا بُعْدَهُ، اللَّهُمَّ أَنْتَ الصَّاحِبُ فِي السَّفَرِ، وَالْخَلِيفَةُ فِي الْأَهْلِ، اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ وَعْثَاءِ السَّفَرِ، وَكَآبَةِ الْمَنْظَرِ، وَسُوءِ الْمُنْقَلَبِ فِي الْمَالِ وَالْأَهْلِ

**Phonétique** : Allahou akbarou, Allahou akbarou, Allahou akbarou, soubhana-lladhi sakhkhara lana hadha wama kounna lahou mouqrinina, wa’inna ila rabbina lamounqaliboun. Allahoumma inna nas’alouka fi safarina hadha l-birra wat-taqwa, wamina l-ʿamali ma tarda, Allahoumma hawwin ʿalayna safarana hadha watwi ʿanna bouʿdahou, Allahoumma anta s-sahibou fi s-safari, wal-khalifatou fi l-ahli, Allahoumma inni aʿoudhou bika min waʿtha’i s-safari, waka’abati l-mandhari, wasou’i l-mounqalabi fi l-mali wal-ahl

**Français** : Allah est le plus grand (trois fois). « Gloire à Celui qui nous a soumis tout cela, alors que nous n’étions pas capables de le dominer ; et c’est vers notre Seigneur que nous retournerons. » Ô Allah, nous Te demandons, dans ce voyage, la piété, la crainte et les œuvres qui Te plaisent. Ô Allah, facilite-nous ce voyage et raccourcis-nous sa distance. Ô Allah, Tu es le Compagnon du voyage et le Remplaçant auprès des proches. Ô Allah, je cherche refuge auprès de Toi contre la fatigue du voyage, la tristesse du spectacle et le mauvais retour pour les biens et la famille. (Au retour, on dit les mêmes paroles en ajoutant : « Nous revenons, repentants, adorateurs, louant notre Seigneur. »)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocation de voyage », invocation n° 1. Muslim 2/978.

*Renvoi d’origine (arabe)* : رواه مسلم2/ 978

### Invocation en entrant dans un village ou une ville n° 1

**Arabe** : اللَّهُمَّ رَبَّ السَّمَوَاتِ السَّبْعِ وَمَا أَظْلَلْنَ، وَرَبَّ الأَرَضِينَ السَّبْعِ وَمَا أَقْلَلْنَ، وَرَبَّ الشَّيَاطِينِ وَمَا أَضْلَلْنَ، وَرَبَّ الرِّيَاحِ وَمَا ذَرَيْنَ، أَسْأَلُكَ خَيْرَ هَذِهِ الْقَرْيَةِ، وَخَيْرَ أَهْلِهَا، وَخَيْرَ مَا فِيهَا، وَأَعُوذُ بِكَ مِنْ شَرِّهَا، وَشَرِّ أَهْلِهَا، وَشَرِّ مَا فِيهَا

**Phonétique** : Allahoumma rabba s-samawati s-sabʿi wama adhlalna, warabba l-aradina s-sabʿi wama aqlalna, warabba ch-chayatini wama adlalna, warabba r-riyahi wama dharayna, as’alouka khayra hadhihi l-qaryati, wakhayra ahliha, wakhayra ma fiha, wa’aʿoudhou bika min charriha, wacharri ahliha, wacharri ma fiha

**Français** : Ô Allah, Seigneur des sept cieux et de ce qu’ils couvrent, des sept terres et de ce qu’elles portent, des démons et de ceux qu’ils égarent, des vents et de ce qu’ils emportent : je Te demande le bien de ce village, le bien de ses habitants et le bien de ce qu’il renferme ; et je cherche refuge auprès de Toi contre son mal, le mal de ses habitants et le mal de ce qu’il renferme.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocation en entrant dans un village ou une ville », invocation n° 1. Al-Hakim 2/100 (jugé authentique, avec l’accord d’adh-Dhahabi) ; Ibn as-Sunni n° 524 (jugé hassan par al-Hafiz Ibn Hajar, Takhrij al-adhkar 5/154). Ibn Baz : an-Nasa’i l’a rapporté avec une chaîne hassan (Tuhfat al-akhyar p. 37).

*Renvoi d’origine (arabe)* : الحاكم وصححه ووافقه الذهبي 2/100 وابن السني برقم 524وحسنه الحافظ في تخريج الأذكار 5/154 قال ابن باز:ورواه النسائي بإسناد حسن . انظر تحفة الأخيار ص 37

### Invocation du voyageur pour celui qui reste n° 1

**Arabe** : أَسْتَوْدِعُكُمُ اللَّهَ الَّذِي لاَ تَضِيعُ وَدَائِعُهُ

**Phonétique** : Astawdiʿoukoumou llaha-lladhi la tadiʿou wada’iʿouh

**Français** : Je vous confie à Allah, Celui dont les dépôts ne sont jamais perdus.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocation du voyageur pour celui qui reste », invocation n° 1. Ahmad 2/403 ; Ibn Majah 2/943 (voir Sahih Ibn Majah 2/133).

*Renvoi d’origine (arabe)* : أحمد 2/403 وابن ماجه 2/943 وانظر صحيح ابن ماجة2/ 133

### Invocation de celui qui reste pour le voyageur n° 1

**Arabe** : أَسْتَوْدِعُ اللَّهَ دِينَكَ، وَأَمَانَتَكَ، وَخَوَاتِيمَ عَمَلِكَ

**Phonétique** : Astawdiʿou llaha dinaka, wa’amanataka, wakhawatima ʿamalik

**Français** : Je confie à Allah ta religion, ton dépôt et la fin de tes œuvres.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocation de celui qui reste pour le voyageur », invocation n° 1. Ahmad 2/7 ; at-Tirmidhi 5/499 (voir Sahih at-Tirmidhi 3/155).

*Renvoi d’origine (arabe)* : أحمد 2/7 الترمذي5/499 وانظر صحيح الترمذي3/ 155

### Invocation de celui qui reste pour le voyageur n° 2

**Arabe** : زَوَّدَكَ اللَّهُ التَّقْوَى، وَغَفَرَ ذَنْبَكَ، وَيَسَّرَ لَكَ الْخَيْرَ حَيْثُ مَا كُنْتَ

**Phonétique** : Zawwadaka llahou t-taqwa, waghafara dhanbaka, wayassara laka l-khayra haythou ma kount

**Français** : Qu’Allah te donne la piété pour provision, qu’Il pardonne ton péché et te facilite le bien où que tu sois.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocation de celui qui reste pour le voyageur », invocation n° 2. At-Tirmidhi (voir Sahih at-Tirmidhi 3/155).

*Renvoi d’origine (arabe)* : الترمذي وانظر صحيح الترمذي3/ 155

### Takbir et tasbih pendant le trajet n° 1

**Arabe** : قَالَ جَابِرٌ رَضِيَ اللَّهُ عَنْهُ: كُنَّا إِذَا صَعَدْنَا كَبَّرْنَا، وَإِذَا نَزَلْنَا سَبَّحْنَا

**Phonétique** : Qala djabiroun radiya llahou ʿanhou, kounna idha saʿadna kabbarna, wa’idha nazalna sabbahna

**Français** : Jabir (qu’Allah l’agrée) a dit : « Quand nous montions, nous disions “Allah est le plus grand” ; quand nous descendions, nous disions “Gloire à Allah”. »

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Takbir et tasbih pendant le trajet », invocation n° 1. Al-Bukhari, Fath al-Bari 6/135.

*Renvoi d’origine (arabe)* : البخاري الفتح6/ 135

### Invocation du voyageur à l’aube n° 1

**Arabe** : سَمَّعَ سَامِعٌ بِحَمْدِ اللَّهِ، وَحُسْنِ بَلاَئِهِ عَلَيْنَا، رَبَّنَا صَاحِبْنَا، وَأَفْضِلْ عَلَيْنَا، عَائِذاً بِاللَّهِ مِنَ النَّارِ

**Phonétique** : Sammaʿa samiʿoun bihamdi llahi, wahousni bala’ihi ʿalayna, rabbana sahibna, wa’afdil ʿalayna, ʿa’idhan billahi mina n-nar

**Français** : Qu’un témoin entende que nous louons Allah et que nous Le remercions de Ses bienfaits envers nous. Notre Seigneur, accompagne-nous et comble-nous de Tes bienfaits, nous cherchons refuge auprès d’Allah contre le Feu.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocation du voyageur à l’aube », invocation n° 1. Muslim 4/2086. An-Nawawi (Charh Muslim 17/39) : « qu’un témoin entende » signifie qu’un témoin atteste de notre louange envers Allah et de Ses bienfaits, ou que celui qui entend transmette ces paroles à d’autres ; « accompagne-nous » : garde-nous, protège-nous.

*Renvoi d’origine (arabe)* : مسلم4/ 2086 ومعني سمع سامع : أي شهد شاهد على حمدنا لله تعالى على نعمه وحسن بلائه . ومعني سمع سامع : بلغ سامع قولي هذا لغيره وقال مثله تنبيهاً على الذكر في السحر والدعاء . وقوله : ربنا صاحبنا وأفضل علينا : أي احفظنا وحطنا واكلأنا وأفضل علينا بجزيل نعمك واصرف عنا كل مكروه ، شرح النووي 17/39

### Invocation en faisant halte n° 1

**Arabe** : أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ

**Phonétique** : Aʿoudhou bikalimati llahi t-tammati min charri ma khalaq

**Français** : Je cherche refuge auprès des paroles parfaites d’Allah contre le mal de ce qu’Il a créé. (en faisant halte pendant un voyage ou ailleurs)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocation en faisant halte », invocation n° 1. Muslim 4/2080.

*Renvoi d’origine (arabe)* : رواه مسلم4/2080

### Ce que l’on dit au retour de voyage n° 1

**Arabe** : يُكَبِّرُ عَلَى كُلِّ شَرَفٍ ثَلاَثَ تَكْبِيرَاتٍ ثُمَّ يَقُولُ: لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ، وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، آيِبُونَ، تَائِبُونَ، عَابِدُونَ، لِرَبِّنَا حَامِدُونَ، صَدَقَ اللَّهُ وَعْدَهُ، وَنَصَرَ عَبْدَهُ، وَهَزَمَ الْأَحْزَابَ وَحْدَهُ

**Phonétique** : Youkabbirou ʿala koulli charafin thalatha takbiratin thoumma yaqoulou, la ilaha illa llahou wahdahou la charika lahou, lahou l-moulkou, walahou l-hamdou, wahouwa ʿala koulli chay’in qadiroun, ayibouna, ta’ibouna, ʿabidouna, lirabbina hamidouna, sadaqa llahou waʿdahou, wanasara ʿabdahou, wahazama l-ahzaba wahdah

**Français** : (Dire trois fois « Allah est le plus grand » sur chaque hauteur, puis :) Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé ; à Lui la royauté, à Lui la louange, et Il est capable de toute chose. Nous revenons, repentants, adorateurs, louant notre Seigneur. Allah a tenu Sa promesse, secouru Son serviteur et mis en déroute les coalisés à Lui seul.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Ce que l’on dit au retour de voyage », invocation n° 1. Le Prophète le disait à son retour d’une expédition, du Hajj ou de la ‘Umra : al-Bukhari 7/163 ; Muslim 2/980.

*Renvoi d’origine (arabe)* : كان النبي صلى الله عليه وسلم يقوله إذا قفل من غزو أو حج ، البخاري 7/163 ومسلم 2/ 980

### Quand une chose agréable arrive n° 1

**Arabe** : الْحَمْدُ لِلَّهِ الَّذِي بِنِعْمَتِهِ تَتِمُّ الصَّالِحَاتُ

**Phonétique** : Al-hamdou lillahi-lladhi biniʿmatihi tatimmou s-salihat

**Français** : Louange à Allah, par la grâce de Qui s’accomplissent les bonnes choses. (quand arrive une chose agréable)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Quand une chose agréable arrive », invocation n° 1. Ibn as-Sunni (‘Amal al-yawm wa-l-layla) ; al-Hakim 1/499 (jugé authentique) ; jugé sahih par al-Albani (Sahih al-Jami‘ 4/201).

*Renvoi d’origine (arabe)* : أخرجه ابن السني في عمل اليوم والليلة والحاكم وصححه 1/499 وصححه الألباني في صحيح الجامع 4/ 201

### Quand une chose désagréable arrive n° 1

**Arabe** : الْحَمْدُ لِلَّهِ عَلَى كُلِّ حَالٍ

**Phonétique** : Al-hamdou lillahi ʿala koulli hal

**Français** : Louange à Allah en toute circonstance. (quand arrive une chose désagréable)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Quand une chose désagréable arrive », invocation n° 1. Même renvoi que l’entrée précédente (Ibn as-Sunni ; al-Hakim 1/499 ; Sahih al-Jami‘ 4/201) : le Prophète disait l’un ou l’autre selon ce qui lui arrivait.

*Renvoi d’origine (arabe)* : أخرجه ابن السني في عمل اليوم والليلة والحاكم وصححه 1/499 وصححه الألباني في صحيح الجامع 4/ 201
