#!/usr/bin/env python3
"""Étape D : Studio (8 entrées) et Administration séparés.
Vérifie : menu du Studio à 8 entrées (+ Modération pour l'admin), plus d'Administration dans le Studio, habillage Admin à 4 groupes,
accès refusé à l'Admin pour organisateur/modérateur, redirection du modérateur, onglets Contenus/Analytiques, nouvelles pages
(tableau de bord, sous-titres, activité, paramètres, bientôt), ancienne liste déplacée en /studio/contents, anciennes adresses intactes,
FR + AR, 390 / 1440 / 1990 px, aucun débordement.
Prérequis comme tests/etape_c.py (API 3055, PG 5544, site 3001).  Lancement (depuis web/) : python3 tests/etape_d.py [dossier-captures]"""
import json, pathlib, sys, urllib.request, uuid
import psycopg2
from playwright.sync_api import sync_playwright
WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-d'); OUT.mkdir(parents=True, exist_ok=True)
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
def member(role):
    em = f'sd-{role}-{uuid.uuid4().hex[:6]}@test.local'
    call('/auth/register', 'POST', {'email': em, 'password': 'Passw0rd-test', 'name': f'Test {role}'})
    cur.execute('update users set role=%s where email=%s', (role, em))
    return call('/auth/login', 'POST', {'email': em, 'password': 'Passw0rd-test'})['token']
