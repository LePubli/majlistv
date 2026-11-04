# Dhikr du deuil — fiche de relecture

14 entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.

## Ce qu’il faut vérifier

1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.
2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.
3. **Choix de l’assistant** : seules les formules à dire sont reprises. Non repris : « Celui dont les dernières paroles sont lā ilāha illā llāh entrera au Paradis » (c’est un hadith sur le fait de souffler la formule au mourant, pas une formule ; le texte arabe « lā ilāha illā llāh » existe déjà dans le lot précédent) ; les consignes pratiques. Les invocations qui demandent de dire le nom du défunt sont gardées avec « un tel » en arabe, le français le précise. Les entrées « Prière funéraire pour un enfant » n° 1 et 2 viennent du même chapitre du recueil, coupé en deux formules.
4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).
5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; certains renvois sont abrégés ou regroupent des formules ; le renvoi d’origine en arabe est donné sous chaque entrée.
6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment la prière funéraire et les condoléances). **Phonétique** : générée par règles, sans tajwid.

## Les invocations

### Quand un malheur survient n° 1

**Arabe** : إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ، اللَّهُمَّ أْجُرْنِي فِي مُصِيبَتِي، وَأَخْلِفْ لِي خَيْرَاً مِنْهَا

**Phonétique** : Inna lillahi wa’inna ilayhi radjiʿouna, Allahoumma djourni fi mousibati, wa’akhlif li khayran minha

**Français** : Nous appartenons à Allah et c’est vers Lui que nous retournerons. Ô Allah, récompense-moi dans mon épreuve et donne-moi en échange quelque chose de meilleur qu’elle.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Quand un malheur survient », invocation n° 1. Muslim 2/632.

*Renvoi d’origine (arabe)* : مسلم 2/632

### En fermant les yeux du défunt n° 1

**Arabe** : اللَّهُمَّ اغْفِرْ لِفُلاَنٍ وَارْفَعْ دَرَجَتَهُ فِي الْمَهْدِيِّينَ، وَاخْلُفْهُ فِي عَقِبِهِ فِي الْغَابِرِينَ، وَاغْفِرْ لَنَا وَلَهُ يَا رَبَّ الْعَالَمِينَ، وَافْسَحْ لَهُ فِي قَبْرِهِ، وَنَوِّرْ لَهُ فِيهِ

**Phonétique** : Allahoumma-ghfir lifoulanin warfaʿ daradjatahou fi l-mahdiyyina, wakhloufhou fi ʿaqibihi fi l-ghabirina, waghfir lana walahou ya rabba l-ʿalamina, wafsah lahou fi qabrihi, wanawwir lahou fih

**Français** : Ô Allah, pardonne à un tel (dire son nom), élève son rang parmi ceux qui sont bien guidés, succède-lui auprès de ceux qu’il laisse derrière lui ; pardonne-nous et pardonne-lui, ô Seigneur des mondes ; élargis-lui sa tombe et éclaire-la pour lui.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « En fermant les yeux du défunt », invocation n° 1. Muslim 2/634.

*Renvoi d’origine (arabe)* : مسلم 2/634

### Prière funéraire pour le défunt n° 1

**Arabe** : اللَّهُمَّ اغْفِرْ لَهُ وَارْحَمْهُ، وَعَافِهِ، وَاعْفُ عَنْهُ، وَأَكْرِمْ نُزُلَهُ، وَوَسِّعْ مُدْخَلَهُ، وَاغْسِلْهُ بِالْمَاءِ وَالثَّلْجِ وَالْبَرَدِ، وَنَقِّهِ مِنَ الْخَطَايَا كَمَا نَقَّيْتَ الثَّوْبَ الأَبْيَضَ مِنَ الدَّنَسِ، وَأَبْدِلْهُ دَاراً خَيْراً مِنْ دَارِهِ، وَأَهْلاً خَيْراً مِنْ أَهْلِهِ، وَزَوْجَاً خَيْراً مِنْ زَوْجِهِ، وَأَدْخِلْهُ الْجَنَّةَ، وَأَعِذْهُ مِنْ عَذَابِ الْقَبْرِ وَعَذَابِ النَّارِ

