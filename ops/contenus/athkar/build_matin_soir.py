#!/usr/bin/env python3
"""
Construit docs/contenus/athkar-matin-soir.json (import Admin → Athkar) et docs/contenus/athkar-matin-soir.md (fiche de relecture).

Sources de l'ARABE et des RÉFÉRENCES : recueil « Hisn al-Muslim » (Sa'id al-Qahtani) :
  - texte voyellé : https://github.com/rn0x/Adhkar-json (adhkar.json, catégorie 1)
  - renvois (takhrij) : https://github.com/rn0x/hisn_almuslim_json (hisn_almuslim.json, « أذكار الصباح والمساء »)
  - versets : Tanzil (texte ottoman) + traduction Hamidullah (QuranEnc), déjà importés dans Mejliss TV.
Les TRADUCTIONS FRANÇAISES des invocations non coraniques sont de Claude (depuis l'arabe) : « à valider » obligatoire.
La PHONÉTIQUE est produite par règles (translit.py) : « à valider ».

Usage : python3 build_matin_soir.py <dossier rn0x/Adhkar-json> <dossier risan/quran-json> <dossier de sortie docs/contenus>
"""
import json
import os
import re
import sys
import unicodedata

N = lambda x: unicodedata.normalize('NFC', x)  # ordre canonique des signes (shadda / kasra)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from translit import transliterate, missing_vowels  # noqa: E402

ADHKAR_DIR, QURAN_DIR, OUT_DIR = sys.argv[1], sys.argv[2], sys.argv[3]
BOOK = 'Hisn al-Muslim (Sa‘id al-Qahtani), « Adhkar du matin et du soir »'

adhkar = {x['id']: x for x in json.load(open(os.path.join(ADHKAR_DIR, 'adhkar.json')))[0]['array']}
tanzil = json.load(open(os.path.join(QURAN_DIR, 'data/tanzil/uthmani.json')))
hamid = json.load(open(os.path.join(QURAN_DIR, 'data/quranenc/french_hameedullah.json')))


BASMALA = tanzil['1'][0]['text']


def verses(sura, a, b):
    # Tanzil place la basmala devant le verset 1 de chaque sourate (sauf 1 et 9) : on la retire, elle est ajoutée à part.
    ar = ' '.join(v['text'][len(BASMALA):].strip() if (sura != 1 and v['verse'] == 1 and v['text'].startswith(BASMALA)) else v['text']
                  for v in tanzil[str(sura)] if a <= v['verse'] <= b)
    global LAST_PAUSAL
    LAST_PAUSAL = ' * '.join(v['text'][len(BASMALA):].strip() if (sura != 1 and v['verse'] == 1 and v['text'].startswith(BASMALA)) else v['text']
                             for v in tanzil[str(sura)] if a <= v['verse'] <= b)
    fr = ' '.join(re.sub(r'\[\d+\]', '', v['text']).strip() for v in hamid[str(sura)] if a <= v['verse'] <= b)
    return ar, fr


def core(i):
    """Texte arabe de l'invocation i, sans parenthèses, renvois entre crochets ni mention du nombre de répétitions."""
    t = N(adhkar[i]['text']).replace('\n', ' ')
    t = re.sub(r'\[[^\]]*\]', '', t)
    t = re.sub(r'\)\)\s*\(.*$', '', t)      # « ... )) (ثلاثَ مرَّاتٍ) »
    t = t.replace('((', '').replace('))', '').strip().rstrip('.').strip()
    return re.sub(r'\s+', ' ', t)


# Corrections de voyellation de la source (relevées par missing_vowels) — à confirmer par le relecteur.
FIX = [('نَبَيِّنَا', 'نَبِيِّنَا'), ('الشَّيْطانِ', 'الشَّيْطَانِ'), ('نورَهُ', 'نُورَهُ'),
       ('صلى الله عليه وسلم', 'صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ'), ('عَلَيهِ', 'عَلَيْهِ'), ('بَينِ', 'بَيْنِ'),
       ('الْمُشرِكِينَ', 'الْمُشْرِكِينَ'), ('اللَّهُـمَّ', 'اللَّهُمَّ'), ('أَصْبَحْنا', 'أَصْبَحْنَا'), ('لاَ إِلَهَ إلاَّ', 'لاَ إِلَهَ إِلاَّ'),
       ('السّمَاءِ', 'السَّمَاءِ'), ('أَسْتَغيثُ', 'أَسْتَغِيثُ'), ('الغَيْبِ', 'الْغَيْبِ'), ('القَبْرِ', 'الْقَبْرِ'), ('وَالفَقْرِ', 'وَالْفَقْرِ'),
       ('الكُفْرِ', 'الْكُفْرِ'), ('مِنَ الْكَسَلِ', 'مِنَ الْكَسَلِ'), ('خَيرَ', 'خَيْرَ'), ('الذُّنوبَ', 'الذُّنُوبَ'), ('تَوَكَّلتُ', 'تَوَكَّلْتُ'), (' ،', '،'), ('  ', ' ')]


