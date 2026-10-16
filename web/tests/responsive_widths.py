#!/usr/bin/env python3
"""Étape A — test des largeurs d'écran (390 → 2560 px, français et arabe, menu latéral déplié et replié).

Charge le VRAI fichier app/globals.css dans un navigateur sans tête (Chromium de Playwright) avec une page de test qui reprend la
structure de la bannière d'accueil, et vérifie que le texte garde une largeur utile (jamais de titre lettre par lettre),
que la marge latérale reste raisonnable et que rien ne déborde horizontalement.

Lancement (depuis web/) :  python3 tests/responsive_widths.py
Code de sortie : 0 si tout est bon, 1 sinon.
"""
import pathlib
import sys
from playwright.sync_api import sync_playwright

CSS = (pathlib.Path(__file__).resolve().parent.parent / 'app' / 'globals.css').read_text(encoding='utf-8')

def page(dir_, collapsed):
    ms = 'ms col' if collapsed else 'ms'
    return f"""<!doctype html><html dir="{dir_}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>{CSS}</style></head><body>
<div class="{ms}"><aside class="ms-side"><nav><a>Accueil</a></nav></aside>
<div class="ms-main">
<section class="hero banner has-image featured"><div class="banner-shade"></div>
<div class="banner-body"><p class="eyebrow">À la une</p><h1>Cultiver la sincérité au quotidien</h1>
<p>Un résumé de trois lignes pour vérifier que le texte garde une largeur correcte à toutes les tailles d'écran.</p></div></section>
<div class="row"><div class="row-head"><h2>Nouveautés</h2></div></div>
<div class="spk-page"><h1>Intervenant</h1><p>Texte de la page intervenant.</p></div>
</div></div></body></html>"""

WIDTHS = [(390, 844), (768, 1024), (1280, 800), (1440, 900), (1920, 1080), (1990, 1030), (2560, 1440)]
bad = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium') if pathlib.Path('/opt/pw-browsers/chromium').exists() else p.chromium.launch()
    for dir_ in ('ltr', 'rtl'):
        for collapsed in (False, True):
            for w, h in WIDTHS:
                pg = b.new_page(viewport={'width': w, 'height': h})
                pg.set_content(page(dir_, collapsed))
                r = pg.evaluate("""() => {
                  const body = document.querySelector('.banner-body'), h1 = body.querySelector('h1'), main = document.querySelector('.ms-main'), spk = document.querySelector('.spk-page');
                  const cs = getComputedStyle(body);
                  const inner = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
                  const lines = Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight));
                  const sc = getComputedStyle(spk);
                  const spkInner = spk.clientWidth - parseFloat(sc.paddingLeft) - parseFloat(sc.paddingRight);
                  return { inner, lines, gutter: parseFloat(cs.paddingLeft), spkInner, over: document.documentElement.scrollWidth - window.innerWidth, mainW: main.clientWidth };
                }""")
                tag = f'{dir_} {"replié" if collapsed else "déplié"} {w}px'
                ok = r['inner'] >= min(300, r['mainW'] - 2 * r['gutter'] - 2) and r['lines'] <= 4 and r['spkInner'] >= 280 and r['over'] <= 1 and r['gutter'] <= 0.25 * r['mainW'] + 40
                print(('OK   ' if ok else 'ECHEC'), tag, {k: round(v, 1) for k, v in r.items()})
                if not ok:
                    bad.append(tag)
                pg.close()
    b.close()
print('\nRésultat :', 'tout est bon' if not bad else f'{len(bad)} échec(s) : ' + ', '.join(bad))
sys.exit(1 if bad else 0)
