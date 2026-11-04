#!/usr/bin/env python3
"""
Contenus 8 — dhikr du deuil : épreuve, fermeture des yeux du défunt, prière funéraire, condoléances, mise en terre, après l’enterrement, visite des tombes.
Construit docs/contenus/athkar-deuil.json (import Admin → Athkar) et la fiche de relecture .md.
Sources : rn0x/Adhkar-json (arabe voyellé, recueil Hisn al-Muslim) et rn0x/hisn_almuslim_json (renvois / takhrij du recueil, 1 renvoi par texte).
Mêmes limites que build_matin_soir.py : traduction française de l'assistant (à valider), phonétique générée par règles.

Usage : python3 build_deuil.py <dossier rn0x/Adhkar-json> <dossier rn0x/hisn_almuslim_json> <dossier de sortie>
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
        ('وَكَبيرِنَا', 'وَكَبِيرِنَا'), ('الْمُسْتَقدِمِينَ', 'الْمُسْتَقْدِمِينَ'), ('الْمُسْتأْخِرِينَ', 'الْمُسْتَأْخِرِينَ'), ('أَسْاَلُ', 'أَسْأَلُ'), ('أُجورَهُمَا', 'أُجُورَهُمَا'),
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
    'mus': 'Quand un malheur survient', 'yeu': 'En fermant les yeux du défunt', 'fun': 'Prière funéraire pour le défunt', 'enf': 'Prière funéraire pour un enfant',
    'con': 'Condoléances', 'ter': 'En déposant le défunt dans la tombe', 'apr': 'Après l’enterrement', 'vis': 'Visite des tombes',
}
HISN = json.load(open(os.path.join(HISN_DIR, 'hisn_almuslim.json'), encoding='utf-8'))
HT = list(HISN)
# src = (position du chapitre dans hisn_almuslim.json, n° du renvoi)
FOOT = lambda idx, i: re.sub(r'\s+', ' ', HISN[HT[idx]]['footnote'][i]).strip()
SPLIT = lambda t, k: N(t).split(N(k))

ITEMS = [
    dict(ch='mus', no=1, ar=plain(ARR(53, 1)),
         fr='Nous appartenons à Allah et c’est vers Lui que nous retournerons. Ô Allah, récompense-moi dans mon épreuve et donne-moi en échange quelque chose de meilleur qu’elle.',
         ref='Muslim 2/632.', src=(54, 0)),
    dict(ch='yeu', no=1, ar=plain(re.sub(r'\(\s*بِاسْمِهِ\s*\)', '', N(ARR(54, 1)))),
         fr='Ô Allah, pardonne à un tel (dire son nom), élève son rang parmi ceux qui sont bien guidés, succède-lui auprès de ceux qu’il laisse derrière lui ; pardonne-nous et pardonne-lui, ô Seigneur des mondes ; élargis-lui sa tombe et éclaire-la pour lui.',
         ref='Muslim 2/634.', src=(55, 0)),
    dict(ch='fun', no=1, ar=plain(ARR(55, 1), keep=True),
         fr='Ô Allah, pardonne-lui, fais-lui miséricorde, accorde-lui le salut, passe sur ses fautes, honore sa demeure, élargis son entrée, lave-le avec l’eau, la neige et la grêle, purifie-le des péchés comme on purifie le vêtement blanc de la souillure, donne-lui en échange une demeure meilleure que sa demeure, une famille meilleure que sa famille, une épouse meilleure que son épouse, fais-le entrer au Paradis et protège-le du châtiment de la tombe (et du châtiment du Feu).',
         ref='Muslim 2/663. Le passage entre crochets dans le recueil (« et du châtiment du Feu ») est repris ici.', src=(56, 0)),
    dict(ch='fun', no=2, ar=plain(ARR(55, 2)),
         fr='Ô Allah, pardonne à nos vivants et à nos morts, à ceux qui sont présents et à ceux qui sont absents, à nos petits et à nos grands, à nos hommes et à nos femmes. Ô Allah, celui d’entre nous que Tu fais vivre, fais-le vivre dans l’islam, et celui que Tu rappelles à Toi, rappelle-le dans la foi. Ô Allah, ne nous prive pas de sa récompense et ne nous égare pas après lui.',
         ref='Ibn Majah 1/480 ; Ahmad 2/368 (voir Sahih Ibn Majah 1/251).', src=(56, 1)),
    dict(ch='fun', no=3, ar=plain(ARR(55, 3)),
         fr='Ô Allah, un tel, fils d’un tel (dire son nom), est sous Ta protection et dans le lien de Ton voisinage : préserve-le de l’épreuve de la tombe et du châtiment du Feu. Tu es digne de fidélité et de vérité : pardonne-lui et fais-lui miséricorde, car Tu es le Pardonneur, le Miséricordieux.',
         ref='Ibn Majah (voir Sahih Ibn Majah 1/251) ; Abu Dawud 3/211.', src=(56, 2)),
    dict(ch='fun', no=4, ar=plain(ARR(55, 4)),
         fr='Ô Allah, c’est Ton serviteur, fils de Ta servante : il a besoin de Ta miséricorde et Tu n’as nul besoin de le châtier. S’il était bienfaisant, augmente ses bonnes actions ; s’il était fautif, passe sur ses fautes.',
         ref='Al-Hakim 1/359 (jugé authentique, avec l’accord d’adh-Dhahabi) ; voir Ahkam al-jana’iz d’al-Albani p. 125.', src=(56, 3)),
    dict(ch='enf', no=1, ar=plain(SPLIT(ARR(56, 1), '))')[0]),
         fr='Ô Allah, protège-le du châtiment de la tombe. (prière funéraire pour un enfant)',
         ref='Malik, al-Muwatta’ 1/288 ; Ibn Abi Shayba 3/217 ; al-Bayhaqi 4/9 : Sa‘id ibn al-Musayyab dit avoir prié derrière Abu Hurayra sur un enfant qui n’avait commis aucune faute et l’avoir entendu dire cela. Chaîne jugée authentique par Shu‘ayb al-Arna’ut (Sharh as-Sunna d’al-Baghawi 5/357).', src=(57, 0)),
    dict(ch='enf', no=2, ar=plain(N(ARR(56, 1)).split('((')[-1].split('))')[0]),
         fr='Ô Allah, fais-en un devancier et une réserve pour ses parents, un intercesseur dont la demande est exaucée. Ô Allah, alourdis par lui leurs balances, augmente par lui leur récompense, rattache-le aux croyants vertueux, place-le sous la garde d’Ibrahim, préserve-le par Ta miséricorde du châtiment de la Fournaise, donne-lui en échange une demeure meilleure que sa demeure et une famille meilleure que sa famille. Ô Allah, pardonne à nos prédécesseurs, à nos devanciers et à ceux qui nous ont précédés dans la foi. (le recueil précise : si l’on dit cela, c’est bien)',
         ref='Voir Ibn Qudama, al-Mughni 3/416 ; Ibn Baz, ad-Durus al-muhimma li-‘ammat al-umma p. 15.', src=(57, 1)),
    dict(ch='enf', no=3, ar=plain(ARR(56, 2)),
         fr='Ô Allah, fais de lui pour nous un devancier, un précurseur et une récompense.',
         ref='Al-Hasan (al-Basri) récitait al-Fatiha sur l’enfant puis disait cela : al-Baghawi, Sharh as-Sunna 5/357 ; ‘Abd ar-Razzaq n° 6588 ; al-Bukhari (cité sans chaîne), Kitab al-jana’iz, chapitre 65, 2/113.', src=(57, 2)),
    dict(ch='con', no=1, ar=plain(SPLIT(ARR(57, 1), 'وَإِنْ قَالَ')[0].replace('((', '').replace('))', '')),
         fr='À Allah appartient ce qu’Il a repris et à Lui ce qu’Il a donné, et toute chose a auprès de Lui un terme fixé... Qu’elle patiente et espère la récompense d’Allah. (paroles du Prophète, transmises à une de ses filles qui le faisait appeler au chevet de son enfant mourant)',
         ref='Al-Bukhari 2/80 ; Muslim 2/636.', src=(58, 0)),
    dict(ch='con', no=2, ar=plain(SPLIT(ARR(57, 1), 'وَإِنْ قَالَ')[1].split('))')[0].replace('((', '').strip(' :')),
         fr='Qu’Allah rende grande ta récompense, embellisse ton réconfort et pardonne à ton défunt. (formule de condoléances)',
         ref='An-Nawawi, al-Adhkar p. 126.', src=(58, 1)),
    dict(ch='ter', no=1, ar=plain(ARR(58, 1)), fr='Au nom d’Allah et selon la tradition du Messager d’Allah. (en déposant le défunt dans la tombe)',
         ref='Abu Dawud 3/314, chaîne authentique. Ahmad rapporte la variante « selon la religion du Messager d’Allah », chaîne authentique.', src=(59, 0)),
    dict(ch='apr', no=1, ar=plain(ARR(59, 1)), fr='Ô Allah, pardonne-lui. Ô Allah, affermis-le. (après l’enterrement)',
         ref='Abu Dawud 3/315 ; al-Hakim 1/370 (jugé authentique, avec l’accord d’adh-Dhahabi) : après l’enterrement, le Prophète se tenait près de la tombe et disait : « Demandez pardon pour votre frère et demandez pour lui l’affermissement, car il est interrogé maintenant ».', src=(60, 0)),
    dict(ch='vis', no=1, ar=plain(ARR(60, 1), keep=True),
         fr='Que la paix soit sur vous, habitants de ces demeures, croyants et musulmans. Si Allah le veut, nous vous rejoindrons. (Qu’Allah fasse miséricorde à ceux d’entre nous qui sont partis les premiers et à ceux qui partiront plus tard.) Je demande à Allah le salut pour nous et pour vous.',
         ref='Muslim 2/671 ; Ibn Majah 1/494 (dont est la formulation), d’après Buraida ; le passage entre crochets vient du hadith de ‘A’isha (Muslim 2/671).', src=(61, 0)),
]

START = 600
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
json.dump(out, open(os.path.join(OUT_DIR, 'athkar-deuil.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
lines = ['# Dhikr du deuil — fiche de relecture', '',
         f'{len(out)} entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.', '',
         '## Ce qu’il faut vérifier', '',
         '1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.',
         '2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.',
         '3. **Choix de l’assistant** : seules les formules à dire sont reprises. Non repris : « Celui dont les dernières paroles sont lā ilāha illā llāh entrera au Paradis » (c’est un hadith sur le fait de souffler la formule au mourant, pas une formule ; le texte arabe « lā ilāha illā llāh » existe déjà dans le lot précédent) ; les consignes pratiques. Les invocations qui demandent de dire le nom du défunt sont gardées avec « un tel » en arabe, le français le précise. Les entrées « Prière funéraire pour un enfant » n° 1 et 2 viennent du même chapitre du recueil, coupé en deux formules.',
         '4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).',
         '5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; certains renvois sont abrégés ou regroupent des formules ; le renvoi d’origine en arabe est donné sous chaque entrée.',
         '6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment la prière funéraire et les condoléances). **Phonétique** : générée par règles, sans tajwid.', '']
if warn:
    lines += ['## Voyelles encore manquantes dans la source (à vérifier)', ''] + [f'- {w}' for w in warn] + ['']
lines += ['## Les invocations', '']
for it, tl, ref, foot in md:
    lines += [f"### {CH[it['ch']]} n° {it['no']}", '', f"**Arabe** : {it['ar']}", '', f'**Phonétique** : {tl}', '', f"**Français** : {it['fr']}", '', f'**Référence** : {ref}', '',
              f'*Renvoi d’origine (arabe)* : {foot}', '']
open(os.path.join(OUT_DIR, 'athkar-deuil.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(out), 'entrées')
for w in warn:
    print('ATTENTION', w)
