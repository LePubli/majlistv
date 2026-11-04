#!/usr/bin/env python3
"""
Contenus 7 — dhikr de la prière : appel à la prière, ouverture, inclinaison, relèvement, prosternation, assis, tashahhud, avant le salut, istikhara, qunut et witr.
Construit docs/contenus/athkar-priere.json (import Admin → Athkar) et la fiche de relecture .md.
Sources : rn0x/Adhkar-json (arabe voyellé, recueil Hisn al-Muslim) et rn0x/hisn_almuslim_json (renvois / takhrij du recueil, 1 renvoi par texte).
Mêmes limites que build_matin_soir.py : traduction française de l'assistant (à valider), phonétique générée par règles.

Usage : python3 build_priere.py <dossier rn0x/Adhkar-json> <dossier rn0x/hisn_almuslim_json> <dossier de sortie>
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean, fix, missing_vowels, transliterate, N  # noqa: E402

ADHKAR_DIR, HISN_DIR, OUT_DIR = sys.argv[1:4]
A = {c['id']: c for c in json.load(open(os.path.join(ADHKAR_DIR, 'adhkar.json'), encoding='utf-8'))}
ARR = lambda c, i: {x['id']: x for x in A[c]['array']}[i]['text']


# Corrections de voyellation propres à ce lot (la source en oublie ou les place mal) — à confirmer par le relecteur.
FIX3 = [('الْخَبائِث', 'الْخَبَائِثِ'), ('سُبْحانَكَ', 'سُبْحَانَكَ'), ('وَأَتوبُ', 'وَأَتُوبُ'), ('وَلَاَ حَوْلَ', 'وَلاَ حَوْلَ'),
        ('الصّلَاةُ', 'الصَّلَاةُ'), ('فَضْلِك', 'فَضْلِكَ'), ('اللَّهُمَ ', 'اللَّهُمَّ '), ('لاِ يَمُوتُ', 'لاَ يَمُوتُ'),
        ('العَظِيمِ', 'الْعَظِيمِ'), ('بِسْمِ اللَّهِ اللَّهُمَّ', 'بِسْمِ اللَّهِ، اللَّهُمَّ'), ('رَسُولِ اللَّهِ اللَّهُمَّ', 'رَسُولِ اللَّهِ، اللَّهُمَّ'), ('الغَفُورُ', 'الْغَفُورُ'),
        ('مَحمُوداً', 'مَحْمُوداً'), ('اغْسِلْني', 'اغْسِلْنِي'), ('الْماءِ', 'الْمَاءِ'), ('تَبارَك', 'تَبَارَك'), ('ذُنُوبي', 'ذُنُوبِي'), ('الأَخْلاقِ', 'الْأَخْلاَقِ'), ('لِأَحْسَنِها', 'لِأَحْسَنِهَا'), ('مُسْتَقيمٍ', 'مُسْتَقِيمٍ'), ('كَثيراً', 'كَثِيراً'), ('لِقاؤُكَ', 'لِقَاؤُكَ'), ('وَمحَمَّدٌ', 'وَمُحَمَّدٌ'), ('وَالسّاعَةُ', 'وَالسَّاعَةُ'), ('أَسْلَمتُ', 'أَسْلَمْتُ'), ('خاصَمْتُ', 'خَاصَمْتُ'), ('حاكَمْتُ', 'حَاكَمْتُ'), ('سُبْحانَ', 'سُبْحَانَ'), ('استَقَلَّتْ', 'اسْتَقَلَّتْ'), ('مُبارَكاً', 'مُبَارَكاً'), ('أَهلَ', 'أَهْلَ'), ('الثَّناءِ', 'الثَّنَاءِ'), ('أَحْسنُ', 'أَحْسَنُ'), ('الْخَالِقينَ', 'الْخَالِقِينَ'), ('عُقوبَتِكَ', 'عُقُوبَتِكَ'), ('وَالطَّيِّباتُ', 'وَالطَّيِّبَاتُ'), ('وَرَسولُهُ', 'وَرَسُولُهُ'), ('أَعوذُ', 'أَعُوذُ'), ('الغَفورُ', 'الْغَفُورُ'), ('الرَّحيمُ', 'الرَّحِيمُ'), ('عِبادَتِكَ', 'عِبَادَتِكَ'), ('الْخَلقِ', 'الْخَلْقِ'), ('لِقائِكَ', 'لِقَائِكَ'), ('أَللَّهُ', 'اللَّهُ'), ('يَكنْ', 'يَكُنْ'), ('الأمْرَ', 'الْأَمْرَ'), ('ثمَّ ', 'ثُمَّ '), ('نعْبُدُ', 'نَعْبُدُ'), ('نَسْتَعينُكَ', 'نَسْتَعِينُكَ'), ('يَكْفرُكَ', 'يَكْفُرُكَ'), ('رَبَّنا', 'رَبَّنَا'), ('الرَّحِّيمُ', 'الرَّحِيمُ'), ('فَضْلِكََ', 'فَضْلِكَ'), ('بِأَنَّي', 'بِأَنِّي'), ('المَلِكِ القُدُّوسِ', 'الْمَلِكِ الْقُدُّوسِ'), ('يَقُولُ: ', ''),
        ('بِكُــــلِّ', 'بِكُلِّ'), ('القُرْآنَ', 'الْقُرْآنَ'), ('الغَيْبِ', 'الْغَيْبِ'), ('فَضْلِكَِ', 'فَضْلِكَ'), ('الظّالِمِينَ', 'الظَّالِمِينَ'),
        ('الْأوَّلُ', 'الْأَوَّلُ'), ('الظّاهِرُ', 'الظَّاهِرُ'), ('الْباطِنُ', 'الْبَاطِنُ'), ('الشَّيطَانِ', 'الشَّيْطَانِ'), ('حَسْبُنا', 'حَسْبُنَا'),
        ('أُقاتِلُ', 'أُقَاتِلُ'), ('نُحُورِهِم،', 'نُحُورِهِمْ،'), ('الْعَظيمَ', 'الْعَظِيمَ'), ('يَشْفيَكَ', 'يَشْفِيَكَ'), ('بأْسَ', 'بَأْسَ'), ('ربَّ السَّ', 'رَبَّ السَّ'),
        ('قَدَرُ اللَّهُ', 'قَدَرُ اللَّهِ'), ('اهزِمْهُمْ', 'اهْزِمْهُمْ'), ('وَالْباطِنُ', 'وَالْبَاطِنُ'), ('وَالظّاهِرُ', 'وَالظَّاهِرُ'),
        ('لَمُنقَلِبُونَ', 'لَمُنْقَلِبُونَ'), ('إِنّا', 'إِنَّا'), ('البِرَّ', 'الْبِرَّ'), ('الخَيْرَ', 'الْخَيْرَ'), ('الْخَليفَةُ', 'الْخَلِيفَةُ'),
        (' * ', '، '), ('رضي الله عنه', 'رَضِيَ اللَّهُ عَنْهُ'), ('صاحِبْنَا', 'صَاحِبْنَا'), ('لِرَبِّنا', 'لِرَبِّنَا'), ('الْأَحْزابَ', 'الْأَحْزَابَ'),
        ('حَيْثُ ما كُنْتَ', 'حَيْثُ مَا كُنْتَ'), ('الشَّياطِينِ', 'الشَّيَاطِينِ'), ('وَالْحَمْدُ للَّهِ', 'وَالْحَمْدُ لِلَّهِ'), ('عَظِيمِ', 'عَظِيمِ')]


def plain(t, keep=False):
    """Texte arabe d'un dhikr : sans parenthèses ni points de suite. Les crochets du recueil marquent des variantes :
    supprimés par défaut, ou gardés (keep=True) quand le contenu entre crochets fait partie de l'invocation que nous donnons."""
    t = N(t).replace('\n', ' ')
    t = re.sub(r'[\[\]]', '', t) if keep else re.sub(r'\[[^\]]*\]', '', t)
    t = re.sub(r'[()]', '', t).replace('..', '').replace('.', '')
    t = fix(t.strip().strip('،').strip())
    for a, b in FIX3:
        t = t.replace(N(a), N(b))
    t = re.sub('وَلاَ قُوَّة$', 'وَلاَ قُوَّةٍ', t)
    return re.sub(r'\s+', ' ', t).strip()





