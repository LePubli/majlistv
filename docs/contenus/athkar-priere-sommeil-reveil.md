# Dhikr après la prière, du sommeil et du réveil — fiche de relecture

31 entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.

## Ce qu’il faut vérifier

1. **Arabe** : recueil *Hisn al-Muslim* (fichier libre rn0x/Adhkar-json), versets = texte Tanzil. Voyelles manquantes ou fautes de la source corrigées (variable `FIX` de `common.py`).
2. **Découpages décidés par l’assistant** : le « 33 – 33 – 33 + une fois » après la prière est séparé en 4 entrées (une par formule) pour que le compteur marche ; idem « 33 – 33 – 34 » au coucher ; le premier dhikr après la prière (« Astaghfirullah ×3 » puis « Allahumma anta s-salam ») est séparé en 2.
3. **Réveil** : classé en catégorie « général » (il n’existe pas de catégorie « réveil » pour l’instant) ; à décider avec le parcours UX.
4. **Références** : renvois du recueil traduits en français ; rattachement fait en lisant le contenu (les notes ne sont pas numérotées).
5. **Français** : traduction de l’assistant depuis l’arabe (versets : Hamidullah). **Phonétique** : générée par règles, sans tajwid.
6. **Entrée « Sourates As-Sajda et Al-Mulk »** (sommeil n° 12) : seuls les noms des sourates sont donnés (écrits par l’assistant), pas leur texte.

## Les invocations

### Dhikr après le salut de la prière n° 1 — Après la prière (× 3)

**Arabe** : أَسْتَغْفِرُ اللَّهَ

**Phonétique** : Astaghfirou llah