def fix(t):
    for a, b in FIX:
        t = t.replace(N(a), N(b))
    return t.strip()


def ev(t, pairs):
    for a, b in pairs:
        a, b = N(a), N(b)
        if a not in t:
            raise SystemExit(f'Substitution introuvable : {a!r} dans {t[:60]!r}')
        t = t.replace(a, b)
    return t


MORN = {i: fix(core(i)) for i in range(3, 25)}
EVE_SUBST = {
    3: [('أَصْبَحْنَا وَأَصْبَحَ', 'أَمْسَيْنَا وَأَمْسَى'), ('فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ', 'فِي هَذِهِ اللَّيْلَةِ وَخَيْرَ مَا بَعْدَهَا'),
        ('فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ', 'فِي هَذِهِ اللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا')],
    4: [('بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا', 'بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا'), ('وَإِلَيْكَ النُّشُورُ', 'وَإِلَيْكَ الْمَصِيرُ')],
    6: [('أَصْبَحْتُ', 'أَمْسَيْتُ')],
    7: [('مَا أَصْبَحَ بِي', 'مَا أَمْسَى بِي')],
    15: [('أَصْبَحْنَا وَأَصْبَحَ', 'أَمْسَيْنَا وَأَمْسَى'), ('هَذَا الْيَوْمِ:فَتْحَهُ، وَنَصْرَهُ، وَنُورَهُ، وَبَرَكَتَهُ، وَهُدَاهُ', 'هَذِهِ اللَّيْلَةِ: فَتْحَهَا، وَنَصْرَهَا، وَنُورَهَا، وَبَرَكَتَهَا، وَهُدَاهَا'),
         ('مَا فِيهِ وَشَرِّ مَا بَعْدَهُ', 'مَا فِيهَا وَشَرِّ مَا بَعْدَهَا')],
    16: [('أَصْبَحْنَا', 'أَمْسَيْنَا')],
}
EVE = {i: ev(MORN[i], EVE_SUBST[i]) for i in EVE_SUBST}

# --- Invocations 1 et 2 (Coran)
kursi_ar, kursi_fr = verses(2, 255, 255); kursi_p = LAST_PAUSAL
s112, s112f = verses(112, 1, 4); p112 = LAST_PAUSAL
s113, s113f = verses(113, 1, 5); p113 = LAST_PAUSAL
s114, s114f = verses(114, 1, 6); p114 = LAST_PAUSAL
bas_ar, bas_fr = verses(1, 1, 1)
# Texte donné à la phonétique : une pause (« * ») à chaque fin de verset.
TL = {1: 'أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ * ' + kursi_p,
      2: f'{bas_ar} * {p112} * {bas_ar} * {p113} * {bas_ar} * {p114}'}

