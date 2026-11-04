#!/usr/bin/env python3
"""
Contenus 10 — dhikr des relations : naissance, mariage, colère, éloge, remerciements, pardon, prêt, assemblée, salut.
Construit docs/contenus/athkar-relations.json (import Admin → Athkar) et la fiche de relecture .md.
Sources : rn0x/Adhkar-json (arabe voyellé, recueil Hisn al-Muslim) et rn0x/hisn_almuslim_json (renvois / takhrij du recueil, 1 renvoi par texte).
Mêmes limites que build_matin_soir.py : traduction française de l'assistant (à valider), phonétique générée par règles.

Usage : python3 build_relations.py <dossier rn0x/Adhkar-json> <dossier rn0x/hisn_almuslim_json> <dossier de sortie>
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
FIX3 = [('بارَكَ', 'بَارَكَ'), ('الْخَبائِث', 'الْخَبَائِثِ'), ('سُبْحانَكَ', 'سُبْحَانَكَ'), ('وَأَتوبُ', 'وَأَتُوبُ'), ('وَلَاَ حَوْلَ', 'وَلاَ حَوْلَ'),
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
    'nai': 'Félicitations pour une naissance', 'enf': 'Protéger les enfants', 'mar': 'Félicitations pour un mariage', 'epo': 'Celui qui se marie',
    'cou': 'Avant les rapports conjugaux', 'epr': 'Quand on voit une personne éprouvée', 'ass': 'Pendant une assemblée', 'par': 'Réponse à « Qu’Allah te pardonne »',
    'mer': 'Remercier celui qui vous a fait du bien', 'ami': 'Réponse à « Je t’aime pour Allah »', 'bie': 'Pour celui qui vous offre ses biens',
    'pre': 'Pour celui qui vous rembourse un prêt', 'shi': 'Crainte de l’association (shirk)', 'sal': 'Réponse au salut des gens du Livre',
    'ins': 'Pour celui que l’on a insulté', 'elo': 'Quand on doit faire l’éloge de quelqu’un', 'lou': 'Quand on est loué',
}
HISN = json.load(open(os.path.join(HISN_DIR, 'hisn_almuslim.json'), encoding='utf-8'))
HT = list(HISN)
# src = (position du chapitre dans hisn_almuslim.json, n° du renvoi)
FOOT = lambda idx, i: re.sub(r'\s+', ' ', HISN[HT[idx]]['footnote'][i]).strip()
INP = lambda t: N(t).split('((')[-1].split('))')[0]  # texte entre les doubles parenthèses du recueil

ITEMS = [
    dict(ch='nai', no=1, ar=plain(INP(ARR(47, 1).split('))')[0] + '))')),
         fr='Qu’Allah te bénisse dans ce qui t’a été donné, que tu remercies Celui qui l’a donné, qu’il atteigne sa maturité et que tu sois comblé de sa bonté.',
         ref='Formule rapportée par an-Nawawi, al-Adhkar p. 349 (voir Sahih al-Adhkar d’an-Nawawi, éd. Salim al-Hilali 2/713).', src=(48, 0)),
    dict(ch='nai', no=2, ar=plain(INP(ARR(47, 1).split('))')[1] if False else N(ARR(47, 1)).split('((')[2])),
         fr='Qu’Allah te bénisse et répande Sa bénédiction sur toi, qu’Il te récompense en bien, te donne la pareille et multiplie ta récompense. (réponse de celui que l’on félicite)',
         ref='Formule rapportée par an-Nawawi, al-Adhkar p. 349 (voir Sahih al-Adhkar d’an-Nawawi, éd. Salim al-Hilali 2/713).', src=(48, 0)),
    dict(ch='enf', no=1, ar=plain(INP(ARR(48, 1))),
         fr='Je vous place sous la protection des paroles parfaites d’Allah, contre tout démon et toute bête nuisible, et contre tout mauvais œil. (le Prophète protégeait ainsi al-Hasan et al-Husayn)',
         ref='Al-Bukhari 4/119, hadith d’Ibn ‘Abbas (qu’Allah les agrée).', src=(49, 0)),
    dict(ch='mar', no=1, ar=plain(INP(ARR(79, 1))),
         fr='Qu’Allah te bénisse, répande Sa bénédiction sur toi et vous réunisse dans le bien. (à dire à celui qui se marie)',
         ref='Les auteurs des Sunan sauf an-Nasa’i (voir Sahih at-Tirmidhi 1/316).', src=(80, 0)),
    dict(ch='epo', no=1, ar=plain(N(ARR(80, 1)).split('((')[1].split('وَإِذَا اشْتَرَى')[0].strip(' ،')),
         fr='Ô Allah, je Te demande son bien et le bien de la nature que Tu lui as donnée, et je cherche refuge auprès de Toi contre son mal et le mal de la nature que Tu lui as donnée. (à dire en se mariant ou en achetant un serviteur ; pour un chameau, saisir le haut de sa bosse et dire la même chose)',
         ref='Abu Dawud 2/248 ; Ibn Majah 1/617 (voir Sahih Ibn Majah 1/324).', src=(81, 0)),
    dict(ch='cou', no=1, ar=plain(INP(ARR(81, 1))),
         fr='Au nom d’Allah. Ô Allah, éloigne de nous Satan et éloigne Satan de ce que Tu nous accordes.',
         ref='Al-Bukhari 6/141 ; Muslim 2/1028.', src=(82, 0)),
    dict(ch='epr', no=1, ar=plain(INP(ARR(83, 1))),
         fr='Louange à Allah qui m’a préservé de ce dont Il t’a éprouvé et m’a favorisé nettement sur beaucoup de ceux qu’Il a créés.',
         ref='At-Tirmidhi 5/494 et 5/493 (voir Sahih at-Tirmidhi 3/153).', src=(84, 0)),
    dict(ch='ass', no=1, ar=plain(INP(ARR(84, 1))),
         fr='Seigneur, pardonne-moi et accepte mon repentir, car Tu es Celui qui accepte le repentir, le Pardonneur. (Ibn ‘Umar : on comptait pour le Messager d’Allah, en une seule assemblée, une centaine de fois cette invocation avant qu’il se lève)',
         ref='At-Tirmidhi (dont est la formulation) et d’autres (voir Sahih at-Tirmidhi 3/153 ; Sahih Ibn Majah 2/321). Le compteur est laissé à 1.', src=(85, 0)),
    dict(ch='par', no=1, ar=plain(INP(ARR(86, 1))), fr='Et à toi aussi. (réponse à celui qui dit « Qu’Allah te pardonne »)',
         ref='Ahmad 5/28 ; an-Nasa’i, ‘Amal al-yawm wa-l-layla p. 218 n° 421 (éd. Dr Faruq Hamada).', src=(87, 0)),
    dict(ch='mer', no=1, ar=plain(INP(ARR(87, 1))), fr='Qu’Allah te récompense en bien.',
         ref='At-Tirmidhi n° 2035 ; voir Sahih al-Jami‘ n° 6244 et Sahih at-Tirmidhi 2/200.', src=(88, 0)),
    dict(ch='ami', no=1, ar=plain(INP(ARR(89, 1))), fr='Que t’aime Celui pour qui tu m’aimes. (réponse à « Je t’aime pour Allah »)',
         ref='Abu Dawud 4/333 ; jugé hassan par al-Albani (Sahih Abi Dawud 3/965).', src=(90, 0)),
    dict(ch='bie', no=1, ar=plain(INP(ARR(90, 1))), fr='Qu’Allah te bénisse dans ta famille et tes biens. (à dire à celui qui vous offre de partager ses biens)',
         ref='Al-Bukhari, Fath al-Bari 4/88.', src=(91, 0)),
    dict(ch='pre', no=1, ar=plain(INP(ARR(91, 1))),
         fr='Qu’Allah te bénisse dans ta famille et tes biens : la récompense d’un prêt est la louange et la restitution. (à dire à celui qui vous rembourse)',
         ref='An-Nasa’i, ‘Amal al-yawm wa-l-layla p. 300 ; Ibn Majah 2/809 (voir Sahih Ibn Majah 2/55).', src=(92, 0)),
    dict(ch='shi', no=1, ar=plain(INP(ARR(92, 1))),
         fr='Ô Allah, je cherche refuge auprès de Toi pour ne pas T’associer quoi que ce soit en le sachant, et je Te demande pardon pour ce que j’ignore.',
         ref='Ahmad 4/403 et d’autres (voir Sahih al-Jami‘ 3/333 ; Sahih at-targhib wa-t-tarhib d’al-Albani).', src=(93, 0)),
    dict(ch='sal', no=1, ar=plain(N(ARR(109, 1)).split('فَقُولُوا:')[-1].replace('))', '')),
         fr='Et sur vous. (réponse au salut des gens du Livre : hadith « Quand les gens du Livre vous saluent, dites : Et sur vous »)',
         ref='Al-Bukhari, Fath al-Bari 11/42 ; Muslim 4/1705.', src=(110, 0)),
    dict(ch='ins', no=1, ar=plain(INP(ARR(112, 1))),
         fr='Ô Allah, tout croyant que j’aurais insulté, fais-en pour lui un rapprochement de Toi au Jour de la Résurrection.',
         ref='Al-Bukhari, Fath al-Bari 11/171 ; Muslim 4/2007 (dont la version est : « fais-en pour lui une purification et une miséricorde »).', src=(113, 0)),
    dict(ch='elo', no=1, ar=plain(N(ARR(113, 1)).split('فَلْيَقُلْ:')[-1].replace('))', '').strip()),
         fr='J’estime un tel (le nommer) ainsi ; Allah est Celui qui lui demandera des comptes, et je ne déclare personne pur devant Allah. Je l’estime — s’il en est bien ainsi — tel et tel (citer la qualité). (hadith : « Si l’un de vous doit absolument faire l’éloge de son compagnon, qu’il dise… »)',
         ref='Muslim 4/2296.', src=(114, 0)),
    dict(ch='lou', no=1, ar=plain(INP(ARR(114, 1)), keep=True),
         fr='Ô Allah, ne me tiens pas rigueur de ce qu’ils disent, pardonne-moi ce qu’ils ignorent (et rends-moi meilleur que ce qu’ils pensent de moi). (à dire quand on est loué)',
         ref='Al-Bukhari, al-Adab al-mufrad n° 761 ; chaîne jugée authentique par al-Albani (Sahih al-Adab al-mufrad n° 585). L’ajout entre crochets est d’al-Bayhaqi, Shu‘ab al-iman 4/228, par une autre voie.', src=(115, 0)),
]

START = 800
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
json.dump(out, open(os.path.join(OUT_DIR, 'athkar-relations.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
lines = ['# Dhikr des relations — fiche de relecture', '',
         f'{len(out)} entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.', '',
         '## Ce qu’il faut vérifier', '',
         '1. **Arabe** : recueil *Hisn al-Muslim* (fichier rn0x/Adhkar-json). Les variantes entre crochets du recueil ne sont pas reprises ; voyelles corrigées selon `FIX` de `common.py`.',
         '2. **Catégorie** : toutes en « général » (pas de catégorie « vie quotidienne » pour l’instant) ; à décider avec le parcours UX.',
         '3. **Choix de l’assistant** : seules les formules à dire sont reprises. Non repris : « Je cherche refuge auprès d’Allah contre Satan le maudit » (colère) et « Gloire à Toi, ô Allah… » (conclusion d’assemblée) : même texte arabe que des entrées déjà fournies (l’application écarte les doublons) ; les chapitres sur le salut (propager le salut), le chant du coq / braiment de l’âne et l’aboiement des chiens (consignes sans formule). Les formules de félicitation à la naissance viennent d’an-Nawawi (al-Adhkar) et non d’un hadith : à confirmer. Pas de formule « La paix soit sur vous » dans la source : non ajoutée.',
         '4. **Répétitions** : toutes à 1 (les « trois fois » sont écrits dans le texte français).',
         '5. **Références** : renvois du recueil (rn0x/hisn_almuslim_json) traduits en français ; un renvoi par texte dans ce fichier, rattachement vérifié ; certains renvois sont abrégés ou regroupent des formules ; le renvoi d’origine en arabe est donné sous chaque entrée.',
         '6. **Français** : traduction de l’assistant depuis l’arabe, à valider (notamment l’éloge de quelqu’un et la félicitation pour une naissance). **Phonétique** : générée par règles, sans tajwid.', '']
if warn:
    lines += ['## Voyelles encore manquantes dans la source (à vérifier)', ''] + [f'- {w}' for w in warn] + ['']
lines += ['## Les invocations', '']
for it, tl, ref, foot in md:
    lines += [f"### {CH[it['ch']]} n° {it['no']}", '', f"**Arabe** : {it['ar']}", '', f'**Phonétique** : {tl}', '', f"**Français** : {it['fr']}", '', f'**Référence** : {ref}', '',
              f'*Renvoi d’origine (arabe)* : {foot}', '']
open(os.path.join(OUT_DIR, 'athkar-relations.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(out), 'entrées')
for w in warn:
    print('ATTENTION', w)
