# Dhikr de la prière — fiche de relecture

43 entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.

## Ce qu’il faut vérifier

1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.
2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.
3. **Choix de l’assistant** : ces invocations se disent PENDANT la prière (ou autour de l’appel) : classées en « général » car la catégorie « après la prière » est réservée à ce qui suit le salut. Les formules identiques à plusieurs endroits (inclinaison / prosternation, prosternation / qunut) sont reprises une seule fois, avec la mention des deux emplacements, car l’application écarte les doublons. Non repris : les consignes sans formule (prière sur le Prophète après l’appel, invocation libre entre l’appel et l’iqama). Les passages entre crochets du recueil (variantes) sont gardés dans les textes d’ouverture de nuit, d’inclinaison et de qunut.
4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).
5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; certains renvois sont abrégés ou regroupent des formules ; le renvoi d’origine en arabe est donné sous chaque entrée.
6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment les longues invocations d’ouverture, de fin de prière et du qunut). **Phonétique** : générée par règles, sans tajwid.

## Les invocations

### Appel à la prière (adhan) n° 1

**Arabe** : لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ

**Phonétique** : La hawla wala qouwwata illa billah

**Français** : Il n’y a de force ni de puissance qu’en Allah. (réponse du fidèle quand le muezzin dit « Venez à la prière » et « Venez à la réussite » ; pour le reste de l’appel, répéter ce que dit le muezzin)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Appel à la prière (adhan) », invocation n° 1. Al-Bukhari 1/152 ; Muslim 1/288.

*Renvoi d’origine (arabe)* : البخاري 1/ 152 ومسلم 1/ 288

### Appel à la prière (adhan) n° 2

**Arabe** : وَأَنَا أَشْهَدُ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ وَأَنَّ مُحَمَّداً عَبْدُهُ وَرَسُولُهُ، رَضِيتُ بِاللَّهِ رَبَّاً، وَبِمُحَمَّدٍ رَسُولاً، وَبِالْإِسْلاَمِ دِينَاً

**Phonétique** : Wa’ana achhadou an la ilaha illa llahou wahdahou la charika lahou wa’anna mouhammadan ʿabdouhou warasoulouhou, raditou billahi rabban, wabimouhammadin rasoulan, wabil-islami dina

**Français** : Et moi aussi, j’atteste qu’il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé, et que Muhammad est Son serviteur et Son messager. J’agrée Allah comme Seigneur, Muhammad comme messager et l’islam comme religion. (à dire après le témoignage du muezzin)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Appel à la prière (adhan) », invocation n° 2. Muslim 1/290.

*Renvoi d’origine (arabe)* : مسلم 1/290

### Appel à la prière (adhan) n° 3

**Arabe** : اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ، وَالصَّلاَةِ الْقَائِمَةِ، آتِ مُحَمَّداً الْوَسِيلَةَ وَالْفَضِيلَةَ، وَابْعَثْهُ مَقَامَاً مَحْمُوداً الَّذِي وَعَدْتَهُ، إِنَّكَ لَا تُخْلِفُ الْمِيعَادَ

**Phonétique** : Allahoumma rabba hadhihi d-daʿwati t-tammati, was-salati l-qa’imati, ati mouhammadan al-wasilata wal-fadilata, wabʿathhou maqaman mahmoudan alladhi waʿadtahou, innaka la toukhlifou l-miʿad

**Français** : Ô Allah, Seigneur de cet appel parfait et de la prière qui va s’accomplir, accorde à Muhammad la Wasila et la Fadila, et ressuscite-le à la place louée que Tu lui as promise, car Tu ne manques pas à Ta promesse. (à dire après l’appel, après avoir prié sur le Prophète)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Appel à la prière (adhan) », invocation n° 3. Al-Bukhari 1/152. La dernière phrase (« car Tu ne manques pas à Ta promesse ») est un ajout d’al-Bayhaqi 1/410, dont Ibn Baz a jugé la chaîne hassan (Tuhfat al-akhyar p. 38). Entre l’appel et l’iqama, l’invocation n’est pas rejetée (at-Tirmidhi, Abu Dawud, Ahmad ; voir Irwa’ al-ghalil 1/262).

*Renvoi d’origine (arabe)* : البخاري 1/ 152 وما بين المعكوفين للبيهقي 1/ 410 وحسن إسناده العلامة عبد العزيز بن باز في تحفة الأخيار ص 38

### Ouverture de la prière n° 1

**Arabe** : اللَّهُمَّ بَاعِدْ بَيْنِي وَبَيْنَ خَطَايَايَ كَمَا بَاعَدْتَ بَيْنَ الْمَشْرِقِ وَالْمَغْرِبِ، اللَّهُمَّ نَقِّنِي مِنْ خَطَايَايَ كَمَا يُنَقَّى الثَّوْبُ الْأَبْيَضُ مِنَ الدَّنَسِ، اللَّهُمَّ اغْسِلْنِي مِنْ خَطَايَايَ، بِالثَّلْجِ وَالْمَاءِ وَالْبَرَدِ

**Phonétique** : Allahoumma baʿid bayni wabayna khatayaya kama baʿadta bayna l-machriqi wal-maghribi, Allahoumma naqqini min khatayaya kama younaqqa th-thawbou l-abyadou mina d-danasi, Allahoumma-ghsilni min khatayaya, bith-thaldji wal-ma’i wal-barad

**Français** : Ô Allah, éloigne-moi de mes péchés comme Tu as éloigné l’orient de l’occident. Ô Allah, purifie-moi de mes péchés comme on purifie le vêtement blanc de la souillure. Ô Allah, lave-moi de mes péchés avec la neige, l’eau et la grêle.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Ouverture de la prière », invocation n° 1. Al-Bukhari 1/181 ; Muslim 1/419.

*Renvoi d’origine (arabe)* : البخاري 1/ 181 ومسلم 1/ 419

### Ouverture de la prière n° 2

**Arabe** : سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، وَتَبَارَكَ اسْمُكَ، وَتَعَالَى جَدُّكَ، وَلاَ إِلَهَ غَيْرُكَ

**Phonétique** : Soubhanaka llahoumma wabihamdika, watabaraka-smouka, wataʿala djaddouka, wala ilaha ghayrouk

**Français** : Gloire et louange à Toi, ô Allah ; béni soit Ton nom, élevée soit Ta majesté, et il n’y a de divinité digne d’adoration en dehors de Toi.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Ouverture de la prière », invocation n° 2. Les auteurs des quatre Sunan (voir Sahih at-Tirmidhi 1/77 ; Sahih Ibn Majah 1/135).

*Renvoi d’origine (arabe)* : أخرجه أصحاب السنن الأربعة وانظر صحيح الترمذي 1/77 وصحيح ابن ماجه 1/ 135

### Ouverture de la prière n° 3

**Arabe** : وَجَّهْتُ وَجْهِيَ لِلَّذِي فَطَرَ السَّمَوَاتِ وَالأَرْضَ حَنِيفَاً وَمَا أَنَا مِنَ الْمُشْرِكِينَ، إِنَّ صَلاَتِي، وَنُسُكِي، وَمَحْيَايَ، وَمَمَاتِي لِلَّهِ رَبِّ الْعَالَمِينَ، لاَ شَرِيكَ لَهُ وَبِذَلِكَ أُمِرْتُ وَأَنَا مِنَ الْمُسْلِمِينَ اللَّهُمَّ أَنْتَ المَلِكُ لاَ إِلَهَ إِلاَّ أَنْتَ، أَنْتَ رَبِّي وَأَنَا عَبْدُكَ، ظَلَمْتُ نَفْسِي وَاعْتَرَفْتُ بِذَنْبِي فَاغْفِرْ لِي ذُنُوبِي جَمِيعَاً إِنَّهُ لاَ يَغْفِرُ الذُّنُوبَ إِلاَّ أَنْتَ وَاهْدِنِي لِأَحْسَنِ الْأَخْلاَقِ لاَ يَهْدِي لِأَحْسَنِهَا إِلاَّ أَنْتَ، وَاصْرِفْ عَنِّي سَيِّئَهَا، لاَ يَصْرِفُ عَنِّي سَيِّئَهَا إِلاَّ أَنْتَ، لَبَّيْكَ وَسَعْدَيْكَ، وَالخَيْرُ كُلُّهُ بِيَـــــــدَيْكَ، وَالشَّـــــرُّ لَيْسَ إِلَيْــــــكَ، أَنَا بِكَ وَإِلَيْكَ، تَبَارَكْتَ وَتَعَالَيْتَ، أَسْتَغْفِرُكَ وَأَتُوبُ إِلَيْكَ