CH = {
    'adh': 'Appel à la prière (adhan)', 'ist': 'Ouverture de la prière', 'ruk': 'Inclinaison (ruku‘)', 'rel': 'Relèvement de l’inclinaison', 'suj': 'Prosternation (sujud)',
    'jal': 'Assis entre les deux prosternations', 'til': 'Prosternation de récitation', 'tas': 'Tashahhud', 'sal': 'Prière sur le Prophète après le tashahhud',
    'dua': 'Invocations après le dernier tashahhud, avant le salut', 'kha': 'Prière de l’istikhara', 'qun': 'Qunut du witr', 'wit': 'Après le salut du witr',
}
HISN = json.load(open(os.path.join(HISN_DIR, 'hisn_almuslim.json'), encoding='utf-8'))
HT = list(HISN)
# src = (position du chapitre dans hisn_almuslim.json, n° du renvoi)
FOOT = lambda idx, i: re.sub(r'\s+', ' ', HISN[HT[idx]]['footnote'][i]).strip()
CUT = lambda t: t.split('))')[0]  # texte avant « ثلاث مرات » placé après la citation dans la source

ITEMS = [
    dict(ch='adh', no=1, ar=plain('لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ'),
         fr='Il n’y a de force ni de puissance qu’en Allah. (réponse du fidèle quand le muezzin dit « Venez à la prière » et « Venez à la réussite » ; pour le reste de l’appel, répéter ce que dit le muezzin)',
         ref='Al-Bukhari 1/152 ; Muslim 1/288.', src=(16, 0)),
    dict(ch='adh', no=2, ar=plain(ARR(13, 2).split('))')[0].split('((')[-1]),
         fr='Et moi aussi, j’atteste qu’il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé, et que Muhammad est Son serviteur et Son messager. J’agrée Allah comme Seigneur, Muhammad comme messager et l’islam comme religion. (à dire après le témoignage du muezzin)',
         ref='Muslim 1/290.', src=(16, 1)),
    dict(ch='adh', no=3, ar=plain(ARR(13, 4), keep=True),
         fr='Ô Allah, Seigneur de cet appel parfait et de la prière qui va s’accomplir, accorde à Muhammad la Wasila et la Fadila, et ressuscite-le à la place louée que Tu lui as promise, car Tu ne manques pas à Ta promesse. (à dire après l’appel, après avoir prié sur le Prophète)',
         ref='Al-Bukhari 1/152. La dernière phrase (« car Tu ne manques pas à Ta promesse ») est un ajout d’al-Bayhaqi 1/410, dont Ibn Baz a jugé la chaîne hassan (Tuhfat al-akhyar p. 38). Entre l’appel et l’iqama, l’invocation n’est pas rejetée (at-Tirmidhi, Abu Dawud, Ahmad ; voir Irwa’ al-ghalil 1/262).', src=(16, 4)),
    dict(ch='ist', no=1, ar=plain(ARR(18, 1)),
         fr='Ô Allah, éloigne-moi de mes péchés comme Tu as éloigné l’orient de l’occident. Ô Allah, purifie-moi de mes péchés comme on purifie le vêtement blanc de la souillure. Ô Allah, lave-moi de mes péchés avec la neige, l’eau et la grêle.',
         ref='Al-Bukhari 1/181 ; Muslim 1/419.', src=(17, 0)),
    dict(ch='ist', no=2, ar=plain(ARR(18, 2)), fr='Gloire et louange à Toi, ô Allah ; béni soit Ton nom, élevée soit Ta majesté, et il n’y a de divinité digne d’adoration en dehors de Toi.',
         ref='Les auteurs des quatre Sunan (voir Sahih at-Tirmidhi 1/77 ; Sahih Ibn Majah 1/135).', src=(17, 1)),
    dict(ch='ist', no=3, ar=plain(ARR(18, 3)),
         fr='J’ai tourné mon visage, en pur croyant, vers Celui qui a créé les cieux et la terre, et je ne suis pas du nombre des associateurs. Ma prière, mes actes d’adoration, ma vie et ma mort appartiennent à Allah, Seigneur des mondes, qui n’a pas d’associé ; c’est cela qui m’a été ordonné et je suis du nombre des musulmans. Ô Allah, Tu es le Souverain, il n’y a de divinité digne d’adoration que Toi. Tu es mon Seigneur et je suis Ton serviteur ; je me suis fait du tort à moi-même et je reconnais mon péché : pardonne-moi tous mes péchés, car nul ne pardonne les péchés en dehors de Toi. Guide-moi vers le meilleur comportement, car nul ne guide vers le meilleur en dehors de Toi, et détourne de moi le mauvais, car nul n’en détourne en dehors de Toi. Me voici à Ton service, et le bonheur est auprès de Toi ; tout le bien est entre Tes mains et le mal ne T’est pas attribué. Je suis par Toi et vers Toi. Tu es béni et exalté. Je Te demande pardon et je me repens à Toi.',
         ref='Muslim 1/534.', src=(17, 2)),
    dict(ch='ist', no=4, ar=plain(ARR(18, 4)),
         fr='Ô Allah, Seigneur de Jibril, de Mikail et d’Israfil, Créateur des cieux et de la terre, Connaisseur de l’invisible et du visible, Tu juges entre Tes serviteurs de ce sur quoi ils divergeaient. Guide-moi, par Ta permission, vers la vérité dans ce sur quoi on a divergé, car Tu guides qui Tu veux vers un chemin droit.',
         ref='Muslim 1/534 (récit de ‘A’isha, ouverture de la prière de nuit).', src=(17, 3)),
    dict(ch='ist', no=5, ar=plain(ARR(18, 5).replace(' ثَلاثاً', '')),
         fr='Allah est infiniment grand (trois fois) ; louange abondante à Allah (trois fois) ; gloire à Allah matin et soir. (trois fois) Je cherche refuge auprès d’Allah contre Satan : contre son souffle, son crachat et son murmure.',
         ref='Abu Dawud 1/203 ; Ibn Majah 1/265 ; Ahmad 4/85 ; Muslim 1/420 rapporte un récit proche d’Ibn ‘Umar, avec une histoire.', src=(17, 4)),
    dict(ch='ist', no=6, ar=plain(ARR(18, 6), keep=True),
         fr='Ô Allah, à Toi la louange : Tu es la lumière des cieux et de la terre et de ceux qui s’y trouvent. À Toi la louange : Tu es le Soutien des cieux et de la terre et de ceux qui s’y trouvent. À Toi la louange : Tu es le Seigneur des cieux et de la terre et de ceux qui s’y trouvent. À Toi la louange : à Toi la royauté des cieux et de la terre et de ceux qui s’y trouvent. À Toi la louange : Tu es le Roi des cieux et de la terre. À Toi la louange. Tu es la Vérité, Ta promesse est vérité, Ta parole est vérité, Ta rencontre est vérité, le Paradis est vérité, le Feu est vérité, les prophètes sont vérité, Muhammad est vérité et l’Heure est vérité. Ô Allah, à Toi je me suis soumis, en Toi j’ai placé ma confiance, en Toi j’ai cru, vers Toi je me suis repenti, par Toi j’ai disputé et à Toi j’ai recouru pour juger. Pardonne-moi ce que j’ai fait avant et après, en secret et en public, ce que Tu connais mieux que moi. Tu es Celui qui avance et Celui qui retarde ; il n’y a de divinité digne d’adoration que Toi, Tu es mon Dieu, il n’y a de divinité digne d’adoration que Toi, et il n’y a de force ni de puissance qu’en Allah. (ouverture de la prière de nuit)',
         ref='Al-Bukhari, Fath al-Bari 3/3, 11/116, 13/371, 423, 465 ; Muslim 1/532 (version abrégée proche). Les passages entre crochets dans le recueil sont des variantes selon les récits : ils sont tous repris ici.', src=(17, 5)),
    dict(ch='ruk', no=1, ar=plain(CUT(ARR(19, 1))), fr='Gloire à mon Seigneur, le Très-Grand. (trois fois)',
         ref='Les auteurs des Sunan et Ahmad (voir Sahih at-Tirmidhi 1/83).', src=(18, 0)),
    dict(ch='ruk', no=2, ar=plain(ARR(19, 2)), fr='Gloire et louange à Toi, ô Allah notre Seigneur ; ô Allah, pardonne-moi. (à l’inclinaison et à la prosternation)',
         ref='Al-Bukhari 1/199 ; Muslim 1/350. Même formule en prosternation.', src=(18, 1)),
    dict(ch='ruk', no=3, ar=plain(ARR(19, 3)), fr='Gloire au Très-Saint, Seigneur des anges et de l’Esprit. (à l’inclinaison et à la prosternation)',
         ref='Muslim 1/353 ; Abu Dawud 1/230. Même formule en prosternation (Muslim 1/533).', src=(18, 2)),
    dict(ch='ruk', no=4, ar=plain(ARR(19, 4), keep=True),
         fr='Ô Allah, c’est pour Toi que je me suis incliné, en Toi que j’ai cru, à Toi que je me suis soumis ; mon ouïe, ma vue, ma moelle, mes os et mes nerfs, et ce que porte mon pied, se sont humiliés devant Toi.',
         ref='Muslim 1/534 ; les auteurs des Sunan sauf Ibn Majah. Le passage entre crochets (« et ce que porte mon pied ») est une variante reprise ici.', src=(18, 3)),
    dict(ch='ruk', no=5, ar=plain(ARR(19, 5)), fr='Gloire à Celui qui possède la puissance, la souveraineté, la grandeur et la majesté. (à l’inclinaison et à la prosternation)',
         ref='Abu Dawud 1/230 ; an-Nasa’i ; Ahmad (chaîne hassan). Même formule en prosternation.', src=(18, 4)),
    dict(ch='rel', no=1, ar=plain(ARR(20, 1)), fr='Allah entend celui qui Le loue. (en se relevant de l’inclinaison)',
         ref='Al-Bukhari, Fath al-Bari 2/282.', src=(19, 0)),
    dict(ch='rel', no=2, ar=plain(ARR(20, 2)), fr='Notre Seigneur, à Toi la louange, une louange abondante, excellente et bénie.',
         ref='Al-Bukhari, Fath al-Bari 2/282.', src=(19, 1)),
    dict(ch='rel', no=3, ar=plain(ARR(20, 3)),
         fr='Autant que remplissent les cieux, la terre, ce qui est entre eux et tout ce que Tu voudras ensuite. Toi qui es digne de la louange et de la gloire : c’est ce que le serviteur a dit de plus vrai, et nous sommes tous Tes serviteurs. Ô Allah, nul ne peut empêcher ce que Tu donnes, nul ne peut donner ce que Tu empêches, et la richesse du riche ne lui sert à rien auprès de Toi.',
         ref='Muslim 1/346.', src=(19, 2)),
    dict(ch='suj', no=1, ar=plain(CUT(ARR(21, 1))), fr='Gloire à mon Seigneur, le Très-Haut. (trois fois)',
         ref='Les auteurs des Sunan et Ahmad (voir Sahih at-Tirmidhi 1/83).', src=(20, 0)),
    dict(ch='suj', no=2, ar=plain(ARR(21, 4)),
         fr='Ô Allah, c’est pour Toi que je me suis prosterné, en Toi que j’ai cru, à Toi que je me suis soumis. Mon visage s’est prosterné devant Celui qui l’a créé, façonné, et lui a ouvert l’ouïe et la vue. Béni soit Allah, le meilleur des créateurs.',
         ref='Muslim 1/534 et d’autres.', src=(20, 3)),
    dict(ch='suj', no=3, ar=plain(ARR(21, 6)),
         fr='Ô Allah, pardonne-moi tous mes péchés : les petits et les grands, les premiers et les derniers, les publics et les secrets.',
         ref='Muslim 1/350.', src=(20, 5)),
    dict(ch='suj', no=4, ar=plain(ARR(21, 7)),
         fr='Ô Allah, je cherche refuge dans Ton agrément contre Ton courroux, dans Ton pardon contre Ta punition, et je cherche refuge auprès de Toi contre Toi. Je ne saurais Te louer comme il faut : Tu es tel que Tu T’es loué Toi-même. (même texte au qunut du witr)',
         ref='Muslim 1/352 ; au qunut : les auteurs des quatre Sunan et Ahmad (voir Sahih at-Tirmidhi 3/180 ; Sahih Ibn Majah 1/194).', src=(20, 6)),
    dict(ch='jal', no=1, ar=plain(ARR(22, 1)), fr='Seigneur, pardonne-moi ; Seigneur, pardonne-moi.',
         ref='Abu Dawud 1/231 ; voir Sahih Ibn Majah 1/148.', src=(21, 0)),
    dict(ch='jal', no=2, ar=plain(ARR(22, 2)), fr='Ô Allah, pardonne-moi, fais-moi miséricorde, guide-moi, relève-moi, accorde-moi le bien-être et la subsistance, et élève-moi.',
         ref='Les auteurs des Sunan sauf an-Nasa’i (voir Sahih at-Tirmidhi 1/90 ; Sahih Ibn Majah 1/148).', src=(21, 1)),
    dict(ch='til', no=1, ar=plain(ARR(23, 1)),
         fr='Mon visage s’est prosterné devant Celui qui l’a créé et qui lui a ouvert l’ouïe et la vue par Sa force et Sa puissance. « Béni soit Allah, le meilleur des créateurs. »',
         ref='At-Tirmidhi 2/474 ; Ahmad 6/30 ; al-Hakim 1/220 (jugé authentique, avec l’accord d’adh-Dhahabi), à qui est due l’addition finale.', src=(22, 0)),
    dict(ch='til', no=2, ar=plain(ARR(23, 2)),
         fr='Ô Allah, inscris-moi par cette prosternation une récompense auprès de Toi, décharge-moi par elle d’un fardeau, garde-la-moi auprès de Toi comme un trésor et accepte-la de moi comme Tu l’as acceptée de Ton serviteur Dawud.',
         ref='At-Tirmidhi 2/473 ; al-Hakim 1/219 (jugé authentique, avec l’accord d’adh-Dhahabi).', src=(22, 1)),
    dict(ch='tas', no=1, ar=plain(ARR(24, 1)),
         fr='Les salutations, les prières et les bonnes paroles sont pour Allah. Que la paix soit sur toi, ô Prophète, ainsi que la miséricorde d’Allah et Ses bénédictions. Que la paix soit sur nous et sur les serviteurs vertueux d’Allah. J’atteste qu’il n’y a de divinité digne d’adoration qu’Allah, et j’atteste que Muhammad est Son serviteur et Son messager.',
         ref='Al-Bukhari, Fath al-Bari 1/13 ; Muslim 1/301.', src=(23, 0)),
    dict(ch='sal', no=1, ar=plain(ARR(25, 1)),
         fr='Ô Allah, accorde Ta prière à Muhammad et à la famille de Muhammad, comme Tu l’as accordée à Ibrahim et à la famille d’Ibrahim ; Tu es digne de louange et de gloire. Ô Allah, bénis Muhammad et la famille de Muhammad, comme Tu as béni Ibrahim et la famille d’Ibrahim ; Tu es digne de louange et de gloire.',
         ref='Al-Bukhari, Fath al-Bari 6/408.', src=(24, 0)),
    dict(ch='sal', no=2, ar=plain(ARR(25, 2)),
         fr='Ô Allah, accorde Ta prière à Muhammad, à ses épouses et à sa descendance, comme Tu l’as accordée à la famille d’Ibrahim, et bénis Muhammad, ses épouses et sa descendance, comme Tu as béni la famille d’Ibrahim ; Tu es digne de louange et de gloire.',
         ref='Al-Bukhari, Fath al-Bari 6/407 ; Muslim 1/306 (dont est la formulation).', src=(24, 1)),
    dict(ch='dua', no=1, ar=plain(ARR(26, 1)),
         fr='Ô Allah, je cherche refuge auprès de Toi contre le châtiment de la tombe, contre le châtiment de l’Enfer, contre l’épreuve de la vie et de la mort et contre le mal de l’épreuve du faux Messie (ad-Dajjal).',
         ref='Al-Bukhari 2/102 ; Muslim 1/412 (la formulation est de Muslim).', src=(25, 0)),
    dict(ch='dua', no=2, ar=plain(ARR(26, 2)),
         fr='Ô Allah, je cherche refuge auprès de Toi contre le châtiment de la tombe, contre l’épreuve du faux Messie et contre l’épreuve de la vie et de la mort. Ô Allah, je cherche refuge auprès de Toi contre le péché et la dette.',
         ref='Al-Bukhari 1/202 ; Muslim 1/412.', src=(25, 1)),
    dict(ch='dua', no=3, ar=plain(ARR(26, 3)),
         fr='Ô Allah, je me suis fait beaucoup de tort à moi-même et nul ne pardonne les péchés en dehors de Toi : accorde-moi un pardon de Ta part et fais-moi miséricorde, car Tu es le Pardonneur, le Miséricordieux.',
         ref='Al-Bukhari 8/168 ; Muslim 4/2078.', src=(25, 2)),
    dict(ch='dua', no=4, ar=plain(ARR(26, 4)),
         fr='Ô Allah, pardonne-moi ce que j’ai fait avant et après, en secret et en public, ce en quoi j’ai excédé, et ce que Tu connais mieux que moi. Tu es Celui qui avance et Celui qui retarde ; il n’y a de divinité digne d’adoration que Toi.',
         ref='Muslim 1/534.', src=(25, 3)),
    dict(ch='dua', no=5, ar=plain(ARR(26, 5)), fr='Ô Allah, aide-moi à T’invoquer, à Te remercier et à bien T’adorer.',
         ref='Abu Dawud 2/86 ; an-Nasa’i 3/53 ; jugé sahih par al-Albani (Sahih Abi Dawud 1/284).', src=(25, 4)),
    dict(ch='dua', no=6, ar=plain(ARR(26, 6)),
         fr='Ô Allah, je cherche refuge auprès de Toi contre l’avarice, contre la lâcheté, contre le fait d’être ramené à l’âge de la décrépitude, contre l’épreuve de ce bas monde et contre le châtiment de la tombe.',
         ref='Al-Bukhari 6/35.', src=(25, 5)),
    dict(ch='dua', no=7, ar=plain(ARR(26, 7)), fr='Ô Allah, je Te demande le Paradis et je cherche refuge auprès de Toi contre le Feu.',
         ref='Abu Dawud ; voir Sahih Ibn Majah 2/328.', src=(25, 6)),
    dict(ch='dua', no=8, ar=plain(ARR(26, 8)),
         fr='Ô Allah, par Ta science de l’invisible et Ton pouvoir sur la création, fais-moi vivre tant que Tu sais que la vie est un bien pour moi, et rappelle-moi à Toi quand Tu sais que la mort est un bien pour moi. Ô Allah, je Te demande de Te craindre dans l’invisible et le visible ; la parole de vérité dans le contentement et dans la colère ; la modération dans la richesse et dans la pauvreté ; un bonheur qui ne s’épuise pas ; une joie des yeux qui ne cesse pas ; l’agrément après le décret ; la fraîcheur de la vie après la mort ; le plaisir de regarder Ton visage et le désir de Te rencontrer, sans épreuve nuisible ni tentation égarante. Ô Allah, pare-nous de la parure de la foi et fais de nous des guides bien guidés.',
         ref='An-Nasa’i 4/54-55 ; Ahmad 4/364 ; jugé sahih par al-Albani (Sahih an-Nasa’i 1/281).', src=(25, 7)),
    dict(ch='dua', no=9, ar=plain(ARR(26, 9)),
         fr='Ô Allah, je Te demande, ô Allah, en vertu de ce que Tu es l’Unique, l’Impénétrable (as-Samad), Celui qui n’a pas engendré et n’a pas été engendré, et à qui nul n’est égal, de me pardonner mes péchés, car Tu es le Pardonneur, le Miséricordieux.',
         ref='An-Nasa’i 3/52 ; Ahmad 4/338 ; jugé sahih par al-Albani (Sahih an-Nasa’i 1/280).', src=(25, 8)),
    dict(ch='dua', no=10, ar=plain(ARR(26, 10)),
         fr='Ô Allah, je Te demande en vertu de ce qu’à Toi revient la louange ; il n’y a de divinité digne d’adoration que Toi, Seul, sans associé, le Dispensateur de bienfaits, Créateur des cieux et de la terre, ô Détenteur de la majesté et de la générosité, ô Vivant, ô Subsistant : je Te demande le Paradis et je cherche refuge auprès de Toi contre le Feu.',
         ref='Les auteurs des Sunan (voir Sahih Ibn Majah 2/329).', src=(25, 9)),
    dict(ch='dua', no=11, ar=plain(ARR(26, 11)),
         fr='Ô Allah, je Te demande car j’atteste que Tu es Allah, il n’y a de divinité digne d’adoration que Toi, l’Unique, l’Impénétrable, Celui qui n’a pas engendré et n’a pas été engendré, et à qui nul n’est égal.',
         ref='Abu Dawud 2/62 ; at-Tirmidhi 5/515 ; Ibn Majah 2/1267 ; Ahmad 5/360 (voir Sahih Ibn Majah 2/329 ; Sahih at-Tirmidhi 3/163).', src=(25, 10)),
    dict(ch='kha', no=1, ar=plain(re.sub(r'\s*-\s*وَيُسَمِّي حَاجَتَهُ\s*-\s*', ' ', N(ARR(28, 1))[N(ARR(28, 1)).index(N('اللَّهُمَّ إِنِّي أَسْتَخِيرُكَ')):N(ARR(28, 1)).index(N('أَرْضِنِي بِهِ')) + len(N('أَرْضِنِي بِهِ'))])),
         fr='Ô Allah, je Te demande de me guider vers le meilleur par Ta science, de m’en donner le pouvoir par Ta puissance, et je Te demande de Ta grâce immense, car Tu peux et je ne peux pas, Tu sais et je ne sais pas, et Tu es le Grand Connaisseur des mystères. Ô Allah, si Tu sais que cette affaire (nommer ici son besoin) est un bien pour moi dans ma religion, ma vie et l’issue de mes affaires — ou : dans l’immédiat et plus tard — alors destine-la-moi, facilite-la-moi, puis bénis-la-moi. Et si Tu sais que cette affaire est un mal pour moi dans ma religion, ma vie et l’issue de mes affaires — ou : dans l’immédiat et plus tard — alors écarte-la de moi et écarte-moi d’elle, destine-moi le bien où qu’il soit, puis rends-moi satisfait de ce choix. (à dire après deux rak‘a surérogatoires, en nommant son besoin à la place de « cette affaire »)',
         ref='Al-Bukhari 7/162 (récit de Jabir ibn ‘Abdillah : le Prophète nous enseignait l’istikhara pour toutes les affaires comme il nous enseignait une sourate du Coran). Le recueil ajoute : « Celui qui consulte le Créateur et prend conseil auprès des croyants ne le regrette pas » (Coran 3:159, « Consulte-les à propos de l’affaire ; puis, quand tu t’es décidé, place ta confiance en Allah »).', src=(27, 0)),
    dict(ch='qun', no=1, ar=plain(ARR(32, 1), keep=True),
         fr='Ô Allah, guide-moi parmi ceux que Tu as guidés, accorde-moi le bien-être parmi ceux à qui Tu l’as accordé, prends-moi en charge parmi ceux dont Tu t’es chargé, bénis ce que Tu m’as donné et protège-moi du mal que Tu as décrété ; Tu décrètes et nul ne décrète contre Toi ; celui que Tu soutiens n’est pas humilié (et celui que Tu prends pour ennemi n’est pas puissant). Tu es béni, notre Seigneur, et exalté.',
         ref='Les auteurs des quatre Sunan, Ahmad, ad-Darimi, al-Hakim, al-Bayhaqi ; le passage entre crochets est d’al-Bayhaqi (voir Sahih at-Tirmidhi 1/144 ; Sahih Ibn Majah 1/194 ; Irwa’ al-ghalil 2/172). Seconde formule du chapitre (« Ô Allah, je cherche refuge dans Ton agrément… ») : voir « Prosternation » n° 4.', src=(33, 0)),
    dict(ch='qun', no=2, ar=plain(ARR(32, 3)),
         fr='Ô Allah, c’est Toi que nous adorons, pour Toi que nous prions et nous nous prosternons, vers Toi que nous nous empressons, nous espérons Ta miséricorde et craignons Ton châtiment ; Ton châtiment atteindra les mécréants. Ô Allah, nous implorons Ton aide, nous demandons Ton pardon, nous Te louons pour le bien, nous ne Te renions pas ; nous croyons en Toi, nous nous humilions devant Toi et nous rejetons celui qui Te renie.',
         ref='Al-Bayhaqi, as-Sunan al-kubra 2/211 : chaîne jugée authentique ; al-Albani : « chaîne authentique » (Irwa’ al-ghalil 2/170). Ce texte est rapporté de ‘Umar (mawquf).', src=(33, 2)),
    dict(ch='wit', no=1, ar=plain(CUT(ARR(33, 1))), fr='Gloire au Roi, le Très-Saint. (trois fois ; la troisième à voix haute, en allongeant la voix, en ajoutant : « Seigneur des anges et de l’Esprit »)',
         ref='An-Nasa’i 3/244 ; ad-Daraqutni 2/31 (l’addition entre crochets est de lui) ; chaîne authentique (voir Zad al-ma‘ad, éd. Arna’ut 1/337).', src=(34, 0)),
]

