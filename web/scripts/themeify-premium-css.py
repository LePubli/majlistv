#!/usr/bin/env python3
"""Thème « Premium » réglable (étape 1 de l'éditeur visuel, 24/11/2026).

Remplace chaque couleur écrite en dur des feuilles Premium par une variable CSS AVEC repli sur la couleur d'origine :

    #087cff            ->  var(--c-087cff,#087cff)
    #087cff55          ->  color-mix(in srgb,var(--c-087cff,#087cff) 33.33%,transparent)
    rgba(8,124,255,.2) ->  color-mix(in srgb,var(--c-087cff,#087cff) 20%,transparent)
    white / black      ->  var(--c-ffffff,#ffffff) / var(--c-000000,#000000)

Tant que Admin → Apparence ne définit pas --c-087cff, la couleur d'origine s'applique : l'affichage ne change pas.
Quand la palette Premium est modifiée, l'API publie la nouvelle valeur de chaque variable (voir web/lib/premiumColors.js).

Fichiers traités : public/premium/v20.css, public/premium/bo-mock.css, app/skin-premium.css, app/skin-premium-admin.css.
Le script est idempotent (les couleurs déjà dans un var(...) ne sont pas retouchées). À relancer après toute régénération
de v20.css (build-premium-css.py) ou de bo-mock.css (build-bo-css.py) ; il (re)écrit aussi web/lib/premiumBases.js
(liste de toutes les couleurs de base trouvées) et api/src/premiumBases.js (copie identique).

Les polices (font-family) sont traitées de la même façon : var(--pm-font-body|title|bo, <pile d'origine>), pour que le
choix de police d'Admin → Apparence s'applique à Premium.

Usage : python3 web/scripts/themeify-premium-css.py
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, '..'))
FILES = ['public/premium/v20.css', 'public/premium/bo-mock.css', 'app/skin-premium.css', 'app/skin-premium-admin.css']
NAMED = {'white': (255, 255, 255), 'black': (0, 0, 0)}

HEX = re.compile(r'#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])')
RGB = re.compile(r'rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)', re.I)
NAME = re.compile(r'(?<![\w#-])(white|black)(?![\w-])', re.I)

bases = set()


def fmt_alpha(a):
    p = round(a * 100, 2)
    s = ('%.2f' % p).rstrip('0').rstrip('.')
    return s + '%'


def make(r, g, b, a):
    base = '%02x%02x%02x' % (r, g, b)
    bases.add(base)
    v = 'var(--c-%s,#%s)' % (base, base)
    if a >= 0.9995:
        return v
    return 'color-mix(in srgb,%s %s,transparent)' % (v, fmt_alpha(a))


def from_hex(h):
    h = h.lower()
    if len(h) in (3, 4):
        h = ''.join(c + c for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
    return r, g, b, a


def chan(x):
    return int(round(float(x[:-1]) * 2.55)) if x.endswith('%') else int(round(float(x)))


def convert_value(v):
    """Convertit les couleurs d'une valeur de déclaration (en sautant url(), les chaînes et var(...))."""
    out, i, n = [], 0, len(v)
    while i < n:
        ch = v[i]
        low = v[i:i + 4].lower()
        if ch in '"\'':
            j = v.find(ch, i + 1)
            j = n - 1 if j < 0 else j
            out.append(v[i:j + 1]); i = j + 1; continue
        if low == 'url(' or low == 'var(':
            depth, j = 0, i + 3
            while j < n:
                if v[j] == '(':
                    depth += 1
                elif v[j] == ')':
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            out.append(v[i:j + 1]); i = j + 1; continue
        m = HEX.match(v, i) if ch == '#' else None
        if m:
            out.append(make(*from_hex(m.group(1)))); i = m.end(); continue
        if ch in 'rR':
            m = RGB.match(v, i)
            if m and (i == 0 or not (v[i - 1].isalnum() or v[i - 1] in '-_')):
                a = 1.0
                if m.group(4) is not None:
                    a = float(m.group(4)[:-1]) / 100 if m.group(4).endswith('%') else float(m.group(4))
                out.append(make(chan(m.group(1)), chan(m.group(2)), chan(m.group(3)), a)); i = m.end(); continue
        if ch in 'wWbB':
            m = NAME.match(v, i)
            if m and (i == 0 or not (v[i - 1].isalnum() or v[i - 1] in '-_#')):
                r, g, b = NAMED[m.group(1).lower()]
                out.append(make(r, g, b, 1.0)); i = m.end(); continue
        out.append(ch); i += 1
    return ''.join(out)