**Phonétique** : Wadjdjahtou wadjhiya lilladhi fatara s-samawati wal-arda hanifan wama ana mina l-mouchrikina, inna salati, wanousouki, wamahyaya, wamamati lillahi rabbi l-ʿalamina, la charika lahou wabidhalika oumirtou wa’ana mina l-mouslimina llahoumma anta l-malikou la ilaha illa anta, anta rabbi wa’ana ʿabdouka, dhalamtou nafsi waʿtaraftou bidhanbi faghfir li dhounoubi djamiʿan innahou la yaghfirou dh-dhounouba illa anta wahdini li’ahsani l-akhlaqi la yahdi li’ahsaniha illa anta, wasrif ʿanni sayyi’aha, la yasrifou ʿanni sayyi’aha illa anta, labbayka wasaʿdayka, wal-khayrou koullouhou biyadayka, wach-charrou laysa ilayka, ana bika wa’ilayka, tabarakta wataʿalayta, astaghfirouka wa’atoubou ilayk

**Français** : J’ai tourné mon visage, en pur croyant, vers Celui qui a créé les cieux et la terre, et je ne suis pas du nombre des associateurs. Ma prière, mes actes d’adoration, ma vie et ma mort appartiennent à Allah, Seigneur des mondes, qui n’a pas d’associé ; c’est cela qui m’a été ordonné et je suis du nombre des musulmans. Ô Allah, Tu es le Souverain, il n’y a de divinité digne d’adoration que Toi. Tu es mon Seigneur et je suis Ton serviteur ; je me suis fait du tort à moi-même et je reconnais mon péché : pardonne-moi tous mes péchés, car nul ne pardonne les péchés en dehors de Toi. Guide-moi vers le meilleur comportement, car nul ne guide vers le meilleur en dehors de Toi, et détourne de moi le mauvais, car nul n’en détourne en dehors de Toi. Me voici à Ton service, et le bonheur est auprès de Toi ; tout le bien est entre Tes mains et le mal ne T’est pas attribué. Je suis par Toi et vers Toi. Tu es béni et exalté. Je Te demande pardon et je me repens à Toi.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Ouverture de la prière », invocation n° 3. Muslim 1/534.

*Renvoi d’origine (arabe)* : رواه مسلم1/ 534

### Ouverture de la prière n° 4

**Arabe** : اللَّهُمَّ رَبَّ جِبْرَائِيلَ، وَمِيْكَائِيلَ، وَإِسْرَافِيلَ، فَاطِرَ السَّمَوَاتِ وَالأَرْضِ، عَالِمَ الْغَيْبِ وَالشَّهَادَةِ أَنْتَ تَحْكُمُ بَيْنَ عِبَادِكَ فِيمَا كَانُوا فِيهِ يَخْتَلِفُونَ اهْدِنِي لِمَا اخْتُلِفَ فِيهِ مِنَ الْحَقِّ بِإِذْنِكَ إِنَّكَ تَهْدِي مَنْ تَشَاءُ إِلَى صِرَاطٍ مُسْتَقِيمٍ

**Phonétique** : Allahoumma rabba djibra’ila, wamika’ila, wa’israfila, fatira s-samawati wal-ardi, ʿalima l-ghaybi wach-chahadati anta tahkoumou bayna ʿibadika fima kanou fihi yakhtalifouna-hdini lima-khtoulifa fihi mina l-haqqi bi’idhnika innaka tahdi man tacha’ou ila siratin moustaqim

**Français** : Ô Allah, Seigneur de Jibril, de Mikail et d’Israfil, Créateur des cieux et de la terre, Connaisseur de l’invisible et du visible, Tu juges entre Tes serviteurs de ce sur quoi ils divergeaient. Guide-moi, par Ta permission, vers la vérité dans ce sur quoi on a divergé, car Tu guides qui Tu veux vers un chemin droit.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Ouverture de la prière », invocation n° 4. Muslim 1/534 (récit de ‘A’isha, ouverture de la prière de nuit).

*Renvoi d’origine (arabe)* : رواه مسلم1/ 534

### Ouverture de la prière n° 5

**Arabe** : اللَّهُ أَكْبَرُ كَبِيرَاً، اللَّهُ أَكْبَرُ كَبِيراً، اللَّهُ أَكْبَرُ كَبِيراً، وَالْحَمْدُ لِلَّهِ كَثِيراً، وَالْحَمْدُ لِلَّهِ كَثِيراً، وَالْحَمْدُ لِلَّهِ كَثِيراً، وَسُبْحَانَ اللَّهِ بُكْرَةً وَأَصِيلاً أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ: مِنْ نَفْخِهِ، وَنَفْثِهِ، وَهَمْزِهِ

**Phonétique** : Allahou akbarou kabiran, Allahou akbarou kabiran, Allahou akbarou kabiran, wal-hamdou lillahi kathiran, wal-hamdou lillahi kathiran, wal-hamdou lillahi kathiran, wasoubhana llahi boukratan wa’asilan aʿoudhou billahi mina ch-chaytani, min nafkhihi, wanafthihi, wahamzih

**Français** : Allah est infiniment grand (trois fois) ; louange abondante à Allah (trois fois) ; gloire à Allah matin et soir. (trois fois) Je cherche refuge auprès d’Allah contre Satan : contre son souffle, son crachat et son murmure.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Ouverture de la prière », invocation n° 5. Abu Dawud 1/203 ; Ibn Majah 1/265 ; Ahmad 4/85 ; Muslim 1/420 rapporte un récit proche d’Ibn ‘Umar, avec une histoire.

*Renvoi d’origine (arabe)* : أخرجه أبو داود 1/ 203 وابن ماجه 1/ 265 وأحمد 4/85 وأخرجه مسلم عن ابن عمر رضي الله عنهماا بنحوه وفيه قصة 1/ 420

### Ouverture de la prière n° 6

**Arabe** : اللَّهُمَّ لَكَ الْحَمْدُ، أَنْتَ نُورُ السَّمَوَاتِ وَالأَرْضِ وَمَنْ فِيهِنَّ، وَلَكَ الْحَمْدُ أَنْتَ قَيِّمُ السَّمَوَاتِ وَالأَرْضِ وَمَنْ فِيهِنَّ، وَلَكَ الْحَمْدُ أَنْتَ رَبُّ السَّمَواتِ وَالأَرْضِ وَمَنْ فِيهِنَّ وَلَكَ الْحَمْدُ لَكَ مُلْكُ السَّمَوَاتِ وَالأَرْضِ وَمَنْ فِيهِنَّ وَلَكَ الْحَمْدُ أَنْتَ مَلِكُ السَّمَوَاتِ وَالأَرْضِ وَلَكَ الْحَمْدُ أَنْتَ الْحَقُّ، وَوَعْدُكَ الْحَقُّ، وَقَوْلُكَ الْحَقُّ، وَلِقَاؤُكَ الْحَقُّ، وَالْجَنَّةُ حَقٌّ، وَالنَّارُ حَقٌّ، وَالنَّبِيُّونَ حَقٌّ، وَمُحَمَّدٌ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ حَقٌّ، وَالسَّاعَةُ حَقٌّ اللَّهُمَّ لَكَ أَسْلَمْتُ، وَعَلَيْكَ تَوَكَّلْتُ، وَبِكَ آمَنْتُ، وَإِلَيْكَ أَنَبْتُ، وَبِكَ خَاصَمْتُ، وَإِلَيْكَ حَاكَمْتُ فَاغْفِرْ لِي مَا قَدَّمْتُ، وَمَا أَخَّرْتُ، وَمَا أَسْرَرْتُ، وَمَا أَعْلَنْتُ وَمَا أَنْتَ أَعْلَمُ بِهِ مِنِّي أَنْتَ المُقَدِّمُ، وَأَنْتَ المُؤَخِّرُ لاَ إِلَهَ إِلاَّ أَنْتَ أَنْتَ إِلَهِي لاَ إِلَهَ إِلاَّ أَنْتَ وَلاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ

**Phonétique** : Allahoumma laka l-hamdou, anta nourou s-samawati wal-ardi waman fihinna, walaka l-hamdou anta qayyimou s-samawati wal-ardi waman fihinna, walaka l-hamdou anta rabbou s-samawti wal-ardi waman fihinna walaka l-hamdou laka moulkou s-samawati wal-ardi waman fihinna walaka l-hamdou anta malikou s-samawati wal-ardi walaka l-hamdou anta l-haqqou, wawaʿdouka l-haqqou, waqawlouka l-haqqou, waliqa’ouka l-haqqou, wal-djannatou haqqoun, wan-narou haqqoun, wan-nabiyyouna haqqoun, wamouhammadoun salla llahou ʿalayhi wasallama haqqoun, was-saʿatou haqqoun Allahoumma laka aslamtou, waʿalayka tawakkaltou, wabika amantou, wa’ilayka anabtou, wabika khasamtou, wa’ilayka hakamtou faghfir li ma qaddamtou, wama akhkhartou, wama asrartou, wama aʿlantou wama anta aʿlamou bihi minni anta l-mouqaddimou, wa’anta l-mou’akhkhirou la ilaha illa anta anta ilahi la ilaha illa anta wala hawla wala qouwwata illa billah

**Français** : Ô Allah, à Toi la louange : Tu es la lumière des cieux et de la terre et de ceux qui s’y trouvent. À Toi la louange : Tu es le Soutien des cieux et de la terre et de ceux qui s’y trouvent. À Toi la louange : Tu es le Seigneur des cieux et de la terre et de ceux qui s’y trouvent. À Toi la louange : à Toi la royauté des cieux et de la terre et de ceux qui s’y trouvent. À Toi la louange : Tu es le Roi des cieux et de la terre. À Toi la louange. Tu es la Vérité, Ta promesse est vérité, Ta parole est vérité, Ta rencontre est vérité, le Paradis est vérité, le Feu est vérité, les prophètes sont vérité, Muhammad est vérité et l’Heure est vérité. Ô Allah, à Toi je me suis soumis, en Toi j’ai placé ma confiance, en Toi j’ai cru, vers Toi je me suis repenti, par Toi j’ai disputé et à Toi j’ai recouru pour juger. Pardonne-moi ce que j’ai fait avant et après, en secret et en public, ce que Tu connais mieux que moi. Tu es Celui qui avance et Celui qui retarde ; il n’y a de divinité digne d’adoration que Toi, Tu es mon Dieu, il n’y a de divinité digne d’adoration que Toi, et il n’y a de force ni de puissance qu’en Allah. (ouverture de la prière de nuit)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Ouverture de la prière », invocation n° 6. Al-Bukhari, Fath al-Bari 3/3, 11/116, 13/371, 423, 465 ; Muslim 1/532 (version abrégée proche). Les passages entre crochets dans le recueil sont des variantes selon les récits : ils sont tous repris ici.

*Renvoi d’origine (arabe)* : البخاري مع الفتح 3/3 و11/116 و 13/ 371 423، 465 ومسلم مختصراً بنحوه 1/ 532

### Inclinaison (ruku‘) n° 1

**Arabe** : سُبْحَانَ رَبِّيَ الْعَظِيمِ

**Phonétique** : Soubhana rabbiya l-ʿadhim

