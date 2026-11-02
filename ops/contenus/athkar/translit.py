#!/usr/bin/env python3
"""
Phonétique « à la française » d'un texte arabe voyellé (dhikr).

Règles déterministes (aucune IA) : le résultat dépend uniquement des voyelles écrites dans le texte arabe.
Ce n'est PAS une transcription savante : « ou » pour u, « dj » pour ج, « dh » pour ذ/ظ, « kh », « gh », « ch », « th »,
« ʿ » pour ع, « ’ » pour la hamza (omise en début de mot). Les voyelles longues ne sont pas distinguées des brèves.
Limites connues (à faire relire) : pas de tajwid (idgham, ikhfa', qalqala, madd), fin de phrase prononcée en pause
(voyelle finale omise), « ha » pronom suffixe toujours lu court.
"""
import re
import unicodedata

FATHA, DAMMA, KASRA = 'َ', 'ُ', 'ِ'
SUKUN, SHADDA = 'ْ', 'ّ'
TANWIN = {'ً': 'an', 'ٌ': 'un', 'ٍ': 'in'}
DAGGER, MADDAH = 'ٰ', 'ٓ'
SUKUN_ALT = 'ۡ'  # petite tête de khâ' (sukûn en écriture ottomane)

CONS = {
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'dj', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
    'س': 's', 'ش': 'ch', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'dh', 'ع': 'ʿ', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
    'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ء': '’', 'أ': '’', 'إ': '’',
    'ؤ': '’', 'ئ': '’', 'ة': 't', 'ى': 'y', 'پ': 'p', 'ڤ': 'v',
}
SUN = set('تثدذرزسشصضطظلن')
VOW = {'a': 'a', 'u': 'ou', 'i': 'i'}
# Signes coraniques à ignorer (pauses, petits signes), sauf dagger alif / sukûn alternatif / petites lettres traitées à part.
IGNORE = re.compile('[ـۖ-ۜ۟۠ۢ-ۤۧ-ۭٕٟٔ]')


class Unit:
    __slots__ = ('ch', 'v', 'shadda', 'dagger', 'maddah')

    def __init__(self, ch):
        self.ch, self.v, self.shadda, self.dagger, self.maddah = ch, '', False, False, False


def parse_word(w):
    """Découpe un mot en unités (lettre + voyelle + shadda)."""
    w = unicodedata.normalize('NFC', w)
    w = IGNORE.sub('', w).replace('ٱ', 'ا').replace('ۥ', '').replace('ۦ', '')
    units = []
    for c in w:
        if c in (FATHA, DAMMA, KASRA):
            if units: units[-1].v = {FATHA: 'a', DAMMA: 'u', KASRA: 'i'}[c]
        elif c in TANWIN:
            if units: units[-1].v = TANWIN[c]
        elif c in (SUKUN, SUKUN_ALT):
            if units: units[-1].v = 's'
        elif c == SHADDA:
            if units: units[-1].shadda = True
        elif c == DAGGER:
            if units: units[-1].dagger = True
        elif c == MADDAH:
            if units: units[-1].maddah = True
        elif c.isalpha() or c in 'ىآ':
            units.append(Unit(c))
    # « لاَّ » / « لاَ » : la voyelle et la shadda portées par l'alif appartiennent à la lettre précédente
    for k in range(1, len(units)):
        u, p = units[k], units[k - 1]
        if u.ch == 'ا' and u.v == 'a' and not p.v and p.ch != 'ا':
            p.v, u.v = 'a', ''
            if u.shadda:
                p.shadda, u.shadda = True, False
    return units


def missing_vowels(word):
    """Lettres sans voyelle ni sukûn (hors lettres de prolongation) : défaut de voyellation de la source."""
    us = parse_word(word)
    bad = []
    for k, u in enumerate(us):
        if u.ch in 'اىويآ' or u.v or u.dagger:
            continue
        if u.ch == 'ل' and k > 0 and us[k - 1].ch == 'ا' and not us[k - 1].v:
            continue   # lam de l'article
        if k + 1 < len(us) and us[k + 1].ch == 'ا' and us[k + 1].v == 'an':
            continue   # voyelle portée par le tanwin de l'alif suivant
        if k == len(us) - 1:
            continue
        bad.append(u.ch)
    return bad


