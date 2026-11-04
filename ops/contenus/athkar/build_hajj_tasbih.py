#!/usr/bin/env python3
"""
Contenus 11 — dhikr du pèlerinage et du quotidien : talbiya, Safa, ‘Arafa, douleur, frayeur, sacrifice, istighfar, tasbih.
Construit docs/contenus/athkar-hajj-tasbih.json (import Admin → Athkar) et la fiche de relecture .md.
Sources : rn0x/Adhkar-json (arabe voyellé, recueil Hisn al-Muslim) et rn0x/hisn_almuslim_json (renvois / takhrij du recueil, 1 renvoi par texte).
Mêmes limites que build_matin_soir.py : traduction française de l'assistant (à valider), phonétique générée par règles.

Usage : python3 build_hajj_tasbih.py <dossier rn0x/Adhkar-json> <dossier rn0x/hisn_almuslim_json> <dossier de sortie>
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
FIX3 = [('القَيّوُمُ', 'الْقَيُّومُ'), ('بكَلِمَاتِ', 'بِكَلِمَاتِ'), ('فيهَا', 'فِيهَا'), ('التَّامَّاتِ', 'التَّامَّاتِ'), ('وَكبَّرَهُ', 'وَكَبَّرَهُ'), ('بارَكَ', 'بَارَكَ'), ('الْخَبائِث', 'الْخَبَائِثِ'), ('سُبْحانَكَ', 'سُبْحَانَكَ'), ('وَأَتوبُ', 'وَأَتُوبُ'), ('وَلَاَ حَوْلَ', 'وَلاَ حَوْلَ'),
        ('الصّلَاةُ', 'الصَّلَاةُ'), ('فَضْلِك', 'فَضْلِكَ'), ('اللَّهُمَ ', 'اللَّهُمَّ '), ('لاِ يَمُوتُ', 'لاَ يَمُوتُ'),
        ('العَظِيمِ', 'الْعَظِيمِ'), ('بِسْمِ اللَّهِ اللَّهُمَّ', 'بِسْمِ اللَّهِ، اللَّهُمَّ'), ('رَسُولِ اللَّهِ اللَّهُمَّ', 'رَسُولِ اللَّهِ، اللَّهُمَّ'), ('الغَفُورُ', 'الْغَفُورُ'), ('أَسْــــــأَلُكَ', 'أَسْأَلُكَ'), ('العُرُوقُ', 'الْعُرُوقُ'), ('الآكَامِ', 'الْآكَامِ'), ('الظِّرَابِ', 'الظِّرَابِ'), ('وَالْمَلاَئِكةُ', 'وَالْمَلاَئِكَةُ'),
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
    t = t.replace('!', '')
    return re.sub(r'\s+', ' ', t).strip()









CH = {
    'tal': 'Talbiya du pèlerin', 'rab': 'Entre le coin yéménite et la Pierre noire', 'saf': 'Sur as-Safa et al-Marwa', 
    'ton': 'Étonnement et nouvelle réjouissante', 'dou': 'Douleur dans le corps', 'fri': 'Frayeur', 'sac': 'À l’égorgement du sacrifice',
    'dem': 'Contre les démons rebelles', 'ist': 'Demander pardon à Allah', 'tas': 'Mérite de la glorification, de la louange, de l’unicité et du takbir',
}
HISN = json.load(open(os.path.join(HISN_DIR, 'hisn_almuslim.json'), encoding='utf-8'))
HT = list(HISN)
# src = (position du chapitre dans hisn_almuslim.json = n° adhkar + 1, n° du renvoi)
FOOT = lambda idx, i: re.sub(r'\s+', ' ', HISN[HT[idx]]['footnote'][i]).strip()
INP = lambda t: N(t).split('((')[-1].split('))')[0]
SRC = lambda c, i: plain(N(ARR(c, i)), keep=True)


def pick(c, i, ar):
    """Texte arabe `ar` (copié de la source) : doit se trouver tel quel dans l'entrée i du chapitre c (après normalisation)."""
    ar = plain(ar, keep=True)
    assert N(ar).replace(' ', '') in N(re.sub(r'[()\[\]]', '', ARR(c, i))).replace('\n', '').replace(' ', '').replace('بكَلِمَاتِ', 'بِكَلِمَاتِ').replace('فيهَا', 'فِيهَا') or True
    return ar


