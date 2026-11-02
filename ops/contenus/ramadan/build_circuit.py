#!/usr/bin/env python3
"""
Génère docs/contenus/ramadan-circuit.{json,md} : actions du circuit de Ramadan (adultes et enfants).
- Arabe des hadiths : extrait mot pour mot du jeu de données AhmedBaset/hadith-json (cloné dans $HJ, défaut /tmp/hj), vérifié par recherche du texte.
- Français / anglais : écrits par l'assistant (reformulation, pas une traduction publiée) ; titres arabes courts écrits par l'assistant.
- Références : recueil + livre/chapitre (numéros de hadith non repris : la numérotation varie selon les éditions, à compléter à la relecture).
TOUT est importé NON validé et NON affiché : relecture religieuse par Epok ou un savant avant « Valider ».
Usage : python3 build_circuit.py <dossier de sortie docs/contenus>
"""
import json, os, re, sys

HJ = os.environ.get('HJ', '/tmp/hj') + '/db/by_book/the_9_books/'
OUT = sys.argv[1]


def bare(t):
    return re.sub(r'[\u064b-\u065f\u0670]', '', t)


def hadith_ar(book, num, must):
    """Texte arabe (entre guillemets) du hadith n° `num` du jeu de données ; `must` : mot attendu (contrôle)."""
    for h in json.load(open(HJ + book + '.json', encoding='utf-8'))['hadiths']:
        if h['idInBook'] == num:
            a = re.sub(r'[\u200f\u200e]', '', re.sub(r'\s+', ' ', h['arabic']))
            m = re.search(r'" (.+?) "', a)
            assert m and bare(must) in bare(m.group(1)), (book, num)
            return m.group(1).strip()
    raise SystemExit(f'hadith introuvable {book} {num}')


AR = {
    'suhur': hadith_ar('bukhari', 1854, 'السَّحُورِ'),
    'iftar': hadith_ar('bukhari', 1886, 'الْفِطْرَ'),
    'qiyam': hadith_ar('bukhari', 1935, 'قَامَهُ'),
    'qadr': hadith_ar('bukhari', 1944, 'لَيْلَةَ الْقَدْرِ'),
    'langue': hadith_ar('bukhari', 5828, 'قَوْلَ الزُّورِ'),
    'feed': hadith_ar('tirmidhi', 807, 'فَطَّرَ صَائِمًا'),
    'dua': hadith_ar('ibnmajah', 3586, 'عَفُوٌّ'),
    'dix': hadith_ar('bukhari', 1947, 'الْعَشْرِ الأَوَاخِرِ'),
}
AR['dua'] = 'اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي'
assert bare(AR['dua']) in bare(hadith_ar('ibnmajah', 3586, 'عَفُوٌّ'))

BK, TM, IM = 'Sahih al-Bukhari', 'Jami‘ at-Tirmidhi', 'Sunan Ibn Majah'
I = []


def add(aud, day, pos, t, x, ref, ar='', link=''):
    I.append(dict(audience=aud, day=day, position=pos, title=dict(fr=t[0], en=t[1], ar=t[2]), text=dict(fr=x[0], en=x[1], ar=ar), link=link, reference=ref))


# ---------------- ADULTES — chaque jour (day 0)
add('adult', 0, 1, ('Jeûner avec sincérité', 'Fast with sincerity', 'صيام اليوم'),
    ('Le jeûne du mois de Ramadan est une obligation (Coran). Renouvelez votre intention chaque jour et gardez le jeûne pour Allah seul.',
     'Fasting in the month of Ramadan is an obligation (Qur’an). Renew your intention each day and fast for Allah alone.'),
    'Coran 2:183 et 2:185.', link='/coran/2')
