#!/usr/bin/env python3
"""Accueil de l'enfant (Kids) : menu latéral + cartes de progression + onglets Regarder / Apprendre ; fr + ar ; 390 / 1440 / 1990 px.
Prérequis comme tests/etape_c.py (API 3055, PG 5544, site 3001).  Lancement (depuis web/) : python3 tests/kids_menu.py [dossier-captures]"""
import json, pathlib, sys, urllib.request, uuid
import psycopg2
from playwright.sync_api import sync_playwright
WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-k'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
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
cur.execute("select id from talks where publication='published' and video_status='ready' limit 6"); ids = [r[0] for r in cur.fetchall()]
for i in ids: cur.execute("update talks set kids_bands=%s where id=%s", (['3-6', '7-10', '11-14'], i))
call('/me/kids/pin', 'PUT', {'code': '2468'}, adm)
prof = call('/me/kids/profiles', 'POST', {'name': 'Yacine', 'band': '7-10', 'avatar': 'lion'}, adm)
pid = prof.get('id')
if not pid:
    pid = call('/me/kids', 'GET', None, adm)['profiles'][0]['id']
kid = call(f'/me/kids/profiles/{pid}/enter', 'POST', {}, adm)['token']
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    for lang in ('fr', 'ar'):
        for w, h in ((1440, 900), (1990, 1030), (390, 844)):
            tag = f'[{lang} {w}px]'
            ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{kid}')"); pg = ctx.new_page()
            pg.goto(WEB + '/kids'); pg.wait_for_selector('.kd-side nav a', timeout=20000); pg.wait_for_selector('.kd-grid .kd-card', timeout=20000); pg.wait_for_timeout(600)
            n = pg.locator('.kd-side nav a').count()
            ok(n >= 2, f'{tag} menu latéral ({n} entrées)')
            if w > 900:
                bx = pg.locator('.kd-side').bounding_box(); mx = pg.locator('.kd-page').bounding_box()
                side_first = (bx['x'] > mx['x']) if lang == 'ar' else (bx['x'] < mx['x'])
                ok(side_first, f'{tag} menu du bon côté (début de ligne)')
            else:
                ok(pg.locator('.kd-side').bounding_box()['y'] < pg.locator('.kd-page').bounding_box()['y'] + 400, f'{tag} menu en barre sur téléphone')
            ok(pg.locator('.kd-progress .kd-pcard').count() >= 2, f'{tag} cartes de progression ({pg.locator(".kd-progress .kd-pcard").count()})')
            ok(pg.locator('.kd-hero-main').count() == 1, f'{tag} grande carte « Regarder »')
            ok(ov(pg) <= 1, f'{tag} accueil sans débordement')
            if w == 1440: pg.screenshot(path=str(OUT / f'kids-accueil-{lang}.png'), full_page=True)
            if w == 390: pg.screenshot(path=str(OUT / f'kids-accueil-{lang}-390.png'))
            for q in ('watch', 'learn'):
                pg.goto(WEB + f'/kids?tab={q}'); pg.wait_for_selector('.kd-side nav a.on', timeout=20000); pg.wait_for_timeout(500)
                ok(pg.locator('.kd-side nav a.on').get_attribute('href') == f'/kids?tab={q}', f'{tag} onglet {q} allumé')
                ok(ov(pg) <= 1, f'{tag} onglet {q} sans débordement')
            ctx.close()
    b.close()
print('\nKids menu : ' + ('tout est bon' if not bad else f'{len(bad)} échec(s)'))
sys.exit(1 if bad else 0)