**Phonétique** : Allahoumma-ghfir lahou warhamhou, waʿafihi, waʿfou ʿanhou, wa’akrim nouzoulahou, wawassiʿ moudkhalahou, waghsilhou bil-ma’i wath-thaldji wal-baradi, wanaqqihi mina l-khataya kama naqqayta th-thawba l-abyada mina d-danasi, wa’abdilhou daran khayran min darihi, wa’ahlan khayran min ahlihi, wazawdjan khayran min zawdjihi, wa’adkhilhou l-djannata, wa’aʿidhhou min ʿadhabi l-qabri waʿadhabi n-nar

**Français** : Ô Allah, pardonne-lui, fais-lui miséricorde, accorde-lui le salut, passe sur ses fautes, honore sa demeure, élargis son entrée, lave-le avec l’eau, la neige et la grêle, purifie-le des péchés comme on purifie le vêtement blanc de la souillure, donne-lui en échange une demeure meilleure que sa demeure, une famille meilleure que sa famille, une épouse meilleure que son épouse, fais-le entrer au Paradis et protège-le du châtiment de la tombe (et du châtiment du Feu).

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prière funéraire pour le défunt », invocation n° 1. Muslim 2/663. Le passage entre crochets dans le recueil (« et du châtiment du Feu ») est repris ici.

*Renvoi d’origine (arabe)* : مسلم 2/663

### Prière funéraire pour le défunt n° 2

**Arabe** : اللَّهُمَّ اغْفِرْ لِحَيِّنَا وَمَيِّتِنَا، وَشَاهِدِنَا وَغَائِبِنَا، وَصَغِيرِنَا وَكَبِيرِنَا، وَذَكَرِنَا وَأُنْثَانَا اللَّهُمَّ مَنْ أَحْيَيْتَهُ مِنَّا فَأَحْيِهِ عَلَى الْإِسْلاَمِ، وَمَنْ تَوَفَّيْتَهُ مِنَّا فَتَوَفَّهُ عَلَى الإِيمَانِ، اللَّهُمَّ لاَ تَحْرِمْنَا أَجْرَهُ، وَلاَ تُضِلَّنَا بَعْدَهُ

**Phonétique** : Allahoumma-ghfir lihayyina wamayyitina, wachahidina wagha’ibina, wasaghirina wakabirina, wadhakarina wa’ounthana llahoumma man ahyaytahou minna fa’ahyihi ʿala l-islami, waman tawaffaytahou minna fatawaffahou ʿala l-imani, Allahoumma la tahrimna adjrahou, wala toudillana baʿdah

**Français** : Ô Allah, pardonne à nos vivants et à nos morts, à ceux qui sont présents et à ceux qui sont absents, à nos petits et à nos grands, à nos hommes et à nos femmes. Ô Allah, celui d’entre nous que Tu fais vivre, fais-le vivre dans l’islam, et celui que Tu rappelles à Toi, rappelle-le dans la foi. Ô Allah, ne nous prive pas de sa récompense et ne nous égare pas après lui.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prière funéraire pour le défunt », invocation n° 2. Ibn Majah 1/480 ; Ahmad 2/368 (voir Sahih Ibn Majah 1/251).

*Renvoi d’origine (arabe)* : ابن ماجه 1/480 وأحمد 2/368 وانظر صحيح ابن ماجة1/ 251

### Prière funéraire pour le défunt n° 3

**Arabe** : اللَّهُمَّ إِنَّ فُلاَنَ بْنَ فُلاَنٍ فِي ذِمَّتِكَ، وَحَبْلِ جِوَارِكَ، فَقِهِ مِنْ فِتْنَةِ الْقَبْرِ، وَعَذَابِ النَّارِ، وَأَنْتَ أَهْلُ الْوَفَاءِ وَالْحَقِّ، فَاغْفِرْ لَهُ وَارْحَمْهُ إِنَّكَ أَنْتَ الْغَفُورُ الرَّحِيمُ

**Phonétique** : Allahoumma inna foulana bna foulanin fi dhimmatika, wahabli djiwarika, faqihi min fitnati l-qabri, waʿadhabi n-nari, wa’anta ahlou l-wafa’i wal-haqqi, faghfir lahou warhamhou innaka anta l-ghafourou r-rahim