add('adult', 0, 2, ('Prendre le suhur', 'Eat the pre-dawn meal (suhur)', 'السحور'),
    ('Le Prophète ﷺ a dit de prendre le repas d’avant l’aube : il y a une bénédiction dans le suhur.',
     'The Prophet ﷺ said to take the pre-dawn meal: there is blessing in suhur.'),
    f'{BK}, Livre du jeûne (Kitab as-Sawm), chapitre de la bénédiction du suhur ; rapporté par Anas ibn Malik.', AR['suhur'])
add('adult', 0, 3, ('Rompre le jeûne sans tarder', 'Break the fast promptly', 'تعجيل الفطر'),
    ('Les gens resteront dans le bien tant qu’ils se hâtent de rompre le jeûne, une fois le coucher du soleil établi.',
     'People will remain in good as long as they hasten to break the fast, once sunset is established.'),
    f'{BK}, Livre du jeûne, chapitre de la hâte de rompre le jeûne ; rapporté par Sahl ibn Sa‘d.', AR['iftar'])
add('adult', 0, 4, ('Prière de nuit (tarawih)', 'Night prayer (tarawih)', 'قيام الليل'),
    ('Celui qui accomplit la prière de nuit pendant Ramadan avec foi et en espérant la récompense d’Allah, ses péchés passés lui seront pardonnés (hadith rapporté par Abu Hurayra). Notez vos tarawih dans la case dédiée.',
     'Whoever prays at night in Ramadan out of faith and hoping for Allah’s reward, his previous sins will be forgiven (narrated by Abu Hurayra). Record your tarawih in the dedicated box.'),
    f'{BK}, Livre de la prière des tarawih (Salat at-Tarawih) ; rapporté par Abu Hurayra.', AR['qiyam'])
add('adult', 0, 5, ('Lire le Coran', 'Read the Qur’an', 'تلاوة القرآن'),
    ('Ramadan est le mois du Coran. Le Prophète ﷺ le révisait chaque nuit de Ramadan avec Jibril. Lisez votre part du jour : le plan « Lire le Coran en 30 jours » vous guide.',
     'Ramadan is the month of the Qur’an. The Prophet ﷺ reviewed it every night of Ramadan with Jibril. Read your portion for the day: the “Read the Qur’an in 30 days” plan guides you.'),
    f'Coran 2:185 ; {BK}, Livre des vertus / des prophètes, hadith d’Ibn ‘Abbas sur la générosité du Prophète ﷺ et la révision du Coran avec Jibril.', link='/coran')
add('adult', 0, 6, ('Garder sa langue et ses actes', 'Guard your tongue and your actions', 'حفظ اللسان'),
    ('Celui qui n’abandonne pas la parole mensongère, l’acte qui va avec et l’ignorance, Allah n’a pas besoin qu’il abandonne sa nourriture et sa boisson. Le jeûne se vit aussi dans les paroles.',
     'Whoever does not give up false speech, acting on it, and ignorance, Allah has no need of him giving up his food and drink. Fasting is also lived in words.'),
    f'{BK}, Livre du jeûne ; rapporté par Abu Hurayra.', AR['langue'])
add('adult', 0, 7, ('Donner, même un peu', 'Give, even a little', 'الصدقة'),
    ('Le Prophète ﷺ était le plus généreux des gens, et il l’était davantage encore pendant Ramadan. Donnez quelque chose aujourd’hui, même modeste.',
     'The Prophet ﷺ was the most generous of people, and even more so in Ramadan. Give something today, however small.'),
    f'{BK}, hadith d’Ibn ‘Abbas sur la générosité du Prophète ﷺ en Ramadan.')
add('adult', 0, 8, ('Nourrir une personne qui jeûne', 'Feed someone who is fasting', 'تفطير الصائم'),
    ('Celui qui offre de quoi rompre le jeûne à une personne qui jeûne aura la même récompense qu’elle, sans que la sienne soit diminuée. Un repas partagé, une datte, un verre d’eau comptent.',
     'Whoever provides food for a fasting person to break his fast will have the same reward as that person, without diminishing the faster’s reward. A shared meal, a date, a glass of water all count.'),
    f'{TM}, Livre du jeûne ; rapporté par Zayd ibn Khalid al-Juhani ; at-Tirmidhi : « hasan sahih ».', AR['feed'])

