# Dhikr des épreuves — fiche de relecture

26 entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.

## Ce qu’il faut vérifier

1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.
2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.
3. **Choix de l’assistant** : seuls les passages qui sont des formules à dire sont repris ; ne sont PAS repris les consignes sans formule (« faire les ablutions et prier deux rak‘a après un péché », « chercher refuge, l’appel à la prière, la récitation » contre Satan, le chapitre sur la visite des malades), ni l’invocation « Que Allah le bénisse » contre le mauvais œil (la source ne donne que la consigne, aucune formule : je n’en invente pas). Le texte « Ô Allah, je cherche refuge contre le souci… » n’est présent qu’une fois (il figure aussi dans « dette »).
4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).
5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; le renvoi de « Quand arrive ce qu’on n’aime pas » est un résumé du renvoi d’origine (Muslim 4/2052).
6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment les invocations de crainte du gouverneur, longues, où il faut dire le nom de la personne). **Phonétique** : générée par règles, sans tajwid.

## Les invocations

### Tristesse et souci n° 1

**Arabe** : اللَّهُمَّ إِنِّي عَبْدُكَ، ابْنُ عَبْدِكَ، ابْنُ أَمَتِكَ، نَاصِيَتِي بِيَدِكَ، مَاضٍ فِيَّ حُكْمُكَ، عَدْلٌ فِيَّ قَضَاؤُكَ، أَسْأَلُكَ بِكُلِّ اسْمٍ هُوَ لَكَ، سَمَّيْتَ بِهِ نَفْسَكَ، أَوْ أَنْزَلْتَهُ فِي كِتَابِكَ، أَوْ عَلَّمْتَهُ أَحَداً مِنْ خَلْقِكَ، أَوِ اسْتَأْثَرْتَ بِهِ فِي عِلْمِ الْغَيْبِ عِنْدَكَ، أَنْ تَجْعَلَ الْقُرْآنَ رَبِيعَ قَلْبِي، وَنُورَ صَدْرِي، وَجَلاَءَ حُزْنِي، وَذَهَابَ هَمِّي

**Phonétique** : Allahoumma inni ʿabdouka, oubnou ʿabdika, oubnou amatika, nasiyati biyadika, madin fiyya houkmouka, ʿadloun fiyya qada’ouka, as’alouka bikoulli-smin houwa laka, sammayta bihi nafsaka, aw anzaltahou fi kitabika, aw ʿallamtahou ahadan min khalqika, awi-sta’tharta bihi fi ʿilmi l-ghaybi ʿindaka, an tadjʿala l-qour’ana rabiʿa qalbi, wanoura sadri, wadjala’a houzni, wadhahaba hammi

**Français** : Ô Allah, je suis Ton serviteur, fils de Ton serviteur, fils de Ta servante ; mon toupet est dans Ta main, Ton jugement s’exécute sur moi, Ton décret à mon égard est juste. Je Te demande par chacun de Tes noms, ceux dont Tu T’es nommé Toi-même, que Tu as révélés dans Ton Livre, enseignés à l’une de Tes créatures ou gardés pour Toi dans la science de l’invisible : fais du Coran le printemps de mon cœur, la lumière de ma poitrine, ce qui dissipe ma tristesse et emporte mon souci.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Tristesse et souci », invocation n° 1. Ahmad 1/391 ; jugé sahih par al-Albani.

*Renvoi d’origine (arabe)* : أحمد 1/391وصححه الألباني

### Tristesse et souci n° 2

**Arabe** : اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْبُخْلِ وَالْجُبْنِ، وَضَلَعِ الدَّيْنِ وَغَلَبَةِ الرِّجَالِ

**Phonétique** : Allahoumma inni aʿoudhou bika mina l-hammi wal-hazani, wal-ʿadjzi wal-kasali, wal-boukhli wal-djoubni, wadalaʿi d-dayni waghalabati r-ridjal