**Français** : Ô Allah, un tel, fils d’un tel (dire son nom), est sous Ta protection et dans le lien de Ton voisinage : préserve-le de l’épreuve de la tombe et du châtiment du Feu. Tu es digne de fidélité et de vérité : pardonne-lui et fais-lui miséricorde, car Tu es le Pardonneur, le Miséricordieux.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prière funéraire pour le défunt », invocation n° 3. Ibn Majah (voir Sahih Ibn Majah 1/251) ; Abu Dawud 3/211.

*Renvoi d’origine (arabe)* : أخرجه ابن ماجه ، وانظر صحيح ابن ماجة1/ 251ورواه أبو داود 3/211

### Prière funéraire pour le défunt n° 4

**Arabe** : اللَّهُمَّ عَبْدُكَ وَابْنُ أَمَتِكَ احْتَاجَ إِلَى رَحْمَتِكَ، وَأَنْتَ غَنِيٌّ عَنْ عَذَابِهِ، إِنْ كَانَ مُحْسِناً فَزِدْ فِي حَسَنَاتِهِ، وَإِنْ كَانَ مُسِيئاً فَتَجَاوَزْ عَنْهُ

**Phonétique** : Allahoumma ʿabdouka wabnou amatika-htadja ila rahmatika, wa’anta ghaniyyoun ʿan ʿadhabihi, in kana mouhsinan fazid fi hasanatihi, wa’in kana mousi’an fatadjawaz ʿanh

**Français** : Ô Allah, c’est Ton serviteur, fils de Ta servante : il a besoin de Ta miséricorde et Tu n’as nul besoin de le châtier. S’il était bienfaisant, augmente ses bonnes actions ; s’il était fautif, passe sur ses fautes.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prière funéraire pour le défunt », invocation n° 4. Al-Hakim 1/359 (jugé authentique, avec l’accord d’adh-Dhahabi) ; voir Ahkam al-jana’iz d’al-Albani p. 125.

*Renvoi d’origine (arabe)* : أخرجه الحاكم وصححه ووافقه الذهبي 1/359 وانظر أحكام الجنائز للألباني ص125

### Prière funéraire pour un enfant n° 1

**Arabe** : اللَّهُمَّ أَعِذْهُ مِنْ عَذَابِ الْقَبْرِ

**Phonétique** : Allahoumma aʿidhhou min ʿadhabi l-qabr

**Français** : Ô Allah, protège-le du châtiment de la tombe. (prière funéraire pour un enfant)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prière funéraire pour un enfant », invocation n° 1. Malik, al-Muwatta’ 1/288 ; Ibn Abi Shayba 3/217 ; al-Bayhaqi 4/9 : Sa‘id ibn al-Musayyab dit avoir prié derrière Abu Hurayra sur un enfant qui n’avait commis aucune faute et l’avoir entendu dire cela. Chaîne jugée authentique par Shu‘ayb al-Arna’ut (Sharh as-Sunna d’al-Baghawi 5/357).

*Renvoi d’origine (arabe)* : قال سعيد بن المسيب صليت وراء أبي هريرة على صبي لم يعمل خطيئة قط فسمعته يقول ... الحديث .أخرجه مالك في الموطأ 1/288 وابن أبي شيبه في المصنف 3/ 217 والبيهقي 4/9، وصحح إسناده شعيب الأرناؤوط في تحقيقه لشرح السنة للبغوي 5/357

### Prière funéraire pour un enfant n° 2

**Arabe** : اللَّهُمَّ اجْعَلْهُ فَرَطاً وَذُخْراً لِوَالِدَيْهِ، وَشَفِيعاً مُجَاباً، اللَّهُمَّ ثَقِّلْ بِهِ مَوَازِينَهُمَا، وَأَعْظِمْ بِهِ أُجُورَهُمَا، وَأَلْحِقْهُ بِصَالِحِ الْمُؤْمِنِينَ، وَاجْعَلْهُ فِي كَفَالَةِ إِبْرَاهِيمَ، وَقِهِ بِرَحْمَتِكَ عَذَابَ الْجَحِيمِ، وَأَبْدِلْهُ دَاراً خَيْراً مِنْ دَارِهِ، وَأَهْلاً خَيْراً مِنْ أَهْلِهِ، اللَّهُمَّ اغْفِرْ لِأَسْلاَفِنَا، وَأَفْرَاطِنَا، وَمَنْ سَبَقَنَا بِالْإِيمَانِ

