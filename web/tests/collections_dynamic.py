#!/usr/bin/env python3
"""Phase 6 (20/11) : collections dynamiques dans le navigateur — rangée automatique sur l'accueil, Studio (règles + aperçu), Kids ; fr + ar, 1440 / 390 px.
Prérequis : API (3055), PG (5544), site (3000 ou 3001), build `next build` + `next start`. Lancement (depuis web/) : python3 tests/collections_dynamic.py [site] [dossier-captures]"""
import json, pathlib, sys, uuid, requests
import psycopg2
from playwright.sync_api import sync_playwright
WEB = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'
API = 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else '/tmp/shots-cd'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; bad = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
for n, secs in (('Court', 300), ('Long', 2400)):
    cur.execute("""insert into talks(title,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,show_adults)
                   values(%s,%s,'youtube','abc',%s,'published','ready','free',%s,'fr','fr',true)""", (f'Zcoll{n} {tag}', f'Orateur {tag}', aid, secs))
tok = requests.post(API + '/auth/login', json={'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'}).json()['token']
H = {'authorization': 'Bearer ' + tok}
cid = requests.post(API + '/studio/collections', headers=H, json={'title': f'Rangée auto {tag}', 'mode': 'auto', 'published': True, 'onHome': True, 'homeOrder': 0, 'rule': {'speaker': f'Orateur {tag}', 'maxSeconds': 600}}).json()['id']
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        # Une seule connexion (limitée par le serveur), réutilisée pour tous les écrans.
        c0 = b.new_context(); pg0 = c0.new_page()
        pg0.goto(f'{WEB}/login', wait_until='networkidle')
        pg0.fill('input[type=email]', 'admin@test.local'); pg0.fill('input[type=password]', 'AdminPassw0rd-test'); pg0.keyboard.press('Enter')
        pg0.wait_for_timeout(3000); state = c0.storage_state(); c0.close()
        for lang, (w, h) in [('fr', (1440, 900)), ('fr', (390, 800)), ('ar', (390, 800))]:
            ctx = b.new_context(viewport={'width': w, 'height': h}, storage_state=state); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            page = ctx.new_page(); label = f'{lang}-{w}'
            page.goto(f'{WEB}/', wait_until='networkidle')
            try:
                page.wait_for_function(f"document.body.innerText.includes('Rangée auto {tag}')", timeout=10000); seen = True
            except Exception: seen = False
            ok(seen, f'[{label}] la rangée automatique apparaît sur l\'accueil')
            if seen:
                txt = page.locator('section:has([id^=row-col-])').first.text_content()
                ok(f'ZcollCourt {tag}' in txt and f'ZcollLong {tag}' not in txt, f'[{label}] la règle « ≤ 10 min » ne garde que la vidéo courte')
            ok(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), f'[{label}] aucun débordement horizontal')
            if lang == 'ar': ok(page.evaluate("document.documentElement.dir") == 'rtl', f'[{label}] RTL')
            page.screenshot(path=str(OUT / f'home-{label}.png'))
            ctx.close()
        # Studio : règles et aperçu
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, storage_state=state); page = ctx.new_page()
        page.goto(f'{WEB}/studio/collections', wait_until='networkidle')
        page.get_by_text(f'Rangée auto {tag}').first.click()
        page.wait_for_selector('.co-rule')
        ok(page.locator('.co-rule').count() == 1, 'Studio : le formulaire de règles apparaît pour une collection automatique')
        page.get_by_text('Voir ce que la collection afficherait').click()
        page.wait_for_selector('.co-preview')
        ok('1 vidéo' in page.inner_text('.co-preview') and f'ZcollCourt {tag}' in page.inner_text('.co-preview'), 'Studio : l\'aperçu montre 1 vidéo (la courte)')
        page.screenshot(path=str(OUT / 'studio.png'))
        ctx.close(); b.close()
finally:
    requests.delete(f'{API}/studio/collections/{cid}', headers=H)
    cur.execute("delete from talks where title like %s", (f'Zcoll% {tag}',))
print('TOUT EST OK' if not bad else f'{len(bad)} ÉCHEC(S)'); sys.exit(1 if bad else 0)
