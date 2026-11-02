#!/usr/bin/env python3
"""
Contenus 2 — dhikr après la prière, du sommeil et du réveil.
Construit docs/contenus/athkar-priere-sommeil-reveil.json (import Admin → Athkar) et la fiche de relecture .md.
Mêmes sources et mêmes limites que build_matin_soir.py (voir README « Contenus 1 » et « Contenus 2 »).

Usage : python3 build_priere_sommeil_reveil.py <dossier rn0x/Adhkar-json> <dossier risan/quran-json> <dossier de sortie>
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Quran, clean, load, missing_vowels, transliterate  # noqa: E402

ADHKAR_DIR, QURAN_DIR, OUT_DIR = sys.argv[1:4]
A, TANZIL, HAMID = load(ADHKAR_DIR, QURAN_DIR)
Q = Quran(TANZIL, HAMID)
ARR = lambda c, i: {x['id']: x for x in A[c]['array']}[i]['text']
CH = {'ap': 'Dhikr après le salut de la prière', 'so': 'Dhikr du sommeil', 're': 'Dhikr au réveil'}
BAS, BAS_FR = Q.ar(1, 1, 1), Q.fr(1, 1, 1)


def nowaw(t):
    """Retire le “wa” de liaison en tête d'une formule isolée."""
    return re.sub('^و\u064e?', '', t.strip())


def noparen(t):
    return re.sub(r'\s+', ' ', re.sub(r'\([^)]*\)', '', t)).strip()


def three_surahs():
    ar = f'{BAS} ﴿{Q.ar(112, 1, 4)}﴾ {BAS} ﴿{Q.ar(113, 1, 5)}﴾ {BAS} ﴿{Q.ar(114, 1, 6)}﴾'
    tl = f'{BAS} * {Q.pausal(112, 1, 4)} * {BAS} * {Q.pausal(113, 1, 5)} * {BAS} * {Q.pausal(114, 1, 6)}'
    fr = f'{BAS_FR} « {Q.fr(112, 1, 4)} » {BAS_FR} « {Q.fr(113, 1, 5)} » {BAS_FR} « {Q.fr(114, 1, 6)} »'
    return ar, tl, fr


S3_AR, S3_TL, S3_FR = three_surahs()
KURSI_AR, KURSI_TL, KURSI_FR = f'﴿{Q.ar(2, 255, 255)}﴾', Q.pausal(2, 255, 255), Q.fr(2, 255, 255)

tahlil = noparen(clean(ARR(27, 4))).split(' لاَ إِلَهَ', 1)[1]
tahlil = 'لاَ إِلَهَ' + tahlil
ap1 = clean(ARR(27, 1)).split('(', 1)
ap4 = noparen(clean(ARR(27, 4))).split(' لاَ إِلَهَ', 1)[0].split('،')
so8 = [p.strip() for p in re.split(r'\([^)]*\)', clean(ARR(2, 8))) if p.strip()]
wk = lambda i: clean(ARR(3, i)).strip('() ').strip()