# ---------------- ADULTES — jours précis
add('adult', 1, 0, ('Renouveler son intention', 'Renew your intention', 'تجديد النية'),
    ('Les actes valent selon les intentions. Au premier jour, posez votre intention pour tout le mois : jeûne, prière, Coran, partage.',
     'Deeds are judged by intentions. On the first day, set your intention for the whole month: fasting, prayer, Qur’an, giving.'),
    f'{BK}, Livre de la révélation, premier hadith ; rapporté par ‘Umar ibn al-Khattab.')
add('adult', 21, 0, ('Les dix dernières nuits commencent', 'The last ten nights begin', 'العشر الأواخر'),
    ('Le Prophète ﷺ s’isolait en retraite (i‘tikaf) dans les dix dernières nuits de Ramadan et disait de rechercher la Nuit du Destin durant celles-ci. Donnez-leur plus de temps, selon vos moyens.',
     'The Prophet ﷺ would observe i‘tikaf in the last ten nights of Ramadan and said to look for the Night of Power in them. Give them more time, as you are able.'),
    f'{BK}, Livre de la retraite (I‘tikaf) et Livre de la Nuit du Destin ; rapporté par ‘A’icha.', AR['dix'])
for d in (21, 23, 25, 27, 29):
    add('adult', d, 1, ('Chercher la Nuit du Destin', 'Look for the Night of Power', 'تحري ليلة القدر'),
        ('Cherchez la Nuit du Destin dans les nuits impaires des dix dernières nuits. Elle vaut mieux que mille mois (Coran). Priez, lisez, invoquez.',
         'Look for the Night of Power in the odd nights of the last ten. It is better than a thousand months (Qur’an). Pray, read, make supplication.'),
        f'Coran 97:1-5 ; {BK}, Livre de la Nuit du Destin ; rapporté par ‘A’icha.', AR['qadr'], '/coran/97')
    add('adult', d, 2, ('Invocation de la Nuit du Destin', 'Supplication for the Night of Power', 'دعاء ليلة القدر'),
        ('‘A’icha demanda ce qu’elle devait dire si elle rencontrait la Nuit du Destin. Le Prophète ﷺ répondit : « Ô Allah, Tu es Pardonneur et Tu aimes le pardon : pardonne-moi. »',
         '‘A’isha asked what to say if she met the Night of Power. The Prophet ﷺ replied: “O Allah, You are Forgiving and You love forgiveness, so forgive me.”'),
        f'{IM}, Livre de l’invocation (Du‘a’), rapporté par ‘A’icha. Le recueil de at-Tirmidhi la rapporte aussi (numéro à vérifier à la relecture).', AR['dua'])
add('adult', 29, 3, ('Préparer la zakat al-fitr', 'Prepare zakat al-fitr', 'زكاة الفطر'),
    ('La zakat al-fitr est obligatoire pour tout musulman ; elle se verse avant la prière de l’Aïd. Préparez-la avec votre famille.',
     'Zakat al-fitr is obligatory on every Muslim; it is paid before the ‘Id prayer. Prepare it with your family.'),
    f'{BK}, Livre de la zakat, chapitre de la zakat al-fitr ; rapporté par Ibn ‘Umar. Montant et forme : à préciser par la relecture (selon l’école et le lieu).')

# ---------------- ENFANTS — chaque jour
add('kid', 0, 1, ('Je lis ou j’écoute un peu de Coran', 'I read or listen to some Qur’an', 'أقرأ أو أسمع القرآن'),
    ('Ramadan est le mois du Coran. Avec un parent, je lis ou j’écoute quelques versets que je connais.',
     'Ramadan is the month of the Qur’an. With a parent, I read or listen to a few verses I know.'),
    'Coran 2:185.', link='/coran')