**Phonétique** : Allahoumma-djʿalhou faratan wadhoukhran liwalidayhi, wachafiʿan moudjaban, Allahoumma thaqqil bihi mawazinahouma, wa’aʿdhim bihi oudjourahouma, wa’alhiqhou bisalihi l-mou’minina, wadjʿalhou fi kafalati ibrahima, waqihi birahmatika ʿadhaba l-djahimi, wa’abdilhou daran khayran min darihi, wa’ahlan khayran min ahlihi, Allahoumma-ghfir li’aslafina, wa’afratina, waman sabaqana bil-iman

**Français** : Ô Allah, fais-en un devancier et une réserve pour ses parents, un intercesseur dont la demande est exaucée. Ô Allah, alourdis par lui leurs balances, augmente par lui leur récompense, rattache-le aux croyants vertueux, place-le sous la garde d’Ibrahim, préserve-le par Ta miséricorde du châtiment de la Fournaise, donne-lui en échange une demeure meilleure que sa demeure et une famille meilleure que sa famille. Ô Allah, pardonne à nos prédécesseurs, à nos devanciers et à ceux qui nous ont précédés dans la foi. (le recueil précise : si l’on dit cela, c’est bien)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prière funéraire pour un enfant », invocation n° 2. Voir Ibn Qudama, al-Mughni 3/416 ; Ibn Baz, ad-Durus al-muhimma li-‘ammat al-umma p. 15.

*Renvoi d’origine (arabe)* : انظر : المغني لابن قدامة 3/416 والدروس المهمة لعامة الأمة للشيخ عبد العزيز بن عبد الله بن باز حفظه الله ص15

### Prière funéraire pour un enfant n° 3

**Arabe** : اللَّهُمَّ اجْعَلْهُ لَنَا فَرَطاً، وَسَلَفاً، وَأَجْراً

**Phonétique** : Allahoumma-djʿalhou lana faratan, wasalafan, wa’adjra

**Français** : Ô Allah, fais de lui pour nous un devancier, un précurseur et une récompense.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prière funéraire pour un enfant », invocation n° 3. Al-Hasan (al-Basri) récitait al-Fatiha sur l’enfant puis disait cela : al-Baghawi, Sharh as-Sunna 5/357 ; ‘Abd ar-Razzaq n° 6588 ; al-Bukhari (cité sans chaîne), Kitab al-jana’iz, chapitre 65, 2/113.

*Renvoi d’origine (arabe)* : كان الحسن يقرأ على الطفل بفاتحة الكتاب ويقول .. الحديث أخرجه البغوي في شرح السنة 5/357وعبد الرزاق برقم 6588، وعلقه البخاري في كتاب الجنائز ، 65باب قراءة فاتحة الكتاب على الجنازة 2/113

### Condoléances n° 1

**Arabe** : إِنَّ لِلَّهِ مَا أَخَذَ، وَلَهُ مَا أَعْطَى، وَكُلُّ شَيْءٍ عِنْدَهُ بِأَجَلٍ مُسَمَّى فَلْتَصْبِرْ وَلْتَحْتَسِبْ

**Phonétique** : Inna lillahi ma akhadha, walahou ma aʿta, wakoullou chay’in ʿindahou bi’adjalin mousamma faltasbir waltahtasib

**Français** : À Allah appartient ce qu’Il a repris et à Lui ce qu’Il a donné, et toute chose a auprès de Lui un terme fixé... Qu’elle patiente et espère la récompense d’Allah. (paroles du Prophète, transmises à une de ses filles qui le faisait appeler au chevet de son enfant mourant)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Condoléances », invocation n° 1. Al-Bukhari 2/80 ; Muslim 2/636.

*Renvoi d’origine (arabe)* : البخاري 2/80 ومسلم 2/636