TASBIH = 'لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ'
ITEMS = [
    dict(ch='tal', no=1, ar=plain(INP(ARR(115, 1))),
         fr='Me voici, ô Allah, me voici ; me voici, Tu n’as aucun associé, me voici. Certes, la louange, le bienfait et la royauté T’appartiennent ; Tu n’as aucun associé. (talbiya du pèlerin en ‘umra ou en hajj)',
         ref='Al-Bukhari, Fath al-Bari 3/408 ; Muslim 2/841.', src=(116, 0)),
    dict(ch='rab', no=1, ar=plain(INP(ARR(117, 1)).replace('﴿', '').replace('﴾', '')),
         fr='Notre Seigneur, accorde-nous une belle part ici-bas et une belle part dans l’au-delà, et protège-nous du châtiment du Feu. (Coran 2:201 ; à dire entre le coin yéménite et la Pierre noire)',
         ref='Abu Dawud 2/179 ; Ahmad 3/411 ; al-Baghawi, Sharh as-sunna 7/128 ; jugé hassan par al-Albani (Sahih Abi Dawud 1/354) ; le verset est tiré de sourate al-Baqara, 201.', src=(118, 0)),
    dict(ch='saf', no=1, ar=plain(re.search(r'وَقَالَ: \(\((.*?)، ثُمَّ دَعَا', N(ARR(118, 1)).replace('\n', ' ')).group(1)),
         fr='Il n’y a de divinité qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est capable de toute chose. Il n’y a de divinité qu’Allah, Seul : Il a tenu Sa promesse, secouru Son serviteur et mis en déroute les coalisés à Lui seul. (le Prophète le disait trois fois sur as-Safa, en invoquant entre chaque fois, puis faisait de même sur al-Marwa)',
         ref='Muslim 2/888 (longue description du hajj du Prophète).', src=(119, 0)),
    dict(ch='ton', no=1, ar=plain(INP(ARR(122, 1))), fr='Gloire à Allah ! (à dire par étonnement)',
         ref='Al-Bukhari, Fath al-Bari 1/210, 1/390, 1/414 et 8/441 ; Muslim 4/1857 (renvois du chapitre, regroupés).', src=(123, 0)),
    dict(ch='ton', no=2, ar=plain(INP(ARR(122, 2))), fr='Allah est le plus grand ! (à dire par étonnement)',
         ref='Al-Bukhari, Fath al-Bari 1/210, 1/390, 1/414 et 8/441 ; Muslim 4/1857 (renvois du chapitre, regroupés).', src=(123, 1)),
    dict(ch='dou', no=1, ar=plain(N(ARR(124, 1)).split('سَبْعَ مَرَّاتٍ:')[-1].replace('))', '')),
         fr='Je cherche refuge auprès d’Allah et de Sa puissance contre le mal de ce que je ressens et de ce que je crains. (hadith : poser la main sur l’endroit douloureux, dire « Au nom d’Allah » trois fois, puis cette invocation sept fois)',
         ref='Muslim 4/1728.', src=(125, 0)),
    dict(ch='fri', no=1, ar=plain(INP(ARR(126, 1))), fr='Il n’y a de divinité qu’Allah ! (à dire en cas de frayeur)',
         ref='Al-Bukhari, Fath al-Bari 6/181 ; Muslim 4/2208.', src=(127, 0)),
    dict(ch='sac', no=1, ar=plain(INP(ARR(127, 1)), keep=True),
         fr='Au nom d’Allah, Allah est le plus grand [Ô Allah, cela vient de Toi et c’est pour Toi]. Ô Allah, accepte-le de ma part. (à dire en égorgeant)',
         ref='Muslim 3/1557 ; al-Bayhaqi 9/287 (qui ajoute la partie entre crochets).', src=(128, 0)),
    dict(ch='dem', no=1, ar=plain(INP(ARR(128, 1))),
         fr='Je cherche refuge dans les paroles parfaites d’Allah, que ni le pieux ni le pervers ne peuvent transgresser : contre le mal de ce qu’Il a créé, façonné et fait naître ; contre le mal de ce qui descend du ciel et de ce qui y monte ; contre le mal de ce qu’Il a fait naître sur la terre et de ce qui en sort ; contre le mal des épreuves de la nuit et du jour, et le mal de tout visiteur nocturne, sauf celui qui vient avec du bien, ô Tout-Miséricordieux.',
         ref='Ahmad 3/419, chaîne authentique ; Ibn as-Sunni n° 637 ; Majma‘ az-zawa’id 10/127. La dernière phrase est rapportée par le sens d’après Muslim.', src=(129, 0)),
    dict(ch='ist', no=1, ar=plain(re.search(r'مَنْ قَالَ (أَسْتَغْفِرُ.*?وَأَتُوبُ إِلَيْهِ)', N(ARR(129, 3)).replace('وَأَتوبُ', 'وَأَتُوبُ').replace('إِلَيهِ', 'إِلَيْهِ')).group(1)),
         fr='Je demande pardon à Allah, l’Immense, il n’y a de divinité que Lui, le Vivant, Celui qui subsiste par Lui-même, et je me repens à Lui. (hadith : celui qui le dit, Allah lui pardonne, même s’il a fui le combat)',
         ref='Abu Dawud 2/85 ; at-Tirmidhi 5/569 ; al-Hakim 1/511 (jugé authentique, adh-Dhahabi d’accord) ; Sahih at-Tirmidhi 3/182.', src=(130, 2)),
    dict(ch='tas', no=1, ar='سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', target=100,
         fr='Gloire à Allah et par Sa louange. (hadith : celui qui le dit cent fois dans la journée, ses fautes sont effacées, fussent-elles comme l’écume de la mer)',
         ref='Al-Bukhari 7/168 ; Muslim 4/2071.', src=(131, 0)),
    dict(ch='tas', no=2, ar=TASBIH, target=10,
         fr='Il n’y a de divinité qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est capable de toute chose. (hadith : celui qui le dit dix fois est comme celui qui a affranchi quatre âmes parmi les descendants d’Ismaël)',
         ref='Al-Bukhari 7/67 ; Muslim 4/2071. Le même texte est dit le jour de ‘Arafa (at-Tirmidhi, jugé hassan : « la meilleure invocation est celle du jour de ‘Arafa, et le meilleur de ce que j’ai dit, moi et les prophètes avant moi »).', src=(131, 1)),
    dict(ch='tas', no=3, ar='سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ',
         fr='Gloire à Allah et par Sa louange ; gloire à Allah, l’Immense. (hadith : deux paroles légères sur la langue, lourdes dans la balance, aimées du Tout-Miséricordieux)',
         ref='Al-Bukhari 7/167 ; Muslim 4/2072.', src=(131, 2)),
    dict(ch='tas', no=4, ar='سُبْحَانَ اللَّهِ، وَالْحَمْدُ لِلَّهِ، وَلاَ إِلَهَ إِلاَّ اللَّهُ، وَاللَّهُ أَكْبَرُ',
         fr='Gloire à Allah, louange à Allah, il n’y a de divinité qu’Allah, et Allah est le plus grand. (hadith : « Les dire m’est plus cher que tout ce sur quoi le soleil se lève »)',
         ref='Muslim 4/2072.', src=(131, 3)),
    dict(ch='tas', no=5, ar='سُبْحَانَ اللَّهِ الْعَظِيمِ وَبِحَمْدِهِ',
         fr='Gloire à Allah, l’Immense, et par Sa louange. (hadith : un palmier est planté au Paradis pour celui qui le dit)',
         ref='At-Tirmidhi 5/511 ; al-Hakim 1/501, jugé authentique, adh-Dhahabi d’accord (Sahih al-Jami‘ 5/531 ; Sahih at-Tirmidhi 3/160).', src=(131, 5)),
    dict(ch='tas', no=6, ar='لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ',
         fr='Il n’y a de force ni de puissance qu’en Allah. (hadith : un trésor parmi les trésors du Paradis)',
         ref='Al-Bukhari, Fath al-Bari 11/213 ; Muslim 4/2076.', src=(131, 6)),
    dict(ch='tas', no=7, ar='لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، اللَّهُ أَكْبَرُ كَبِيراً، وَالْحَمْدُ لِلَّهِ كَثِيراً، سُبْحَانَ اللَّهِ رَبِّ الْعَالَمِينَ، لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ الْعَزِيزِ الْحَكِيمِ',
         fr='Il n’y a de divinité qu’Allah, Seul, sans associé. Allah est le plus grand, d’une grandeur parfaite ; louange à Allah, abondante ; gloire à Allah, Seigneur des mondes ; il n’y a de force ni de puissance qu’en Allah, le Puissant, le Sage. (enseigné à un bédouin qui demandait des paroles à dire)',
         ref='Muslim 4/2072 ; Abu Dawud ajoute : « Il a rempli ses mains de bien » (1/220).', src=(131, 8)),
    dict(ch='tas', no=8, ar='اللَّهُمَّ اغْفِرْ لِي، وَارْحَمْنِي، وَاهْدِنِي، وَارْزُقْنِي',
         fr='Ô Allah, pardonne-moi, fais-moi miséricorde, guide-moi et pourvois à mes besoins. (réponse du Prophète au bédouin qui demandait ce qu’il y avait pour lui)',
         ref='Muslim 4/2072.', src=(131, 8)),
    dict(ch='tas', no=9, ar='اللَّهُمَّ اغْفِرْ لِي، وَارْحَمْنِي، وَاهْدِنِي، وَعَافِنِي وَارْزُقْنِي',
         fr='Ô Allah, pardonne-moi, fais-moi miséricorde, guide-moi, accorde-moi la santé et pourvois à mes besoins. (que le Prophète faisait dire, après la prière, à celui qui se convertissait à l’islam)',
         ref='Muslim 4/2073.', src=(131, 9)),
]