PRAYER_WAIT = 'Nous disons « (n fois) » seulement quand la source le précise.'
ITEMS = [
    # ---------------- après la prière (catégorie after_prayer) ----------------
    dict(ch='ap', no=1, cat='after_prayer', n=3, ar=ap1[0].strip(), fr='Je demande pardon à Allah. (trois fois)', ref='Muslim 1/414.'),
    dict(ch='ap', no=1, cat='after_prayer', n=1, ar=ap1[1].split(')', 1)[1].strip(), fr='Ô Allah, Tu es la Paix et de Toi vient la paix. Béni sois-Tu, ô Seigneur de majesté et de générosité.', ref='Muslim 1/414.'),
    dict(ch='ap', no=2, cat='after_prayer', n=1, ar=noparen(clean(ARR(27, 2))), fr='Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est Omnipotent. Ô Allah, nul ne peut empêcher ce que Tu accordes, nul ne peut accorder ce que Tu empêches, et l’opulence de l’opulent ne lui sert à rien auprès de Toi (ne le sauve pas de Toi).', ref='Al-Bukhari 1/255 ; Muslim 1/414.'),
    dict(ch='ap', no=3, cat='after_prayer', n=1, ar=noparen(clean(ARR(27, 3))), fr='Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est Omnipotent. Il n’y a de force ni de puissance qu’en Allah. Il n’y a de divinité digne d’adoration qu’Allah, et nous n’adorons que Lui. À Lui le bienfait, à Lui la grâce, à Lui la belle louange. Il n’y a de divinité digne d’adoration qu’Allah, Lui vouant un culte sincère, quand bien même les mécréants en seraient contrariés.', ref='Muslim 1/415.'),
    dict(ch='ap', no=4, cat='after_prayer', n=33, ar=ap4[0].strip(), fr='Gloire et pureté à Allah. (trente-trois fois)', ref='Muslim 1/418. Le hadith précise : celui qui dit cela après chaque prière, ses péchés sont pardonnés même s’ils étaient comme l’écume de la mer.'),
    dict(ch='ap', no=4, cat='after_prayer', n=33, ar=nowaw(ap4[1]), fr='Louange à Allah. (trente-trois fois)', ref='Muslim 1/418 (suite de la précédente).'),
    dict(ch='ap', no=4, cat='after_prayer', n=33, ar=nowaw(ap4[2]), fr='Allah est le Plus Grand. (trente-trois fois)', ref='Muslim 1/418 (suite de la précédente).'),
    dict(ch='ap', no=4, cat='after_prayer', n=1, ar=tahlil, fr='Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est Omnipotent. (pour compléter la centaine)', ref='Muslim 1/418 (pour compléter la centaine).'),
    dict(ch='ap', no=5, cat='after_prayer', n=1, ar=S3_AR, tl=S3_TL, fr=S3_FR + ' (après chaque prière)', ref='Coran 112, 113 et 114. Abu Dawud 2/86 ; an-Nasa’i 3/68 (voir Sahih at-Tirmidhi 2/8 ; Fath al-Bari 9/62). Ces trois sourates sont appelées « al-Mu‘awwidhat ».'),
    dict(ch='ap', no=6, cat='after_prayer', n=1, ar=KURSI_AR, tl=KURSI_TL, fr=f'« {KURSI_FR} » (après chaque prière)', ref='Coran 2:255. An-Nasa’i, ‘Amal al-yawm wa-l-layla n° 100 ; Ibn as-Sunni n° 121, jugé sahih (Sahih al-Jami‘ 5/339 ; as-Silsila as-sahiha 2/697 n° 972). Le hadith précise : celui qui la récite après chaque prière, rien ne l’empêche d’entrer au Paradis sauf la mort.'),
    dict(ch='ap', no=7, cat='after_prayer', n=10, ar=noparen(clean(ARR(27, 7))).split(' عَشْرَ ')[0], fr='Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange ; Il donne la vie et la mort, et Il est Omnipotent. (dix fois, après la prière du Maghrib et celle du Fajr)', ref='At-Tirmidhi 5/515 ; Ahmad 4/227 (voir Zad al-ma‘ad 1/300).'),
    dict(ch='ap', no=8, cat='after_prayer', n=1, ar=noparen(clean(ARR(27, 8))).split(' بَعْدَ ')[0], fr='Ô Allah, je Te demande une science utile, une subsistance pure et des œuvres acceptées. (après le salut de la prière du Fajr)', ref='Ibn Majah et d’autres (voir Sahih Ibn Majah 1/152 ; Majma‘ az-zawa’id 10/111).'),
    # ---------------- sommeil (catégorie sleep) ----------------
    dict(ch='so', no=1, cat='sleep', n=3, ar=S3_AR, tl=S3_TL, fr='En se couchant : joindre les paumes, souffler dedans en récitant ce qui suit, puis se passer les mains sur le corps autant qu’on le peut, en commençant par la tête, le visage et le devant du corps ; trois fois. ' + S3_FR, ref='Coran 112, 113 et 114. Al-Bukhari avec Fath al-Bari 9/62 ; Muslim 4/1723.'),
    dict(ch='so', no=2, cat='sleep', n=1, ar=KURSI_AR, tl=KURSI_TL, fr=f'« {KURSI_FR} »', ref='Coran 2:255. Al-Bukhari avec Fath al-Bari 4/487. Le hadith précise : celui qui la récite en se couchant aura un gardien d’Allah auprès de lui et Satan ne l’approchera pas jusqu’au matin.'),
    dict(ch='so', no=3, cat='sleep', n=1, ar=f'﴿{Q.ar(2, 285, 286)}﴾', tl=Q.pausal(2, 285, 286), fr=f'« {Q.fr(2, 285, 286)} »', ref='Coran 2:285-286. Al-Bukhari avec Fath al-Bari 9/94 ; Muslim 1/554. Le hadith précise : celui qui les récite pendant la nuit, elles lui suffisent.'),
    dict(ch='so', no=4, cat='sleep', n=1, ar=clean(ARR(2, 4)), fr='C’est en Ton nom, mon Seigneur, que j’ai posé mon flanc, et c’est par Toi que je le relèverai. Si Tu retiens mon âme, aie pitié d’elle ; et si Tu la renvoies, protège-la comme Tu protèges Tes serviteurs vertueux.', ref='Al-Bukhari 11/126 ; Muslim 4/2084.'),
    dict(ch='so', no=5, cat='sleep', n=1, ar=clean(ARR(2, 5)), fr='Ô Allah, c’est Toi qui as créé mon âme et c’est Toi qui la rappelles à Toi ; sa mort et sa vie T’appartiennent. Si Tu lui accordes la vie, protège-la ; si Tu la fais mourir, pardonne-lui. Ô Allah, je Te demande la préservation (al-‘afiya).', ref='Muslim 4/2083 ; Ahmad 2/79.'),
    dict(ch='so', no=6, cat='sleep', n=3, ar=clean(ARR(2, 6)), fr='Ô Allah, préserve-moi de Ton châtiment le jour où Tu ressusciteras Tes serviteurs. (trois fois)', ref='Abu Dawud 4/311 (voir Sahih at-Tirmidhi 3/143). Le recueil place cette invocation après avoir posé la main droite sous la joue.'),
    dict(ch='so', no=7, cat='sleep', n=1, ar=clean(ARR(2, 7)), fr='C’est en Ton nom, ô Allah, que je meurs et que je vis.', ref='Al-Bukhari avec Fath al-Bari 11/113 ; Muslim 4/2083.'),
    dict(ch='so', no=8, cat='sleep', n=33, ar=so8[0], fr='Gloire et pureté à Allah. (trente-trois fois)', ref='Al-Bukhari avec Fath al-Bari 7/71 ; Muslim 4/2091. Le hadith précise : cela vaut mieux, pour celui qui le dit en se couchant, qu’un serviteur.'),
    dict(ch='so', no=8, cat='sleep', n=33, ar=nowaw(so8[1]), fr='Louange à Allah. (trente-trois fois)', ref='Al-Bukhari avec Fath al-Bari 7/71 ; Muslim 4/2091 (suite de la précédente).'),
    dict(ch='so', no=8, cat='sleep', n=34, ar=nowaw(so8[2]), fr='Allah est le Plus Grand. (trente-quatre fois)', ref='Al-Bukhari avec Fath al-Bari 7/71 ; Muslim 4/2091 (suite de la précédente).'),
    dict(ch='so', no=9, cat='sleep', n=1, ar=clean(ARR(2, 9)), fr='Ô Allah, Seigneur des sept cieux, Seigneur de la terre et Seigneur du Trône immense, notre Seigneur et Seigneur de toute chose, Toi qui fends le grain et le noyau, qui as fait descendre la Torah, l’Évangile et le Discernement (al-Furqan), je cherche refuge auprès de Toi contre le mal de toute chose dont Tu tiens le toupet. Ô Allah, Tu es le Premier : rien n’est avant Toi ; Tu es le Dernier : rien n’est après Toi ; Tu es l’Apparent : rien n’est au-dessus de Toi ; Tu es le Caché : rien n’est en deçà de Toi. Acquitte nos dettes et enrichis-nous contre la pauvreté.', ref='Muslim 4/2084.'),
    dict(ch='so', no=10, cat='sleep', n=1, ar=clean(ARR(2, 10)), fr='Louange à Allah qui nous a donné à manger et à boire, qui nous a suffi et nous a abrités. Combien de gens n’ont personne pour leur suffire ni pour les abriter !', ref='Muslim 4/2085.'),
    dict(ch='so', no=11, cat='sleep', n=1, ar=clean(ARR(2, 11)), fr='Ô Allah, Connaisseur de l’invisible et du visible, Créateur des cieux et de la terre, Seigneur et Souverain de toute chose, j’atteste qu’il n’y a de divinité digne d’adoration que Toi. Je cherche refuge auprès de Toi contre le mal de mon âme, contre le mal de Satan et de son polythéisme (shirk), et contre le fait de commettre un mal contre moi-même ou de l’attirer sur un musulman.', ref='Abu Dawud 4/317 (voir Sahih at-Tirmidhi 3/142). Note : la version du matin lit « sharakihi » (ses pièges), celle-ci « shirkihi » (son polythéisme), telles que données par le recueil.'),
    dict(ch='so', no=12, cat='sleep', n=1, ar='سُورَةُ السَّجْدَةِ، وَسُورَةُ الْمُلْكِ', fr='Réciter la sourate As-Sajda (32), puis la sourate Al-Mulk (67).', ref='At-Tirmidhi et an-Nasa’i (voir Sahih al-Jami‘ 4/255). Le recueil donne l’indication « il récite Alif Lam Mim Tanzil (as-Sajda) et Tabarak alladhi biyadihi l-mulk ». Les noms de sourates sont écrits ici par l’assistant : à vérifier.'),
    dict(ch='so', no=13, cat='sleep', n=1, ar=clean(ARR(2, 13)), fr='Ô Allah, je me soumets à Toi, je Te confie mon affaire, je tourne mon visage vers Toi, j’adosse mon dos à Toi, par désir et par crainte de Toi. Il n’y a de refuge ni de salut contre Toi qu’auprès de Toi. Je crois en Ton Livre que Tu as révélé et en Ton prophète que Tu as envoyé.', ref='Al-Bukhari avec Fath al-Bari 11/113 ; Muslim 4/2081. Le hadith précise : si tu meurs cette nuit-là, tu meurs sur la fitra (la nature originelle).'),
    # ---------------- réveil (catégorie general : pas de catégorie « réveil » pour l'instant) ----------------
    dict(ch='re', no=1, cat='general', n=1, ar=wk(1), fr='Louange à Allah qui nous a rendu la vie après nous avoir fait mourir (le sommeil), et c’est vers Lui que sera la résurrection. (au réveil)', ref='Al-Bukhari avec Fath al-Bari 11/113 ; Muslim 4/2083.'),
    dict(ch='re', no=2, cat='general', n=1, ar=wk(2), fr='Il n’y a de divinité digne d’adoration qu’Allah, Seul, sans associé. À Lui la royauté, à Lui la louange, et Il est Omnipotent. Gloire et pureté à Allah, louange à Allah, il n’y a de divinité digne d’adoration qu’Allah, Allah est le Plus Grand, et il n’y a de force ni de puissance qu’en Allah, le Très Haut, l’Immense. Seigneur, pardonne-moi. (au réveil pendant la nuit)', ref='Al-Bukhari avec Fath al-Bari 3/144 et d’autres ; formulation d’Ibn Majah (voir Sahih Ibn Majah 2/335). Le recueil rapporte : celui qui se réveille la nuit et dit cela, puis demande pardon ou invoque, est exaucé ; s’il fait ses ablutions et prie, sa prière est acceptée.'),
    dict(ch='re', no=3, cat='general', n=1, ar=wk(3), fr='Louange à Allah qui m’a donné la santé dans mon corps, m’a rendu mon âme et m’a permis de L’invoquer. (au réveil)', ref='At-Tirmidhi 5/473 (voir Sahih at-Tirmidhi 3/144).'),
    dict(ch='re', no=4, cat='general', n=1, ar=f'﴿{Q.ar(3, 190, 200)}﴾', tl=Q.pausal(3, 190, 200), fr=f'« {Q.fr(3, 190, 200)} »', ref='Coran 3:190-200. Al-Bukhari avec Fath al-Bari 8/238 ; Muslim 1/530.'),
]