**Français** : Je demande pardon à Allah. (trois fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr après le salut de la prière », invocation n° 1. Muslim 1/414.

### Dhikr après le salut de la prière n° 1 — Après la prière (× 1)

**Arabe** : اللَّهُمَّ أَنْتَ السَّلاَمُ، وَمِنْكَ السَّلاَمُ، تَبَارَكْتَ يَا ذَا الْجَلاَلِ وَالْإِكْرَامِ

**Phonétique** : Allahoumma anta s-salamou, waminka s-salamou, tabarakta ya dha l-djalali wal-ikram

**Français** : Ô Allah, Tu es la Paix et de Toi vient la paix. Béni sois-Tu, ô Seigneur de majesté et de générosité.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr après le salut de la prière », invocation n° 1. Muslim 1/414.

### Dhikr après le salut de la prière n° 2 — Après la prière (× 1)

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، اللَّهُمَّ لاَ مَانِعَ لِمَا أَعْطَيْتَ، وَلاَ مُعْطِيَ لِمَا مَنَعْتَ، وَلاَ يَنْفَعُ ذَا الْجَدِّ مِنْكَ الْجَدُّ

**Phonétique** : La ilaha illa llahou wahdahou la charika lahou, lahou l-moulkou walahou l-hamdou wahouwa ʿala koulli chay’in qadiroun, Allahoumma la maniʿa lima aʿtayta, wala mouʿtiya lima manaʿta, wala yanfaʿou dha l-djaddi minka l-djadd

**Français** : Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est Omnipotent. Ô Allah, nul ne peut empêcher ce que Tu accordes, nul ne peut accorder ce que Tu empêches, et l’opulence de l’opulent ne lui sert à rien auprès de Toi (ne le sauve pas de Toi).

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr après le salut de la prière », invocation n° 2. Al-Bukhari 1/255 ; Muslim 1/414.

### Dhikr après le salut de la prière n° 3 — Après la prière (× 1)

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ، وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ. لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ، لاَ إِلَهَ إِلاَّ اللَّهُ، وَلاَ نَعْبُدُ إِلاَّ إِيَّاهُ, لَهُ النِّعْمَةُ وَلَهُ الْفَضْلُ وَلَهُ الثَّنَاءُ الْحَسَنُ، لاَ إِلَهَ إِلاَّ اللَّهُ مُخْلِصِينَ لَهُ الدِّينَ وَلَوْ كَرِهَ الْكَافِرُونَ

**Phonétique** : La ilaha illa llahou wahdahou la charika lahou, lahou l-moulkou, walahou l-hamdou, wahouwa ʿala koulli chay’in qadir. La hawla wala qouwwata illa billahi, la ilaha illa llahou, wala naʿboudou illa iyyahou, lahou n-niʿmatou walahou l-fadlou walahou th-thana’ou l-hasanou, la ilaha illa llahou moukhlisina lahou d-dina walaw kariha l-kafiroun

**Français** : Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est Omnipotent. Il n’y a de force ni de puissance qu’en Allah. Il n’y a de divinité digne d’adoration qu’Allah, et nous n’adorons que Lui. À Lui le bienfait, à Lui la grâce, à Lui la belle louange. Il n’y a de divinité digne d’adoration qu’Allah, Lui vouant un culte sincère, quand bien même les mécréants en seraient contrariés.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr après le salut de la prière », invocation n° 3. Muslim 1/415.

### Dhikr après le salut de la prière n° 4 — Après la prière (× 33)

**Arabe** : سُبْحَانَ اللَّهِ

**Phonétique** : Soubhana llah

**Français** : Gloire et pureté à Allah. (trente-trois fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr après le salut de la prière », invocation n° 4. Muslim 1/418. Le hadith précise : celui qui dit cela après chaque prière, ses péchés sont pardonnés même s’ils étaient comme l’écume de la mer.

### Dhikr après le salut de la prière n° 4 — Après la prière (× 33)

**Arabe** : الْحَمْدُ لِلَّهِ

**Phonétique** : Al-hamdou lillah

**Français** : Louange à Allah. (trente-trois fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr après le salut de la prière », invocation n° 4. Muslim 1/418 (suite de la précédente).

### Dhikr après le salut de la prière n° 4 — Après la prière (× 33)

**Arabe** : اللَّهُ أَكْبَرُ

**Phonétique** : Allahou akbar

**Français** : Allah est le Plus Grand. (trente-trois fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr après le salut de la prière », invocation n° 4. Muslim 1/418 (suite de la précédente).

### Dhikr après le salut de la prière n° 4 — Après la prière (× 1)

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ

**Phonétique** : La ilaha illa llahou wahdahou la charika lahou, lahou l-moulkou walahou l-hamdou wahouwa ʿala koulli chay’in qadir

**Français** : Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est Omnipotent. (pour compléter la centaine)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr après le salut de la prière », invocation n° 4. Muslim 1/418 (pour compléter la centaine).

### Dhikr après le salut de la prière n° 5 — Après la prière (× 1)

**Arabe** : بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ﴿قُلْ هُوَ ٱللَّهُ أَحَدٌ ٱللَّهُ ٱلصَّمَدُ لَمْ يَلِدْ وَلَمْ يُولَدْ وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ﴾ بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ﴿قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ مِن شَرِّ مَا خَلَقَ وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ وَمِن شَرِّ ٱلنَّفَّٰثَٰتِ فِى ٱلْعُقَدِ وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ﴾ بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ﴿قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ مَلِكِ ٱلنَّاسِ إِلَٰهِ ٱلنَّاسِ مِن شَرِّ ٱلْوَسْوَاسِ ٱلْخَنَّاسِ ٱلَّذِى يُوَسْوِسُ فِى صُدُورِ ٱلنَّاسِ مِنَ ٱلْجِنَّةِ وَٱلنَّاسِ﴾

**Phonétique** : Bismi llahi r-rahmani r-rahim. Qoul houwa llahou ahad. Allahou s-samad. Lam yalid walam youlad. Walam yakoun llahou koufouwan ahad. Bismi llahi r-rahmani r-rahim. Qoul aʿoudhou birabbi l-falaq. Min charri ma khalaq. Wamin charri ghasiqin idha waqab. Wamin charri n-naffathati fi l-ʿouqad. Wamin charri hasidin idha hasad. Bismi llahi r-rahmani r-rahim. Qoul aʿoudhou birabbi n-nas. Maliki n-nas. Ilahi n-nas. Min charri l-waswasi l-khannas. Alladhi youwaswisou fi soudouri n-nas. Mina l-djinnati wan-nas

**Français** : Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux. « Dis : "Il est Allah, Unique. Allah, Le Seul à être imploré pour ce que nous désirons. Il n’a jamais engendré, n’a pas été engendré non plus. Et nul n’est égal à Lui." » Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux. « Dis: "Je cherche protection auprès du Seigneur de l’aube naissante, contre le mal des êtres qu’Il a créés, contre le mal de l’obscurité quand elle s’approfondit, contre le mal de celles qui soufflent (les sorcières) sur les nœuds, et contre le mal de l’envieux quand il envie ." » Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux. « Dis : "Je cherche protection auprès du Seigneur des hommes. Le Souverain des hommes, Dieu des hommes, contre le mal du mauvais conseiller, furtif, qui insuffle des mauvaises pensées dans les poitrines des hommes, qu’il (le conseiller) soit un djinn, ou un être humain". » (après chaque prière)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr après le salut de la prière », invocation n° 5. Coran 112, 113 et 114. Abu Dawud 2/86 ; an-Nasa’i 3/68 (voir Sahih at-Tirmidhi 2/8 ; Fath al-Bari 9/62). Ces trois sourates sont appelées « al-Mu‘awwidhat ».

### Dhikr après le salut de la prière n° 6 — Après la prière (× 1)

**Arabe** : ﴿ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ وَلَا يُحِيطُونَ بِشَىْءٍ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ وَلَا يَـُٔودُهُۥ حِفْظُهُمَا وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ﴾

**Phonétique** : Allahou la’a ilaha illa houwa l-hayyou l-qayyoumou la ta’khoudhouhou sinatoun wala nawmoun llahou ma fi s-samawati wama fi l-ardi man dha-lladhi yachfaʿou ʿindahou illa bi’idhnihi yaʿlamou ma bayna aydihim wama khalfahoum wala youhitouna bichay’in mmin ʿilmihi illa bima cha’a’a wasiʿa koursiyyouhou s-samawati wal-arda wala youdouhou hifdhouhouma wahouwa l-ʿaliyyou l-ʿadhim

**Français** : « Allah! Point de divinité à part Lui, le Vivant, Celui qui subsiste par Lui-même (Al Qayyum). Ni somnolence ni sommeil ne Le saisissent. A Lui appartient tout ce qui est dans les cieux et sur la terre. Qui peut intercéder auprès de Lui sans Sa permission? Il connaît leur passé et leur futur. Et, de Sa science, ils n’embrassent que ce qu’Il veut. Son Trône « Kursîy » déborde les cieux et la terre, dont la garde ne Lui coûte aucune peine. Et Il est le Très-Haut, le Très-Grand . » (après chaque prière)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr après le salut de la prière », invocation n° 6. Coran 2:255. An-Nasa’i, ‘Amal al-yawm wa-l-layla n° 100 ; Ibn as-Sunni n° 121, jugé sahih (Sahih al-Jami‘ 5/339 ; as-Silsila as-sahiha 2/697 n° 972). Le hadith précise : celui qui la récite après chaque prière, rien ne l’empêche d’entrer au Paradis sauf la mort.

### Dhikr après le salut de la prière n° 7 — Après la prière (× 10)

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ يُحْيِي وَيُمِيتُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ

**Phonétique** : La ilaha illa llahou wahdahou la charika lahou, lahou l-moulkou walahou l-hamdou youhyi wayoumitou wahouwa ʿala koulli chay’in qadir

**Français** : Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange ; Il donne la vie et la mort, et Il est Omnipotent. (dix fois, après la prière du Maghrib et celle du Fajr)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr après le salut de la prière », invocation n° 7. At-Tirmidhi 5/515 ; Ahmad 4/227 (voir Zad al-ma‘ad 1/300).

### Dhikr après le salut de la prière n° 8 — Après la prière (× 1)

**Arabe** : اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْماً نَافِعاً، وَرِزْقاً طَيِّباً، وَعَمَلاً مُتَقَبَّلاً

**Phonétique** : Allahoumma inni as’alouka ʿilman nafiʿan, warizqan tayyiban, waʿamalan moutaqabbala

**Français** : Ô Allah, je Te demande une science utile, une subsistance pure et des œuvres acceptées. (après le salut de la prière du Fajr)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr après le salut de la prière », invocation n° 8. Ibn Majah et d’autres (voir Sahih Ibn Majah 1/152 ; Majma‘ az-zawa’id 10/111).

### Dhikr du sommeil n° 1 — Sommeil (× 3)

**Arabe** : بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ﴿قُلْ هُوَ ٱللَّهُ أَحَدٌ ٱللَّهُ ٱلصَّمَدُ لَمْ يَلِدْ وَلَمْ يُولَدْ وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ﴾ بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ﴿قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ مِن شَرِّ مَا خَلَقَ وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ وَمِن شَرِّ ٱلنَّفَّٰثَٰتِ فِى ٱلْعُقَدِ وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ﴾ بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ﴿قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ مَلِكِ ٱلنَّاسِ إِلَٰهِ ٱلنَّاسِ مِن شَرِّ ٱلْوَسْوَاسِ ٱلْخَنَّاسِ ٱلَّذِى يُوَسْوِسُ فِى صُدُورِ ٱلنَّاسِ مِنَ ٱلْجِنَّةِ وَٱلنَّاسِ﴾

**Phonétique** : Bismi llahi r-rahmani r-rahim. Qoul houwa llahou ahad. Allahou s-samad. Lam yalid walam youlad. Walam yakoun llahou koufouwan ahad. Bismi llahi r-rahmani r-rahim. Qoul aʿoudhou birabbi l-falaq. Min charri ma khalaq. Wamin charri ghasiqin idha waqab. Wamin charri n-naffathati fi l-ʿouqad. Wamin charri hasidin idha hasad. Bismi llahi r-rahmani r-rahim. Qoul aʿoudhou birabbi n-nas. Maliki n-nas. Ilahi n-nas. Min charri l-waswasi l-khannas. Alladhi youwaswisou fi soudouri n-nas. Mina l-djinnati wan-nas

**Français** : En se couchant : joindre les paumes, souffler dedans en récitant ce qui suit, puis se passer les mains sur le corps autant qu’on le peut, en commençant par la tête, le visage et le devant du corps ; trois fois. Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux. « Dis : "Il est Allah, Unique. Allah, Le Seul à être imploré pour ce que nous désirons. Il n’a jamais engendré, n’a pas été engendré non plus. Et nul n’est égal à Lui." » Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux. « Dis: "Je cherche protection auprès du Seigneur de l’aube naissante, contre le mal des êtres qu’Il a créés, contre le mal de l’obscurité quand elle s’approfondit, contre le mal de celles qui soufflent (les sorcières) sur les nœuds, et contre le mal de l’envieux quand il envie ." » Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux. « Dis : "Je cherche protection auprès du Seigneur des hommes. Le Souverain des hommes, Dieu des hommes, contre le mal du mauvais conseiller, furtif, qui insuffle des mauvaises pensées dans les poitrines des hommes, qu’il (le conseiller) soit un djinn, ou un être humain". »

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 1. Coran 112, 113 et 114. Al-Bukhari avec Fath al-Bari 9/62 ; Muslim 4/1723.

### Dhikr du sommeil n° 2 — Sommeil (× 1)

**Arabe** : ﴿ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ وَلَا يُحِيطُونَ بِشَىْءٍ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ وَلَا يَـُٔودُهُۥ حِفْظُهُمَا وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ﴾

**Phonétique** : Allahou la’a ilaha illa houwa l-hayyou l-qayyoumou la ta’khoudhouhou sinatoun wala nawmoun llahou ma fi s-samawati wama fi l-ardi man dha-lladhi yachfaʿou ʿindahou illa bi’idhnihi yaʿlamou ma bayna aydihim wama khalfahoum wala youhitouna bichay’in mmin ʿilmihi illa bima cha’a’a wasiʿa koursiyyouhou s-samawati wal-arda wala youdouhou hifdhouhouma wahouwa l-ʿaliyyou l-ʿadhim

**Français** : « Allah! Point de divinité à part Lui, le Vivant, Celui qui subsiste par Lui-même (Al Qayyum). Ni somnolence ni sommeil ne Le saisissent. A Lui appartient tout ce qui est dans les cieux et sur la terre. Qui peut intercéder auprès de Lui sans Sa permission? Il connaît leur passé et leur futur. Et, de Sa science, ils n’embrassent que ce qu’Il veut. Son Trône « Kursîy » déborde les cieux et la terre, dont la garde ne Lui coûte aucune peine. Et Il est le Très-Haut, le Très-Grand . »

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 2. Coran 2:255. Al-Bukhari avec Fath al-Bari 4/487. Le hadith précise : celui qui la récite en se couchant aura un gardien d’Allah auprès de lui et Satan ne l’approchera pas jusqu’au matin.

### Dhikr du sommeil n° 3 — Sommeil (× 1)

**Arabe** : ﴿ءَامَنَ ٱلرَّسُولُ بِمَآ أُنزِلَ إِلَيْهِ مِن رَّبِّهِۦ وَٱلْمُؤْمِنُونَ كُلٌّ ءَامَنَ بِٱللَّهِ وَمَلَٰٓئِكَتِهِۦ وَكُتُبِهِۦ وَرُسُلِهِۦ لَا نُفَرِّقُ بَيْنَ أَحَدٍ مِّن رُّسُلِهِۦ وَقَالُوا۟ سَمِعْنَا وَأَطَعْنَا غُفْرَانَكَ رَبَّنَا وَإِلَيْكَ ٱلْمَصِيرُ لَا يُكَلِّفُ ٱللَّهُ نَفْسًا إِلَّا وُسْعَهَا لَهَا مَا كَسَبَتْ وَعَلَيْهَا مَا ٱكْتَسَبَتْ رَبَّنَا لَا تُؤَاخِذْنَآ إِن نَّسِينَآ أَوْ أَخْطَأْنَا رَبَّنَا وَلَا تَحْمِلْ عَلَيْنَآ إِصْرًا كَمَا حَمَلْتَهُۥ عَلَى ٱلَّذِينَ مِن قَبْلِنَا رَبَّنَا وَلَا تُحَمِّلْنَا مَا لَا طَاقَةَ لَنَا بِهِۦ وَٱعْفُ عَنَّا وَٱغْفِرْ لَنَا وَٱرْحَمْنَآ أَنتَ مَوْلَىٰنَا فَٱنصُرْنَا عَلَى ٱلْقَوْمِ ٱلْكَٰفِرِينَ﴾

**Phonétique** : Amana r-rasoulou bima’a ounzila ilayhi min rrabbihi wal-mou’minouna koulloun amana billahi wamala’ikatihi wakoutoubihi warousoulihi la noufarriqou bayna ahadin mmin rrousoulihi waqalou samiʿna wa’ataʿna ghoufranaka rabbana wa’ilayka l-masir. La youkallifou llahou nafsan illa wousʿaha laha ma kasabat waʿalayha ma-ktasabat rabbana la tou’akhidhna’a in nnasina’a aw akhta’na rabbana wala tahmil ʿalayna’a isran kama hamaltahou ʿala-lladhina min qablina rabbana wala touhammilna ma la taqata lana bihi waʿfou ʿanna waghfir lana warhamna’a anta mawlana fansourna ʿala l-qawmi l-kafirin

**Français** : « Le Messager a cru en ce qu’on a fait descendre vers lui venant de son Seigneur, et aussi les croyants: tous ont cru en Allah, en Ses Anges, à Ses Livres et en Ses Messagers (en disant): “Nous ne faisons aucune distinction entre Ses Messagers.” Et ils ont dit: “Nous avons entendu et obéi. Seigneur! Nous implorons Ton pardon. C’est vers Toi que sera le retour.” Allah n’impose à aucune âme une charge supérieure à sa capacité. Elle sera récompensée du bien qu’elle aura fait, punie du mal qu’elle aura fait." Seigneur ! Ne nous châtie pas s’il nous arrive d’oublier ou de commettre une erreur. Seigneur ! Ne nous charge pas d’un fardeau lourd comme Tu as chargé ceux qui vécurent avant nous. Seigneur ! Ne nous impose pas ce que nous ne pouvons supporter, efface nos fautes, pardonne-nous et fais nous miséricorde. Tu es Notre Maître, accorde-nous donc la victoire sur les peuples infidèles ." »

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 3. Coran 2:285-286. Al-Bukhari avec Fath al-Bari 9/94 ; Muslim 1/554. Le hadith précise : celui qui les récite pendant la nuit, elles lui suffisent.

### Dhikr du sommeil n° 4 — Sommeil (× 1)

**Arabe** : بِاسْمِكَ رَبِّي وَضَعْتُ جَنْبِي، وَبِكَ أَرْفَعُهُ، فَإِن أَمْسَكْتَ نَفْسِي فَارْحَمْهَا، وَإِنْ أَرْسَلْتَهَا فَاحْفَظْهَا، بِمَا تَحْفَظُ بِهِ عِبَادَكَ الصَّالِحِينَ

**Phonétique** : Bismika rabbi wadaʿtou djanbi, wabika arfaʿouhou, fa’in amsakta nafsi farhamha, wa’in arsaltaha fahfadhha, bima tahfadhou bihi ʿibadaka s-salihin

**Français** : C’est en Ton nom, mon Seigneur, que j’ai posé mon flanc, et c’est par Toi que je le relèverai. Si Tu retiens mon âme, aie pitié d’elle ; et si Tu la renvoies, protège-la comme Tu protèges Tes serviteurs vertueux.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 4. Al-Bukhari 11/126 ; Muslim 4/2084.

### Dhikr du sommeil n° 5 — Sommeil (× 1)

**Arabe** : اللَّهُمَّ إِنَّكَ خَلَقْتَ نَفْسِي وَأَنْتَ تَوَفَّاهَا، لَكَ مَمَاتُهَا وَمَحْيَاهَا، إِنْ أَحْيَيْتَهَا فَاحْفَظْهَا، وَإِنْ أَمَتَّهَا فَاغْفِرْ لَهَا. اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَافِيَةَ

**Phonétique** : Allahoumma innaka khalaqta nafsi wa’anta tawaffaha, laka mamatouha wamahyaha, in ahyaytaha fahfadhha, wa’in amattaha faghfir laha. Allahoumma inni as’alouka l-ʿafiyah

**Français** : Ô Allah, c’est Toi qui as créé mon âme et c’est Toi qui la rappelles à Toi ; sa mort et sa vie T’appartiennent. Si Tu lui accordes la vie, protège-la ; si Tu la fais mourir, pardonne-lui. Ô Allah, je Te demande la préservation (al-‘afiya).

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 5. Muslim 4/2083 ; Ahmad 2/79.

### Dhikr du sommeil n° 6 — Sommeil (× 3)

**Arabe** : اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ

**Phonétique** : Allahoumma qini ʿadhabaka yawma tabʿathou ʿibadak

**Français** : Ô Allah, préserve-moi de Ton châtiment le jour où Tu ressusciteras Tes serviteurs. (trois fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 6. Abu Dawud 4/311 (voir Sahih at-Tirmidhi 3/143). Le recueil place cette invocation après avoir posé la main droite sous la joue.

### Dhikr du sommeil n° 7 — Sommeil (× 1)

**Arabe** : بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا

**Phonétique** : Bismika llahoumma amoutou wa’ahya

**Français** : C’est en Ton nom, ô Allah, que je meurs et que je vis.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 7. Al-Bukhari avec Fath al-Bari 11/113 ; Muslim 4/2083.

### Dhikr du sommeil n° 8 — Sommeil (× 33)

**Arabe** : سُبْحَانَ اللَّهِ

**Phonétique** : Soubhana llah

**Français** : Gloire et pureté à Allah. (trente-trois fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 8. Al-Bukhari avec Fath al-Bari 7/71 ; Muslim 4/2091. Le hadith précise : cela vaut mieux, pour celui qui le dit en se couchant, qu’un serviteur.

### Dhikr du sommeil n° 8 — Sommeil (× 33)

**Arabe** : الْحَمْدُ لِلَّهِ

**Phonétique** : Al-hamdou lillah

**Français** : Louange à Allah. (trente-trois fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 8. Al-Bukhari avec Fath al-Bari 7/71 ; Muslim 4/2091 (suite de la précédente).

### Dhikr du sommeil n° 8 — Sommeil (× 34)

**Arabe** : اللَّهُ أَكْبَرُ

**Phonétique** : Allahou akbar

**Français** : Allah est le Plus Grand. (trente-quatre fois)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 8. Al-Bukhari avec Fath al-Bari 7/71 ; Muslim 4/2091 (suite de la précédente).

### Dhikr du sommeil n° 9 — Sommeil (× 1)

**Arabe** : اللَّهُمَّ رَبَّ السَّمَوَاتِ السَّبْعِ وَرَبَّ الأَرْضِ، وَرَبَّ الْعَرْشِ الْعَظِيمِ، رَبَّنَا وَرَبَّ كُلِّ شَيْءٍ، فَالِقَ الْحَبِّ وَالنَّوَى، وَمُنْزِلَ التَّوْرَاةِ وَالْإِنْجِيلِ، وَالْفُرْقَانِ، أَعُوذُ بِكَ مِنْ شَرِّ كُلِّ شَيْءٍ أَنْتَ آخِذٌ بِنَاصِيَتِهِ. اللَّهُمَّ أَنْتَ الأَوَّلُ فَلَيْسَ قَبْلَكَ شَيْءٌ، وَأَنْتَ الآخِرُ فَلَيْسَ بَعْدَكَ شَيْءٌ، وَأَنْتَ الظَّاهِرُ فَلَيْسَ فَوْقَكَ شَيْءٌ، وَأَنْتَ الْبَاطِنُ فَلَيْسَ دُونَكَ شَيْءٌ، اقْضِ عَنَّا الدَّيْنَ وَأَغْنِنَا مِنَ الْفَقْرِ

**Phonétique** : Allahoumma rabba s-samawati s-sabʿi warabba l-ardi, warabba l-ʿarchi l-ʿadhimi, rabbana warabba koulli chay’in, faliqa l-habbi wan-nawa, wamounzila t-tawrati wal-indjili, wal-fourqani, aʿoudhou bika min charri koulli chay’in anta akhidhoun binasiyatih. Allahoumma anta l-awwalou falaysa qablaka chay’oun, wa’anta l-’akhirou falaysa baʿdaka chay’oun, wa’anta dh-dhahirou falaysa fawqaka chay’oun, wa’anta l-batinou falaysa dounaka chay’oun, iqdi ʿanna d-dayna wa’aghnina mina l-faqr

**Français** : Ô Allah, Seigneur des sept cieux, Seigneur de la terre et Seigneur du Trône immense, notre Seigneur et Seigneur de toute chose, Toi qui fends le grain et le noyau, qui as fait descendre la Torah, l’Évangile et le Discernement (al-Furqan), je cherche refuge auprès de Toi contre le mal de toute chose dont Tu tiens le toupet. Ô Allah, Tu es le Premier : rien n’est avant Toi ; Tu es le Dernier : rien n’est après Toi ; Tu es l’Apparent : rien n’est au-dessus de Toi ; Tu es le Caché : rien n’est en deçà de Toi. Acquitte nos dettes et enrichis-nous contre la pauvreté.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 9. Muslim 4/2084.

### Dhikr du sommeil n° 10 — Sommeil (× 1)

**Arabe** : الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا، وَكَفَانَا، وَآوَانَا، فَكَمْ مِمَّنْ لاَ كَافِيَ لَهُ وَلاَ مُؤْوِيَ

**Phonétique** : Al-hamdou lillahi-lladhi atʿamana wasaqana, wakafana, wa’awana, fakam mimman la kafiya lahou wala mou’wiya

**Français** : Louange à Allah qui nous a donné à manger et à boire, qui nous a suffi et nous a abrités. Combien de gens n’ont personne pour leur suffire ni pour les abriter !

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 10. Muslim 4/2085.

### Dhikr du sommeil n° 11 — Sommeil (× 1)

**Arabe** : اللَّهُمَّ عَالِمَ الْغَيْبِ وَالشَّهَادَةِ فَاطِرَ السَّمَوَاتِ وَالْأَرْضِ، رَبَّ كُلِّ شَيْءٍ وَمَلِيكَهُ، أَشْهَدُ أَنْ لاَ إِلَهَ إِلاَّ أَنْتَ، أَعُوذُ بِكَ مِنْ شَرِّ نَفْسِي، وَمِنْ شَرِّ الشَّيْطَانِ وَشِرْكِهِ، وَأَنْ أَقْتَرِفَ عَلَى نَفْسِي سُوءاً، أَوْ أَجُرَّهُ إِلَى مُسْلِمٍ

**Phonétique** : Allahoumma ʿalima l-ghaybi wach-chahadati fatira s-samawati wal-ardi, rabba koulli chay’in wamalikahou, achhadou an la ilaha illa anta, aʿoudhou bika min charri nafsi, wamin charri ch-chaytani wachirkihi, wa’an aqtarifa ʿala nafsi sou’an, aw adjourrahou ila mouslim

**Français** : Ô Allah, Connaisseur de l’invisible et du visible, Créateur des cieux et de la terre, Seigneur et Souverain de toute chose, j’atteste qu’il n’y a de divinité digne d’adoration que Toi. Je cherche refuge auprès de Toi contre le mal de mon âme, contre le mal de Satan et de son polythéisme (shirk), et contre le fait de commettre un mal contre moi-même ou de l’attirer sur un musulman.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 11. Abu Dawud 4/317 (voir Sahih at-Tirmidhi 3/142). Note : la version du matin lit « sharakihi » (ses pièges), celle-ci « shirkihi » (son polythéisme), telles que données par le recueil.

### Dhikr du sommeil n° 12 — Sommeil (× 1)

**Arabe** : سُورَةُ السَّجْدَةِ، وَسُورَةُ الْمُلْكِ

**Phonétique** : Souratou s-sadjdati, wasouratou l-moulk

**Français** : Réciter la sourate As-Sajda (32), puis la sourate Al-Mulk (67).

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 12. At-Tirmidhi et an-Nasa’i (voir Sahih al-Jami‘ 4/255). Le recueil donne l’indication « il récite Alif Lam Mim Tanzil (as-Sajda) et Tabarak alladhi biyadihi l-mulk ». Les noms de sourates sont écrits ici par l’assistant : à vérifier.

### Dhikr du sommeil n° 13 — Sommeil (× 1)

**Arabe** : اللَّهُمَّ أَسْلَمْتُ نَفْسِي إِلَيْكَ، وَفَوَّضْتُ أَمْرِي إِلَيْكَ، وَوَجَّهْتُ وَجْهِي إِلَيْكَ، وَأَلْجَأْتُ ظَهْرِي إِلَيْكَ، رَغْبَةً وَرَهْبَةً إِلَيْكَ، لاَ مَلْجَأَ وَلاَ مَنْجَا مِنْكَ إِلاَّ إِلَيْكَ، آمَنْتُ بِكِتَابِكَ الَّذِي أَنْزَلْتَ، وَبِنَبِيِّكَ الَّذِي أَرْسَلْتَ

**Phonétique** : Allahoumma aslamtou nafsi ilayka, wafawwadtou amri ilayka, wawadjdjahtou wadjhi ilayka, wa’aldja’tou dhahri ilayka, raghbatan warahbatan ilayka, la maldja’a wala mandja minka illa ilayka, amantou bikitabika-lladhi anzalta, wabinabiyyika-lladhi arsalt

**Français** : Ô Allah, je me soumets à Toi, je Te confie mon affaire, je tourne mon visage vers Toi, j’adosse mon dos à Toi, par désir et par crainte de Toi. Il n’y a de refuge ni de salut contre Toi qu’auprès de Toi. Je crois en Ton Livre que Tu as révélé et en Ton prophète que Tu as envoyé.

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr du sommeil », invocation n° 13. Al-Bukhari avec Fath al-Bari 11/113 ; Muslim 4/2081. Le hadith précise : si tu meurs cette nuit-là, tu meurs sur la fitra (la nature originelle).

### Dhikr au réveil n° 1 — Réveil (catégorie « général ») (× 1)

**Arabe** : الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا، وَإِلَيْهِ النُّشُورُ

**Phonétique** : Al-hamdou lillahi-lladhi ahyana baʿda ma amatana, wa’ilayhi n-nouchour

**Français** : Louange à Allah qui nous a rendu la vie après nous avoir fait mourir (le sommeil), et c’est vers Lui que sera la résurrection. (au réveil)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr au réveil », invocation n° 1. Al-Bukhari avec Fath al-Bari 11/113 ; Muslim 4/2083.

### Dhikr au réveil n° 2 — Réveil (catégorie « général ») (× 1)

**Arabe** : لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، سُبْحَانَ اللَّهِ، وَالْحَمْدُ لِلَّهِ، وَلاَ إِلَهَ إِلاَّ اللَّهُ، وَاللَّهُ أَكْبَرُ، وَلاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ الْعَلِيِّ الْعَظِيمِ، رَبِّ اغْفِرْ لِي

**Phonétique** : La ilaha illa llahou wahdahou la charika lahou, lahou l-moulkou walahou l-hamdou, wahouwa ʿala koulli chay’in qadiroun, soubhana llahi, wal-hamdou lillahi, wala ilaha illa llahou, wallahou akbarou, wala hawla wala qouwwata illa billahi l-ʿaliyyi l-ʿadhimi, rabbi-ghfir li

**Français** : Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est Omnipotent. Gloire et pureté à Allah, louange à Allah, il n’y a de divinité digne d’adoration qu’Allah, Allah est le Plus Grand, et il n’y a de force ni de puissance qu’en Allah, le Très Haut, l’Immense. Seigneur, pardonne-moi. (au réveil pendant la nuit)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr au réveil », invocation n° 2. Al-Bukhari avec Fath al-Bari 3/144 et d’autres ; formulation d’Ibn Majah (voir Sahih Ibn Majah 2/335). Le recueil rapporte : celui qui se réveille la nuit et dit cela, puis demande pardon ou invoque, est exaucé ; s’il fait ses ablutions et prie, sa prière est acceptée.

### Dhikr au réveil n° 3 — Réveil (catégorie « général ») (× 1)

**Arabe** : الْحَمْدُ لِلَّهِ الَّذِي عَافَانِي فِي جَسَدِي، وَرَدَّ عَلَيَّ رُوحِي، وَأَذِنَ لِي بِذِكْرِهِ

**Phonétique** : Al-hamdou lillahi-lladhi ʿafani fi djasadi, waradda ʿalayya rouhi, wa’adhina li bidhikrih

**Français** : Louange à Allah qui m’a donné la santé dans mon corps, m’a rendu mon âme et m’a permis de L’invoquer. (au réveil)

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr au réveil », invocation n° 3. At-Tirmidhi 5/473 (voir Sahih at-Tirmidhi 3/144).

### Dhikr au réveil n° 4 — Réveil (catégorie « général ») (× 1)

**Arabe** : ﴿إِنَّ فِى خَلْقِ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضِ وَٱخْتِلَٰفِ ٱلَّيْلِ وَٱلنَّهَارِ لَـَٔايَٰتٍ لِّأُو۟لِى ٱلْأَلْبَٰبِ ٱلَّذِينَ يَذْكُرُونَ ٱللَّهَ قِيَٰمًا وَقُعُودًا وَعَلَىٰ جُنُوبِهِمْ وَيَتَفَكَّرُونَ فِى خَلْقِ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضِ رَبَّنَا مَا خَلَقْتَ هَٰذَا بَٰطِلًا سُبْحَٰنَكَ فَقِنَا عَذَابَ ٱلنَّارِ رَبَّنَآ إِنَّكَ مَن تُدْخِلِ ٱلنَّارَ فَقَدْ أَخْزَيْتَهُۥ وَمَا لِلظَّٰلِمِينَ مِنْ أَنصَارٍ رَّبَّنَآ إِنَّنَا سَمِعْنَا مُنَادِيًا يُنَادِى لِلْإِيمَٰنِ أَنْ ءَامِنُوا۟ بِرَبِّكُمْ فَـَٔامَنَّا رَبَّنَا فَٱغْفِرْ لَنَا ذُنُوبَنَا وَكَفِّرْ عَنَّا سَيِّـَٔاتِنَا وَتَوَفَّنَا مَعَ ٱلْأَبْرَارِ رَبَّنَا وَءَاتِنَا مَا وَعَدتَّنَا عَلَىٰ رُسُلِكَ وَلَا تُخْزِنَا يَوْمَ ٱلْقِيَٰمَةِ إِنَّكَ لَا تُخْلِفُ ٱلْمِيعَادَ فَٱسْتَجَابَ لَهُمْ رَبُّهُمْ أَنِّى لَآ أُضِيعُ عَمَلَ عَٰمِلٍ مِّنكُم مِّن ذَكَرٍ أَوْ أُنثَىٰ بَعْضُكُم مِّنۢ بَعْضٍ فَٱلَّذِينَ هَاجَرُوا۟ وَأُخْرِجُوا۟ مِن دِيَٰرِهِمْ وَأُوذُوا۟ فِى سَبِيلِى وَقَٰتَلُوا۟ وَقُتِلُوا۟ لَأُكَفِّرَنَّ عَنْهُمْ سَيِّـَٔاتِهِمْ وَلَأُدْخِلَنَّهُمْ جَنَّٰتٍ تَجْرِى مِن تَحْتِهَا ٱلْأَنْهَٰرُ ثَوَابًا مِّنْ عِندِ ٱللَّهِ وَٱللَّهُ عِندَهُۥ حُسْنُ ٱلثَّوَابِ لَا يَغُرَّنَّكَ تَقَلُّبُ ٱلَّذِينَ كَفَرُوا۟ فِى ٱلْبِلَٰدِ مَتَٰعٌ قَلِيلٌ ثُمَّ مَأْوَىٰهُمْ جَهَنَّمُ وَبِئْسَ ٱلْمِهَادُ لَٰكِنِ ٱلَّذِينَ ٱتَّقَوْا۟ رَبَّهُمْ لَهُمْ جَنَّٰتٌ تَجْرِى مِن تَحْتِهَا ٱلْأَنْهَٰرُ خَٰلِدِينَ فِيهَا نُزُلًا مِّنْ عِندِ ٱللَّهِ وَمَا عِندَ ٱللَّهِ خَيْرٌ لِّلْأَبْرَارِ وَإِنَّ مِنْ أَهْلِ ٱلْكِتَٰبِ لَمَن يُؤْمِنُ بِٱللَّهِ وَمَآ أُنزِلَ إِلَيْكُمْ وَمَآ أُنزِلَ إِلَيْهِمْ خَٰشِعِينَ لِلَّهِ لَا يَشْتَرُونَ بِـَٔايَٰتِ ٱللَّهِ ثَمَنًا قَلِيلًا أُو۟لَٰٓئِكَ لَهُمْ أَجْرُهُمْ عِندَ رَبِّهِمْ إِنَّ ٱللَّهَ سَرِيعُ ٱلْحِسَابِ يَٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوا۟ ٱصْبِرُوا۟ وَصَابِرُوا۟ وَرَابِطُوا۟ وَٱتَّقُوا۟ ٱللَّهَ لَعَلَّكُمْ تُفْلِحُونَ﴾

**Phonétique** : Inna fi khalqi s-samawati wal-ardi wakhtilafi-llayli wan-nahari layatin lli’ouli l-albab. Alladhina yadhkourouna llaha qiyaman waqouʿoudan waʿala djounoubihim wayatafakkarouna fi khalqi s-samawati wal-ardi rabbana ma khalaqta hadha batilan soubhanaka faqina ʿadhaba n-nar. Rabbana’a innaka man toudkhili n-nara faqad akhzaytahou wama lildhdhalimina min ansar. Rrabbana’a innana samiʿna mounadiyan younadi lil’imani an aminou birabbikoum famanna rabbana faghfir lana dhounoubana wakaffir ʿanna sayyatina watawaffana maʿa l-abrar. Rabbana wa’atina ma waʿadttana ʿala rousoulika wala toukhzina yawma l-qiyamati innaka la toukhlifou l-miʿad. Fastadjaba lahoum rabbouhoum anni la’a oudiʿou ʿamala ʿamilin mminkoum mmin dhakarin aw ountha baʿdoukoum mmin baʿdin falladhina hadjarou wa’oukhridjou min diyarihim wa’oudhou fi sabili waqatalou waqoutilou la’oukaffiranna ʿanhoum sayyatihim wala’oudkhilannahoum djannatin tadjri min tahtiha l-anharou thawaban mmin ʿindi llahi wallahou ʿindahou housnou th-thawab. La yaghourrannaka taqalloubou-lladhina kafarou fi l-bilad. Mataʿoun qaliloun thoumma ma’wahoum djahannamou wabi’sa l-mihad. Lakini-lladhina-ttaqaw rabbahoum lahoum djannatoun tadjri min tahtiha l-anharou khalidina fiha nouzoulan mmin ʿindi llahi wama ʿinda llahi khayroun llil’abrar. Wa’inna min ahli l-kitabi laman you’minou billahi wama’a ounzila ilaykoum wama’a ounzila ilayhim khachiʿina lillahi la yachtarouna bayati llahi thamanan qalilan oula’ika lahoum adjrouhoum ʿinda rabbihim inna llaha sariʿou l-hisab. Ya’ayyouha-lladhina amanou-sbirou wasabirou warabitou wattaqou llaha laʿallakoum touflihoun

**Français** : « En vérité, dans la création des cieux et de la terre, et dans l’alternance de la nuit et du jour, il y a certes des signes pour les doués d’intelligence, qui, debout, assis, couchés sur leurs côtés, invoquent Allah et méditent sur la création des cieux et de la terre (disant): “ Notre Seigneur! Tu n’as pas créé cela en vain. Gloire à Toi! Épargne-nous du châtiment du Feu. Seigneur! Quiconque Tu fais entrer dans le Feu, Tu le couvres vraiment d’ignominie. Et pour les injustes, il n’y aura pas de secoureurs! Seigneur! Nous avons entendu l’appel de celui qui a appelé ainsi à la foi: "Croyez en votre Seigneur !" Et dès lors nous avons cru. Seigneur ! Pardonne-nous nos péchés, efface de nous nos méfaits, et place nous, à notre mort, avec les gens de bien. Seigneur! Donne-nous ce que Tu nous as promis par Tes Messagers. Et ne nous couvre pas d’ignominie au Jour de la Résurrection. Car Toi, Tu ne manques pas à Ta promesse". Leur Seigneur les a alors exaucés (disant) : "En vérité, Je ne laisse pas perdre le bien que quiconque parmi vous a fait, homme ou femme, car vous êtes les uns des autres. Donc, ceux qui ont émigré, qui ont été expulsés de leurs demeures, qui ont été persécutés dans Mon chemin, qui ont combattu, qui ont été tués, Je tiendrai certes pour expiées leurs mauvaises actions, et les ferai entrer dans les Jardins sous lesquels coulent les ruisseaux, comme récompense de la part d’Allah ." Quant à Allah, c’est auprès de Lui qu’est la plus belle récompense. Que ne t’abuse point la versatilité [pour la prospérité] dans le pays, de ceux qui sont infidèles. Piètre jouissance! Puis leur refuge sera l’Enfer. Et quelle détestable couche ! Mais quant à ceux qui craignent leur Seigneur, ils auront des Jardins sous lesquels coulent les ruisseaux, pour y demeurer éternellement, un lieu d’accueil de la part d’Allah. Et ce qu’il y a auprès d’Allah est meilleur, pour les pieux. Il y a certes, parmi les gens du Livre ceux qui croient en Allah et en ce qu’on a fait descendre vers vous et en ceux qu’on a fait descendre vers eux. Ils sont humbles envers Allah, et ne vendent point les versets d’Allah à vil prix. Voilà ceux dont la récompense est auprès de leur Seigneur. En vérité, Allah est prompt à faire les comptes. Ô les croyants! Soyez endurants. Incitez-vous à l’endurance. Luttez constamment (contre l’ennemi) et craignez Allah, afin que vous réussissiez! »

**Référence** : Hisn al-Muslim (Sa‘id al-Qahtani), « Dhikr au réveil », invocation n° 4. Coran 3:190-200. Al-Bukhari avec Fath al-Bari 8/238 ; Muslim 1/530.