**Français** : Ô Allah, je cherche refuge auprès de Toi contre le souci et la tristesse, l’impuissance et la paresse, l’avarice et la lâcheté, le poids de la dette et la domination des hommes. (la même formule se dit aussi pour être aidé à rembourser une dette)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Tristesse et souci », invocation n° 2. Al-Bukhari 7/158 : le Messager d’Allah multipliait cette invocation. Le même texte figure dans le chapitre « rembourser une dette » (at-Tirmidhi 5/560, voir Sahih at-Tirmidhi 3/180 ; al-Bukhari 7/158).

*Renvoi d’origine (arabe)* : البخاري 7/158 كان رسول الله صلى الله عليه وسلم يكثر من هذا الدعاء.

### Détresse (karb) n° 1

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ الْعَظِيمُ الْحَلِيمُ، لاَ إِلَهَ إِلاَّ اللَّهُ رَبُّ الْعَرْشِ الْعَظِيمِ، لاَ إِلَهَ إِلاَّ اللَّهُ رَبُّ السَّمَوَاتِ وَرَبُّ الْأَرْضِ وَرَبُّ الْعَرْشِ الْكَرِيمِ

**Phonétique** : La ilaha illa llahou l-ʿadhimou l-halimou, la ilaha illa llahou rabbou l-ʿarchi l-ʿadhimi, la ilaha illa llahou rabbou s-samawati warabbou l-ardi warabbou l-ʿarchi l-karim

**Français** : Il n’y a de divinité digne d’adoration qu’Allah, le Très-Grand, le Longanime. Il n’y a de divinité digne d’adoration qu’Allah, Seigneur du Trône immense. Il n’y a de divinité digne d’adoration qu’Allah, Seigneur des cieux, Seigneur de la terre et Seigneur du noble Trône.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Détresse (karb) », invocation n° 1. Al-Bukhari 7/154 ; Muslim 4/2092.

*Renvoi d’origine (arabe)* : البخاري 7/154ومسلم 4/ 2092

### Détresse (karb) n° 2

**Arabe** : اللَّهُمَّ رَحْمَتَكَ أَرْجُو، فَلاَ تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ، وَأَصْلِحْ لِي شَأْنِي كُلَّهُ، لاَ إِلَهَ إِلاَّ أَنْتَ

**Phonétique** : Allahoumma rahmataka ardjou, fala takilni ila nafsi tarfata ʿaynin, wa’aslih li cha’ni koullahou, la ilaha illa ant

**Français** : Ô Allah, c’est Ta miséricorde que j’espère : ne me laisse pas à moi-même, le temps d’un clin d’œil, et remets en ordre toute ma situation. Il n’y a de divinité digne d’adoration que Toi.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Détresse (karb) », invocation n° 2. Abu Dawud 4/324 ; Ahmad 5/42 ; jugé hassan par al-Albani (Sahih Abi Dawud 3/959).

*Renvoi d’origine (arabe)* : أبو داود 4/324 وأحمد 5/42 وحسنه الألباني في صحيح أبو داود 3/ 959

### Détresse (karb) n° 3

**Arabe** : لاَ إِلَهَ إِلاَّ أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ

**Phonétique** : La ilaha illa anta soubhanaka inni kountou mina dh-dhalimin

**Français** : Il n’y a de divinité digne d’adoration que Toi ; gloire à Toi, j’ai été du nombre des injustes. (invocation de Yunus dans le ventre du poisson)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Détresse (karb) », invocation n° 3. At-Tirmidhi 5/529 ; al-Hakim 1/505 (jugé authentique, avec l’accord d’adh-Dhahabi) ; voir Sahih at-Tirmidhi 3/168.

*Renvoi d’origine (arabe)* : الترمذي 5/529 والحاكم وصححه ووفقه الذهبي 1/505 وانظر صحيح الترمذي3/ 168

### Détresse (karb) n° 4

**Arabe** : اللَّهُ اللَّهُ رَبِّي لاَ أُشْرِكُ بِهِ شَيْئاً

