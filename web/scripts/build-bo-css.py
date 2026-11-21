#!/usr/bin/env python3
"""Back-office « Premium » : fabrique web/public/premium/bo-mock.css à partir des maquettes statiques Admin + Studio fournies par Epok (20/11/2026).

Usage : python3 web/scripts/build-premium-css.py <dossier du thème V20>
- garde les feuilles dans l'ordre de index.html du thème ;
- préfixe chaque classe (.hero → .bm-hero) pour ne jamais toucher aux styles du site ;
- limite tout au conteneur .bm-app (html, body, :root, * du thème → .bm-app) ;
- images du thème : assets/x → /premium/x ; polices Google retirées (le site sert Inter et Montserrat lui-même) ;
- titres en Montserrat au lieu de Georgia (choix d'Epok, 19/11).
"""
import re, sys, os

ORDER = ['styles.css', 'styles-special.css']
ROOT = '.bm-app'
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'premium')


def strip_comments(s):
    return re.sub(r'/\*[\s\S]*?\*/', '', s)


def split_top(s, sep=','):
    out, depth, cur, q = [], 0, '', None
    for ch in s:
        if q:
            cur += ch
            if ch == q:
                q = None
            continue
        if ch in '"\'':
            q = ch
        elif ch in '([':
            depth += 1
        elif ch in ')]':
            depth -= 1
        if ch == sep and depth == 0:
            out.append(cur)
            cur = ''
        else:
            cur += ch
    out.append(cur)
    return out


def prefix_classes(sel):
    # classes hors des [attributs] et des chaînes
    res, i, depth = '', 0, 0
    while i < len(sel):
        ch = sel[i]
        if ch == '[':
            depth += 1
        elif ch == ']':
            depth -= 1
        if ch == '.' and depth == 0 and i + 1 < len(sel) and re.match(r'[A-Za-z_]', sel[i + 1]):
            m = re.match(r'\.([A-Za-z_][\w-]*)', sel[i:])
            res += '.bm-' + m.group(1)
            i += len(m.group(0))
            continue
        res += ch
        i += 1
    return res


def scope_selector(sel):
    sel = sel.strip()
    if not sel:
        return sel
    sel = prefix_classes(sel)
    sel = sel.replace('#app', ROOT)
    # html, body, :root du thème → le conteneur
    sel = re.sub(r'^(?::root|html|body)(?=[\s.:\[>+~]|$)', ROOT, sel)
    sel = re.sub(r'(?<=[\s>+~])(?:html|body)(?=[\s.:\[>+~]|$)', '', sel).replace('  ', ' ')
    if sel.startswith(ROOT):
        return sel
    return ROOT + ' ' + sel


KEYFRAMES = set()
TITLE = "'Montserrat Variable','Noto Kufi Arabic Variable',Montserrat,system-ui,sans-serif"


def transform_decls(body):
    body = re.sub(r"url\((['\"]?)assets/", r"url(\1/premium/", body)
    # Captures de référence de la maquette (non livrées : ce ne sont pas des illustrations) → pas d'image.
    def keep(m):
        return m.group(0) if os.path.exists(os.path.join(OUT_DIR, m.group(2))) else 'none'
    body = re.sub(r"url\((['\"]?)/premium/([\w.-]+)\1\)", keep, body)
    body = re.sub(r"font-family:\s*Georgia[^;}]*", "font-family:" + TITLE, body)
    body = re.sub(r"Georgia(\s*,\s*'Times New Roman')?(\s*,\s*serif)?", TITLE, body)
    def anim(m):
        val = m.group(2)
        for k in KEYFRAMES:
            val = re.sub(r'(?<![\w-])' + re.escape(k) + r'(?![\w-])', 'bm-' + k, val)
        return m.group(1) + val
    body = re.sub(r'(animation(?:-name)?\s*:)([^;}]*)', anim, body)
    return body


def process(css):
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            break
        head = css[i:j].strip()
        # bloc équilibré
        depth, k = 0, j
        while k < n:
            if css[k] == '{':
                depth += 1
            elif css[k] == '}':
                depth -= 1
                if depth == 0:
                    break
            k += 1
        inner = css[j + 1:k]
        i = k + 1
        # @import en tête du bloc (polices Google) : retiré
        while head.startswith('@import'):
            semi = head.find(';')
            head = head[semi + 1:].strip() if semi >= 0 else ''
        if head.startswith('@media') or head.startswith('@supports'):
            out.append(head + '{' + process(inner) + '}')
        elif head.startswith('@keyframes'):
            name = head.split()[1]
            out.append('@keyframes bm-' + name + '{' + inner + '}')
        elif head.startswith('@font-face') or head.startswith('@page'):
            continue
        elif head:
            sels = [scope_selector(s) for s in split_top(head)]
            out.append(','.join(s for s in sels if s) + '{' + transform_decls(inner) + '}')
    return ''.join(out)


def main():
    src = sys.argv[1]
    css = ''
    for f in ORDER:
        css += strip_comments(open(os.path.join(src, f), encoding='utf-8').read()) + '\n'
    css = re.sub(r"@import\s+url\([^)]*\)[^;]*;", '', css)
    css = re.sub(r'#app\s*\{[^}]*\}', '', css)
    for m in re.finditer(r'@keyframes\s+([\w-]+)', css):
        KEYFRAMES.add(m.group(1))
    res = process(css)
    head = ('/* Back-office « Premium » — fichier fabriqué par web/scripts/build-bo-css.py à partir du thème fourni par Epok '
            '(19/11/2026). Ne pas modifier à la main : corriger le thème source ou web/app/skin-premium-admin.css. */\n')
    dest = os.path.join(os.path.dirname(__file__), '..', 'public', 'premium', 'bo-mock.css')
    open(dest, 'w', encoding='utf-8').write(head + res + '\n')
    print(dest, len(res), 'caractères,', len(KEYFRAMES), 'animations')


main()
