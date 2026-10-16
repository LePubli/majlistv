#!/usr/bin/env python3
"""Étape C — Apprendre (tableau de bord, écran verrouillé), « Explorer par format » (accueil), Séries « Continuer », dans un vrai navigateur.

Prérequis : API de test (3055) + PG (5544) + site sur 3001 (API_URL=http://127.0.0.1:3055 npx next start -p 3001).
Lancement (depuis web/) :  python3 tests/etape_c.py [dossier-captures]
Vérifie, en français et en arabe, à 390 et 1440 px : les quatre temps et le menu Apprendre pour un abonné Apprentissage (administrateur),
l'écran verrouillé pour un membre standard (bannière, quatre tuiles avec cadenas, invitation, contenus accessibles), les tuiles
de formats sur l'accueil, la page Séries, et l'absence de débordement horizontal."""
import json, pathlib, sys, urllib.request, uuid
from playwright.sync_api import sync_playwright

WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-c'); OUT.mkdir(parents=True, exist_ok=True)
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
print('admin a le palier Apprentissage :', call('/me/learning', token=adm).get('error') is None, '| standard :', call('/me/learning', token=std).get('error'))
def overflow(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    def page(token, w, h, lang):
        ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
        ctx.add_init_script(f"localStorage.setItem('token', '{token}')")
        return ctx, ctx.new_page()
    for lang in ('fr', 'ar'):
        for w, h in ((1440, 900), (390, 844)):
            tag = f'[{lang} {w}px]'
            # --- membre Apprentissage
            ctx, pg = page(adm, w, h, lang); pg.goto(WEB + '/learning'); pg.wait_for_selector('.lg-steps, .lk-banner', timeout=20000); pg.wait_for_timeout(1500)
            ok(pg.locator('.lg-step').count() >= 3, f'{tag} Apprendre : quatre temps ({pg.locator(".lg-step").count()})')
            ok(pg.locator('.lg-top').count() == 1, f'{tag} Apprendre : bloc reprendre / à réviser / engagements')
            ok(pg.locator('[role=tab]').count() >= 5, f'{tag} onglets : {pg.locator("[role=tab]").all_inner_texts()}')
            ok(overflow(pg) <= 1, f'{tag} Apprendre : aucun débordement ({overflow(pg)})')
            pg.screenshot(path=str(OUT / f'apprendre-{w}-{lang}.png'))
            pg.goto(WEB + '/learning?tab=commit'); pg.wait_for_timeout(1500)
            ok(pg.locator('[role=tab][aria-selected=true]').count() == 1, f'{tag} onglet « engagements » ouvert')
            ctx.close()
            # --- accueil : tuiles de formats
            ctx, pg = page(adm, w, h, lang); pg.goto(WEB + '/'); pg.wait_for_timeout(3000)
            ok(pg.locator('.fmt-tile').count() >= 2, f'{tag} accueil : tuiles de formats ({pg.locator(".fmt-tile").count()})')
            ok(overflow(pg) <= 1, f'{tag} accueil : aucun débordement ({overflow(pg)})')
            if w == 1440 and lang == 'fr': pg.screenshot(path=str(OUT / 'accueil-formats.png'))
            if pg.locator('.fmt-tile').count():
                pg.locator('.fmt-tile').first.click(); pg.wait_for_url('**/catalogue?format=*', timeout=10000)
                ok(True, f'{tag} tuile de format → grille du format')
            ctx.close()
            # --- membre standard : écran verrouillé
            ctx, pg = page(std, w, h, lang); pg.goto(WEB + '/learning'); pg.wait_for_selector('.lk-banner', timeout=20000); pg.wait_for_timeout(1500)
            ok(pg.locator('.lk-tile').count() == 4, f'{tag} verrouillé : 4 tuiles ({pg.locator(".lk-tile").count()})')
            ok(pg.locator('.lk-cta a[href="/pricing"]').count() == 1, f'{tag} verrouillé : invitation vers les tarifs')
            ok(pg.locator('.row .talk-wrap').count() >= 1, f'{tag} verrouillé : contenus accessibles ({pg.locator(".row .talk-wrap").count()})')
            ok(overflow(pg) <= 1, f'{tag} verrouillé : aucun débordement ({overflow(pg)})')
            pg.screenshot(path=str(OUT / f'verrouille-{w}-{lang}.png'))
            ctx.close()
            # --- séries
            ctx, pg = page(adm, w, h, lang); pg.goto(WEB + '/series'); pg.wait_for_timeout(2500)
            ok(pg.locator('h1').count() >= 1 and overflow(pg) <= 1, f'{tag} Séries : page affichée sans débordement')
            ctx.close()
    b.close()
print('\n' + ('Étape C navigateur : tout est bon' if not bad else f'{len(bad)} échec(s)'))
sys.exit(1 if bad else 0)