**Phonétique** : Allahou llahou rabbi la ouchrikou bihi chay’a

**Français** : Allah, Allah est mon Seigneur, je ne Lui associe rien.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Détresse (karb) », invocation n° 4. Abu Dawud 2/87 ; voir Sahih Ibn Majah 2/335.

*Renvoi d’origine (arabe)* : أخرجه أبو داود 2/87 وانظر صحيح ابن ماجه 2/335

### Rencontre d’un ennemi ou d’un puissant n° 1

**Arabe** : اللَّهُمَّ إِنَّا نَجْعَلُكَ فِي نُحُورِهِمْ، وَنَعُوذُ بِكَ مِنْ شُرُورِهِمْ

**Phonétique** : Allahoumma inna nadjʿalouka fi nouhourihim, wanaʿoudhou bika min chourourihim

**Français** : Ô Allah, nous Te plaçons face à eux et nous cherchons refuge auprès de Toi contre leurs maux.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Rencontre d’un ennemi ou d’un puissant », invocation n° 1. Abu Dawud 2/89 ; al-Hakim 2/142 (jugé authentique, avec l’accord d’adh-Dhahabi).

*Renvoi d’origine (arabe)* : أبو داود 2/89 وصححه الحاكم ووافقه الذهبي 2/142

### Rencontre d’un ennemi ou d’un puissant n° 2

**Arabe** : اللَّهُمَّ أَنْتَ عَضُدِي، وَأَنْتَ نَصِيرِي، بِكَ أَحُولُ وَبِكَ أَصُولُ، وَبِكَ أُقَاتِلُ

**Phonétique** : Allahoumma anta ʿadoudi, wa’anta nasiri, bika ahoulou wabika asoulou, wabika ouqatil

**Français** : Ô Allah, Tu es mon soutien et mon secours : par Toi je me déplace, par Toi je m’élance, par Toi je combats.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Rencontre d’un ennemi ou d’un puissant », invocation n° 2. Abu Dawud 3/42 ; at-Tirmidhi 5/572 (voir Sahih at-Tirmidhi 3/183).

*Renvoi d’origine (arabe)* : أبو داود 3/42 والترمذي 5/572 ،وانظر صحيح الترمذي3/183

### Rencontre d’un ennemi ou d’un puissant n° 3

**Arabe** : حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ

**Phonétique** : Hasbouna llahou waniʿma l-wakil

**Français** : Allah nous suffit, et quel excellent garant !

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Rencontre d’un ennemi ou d’un puissant », invocation n° 3. Al-Bukhari 5/172.

*Renvoi d’origine (arabe)* : البخاري 5/172

### Crainte de l’injustice d’un gouverneur n° 1

**Arabe** : اللَّهُمَّ رَبَّ السَّمَوَاتِ السَّبْعِ، وَرَبَّ الْعَرْشِ الْعَظِيمِ، كُنْ لِي جَاراً مِنْ فُلاَنِ بْنِ فُلاَنٍ، وَأَحْزَابِهِ مِنْ خَلاَئِقِكَ، أَنْ يَفْرُطَ عَلَيَّ أَحَدٌ مِنْهُمْ أَوْ يَطْغَى، عَزَّ جَارُكَ، وَجَلَّ ثَنَاؤُكَ، وَلاَ إِلَهَ إِلاَّ أَنْتَ

**Phonétique** : Allahoumma rabba s-samawati s-sabʿi, warabba l-ʿarchi l-ʿadhimi, koun li djaran min foulani bni foulanin, wa’ahzabihi min khala’iqika, an yafrouta ʿalayya ahadoun minhoum aw yatgha, ʿazza djarouka, wadjalla thana’ouka, wala ilaha illa ant