START = 500
out, md, warn = [], [], []
for pos, it in enumerate(ITEMS, START):
    ar = it['ar']
    # Garde-fou : le renvoi traduit doit correspondre au renvoi d'origine (même chapitre).
    title, idx = it['src']
    assert FOOT(title, idx), (title, idx)
    miss = sorted({m for w in ar.split() for m in missing_vowels(w)})
    if miss:
        warn.append(f"{CH[it['ch']]} n° {it['no']} : voyelle manquante sur {' '.join(miss)}")
    tl = transliterate(ar)
    ref = f"Hisn al-Muslim (Sa‘id al-Qahtani), « {CH[it['ch']]} », invocation n° {it['no']}. {it['ref']}"
    assert len(ref) <= 500, (it['ch'], it['no'], len(ref))
    assert len(ar) <= 4000 and len(it['fr']) <= 4000, (it['ch'], it['no'])
    assert not re.search(r'[A-Za-z()\[\]]', ar), (it['ch'], it['no'], ar)
    out.append({'category': 'general', 'textAr': ar, 'translit': tl, 'trFr': it['fr'], 'trEn': '', 'reference': ref, 'target': 1, 'position': pos})
    md.append((it, tl, ref, FOOT(title, idx)))

os.makedirs(OUT_DIR, exist_ok=True)
json.dump(out, open(os.path.join(OUT_DIR, 'athkar-priere.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
lines = ['# Dhikr de la prière — fiche de relecture', '',
         f'{len(out)} entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.', '',
         '## Ce qu’il faut vérifier', '',
         '1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.',
         '2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.',
         '3. **Choix de l’assistant** : ces invocations se disent PENDANT la prière (ou autour de l’appel) : classées en « général » car la catégorie « après la prière » est réservée à ce qui suit le salut. Les formules identiques à plusieurs endroits (inclinaison / prosternation, prosternation / qunut) sont reprises une seule fois, avec la mention des deux emplacements, car l’application écarte les doublons. Non repris : les consignes sans formule (prière sur le Prophète après l’appel, invocation libre entre l’appel et l’iqama). Les passages entre crochets du recueil (variantes) sont gardés dans les textes d’ouverture de nuit, d’inclinaison et de qunut.',
         '4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).',
         '5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; certains renvois sont abrégés ou regroupent des formules ; le renvoi d’origine en arabe est donné sous chaque entrée.',
         '6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment les longues invocations d’ouverture, de fin de prière et du qunut). **Phonétique** : générée par règles, sans tajwid.', '']
if warn:
    lines += ['## Voyelles encore manquantes dans la source (à vérifier)', ''] + [f'- {w}' for w in warn] + ['']
lines += ['## Les invocations', '']
for it, tl, ref, foot in md:
    lines += [f"### {CH[it['ch']]} n° {it['no']}", '', f"**Arabe** : {it['ar']}", '', f'**Phonétique** : {tl}', '', f"**Français** : {it['fr']}", '', f'**Référence** : {ref}', '',
              f'*Renvoi d’origine (arabe)* : {foot}', '']
open(os.path.join(OUT_DIR, 'athkar-priere.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(out), 'entrées')
for w in warn:
    print('ATTENTION', w)
