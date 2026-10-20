#!/usr/bin/env python3
"""Retours d'Epok du 16/10 : menu du haut visible une fois connecté, rangées alignées dans les pages à largeur limitée,
bannière Apprendre avec image, bannière Kids sur l'accueil visiteur, fiche du lecteur (barre d'outils alignée, mode cinéma, fil d'Ariane).
Prérequis comme tests/etape_c.py (API 3055, PG 5544, site 3001).  Lancement (depuis web/) : python3 tests/retours_16oct.py [dossier-captures]"""
import json, pathlib, sys, urllib.request, uuid
from playwright.sync_api import sync_playwright
WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-r'); OUT.mkdir(parents=True, exist_ok=True)
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
em = f'std-{uuid.uuid4().hex[:6]}@test.local'
call('/auth/register', 'POST', {'email': em, 'password': 'Passw0rd-test', 'name': 'Membre'})
std = call('/auth/login', 'POST', {'email': em, 'password': 'Passw0rd-test'})['token']
talk = call('/talks?limit=1')[0]['id']
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    def page(token, w, h, lang='fr'):
        ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
        if token: ctx.add_init_script(f"localStorage.setItem('token', '{token}')")
        return ctx, ctx.new_page()
    for lang in ('fr', 'ar'):
        for w, h in ((1440, 900), (1990, 1030), (390, 844)):
            tag = f'[{lang} {w}px]'
            ctx, pg = page(adm, w, h, lang); pg.goto(WEB + '/catalogue'); pg.wait_for_selector('.catalogue .row', timeout=20000); pg.wait_for_timeout(800)
            if w >= 1000:
                ok(pg.locator('.hd-nav a').count() >= 3 and pg.locator('.hd-nav a').first.is_visible(), f'{tag} menu du haut visible une fois connecté ({pg.locator(".hd-nav a").count()} liens)')
            ctx.close()
            ctx, pg = page(std, w, h, lang); pg.goto(WEB + '/learning'); pg.wait_for_selector('.lk-banner', timeout=20000); pg.wait_for_selector('.lk-page .row-item', timeout=20000); pg.wait_for_timeout(800)
            tb = pg.locator('.lk-tile').first.bounding_box(); ib = pg.locator('.lk-page .row-item').first.bounding_box()
            tile, item = (tb['x'] + tb['width'], ib['x'] + ib['width']) if lang == 'ar' else (tb['x'], ib['x'])  # en arabe, le début est à droite
            ok(abs(tile - item) <= 4, f'{tag} verrouillé : rangée alignée sur le contenu (tuile {tile:.0f}, vignette {item:.0f})')
            ok(pg.evaluate("getComputedStyle(document.querySelector('.lk-banner')).backgroundImage").count('learning-banner') == 1, f'{tag} bannière Apprendre avec image')
            ok(ov(pg) <= 1, f'{tag} verrouillé sans débordement')
            if w == 1440: pg.screenshot(path=str(OUT / f'verrouille-{lang}.png'))
            ctx.close()
            ctx, pg = page(None, w, h, lang); pg.goto(WEB + '/'); pg.wait_for_timeout(3500)
            ok(pg.locator('.vt-kidsban img').count() == 1, f'{tag} accueil visiteur : bannière Kids')
            ok(ov(pg) <= 1, f'{tag} accueil visiteur sans débordement')
            if w == 1440 and lang == 'fr':
                pg.locator('.vt-kidsban').scroll_into_view_if_needed(); pg.wait_for_timeout(800); pg.screenshot(path=str(OUT / 'visiteur-kids.png'))
            ctx.close()
            ctx, pg = page(adm, w, h, lang); pg.goto(WEB + f'/talks/{talk}'); pg.wait_for_selector('.wb-bar', timeout=20000); pg.wait_for_timeout(1500)
            # Fiche vidéo proposition B (20/10) : barre d'icônes de même taille, vitesses dans le menu « Plus »
            hs = pg.evaluate("[...document.querySelectorAll('.wb-bar .wb-ico')].map(e => Math.round(e.getBoundingClientRect().height))")
            ok(len(hs) >= 3 and len(set(hs)) == 1, f'{tag} fiche : icônes d\'action de même taille {set(hs)}')
            pg.locator('[data-act="player-settings"]').click(); pg.wait_for_selector('.wb-pset-menu', timeout=5000)
            ok(pg.locator('.wb-pset-menu .speed-pill').count() == 6, f'{tag} fiche : vitesses dans les réglages posés sur le lecteur')
            pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
            ok(pg.locator('.crumbs').count() == 1, f'{tag} fiche : fil d\'Ariane')
            ok(ov(pg) <= 1, f'{tag} fiche sans débordement')
            if w >= 1000:
                pw = pg.locator('.player-wrap').bounding_box()['width']
                pg.screenshot(path=str(OUT / f'fiche-{w}-{lang}.png'))
                pg.locator('[data-act="more"]').click(); pg.locator('[data-act="cinema"]').click(); pg.wait_for_timeout(500)
                ok(pg.evaluate("document.body.classList.contains('cinema-on')"), f'{tag} mode cinéma activé')
                pw2 = pg.locator('.player-wrap').bounding_box()['width']
                ok(pw2 > pw, f'{tag} cinéma : lecteur plus large ({pw:.0f} → {pw2:.0f})')
                ok(not pg.locator('.ms-side').is_visible() and not pg.locator('.wb-grid').is_visible(), f'{tag} cinéma : menus et colonne masqués')
                ok(ov(pg) <= 1, f'{tag} cinéma sans débordement')
                pg.screenshot(path=str(OUT / f'cinema-{w}-{lang}.png'))
                pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
                ok(not pg.evaluate("document.body.classList.contains('cinema-on')"), f'{tag} Échap quitte le cinéma')
            ctx.close()
    b.close()
print('\n' + ('Retours 16/10 : tout est bon' if not bad else f'{len(bad)} échec(s)'))
sys.exit(1 if bad else 0)