**Français** : Ô Allah, Seigneur des sept cieux et du Trône immense, sois mon protecteur contre un tel, fils d’un tel (dire son nom), et contre ses partisans parmi Tes créatures, afin qu’aucun d’eux ne se montre excessif ou n’abuse envers moi. Puissant est Ton protégé, grande est Ta louange, et il n’y a de divinité digne d’adoration que Toi.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Crainte de l’injustice d’un gouverneur », invocation n° 1. Al-Bukhari, al-Adab al-mufrad n° 707 ; jugé sahih par al-Albani (Sahih al-Adab al-mufrad n° 545).

*Renvoi d’origine (arabe)* : البخاري في الأدب المفرد برقم 707 وصححه الألباني وفي صحيح الأدب المفرد برقم 545

### Crainte de l’injustice d’un gouverneur n° 2

**Arabe** : اللَّهُ أَكْبَرُ، اللَّهُ أَعَزُّ مِنْ خَلْقِهِ جَمِيعاً، اللَّهُ أَعَزُّ مِمَّا أَخَافُ وَأَحْذَرُ، أَعُوذُ بِاللَّهِ الَّذِي لاَ إِلَهَ إِلاَّ هُوَ، الْمُمْسِكِ السَّمَوَاتِ السَّبْعِ أَنْ يَقَعْنَ عَلَى الْأَرْضِ إِلاَّ بِإِذْنِهِ، مِنْ شَرِّ عَبْدِكَ فُلاَنٍ، وَجُنُودِهِ وَأَتْبَاعِهِ وَأَشْيَاعِهِ، مِنْ الْجِنِّ وَالإِنْسِ، اللَّهُمَّ كُنْ لِي جَاراً مِنْ شَرِّهِمْ، جَلَّ ثَنَاؤُكَ وَعَزَّ جَارُكَ، وَتَبَارَكَ اسْمُكَ، وَلاَ إِلَهَ غَيْرُكَ

**Phonétique** : Allahou akbarou, Allahou aʿazzou min khalqihi djamiʿan, Allahou aʿazzou mimma akhafou wa’ahdharou, aʿoudhou billahi-lladhi la ilaha illa houwa, al-moumsiki s-samawati s-sabʿi an yaqaʿna ʿala l-ardi illa bi’idhnihi, min charri ʿabdika foulanin, wadjounoudihi wa’atbaʿihi wa’achyaʿihi, min al-djinni wal-insi, Allahoumma koun li djaran min charrihim, djalla thana’ouka waʿazza djarouka, watabaraka-smouka, wala ilaha ghayrouk