### Condoléances n° 2

**Arabe** : أَعْظَمَ اللَّهُ أَجْرَكَ، وَأَحْسَنَ عَزَاءَكَ، وَغَفَرَ لِمَيِّتِكَ

**Phonétique** : Aʿdhama llahou adjraka, wa’ahsana ʿaza’aka, waghafara limayyitik

**Français** : Qu’Allah rende grande ta récompense, embellisse ton réconfort et pardonne à ton défunt. (formule de condoléances)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Condoléances », invocation n° 2. An-Nawawi, al-Adhkar p. 126.

*Renvoi d’origine (arabe)* : الأذكار للنووي ص126

### En déposant le défunt dans la tombe n° 1

**Arabe** : بِسْمِ اللَّهِ وَعَلَى سُنَّةِ رَسُولِ اللَّهِ

**Phonétique** : Bismi llahi waʿala sounnati rasouli llah

**Français** : Au nom d’Allah et selon la tradition du Messager d’Allah. (en déposant le défunt dans la tombe)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « En déposant le défunt dans la tombe », invocation n° 1. Abu Dawud 3/314, chaîne authentique. Ahmad rapporte la variante « selon la religion du Messager d’Allah », chaîne authentique.

*Renvoi d’origine (arabe)* : أبو داود 3/314بسند صحيح وأحمد بلفظ بسم الله وعلى ملة رسول الله وسنده صحيح

### Après l’enterrement n° 1

**Arabe** : اللَّهُمَّ اغْفِرْ لَهُ، اللَّهُمَّ ثَبِّتْهُ

**Phonétique** : Allahoumma-ghfir lahou, Allahoumma thabbith

**Français** : Ô Allah, pardonne-lui. Ô Allah, affermis-le. (après l’enterrement)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Après l’enterrement », invocation n° 1. Abu Dawud 3/315 ; al-Hakim 1/370 (jugé authentique, avec l’accord d’adh-Dhahabi) : après l’enterrement, le Prophète se tenait près de la tombe et disait : « Demandez pardon pour votre frère et demandez pour lui l’affermissement, car il est interrogé maintenant ».

*Renvoi d’origine (arabe)* : كان النبي صلى الله عليه وسلم إذا فرغ من دفن الميت وقف عليه فقال : استغفروا لأخيكم وسلوا له التثبيت فإنه الآن يُسأل .أبو داود 3/315 والحاكم وصححه ووافقه الذهبي 1/370

### Visite des tombes n° 1

**Arabe** : السَّلاَمُ عَلَيْكُمْ أَهْلَ الدِّيَارِ، مِنَ الْمُؤْمِنِينَ وَالْمُسْلِمِينَ، وَإِنَّا إِنْ شَاءَ اللَّهُ بِكُمْ لاَحِقُونَ، وَيَرْحَمُ اللَّهُ الْمُسْتَقْدِمِينَ مِنَّا وَالْمُسْتَأْخِرِينَ أَسْأَلُ اللَّهَ لَنَا وَلَكُمُ الْعَافِيَةَ

**Phonétique** : As-salamou ʿalaykoum ahla d-diyari, mina l-mou’minina wal-mouslimina, wa’inna in cha’a llahou bikoum lahiqouna, wayarhamou llahou l-moustaqdimina minna wal-mousta’khirina as’alou llaha lana walakoumou l-ʿafiyah

**Français** : Que la paix soit sur vous, habitants de ces demeures, croyants et musulmans. Si Allah le veut, nous vous rejoindrons. (Qu’Allah fasse miséricorde à ceux d’entre nous qui sont partis les premiers et à ceux qui partiront plus tard.) Je demande à Allah le salut pour nous et pour vous.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Visite des tombes », invocation n° 1. Muslim 2/671 ; Ibn Majah 1/494 (dont est la formulation), d’après Buraida ; le passage entre crochets vient du hadith de ‘A’isha (Muslim 2/671).

*Renvoi d’origine (arabe)* : سلمم2/671 ،وابن ماجه واللفظ له 1/494 عن بريدة رضي الله عنه ، وما بين المعكوفين من حديث عائشة رضي الله عنها عند مسلم 2/671
