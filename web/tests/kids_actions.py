#!/usr/bin/env python3
"""Kids « Mes petites actions » dans le navigateur : le parent propose (écran parent), l'enfant voit l'action sur son accueil et dans l'onglet Agir,
dit « Je l'ai fait », le parent valide. fr + ar ; 390 / 1440 px. Prérequis comme tests/kids_menu.py.  Lancement (depuis web/) : python3 tests/kids_actions.py"""
import json, pathlib, sys, urllib.request
import psycopg2
from playwright.sync_api import sync_playwright
WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path('/tmp/shots-ka'); OUT.mkdir(parents=True, exist_ok=True)
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
call('/me/kids/pin', 'PUT', {'code': '2468'}, adm)
pid = (call('/me/kids', 'GET', None, adm)['profiles'] or [None])[0]
pid = pid['id'] if pid else call('/me/kids/profiles', 'POST', {'name': 'Yacine', 'band': '7-10'}, adm)['id']
cur.execute('delete from kid_actions where profile_id=%s', (pid,))
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    for lang in ('fr', 'ar'):
        for w, h in ((1440, 900), (390, 844)):
            tag = f'[{lang} {w}px]'
            cur.execute('delete from kid_actions where profile_id=%s', (pid,))
            # 1) le parent propose depuis son écran
            ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{adm}')"); pg = ctx.new_page()
            pg.goto(WEB + '/kids'); pg.wait_for_selector('.kd-profiles', timeout=20000)
            pg.locator('p > button.btn.ghost').first.click(); pg.wait_for_selector('.kd-manage', timeout=10000)
            pg.locator('.kd-row button.link', has_text='Petites actions' if lang == 'fr' else 'الأعمال الصغيرة').first.click()
            pg.wait_for_selector('.ka-add input', timeout=10000)
            pg.fill('.ka-add input', 'Dire bonjour avec le sourire'); pg.click('.ka-add button.btn'); pg.wait_for_selector('.kd-ctrl .ka-item', timeout=10000)
            ok(pg.locator('.kd-ctrl .ka-item').count() == 1, f'{tag} parent : action ajoutée depuis son écran')
            ok(ov(pg) <= 1, f'{tag} écran parent sans débordement')
            if w == 1440 and lang == 'fr': pg.screenshot(path=str(OUT / 'parent.png'), full_page=True)
            ctx.close()
            # 2) l'enfant la voit, dit « fait »
            kid = call(f'/me/kids/profiles/{pid}/enter', 'POST', {}, adm)['token']
            ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{kid}')"); pg = ctx.new_page()
            pg.goto(WEB + '/kids'); pg.wait_for_selector('.ka-home .ka-item', timeout=20000)
            ok(pg.locator('.ka-home .ka-item').count() == 1, f'{tag} enfant : action sur l\'accueil')
            ok(pg.locator('.kd-side nav a[href="/kids?tab=act"]').count() == 1, f'{tag} enfant : entrée « Agir » du menu')
            if w == 1440 and lang == 'fr': pg.screenshot(path=str(OUT / 'enfant-accueil.png'), full_page=True)
            pg.goto(WEB + '/kids?tab=act'); pg.wait_for_selector('.ka-item .ka-done', timeout=20000)
            ok(ov(pg) <= 1, f'{tag} onglet Agir sans débordement')
            pg.click('.ka-item .ka-done'); pg.wait_for_selector('.ka-item.claimed', timeout=10000)
            ok(pg.locator('.ka-item.claimed').count() == 1 and pg.locator('.ka-done').count() == 0, f'{tag} enfant : « Je l\'ai fait » → en attente du parent')
            if w == 1440 and lang == 'fr': pg.screenshot(path=str(OUT / 'enfant-agir.png'))
            ctx.close()
            # 3) le parent valide
            aid = call(f'/me/kids/profiles/{pid}/actions', 'GET', None, adm)['actions'][0]['id']
            ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{adm}')"); pg = ctx.new_page()
            pg.goto(WEB + '/kids'); pg.wait_for_selector('.kd-profiles', timeout=20000)
            pg.locator('p > button.btn.ghost').first.click(); pg.wait_for_selector('.kd-manage', timeout=10000)
            pg.locator('.kd-row button.link', has_text='Petites actions' if lang == 'fr' else 'الأعمال الصغيرة').first.click()
            pg.wait_for_selector('.kd-ctrl .ka-item.claimed', timeout=10000)
            pg.locator('.kd-ctrl .ka-item .btn').first.click(); pg.wait_for_selector('.kd-ctrl .ka-item.validated', timeout=10000)
            ok(call(f'/me/kids/profiles/{pid}/actions', 'GET', None, adm)['counts']['validated'] == 1, f'{tag} parent : action validée')
            ctx.close()
    b.close()

# 4) fin de quiz : l'action proposée s'affiche sous les étoiles (une conférence Kids avec 5 questions approuvées)
cur.execute("select id from talks where publication='published' and video_status='ready' and kids_bands is not null and array_length(kids_bands,1) > 0 limit 1")
row = cur.fetchone()
if row:
    tid = row[0]
    cur.execute("delete from quiz_questions where talk_id=%s", (tid,))
    for i in range(5):
        cur.execute("insert into quiz_questions(talk_id,lang,question,options,correct_index,explanation,evidence_ms,origin,status) values (%s,'fr',%s,'[\"A\",\"B\",\"C\"]',1,'Parce que B.',%s,'manual','approved')", (tid, f"Question {i} ?", i * 1000))
    cur.execute('delete from kid_actions where profile_id=%s', (pid,))
    call(f'/me/kids/profiles/{pid}/actions', 'POST', {'title': 'Aider à ranger ma chambre'}, adm)
    kid = call(f'/me/kids/profiles/{pid}/enter', 'POST', {}, adm)['token']
    with sync_playwright() as p2:
        b2 = p2.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        for w, h in ((1440, 900), (390, 844)):
            ctx = b2.new_context(viewport={'width': w, 'height': h}); ctx.add_init_script(f"localStorage.setItem('token', '{kid}')"); pg = ctx.new_page()
            pg.goto(WEB + f'/kids/watch/{tid}'); pg.wait_for_selector('.kd-quiz-btn', timeout=20000); pg.click('.kd-quiz-btn')
            for i in range(5):
                pg.wait_for_selector('.kd-option', timeout=10000); pg.locator('.kd-option').nth(1).click(); pg.locator('.kd-quiz .btn').first.click()
            pg.wait_for_selector('#kd-res', timeout=15000); pg.wait_for_timeout(800)
            ok(pg.locator('.ka-after .ka-item').count() == 1, f'[{w}px] fin de quiz : l\'action proposée s\'affiche')
            ok(ov(pg) <= 1, f'[{w}px] fin de quiz sans débordement')
            if w == 1440: pg.screenshot(path=str(OUT / 'fin-de-quiz.png'), full_page=True)
            ctx.close()
        b2.close()
else:
    ok(False, 'aucune conférence Kids pour tester la fin de quiz')

print('\nKids actions navigateur : ' + ('tout est bon' if not bad else f'{len(bad)} échec(s)'))
sys.exit(1 if bad else 0)