**Français** : Allah est le plus grand ; Allah est plus puissant que toute Sa création ; Allah est plus puissant que ce que je crains et redoute. Je cherche refuge auprès d’Allah, il n’y a de divinité digne d’adoration que Lui, Celui qui retient les sept cieux de tomber sur la terre sans Sa permission, contre le mal de Ton serviteur un tel (dire son nom), de ses soldats, de ses suiveurs et de ses partisans, parmi les djinns et les hommes. Ô Allah, sois mon protecteur contre leur mal ; grande est Ta louange, puissant est Ton protégé, béni soit Ton nom, et il n’y a de divinité digne d’adoration en dehors de Toi. (trois fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Crainte de l’injustice d’un gouverneur », invocation n° 2. Al-Bukhari, al-Adab al-mufrad n° 708 ; jugé sahih par al-Albani.

*Renvoi d’origine (arabe)* : البخاري في الأدب المفرد برقم 708 وصححه الألباني وفي صحيح الأدب المفرد برقم

### Invocation contre l’ennemi n° 1

**Arabe** : اللَّهُمَّ مُنْزِلَ الْكِتَابِ، سَرِيعَ الْحِسَابِ، اهْزِمِ الأَحْزَابَ، اللَّهُمَّ اهْزِمْهُمْ وَزَلْزِلْهُمْ

**Phonétique** : Allahoumma mounzila l-kitabi, sariʿa l-hisabi, ihzimi l-ahzaba, Allahoumma-hzimhoum wazalzilhoum

**Français** : Ô Allah, Toi qui as révélé le Livre, prompt dans le compte, mets en déroute les coalisés ! Ô Allah, mets-les en déroute et fais-les trembler.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocation contre l’ennemi », invocation n° 1. Muslim 3/1362.

*Renvoi d’origine (arabe)* : مسلم 3/1362

### Quand on craint un groupe de gens n° 1

**Arabe** : اللَّهُمَّ اكْفِنِيهِمْ بِمَا شِئْتَ

**Phonétique** : Allahoumma-kfinihim bima chi’t

**Français** : Ô Allah, protège-moi d’eux comme Tu veux.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Quand on craint un groupe de gens », invocation n° 1. Muslim 4/2300.

*Renvoi d’origine (arabe)* : مسلم 4/2300

### Doute dans la foi n° 1

**Arabe** : آمَنْتُ بِاللَّهِ وَرُسُلِهِ

**Phonétique** : Amantou billahi warousoulih

**Français** : J’ai cru en Allah et en Ses messagers. (en cas de doute dans la foi : chercher refuge auprès d’Allah, cesser d’y penser, et dire cette formule)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Doute dans la foi », invocation n° 1. Al-Bukhari (Fath al-Bari 6/336) ; Muslim 1/120.

*Renvoi d’origine (arabe)* : مسلم 1/ 120

### Doute dans la foi n° 2

**Arabe** : ﴿هُوَ الْأَوَّلُ وَالْآخِرُ وَالظَّاهِرُ وَالْبَاطِنُ وَهُوَ بِكُلِّ شَيْءٍ عَلِيمٌ﴾

**Phonétique** : Houwa l-awwalou wal-’akhirou wadh-dhahirou wal-batinou wahouwa bikoulli chay’in ʿalim.

**Français** : « Il est le Premier et le Dernier, l’Apparent et le Caché, et Il est Omniscient. » (Coran 57:3 ; à réciter en cas de doute dans la foi)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Doute dans la foi », invocation n° 2. Coran, sourate al-Hadid, verset 3 ; Abu Dawud 4/329 ; jugé hassan par al-Albani (Sahih Abi Dawud 3/962).

*Renvoi d’origine (arabe)* : سورة الحديد ، الآية :3 .أبو داود 4/329 وحسنه الألباني في صحيح أبو داود 3/962

### Pour rembourser une dette n° 1

**Arabe** : اللَّهُمَّ اكْفِنِي بِحَلاَلِكَ عَنْ حَرَامِكَ، وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ

**Phonétique** : Allahoumma-kfini bihalalika ʿan haramika, wa’aghnini bifadlika ʿamman siwak

**Français** : Ô Allah, rends-moi suffisant par ce que Tu as permis pour que je m’abstienne de ce que Tu as interdit, et enrichis-moi par Ta grâce pour que je n’aie besoin que de Toi. (pour rembourser une dette ; la seconde formule du chapitre est celle de « Tristesse et souci » n° 2)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Pour rembourser une dette », invocation n° 1. At-Tirmidhi 5/560 (voir Sahih at-Tirmidhi 3/180).

*Renvoi d’origine (arabe)* : الترمذي 5/560 وانظر صحيح الترمذي3/ 180

### Murmures de Satan pendant la prière n° 1

**Arabe** : أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ

**Phonétique** : Aʿoudhou billahi mina ch-chaytani r-radjim

**Français** : Je cherche refuge auprès d’Allah contre Satan le maudit. (puis cracher légèrement sur sa gauche, trois fois : consigne du hadith de ‘Uthman ibn Abi l-‘As)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Murmures de Satan pendant la prière », invocation n° 1. Muslim 4/1729, hadith de ‘Uthman ibn Abi l-‘As (qu’Allah l’agrée) : « Je l’ai fait et Allah l’a éloigné de moi ».

*Renvoi d’origine (arabe)* : مسلم 4/1729 من حديث عثمان بن العاص رضي الله عنه وفيه ففعلت ذلك فأذهبه الله عني

### Quand une chose est difficile n° 1

**Arabe** : اللَّهُمَّ لاَ سَهْلَ إِلاَّ مَا جَعَلْتَهُ سَهْلاً، وَأَنْتَ تَجْعَلُ الْحَزْنَ إِذَا شِئْتَ سَهْلاً

**Phonétique** : Allahoumma la sahla illa ma djaʿaltahou sahlan, wa’anta tadjʿalou l-hazna idha chi’ta sahla

**Français** : Ô Allah, il n’y a de facile que ce que Tu as rendu facile, et Tu rends facile le terrain difficile quand Tu le veux.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Quand une chose est difficile », invocation n° 1. Ibn Hibban n° 2427 (Mawarid) ; Ibn as-Sunni n° 351 ; al-Hafiz : hadith sahih ; jugé sahih par ‘Abd al-Qadir al-Arna’ut (Takhrij al-adhkar p. 106).

*Renvoi d’origine (arabe)* : رواة ابن حبان في صحيحه برقم 2427 (موارد) وابن السني برقم 351 وقال الحافظ هذا حديث صحيح وصححه عبد القادر الأرناؤوط في تخريج الأذكار للنووي ص106

### Quand arrive ce qu’on n’aime pas n° 1

**Arabe** : قَدَرُ اللَّهِ وَمَا شَاءَ فَعَلَ

**Phonétique** : Qadarou llahi wama cha’a faʿal

**Français** : C’est le décret d’Allah, et Il fait ce qu’Il veut. (quand survient ce qu’on n’aime pas, ou quand on est dépassé par les événements)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Quand arrive ce qu’on n’aime pas », invocation n° 1. Muslim 4/2052 (hadith : « Le croyant fort est meilleur… Et s’il t’arrive quelque chose, ne dis pas “si j’avais fait ceci…”, mais dis : C’est le décret d’Allah et ce qu’Il a voulu, Il l’a fait »). Voir aussi Takhrij al-adhkar d’al-Arna’ut p. 106.

*Renvoi d’origine (arabe)* : المؤمن القوي خير وأحب إلى الله من المؤمن الضعف وفي كل خير ،احرص على ما ينفعك واستعن بالله ولا تعجز وإن أصابك شيء فلا تقل لو أني فعلت كذا وكذا ولكن قل قدر الله وما شاء فعل فإن لو تفتح عمل الشيطان .مسلم 4/2052

### Visite d’un malade n° 1

**Arabe** : لاَ بَأْسَ طَهُورٌ إِنْ شَاءَ اللَّهُ

**Phonétique** : La ba’sa tahouroun in cha’a llah

**Français** : Pas de mal, c’est une purification, s’il plaît à Allah. (à dire à un malade que l’on visite)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Visite d’un malade », invocation n° 1. Al-Bukhari, Fath al-Bari 10/118.

*Renvoi d’origine (arabe)* : البخاري مع الفتح 10/ 118

### Visite d’un malade n° 2

**Arabe** : أَسْأَلُ اللَّهَ الْعَظِيمَ رَبَّ الْعَرْشِ الْعَظِيمِ أَنْ يَشْفِيَكَ

**Phonétique** : As’alou llaha l-ʿadhima rabba l-ʿarchi l-ʿadhimi an yachfiyak

**Français** : Je demande à Allah le Très-Grand, Seigneur du Trône immense, de te guérir. (sept fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Visite d’un malade », invocation n° 2. At-Tirmidhi, Abu Dawud : « Pas un musulman ne visite un malade dont le terme n’est pas venu et ne dit cela sept fois sans être guéri » (voir Sahih at-Tirmidhi 2/210 ; Sahih al-Jami‘ 5/180).

*Renvoi d’origine (arabe)* : ما من عبد مسلم يعود مريضاً لم يحضر أجله فيقول: سبع مرات.....الحديث إلا عوفي . أخرجه الترمذي وأبو داود وانظر صحيح الترمذي2/ 210 وصحيح الجامع 5/180

### Malade qui n’espère plus vivre n° 1

**Arabe** : اللَّهُمَّ اغْفِرْ لِي، وَارْحَمْنِي، وَأَلْحِقْنِي بِالرَّفِيقِ الْأَعْلَى

**Phonétique** : Allahoumma-ghfir li, warhamni, wa’alhiqni bir-rafiqi l-aʿla

**Français** : Ô Allah, pardonne-moi, fais-moi miséricorde et fais-moi rejoindre le Compagnon suprême.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Malade qui n’espère plus vivre », invocation n° 1. Al-Bukhari 7/10 ; Muslim 4/1893.

*Renvoi d’origine (arabe)* : البخاري 7/10 ومسلم 4/1893

### Malade qui n’espère plus vivre n° 2

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ إِنَّ لِلْمَوْتِ سَكَرَاتٍ

**Phonétique** : La ilaha illa llahou inna lilmawti sakarat

**Français** : Il n’y a de divinité digne d’adoration qu’Allah ; la mort a certes ses agonies. (paroles du Prophète, selon ‘A’isha, alors qu’il passait ses mains mouillées sur son visage)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Malade qui n’espère plus vivre », invocation n° 2. Al-Bukhari, Fath al-Bari 8/144.

*Renvoi d’origine (arabe)* : البخاري مع الفتح 8/144وفي الحديث السواك

### Malade qui n’espère plus vivre n° 3

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ وَاللَّهُ أَكْبَرُ، لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ، لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لاَ إِلَهَ إِلاَّ اللَّهُ لَهُ المُلْكُ وَلَهُ الْحَمْدُ، لاَ إِلَهَ إِلاَّ اللَّهُ وَلاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ

**Phonétique** : La ilaha illa llahou wallahou akbarou, la ilaha illa llahou wahdahou, la ilaha illa llahou wahdahou la charika lahou, la ilaha illa llahou lahou l-moulkou walahou l-hamdou, la ilaha illa llahou wala hawla wala qouwwata illa billah

**Français** : Il n’y a de divinité digne d’adoration qu’Allah, et Allah est le plus grand. Il n’y a de divinité digne d’adoration qu’Allah, Seul. Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. Il n’y a de divinité digne d’adoration qu’Allah : à Lui la royauté et à Lui la louange. Il n’y a de divinité digne d’adoration qu’Allah, et il n’y a de force ni de puissance qu’en Allah.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Malade qui n’espère plus vivre », invocation n° 3. At-Tirmidhi, Ibn Majah ; jugé sahih par al-Albani (Sahih at-Tirmidhi 3/152 ; Sahih Ibn Majah 2/317).

*Renvoi d’origine (arabe)* : أخرجه الترمذي وابن ماجه وصححه الألباني ، وانظر صحيح الترمذي 3/152وصحيح ابن ماجه 2/317

### Douleur dans le corps n° 1

**Arabe** : أَعُوذُ بِاللَّهِ وَقُدْرَتِهِ مِنْ شَرِّ مَا أَجِدُ وَأُحَاذِرُ

**Phonétique** : Aʿoudhou billahi waqoudratihi min charri ma adjidou wa’ouhadhir

**Français** : Je cherche refuge auprès d’Allah et de Sa puissance contre le mal de ce que je ressens et de ce que je redoute. (poser la main sur l’endroit douloureux, dire d’abord trois fois « Au nom d’Allah », puis cette formule sept fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Douleur dans le corps », invocation n° 1. Muslim 4/1728.

*Renvoi d’origine (arabe)* : مسلم 4/1728

### Quand on est effrayé n° 1

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ

**Phonétique** : La ilaha illa llah

**Français** : Il n’y a de divinité digne d’adoration qu’Allah ! (exclamation quand on est effrayé ou saisi par un événement grave)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Quand on est effrayé », invocation n° 1. Al-Bukhari, Fath al-Bari 6/181 ; Muslim 4/2208.

*Renvoi d’origine (arabe)* : البخاري مع الفتح 6/ 181 ، ومسلم 4/ 2208
