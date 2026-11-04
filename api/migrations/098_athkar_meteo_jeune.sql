-- Contenus 9 : dhikr du quotidien du croyant (vent, tonnerre, pluie, nouvelle lune, jeûne, nourriture offerte, premiers fruits, éternuement) (19 entrées).
-- Insérés NON validés (reviewed_at NULL) et NON affichés (enabled false) : rien n'apparaît chez les membres avant relecture
-- et validation dans Admin → Athkar. Idempotent : un dhikr déjà présent (même catégorie, même texte arabe) est ignoré.
-- Généré par ops/contenus/athkar/make_migration.py à partir de docs/contenus/athkar-*.json.

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّهَا$q$, $q$Allahoumma inni as’alouka khayraha, wa’aʿoudhou bika min charriha$q$, $q$Ô Allah, je Te demande son bien et je cherche refuge auprès de Toi contre son mal.$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Quand le vent souffle », invocation n° 1. Abu Dawud 4/326 ; Ibn Majah 2/1228 (voir Sahih Ibn Majah 2/305).$q$, 1, 700, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّهَا$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَهَا، وَخَيْرَ مَا فِيهَا، وَخَيْرَ مَا أُرْسِلَتْ بِهِ، وَأَعُوذُ بِكَ مِنْ شَرِّهَا، وَشَرِّ مَا فِيهَا، وَشَرِّ مَا أُرْسِلَتْ بِهِ$q$, $q$Allahoumma inni as’alouka khayraha, wakhayra ma fiha, wakhayra ma oursilat bihi, wa’aʿoudhou bika min charriha, wacharri ma fiha, wacharri ma oursilat bih$q$, $q$Ô Allah, je Te demande son bien, le bien de ce qu’il contient et le bien de ce pour quoi il a été envoyé ; et je cherche refuge auprès de Toi contre son mal, le mal de ce qu’il contient et le mal de ce pour quoi il a été envoyé.$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Quand le vent souffle », invocation n° 2. Muslim 2/616 ; al-Bukhari 4/76.$q$, 1, 701, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَهَا، وَخَيْرَ مَا فِيهَا، وَخَيْرَ مَا أُرْسِلَتْ بِهِ، وَأَعُوذُ بِكَ مِنْ شَرِّهَا، وَشَرِّ مَا فِيهَا، وَشَرِّ مَا أُرْسِلَتْ بِهِ$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$سُبْحَانَ الَّذِي يُسَبِّحُ الرَّعْدُ بِحَمْدِهِ وَالْمَلاَئِكَةُ مِنْ خِيفَتِهِ$q$, $q$Soubhana-lladhi yousabbihou r-raʿdou bihamdihi wal-mala’ikatou min khifatih$q$, $q$Gloire à Celui que le tonnerre glorifie par Sa louange, et les anges aussi, par crainte de Lui.$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Quand on entend le tonnerre », invocation n° 1. Malik, al-Muwatta’ 2/992 : ‘Abdullah ibn az-Zubayr, quand il entendait le tonnerre, cessait de parler et disait cela. Al-Albani : chaîne authentique, rapporté de lui (mawquf).$q$, 1, 702, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$سُبْحَانَ الَّذِي يُسَبِّحُ الرَّعْدُ بِحَمْدِهِ وَالْمَلاَئِكَةُ مِنْ خِيفَتِهِ$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$اللَّهُمَّ اسْقِنَا غَيْثاً مُغِيثاً مَرِيئاً مَرِيعاً، نَافِعاً غَيْرَ ضَارٍّ، عَاجِلاً غَيْرَ آجِلٍ$q$, $q$Allahoumma-sqina ghaythan moughithan mari’an mariʿan, nafiʿan ghayra darrin, ʿadjilan ghayra adjil$q$, $q$Ô Allah, fais-nous boire une pluie qui secourt, salutaire, fertilisante, utile et non nuisible, immédiate et non tardive.$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Demande de pluie (istisqa’) », invocation n° 1. Abu Dawud 1/303 ; jugé sahih par al-Albani (Sahih Abi Dawud 1/216).$q$, 1, 703, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$اللَّهُمَّ اسْقِنَا غَيْثاً مُغِيثاً مَرِيئاً مَرِيعاً، نَافِعاً غَيْرَ ضَارٍّ، عَاجِلاً غَيْرَ آجِلٍ$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$اللَّهُمَّ أَغِثْنَا، اللَّهُمَّ أَغِثْنَا، اللَّهُمَّ أَغِثْنَا$q$, $q$Allahoumma aghithna, Allahoumma aghithna, Allahoumma aghithna$q$, $q$Ô Allah, secours-nous ! Ô Allah, secours-nous ! Ô Allah, secours-nous !$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Demande de pluie (istisqa’) », invocation n° 2. Al-Bukhari 1/224 ; Muslim 2/613.$q$, 1, 704, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$اللَّهُمَّ أَغِثْنَا، اللَّهُمَّ أَغِثْنَا، اللَّهُمَّ أَغِثْنَا$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$اللَّهُمَّ اسْقِ عِبَادَكَ، وَبَهَائِمَكَ، وَانْشُرْ رَحْمَتَكَ، وَأَحْيِي بَلَدَكَ الْمَيِّتَ$q$, $q$Allahoumma-sqi ʿibadaka, wabaha’imaka, wanchour rahmataka, wa’ahyi baladaka l-mayyit$q$, $q$Ô Allah, abreuve Tes serviteurs et Tes bêtes, répands Ta miséricorde et fais revivre Ta terre morte.$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Demande de pluie (istisqa’) », invocation n° 3. Abu Dawud 1/305 ; jugé hassan par al-Albani (Sahih Abi Dawud 1/218).$q$, 1, 705, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$اللَّهُمَّ اسْقِ عِبَادَكَ، وَبَهَائِمَكَ، وَانْشُرْ رَحْمَتَكَ، وَأَحْيِي بَلَدَكَ الْمَيِّتَ$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$اللَّهُمَّ صَيِّباً نَافِعاً$q$, $q$Allahoumma sayyiban nafiʿa$q$, $q$Ô Allah, fais-en une pluie bénéfique.$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Quand la pluie tombe », invocation n° 1. Al-Bukhari, Fath al-Bari 2/518.$q$, 1, 706, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$اللَّهُمَّ صَيِّباً نَافِعاً$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$مُطِرْنَا بِفَضْلِ اللَّهِ وَرَحْمَتِهِ$q$, $q$Moutirna bifadli llahi warahmatih$q$, $q$Il a plu sur nous par la grâce d’Allah et Sa miséricorde.$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Après la pluie », invocation n° 1. Al-Bukhari 1/205 ; Muslim 1/83.$q$, 1, 707, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$مُطِرْنَا بِفَضْلِ اللَّهِ وَرَحْمَتِهِ$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$اللَّهُمَّ حَوَالَيْنَا وَلاَ عَلَيْنَا، اللَّهُمَّ عَلَى الْآكَامِ وَالظِّرَابِ، وَبُطُونِ الْأَوْدِيَةِ، وَمَنَابِتِ الشَّجَرِ$q$, $q$Allahoumma hawalayna wala ʿalayna, Allahoumma ʿala l-’akami wadh-dhirabi, waboutouni l-awdiyati, wamanabiti ch-chadjar$q$, $q$Ô Allah, autour de nous et non sur nous ! Ô Allah, sur les collines, les hauteurs, le fond des vallées et les lieux où poussent les arbres. (quand la pluie devient excessive)$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Pour que la pluie cesse », invocation n° 1. Al-Bukhari 1/224 ; Muslim 2/614.$q$, 1, 708, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$اللَّهُمَّ حَوَالَيْنَا وَلاَ عَلَيْنَا، اللَّهُمَّ عَلَى الْآكَامِ وَالظِّرَابِ، وَبُطُونِ الْأَوْدِيَةِ، وَمَنَابِتِ الشَّجَرِ$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$اللَّهُ أَكْبَرُ، اللَّهُمَّ أَهِلَّهُ عَلَيْنَا بِالْأَمْنِ وَالْإِيمَانِ، وَالسَّلاَمَةِ وَالْإِسْلاَمِ، وَالتَّوْفِيقِ لِمَا تُحِبُّ رَبَّنَا وَتَرْضَى، رَبُّنَا وَرَبُّكَ اللَّهُ$q$, $q$Allahou akbarou, Allahoumma ahillahou ʿalayna bil-amni wal-imani, was-salamati wal-islami, wat-tawfiqi lima touhibbou rabbana watarda, rabbouna warabbouka llah$q$, $q$Allah est le plus grand. Ô Allah, fais apparaître cette lune sur nous avec la sécurité et la foi, la paix et l’islam, et le succès dans ce que Tu aimes et agrées, ô notre Seigneur. Notre Seigneur et ton Seigneur est Allah.$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « À la vue de la nouvelle lune », invocation n° 1. At-Tirmidhi 5/504 ; ad-Darimi 1/336 (dont est la formulation) ; voir Sahih at-Tirmidhi 3/157.$q$, 1, 709, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$اللَّهُ أَكْبَرُ، اللَّهُمَّ أَهِلَّهُ عَلَيْنَا بِالْأَمْنِ وَالْإِيمَانِ، وَالسَّلاَمَةِ وَالْإِسْلاَمِ، وَالتَّوْفِيقِ لِمَا تُحِبُّ رَبَّنَا وَتَرْضَى، رَبُّنَا وَرَبُّكَ اللَّهُ$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ، وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ$q$, $q$Dhahaba dh-dhama’ou wabtallati l-ʿourouqou, wathabata l-adjrou in cha’a llah$q$, $q$La soif est partie, les veines sont humectées et la récompense est établie, si Allah le veut.$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « En rompant le jeûne », invocation n° 1. Abu Dawud 2/306 et d’autres (voir Sahih al-Jami‘ 4/209).$q$, 1, 710, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ، وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$اللَّهُمَّ إِنِّي أَسْأَلُكَ بِرَحْمَتِكَ الَّتِي وَسِعَتْ كُلَّ شَيْءٍ أَنْ تَغْفِرَ لِي$q$, $q$Allahoumma inni as’alouka birahmatika-llati wasiʿat koulla chay’in an taghfira li$q$, $q$Ô Allah, je Te demande, par Ta miséricorde qui embrasse toute chose, de me pardonner.$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « En rompant le jeûne », invocation n° 2. Ibn Majah 1/557, invocation de ‘Abdullah ibn ‘Amr (qu’Allah les agrée) ; jugé hassan par al-Hafiz Ibn Hajar (Takhrij al-adhkar ; Sharh al-adhkar 4/342).$q$, 1, 711, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$اللَّهُمَّ إِنِّي أَسْأَلُكَ بِرَحْمَتِكَ الَّتِي وَسِعَتْ كُلَّ شَيْءٍ أَنْ تَغْفِرَ لِي$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$اللَّهُمَّ أَطْعِمْ مَنْ أَطْعَمَنِي، وَاسْقِ مَنْ سَقَانِي$q$, $q$Allahoumma atʿim man atʿamani, wasqi man saqani$q$, $q$Ô Allah, nourris celui qui m’a nourri et abreuve celui qui m’a abreuvé.$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Pour celui qui vous a nourri ou donné à boire », invocation n° 1. Muslim 3/26.$q$, 1, 712, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$اللَّهُمَّ أَطْعِمْ مَنْ أَطْعَمَنِي، وَاسْقِ مَنْ سَقَانِي$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$أَفْطَرَ عِنْدَكُمُ الصَّائِمُونَ، وَأَكَلَ طَعَامَكُمُ الْأَبْرَارُ، وَصَلَّتْ عَلَيْكُمُ الْمَلاَئِكَةُ$q$, $q$Aftara ʿindakoumou s-sa’imouna, wa’akala taʿamakoumou l-abrarou, wasallat ʿalaykoumou l-mala’ikah$q$, $q$Les jeûneurs ont rompu le jeûne chez vous, les gens de bien ont mangé votre nourriture et les anges ont prié pour vous. (à dire à ses hôtes en rompant le jeûne chez eux)$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Rompre le jeûne chez quelqu’un », invocation n° 1. Abu Dawud 3/367 ; Ibn Majah 1/556 ; an-Nasa’i, ‘Amal al-yawm wa-l-layla n° 298 (il précise que le Prophète le disait en rompant le jeûne chez des gens) ; jugé sahih par al-Albani (Sahih Abi Dawud 2/730).$q$, 1, 713, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$أَفْطَرَ عِنْدَكُمُ الصَّائِمُونَ، وَأَكَلَ طَعَامَكُمُ الْأَبْرَارُ، وَصَلَّتْ عَلَيْكُمُ الْمَلاَئِكَةُ$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$إِنِّي صَائِمٌ، إِنِّي صَائِمٌ$q$, $q$Inni sa’imoun, inni sa’im$q$, $q$Je jeûne, je jeûne. (à dire à celui qui vous insulte ou cherche querelle pendant le jeûne)$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Jeûneur que l’on insulte », invocation n° 1. Al-Bukhari, Fath al-Bari 4/103 ; Muslim 2/806.$q$, 1, 714, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$إِنِّي صَائِمٌ، إِنِّي صَائِمٌ$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$اللَّهُمَّ بَارِكْ لَنَا فِي ثَمَرِنَا، وَبَارِكْ لَنَا فِي مَدِينَتِنَا، وَبَارِكْ لَنَا فِي صَاعِنَا، وَبَارِكْ لَنَا فِي مُدِّنَا$q$, $q$Allahoumma barik lana fi thamarina, wabarik lana fi madinatina, wabarik lana fi saʿina, wabarik lana fi mouddina$q$, $q$Ô Allah, bénis-nous dans nos fruits, bénis-nous dans notre ville, bénis-nous dans notre sa‘ et bénis-nous dans notre mudd. (à dire à la vue des premiers fruits de la saison)$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Premiers fruits de la saison », invocation n° 1. Muslim 2/1000.$q$, 1, 715, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$اللَّهُمَّ بَارِكْ لَنَا فِي ثَمَرِنَا، وَبَارِكْ لَنَا فِي مَدِينَتِنَا، وَبَارِكْ لَنَا فِي صَاعِنَا، وَبَارِكْ لَنَا فِي مُدِّنَا$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$الْحَمْدُ لِلَّهِ$q$, $q$Al-hamdou lillah$q$, $q$Louange à Allah. (à dire quand on éternue)$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Éternuement », invocation n° 1. Al-Bukhari 7/125 : « Quand l’un de vous éternue, qu’il dise “Louange à Allah” ».$q$, 1, 716, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$الْحَمْدُ لِلَّهِ$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$يَرْحَمُكَ اللَّهُ$q$, $q$Yarhamouka llah$q$, $q$Qu’Allah te fasse miséricorde. (réponse de son frère ou de son compagnon à celui qui éternue et loue Allah)$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Éternuement », invocation n° 2. Al-Bukhari 7/125.$q$, 1, 717, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$يَرْحَمُكَ اللَّهُ$q$);

INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
SELECT $q$general$q$, $q$يَهْدِيكُمُ اللَّهُ وَيُصْلِحُ بَالَكُمْ$q$, $q$Yahdikoumou llahou wayouslihou balakoum$q$, $q$Qu’Allah vous guide et améliore votre état. (réponse de l’éternueur ; se dit aussi à un non-musulman qui éternue et loue Allah)$q$, $q$$q$, $q$Hisn al-Muslim (Sa‘id al-Qahtani), « Éternuement », invocation n° 3. Al-Bukhari 7/125 ; pour le non-musulman : at-Tirmidhi 5/82 ; Ahmad 4/400 ; Abu Dawud 4/308 (voir Sahih at-Tirmidhi 2/354).$q$, 1, 718, false
WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $q$general$q$ AND text_ar = $q$يَهْدِيكُمُ اللَّهُ وَيُصْلِحُ بَالَكُمْ$q$);