START = 100
out, md, warn = [], [], []
for pos, it in enumerate(ITEMS, START):
    ar = it['ar']
    miss = sorted({m for w in ar.split() for m in missing_vowels(w)}) if it['cat'] != 'x' and not it.get('tl') else []
    if miss:
        warn.append(f"{CH[it['ch']]} n° {it['no']} ({it['fr'][:40]}…) : voyelle manquante sur {' '.join(miss)}")
    tl = transliterate(it.get('tl', ar))
    ref = f"Hisn al-Muslim (Sa‘id al-Qahtani), « {CH[it['ch']]} », invocation n° {it['no']}. {it['ref']}"
    assert len(ref) <= 500, (it['ch'], it['no'], len(ref))
    assert len(ar) <= 4000 and len(it['fr']) <= 4000, (it['ch'], it['no'])
    out.append({'category': it['cat'], 'textAr': ar, 'translit': tl, 'trFr': it['fr'], 'trEn': '', 'reference': ref, 'target': it['n'], 'position': pos})
    md.append((it, tl, ref))

os.makedirs(OUT_DIR, exist_ok=True)
json.dump(out, open(os.path.join(OUT_DIR, 'athkar-priere-sommeil-reveil.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
LBL = {'after_prayer': 'Après la prière', 'sleep': 'Sommeil', 'general': 'Réveil (catégorie « général »)'}
lines = ['# Dhikr après la prière, du sommeil et du réveil — fiche de relecture', '',
         f'{len(out)} entrées. **Aucune n’est validée ni affichée** : à relire par Epok ou un savant, puis à valider une par une dans Admin → Athkar.', '',
         '## Ce qu’il faut vérifier', '',
         '1. **Arabe** : recueil *Hisn al-Muslim* (fichier libre rn0x/Adhkar-json), versets = texte Tanzil. Voyelles manquantes ou fautes de la source corrigées (variable `FIX` de `common.py`).',
         '2. **Découpages décidés par l’assistant** : le « 33 – 33 – 33 + une fois » après la prière est séparé en 4 entrées (une par formule) pour que le compteur marche ; idem « 33 – 33 – 34 » au coucher ; le premier dhikr après la prière (« Astaghfirullah ×3 » puis « Allahumma anta s-salam ») est séparé en 2.',
         '3. **Réveil** : classé en catégorie « général » (il n’existe pas de catégorie « réveil » pour l’instant) ; à décider avec le parcours UX.',
         '4. **Références** : renvois du recueil traduits en français ; rattachement fait en lisant le contenu (les notes ne sont pas numérotées).',
         '5. **Français** : traduction de l’assistant depuis l’arabe (versets : Hamidullah). **Phonétique** : générée par règles, sans tajwid.',
         '6. **Entrée « Sourates As-Sajda et Al-Mulk »** (sommeil n° 12) : seuls les noms des sourates sont donnés (écrits par l’assistant), pas leur texte.', '']
if warn:
    lines += ['## Voyelles encore manquantes dans la source (à vérifier)', ''] + [f'- {w}' for w in warn] + ['']
lines += ['## Les invocations', '']
for it, tl, ref in md:
    lines += [f"### {CH[it['ch']]} n° {it['no']} — {LBL[it['cat']]} (× {it['n']})", '', f"**Arabe** : {it['ar']}", '', f'**Phonétique** : {tl}', '', f"**Français** : {it['fr']}", '', f'**Référence** : {ref}', '']
open(os.path.join(OUT_DIR, 'athkar-priere-sommeil-reveil.md'), 'w', encoding='utf-8').write('\n'.join(lines))
print(len(out), 'entrées')
for w in warn:
    print('ATTENTION', w)