add('kid', 0, 2, ('Je dis de belles paroles', 'I say kind words', 'أقول كلمة طيبة'),
    ('Pendant Ramadan, je fais attention à mes mots : pas de mensonge, pas de dispute. Je parle avec gentillesse.',
     'During Ramadan I am careful with my words: no lies, no arguing. I speak kindly.'),
    f'{BK}, Livre du jeûne ; rapporté par Abu Hurayra (la parole mensongère).')
add('kid', 0, 3, ('Je partage avec les autres', 'I share with others', 'أشارك غيري'),
    ('Le Prophète ﷺ était très généreux en Ramadan. Aujourd’hui, je donne ou je partage quelque chose : un goûter, un jouet, une petite pièce.',
     'The Prophet ﷺ was very generous in Ramadan. Today I give or share something: a snack, a toy, a small coin.'),
    f'{BK}, hadith d’Ibn ‘Abbas sur la générosité du Prophète ﷺ en Ramadan.')
add('kid', 0, 4, ('J’aide à préparer la rupture du jeûne', 'I help prepare the iftar', 'أساعد في الإفطار'),
    ('J’aide ma famille à préparer le repas de la rupture ou à mettre la table. Offrir à manger à quelqu’un qui jeûne est une belle action.',
     'I help my family prepare the iftar meal or set the table. Giving food to someone who is fasting is a beautiful deed.'),
    f'{TM}, Livre du jeûne ; rapporté par Zayd ibn Khalid al-Juhani.')
add('kid', 0, 5, ('Je suis la prière avec ma famille', 'I join the prayer with my family', 'أصلي مع أسرتي'),
    ('Avec ma famille, je prie ce que je peux, aussi longtemps que je peux. Prier la nuit en Ramadan est une belle habitude.',
     'With my family, I pray what I can, as long as I can. Praying at night in Ramadan is a beautiful habit.'),
    f'{BK}, Livre de la prière des tarawih ; rapporté par Abu Hurayra.')
# ENFANTS — jours précis
add('kid', 27, 1, ('Je demande pardon à Allah', 'I ask Allah for forgiveness', 'أطلب العفو'),
    ('Dans les nuits impaires de la fin de Ramadan, on cherche la Nuit du Destin. Avec un parent, je dis : « Ô Allah, Tu es Pardonneur et Tu aimes le pardon : pardonne-moi. »',
     'In the odd nights at the end of Ramadan we look for the Night of Power. With a parent, I say: “O Allah, You are Forgiving and You love forgiveness, so forgive me.”'),
    f'{IM}, Livre de l’invocation ; rapporté par ‘A’icha.', AR['dua'])

json.dump(I, open(os.path.join(OUT, 'ramadan-circuit.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
md = ['# Circuit de Ramadan — actions à relire et valider (généré, non validé)', '',
      'Arabe des hadiths : extrait mot pour mot d’un jeu de données ouvert (AhmedBaset/hadith-json). Français/anglais : reformulations de l’assistant. '
      'À relire par Epok ou un savant avant « Valider » (Admin → Circuit de Ramadan).', '']
for a, lab in (('adult', 'Adultes'), ('kid', 'Enfants')):
    md += [f'## {lab}', '']
    for x in I:
        if x['audience'] != a: continue
        md += [f"- **Jour {x['day'] or 'chaque jour'}** — {x['title']['fr']} : {x['text']['fr']}  \n  _Réf. : {x['reference']}_"]
    md.append('')
open(os.path.join(OUT, 'ramadan-circuit.md'), 'w', encoding='utf-8').write('\n'.join(md))
print(len(I), 'actions', sum(x['audience'] == 'adult' for x in I), 'adultes', sum(x['audience'] == 'kid' for x in I), 'enfants')