**Français** : Gloire à mon Seigneur, le Très-Grand. (trois fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Inclinaison (ruku‘) », invocation n° 1. Les auteurs des Sunan et Ahmad (voir Sahih at-Tirmidhi 1/83).

*Renvoi d’origine (arabe)* : أخرجه أهل السنن وأحمد وانظر صحيح الترمذي 1/83

### Inclinaison (ruku‘) n° 2

**Arabe** : سُبْحَانَكَ اللَّهُمَّ رَبَّنَا وَبِحَمْدِكَ، اللَّهُمَّ اغْفِرْ لِي

**Phonétique** : Soubhanaka llahoumma rabbana wabihamdika, Allahoumma-ghfir li

**Français** : Gloire et louange à Toi, ô Allah notre Seigneur ; ô Allah, pardonne-moi. (à l’inclinaison et à la prosternation)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Inclinaison (ruku‘) », invocation n° 2. Al-Bukhari 1/199 ; Muslim 1/350. Même formule en prosternation.

*Renvoi d’origine (arabe)* : البخاري 1/199 ومسلم 1/ 350

### Inclinaison (ruku‘) n° 3

**Arabe** : سُبُّوُحٌ، قُدُّوسٌ، رَبُّ المَلاَئِكَةِ وَالرُّوحِ

**Phonétique** : Soubbouwouhoun, qouddousoun, rabbou l-mala’ikati war-rouh

**Français** : Gloire au Très-Saint, Seigneur des anges et de l’Esprit. (à l’inclinaison et à la prosternation)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Inclinaison (ruku‘) », invocation n° 3. Muslim 1/353 ; Abu Dawud 1/230. Même formule en prosternation (Muslim 1/533).

*Renvoi d’origine (arabe)* : مسلم 1/ 353 وأبو داود 1/230

### Inclinaison (ruku‘) n° 4

**Arabe** : اللَّهُمَّ لَكَ رَكَعْتُ، وَبِكَ آمَنْتُ، وَلَكَ أَسْلَمْتُ، خَشَعَ لَكَ سَمْعِي، وَبَصَرِي، وَمُخِّي، وَعَــــظْمِي، وَعَصَبِي، وَمَا اسْتَقَلَّتْ بِهِ قَدَمِي

**Phonétique** : Allahoumma laka rakaʿtou, wabika amantou, walaka aslamtou, khachaʿa laka samʿi, wabasari, wamoukhkhi, waʿadhmi, waʿasabi, wama-staqallat bihi qadami

**Français** : Ô Allah, c’est pour Toi que je me suis incliné, en Toi que j’ai cru, à Toi que je me suis soumis ; mon ouïe, ma vue, ma moelle, mes os et mes nerfs, et ce que porte mon pied, se sont humiliés devant Toi.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Inclinaison (ruku‘) », invocation n° 4. Muslim 1/534 ; les auteurs des Sunan sauf Ibn Majah. Le passage entre crochets (« et ce que porte mon pied ») est une variante reprise ici.

*Renvoi d’origine (arabe)* : مسلم 1/534 والأربعة إلا ابن ماجه

### Inclinaison (ruku‘) n° 5

**Arabe** : سُبْحَانَ ذِي الْجَبَرُوتِ، وَالْمَلَكُوتِ، وَالْكِبْرِيَاءِ، وَالْعَظَمَةِ

**Phonétique** : Soubhana dhi l-djabarouti, wal-malakouti, wal-kibriya’i, wal-ʿadhamah

**Français** : Gloire à Celui qui possède la puissance, la souveraineté, la grandeur et la majesté. (à l’inclinaison et à la prosternation)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Inclinaison (ruku‘) », invocation n° 5. Abu Dawud 1/230 ; an-Nasa’i ; Ahmad (chaîne hassan). Même formule en prosternation.

*Renvoi d’origine (arabe)* : أبو داود 1/ 230 والنسائي وأحمد وإسناده حسن

### Relèvement de l’inclinaison n° 1

**Arabe** : سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ

**Phonétique** : Samiʿa llahou liman hamidah

**Français** : Allah entend celui qui Le loue. (en se relevant de l’inclinaison)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Relèvement de l’inclinaison », invocation n° 1. Al-Bukhari, Fath al-Bari 2/282.

*Renvoi d’origine (arabe)* : البخاري مع الفتح 2/ 282

### Relèvement de l’inclinaison n° 2

**Arabe** : رَبَّنَا وَلَكَ الْحَمْدُ، حَمْداً كَثِيراً طَيِّباً مُبَارَكاً فِيهِ

**Phonétique** : Rabbana walaka l-hamdou, hamdan kathiran tayyiban moubarakan fih

**Français** : Notre Seigneur, à Toi la louange, une louange abondante, excellente et bénie.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Relèvement de l’inclinaison », invocation n° 2. Al-Bukhari, Fath al-Bari 2/282.

*Renvoi d’origine (arabe)* : البخاري مع الفتح 2/ 282

### Relèvement de l’inclinaison n° 3

**Arabe** : مِلْءَ السَّمَوَاتِ وَمِلْءَ الأَرْضِ، وَمَا بَيْنَهُمَا، وَمِلْءَ مَا شِئْتَ مِنْ شَيءٍ بَعْدُ أَهْلَ الثَّنَاءِ وَالْمَجْدِ، أَحَقُّ مَا قَالَ الْعَبْدُ، وَكُلُّنَا لَكَ عَبْدٌ اللَّهُمَّ لاَ مَانِعَ لِمَا أَعْطَيْتَ، وَلاَ مُعْطِيَ لِمَا مَنَعْتَ، وَلاَ يَنْفَعُ ذَا الجَدِّ مِنْكَ الْجَدُّ

**Phonétique** : Mil’a s-samawati wamil’a l-ardi, wama baynahouma, wamil’a ma chi’ta min chay’in baʿdou ahla th-thana’i wal-madjdi, ahaqqou ma qala l-ʿabdou, wakoullouna laka ʿabdoun Allahoumma la maniʿa lima aʿtayta, wala mouʿtiya lima manaʿta, wala yanfaʿou dha l-djaddi minka l-djadd

**Français** : Autant que remplissent les cieux, la terre, ce qui est entre eux et tout ce que Tu voudras ensuite. Toi qui es digne de la louange et de la gloire : c’est ce que le serviteur a dit de plus vrai, et nous sommes tous Tes serviteurs. Ô Allah, nul ne peut empêcher ce que Tu donnes, nul ne peut donner ce que Tu empêches, et la richesse du riche ne lui sert à rien auprès de Toi.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Relèvement de l’inclinaison », invocation n° 3. Muslim 1/346.

*Renvoi d’origine (arabe)* : مسلم 1/ 346

### Prosternation (sujud) n° 1

**Arabe** : سُبْحَانَ رَبِّيَ الأَعْلَى

**Phonétique** : Soubhana rabbiya l-aʿla

**Français** : Gloire à mon Seigneur, le Très-Haut. (trois fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prosternation (sujud) », invocation n° 1. Les auteurs des Sunan et Ahmad (voir Sahih at-Tirmidhi 1/83).

*Renvoi d’origine (arabe)* : أخرجه أهل السنن وأحمد وانظر صحيح الترمذي 1/83

### Prosternation (sujud) n° 2

**Arabe** : اللَّهُمَّ لَكَ سَجَدْتُ وَبِكَ آمَنْتُ، وَلَكَ أَسْلَمْتُ، سَجَدَ وَجْهِيَ لِلَّذِي خَلَقَهُ، وَصَوَّرَهُ، وَشَقَّ سَمْعَهُ وَبَصَرَهُ، تَبَارَكَ اللَّهُ أَحْسَنُ الْخَالِقِينَ

**Phonétique** : Allahoumma laka sadjadtou wabika amantou, walaka aslamtou, sadjada wadjhiya lilladhi khalaqahou, wasawwarahou, wachaqqa samʿahou wabasarahou, tabaraka llahou ahsanou l-khaliqin

**Français** : Ô Allah, c’est pour Toi que je me suis prosterné, en Toi que j’ai cru, à Toi que je me suis soumis. Mon visage s’est prosterné devant Celui qui l’a créé, façonné, et lui a ouvert l’ouïe et la vue. Béni soit Allah, le meilleur des créateurs.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prosternation (sujud) », invocation n° 2. Muslim 1/534 et d’autres.

*Renvoi d’origine (arabe)* : مسلم1/ 534 وغيره

### Prosternation (sujud) n° 3

**Arabe** : اللَّهُمَّ اغْفِرْ لِي ذَنْبِي كُلَّهُ: دِقَّهُ وَجِلَّهُ، وَأَوَّلَهُ وَآخِرَهُ، وَعَلاَنِيَّتَهُ وَسِرَّهُ

**Phonétique** : Allahoumma-ghfir li dhanbi koullahou, diqqahou wadjillahou, wa’awwalahou wa’akhirahou, waʿalaniyyatahou wasirrah

**Français** : Ô Allah, pardonne-moi tous mes péchés : les petits et les grands, les premiers et les derniers, les publics et les secrets.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prosternation (sujud) », invocation n° 3. Muslim 1/350.

*Renvoi d’origine (arabe)* : مسلم 1/ 350

### Prosternation (sujud) n° 4

**Arabe** : اللَّهُمَّ إِنِّي أَعُوذُ بِرِضَاكَ مِنْ سَخَطِكَ، وَبِمُعَافَاتِكَ مِنْ عُقُوبَتِكَ، وَأَعُوذُ بِكَ مِنْكَ، لاَ أُحْصِي ثَنَاءً عَلَيْكَ، أَنْتَ كَمَا أَثْنَيْتَ عَلَى نَفْسِكَ

**Phonétique** : Allahoumma inni aʿoudhou biridaka min sakhatika, wabimouʿafatika min ʿouqoubatika, wa’aʿoudhou bika minka, la ouhsi thana’an ʿalayka, anta kama athnayta ʿala nafsik

**Français** : Ô Allah, je cherche refuge dans Ton agrément contre Ton courroux, dans Ton pardon contre Ta punition, et je cherche refuge auprès de Toi contre Toi. Je ne saurais Te louer comme il faut : Tu es tel que Tu T’es loué Toi-même. (même texte au qunut du witr)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prosternation (sujud) », invocation n° 4. Muslim 1/352 ; au qunut : les auteurs des quatre Sunan et Ahmad (voir Sahih at-Tirmidhi 3/180 ; Sahih Ibn Majah 1/194).

*Renvoi d’origine (arabe)* : مسلم 1/ 352

### Assis entre les deux prosternations n° 1

**Arabe** : رَبِّ اغْفِرْ لِي، رَبِّ اغْفِرْ لِي

**Phonétique** : Rabbi-ghfir li, rabbi-ghfir li

**Français** : Seigneur, pardonne-moi ; Seigneur, pardonne-moi.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Assis entre les deux prosternations », invocation n° 1. Abu Dawud 1/231 ; voir Sahih Ibn Majah 1/148.

*Renvoi d’origine (arabe)* : أبو داود 1/ 231وانظر صحيح ابن ماجة1/ 148

### Assis entre les deux prosternations n° 2

**Arabe** : اللَّهُمَّ اغْفِرْ لِي، وَارْحَمْنِي، وَاهْدِنِي، وَاجْبُرْنِي، وَعَافِنِي، وَارْزُقْنِي، وَارْفَعْنِي

**Phonétique** : Allahoumma-ghfir li, warhamni, wahdini, wadjbourni, waʿafini, warzouqni, warfaʿni

**Français** : Ô Allah, pardonne-moi, fais-moi miséricorde, guide-moi, relève-moi, accorde-moi le bien-être et la subsistance, et élève-moi.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Assis entre les deux prosternations », invocation n° 2. Les auteurs des Sunan sauf an-Nasa’i (voir Sahih at-Tirmidhi 1/90 ; Sahih Ibn Majah 1/148).

*Renvoi d’origine (arabe)* : أخرجه أصحاب السنن إلا النسائي وانظر صحيح الترمذي 1/90 وصحيح ابن ماجه 1/ 148

### Prosternation de récitation n° 1

**Arabe** : سَجَدَ وَجْهِيَ لِلَّذِي خَلَقَهُ، وَشَقَّ سَمْعَهُ وَبَصَرَهُ بِحَوْلِهِ وَقُوَّتِهِ، ﴿فَتَبَارَكَ اللَّهُ أَحْسَنُ الْخَالِقِينَ﴾

**Phonétique** : Sadjada wadjhiya lilladhi khalaqahou, wachaqqa samʿahou wabasarahou bihawlihi waqouwwatihi, fatabaraka llahou ahsanou l-khaliqin.

**Français** : Mon visage s’est prosterné devant Celui qui l’a créé et qui lui a ouvert l’ouïe et la vue par Sa force et Sa puissance. « Béni soit Allah, le meilleur des créateurs. »

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prosternation de récitation », invocation n° 1. At-Tirmidhi 2/474 ; Ahmad 6/30 ; al-Hakim 1/220 (jugé authentique, avec l’accord d’adh-Dhahabi), à qui est due l’addition finale.

*Renvoi d’origine (arabe)* : الترمذي 2/474 وأحمد 6/30 والحاكم وصححه ووافقه الذهبي 1/ 220 والزيادة له

### Prosternation de récitation n° 2

**Arabe** : اللَّهُمَّ اكْتُبْ لِي بِهَا عِنْدَكَ أَجْراً، وَضَعْ عَنِّي بِهَا وِزْراً، وَاجْعَلْهَا لِي عِنْدَكَ ذُخْراً، وَتَقَبَّلْهَا مِنِّي كَمَا تَقَبَّلْتَهَا مِنْ عَبْدِكَ دَاوُدَ

**Phonétique** : Allahoumma-ktoub li biha ʿindaka adjran, wadaʿ ʿanni biha wizran, wadjʿalha li ʿindaka dhoukhran, wataqabbalha minni kama taqabbaltaha min ʿabdika dawoud

**Français** : Ô Allah, inscris-moi par cette prosternation une récompense auprès de Toi, décharge-moi par elle d’un fardeau, garde-la-moi auprès de Toi comme un trésor et accepte-la de moi comme Tu l’as acceptée de Ton serviteur Dawud.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prosternation de récitation », invocation n° 2. At-Tirmidhi 2/473 ; al-Hakim 1/219 (jugé authentique, avec l’accord d’adh-Dhahabi).

*Renvoi d’origine (arabe)* : الترمذي 2/473 والحاكم وصححه ووافقه الذهبي 1/ 219

### Tashahhud n° 1

**Arabe** : التَّحِيَّاتُ لِلَّهِ، وَالصَّلَواتُ، وَالطَّيِّبَاتُ، السَّلاَمُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ، السَّلاَمُ عَلَيْنَا وَعَلَى عِبَادِ اللَّهِ الصَّالِحِينَ أَشْهَدُ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ وَأَشْهَدُ أَنَّ مُحَمَّداً عَبْدُهُ وَرَسُولُهُ

**Phonétique** : At-tahiyyatou lillahi, was-salawtou, wat-tayyibatou, as-salamou ʿalayka ayyouha n-nabiyyou warahmatou llahi wabarakatouhou, as-salamou ʿalayna waʿala ʿibadi llahi s-salihina achhadou an la ilaha illa llahou wa’achhadou anna mouhammadan ʿabdouhou warasoulouh

**Français** : Les salutations, les prières et les bonnes paroles sont pour Allah. Que la paix soit sur toi, ô Prophète, ainsi que la miséricorde d’Allah et Ses bénédictions. Que la paix soit sur nous et sur les serviteurs vertueux d’Allah. J’atteste qu’il n’y a de divinité digne d’adoration qu’Allah, et j’atteste que Muhammad est Son serviteur et Son messager.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Tashahhud », invocation n° 1. Al-Bukhari, Fath al-Bari 1/13 ; Muslim 1/301.

*Renvoi d’origine (arabe)* : البخاري مع الفتح 1/13 ومسلم 1/ 301

### Prière sur le Prophète après le tashahhud n° 1

**Arabe** : اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ، وَعَلَى آلِ مُحَمَّدٍ، كَمَا صَلَّيتَ عَلَى إِبْرَاهِيمَ، وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ، اللَّهُمَّ بَارِكْ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ، كَمَا بَارَكْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ

**Phonétique** : Allahoumma salli ʿala mouhammadin, waʿala ali mouhammadin, kama sallayta ʿala ibrahima, waʿala ali ibrahima, innaka hamidoun madjidoun, Allahoumma barik ʿala mouhammadin waʿala ali mouhammadin, kama barakta ʿala ibrahima waʿala ali ibrahima, innaka hamidoun madjid

**Français** : Ô Allah, accorde Ta prière à Muhammad et à la famille de Muhammad, comme Tu l’as accordée à Ibrahim et à la famille d’Ibrahim ; Tu es digne de louange et de gloire. Ô Allah, bénis Muhammad et la famille de Muhammad, comme Tu as béni Ibrahim et la famille d’Ibrahim ; Tu es digne de louange et de gloire.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prière sur le Prophète après le tashahhud », invocation n° 1. Al-Bukhari, Fath al-Bari 6/408.

*Renvoi d’origine (arabe)* : البخاري مع الفتح 6/ 408

### Prière sur le Prophète après le tashahhud n° 2

**Arabe** : اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى أَزْوَاجِهِ وَذُرِّيَّتِهِ، كَمَا صَلَّيْتَ عَلَى آلِ إِبْرَاهِيمَ وَبَارِكْ عَلَى مُحَمَّدٍ وَعَلَى أَزْواجِهِ وَذُرِّيَّتِهِ، كَمَا بَارَكْتَ عَلَى آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ

**Phonétique** : Allahoumma salli ʿala mouhammadin waʿala azwadjihi wadhourriyyatihi, kama sallayta ʿala ali ibrahima wabarik ʿala mouhammadin waʿala azwdjihi wadhourriyyatihi, kama barakta ʿala ali ibrahima innaka hamidoun madjid

**Français** : Ô Allah, accorde Ta prière à Muhammad, à ses épouses et à sa descendance, comme Tu l’as accordée à la famille d’Ibrahim, et bénis Muhammad, ses épouses et sa descendance, comme Tu as béni la famille d’Ibrahim ; Tu es digne de louange et de gloire.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prière sur le Prophète après le tashahhud », invocation n° 2. Al-Bukhari, Fath al-Bari 6/407 ; Muslim 1/306 (dont est la formulation).

*Renvoi d’origine (arabe)* : البخاري مع الفتح 6/ 407ومسلم 1/ 306 واللفظ له

### Invocations après le dernier tashahhud, avant le salut n° 1

**Arabe** : اللَّهُــمَّ إِنِّي أَعُوذُ بِكَ مِنْ عَذَابِ الْقَبْرِ، وَمِنْ عَذَابِ جَهَنَّمَ، وَمِنْ فِتْنَةِ الْمَحْيَا وَالْمَمَاتِ، وَمِنْ شَرِّ فِتْنَةِ الْمَسِيحِ الدَّجَّالِ

**Phonétique** : Allahoumma inni aʿoudhou bika min ʿadhabi l-qabri, wamin ʿadhabi djahannama, wamin fitnati l-mahya wal-mamati, wamin charri fitnati l-masihi d-dadjdjal

**Français** : Ô Allah, je cherche refuge auprès de Toi contre le châtiment de la tombe, contre le châtiment de l’Enfer, contre l’épreuve de la vie et de la mort et contre le mal de l’épreuve du faux Messie (ad-Dajjal).

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocations après le dernier tashahhud, avant le salut », invocation n° 1. Al-Bukhari 2/102 ; Muslim 1/412 (la formulation est de Muslim).

*Renvoi d’origine (arabe)* : البخاري 2/ 102 ومسلم 1/ 412 واللفظ لمسلم

### Invocations après le dernier tashahhud, avant le salut n° 2

**Arabe** : اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عَذَابِ الْقَبْرِ، وَأَعُوذُ بِكَ مِنْ فِتْنَةِ الْمَسِيحِ الدَّجَّالِ، وَأَعُوذُ بِكَ مِنْ فِتْنَةِ الْمَحْيَا وَالْمَمَاتِ اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْمَأْثَمِ وَالْمَغْرَمِ

**Phonétique** : Allahoumma inni aʿoudhou bika min ʿadhabi l-qabri, wa’aʿoudhou bika min fitnati l-masihi d-dadjdjali, wa’aʿoudhou bika min fitnati l-mahya wal-mamati llahoumma inni aʿoudhou bika mina l-ma’thami wal-maghram

**Français** : Ô Allah, je cherche refuge auprès de Toi contre le châtiment de la tombe, contre l’épreuve du faux Messie et contre l’épreuve de la vie et de la mort. Ô Allah, je cherche refuge auprès de Toi contre le péché et la dette.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocations après le dernier tashahhud, avant le salut », invocation n° 2. Al-Bukhari 1/202 ; Muslim 1/412.

*Renvoi d’origine (arabe)* : البخاري 1/ 202 ومسلم 1/ 412

### Invocations après le dernier tashahhud, avant le salut n° 3

**Arabe** : اللَّهُمَّ إِنِّي ظَلَمْتُ نَفْسِي ظُلْماً كَثِيراً، وَلاَ يَغْفِرُ الذُّنُوبَ إِلاَّ أَنْتَ، فَاغْفِرْ لِي مَغْفِرَةً مِنْ عِنْدِكَ وَارْحَمْنِي، إِنَّكَ أَنْتَ الْغَفُورُ الرَّحِيمُ

**Phonétique** : Allahoumma inni dhalamtou nafsi dhoulman kathiran, wala yaghfirou dh-dhounouba illa anta, faghfir li maghfiratan min ʿindika warhamni, innaka anta l-ghafourou r-rahim

**Français** : Ô Allah, je me suis fait beaucoup de tort à moi-même et nul ne pardonne les péchés en dehors de Toi : accorde-moi un pardon de Ta part et fais-moi miséricorde, car Tu es le Pardonneur, le Miséricordieux.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocations après le dernier tashahhud, avant le salut », invocation n° 3. Al-Bukhari 8/168 ; Muslim 4/2078.

*Renvoi d’origine (arabe)* : البخاري 8/168 ومسلم 4/ 2078

### Invocations après le dernier tashahhud, avant le salut n° 4

**Arabe** : اللَّهُمَّ اغْفِرْ لِي مَا قَدَّمْتُ، وَمَا أَخَّرْتُ، وَمَا أَسْرَرْتُ، وَمَا أَعْلَنْتُ، وَمَا أَسْرَفْتُ، وَمَا أَنْتَ أَعْلَمُ بِهِ مِنِّي أَنْتَ الْمُقَدِّمُ، وَأَنْتَ الْمُؤَخِّرُ لاَ إِلَهَ إِلاَّ أَنْتَ

**Phonétique** : Allahoumma-ghfir li ma qaddamtou, wama akhkhartou, wama asrartou, wama aʿlantou, wama asraftou, wama anta aʿlamou bihi minni anta l-mouqaddimou, wa’anta l-mou’akhkhirou la ilaha illa ant

**Français** : Ô Allah, pardonne-moi ce que j’ai fait avant et après, en secret et en public, ce en quoi j’ai excédé, et ce que Tu connais mieux que moi. Tu es Celui qui avance et Celui qui retarde ; il n’y a de divinité digne d’adoration que Toi.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocations après le dernier tashahhud, avant le salut », invocation n° 4. Muslim 1/534.

*Renvoi d’origine (arabe)* : مسلم 1/ 534

### Invocations après le dernier tashahhud, avant le salut n° 5

**Arabe** : اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ، وَشُكْرِكَ، وَحُسْنِ عِبَادَتِكَ

**Phonétique** : Allahoumma aʿinni ʿala dhikrika, wachoukrika, wahousni ʿibadatik

**Français** : Ô Allah, aide-moi à T’invoquer, à Te remercier et à bien T’adorer.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocations après le dernier tashahhud, avant le salut », invocation n° 5. Abu Dawud 2/86 ; an-Nasa’i 3/53 ; jugé sahih par al-Albani (Sahih Abi Dawud 1/284).

*Renvoi d’origine (arabe)* : أبو داود 2/ 86والنسائي 3/ 53 وصححه الألباني في صحيح أبو داود 1/ 284

### Invocations après le dernier tashahhud, avant le salut n° 6

**Arabe** : اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْبُخْلِ، وَأَعُوذُ بِكَ مِنَ الْجُبْنِ، وَأَعُوذُ بِكَ مِنْ أَنْ أُرَدَّ إِلَى أَرْذَلِ الْعُمُرِ، وَأَعُوذُ بِكَ مِنْ فِتْنَةِ الدُّنْيَا وَعَذَابِ الْقَبْرِ

**Phonétique** : Allahoumma inni aʿoudhou bika mina l-boukhli, wa’aʿoudhou bika mina l-djoubni, wa’aʿoudhou bika min an ouradda ila ardhali l-ʿoumouri, wa’aʿoudhou bika min fitnati d-dounya waʿadhabi l-qabr

**Français** : Ô Allah, je cherche refuge auprès de Toi contre l’avarice, contre la lâcheté, contre le fait d’être ramené à l’âge de la décrépitude, contre l’épreuve de ce bas monde et contre le châtiment de la tombe.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocations après le dernier tashahhud, avant le salut », invocation n° 6. Al-Bukhari 6/35.

*Renvoi d’origine (arabe)* : البخاري 6/35

### Invocations après le dernier tashahhud, avant le salut n° 7

**Arabe** : اللَّهُمَّ إِنِّي أَسْأَلُكَ الْجَنَّةَ وَأَعُوذُ بِكَ مِنَ النَّارِ

**Phonétique** : Allahoumma inni as’alouka l-djannata wa’aʿoudhou bika mina n-nar

**Français** : Ô Allah, je Te demande le Paradis et je cherche refuge auprès de Toi contre le Feu.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocations après le dernier tashahhud, avant le salut », invocation n° 7. Abu Dawud ; voir Sahih Ibn Majah 2/328.

*Renvoi d’origine (arabe)* : أبو داود وانظر صحيح ابن ماجه 2/ 328

### Invocations après le dernier tashahhud, avant le salut n° 8

**Arabe** : اللَّهُمَّ بِعِلْمِكَ الغَيْبَ وَقُدْرَتِكَ عَلَى الْخَلْقِ أَحْيِنِي مَا عَلِمْتَ الْحَيَاةَ خَيْراً لِي، وَتَوَفَّنِي إِذَا عَلِمْتَ الْوَفَاةَ خَيْراً لِي، اللَّهُمَّ إِنِّي أَسْأَلُكَ خَشْيَتَكَ فِي الْغَيْبِ وَالشَّهَادَةِ، وَأَسْأَلُكَ كَلِمَةَ الْحَقِّ فِي الرِّضَا وَالْغَضَبِ، وَأَسْأَلُكَ الْقَصْدَ فِي الْغِنَى وَالْفَقْرِ، وَأَسْأَلُكَ نَعِيماً لاَ يَنْفَدُ، وَأَسْأَلُكَ قُرَّةَ عَيْنٍ لاَ تَنْقَطِعُ، وَأَسْأَلُكَ الرِّضَا بَعْدَ الْقَضَاءِ، وَأَسْــــأَلُكَ بَرْدَ الْعَيْشِ بَعْدَ الْمَوْتِ، وَأَسْأَلُكَ لَذَّةَ النَّظَرِ إِلَى وَجْهِكَ، وَالشَّوْقَ إِلَى لِقَائِكَ فِي غَيرِ ضَرَّاءَ مُضِرَّةٍ، وَلاَ فِتْنَةٍ مُضِلَّةٍ، اللَّهُمَّ زَيِّنَا بِزِينَةِ الإِيمَانِ، وَاجْعَلْنَا هُدَاةً مُهْتَدِينَ

**Phonétique** : Allahoumma biʿilmika l-ghayba waqoudratika ʿala l-khalqi ahyini ma ʿalimta l-hayata khayran li, watawaffani idha ʿalimta l-wafata khayran li, Allahoumma inni as’alouka khachyataka fi l-ghaybi wach-chahadati, wa’as’alouka kalimata l-haqqi fi r-rida wal-ghadabi, wa’as’alouka l-qasda fi l-ghina wal-faqri, wa’as’alouka naʿiman la yanfadou, wa’as’alouka qourrata ʿaynin la tanqatiʿou, wa’as’alouka r-rida baʿda l-qada’i, wa’as’alouka barda l-ʿaychi baʿda l-mawti, wa’as’alouka ladhdhata n-nadhari ila wadjhika, wach-chawqa ila liqa’ika fi ghayri darra’a moudirratin, wala fitnatin moudillatin, Allahoumma zayyina bizinati l-imani, wadjʿalna houdatan mouhtadin

**Français** : Ô Allah, par Ta science de l’invisible et Ton pouvoir sur la création, fais-moi vivre tant que Tu sais que la vie est un bien pour moi, et rappelle-moi à Toi quand Tu sais que la mort est un bien pour moi. Ô Allah, je Te demande de Te craindre dans l’invisible et le visible ; la parole de vérité dans le contentement et dans la colère ; la modération dans la richesse et dans la pauvreté ; un bonheur qui ne s’épuise pas ; une joie des yeux qui ne cesse pas ; l’agrément après le décret ; la fraîcheur de la vie après la mort ; le plaisir de regarder Ton visage et le désir de Te rencontrer, sans épreuve nuisible ni tentation égarante. Ô Allah, pare-nous de la parure de la foi et fais de nous des guides bien guidés.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocations après le dernier tashahhud, avant le salut », invocation n° 8. An-Nasa’i 4/54-55 ; Ahmad 4/364 ; jugé sahih par al-Albani (Sahih an-Nasa’i 1/281).

*Renvoi d’origine (arabe)* : النسائي 4/54،55وأحمد 4/364 وصححه الألباني في صحيح النسائي 1/ 281

### Invocations après le dernier tashahhud, avant le salut n° 9

**Arabe** : اللَّهُمَّ إِنِّي أَسْأَلُكَ يَا اللَّهُ بِأَنَّكَ الْوَاحِدُ الْأَحَدُ الصَّمَدُ الَّذِي لَمْ يَلِدْ وَلَمْ يولَدْ، وَلَمْ يَكُنْ لَهُ كُفُواً أَحَدٌ، أَنْ تَغْفِرَ لِي ذُنُوبِي إِنَّكَ أَنْتَ الْغَفُورُ الرَّحِيمُ

**Phonétique** : Allahoumma inni as’alouka ya llahou bi’annaka l-wahidou l-ahadou s-samadou-lladhi lam yalid walam ywlad, walam yakoun lahou koufouan ahadoun, an taghfira li dhounoubi innaka anta l-ghafourou r-rahim

**Français** : Ô Allah, je Te demande, ô Allah, en vertu de ce que Tu es l’Unique, l’Impénétrable (as-Samad), Celui qui n’a pas engendré et n’a pas été engendré, et à qui nul n’est égal, de me pardonner mes péchés, car Tu es le Pardonneur, le Miséricordieux.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocations après le dernier tashahhud, avant le salut », invocation n° 9. An-Nasa’i 3/52 ; Ahmad 4/338 ; jugé sahih par al-Albani (Sahih an-Nasa’i 1/280).

*Renvoi d’origine (arabe)* : أخرجه النسائي بلفظه 3/52وأحمد 4/338 وصححه الألباني في صحيح النسائي 1/ 280

### Invocations après le dernier tashahhud, avant le salut n° 10

**Arabe** : اللَّهُمَّ إِنِّي أَسْأَلُكَ بِأَنَّ لَكَ الْحَمْدَ لاَ إِلَهَ إِلاَّ أَنْتَ وَحْدَكَ لاَ شَرِيكَ لَكَ، الْمَنَّانُ، يَا بَدِيعَ السَّمَوَاتِ وَالْأَرْضِ يَا ذَا الْجَلاَلِ وَالْإِكْرَامِ، يَا حَيُّ يَا قَيُّومُ إِنِّي أَسْأَلُكَ الْجَنَّةَ وَأَعُوذُ بِكَ مِنَ النَّارِ

**Phonétique** : Allahoumma inni as’alouka bi’anna laka l-hamda la ilaha illa anta wahdaka la charika laka, al-mannanou, ya badiʿa s-samawati wal-ardi ya dha l-djalali wal-ikrami, ya hayyou ya qayyoumou inni as’alouka l-djannata wa’aʿoudhou bika mina n-nar

**Français** : Ô Allah, je Te demande en vertu de ce qu’à Toi revient la louange ; il n’y a de divinité digne d’adoration que Toi, Seul, sans associé, le Dispensateur de bienfaits, Créateur des cieux et de la terre, ô Détenteur de la majesté et de la générosité, ô Vivant, ô Subsistant : je Te demande le Paradis et je cherche refuge auprès de Toi contre le Feu.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocations après le dernier tashahhud, avant le salut », invocation n° 10. Les auteurs des Sunan (voir Sahih Ibn Majah 2/329).

*Renvoi d’origine (arabe)* : رواه أهل السنن وانظر صحيح ابن ماجه 2/ 329

### Invocations après le dernier tashahhud, avant le salut n° 11

**Arabe** : اللَّهُمَّ إِنِّي أَسْأَلُكَ بِأَنِّي أَشْهَدُ أَنَّكَ أَنْتَ اللَّهُ لاَ إِلَهَ إِلاَّ أَنْتَ الْأَحَدُ الصَّمَدُ الَّذِي لَمْ يَلِدْ وَلَمْ يُولَدْ وَلَمْ يَكُنْ لَهُ كُفُواً أَحَدٌ

**Phonétique** : Allahoumma inni as’alouka bi’anni achhadou annaka anta llahou la ilaha illa anta l-ahadou s-samadou-lladhi lam yalid walam youlad walam yakoun lahou koufouan ahad

**Français** : Ô Allah, je Te demande car j’atteste que Tu es Allah, il n’y a de divinité digne d’adoration que Toi, l’Unique, l’Impénétrable, Celui qui n’a pas engendré et n’a pas été engendré, et à qui nul n’est égal.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Invocations après le dernier tashahhud, avant le salut », invocation n° 11. Abu Dawud 2/62 ; at-Tirmidhi 5/515 ; Ibn Majah 2/1267 ; Ahmad 5/360 (voir Sahih Ibn Majah 2/329 ; Sahih at-Tirmidhi 3/163).

*Renvoi d’origine (arabe)* : أبو داود2/62والترمذي 5/ 515 وابن ماجه 2/ 1267 وأحمد 5/360 وانظر صحيح ابن ماجه 2/ 329 وصحيح الترمذي 3/ 163

### Prière de l’istikhara n° 1

**Arabe** : اللَّهُمَّ إِنِّي أَسْتَخِيرُكَ بِعِلْمِكَ، وَأَسْتَقْدِرُكَ بِقُدْرَتِكَ، وَأَسْأَلُكَ مِنْ فَضْلِكَ الْعَظِيمِ؛ فَإِنَّكَ تَقْدِرُ وَلاَ أَقْدِرُ، وَتَعْلَمُ وَلاَ أَعْلَمُ، وَأَنْتَ عَلاَّمُ الغُيُوبِ، اللَّهُمَّ إِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ خَيْرٌ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي – أَوْ قَالَ: عَاجِلِهِ وَآجِلِهِ - فَاقْدُرْهُ لِي وَيَسِّرْهُ لِي ثُمَّ بَارِكْ لِي فِيهِ، وَإِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ شَرٌّ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي – أَوْ قَالَ: عَاجِلِهِ وَآجِلِهِ – فَاصْرِفْهُ عَنِّي وَاصْرِفْنِي عَنْهُ وَاقْدُرْ لِيَ الْخَيْرَ حَيْثُ كَانَ، ثُمَّ أَرْضِنِي بِهِ

**Phonétique** : Allahoumma inni astakhirouka biʿilmika, wa’astaqdirouka biqoudratika, wa’as’alouka min fadlika l-ʿadhimi, fa’innaka taqdirou wala aqdirou, wataʿlamou wala aʿlamou, wa’anta ʿallamou l-ghouyoubi, Allahoumma in kounta taʿlamou anna hadha l-amra khayroun li fi dini wamaʿachi waʿaqibati amri aw qala, ʿadjilihi wa’adjilihi faqdourhou li wayassirhou li thoumma barik li fihi, wa’in kounta taʿlamou anna hadha l-amra charroun li fi dini wamaʿachi waʿaqibati amri aw qala, ʿadjilihi wa’adjilihi fasrifhou ʿanni wasrifni ʿanhou waqdour liya l-khayra haythou kana, thoumma ardini bih

**Français** : Ô Allah, je Te demande de me guider vers le meilleur par Ta science, de m’en donner le pouvoir par Ta puissance, et je Te demande de Ta grâce immense, car Tu peux et je ne peux pas, Tu sais et je ne sais pas, et Tu es le Grand Connaisseur des mystères. Ô Allah, si Tu sais que cette affaire (nommer ici son besoin) est un bien pour moi dans ma religion, ma vie et l’issue de mes affaires — ou : dans l’immédiat et plus tard — alors destine-la-moi, facilite-la-moi, puis bénis-la-moi. Et si Tu sais que cette affaire est un mal pour moi dans ma religion, ma vie et l’issue de mes affaires — ou : dans l’immédiat et plus tard — alors écarte-la de moi et écarte-moi d’elle, destine-moi le bien où qu’il soit, puis rends-moi satisfait de ce choix. (à dire après deux rak‘a surérogatoires, en nommant son besoin à la place de « cette affaire »)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Prière de l’istikhara », invocation n° 1. Al-Bukhari 7/162 (récit de Jabir ibn ‘Abdillah : le Prophète nous enseignait l’istikhara pour toutes les affaires comme il nous enseignait une sourate du Coran). Le recueil ajoute : « Celui qui consulte le Créateur et prend conseil auprès des croyants ne le regrette pas » (Coran 3:159, « Consulte-les à propos de l’affaire ; puis, quand tu t’es décidé, place ta confiance en Allah »).

*Renvoi d’origine (arabe)* : البخاري7/ 162

### Qunut du witr n° 1

**Arabe** : اللَّهُمَّ اهْدِنِي فِيمَنْ هَدَيْتَ، وَعَافِنِي فِيمَنْ عَافَيْتَ، وَتَوَلَّنِي فِيمَنْ تَوَلَّيْتَ، وَبَارِكْ لِي فِيمَا أَعْطَيْتَ، وَقِنِي شَرَّ مَا قَضَيْتَ؛ فَإِنَّكَ تَقْضِي وَلاَ يُقْضَى عَلَيْكَ، إِنَّهُ لاَ يَذِلُّ مَنْ وَالَيْتَ، وَلاَ يَعِزُّ مَنْ عَادَيْتَ، تَبَارَكْتَ رَبَّنَا وَتَعَالَيْتَ

**Phonétique** : Allahoumma-hdini fiman hadayta, waʿafini fiman ʿafayta, watawallani fiman tawallayta, wabarik li fima aʿtayta, waqini charra ma qadayta, fa’innaka taqdi wala youqda ʿalayka, innahou la yadhillou man walayta, wala yaʿizzou man ʿadayta, tabarakta rabbana wataʿalayt

**Français** : Ô Allah, guide-moi parmi ceux que Tu as guidés, accorde-moi le bien-être parmi ceux à qui Tu l’as accordé, prends-moi en charge parmi ceux dont Tu t’es chargé, bénis ce que Tu m’as donné et protège-moi du mal que Tu as décrété ; Tu décrètes et nul ne décrète contre Toi ; celui que Tu soutiens n’est pas humilié (et celui que Tu prends pour ennemi n’est pas puissant). Tu es béni, notre Seigneur, et exalté.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Qunut du witr », invocation n° 1. Les auteurs des quatre Sunan, Ahmad, ad-Darimi, al-Hakim, al-Bayhaqi ; le passage entre crochets est d’al-Bayhaqi (voir Sahih at-Tirmidhi 1/144 ; Sahih Ibn Majah 1/194 ; Irwa’ al-ghalil 2/172). Seconde formule du chapitre (« Ô Allah, je cherche refuge dans Ton agrément… ») : voir « Prosternation » n° 4.

*Renvoi d’origine (arabe)* : أخرجه أصحاب السنن الأربعة وأحمد والدرامي والحاكم والبيهقي وما بين المعكوفين للبيهقي وانظر صحيح الترمذي 1/144وصحيح ابن ماجه 1/194 وإرواء الغليل للألباني 2/172

### Qunut du witr n° 2

**Arabe** : اللَّهُمَّ إِيَّاكَ نَعْبُدُ، وَلَكَ نُصَلِّي وَنَسْجُدُ، وَإِلَيْكَ نَسْعَى وَنَحْفِدُ، نَرْجُو رَحْمَتَكَ، وَنَخْشَى عَذَابَكَ، إِنَّ عَذَابَكَ بِالكَافِرِينَ مُلْحَقٌ اللَّهُمَّ إِنَّا نَسْتَعِينُكَ، وَنَسْتَغْفِرُكَ، وَنُثْنِي عَلَيْكَ الْخَيْرَ، وَلاَ نَكْفُرُكَ، وَنُؤْمِنُ بِكَ، وَنَخْضَعُ لَكَ، وَنَخْلَعُ مَنْ يَكْفُرُكَ

**Phonétique** : Allahoumma iyyaka naʿboudou, walaka nousalli wanasdjoudou, wa’ilayka nasʿa wanahfidou, nardjou rahmataka, wanakhcha ʿadhabaka, inna ʿadhabaka bil-kafirina moulhaqoun Allahoumma inna nastaʿinouka, wanastaghfirouka, wanouthni ʿalayka l-khayra, wala nakfourouka, wanou’minou bika, wanakhdaʿou laka, wanakhlaʿou man yakfourouk

**Français** : Ô Allah, c’est Toi que nous adorons, pour Toi que nous prions et nous nous prosternons, vers Toi que nous nous empressons, nous espérons Ta miséricorde et craignons Ton châtiment ; Ton châtiment atteindra les mécréants. Ô Allah, nous implorons Ton aide, nous demandons Ton pardon, nous Te louons pour le bien, nous ne Te renions pas ; nous croyons en Toi, nous nous humilions devant Toi et nous rejetons celui qui Te renie.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Qunut du witr », invocation n° 2. Al-Bayhaqi, as-Sunan al-kubra 2/211 : chaîne jugée authentique ; al-Albani : « chaîne authentique » (Irwa’ al-ghalil 2/170). Ce texte est rapporté de ‘Umar (mawquf).

*Renvoi d’origine (arabe)* : أخرجه البيهقي في السنن الكبرى وصحح إسناده 2/211 وقال الشيخ الألباني في إرواء الغليل وهذا إسناد صحيح 2/170 .وهو موقوف على عمر

### Après le salut du witr n° 1

**Arabe** : سُبْحَانَ الْمَلِكِ الْقُدُّوسِ

**Phonétique** : Soubhana l-maliki l-qouddous

**Français** : Gloire au Roi, le Très-Saint. (trois fois ; la troisième à voix haute, en allongeant la voix, en ajoutant : « Seigneur des anges et de l’Esprit »)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Après le salut du witr », invocation n° 1. An-Nasa’i 3/244 ; ad-Daraqutni 2/31 (l’addition entre crochets est de lui) ; chaîne authentique (voir Zad al-ma‘ad, éd. Arna’ut 1/337).

*Renvoi d’origine (arabe)* : رواه النسائي 3/244 والدار قطني وغيرهما وما بين المعكوفين زيادة للدار قطني 2/31 وإسناده صحيح .انظر زاد المعاد بتحقيق شعيب الأرناؤوط وعبد القادر الأرناؤوط 1/337
