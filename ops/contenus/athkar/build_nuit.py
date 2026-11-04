#!/usr/bin/env python3
"""
Contenus 12 — dhikr de la nuit : se retourner la nuit, frayeur dans le sommeil, rêve.
Construit docs/contenus/athkar-nuit.json (import Admin → Athkar) et la fiche de relecture .md.
Sources : rn0x/Adhkar-json (arabe voyellé, recueil Hisn al-Muslim) et rn0x/hisn_almuslim_json (renvois / takhrij du recueil, 1 renvoi par texte).
Mêmes limites que build_matin_soir.py : traduction française de l'assistant (à valider), phonétique générée par règles.

Usage : python3 build_nuit.py <dossier rn0x/Adhkar-json> <dossier rn0x/hisn_almuslim_json> <dossier de sortie>
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
FIX3 = [('الْقَهّارُ', 'الْقَهَّارُ'), ('الْعَزيزُ', 'الْعَزِيزُ'), ('القَيّوُمُ', 'الْقَيُّومُ'), ('بكَلِمَاتِ', 'بِكَلِمَاتِ'), ('فيهَا', 'فِيهَا'), ('التَّامَّاتِ', 'التَّامَّاتِ'), ('وَكبَّرَهُ', 'وَكَبَّرَهُ'), ('بارَكَ', 'بَارَكَ'), ('الْخَبائِث', 'الْخَبَائِثِ'), ('سُبْحانَكَ', 'سُبْحَانَكَ'), ('وَأَتوبُ', 'وَأَتُوبُ'), ('وَلَاَ حَوْلَ', 'وَلاَ حَوْلَ'),
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
    'ret': 'Quand on se retourne la nuit', 'fra': 'Frayeur et solitude dans le sommeil', 'rev': 'Quand on a vu un rêve',
}
HISN = json.load(open(os.path.join(HISN_DIR, 'hisn_almuslim.json'), encoding='utf-8'))
HT = list(HISN)
# src = (position du chapitre dans hisn_almuslim.json = n° adhkar + 1, n° du renvoi)
FOOT = lambda idx, i: re.sub(r'\s+', ' ', HISN[HT[idx]]['footnote'][i]).strip()
INP = lambda t: N(t).split('((')[-1].split('))')[0]

ITEMS = [
    dict(ch='ret', no=1, ar=plain(INP(ARR(29, 1))),
         fr='Il n’y a de divinité qu’Allah, l’Unique, le Dominateur suprême, Seigneur des cieux et de la terre et de ce qui est entre eux, le Puissant, le Grand Pardonneur. (à dire quand on se retourne d’un côté à l’autre pendant la nuit)',
         ref='Al-Hakim 1/540, jugé authentique, adh-Dhahabi d’accord ; an-Nasa’i, ‘Amal al-yawm wa-l-layla ; Ibn as-Sunni (voir Sahih al-Jami‘ 4/213).', src=(30, 0)),
    dict(ch='fra', no=1, ar=plain(INP(ARR(30, 1))),
         fr='Je cherche refuge dans les paroles parfaites d’Allah contre Sa colère et Son châtiment, contre le mal de Ses serviteurs, contre les incitations des démons et contre le fait qu’ils soient présents auprès de moi. (en cas de frayeur ou d’angoisse dans le sommeil, ou d’isolement)',
         ref='Abu Dawud 4/12 (voir Sahih at-Tirmidhi 3/171).', src=(31, 0)),
    dict(ch='rev', no=1, ar='أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ وَمِنْ شَرِّ مَا رَأَيْتُ',
         fr='Je cherche refuge auprès d’Allah contre Satan et contre le mal de ce que j’ai vu. (formule reconstituée : le recueil dit seulement que celui qui a vu un rêve qu’il n’aime pas crache légèrement à sa gauche, cherche refuge auprès d’Allah contre Satan et contre le mal de ce qu’il a vu, trois fois, n’en parle à personne et change de côté)',
         ref='Muslim 4/1772-1773. ATTENTION : la source décrit l’action à la 3e personne (« il cherche refuge auprès d’Allah contre Satan et contre le mal de ce qu’il a vu ») sans donner de formule ; l’arabe ci-contre est une mise à la 1re personne faite par l’assistant, à valider.', src=(32, 0)),
]

START = 1000
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
json.dump(out, open(os.path.join(OUT_DIR, 'athkar-nuit.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
lines = ['# Dhikr de la nuit — fiche de relecture', '',
         f'{len(out)} entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.', '',
         '## Ce qu’il faut vérifier', '',
         '1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.',
         '2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.',
         '3. **Entrée « Quand on a vu un rêve »** : la source ne donne pas de formule, seulement une description à la 3e personne (« il cherche refuge auprès d’Allah contre Satan et contre le mal de ce qu’il a vu »). L’arabe est une mise à la 1re personne faite par l’assistant, donc à valider ou à retirer. Les autres gestes (cracher légèrement à gauche, ne pas raconter le rêve, changer de côté, prier) sont des consignes sans formule : non repris.',
         '4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).',
         '5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; certains renvois sont abrégés ou regroupent des formules ; le renvoi d’origine en arabe est donné sous chaque entrée.',
         '6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment la mise à la 1re personne de la formule du rêve). **Phonétique** : générée par règles, sans tajwid.', '']
if warn:
    lines += ['## Voyelles encore manquantes dans la source (à vérifier)', ''] + [f'- {w}' for w in warn] + ['']
lines += ['## Les invocations', '']
for it, tl, ref, foot in md:
    lines += [f"### {CH[it['ch']]} n° {it['no']}", '', f"**Arabe** : {it['ar']}", '', f'**Phonétique** : {tl}', '', f"**Français** : {it['fr']}", '', f'**Référence** : {ref}', '',
              f'*Renvoi d’origine (arabe)* : {foot}', '']
open(os.path.join(OUT_DIR, 'athkar-nuit.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(out), 'entrées')
for w in warn:
    print('ATTENTION', w)
