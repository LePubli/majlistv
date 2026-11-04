#!/usr/bin/env python3
"""
Contenus 9 — dhikr du quotidien du croyant : vent, tonnerre, pluie, nouvelle lune, jeûne, nourriture offerte, premiers fruits, éternuement.
Construit docs/contenus/athkar-meteo-jeune.json (import Admin → Athkar) et la fiche de relecture .md.
Sources : rn0x/Adhkar-json (arabe voyellé, recueil Hisn al-Muslim) et rn0x/hisn_almuslim_json (renvois / takhrij du recueil, 1 renvoi par texte).
Mêmes limites que build_matin_soir.py : traduction française de l'assistant (à valider), phonétique générée par règles.

Usage : python3 build_meteo_jeune.py <dossier rn0x/Adhkar-json> <dossier rn0x/hisn_almuslim_json> <dossier de sortie>
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
    return re.sub(r'\s+', ' ', t).strip()







CH = {
    'ven': 'Quand le vent souffle', 'ton': 'Quand on entend le tonnerre', 'ist': 'Demande de pluie (istisqa’)', 'plu': 'Quand la pluie tombe',
    'apl': 'Après la pluie', 'cal': 'Pour que la pluie cesse', 'lun': 'À la vue de la nouvelle lune', 'ift': 'En rompant le jeûne',
    'nou': 'Pour celui qui vous a nourri ou donné à boire', 'ihm': 'Rompre le jeûne chez quelqu’un', 'ins': 'Jeûneur que l’on insulte',
    'fru': 'Premiers fruits de la saison', 'eter': 'Éternuement',
}
HISN = json.load(open(os.path.join(HISN_DIR, 'hisn_almuslim.json'), encoding='utf-8'))
HT = list(HISN)
# src = (position du chapitre dans hisn_almuslim.json, n° du renvoi)
FOOT = lambda idx, i: re.sub(r'\s+', ' ', HISN[HT[idx]]['footnote'][i]).strip()

ITEMS = [
    dict(ch='ven', no=1, ar=plain(ARR(61, 1)), fr='Ô Allah, je Te demande son bien et je cherche refuge auprès de Toi contre son mal.',
         ref='Abu Dawud 4/326 ; Ibn Majah 2/1228 (voir Sahih Ibn Majah 2/305).', src=(62, 0)),
    dict(ch='ven', no=2, ar=plain(ARR(61, 2)),
         fr='Ô Allah, je Te demande son bien, le bien de ce qu’il contient et le bien de ce pour quoi il a été envoyé ; et je cherche refuge auprès de Toi contre son mal, le mal de ce qu’il contient et le mal de ce pour quoi il a été envoyé.',
         ref='Muslim 2/616 ; al-Bukhari 4/76.', src=(62, 1)),
    dict(ch='ton', no=1, ar=plain(ARR(62, 1)), fr='Gloire à Celui que le tonnerre glorifie par Sa louange, et les anges aussi, par crainte de Lui.',
         ref='Malik, al-Muwatta’ 2/992 : ‘Abdullah ibn az-Zubayr, quand il entendait le tonnerre, cessait de parler et disait cela. Al-Albani : chaîne authentique, rapporté de lui (mawquf).', src=(63, 0)),
    dict(ch='ist', no=1, ar=plain(ARR(63, 1)),
         fr='Ô Allah, fais-nous boire une pluie qui secourt, salutaire, fertilisante, utile et non nuisible, immédiate et non tardive.',
         ref='Abu Dawud 1/303 ; jugé sahih par al-Albani (Sahih Abi Dawud 1/216).', src=(64, 0)),
    dict(ch='ist', no=2, ar=plain(ARR(63, 2)), fr='Ô Allah, secours-nous ! Ô Allah, secours-nous ! Ô Allah, secours-nous !',
         ref='Al-Bukhari 1/224 ; Muslim 2/613.', src=(64, 1)),
    dict(ch='ist', no=3, ar=plain(ARR(63, 3)), fr='Ô Allah, abreuve Tes serviteurs et Tes bêtes, répands Ta miséricorde et fais revivre Ta terre morte.',
         ref='Abu Dawud 1/305 ; jugé hassan par al-Albani (Sahih Abi Dawud 1/218).', src=(64, 2)),
    dict(ch='plu', no=1, ar=plain(ARR(64, 1)), fr='Ô Allah, fais-en une pluie bénéfique.',
         ref='Al-Bukhari, Fath al-Bari 2/518.', src=(65, 0)),
    dict(ch='apl', no=1, ar=plain(ARR(65, 1)), fr='Il a plu sur nous par la grâce d’Allah et Sa miséricorde.',
         ref='Al-Bukhari 1/205 ; Muslim 1/83.', src=(66, 0)),
    dict(ch='cal', no=1, ar=plain(ARR(66, 1)),
         fr='Ô Allah, autour de nous et non sur nous ! Ô Allah, sur les collines, les hauteurs, le fond des vallées et les lieux où poussent les arbres. (quand la pluie devient excessive)',
         ref='Al-Bukhari 1/224 ; Muslim 2/614.', src=(67, 0)),
    dict(ch='lun', no=1, ar=plain(ARR(67, 1)),
         fr='Allah est le plus grand. Ô Allah, fais apparaître cette lune sur nous avec la sécurité et la foi, la paix et l’islam, et le succès dans ce que Tu aimes et agrées, ô notre Seigneur. Notre Seigneur et ton Seigneur est Allah.',
         ref='At-Tirmidhi 5/504 ; ad-Darimi 1/336 (dont est la formulation) ; voir Sahih at-Tirmidhi 3/157.', src=(68, 0)),
    dict(ch='ift', no=1, ar=plain(ARR(68, 1)), fr='La soif est partie, les veines sont humectées et la récompense est établie, si Allah le veut.',
         ref='Abu Dawud 2/306 et d’autres (voir Sahih al-Jami‘ 4/209).', src=(69, 0)),
    dict(ch='ift', no=2, ar=plain(ARR(68, 2)), fr='Ô Allah, je Te demande, par Ta miséricorde qui embrasse toute chose, de me pardonner.',
         ref='Ibn Majah 1/557, invocation de ‘Abdullah ibn ‘Amr (qu’Allah les agrée) ; jugé hassan par al-Hafiz Ibn Hajar (Takhrij al-adhkar ; Sharh al-adhkar 4/342).', src=(69, 1)),
    dict(ch='nou', no=1, ar=plain(ARR(72, 1)), fr='Ô Allah, nourris celui qui m’a nourri et abreuve celui qui m’a abreuvé.',
         ref='Muslim 3/26.', src=(73, 0)),
    dict(ch='ihm', no=1, ar=plain(ARR(73, 1)),
         fr='Les jeûneurs ont rompu le jeûne chez vous, les gens de bien ont mangé votre nourriture et les anges ont prié pour vous. (à dire à ses hôtes en rompant le jeûne chez eux)',
         ref='Abu Dawud 3/367 ; Ibn Majah 1/556 ; an-Nasa’i, ‘Amal al-yawm wa-l-layla n° 298 (il précise que le Prophète le disait en rompant le jeûne chez des gens) ; jugé sahih par al-Albani (Sahih Abi Dawud 2/730).', src=(74, 0)),
    dict(ch='ins', no=1, ar=plain(ARR(75, 1)), fr='Je jeûne, je jeûne. (à dire à celui qui vous insulte ou cherche querelle pendant le jeûne)',
         ref='Al-Bukhari, Fath al-Bari 4/103 ; Muslim 2/806.', src=(76, 0)),
    dict(ch='fru', no=1, ar=plain(ARR(76, 1)),
         fr='Ô Allah, bénis-nous dans nos fruits, bénis-nous dans notre ville, bénis-nous dans notre sa‘ et bénis-nous dans notre mudd. (à dire à la vue des premiers fruits de la saison)',
         ref='Muslim 2/1000.', src=(77, 0)),
    dict(ch='eter', no=1, ar='الْحَمْدُ لِلَّهِ', fr='Louange à Allah. (à dire quand on éternue)',
         ref='Al-Bukhari 7/125 : « Quand l’un de vous éternue, qu’il dise “Louange à Allah” ».', src=(78, 0)),
    dict(ch='eter', no=2, ar='يَرْحَمُكَ اللَّهُ', fr='Qu’Allah te fasse miséricorde. (réponse de son frère ou de son compagnon à celui qui éternue et loue Allah)',
         ref='Al-Bukhari 7/125.', src=(78, 0)),
    dict(ch='eter', no=3, ar=plain(ARR(77, 1).split('فَلْيَقُلْ:')[-1].replace('))', '')),
         fr='Qu’Allah vous guide et améliore votre état. (réponse de l’éternueur ; se dit aussi à un non-musulman qui éternue et loue Allah)',
         ref='Al-Bukhari 7/125 ; pour le non-musulman : at-Tirmidhi 5/82 ; Ahmad 4/400 ; Abu Dawud 4/308 (voir Sahih at-Tirmidhi 2/354).', src=(78, 0)),
]

START = 700
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
json.dump(out, open(os.path.join(OUT_DIR, 'athkar-meteo-jeune.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
lines = ['# Dhikr du quotidien du croyant — fiche de relecture', '',
         f'{len(out)} entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.', '',
         '## Ce qu’il faut vérifier', '',
         '1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.',
         '2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.',
         '3. **Choix de l’assistant** : seules les formules à dire sont reprises. Non repris : le hadith « celui qui est invité et jeûne doit faire une invocation » (consigne, pas de formule). L’éternuement est découpé en 3 formules (louange, « Qu’Allah te fasse miséricorde », réponse) d’après le hadith du chapitre : « Louange à Allah » et « Qu’Allah te fasse miséricorde » ne figurent dans la source que dans cette phrase ; leur arabe est celui du hadith. La réponse « Qu’Allah vous guide… » sert aussi pour le non-musulman (chapitre suivant du recueil).',
         '4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).',
         '5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; certains renvois sont abrégés ou regroupent des formules ; le renvoi d’origine en arabe est donné sous chaque entrée.',
         '6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment l’invocation de la nouvelle lune). **Phonétique** : générée par règles, sans tajwid.', '']
if warn:
    lines += ['## Voyelles encore manquantes dans la source (à vérifier)', ''] + [f'- {w}' for w in warn] + ['']
lines += ['## Les invocations', '']
for it, tl, ref, foot in md:
    lines += [f"### {CH[it['ch']]} n° {it['no']}", '', f"**Arabe** : {it['ar']}", '', f'**Phonétique** : {tl}', '', f"**Français** : {it['fr']}", '', f'**Référence** : {ref}', '',
              f'*Renvoi d’origine (arabe)* : {foot}', '']
open(os.path.join(OUT_DIR, 'athkar-meteo-jeune.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(out), 'entrées')
for w in warn:
    print('ATTENTION', w)