# Légende des champs : i = n° dans le recueil, cat = 'both' | 'morning' | 'evening' | 'general', n = répétitions,
# fr / fr_e = traduction (matin / soir), ref = références (en français, d'après les renvois du recueil).
ITEMS = [
    dict(i=1, cat='both', n=1, ar=f'أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ ﴿{kursi_ar}﴾',
         fr=f'Je cherche refuge auprès d’Allah contre Satan le maudit. « {kursi_fr} »',
         ref='Coran 2:255 (Âyat al-Kursî). Renvoi du recueil : al-Hakim 1/562, jugé sahih par al-Albani (Sahih at-Targhib wa-t-Tarhib 1/273) ; attribué aussi à an-Nasa’i et at-Tabarani (chaîne de at-Tabarani : « bonne »).'),
    dict(i=2, cat='both', n=3, ar=f'{bas_ar} ﴿{s112}﴾ {bas_ar} ﴿{s113}﴾ {bas_ar} ﴿{s114}﴾',
         fr=f'{bas_fr} « {s112f} » {bas_fr} « {s113f} » {bas_fr} « {s114f} » (trois fois)',
         ref='Coran 112, 113 et 114. Renvoi du recueil : Abu Dawud 4/322 ; at-Tirmidhi 5/567 (voir Sahih at-Tirmidhi 3/182). Le hadith précise : à dire trois fois le matin et le soir.'),
    dict(i=3, cat='both', n=1, ar=MORN[3], ar_e=EVE[3],
         fr='Nous voici au matin et la royauté appartient à Allah. Louange à Allah. Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est Omnipotent. Seigneur, je Te demande le bien de ce jour et le bien de ce qui le suit, et je cherche refuge auprès de Toi contre le mal de ce jour et le mal de ce qui le suit. Seigneur, je cherche refuge auprès de Toi contre la paresse et la mauvaise vieillesse. Seigneur, je cherche refuge auprès de Toi contre un châtiment dans le Feu et un châtiment dans la tombe.',
         fr_e='Nous voici au soir et la royauté appartient à Allah. Louange à Allah. Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est Omnipotent. Seigneur, je Te demande le bien de cette nuit et le bien de ce qui la suit, et je cherche refuge auprès de Toi contre le mal de cette nuit et le mal de ce qui la suit. Seigneur, je cherche refuge auprès de Toi contre la paresse et la mauvaise vieillesse. Seigneur, je cherche refuge auprès de Toi contre un châtiment dans le Feu et un châtiment dans la tombe.',
         ref='Muslim 4/2088.'),
    dict(i=4, cat='both', n=1, ar=MORN[4], ar_e=EVE[4],
         fr='Ô Allah, c’est par Toi que nous atteignons le matin, par Toi que nous atteignons le soir, par Toi que nous vivons, par Toi que nous mourons, et c’est vers Toi que sera la résurrection.',
         fr_e='Ô Allah, c’est par Toi que nous atteignons le soir, par Toi que nous atteignons le matin, par Toi que nous vivons, par Toi que nous mourons, et c’est vers Toi que sera le retour.',
         ref='At-Tirmidhi 5/466 (voir Sahih at-Tirmidhi 3/142).'),
    dict(i=5, cat='both', n=1, ar=MORN[5],
         fr='Ô Allah, Tu es mon Seigneur ; il n’y a de divinité digne d’adoration que Toi. Tu m’as créé et je suis Ton serviteur, et je me tiens à Ton engagement et à Ta promesse autant que je le peux. Je cherche refuge auprès de Toi contre le mal de ce que j’ai commis. Je reconnais Tes bienfaits envers moi et je reconnais mon péché ; pardonne-moi donc, car nul ne pardonne les péchés si ce n’est Toi.',
         ref='Sayyid al-istighfar. Al-Bukhari 7/150.'),
    dict(i=6, cat='both', n=4, ar=MORN[6], ar_e=EVE[6],
         fr='Ô Allah, ce matin, je Te prends à témoin, ainsi que les porteurs de Ton Trône, Tes anges et toute Ta création : Tu es Allah, il n’y a de divinité digne d’adoration que Toi, Seul, sans associé, et Muhammad est Ton serviteur et Ton messager. (quatre fois)',
         fr_e='Ô Allah, ce soir, je Te prends à témoin, ainsi que les porteurs de Ton Trône, Tes anges et toute Ta création : Tu es Allah, il n’y a de divinité digne d’adoration que Toi, Seul, sans associé, et Muhammad est Ton serviteur et Ton messager. (quatre fois)',
         ref='Abu Dawud 4/317 ; al-Bukhari, al-Adab al-mufrad n° 1201 ; an-Nasa’i, ‘Amal al-yawm wa-l-layla n° 9 ; Ibn as-Sunni n° 70. Ibn Baz a jugé hassan la chaîne d’an-Nasa’i et d’Abu Dawud (Tuhfat al-akhyar p. 23).'),
    dict(i=7, cat='both', n=1, ar=MORN[7], ar_e=EVE[7],
         fr='Ô Allah, le bienfait dont je jouis ce matin, ou dont jouit l’une de Tes créatures, vient de Toi seul, sans associé ; à Toi la louange et à Toi la reconnaissance.',
         fr_e='Ô Allah, le bienfait dont je jouis ce soir, ou dont jouit l’une de Tes créatures, vient de Toi seul, sans associé ; à Toi la louange et à Toi la reconnaissance.',
         ref='Abu Dawud 4/318 ; an-Nasa’i, ‘Amal al-yawm wa-l-layla n° 7 ; Ibn as-Sunni n° 41 ; Ibn Hibban (Mawarid) n° 2361. Ibn Baz a jugé hassan sa chaîne (Tuhfat al-akhyar p. 24).'),
    dict(i=8, cat='both', n=3, ar=MORN[8],
         fr='Ô Allah, accorde-moi la santé dans mon corps ; ô Allah, accorde-moi la santé dans mon ouïe ; ô Allah, accorde-moi la santé dans ma vue ; il n’y a de divinité digne d’adoration que Toi. Ô Allah, je cherche refuge auprès de Toi contre l’incroyance et la pauvreté, et je cherche refuge auprès de Toi contre le châtiment de la tombe ; il n’y a de divinité digne d’adoration que Toi. (trois fois)',
         ref='Abu Dawud 4/324 ; Ahmad 5/42 ; an-Nasa’i, ‘Amal al-yawm wa-l-layla n° 22 ; Ibn as-Sunni n° 69 ; al-Bukhari, al-Adab al-mufrad. Ibn Baz a jugé hassan sa chaîne (Tuhfat al-akhyar p. 26).'),
    dict(i=9, cat='both', n=7, ar=MORN[9],
         fr='Allah me suffit ; il n’y a de divinité digne d’adoration que Lui ; en Lui je place ma confiance, et Il est le Seigneur du Trône immense. (sept fois)',
         ref='Ibn as-Sunni n° 71 (rapporté comme parole du Prophète) ; Abu Dawud 4/321 (rapporté comme parole d’un compagnon). Chaîne jugée sahih par Shu‘ayb et ‘Abd al-Qadir al-Arna’ut (voir Zad al-ma‘ad 2/376).'),
    dict(i=10, cat='both', n=1, ar=MORN[10],
         fr='Ô Allah, je Te demande le pardon et la préservation (al-‘afiya) en ce bas monde et dans l’au-delà. Ô Allah, je Te demande le pardon et la préservation dans ma religion, ma vie d’ici-bas, ma famille et mes biens. Ô Allah, couvre mes défauts et apaise mes craintes. Ô Allah, protège-moi par devant, par derrière, à ma droite, à ma gauche et au-dessus de moi, et je cherche refuge auprès de Ta grandeur contre le fait d’être englouti par en dessous.',
         ref='Abu Dawud ; Ibn Majah (voir Sahih Ibn Majah 2/332).'),
    dict(i=11, cat='both', n=1, ar=MORN[11],
         fr='Ô Allah, Connaisseur de l’invisible et du visible, Créateur des cieux et de la terre, Seigneur et Souverain de toute chose, j’atteste qu’il n’y a de divinité digne d’adoration que Toi. Je cherche refuge auprès de Toi contre le mal de mon âme, contre le mal de Satan et de ses pièges, et contre le fait de commettre un mal contre moi-même ou de l’attirer sur un musulman.',
         ref='At-Tirmidhi ; Abu Dawud (voir Sahih at-Tirmidhi 3/142). Note : le mot « sharak » (ses pièges) est lu aussi « shirk » (son polythéisme) selon les versions du hadith.'),
    dict(i=12, cat='both', n=3, ar=MORN[12],
         fr='Au nom d’Allah, avec le nom de Qui rien ne peut nuire, ni sur terre ni dans le ciel, et Il est l’Audient, l’Omniscient. (trois fois)',
         ref='Abu Dawud 4/323 ; at-Tirmidhi 5/465 ; Ibn Majah ; Ahmad (voir Sahih Ibn Majah 2/332). Ibn Baz a jugé hassan sa chaîne (Tuhfat al-akhyar p. 39).'),
    dict(i=13, cat='both', n=3, ar=MORN[13],
         fr='Je suis satisfait d’Allah comme Seigneur, de l’Islam comme religion et de Muhammad ﷺ comme prophète. (trois fois)',
         ref='Ahmad 4/337 ; an-Nasa’i, ‘Amal al-yawm wa-l-layla n° 4 ; Ibn as-Sunni n° 68 ; Abu Dawud 4/418 ; at-Tirmidhi 5/465. Ibn Baz l’a jugé hassan (Tuhfat al-akhyar p. 39).'),
    dict(i=14, cat='both', n=1, ar=MORN[14],
         fr='Ô Vivant, ô Celui qui subsiste par Lui-même, c’est Ta miséricorde que j’implore : améliore toute ma situation et ne me confie pas à moi-même, ne serait-ce que le temps d’un clin d’œil.',
         ref='Al-Hakim 1/545, jugé sahih et approuvé par adh-Dhahabi (voir Sahih at-Targhib wa-t-Tarhib 1/273).'),
    dict(i=15, cat='both', n=1, ar=MORN[15], ar_e=EVE[15],
         fr='Nous voici au matin et la royauté appartient à Allah, Seigneur des mondes. Ô Allah, je Te demande le bien de ce jour : sa victoire, son aide, sa lumière, sa bénédiction et sa guidance ; et je cherche refuge auprès de Toi contre le mal de ce qu’il contient et le mal de ce qui le suit.',
         fr_e='Nous voici au soir et la royauté appartient à Allah, Seigneur des mondes. Ô Allah, je Te demande le bien de cette nuit : sa victoire, son aide, sa lumière, sa bénédiction et sa guidance ; et je cherche refuge auprès de Toi contre le mal de ce qu’elle contient et le mal de ce qui la suit.',
         ref='Abu Dawud 4/322. Chaîne jugée hassan par Shu‘ayb et ‘Abd al-Qadir al-Arna’ut (Zad al-ma‘ad 2/273).'),
    dict(i=16, cat='both', n=1, ar=MORN[16], ar_e=EVE[16],
         fr='Nous voici au matin sur la nature originelle de l’Islam (fitra), sur la parole de la sincérité (kalimat al-ikhlas), sur la religion de notre Prophète Muhammad ﷺ et sur la voie de notre père Ibrahim, hanif et musulman, qui n’était pas du nombre des polythéistes.',
         fr_e='Nous voici au soir sur la nature originelle de l’Islam (fitra), sur la parole de la sincérité (kalimat al-ikhlas), sur la religion de notre Prophète Muhammad ﷺ et sur la voie de notre père Ibrahim, hanif et musulman, qui n’était pas du nombre des polythéistes.',
         ref='Ahmad 3/406-407 ; Ibn as-Sunni, ‘Amal al-yawm wa-l-layla n° 34 (voir Sahih al-Jami‘ 4/209).'),
    dict(i=17, cat='both', n=100, ar=MORN[17],
         fr='Gloire et pureté à Allah, et par Sa louange. (cent fois)',
         ref='Muslim 4/2071. Le hadith précise : cent fois le matin et le soir.'),
    dict(i=18, cat='both', n=10, ar=MORN[18],
         fr='Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est Omnipotent. (dix fois, ou une seule fois en cas de paresse)',
         ref='An-Nasa’i, ‘Amal al-yawm wa-l-layla n° 24 ; Abu Dawud 4/319 ; Ibn Majah ; Ahmad 4/60 (voir Sahih at-Targhib wa-t-Tarhib 1/270, Sahih Abi Dawud 3/957, Sahih Ibn Majah 2/331, Zad al-ma‘ad 2/377). Le rattachement des renvois à cette invocation est à confirmer.'),
    dict(i=19, cat='morning', n=100, ar=MORN[19],
         fr='Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est Omnipotent. (cent fois, le matin)',
         ref='Al-Bukhari 4/95 ; Muslim 4/2071.'),
    dict(i=20, cat='morning', n=3, ar=MORN[20],
         fr='Gloire et pureté à Allah et par Sa louange, autant que le nombre de Ses créatures, autant que ce qui Le satisfait, autant que le poids de Son Trône et autant que l’encre de Ses paroles. (trois fois, le matin)',
         ref='Muslim 4/2090.'),
    dict(i=21, cat='morning', n=1, ar=MORN[21],
         fr='Ô Allah, je Te demande une science utile, une subsistance pure et des œuvres acceptées. (le matin)',
         ref='Ibn as-Sunni n° 54 ; Ibn Majah n° 925. Chaîne jugée hassan par ‘Abd al-Qadir et Shu‘ayb al-Arna’ut (Zad al-ma‘ad 2/375).'),
    dict(i=22, cat='general', n=100, ar=MORN[22],
         fr='Je demande pardon à Allah et je me repens à Lui. (cent fois par jour)',
         ref='Al-Bukhari (avec Fath al-Bari 11/101) ; Muslim 4/2075.'),
    dict(i=23, cat='evening', n=3, ar=MORN[23],
         fr='Je cherche refuge dans les paroles parfaites d’Allah contre le mal de ce qu’Il a créé. (trois fois, le soir)',
         ref='Ahmad 2/290 ; an-Nasa’i, ‘Amal al-yawm wa-l-layla n° 590 ; Ibn as-Sunni n° 68 (voir Sahih at-Tirmidhi 3/187, Sahih Ibn Majah 2/266, Tuhfat al-akhyar p. 45).'),
    dict(i=24, cat='both', n=10, ar=MORN[24],
         fr='Ô Allah, prie sur notre prophète Muhammad et accorde-lui le salut. (dix fois)',
         ref='At-Tabarani, avec deux chaînes dont l’une est bonne (jayyid) ; voir Majma‘ az-zawa’id 10/120 et Sahih at-Targhib wa-t-Tarhib 1/273 (hadith sur le fait d’invoquer la prière sur le Prophète dix fois le matin et dix fois le soir).'),
]

