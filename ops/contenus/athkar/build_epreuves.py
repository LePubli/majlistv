#!/usr/bin/env python3
"""
Contenus 6 — dhikr des épreuves : tristesse, détresse, peur, dette, doute, maladie, mauvais œil, fin de vie.
Construit docs/contenus/athkar-epreuves.json (import Admin → Athkar) et la fiche de relecture .md.
Sources : rn0x/Adhkar-json (arabe voyellé, recueil Hisn al-Muslim) et rn0x/hisn_almuslim_json (renvois / takhrij du recueil, 1 renvoi par texte).
Mêmes limites que build_matin_soir.py : traduction française de l'assistant (à valider), phonétique générée par règles.

Usage : python3 build_epreuves.py <dossier rn0x/Adhkar-json> <dossier rn0x/hisn_almuslim_json> <dossier de sortie>
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
    'hum': 'Tristesse et souci', 'kar': 'Détresse (karb)', 'ene': 'Rencontre d’un ennemi ou d’un puissant', 'sul': 'Crainte de l’injustice d’un gouverneur',
    'con': 'Invocation contre l’ennemi', 'peu': 'Quand on craint un groupe de gens', 'dou': 'Doute dans la foi', 'det': 'Pour rembourser une dette',
    'wsw': 'Murmures de Satan pendant la prière', 'dif': 'Quand une chose est difficile', 'dec': 'Quand arrive ce qu’on n’aime pas',
    'mal': 'Visite d’un malade', 'mou': 'Malade qui n’espère plus vivre', 'dlr': 'Douleur dans le corps', 'faz': 'Quand on est effrayé',
}
HISN = json.load(open(os.path.join(HISN_DIR, 'hisn_almuslim.json'), encoding='utf-8'))
HT = list(HISN)
# src = (position du chapitre dans hisn_almuslim.json, n° du renvoi) : les titres diffèrent légèrement entre les deux sources.
FOOT = lambda idx, i: re.sub(r'\s+', ' ', HISN[HT[idx]]['footnote'][i]).strip()

ITEMS = [
    dict(ch='hum', no=1, ar=plain(ARR(34, 1)),
         fr='Ô Allah, je suis Ton serviteur, fils de Ton serviteur, fils de Ta servante ; mon toupet est dans Ta main, Ton jugement s’exécute sur moi, Ton décret à mon égard est juste. Je Te demande par chacun de Tes noms, ceux dont Tu T’es nommé Toi-même, que Tu as révélés dans Ton Livre, enseignés à l’une de Tes créatures ou gardés pour Toi dans la science de l’invisible : fais du Coran le printemps de mon cœur, la lumière de ma poitrine, ce qui dissipe ma tristesse et emporte mon souci.',
         ref='Ahmad 1/391 ; jugé sahih par al-Albani.', src=(35, 0)),
    dict(ch='hum', no=2, ar=plain(ARR(34, 2)),
         fr='Ô Allah, je cherche refuge auprès de Toi contre le souci et la tristesse, l’impuissance et la paresse, l’avarice et la lâcheté, le poids de la dette et la domination des hommes. (la même formule se dit aussi pour être aidé à rembourser une dette)',
         ref='Al-Bukhari 7/158 : le Messager d’Allah multipliait cette invocation. Le même texte figure dans le chapitre « rembourser une dette » (at-Tirmidhi 5/560, voir Sahih at-Tirmidhi 3/180 ; al-Bukhari 7/158).', src=(35, 1)),
    dict(ch='kar', no=1, ar=plain(ARR(35, 1)),
         fr='Il n’y a de divinité digne d’adoration qu’Allah, le Très-Grand, le Longanime. Il n’y a de divinité digne d’adoration qu’Allah, Seigneur du Trône immense. Il n’y a de divinité digne d’adoration qu’Allah, Seigneur des cieux, Seigneur de la terre et Seigneur du noble Trône.',
         ref='Al-Bukhari 7/154 ; Muslim 4/2092.', src=(36, 0)),
    dict(ch='kar', no=2, ar=plain(ARR(35, 2)),
         fr='Ô Allah, c’est Ta miséricorde que j’espère : ne me laisse pas à moi-même, le temps d’un clin d’œil, et remets en ordre toute ma situation. Il n’y a de divinité digne d’adoration que Toi.',
         ref='Abu Dawud 4/324 ; Ahmad 5/42 ; jugé hassan par al-Albani (Sahih Abi Dawud 3/959).', src=(36, 1)),
    dict(ch='kar', no=3, ar=plain(ARR(35, 3)),
         fr='Il n’y a de divinité digne d’adoration que Toi ; gloire à Toi, j’ai été du nombre des injustes. (invocation de Yunus dans le ventre du poisson)',
         ref='At-Tirmidhi 5/529 ; al-Hakim 1/505 (jugé authentique, avec l’accord d’adh-Dhahabi) ; voir Sahih at-Tirmidhi 3/168.', src=(36, 2)),
    dict(ch='kar', no=4, ar=plain(ARR(35, 4)), fr='Allah, Allah est mon Seigneur, je ne Lui associe rien.',
         ref='Abu Dawud 2/87 ; voir Sahih Ibn Majah 2/335.', src=(36, 3)),
    dict(ch='ene', no=1, ar=plain(ARR(36, 1)), fr='Ô Allah, nous Te plaçons face à eux et nous cherchons refuge auprès de Toi contre leurs maux.',
         ref='Abu Dawud 2/89 ; al-Hakim 2/142 (jugé authentique, avec l’accord d’adh-Dhahabi).', src=(37, 0)),
    dict(ch='ene', no=2, ar=plain(ARR(36, 2)), fr='Ô Allah, Tu es mon soutien et mon secours : par Toi je me déplace, par Toi je m’élance, par Toi je combats.',
         ref='Abu Dawud 3/42 ; at-Tirmidhi 5/572 (voir Sahih at-Tirmidhi 3/183).', src=(37, 1)),
    dict(ch='ene', no=3, ar=plain(ARR(36, 3)), fr='Allah nous suffit, et quel excellent garant !',
         ref='Al-Bukhari 5/172.', src=(37, 2)),
    dict(ch='sul', no=1, ar=plain(ARR(37, 1)),
         fr='Ô Allah, Seigneur des sept cieux et du Trône immense, sois mon protecteur contre un tel, fils d’un tel (dire son nom), et contre ses partisans parmi Tes créatures, afin qu’aucun d’eux ne se montre excessif ou n’abuse envers moi. Puissant est Ton protégé, grande est Ta louange, et il n’y a de divinité digne d’adoration que Toi.',
         ref='Al-Bukhari, al-Adab al-mufrad n° 707 ; jugé sahih par al-Albani (Sahih al-Adab al-mufrad n° 545).', src=(38, 0)),
    dict(ch='sul', no=2, ar=plain(ARR(37, 2).split('(ثلا')[0]),
         fr='Allah est le plus grand ; Allah est plus puissant que toute Sa création ; Allah est plus puissant que ce que je crains et redoute. Je cherche refuge auprès d’Allah, il n’y a de divinité digne d’adoration que Lui, Celui qui retient les sept cieux de tomber sur la terre sans Sa permission, contre le mal de Ton serviteur un tel (dire son nom), de ses soldats, de ses suiveurs et de ses partisans, parmi les djinns et les hommes. Ô Allah, sois mon protecteur contre leur mal ; grande est Ta louange, puissant est Ton protégé, béni soit Ton nom, et il n’y a de divinité digne d’adoration en dehors de Toi. (trois fois)',
         ref='Al-Bukhari, al-Adab al-mufrad n° 708 ; jugé sahih par al-Albani.', src=(38, 1)),
    dict(ch='con', no=1, ar=plain(ARR(38, 1)),
         fr='Ô Allah, Toi qui as révélé le Livre, prompt dans le compte, mets en déroute les coalisés ! Ô Allah, mets-les en déroute et fais-les trembler.',
         ref='Muslim 3/1362.', src=(39, 0)),
    dict(ch='peu', no=1, ar=plain(ARR(39, 1)), fr='Ô Allah, protège-moi d’eux comme Tu veux.',
         ref='Muslim 4/2300.', src=(40, 0)),
    dict(ch='dou', no=1, ar='آمَنْتُ بِاللَّهِ وَرُسُلِهِ',
         fr='J’ai cru en Allah et en Ses messagers. (en cas de doute dans la foi : chercher refuge auprès d’Allah, cesser d’y penser, et dire cette formule)',
         ref='Al-Bukhari (Fath al-Bari 6/336) ; Muslim 1/120.', src=(41, 2)),
    dict(ch='dou', no=2, ar=plain(ARR(40, 3).split('يَقْرَأُ قَوْلَهُ تَعَالَى:')[-1], keep=True),
         fr='« Il est le Premier et le Dernier, l’Apparent et le Caché, et Il est Omniscient. » (Coran 57:3 ; à réciter en cas de doute dans la foi)',
         ref='Coran, sourate al-Hadid, verset 3 ; Abu Dawud 4/329 ; jugé hassan par al-Albani (Sahih Abi Dawud 3/962).', src=(41, 3)),
    dict(ch='det', no=1, ar=plain(ARR(41, 1)),
         fr='Ô Allah, rends-moi suffisant par ce que Tu as permis pour que je m’abstienne de ce que Tu as interdit, et enrichis-moi par Ta grâce pour que je n’aie besoin que de Toi. (pour rembourser une dette ; la seconde formule du chapitre est celle de « Tristesse et souci » n° 2)',
         ref='At-Tirmidhi 5/560 (voir Sahih at-Tirmidhi 3/180).', src=(42, 0)),
    dict(ch='wsw', no=1, ar=plain(ARR(42, 1).split('وَاتْفُلْ')[0]),
         fr='Je cherche refuge auprès d’Allah contre Satan le maudit. (puis cracher légèrement sur sa gauche, trois fois : consigne du hadith de ‘Uthman ibn Abi l-‘As)',
         ref='Muslim 4/1729, hadith de ‘Uthman ibn Abi l-‘As (qu’Allah l’agrée) : « Je l’ai fait et Allah l’a éloigné de moi ».', src=(43, 0)),
    dict(ch='dif', no=1, ar=plain(ARR(43, 1)), fr='Ô Allah, il n’y a de facile que ce que Tu as rendu facile, et Tu rends facile le terrain difficile quand Tu le veux.',
         ref='Ibn Hibban n° 2427 (Mawarid) ; Ibn as-Sunni n° 351 ; al-Hafiz : hadith sahih ; jugé sahih par ‘Abd al-Qadir al-Arna’ut (Takhrij al-adhkar p. 106).', src=(44, 0)),
    dict(ch='dec', no=1, ar=plain(ARR(46, 1)), fr='C’est le décret d’Allah, et Il fait ce qu’Il veut. (quand survient ce qu’on n’aime pas, ou quand on est dépassé par les événements)',
         ref='Muslim 4/2052 (hadith : « Le croyant fort est meilleur… Et s’il t’arrive quelque chose, ne dis pas “si j’avais fait ceci…”, mais dis : C’est le décret d’Allah et ce qu’Il a voulu, Il l’a fait »). Voir aussi Takhrij al-adhkar d’al-Arna’ut p. 106.', src=(47, 0)),
    dict(ch='mal', no=1, ar=plain(ARR(49, 1)), fr='Pas de mal, c’est une purification, s’il plaît à Allah. (à dire à un malade que l’on visite)',
         ref='Al-Bukhari, Fath al-Bari 10/118.', src=(50, 0)),
    dict(ch='mal', no=2, ar=plain(ARR(49, 2).split('(سبع')[0]),
         fr='Je demande à Allah le Très-Grand, Seigneur du Trône immense, de te guérir. (sept fois)',
         ref='At-Tirmidhi, Abu Dawud : « Pas un musulman ne visite un malade dont le terme n’est pas venu et ne dit cela sept fois sans être guéri » (voir Sahih at-Tirmidhi 2/210 ; Sahih al-Jami‘ 5/180).', src=(50, 1)),
    dict(ch='mou', no=1, ar=plain(ARR(51, 1)), fr='Ô Allah, pardonne-moi, fais-moi miséricorde et fais-moi rejoindre le Compagnon suprême.',
         ref='Al-Bukhari 7/10 ; Muslim 4/1893.', src=(52, 0)),
    dict(ch='mou', no=2, ar='لاَ إِلَهَ إِلاَّ اللَّهُ إِنَّ لِلْمَوْتِ سَكَرَاتٍ',
         fr='Il n’y a de divinité digne d’adoration qu’Allah ; la mort a certes ses agonies. (paroles du Prophète, selon ‘A’isha, alors qu’il passait ses mains mouillées sur son visage)',
         ref='Al-Bukhari, Fath al-Bari 8/144.', src=(52, 1)),
    dict(ch='mou', no=3, ar=plain(ARR(51, 3)),
         fr='Il n’y a de divinité digne d’adoration qu’Allah, et Allah est le plus grand. Il n’y a de divinité digne d’adoration qu’Allah, Seul. Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. Il n’y a de divinité digne d’adoration qu’Allah : à Lui la royauté et à Lui la louange. Il n’y a de divinité digne d’adoration qu’Allah, et il n’y a de force ni de puissance qu’en Allah.',
         ref='At-Tirmidhi, Ibn Majah ; jugé sahih par al-Albani (Sahih at-Tirmidhi 3/152 ; Sahih Ibn Majah 2/317).', src=(52, 2)),
    dict(ch='dlr', no=1, ar=plain(ARR(124, 1)[ARR(124, 1).index('أَعُوذُ'):]),
         fr='Je cherche refuge auprès d’Allah et de Sa puissance contre le mal de ce que je ressens et de ce que je redoute. (poser la main sur l’endroit douloureux, dire d’abord trois fois « Au nom d’Allah », puis cette formule sept fois)',
         ref='Muslim 4/1728.', src=(125, 0)),
    dict(ch='faz', no=1, ar=plain(ARR(126, 1)).rstrip('!'), fr='Il n’y a de divinité digne d’adoration qu’Allah ! (exclamation quand on est effrayé ou saisi par un événement grave)',
         ref='Al-Bukhari, Fath al-Bari 6/181 ; Muslim 4/2208.', src=(127, 0)),
]

START = 400
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
json.dump(out, open(os.path.join(OUT_DIR, 'athkar-epreuves.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
lines = ['# Dhikr des épreuves — fiche de relecture', '',
         f'{len(out)} entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.', '',
         '## Ce qu’il faut vérifier', '',
         '1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.',
         '2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.',
         '3. **Choix de l’assistant** : seuls les passages qui sont des formules à dire sont repris ; ne sont PAS repris les consignes sans formule (« faire les ablutions et prier deux rak‘a après un péché », « chercher refuge, l’appel à la prière, la récitation » contre Satan, le chapitre sur la visite des malades), ni l’invocation « Que Allah le bénisse » contre le mauvais œil (la source ne donne que la consigne, aucune formule : je n’en invente pas). Le texte « Ô Allah, je cherche refuge contre le souci… » n’est présent qu’une fois (il figure aussi dans « dette »).',
         '4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).',
         '5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; le renvoi de « Quand arrive ce qu’on n’aime pas » est un résumé du renvoi d’origine (Muslim 4/2052).',
         '6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment les invocations de crainte du gouverneur, longues, où il faut dire le nom de la personne). **Phonétique** : générée par règles, sans tajwid.', '']
if warn:
    lines += ['## Voyelles encore manquantes dans la source (à vérifier)', ''] + [f'- {w}' for w in warn] + ['']
lines += ['## Les invocations', '']
for it, tl, ref, foot in md:
    lines += [f"### {CH[it['ch']]} n° {it['no']}", '', f"**Arabe** : {it['ar']}", '', f'**Phonétique** : {tl}', '', f"**Français** : {it['fr']}", '', f'**Référence** : {ref}', '',
              f'*Renvoi d’origine (arabe)* : {foot}', '']
open(os.path.join(OUT_DIR, 'athkar-epreuves.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(out), 'entrées')
for w in warn:
    print('ATTENTION', w)