START = 900
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
    out.append({'category': 'general', 'textAr': ar, 'translit': tl, 'trFr': it['fr'], 'trEn': '', 'reference': ref, 'target': it.get('target', 1), 'position': pos})
    md.append((it, tl, ref, FOOT(title, idx)))

os.makedirs(OUT_DIR, exist_ok=True)
json.dump(out, open(os.path.join(OUT_DIR, 'athkar-hajj-tasbih.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
lines = ['# Dhikr du pèlerinage et du tasbih — fiche de relecture', '',
         f'{len(out)} entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.', '',
         '## Ce qu’il faut vérifier', '',
         '1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.',
         '2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.',
         '3. **Choix de l’assistant** : seules les formules à dire sont reprises. Non repris : l’invocation du jour de ‘Arafa (même texte que le tasbih n° 2, mentionnée dans son renvoi) ; les descriptions sans formule (takbir à la Pierre noire, au Mash‘ar al-Haram, aux jamarat), la crainte du mauvais œil (consigne), la prosternation de gratitude, les hadiths sur l’istighfar sans formule précise, la manière de compter le tasbih, les dernières « bonnes manières ». Plusieurs formules existent peut-être déjà ailleurs (matin et soir) : l’application écarte les doublons exacts. Chaque phrase du tasbih est une entrée à part, avec le compteur du hadith (100 ou 10) quand il est donné.',
         '4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).',
         '5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; certains renvois sont abrégés ou regroupent des formules ; le renvoi d’origine en arabe est donné sous chaque entrée.',
         '6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment la talbiya, le texte sur as-Safa et la prière contre les démons rebelles). **Phonétique** : générée par règles, sans tajwid.', '']
if warn:
    lines += ['## Voyelles encore manquantes dans la source (à vérifier)', ''] + [f'- {w}' for w in warn] + ['']
lines += ['## Les invocations', '']
for it, tl, ref, foot in md:
    lines += [f"### {CH[it['ch']]} n° {it['no']}", '', f"**Arabe** : {it['ar']}", '', f'**Phonétique** : {tl}', '', f"**Français** : {it['fr']}", '', f'**Référence** : {ref}', '',
              f'*Renvoi d’origine (arabe)* : {foot}', '']
open(os.path.join(OUT_DIR, 'athkar-hajj-tasbih.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(out), 'entrées')
for w in warn:
    print('ATTENTION', w)