adm = call('/auth/login', 'POST', {'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'})['token']
org, mod = member('organizer'), member('moderator')
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
STUDIO = ['/studio', '/studio/contents', '/studio/stats', '/studio/subtitles', '/studio/dubbing', '/studio/editor', '/studio/activity', '/studio/settings']
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    def page(token, w, h, lang='fr'):
        ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
        if token: ctx.add_init_script(f"localStorage.setItem('token', '{token}')")
        return ctx, ctx.new_page()
    def menu(pg): return [a.get_attribute('href') for a in pg.locator('.studio-nav a').all()]
    for lang in ('fr', 'ar'):
        for w, h in ((1440, 900), (1990, 1030), (390, 844)):
            tag = f'[{lang} {w}px]'
            # --- Organisateur : 8 entrées, pas d'Administration
            ctx, pg = page(org, w, h, lang); pg.goto(WEB + '/studio'); pg.wait_for_selector('.studio-nav a', timeout=20000); pg.wait_for_selector('.sd-dash .sd-row', timeout=20000); pg.wait_for_timeout(600)
            m = menu(pg)
            ok(m == STUDIO, f'{tag} organisateur : menu du Studio = 8 entrées ({len(m)})')
            ok(not any('/admin' in x for x in m) and pg.locator('.studio-foot a[href="/admin"]').count() == 0, f'{tag} organisateur : aucun lien Administration')
            ok(pg.locator('.studio-nav a.on').count() == 1 and pg.locator('.studio-nav a.on').get_attribute('href') == '/studio', f'{tag} tableau de bord allumé')
            ok(ov(pg) <= 1, f'{tag} tableau de bord sans débordement')
            if w == 1440: pg.screenshot(path=str(OUT / f'studio-tableau-{lang}.png'))
            for path, sel, label in (('/studio/contents', '.st-tabs', 'contenus'), ('/studio/subtitles', '.studio-search', 'sous-titres'), ('/studio/activity', '.sd-h2', 'activité'),
                                     ('/studio/settings', '.sd-tools', 'paramètres'), ('/studio/dubbing', '.sd-card', 'doublage'), ('/studio/editor', '.sd-card', 'éditeur')):
                pg.goto(WEB + path); pg.wait_for_selector(sel, timeout=20000); pg.wait_for_timeout(400)
                ok(pg.locator('.studio-nav a.on').count() == 1, f'{tag} {label} : une seule entrée allumée ({pg.locator(".studio-nav a.on").first.get_attribute("href")})')
                ok(ov(pg) <= 1, f'{tag} {label} sans débordement')
                if w == 1440 and lang == 'fr': pg.screenshot(path=str(OUT / f'studio-{label}.png'))
            # anciennes adresses : elles marchent toujours et restent dans le Studio
            for path, entry in (('/studio/series', '/studio/contents'), ('/studio/quiz', '/studio/settings'), ('/studio/new', '/studio/contents')):
                pg.goto(WEB + path); pg.wait_for_selector('.studio-nav a', timeout=20000); pg.wait_for_timeout(500)
                on = pg.locator('.studio-nav a.on')
                ok(on.count() == 1 and on.get_attribute('href') == entry, f'{tag} {path} : entrée « {entry} » allumée')
            pg.goto(WEB + '/studio/series'); pg.wait_for_selector('.st-tabs', timeout=20000)
            ok(pg.locator('.st-tabs a').count() >= 2, f'{tag} /studio/series : onglets Contenus ({pg.locator(".st-tabs a").count()})')
            pg.goto(WEB + '/admin'); pg.wait_for_timeout(1500)
            ok(pg.locator('.studio-nav').count() == 0 and pg.locator('text=/réservée|noAccess|accès|لا يوجد|access/i').count() >= 0 and pg.locator('.studio-admin').count() == 0, f'{tag} organisateur refusé sur /admin')
            ctx.close()
            # --- Administrateur : Studio avec Modération, Admin à 4 groupes
            ctx, pg = page(adm, w, h, lang); pg.goto(WEB + '/studio'); pg.wait_for_selector('.studio-nav a', timeout=20000); pg.wait_for_timeout(600)
            m = menu(pg)
            ok(m == STUDIO + ['/studio/moderation'], f'{tag} admin : Studio = 8 entrées + Modération')
            ok(pg.locator('.studio-foot a[href="/admin"]').count() == 1, f'{tag} admin : lien Administration dans le pied')
            pg.goto(WEB + '/admin'); pg.wait_for_selector('.studio-admin .studio-nav a', timeout=20000); pg.wait_for_timeout(800)
            ok(pg.locator('.studio-group-title').count() == 4, f'{tag} Admin : 4 groupes ({pg.locator(".studio-group-title").count()})')
            am = menu(pg)
            ok('/admin' in am and '/admin?tab=users' in am and '/admin?tab=audit' in am and '/admin?tab=categories' in am and '/admin?tab=features' in am, f'{tag} Admin : entrées clés présentes ({len(am)})')
            ok(not any(x.startswith('/studio') for x in am), f'{tag} Admin : aucune entrée du Studio dans son menu')
            ok(pg.locator('.studio-foot a[href="/studio"]').count() == 1, f'{tag} Admin : lien « Aller au Studio »')
            ok(pg.locator('.studio-nav a.on').count() == 1, f'{tag} Admin : tableau de bord allumé')
            ok(ov(pg) <= 1, f'{tag} Admin tableau de bord sans débordement')
            if w == 1440 and lang == 'fr': pg.screenshot(path=str(OUT / 'admin-tableau.png'))
            for tab in ('users', 'categories', 'features', 'audit', 'settings'):
                pg.goto(WEB + f'/admin?tab={tab}'); pg.wait_for_selector('.studio-admin .studio-nav a.on', timeout=20000); pg.wait_for_timeout(500)
                ok(pg.locator('.studio-nav a.on').get_attribute('href') == f'/admin?tab={tab}', f'{tag} Admin ?tab={tab} : entrée allumée')
            ctx.close()
            # --- Modérateur : seulement ses outils, redirigé vers la modération, refusé sur /admin
            ctx, pg = page(mod, w, h, lang); pg.goto(WEB + '/studio'); pg.wait_for_url('**/studio/moderation', timeout=20000); pg.wait_for_selector('.studio-nav a', timeout=20000)
            m = menu(pg)
            ok('/studio/moderation' in m and '/studio/contents' not in m and not any('/admin' in x for x in m), f'{tag} modérateur : menu de modération seul ({m})')
            ok(pg.locator('.studio-foot a[href="/admin"]').count() == 0, f'{tag} modérateur : pas de lien Administration')
            pg.goto(WEB + '/admin'); pg.wait_for_timeout(1500)
            ok(pg.locator('.studio-admin').count() == 0, f'{tag} modérateur refusé sur /admin')
            ctx.close()
    b.close()
print('\nÉtape D : ' + ('tout est bon' if not bad else f'{len(bad)} échec(s)'))
sys.exit(1 if bad else 0)