out, md, pos = [], [], 0
warn = []
for it in ITEMS:
    for cat in (['morning', 'evening'] if it['cat'] == 'both' else [it['cat']]):
        ar = it.get('ar_e', it['ar']) if cat == 'evening' else it['ar']
        fr = it.get('fr_e', it['fr']) if cat == 'evening' else it['fr']
        miss = [m for w in ar.split() for m in missing_vowels(w)] if it['i'] > 2 else []
        if miss:
            warn.append(f"n° {it['i']} ({cat}) : voyelle manquante sur {' '.join(sorted(set(miss)))}")
        tl = transliterate(TL.get(it['i'], ar))
        ref = f"{BOOK}, invocation n° {it['i']}. {it['ref']}"
        assert len(ref) <= 500, (it['i'], len(ref))
        out.append({'category': cat, 'textAr': ar, 'translit': tl, 'trFr': fr, 'trEn': '', 'reference': ref, 'target': it['n'], 'position': pos})
        md.append((it['i'], cat, ar, tl, fr, ref, it['n']))
        pos += 1

os.makedirs(OUT_DIR, exist_ok=True)
json.dump(out, open(os.path.join(OUT_DIR, 'athkar-matin-soir.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

LBL = {'morning': 'Matin', 'evening': 'Soir', 'general': 'Dans la journée'}
lines = ['# Dhikr du matin et du soir — fiche de relecture', '',
         f'{len(out)} entrées (24 invocations du recueil, dédoublées matin / soir quand le texte change). **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.', '',
         '## Ce qu’il faut vérifier', '',
         '1. **Arabe** : copié du recueil *Hisn al-Muslim* (fichier libre rn0x/Adhkar-json) ; versets = texte Tanzil. Quelques voyelles manquantes de la source ont été complétées (liste dans `build_matin_soir.py`, variable `FIX`). Les textes « soir » sont obtenus en remplaçant « matin » par « soir » dans le texte « matin » : à confirmer.',
         '2. **Références** : reprises des renvois du recueil et traduites en français. Les renvois ne sont pas numérotés dans la source : leur rattachement à chaque invocation a été fait par lecture du contenu (l’invocation n° 18 est la moins sûre).',
         '3. **Français** : traduction de Claude depuis l’arabe (versets : Hamidullah). À faire valider.',
         '4. **Phonétique** : générée par règles, sans tajwid ; fin de phrase prononcée en pause. À faire relire.', '']
if warn:
    lines += ['## Voyelles encore manquantes dans la source (à vérifier)', ''] + [f'- {w}' for w in warn] + ['']
lines += ['## Les invocations', '']
for i, cat, ar, tl, fr, ref, n in md:
    lines += [f'### n° {i} — {LBL[cat]} (× {n})', '', f'**Arabe** : {ar}', '', f'**Phonétique** : {tl}', '', f'**Français** : {fr}', '', f'**Référence** : {ref}', '']
open(os.path.join(OUT_DIR, 'athkar-matin-soir.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(out), 'entrées')
for w in warn:
    print('ATTENTION', w)
