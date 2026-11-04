#!/usr/bin/env python3
"""
Contenus 3 — dhikr de la vie quotidienne (toilettes, ablutions, maison, mosquée, vêtements, repas, marché, assemblée).
Construit docs/contenus/athkar-vie-quotidienne.json (import Admin → Athkar) et la fiche de relecture .md.
Sources : rn0x/Adhkar-json (arabe voyellé, recueil Hisn al-Muslim) et rn0x/hisn_almuslim_json (renvois / takhrij du recueil, 1 renvoi par texte).
Mêmes limites que build_matin_soir.py : traduction française de l'assistant (à valider), phonétique générée par règles.

Usage : python3 build_vie_quotidienne.py <dossier rn0x/Adhkar-json> <dossier rn0x/hisn_almuslim_json> <dossier de sortie>
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
        ('العَظِيمِ', 'الْعَظِيمِ'), ('بِسْمِ اللَّهِ اللَّهُمَّ', 'بِسْمِ اللَّهِ، اللَّهُمَّ'), ('رَسُولِ اللَّهِ اللَّهُمَّ', 'رَسُولِ اللَّهِ، اللَّهُمَّ'), ('الغَفُورُ', 'الْغَفُورُ')]


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
    'wc_in': 'Dhikr en entrant aux toilettes', 'wc_out': 'Dhikr en sortant des toilettes', 'wu_av': 'Dhikr avant les ablutions (aussi en ôtant son vêtement et avant le repas)',
    'wu_ap': 'Dhikr après les ablutions (le n° 3 conclut aussi une assemblée)', 'mai_out': 'Dhikr en sortant de la maison', 'mai_in': 'Dhikr en entrant à la maison',
    'mos_go': 'Invocation en allant à la mosquée', 'mos_in': 'Invocation en entrant à la mosquée', 'mos_out': 'Invocation en sortant de la mosquée',
    'vet': 'Invocation en mettant un vêtement', 'vet_n': 'Invocation en mettant un vêtement neuf', 'vet_v': 'Invocation pour celui qui porte un vêtement neuf',
    'rep_av': 'Invocation avant le repas', 'rep_ap': 'Invocation après le repas',
    'hote': 'Invocation de l’invité pour son hôte', 'marche': 'Invocation en entrant au marché', 'assem': 'Ce que l’on dit pendant une assemblée',
    
}
# Numéros de chapitre dans rn0x/Adhkar-json et titre du chapitre dans rn0x/hisn_almuslim_json (renvois).
HISN = json.load(open(os.path.join(HISN_DIR, 'hisn_almuslim.json'), encoding='utf-8'))
FOOT = lambda title, i: re.sub(r'\s+', ' ', HISN[title]['footnote'][i]).strip()

# Chaque entrée : ch = chapitre, no = n° de l'invocation dans le chapitre, ar = arabe, fr = français, ref = renvoi du recueil traduit.
ITEMS = [
    dict(ch='wc_in', no=1, ar=plain(ARR(4, 1), keep=True), fr='Au nom d’Allah. Ô Allah, je cherche refuge auprès de Toi contre les démons mâles et femelles.',
         ref='Al-Bukhari 1/45 ; Muslim 1/283 (hadith unanimement reconnu). L’ajout « Au nom d’Allah » au début est rapporté par Sa‘id ibn Mansur (voir Fath al-Bari 1/244).', src=('دعاء دخول الخلاء', 0)),
    dict(ch='wc_out', no=1, ar=plain(ARR(5, 1)), fr='Je Te demande Ton pardon.',
         ref='Les auteurs des Sunan, sauf an-Nasa’i qui le rapporte dans ‘Amal al-yawm wa-l-layla (voir Takhrij Zad al-Ma‘ad 2/387).', src=('دعاء الخروج من الخلاء', 0)),
    dict(ch='wu_av', no=1, ar=plain(ARR(6, 1)), fr='Au nom d’Allah. (avant les ablutions ; la même formule se dit en ôtant son vêtement et avant de manger : si on l’oublie au début du repas, dire « Au nom d’Allah, au début et à la fin »)',
         ref='Ablutions : Abu Dawud, Ibn Majah, Ahmad (voir Irwa’ al-ghalil 1/122). Vêtement ôté : at-Tirmidhi 2/505 et d’autres (Irwa’ n° 49) : écran entre les yeux des djinns et la nudité des fils d’Adam. Repas : Abu Dawud 3/347 ; at-Tirmidhi 4/288.', src=('الذكر قبل الوضوء', 0)),
    dict(ch='wu_ap', no=1, ar=plain(ARR(7, 1)), fr='J’atteste qu’il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé, et j’atteste que Muhammad est Son serviteur et Son messager.',
         ref='Muslim 1/209.', src=('الذكر بعد الفراغ من الوضوء', 0)),
    dict(ch='wu_ap', no=2, ar=plain(ARR(7, 2)), fr='Ô Allah, fais de moi l’un de ceux qui reviennent à Toi avec repentir et l’un de ceux qui se purifient. (à ajouter après les deux témoignages)',
         ref='At-Tirmidhi 1/78 (voir Sahih at-Tirmidhi 1/18). C’est un ajout rapporté par at-Tirmidhi après les deux témoignages.', src=('الذكر بعد الفراغ من الوضوء', 1)),
    dict(ch='wu_ap', no=3, ar=plain(ARR(7, 3)), fr='Gloire et pureté à Toi, ô Allah, et louange à Toi. J’atteste qu’il n’y a de divinité digne d’adoration que Toi ; je Te demande pardon et je me repens auprès de Toi. (après les ablutions ; la même formule conclut une assemblée)',
         ref='Ablutions : an-Nasa’i, ‘Amal al-yawm wa-l-layla p. 173 (Irwa’ al-ghalil 1/135 et 2/94). Fin d’assemblée : les auteurs des Sunan (Sahih at-Tirmidhi 3/153) ; ‘A’isha : le Messager d’Allah concluait ainsi toute assemblée, récitation ou prière (an-Nasa’i n° 308 ; Ahmad 6/77).', src=('الذكر بعد الفراغ من الوضوء', 2)),
    dict(ch='mai_out', no=1, ar=plain(ARR(8, 1)), fr='Au nom d’Allah ; je m’en remets à Allah ; il n’y a de force ni de puissance qu’en Allah.',
         ref='Abu Dawud 4/325 ; at-Tirmidhi 5/490 (voir Sahih at-Tirmidhi 3/151).', src=('الذكر عند الخروج من المنزل', 0)),
    dict(ch='mai_out', no=2, ar=plain(ARR(8, 2)), fr='Ô Allah, je cherche refuge auprès de Toi pour ne pas m’égarer ni être égaré, pour ne pas faillir ni être poussé à faillir, pour ne pas être injuste ni victime d’une injustice, pour ne pas être ignorant ni qu’on se montre ignorant envers moi.',
         ref='Les auteurs des Sunan (voir Sahih at-Tirmidhi 3/152 ; Sahih Ibn Majah 2/336).', src=('الذكر عند الخروج من المنزل', 1)),
    dict(ch='mai_in', no=1, ar=plain(ARR(9, 1)).split('ثُمَّ')[0].strip().rstrip('،').strip(),
         fr='Au nom d’Allah nous sommes entrés, au nom d’Allah nous sommes sortis, et c’est en Allah, notre Seigneur, que nous plaçons notre confiance. (puis saluer les siens)',
         ref='Abu Dawud 4/325 ; Ibn Baz a jugé sa chaîne hassan (Tuhfat al-akhyar p. 28). Hadith authentique : quand l’homme entre chez lui et mentionne Allah à son entrée et à son repas, Satan dit : « Pas de gîte ni de dîner pour vous » (Muslim n° 2018).', src=('الذكر عند الدخول المنزل', 0)),
    dict(ch='mos_go', no=1, ar=plain(ARR(10, 1)),
         fr='Ô Allah, place une lumière dans mon cœur, une lumière dans ma langue, une lumière dans mon ouïe, une lumière dans ma vue, une lumière au-dessus de moi, une lumière au-dessous de moi, une lumière à ma droite, une lumière à ma gauche, une lumière devant moi, une lumière derrière moi ; place une lumière dans mon âme, agrandis ma lumière, rends-la immense pour moi, accorde-moi une lumière, fais de moi une lumière. Ô Allah, donne-moi une lumière ; place une lumière dans mes nerfs, dans ma chair, dans mon sang, dans mes cheveux et dans ma peau.',
         ref='Al-Bukhari 11/116 n° 6316 ; Muslim 1/526, 529, 530 n° 763 (toutes ces demandes y figurent). Les autres renvois du recueil concernent des ajouts que nous n’avons pas repris (lumière dans la tombe et les os, « accorde-moi une lumière sur une lumière »).', src=('دعاء الذهاب إلى المسجد', 0)),
    dict(ch='mos_in', no=1, ar=plain(ARR(11, 1), keep=True).replace('يَبْدَأُ بِرِجْلِهِ الْيُمْنَى', '').strip(' ،:').replace('وَيَقُولُ:', '').replace('وَيَقُولُ', '').strip(' ،:').replace('الرَّجِيمِ بِسْمِ', 'الرَّجِيمِ، بِسْمِ'),
         fr='(Entrer du pied droit.) Je cherche refuge auprès d’Allah le Très-Grand, par Son noble Visage et Sa souveraineté éternelle, contre Satan le maudit. Au nom d’Allah, et que la prière et la paix soient sur le Messager d’Allah. Ô Allah, ouvre-moi les portes de Ta miséricorde.',
         ref='Renvois du recueil (rattachement non précisé) : Abu Dawud (voir Sahih al-Jami‘ n° 4591) ; Ibn as-Sunni n° 88, jugé hassan par al-Albani ; Abu Dawud 1/126 (Sahih al-Jami‘ 1/528) ; Muslim 1/494 (Ibn Majah, d’après Fatima : « Ô Allah, pardonne-moi mes péchés et ouvre-moi les portes de Ta miséricorde », jugé sahih par al-Albani grâce à ses témoins).', src=('دعاء دخول المسجد', 0)),
    dict(ch='mos_out', no=1, ar=plain(ARR(12, 1), keep=True).replace('يَبْدَأُ بِرِجْلِهِ الْيُسْرَى', '').replace('وَيَقُولُ:', '').replace('وَيَقُولُ', '').strip(' ،:'),
         fr='(Sortir du pied gauche.) Au nom d’Allah, et que la prière et la paix soient sur le Messager d’Allah. Ô Allah, je Te demande de Ta grâce. Ô Allah, protège-moi de Satan le maudit.',
         ref='Voir les renvois de l’invocation précédente. L’ajout « Ô Allah, protège-moi de Satan le maudit » est rapporté par Ibn Majah (voir Sahih Ibn Majah 1/288).', src=('دعاء الخروج من المسجد', 0)),
    dict(ch='vet', no=1, ar=plain(ARR(14, 1)).replace('الثَّوْبَ', '').replace('  ', ' ').replace('هَذَا وَرَزَقَنِيهِ', 'هَذَا وَرَزَقَنِيهِ'),
         fr='Louange à Allah qui m’a vêtu de ceci et me l’a accordé sans force ni puissance de ma part.',
         ref='Les auteurs des Sunan, sauf an-Nasa’i (voir Irwa’ al-ghalil 7/47).', src=('دعاء لبس الثوب', 0)),
    dict(ch='vet_n', no=1, ar=plain(ARR(15, 1)),
         fr='Ô Allah, à Toi la louange, c’est Toi qui me l’as fait porter. Je Te demande son bien et le bien de ce pour quoi il a été fait, et je cherche refuge auprès de Toi contre son mal et le mal de ce pour quoi il a été fait.',
         ref='Abu Dawud, at-Tirmidhi, al-Baghawi (voir Mukhtasar ash-Shama’il d’at-Tirmidhi par al-Albani p. 47).', src=('دعاء لبس الثوب الجديد', 0)),
    dict(ch='vet_v', no=1, ar=plain(ARR(16, 2)),
         fr='Porte du neuf, vis digne de louange et meurs en martyr. (à dire à celui qui porte un vêtement neuf)',
         ref='Ibn Majah 2/1178 ; al-Baghawi 12/41 (voir Sahih Ibn Majah 2/275).', src=('الدعاء لمن لبس ثوباً جديداً', 0)),
    dict(ch='vet_v', no=2, ar=plain(ARR(16, 1)),
         fr='Puisses-tu l’user, et qu’Allah, le Très-Haut, te le remplace. (à dire à celui qui porte un vêtement neuf)',
         ref='Abu Dawud 4/41 (voir Sahih Abi Dawud 2/760).', src=('الدعاء لمن لبس ثوباً جديداً', 1)),
    dict(ch='rep_av', no=1, ar='اللَّهُمَّ بَارِكْ لَنَا فِيهِ وَأَطْعِمْنَا خَيْراً مِنْهُ', fr='Ô Allah, bénis-nous ce repas et donne-nous mieux que cela à manger. (à dire pour une nourriture qu’Allah nous a donnée)',
         ref='At-Tirmidhi 5/506 (voir Sahih at-Tirmidhi 3/158).', src=('الدعاء قبل الطعام', 1)),
    dict(ch='rep_av', no=2, ar='اللَّهُمَّ بَارِكْ لَنَا فِيهِ وَزِدْنَا مِنْهُ', fr='Ô Allah, bénis-le pour nous et accorde-nous-en davantage. (à dire quand on a bu du lait)',
         ref='At-Tirmidhi 5/506 (voir Sahih at-Tirmidhi 3/158).', src=('الدعاء قبل الطعام', 1)),
    dict(ch='rep_ap', no=1, ar=plain(ARR(70, 1)), fr='Louange à Allah qui m’a nourri de ceci et me l’a accordé sans force ni puissance de ma part.',
         ref='Les auteurs des Sunan, sauf an-Nasa’i (voir Sahih at-Tirmidhi 3/159).', src=('الدعاء عند الفراغ من الطعام', 0)),
    dict(ch='rep_ap', no=2, ar=plain(ARR(70, 2), keep=True),
         fr='Louange à Allah, une louange abondante, bonne et bénie, (pour une nourriture) dont on ne peut se passer, qu’on ne peut délaisser et dont on ne peut se dispenser, ô notre Seigneur.',
         ref='Al-Bukhari 6/214 ; at-Tirmidhi, avec ce texte, 5/507.', src=('الدعاء عند الفراغ من الطعام', 1)),
    dict(ch='hote', no=1, ar=plain(ARR(71, 1)), fr='Ô Allah, bénis-les dans ce que Tu leur as accordé, pardonne-leur et fais-leur miséricorde.',
         ref='Muslim 3/1626.', src=('دعاء الضيف لصاحب الطعام', 0)),
    dict(ch='marche', no=1, ar=plain(ARR(98, 1)),
         fr='Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté et la louange ; Il donne la vie et la mort, et Il est Vivant et ne meurt pas. Le bien est dans Sa main, et Il est Omnipotent.',
         ref='At-Tirmidhi 5/491 ; al-Hakim 1/538 ; jugé hassan par al-Albani (Sahih Ibn Majah 2/21 ; Sahih at-Tirmidhi 3/152).', src=('دعاء دخول السوق', 0)),
    dict(ch='assem', no=1, ar='رَبِّ اغْفِرْ لِي، وَتُبْ عَلَيَّ، إِنَّكَ أَنْتَ التَّوَّابُ الْغَفُورُ',
         fr='Seigneur, pardonne-moi et accepte mon repentir, car Tu es Celui qui accepte le repentir, le Pardonneur. (Ibn ‘Umar rapporte qu’on comptait pour le Messager d’Allah cent fois cette invocation dans une même assemblée, avant qu’il ne se lève.)',
         ref='At-Tirmidhi et d’autres (voir Sahih at-Tirmidhi 3/153 ; Sahih Ibn Majah 2/321) ; le texte est celui d’at-Tirmidhi.', src=('ما يقال في المجلس', 0)),
]

START = 200
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
json.dump(out, open(os.path.join(OUT_DIR, 'athkar-vie-quotidienne.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
lines = ['# Dhikr de la vie quotidienne — fiche de relecture', '',
         f'{len(out)} entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.', '',
         '## Ce qu’il faut vérifier', '',
         '1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.',
         '2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.',
         '3. **Découpages décidés par l’assistant** : le chapitre « avant le repas » est séparé en 2 entrées (nourriture / lait) ; les formules au texte arabe identique sont fusionnées en une seule entrée (« Au nom d’Allah » : ablutions + vêtement ôté + repas ; « Subhanaka Allahumma… » : après les ablutions + fin d’assemblée) car l’application écarte deux dhikr de même texte ; « après les ablutions » en 3 ; l’invocation d’entrée à la mosquée est une seule entrée (3 phrases du recueil jointes).',
         '4. **Répétitions** : toutes à 1. « Rabbi ighfir li » (assemblée) : le hadith parle d’une centaine de fois, noté dans le texte français, compteur laissé à 1.',
         '5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; entrée « entrée à la mosquée » : rattachement non précisé par la source.',
         '6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment « après le repas » n° 2 et « vêtement neuf »). **Phonétique** : générée par règles, sans tajwid.', '']
if warn:
    lines += ['## Voyelles encore manquantes dans la source (à vérifier)', ''] + [f'- {w}' for w in warn] + ['']
lines += ['## Les invocations', '']
for it, tl, ref, foot in md:
    lines += [f"### {CH[it['ch']]} n° {it['no']}", '', f"**Arabe** : {it['ar']}", '', f'**Phonétique** : {tl}', '', f"**Français** : {it['fr']}", '', f'**Référence** : {ref}', '',
              f'*Renvoi d’origine (arabe)* : {foot}', '']
open(os.path.join(OUT_DIR, 'athkar-vie-quotidienne.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(out), 'entrées')
for w in warn:
    print('ATTENTION', w)