def render_word(units, prev_ends_vowel, pause):
    """Rend un mot. prev_ends_vowel : le mot précédent finit par une voyelle (élision de l'alif de liaison)."""
    out, n = [], len(units)
    i = 0
    prev_v = ''  # dernière voyelle brève écrite
    # --- alif initial : article « al- », ou alif de liaison d'un verbe/nom, ou hamza portée par alif
    pre = 0  # nombre d'unités de préfixe (wa, fa, bi, ka, li) avant l'article
    art = -1
    for k in range(min(3, n)):
        if units[k].ch == 'ا' and not units[k].v and k + 1 < n and units[k + 1].ch == 'ل' and (not units[k + 1].v or units[k + 1].v == 's'):
            if all(units[j].ch in 'وفبكل' and units[j].v in ('a', 'i') for j in range(k)):
                art = k
                break
    skip = set()
    if art >= 0:
        for k in range(art):
            pass
        alif, lam = art, art + 1
        nxt = units[lam + 1] if lam + 1 < n else None
        sun = nxt is not None and nxt.shadda and nxt.ch in SUN
        # rendu du préfixe éventuel
        for k in range(art):
            out.append(CONS[units[k].ch] + VOW.get(units[k].v, ''))
            prev_v = units[k].v
        if art == 0:
            if not prev_ends_vowel:
                out.append('a')
                prev_v = 'a'
        # le « l » de l'article
        skip.update(range(0, lam + 1))
        if sun:
            x = CONS[nxt.ch]
            out.append(x if x == 'l' else x + '-')
            # la lettre solaire est rendue (doublée) par la boucle normale : on l'avance sans re-doubler
            nxt.shadda = False
            out.append(x)
            # voyelle de la lettre solaire
            out.append(VOW.get(nxt.v, '') if nxt.v in VOW else '')
            prev_v = nxt.v
            skip.add(lam + 1)
            i = lam + 2
        else:
            out.append('l-')
            i = lam + 1
            if i < n and units[i].ch in 'أإء':
                units[i].ch = 'ا'   # hamza de début de racine après l'article : non écrite
                units[i].v, v0 = units[i].v, units[i].v
                out.append(VOW.get(v0, ''))
                prev_v = v0
                i += 1
    elif n and units[0].ch == 'ا' and not units[0].v and n > 1:
        # alif de liaison non article (ex. اغْفِرْ, اسْتُرْ) : voyelle i, ou u si la 3e lettre porte damma
        third = units[2].v if n > 2 else ''
        v = 'u' if third == 'u' else 'i'
        if n > 2 and units[1].ch == 'ل' and units[1].shadda:
            v = 'a'   # ٱلَّذِي, ٱلَّيْلِ : article assimilé
        if not prev_ends_vowel:
            out.append(VOW[v]); prev_v = v
        else:
            out.append('\x00')   # marqueur : à coller au mot précédent par un trait d'union
        i = 1
    elif n and units[0].ch == 'آ':
        out.append('a'); prev_v = 'a'; i = 1
    # --- corps du mot
    while i < n:
        u = units[i]
        last = (i == n - 1)
        ch = u.ch
        # voyelles longues (lettres de prolongation sans voyelle)
        if ch in ('ا', 'ى') and u.v == 'an' and i > 0:
            prev_has_a = units[i - 1].v == 'a'
            if last and pause:
                if not prev_has_a: out.append('a')
            else:
                out.append('n' if prev_has_a else 'an')
            prev_v = ''
            i += 1
            continue
        if ch in ('ا', 'ى') and not u.v and i > 0:
            i += 1
            continue
        if ch == 'و' and (not u.v or u.v == 's') and i > 0 and prev_v == 'u' and not u.shadda:
            i += 1
            continue
        if ch == 'ي' and (not u.v or u.v == 's') and i > 0 and prev_v == 'i' and not u.shadda:
            i += 1
            continue
        # consonne
        if ch == 'آ':
            out.append('’a')
            prev_v = 'a'
            i += 1
            continue
        if ch == 'ة':
            if last and (pause or u.v in ('s', '')):
                out.append('h')
                i += 1
                prev_v = ''
                continue
            c = 't'
        elif ch in 'أإءؤئ' and i == 0:
            c = ''
        else:
            c = CONS.get(ch, '')
        if u.shadda and c:
            c = c + c
        out.append(c)
        if ch == 'ء' and i == 0:
            pass
        # voyelle
        v = u.v
        if u.dagger:
            out.append('a'); prev_v = 'a'
        elif v in ('a', 'u', 'i'):
            out.append(VOW[v]); prev_v = v
        elif v in ('an', 'un', 'in'):
            if last and pause:
                if v == 'an': out.append('a')
                prev_v = ''
            else:
                out.append(v[0].replace('u', 'ou') + 'n'); prev_v = v[0]
        else:
            prev_v = '' if v == 's' else prev_v
        # voyelle finale de pause
        i += 1
    s = ''.join(out)
    if pause:
        if units and units[-1].v in ('a', 'u', 'i') and not units[-1].dagger and units[-1].ch not in 'ويى':
            s = re.sub(r'(ou|a|i)$', '', s)
    return s, bool(re.search(r'(a|i|ou|u|e|o)$', s))


PUNCT_PAUSE = set('.؟!*﴾')
PUNCT_OTHER = set('،,؛:;')
STRIP = set('()[]{}﴿«»"“”')


def transliterate(text):
    text = re.sub(r'\s+', ' ', text.replace('\n', ' ')).strip()
    # tokens : mots et ponctuation
    toks = re.findall(r'[^\s.؟!*﴾،,؛:;()\[\]{}﴿«»"“”]+|[.؟!*﴾،,؛:;]', text)
    res, prev_vowel = [], False
    for k, t in enumerate(toks):
        if t in PUNCT_PAUSE:
            if res and not res[-1] == '.':
                res.append('.')
            prev_vowel = False
            continue
        if t in PUNCT_OTHER:
            res.append(',')
            prev_vowel = False
            continue
        nxt = toks[k + 1] if k + 1 < len(toks) else None
        pause = nxt is None or nxt in PUNCT_PAUSE
        w, endv = render_word(parse_word(t), prev_vowel, pause)
        if w:
            if w.startswith('\x00') and res and res[-1] not in ('.', ','):
                res[-1] = res[-1] + '-' + w[1:]
            else:
                res.append(w.lstrip('\x00'))
        prev_vowel = endv and not pause
    out = ''
    for r in res:
        if r in ('.', ','):
            out = out.rstrip() + r + ' '
        else:
            out += r + ' '
    out = out.strip()
    out = re.sub(r'\.\s*\.', '.', out)
    out = re.sub(r'\ba+llah', lambda m: 'Allah', out)
    out = re.sub(r'(^|[.!?] )([a-zʿ’])', lambda m: m.group(1) + m.group(2).upper(), out)
    return out


if __name__ == '__main__':
    import sys
    print(transliterate(' '.join(sys.argv[1:]) or sys.stdin.read()))
