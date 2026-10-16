#!/usr/bin/env python3
"""Étape B — Catalogue, menus et barre du bas, dans un vrai navigateur (Chromium de Playwright).

Prérequis : API de test (3055) + PG de test (5544) + site lancé sur 3001 :
  API_URL=http://127.0.0.1:3055 npx next start -p 3001
Lancement (depuis web/) :  python3 tests/catalogue_menus.py [dossier-captures]
Vérifie : menu du haut (visiteur et membre), barre du bas téléphone (visiteur et membre), menu latéral (groupes, catégories),
page Catalogue (bannière, rangées par format, badge de format, « Tout voir »), grille d'un format et d'une catégorie,
français et arabe (de droite à gauche), aucun débordement horizontal de 390 à 1990 px. Code de sortie 0 si tout est bon."""
import json, pathlib, sys, urllib.request
from playwright.sync_api import sync_playwright

WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-b'); OUT.mkdir(parents=True, exist_ok=True)
bad = []

def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: bad.append(m)

def call(path, method='GET', body=None, token=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': 'Bearer ' + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read() or 'null')
    except urllib.error.HTTPError as e: return {'error': e.code}

adm = call('/auth/login', 'POST', {'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'})['token']
cats = call('/categories')
if not [c for c in cats if not c['parentId']]: call('/categories', 'POST', {'name': 'Spiritualité'}, adm)
top = [c for c in call('/categories') if not c['parentId']][0]
# Une conférence de chaque format utile à l'affichage (si la base de test est vide).
import random
yt = lambda: 'https://youtu.be/' + ''.join(random.choice('abcdefghijklmnopqrstuvwxyz') for _ in range(11))
if len(call('/talks?limit=5')) < 2:
    for fm in (1, 2):
        call('/talks', 'POST', {'title': f'Conférence de test {fm}', 'language': 'fr', 'translateTo': [], 'videoUrl': yt(), 'formatId': fm, 'categoryId': top['id']}, adm)

def overflow(page): return page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    for lang in ('fr', 'ar'):
        L = {'fr': dict(cat='Catalogue', learn='Apprendre', side=['Découvrir', 'Catégories', 'Apprendre', 'Ma bibliothèque', 'Mon compte', 'Gestion'], barlearn='Apprendre'),
             'ar': dict(cat='الفهرس', learn='التعلّم', side=['الفئات', 'حسابي'], barlearn='تعلّم')}[lang]
        # ---------- visiteur
        ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
        pg = ctx.new_page(); pg.goto(WEB + '/catalogue'); pg.wait_for_selector('.catalogue .row, .catalogue .soon', timeout=15000)
        ok(pg.locator('nav.ms-bar a').count() >= 4, f'[{lang}] visiteur 390 px : barre du bas présente ({pg.locator("nav.ms-bar a").count()} entrées)')
        labels = pg.locator('nav.ms-bar a span').all_inner_texts()
        ok(L['cat'] in labels and L['barlearn'] in labels, f'[{lang}] barre du bas : {labels}')
        ok(pg.evaluate('document.dir') == ('rtl' if lang == 'ar' else 'ltr'), f'[{lang}] sens de lecture')
        ok(overflow(pg) <= 1, f'[{lang}] visiteur 390 px : aucun débordement horizontal ({overflow(pg)})')
        pg.screenshot(path=str(OUT / f'visiteur-390-{lang}.png'))
        pg.goto(WEB + '/'); pg.wait_for_timeout(1500)
        ok(pg.locator('nav.ms-bar').count() == 1, f'[{lang}] accueil visiteur : barre du bas aussi')
        pg.goto(WEB + '/login'); pg.wait_for_timeout(800)
        ok(pg.locator('nav.ms-bar').count() == 0, f'[{lang}] page de connexion : pas de barre du bas')
        ctx.close()
        # ---------- visiteur grand écran : menu du haut
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
        pg = ctx.new_page(); pg.goto(WEB + '/catalogue'); pg.wait_for_selector('.catalogue .row, .catalogue .soon', timeout=15000)
        top_labels = pg.locator('header nav[aria-label] a').all_inner_texts() or pg.locator('header a').all_inner_texts()
        ok(any(L['cat'] in x for x in top_labels) and any(L['learn'] in x for x in top_labels), f'[{lang}] menu du haut (visiteur) : {[x.strip() for x in top_labels][:8]}')
        ok(not any(x.strip() in ('Collections', 'Ouvrages') for x in top_labels), f'[{lang}] Collections/Ouvrages ne sont plus en haut')
        ok(pg.locator('nav.ms-bar').is_hidden() if pg.locator('nav.ms-bar').count() else True, f'[{lang}] barre du bas cachée sur ordinateur')
        ok(pg.locator('.thumb .fmt-badge').count() >= 1, f'[{lang}] badge de format sur les vignettes ({pg.locator(".thumb .fmt-badge").count()})')
        ok(pg.locator('.catalogue .row').count() >= 2, f'[{lang}] catalogue : {pg.locator(".catalogue .row").count()} rangées')
        pg.screenshot(path=str(OUT / f'catalogue-1440-{lang}.png'))
        pg.goto(WEB + '/catalogue?format=cours'); pg.wait_for_selector('.catalogue .grid', timeout=15000); pg.wait_for_timeout(800)
        ok(pg.locator('.catalogue h1').inner_text().strip() != '', f'[{lang}] grille d\'un format : titre « {pg.locator(".catalogue h1").inner_text()} »')
        pg.goto(WEB + f'/catalogue?cat={top["id"]}'); pg.wait_for_selector('.catalogue .grid', timeout=15000); pg.wait_for_timeout(800)
        ok(pg.locator('.catalogue h1').inner_text().strip() != '', f'[{lang}] grille d\'une catégorie : titre « {pg.locator(".catalogue h1").inner_text()} »')
        ctx.close()
        # ---------- membre (admin)
        for w, h in ((1440, 900), (1990, 1030), (390, 844)):
            ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{adm}')")
            pg = ctx.new_page(); pg.goto(WEB + '/catalogue'); pg.wait_for_selector('.catalogue .row, .catalogue .soon', timeout=15000); pg.wait_for_timeout(1000)
            ok(overflow(pg) <= 1, f'[{lang}] membre {w} px : aucun débordement horizontal ({overflow(pg)})')
            if w >= 1000:
                titles = pg.locator('.ms-side .ms-title').all_inner_texts()
                ok(all(x.lower() in [y.lower() for y in titles] for x in L['side']), f'[{lang}] menu latéral {w} px : {titles}')
                ok(pg.locator('.ms-side a', has_text=top['name']).count() >= 1, f'[{lang}] menu latéral : catégorie « {top["name"]} »')
                ok(pg.locator('.ms-side a[aria-current="page"]').count() == 1, f'[{lang}] menu latéral : une seule entrée active ({pg.locator(".ms-side a[aria-current=page]").inner_text() if pg.locator(".ms-side a[aria-current=page]").count() else "-"})')
                ok(pg.locator('.ms-side a', has_text='Kids').count() == 0, f'[{lang}] Kids n\'est plus dans le menu latéral')
                pg.locator('.ms-side a', has_text=top['name']).first.click(); pg.wait_for_url('**/catalogue?cat=*'); pg.wait_for_selector('.catalogue .grid')
                ok(pg.locator('.ms-side a[aria-current="page"]').count() == 1, f'[{lang}] une catégorie est active après clic')
                pg.goto(WEB + '/learning?tab=rev'); pg.wait_for_timeout(1500)
                act = pg.locator('.ms-side a[aria-current="page"]')
                ok(act.count() == 1, f'[{lang}] /learning?tab=rev : une seule entrée active ({act.inner_text() if act.count() else "-"})')
            else:
                bar = pg.locator('nav.ms-bar a span').all_inner_texts()
                ok(len(bar) == 5 or len(bar) == 4, f'[{lang}] membre 390 px : barre du bas {bar}')
                pg.locator('header button[aria-label]').first  # le ☰ existe
            pg.screenshot(path=str(OUT / f'membre-{w}-{lang}.png'))
            ctx.close()
    b.close()
print('\n' + ('Étape B navigateur : tout est bon' if not bad else f'{len(bad)} échec(s)'))
sys.exit(1 if bad else 0)
