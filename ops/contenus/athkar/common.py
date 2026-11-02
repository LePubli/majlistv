"""Outils communs aux scripts de construction des lots de dhikr (voir build_*.py)."""
import json
import os
import re
import unicodedata

from translit import transliterate, missing_vowels  # noqa: F401

N = lambda x: unicodedata.normalize('NFC', x)  # ordre canonique des signes (shadda / kasra)

# Corrections de voyellation de la source — à confirmer par le relecteur.
FIX = [('نَبَيِّنَا', 'نَبِيِّنَا'), ('الشَّيْطانِ', 'الشَّيْطَانِ'), ('نورَهُ', 'نُورَهُ'),
       ('صلى الله عليه وسلم', 'صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ'), ('عَلَيهِ', 'عَلَيْهِ'), ('بَينِ', 'بَيْنِ'),
       ('الْمُشرِكِينَ', 'الْمُشْرِكِينَ'), ('اللَّهُـمَّ', 'اللَّهُمَّ'), ('أَصْبَحْنا', 'أَصْبَحْنَا'), ('لاَ إِلَهَ إلاَّ', 'لاَ إِلَهَ إِلاَّ'),
       ('السّمَاءِ', 'السَّمَاءِ'), ('أَسْتَغيثُ', 'أَسْتَغِيثُ'), ('الغَيْبِ', 'الْغَيْبِ'), ('القَبْرِ', 'الْقَبْرِ'), ('وَالفَقْرِ', 'وَالْفَقْرِ'),
       ('الكُفْرِ', 'الْكُفْرِ'), ('خَيرَ', 'خَيْرَ'), ('الذُّنوبَ', 'الذُّنُوبَ'), ('تَوَكَّلتُ', 'تَوَكَّلْتُ'),
       ('العَافِيَةَ', 'الْعَافِيَةَ'), ('الجَدُّ', 'الْجَدُّ'), ('الكَافِرُونَ', 'الْكَافِرُونَ'), ('الْحَمدُ', 'الْحَمْدُ'),
       ('لَا إِلَهَ إِلاَّ', 'لاَ إِلَهَ إِلاَّ'), ('أَكبَرُ', 'أَكْبَرُ'), ('اغْفرْ', 'اغْفِرْ'), ('شَريكَ', 'شَرِيكَ'),
       ('للَّهِ', 'لِلَّهِ'), ('ذِكْرِهِ', 'ذِكْرِهِ'), ('فَلَيسَ', 'فَلَيْسَ'), ('وَمَحْياهَا', 'وَمَحْيَاهَا'), ('الِلَّهِ', 'اللَّهِ'), ('فارْحَمْهَا', 'فَارْحَمْهَا'), ('نافِعاً', 'نَافِعاً'), ('أَذِنَ لي', 'أَذِنَ لِي'), ('الفَجْرِ', 'الْفَجْرِ'), ('الْأَرْضَ', 'الْأَرْضَ'), (' ،', '،'), ('  ', ' ')]


def fix(t):
    t = N(t)
    for a, b in FIX:
        t = t.replace(N(a), N(b))
    return re.sub(r'\s+', ' ', t).strip()


def load(adhkar_dir, quran_dir):
    adhkar = {c['id']: c for c in json.load(open(os.path.join(adhkar_dir, 'adhkar.json')))}
    tanzil = json.load(open(os.path.join(quran_dir, 'data/tanzil/uthmani.json')))
    hamid = json.load(open(os.path.join(quran_dir, 'data/quranenc/french_hameedullah.json')))
    return adhkar, tanzil, hamid


class Quran:
    def __init__(self, tanzil, hamid):
        self.t, self.h = tanzil, hamid
        self.bas = tanzil['1'][0]['text']

    def _ar(self, sura, a, b, joiner):
        return joiner.join(v['text'][len(self.bas):].strip() if (sura != 1 and v['verse'] == 1 and v['text'].startswith(self.bas)) else v['text']
                           for v in self.t[str(sura)] if a <= v['verse'] <= b)

    def ar(self, sura, a, b):
        return self._ar(sura, a, b, ' ')

    def pausal(self, sura, a, b):
        return self._ar(sura, a, b, ' * ')

    def fr(self, sura, a, b):
        return ' '.join(re.sub(r'\[\d+\]', '', v['text']).strip() for v in self.h[str(sura)] if a <= v['verse'] <= b)


def clean(text):
    """Texte arabe d'un dhikr : sans double parenthèses, crochets ni mention de répétitions."""
    t = N(text).replace('\n', ' ')
    t = re.sub(r'\[[^\]]*\]', '', t).replace('((', '').replace('))', '')
    return fix(t.strip().rstrip('.').strip())