def font_value(v):
    t = v.strip()
    imp = ''
    if t.lower().endswith('!important'):
        t, imp = t[:-10].strip(), '!important'
    low = t.lower()
    if low.startswith('var(') or low in ('inherit', 'initial', 'unset') or 'mono' in low or 'trebuchet' in low:
        return v
    if 'poppins' in low:
        role = 'bo'
    elif 'montserrat' in low:
        role = 'title'
    elif 'inter' in low or 'dm sans' in low or 'segoe' in low:
        role = 'body'
    else:
        return v
    return ' var(--pm-font-%s,%s)%s' % (role, t, imp)


def convert_block(body):
    """Corps d'un bloc { … } sans accolade imbriquée : « prop:valeur;prop:valeur »."""
    parts, cur, depth, q = [], '', 0, None
    for ch in body:
        if q:
            cur += ch
            if ch == q:
                q = None
            continue
        if ch in '"\'':
            q = ch
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ';' and depth == 0:
            parts.append(cur); cur = ''
        else:
            cur += ch
    parts.append(cur)
    res = []
    for d in parts:
        k = d.find(':')
        if k < 0:
            res.append(d); continue
        prop = d[:k]
        if prop.strip().lower() in ('font-family', '--font-title', '--font-body', '--font'):
            res.append(prop + ':' + font_value(d[k + 1:])); continue
        # les url() des images de fond contiennent des couleurs encodées : conservées telles quelles (convert_value les saute)
        res.append(prop + ':' + convert_value(d[k + 1:]))
    return ';'.join(res)


def convert_css(css):
    # Blocs les plus internes (aucune accolade dedans) ; les commentaires sont mis de côté.
    comments = []
    def hide(m):
        comments.append(m.group(0)); return '\x00%d\x00' % (len(comments) - 1)
    css2 = re.sub(r'/\*[\s\S]*?\*/', hide, css)
    css2 = re.sub(r'\{([^{}]*)\}', lambda m: '{' + convert_block(m.group(1)) + '}', css2)
    return re.sub(r'\x00(\d+)\x00', lambda m: comments[int(m.group(1))], css2)


def main():
    total = 0
    for f in FILES:
        p = os.path.join(WEB, f)
        s = open(p, encoding='utf-8').read()
        before = len(bases)
        out = convert_css(s)
        n = out.count('var(--c-') - s.count('var(--c-')
        total += n
        open(p, 'w', encoding='utf-8').write(out)
        print('%-34s %7d -> %7d octets, %5d couleurs converties' % (f, len(s), len(out), n))
    # Couleurs de base déjà converties lors d'un passage précédent (idempotence) : on relit les fichiers.
    for f in FILES:
        for m in re.finditer(r'var\(--c-([0-9a-f]{6}),', open(os.path.join(WEB, f), encoding='utf-8').read()):
            bases.add(m.group(1))
    data = ('// Généré par web/scripts/themeify-premium-css.py : ne pas modifier à la main. COPIE IDENTIQUE : web/lib/ et api/src/.\n'
            '// Couleurs de base (RRGGBB) des feuilles Premium, chacune reprise par une variable --c-RRGGBB.\n'
            "export const PREMIUM_BASES = '%s'.split(',');\n" % ','.join(sorted(bases)))
    for dest in (os.path.join(WEB, 'lib', 'premiumBases.js'), os.path.join(WEB, '..', 'api', 'src', 'premiumBases.js')):
        open(dest, 'w').write(data)
    print('%d couleurs de base distinctes ; %d conversions' % (len(bases), total))


if __name__ == '__main__':
    main()
