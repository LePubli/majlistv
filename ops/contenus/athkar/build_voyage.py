#!/usr/bin/env python3
"""
Contenus 5 — dhikr du voyage (monture, départ, villages, retour) et réactions aux nouvelles, réponse à « Barak Allahu fik », aversion pour les présages.
Construit docs/contenus/athkar-voyage.json (import Admin → Athkar) et la fiche de relecture .md.
Sources : rn0x/Adhkar-json (arabe voyellé, recueil Hisn al-Muslim) et rn0x/hisn_almuslim_json (renvois / takhrij du recueil, 1 renvoi par texte).
Mêmes limites que build_matin_soir.py : traduction française de l'assistant (à valider), phonétique générée par règles.

Usage : python3 build_voyage.py <dossier rn0x/Adhkar-json> <dossier rn0x/hisn_almuslim_json> <dossier de sortie>
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
    'bar': 'Réponse à celui qui dit « Qu’Allah te bénisse »', 'tay': 'Invocation contre le mauvais présage', 'mon': 'Invocation en montant sur sa monture',
    'voy': 'Invocation de voyage', 'vil': 'Invocation en entrant dans un village ou une ville', 'v2r': 'Invocation du voyageur pour celui qui reste', 'r2v': 'Invocation de celui qui reste pour le voyageur', 'tak': 'Takbir et tasbih pendant le trajet',
    'aub': 'Invocation du voyageur à l’aube', 'hal': 'Invocation en faisant halte', 'ret': 'Ce que l’on dit au retour de voyage',
    'bon': 'Quand une chose agréable arrive', 'mau': 'Quand une chose désagréable arrive',
}
HISN = json.load(open(os.path.join(HISN_DIR, 'hisn_almuslim.json'), encoding='utf-8'))
FOOT = lambda title, i: re.sub(r'\s+', ' ', HISN[title]['footnote'][i]).strip()

ITEMS = [
    dict(ch='bar', no=1, ar=plain(ARR(93, 1)), fr='Et qu’Allah te bénisse aussi.',
         ref='Ibn as-Sunni p. 138 n° 278 ; voir Ibn al-Qayyim, al-Wabil as-sayyib p. 304 (éd. Bachir Muhammad ‘Uyun).', src=('الدعاء لمن قال بارك الله فيك', 0)),
    dict(ch='tay', no=1, ar=plain(ARR(94, 1)), fr='Ô Allah, il n’y a de présage que le Tien, de bien que le Tien, et de divinité en dehors de Toi.',
         ref='Ahmad 2/220 ; Ibn as-Sunni n° 292 ; jugé sahih par al-Albani (as-Sahiha 3/54 n° 1065). Le Prophète aimait le bon augure (al-fa’l) : Abu Dawud, Ahmad (as-Sahiha 2/363).', src=('دعاء كراهية الطيرة', 0)),
    dict(ch='mon', no=1, ar=plain(ARR(95, 1)).replace('وَالْحَمْدُ للَّهِ', 'وَالْحَمْدُ لِلَّهِ').replace('﴾، الْحَمْدُ', '﴾ الْحَمْدُ'),
         fr='Au nom d’Allah. Louange à Allah. « Gloire à Celui qui nous a soumis tout cela, alors que nous n’étions pas capables de le dominer ; et c’est vers notre Seigneur que nous retournerons. » Louange à Allah (trois fois), Allah est le plus grand (trois fois). Gloire à Toi, ô Allah ! Je me suis fait du tort à moi-même : pardonne-moi, car nul ne pardonne les péchés en dehors de Toi.',
         ref='Abu Dawud 3/34 ; at-Tirmidhi 5/501 (voir Sahih at-Tirmidhi 3/156).', src=('دعاء ركوب الدابة', 0)),
    dict(ch='voy', no=1, ar=plain(ARR(96, 1).split('وإذا')[0]),
         fr='Allah est le plus grand (trois fois). « Gloire à Celui qui nous a soumis tout cela, alors que nous n’étions pas capables de le dominer ; et c’est vers notre Seigneur que nous retournerons. » Ô Allah, nous Te demandons, dans ce voyage, la piété, la crainte et les œuvres qui Te plaisent. Ô Allah, facilite-nous ce voyage et raccourcis-nous sa distance. Ô Allah, Tu es le Compagnon du voyage et le Remplaçant auprès des proches. Ô Allah, je cherche refuge auprès de Toi contre la fatigue du voyage, la tristesse du spectacle et le mauvais retour pour les biens et la famille. (Au retour, on dit les mêmes paroles en ajoutant : « Nous revenons, repentants, adorateurs, louant notre Seigneur. »)',
         ref='Muslim 2/978.', src=('دعاء السفر', 0)),
    dict(ch='vil', no=1, ar=plain(ARR(97, 1)),
         fr='Ô Allah, Seigneur des sept cieux et de ce qu’ils couvrent, des sept terres et de ce qu’elles portent, des démons et de ceux qu’ils égarent, des vents et de ce qu’ils emportent : je Te demande le bien de ce village, le bien de ses habitants et le bien de ce qu’il renferme ; et je cherche refuge auprès de Toi contre son mal, le mal de ses habitants et le mal de ce qu’il renferme.',
         ref='Al-Hakim 2/100 (jugé authentique, avec l’accord d’adh-Dhahabi) ; Ibn as-Sunni n° 524 (jugé hassan par al-Hafiz Ibn Hajar, Takhrij al-adhkar 5/154). Ibn Baz : an-Nasa’i l’a rapporté avec une chaîne hassan (Tuhfat al-akhyar p. 37).', src=('دعاء دخول القرية أو البلدة', 0)),
    dict(ch='v2r', no=1, ar=plain(ARR(100, 1)), fr='Je vous confie à Allah, Celui dont les dépôts ne sont jamais perdus.',
         ref='Ahmad 2/403 ; Ibn Majah 2/943 (voir Sahih Ibn Majah 2/133).', src=('دعاء المسافر للمقيم', 0)),
    dict(ch='r2v', no=1, ar=plain(ARR(101, 1)), fr='Je confie à Allah ta religion, ton dépôt et la fin de tes œuvres.',
         ref='Ahmad 2/7 ; at-Tirmidhi 5/499 (voir Sahih at-Tirmidhi 3/155).', src=('دعاء المقيم للمسافر', 0)),
    dict(ch='r2v', no=2, ar=plain(ARR(101, 2)), fr='Qu’Allah te donne la piété pour provision, qu’Il pardonne ton péché et te facilite le bien où que tu sois.',
         ref='At-Tirmidhi (voir Sahih at-Tirmidhi 3/155).', src=('دعاء المقيم للمسافر', 1)),
    dict(ch='tak', no=1, ar=plain(ARR(102, 1)), fr='Jabir (qu’Allah l’agrée) a dit : « Quand nous montions, nous disions “Allah est le plus grand” ; quand nous descendions, nous disions “Gloire à Allah”. »',
         ref='Al-Bukhari, Fath al-Bari 6/135.', src=('التكبير والتسبيح في سير السفر', 0)),
    dict(ch='aub', no=1, ar=plain(ARR(103, 1)), fr='Qu’un témoin entende que nous louons Allah et que nous Le remercions de Ses bienfaits envers nous. Notre Seigneur, accompagne-nous et comble-nous de Tes bienfaits, nous cherchons refuge auprès d’Allah contre le Feu.',
         ref='Muslim 4/2086. An-Nawawi (Charh Muslim 17/39) : « qu’un témoin entende » signifie qu’un témoin atteste de notre louange envers Allah et de Ses bienfaits, ou que celui qui entend transmette ces paroles à d’autres ; « accompagne-nous » : garde-nous, protège-nous.', src=('دعاء المسافر إذا أسحر', 0)),
    dict(ch='hal', no=1, ar=plain(ARR(104, 1)), fr='Je cherche refuge auprès des paroles parfaites d’Allah contre le mal de ce qu’Il a créé. (en faisant halte pendant un voyage ou ailleurs)',
         ref='Muslim 4/2080.', src=('الدعاء إذا نزل منزلا في سفر أو غيره', 0)),
    dict(ch='ret', no=1, ar=plain(ARR(105, 1)),
         fr='(Dire trois fois « Allah est le plus grand » sur chaque hauteur, puis :) Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé ; à Lui la royauté, à Lui la louange, et Il est capable de toute chose. Nous revenons, repentants, adorateurs, louant notre Seigneur. Allah a tenu Sa promesse, secouru Son serviteur et mis en déroute les coalisés à Lui seul.',
         ref='Le Prophète le disait à son retour d’une expédition, du Hajj ou de la ‘Umra : al-Bukhari 7/163 ; Muslim 2/980.', src=('ذكر الرجوع من السفر', 0)),
    dict(ch='bon', no=1, ar='الْحَمْدُ لِلَّهِ الَّذِي بِنِعْمَتِهِ تَتِمُّ الصَّالِحَاتُ', fr='Louange à Allah, par la grâce de Qui s’accomplissent les bonnes choses. (quand arrive une chose agréable)',
         ref='Ibn as-Sunni (‘Amal al-yawm wa-l-layla) ; al-Hakim 1/499 (jugé authentique) ; jugé sahih par al-Albani (Sahih al-Jami‘ 4/201).', src=('ما يقول ويفعل من أتاه أمر يسره أو يكرهه', 0)),
    dict(ch='mau', no=1, ar='الْحَمْدُ لِلَّهِ عَلَى كُلِّ حَالٍ', fr='Louange à Allah en toute circonstance. (quand arrive une chose désagréable)',
         ref='Même renvoi que l’entrée précédente (Ibn as-Sunni ; al-Hakim 1/499 ; Sahih al-Jami‘ 4/201) : le Prophète disait l’un ou l’autre selon ce qui lui arrivait.', src=('ما يقول ويفعل من أتاه أمر يسره أو يكرهه', 0)),
]
START = 300
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
json.dump(out, open(os.path.join(OUT_DIR, 'athkar-voyage.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
lines = ['# Dhikr du voyage et des nouvelles — fiche de relecture', '',
         f'{len(out)} entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.', '',
         '## Ce qu’il faut vérifier', '',
         '1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.',
         '2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.',
         '3. **Découpages décidés par l’assistant** : l’invocation de voyage est coupée avant « Au retour… » (l’ajout du retour est repris dans l’entrée « retour de voyage » et rappelé en français) ; le chapitre « bonne ou mauvaise nouvelle » est séparé en 2 entrées ; l’entrée « Takbir et tasbih pendant le trajet » est un récit de Jabir (pas une formule), à garder ou retirer selon votre avis ; le chapitre « marché » est déjà dans le lot précédent ; « Quand la monture trébuche : Au nom d’Allah » (Abu Dawud 4/296, jugé sahih par al-Albani) n’est pas répété : même texte arabe que « Au nom d’Allah » du lot précédent (l’application écarte les doublons) — pensez à l’ajouter à sa référence si vous le souhaitez.',
         '4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).',
         '5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; les deux entrées « nouvelle agréable / désagréable » partagent un seul renvoi dans la source.',
         '6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment l’invocation de voyage n° 1, très longue, et les formules de départ). **Phonétique** : générée par règles, sans tajwid.', '']
if warn:
    lines += ['## Voyelles encore manquantes dans la source (à vérifier)', ''] + [f'- {w}' for w in warn] + ['']
lines += ['## Les invocations', '']
for it, tl, ref, foot in md:
    lines += [f"### {CH[it['ch']]} n° {it['no']}", '', f"**Arabe** : {it['ar']}", '', f'**Phonétique** : {tl}', '', f"**Français** : {it['fr']}", '', f'**Référence** : {ref}', '',
              f'*Renvoi d’origine (arabe)* : {foot}', '']
open(os.path.join(OUT_DIR, 'athkar-voyage.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(out), 'entrées')
for w in warn:
    print('ATTENTION', w)
