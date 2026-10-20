#!/usr/bin/env python3
"""Mejliss Kids en vrai catalogue (20/10) : Admin → Rubriques Kids (liste, création, ordre), Studio (rubriques dans la fiche conférence),
côté enfant : pastilles de rubriques, rangées, recherche, filtre « pour mon âge » ; fr + ar ; 390 / 1440 px sans débordement.
Prérequis : API (3055), PG (5544), site (3001). Lancement (depuis web/) : python3 tests/kids_catalog.py [dossier-captures]"""
import json, pathlib, sys, time, urllib.request, uuid
import psycopg2
from playwright.sync_api import sync_playwright
WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-kc'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
bad = []; tag = uuid.uuid4().hex[:6]; talks = []; rubrics = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def call(path, method='GET', body=None, token=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': 'Bearer ' + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read() or 'null')
    except urllib.error.HTTPError as e: return {'error': e.code}
def login():
    while True:
        r = call('/auth/login', 'POST', {'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'})
        if r.get('token'): return r['token']
        time.sleep(10)
adm = login()
for m in call('/admin/modules', 'GET', None, adm)['modules']: call(f"/admin/modules/{m['id']}", 'PUT', {'enabled': True}, adm)
call('/me/kids/pin', 'PUT', {'code': '2468'}, adm)
prof = call('/me/kids/profiles', 'POST', {'name': f'Yac{tag}', 'band': '7-10', 'avatar': 'lion'}, adm)
pid = prof.get('id') or call('/me/kids', 'GET', None, adm)['profiles'][0]['id']
cur.execute("update kid_profiles set catalog_mode='all', daily_limit_min=NULL where id=%s", (pid,))
kid = call(f'/me/kids/profiles/{pid}/enter', 'POST', {}, adm)['token']
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
UP = {'3-6': ['3-6', '7-10', '11-14'], '7-10': ['7-10', '11-14']}
def talk(title, band):
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,kids_bands) values (%s,'une histoire de patience','Cheikh Kids','youtube',%s,%s,'published','ready','free',600,%s) returning id",
                (f'{title} {tag}', 'v' + uuid.uuid4().hex[:9], aid, UP[band])); t = str(cur.fetchone()[0]); talks.append(t); return t
R = call('/admin/kids/rubrics', 'POST', {'names': {'fr': f'Contes {tag}', 'en': f'Tales {tag}', 'ar': f'حكايات {tag}'}, 'emoji': '🧸'}, adm); rubrics.append(R['id'])
R2 = call('/admin/kids/rubrics', 'POST', {'names': {'fr': f'Chansons {tag}'}, 'emoji': '🎶'}, adm); rubrics.append(R2['id'])
A = talk('Le petit lion', '7-10'); Bt = talk('La tortue sage', '3-6'); C = talk('Chanson du matin', '7-10')
call(f'/studio/talks/{A}/kid-rubrics', 'PUT', {'rubricIds': [R['id']]}, adm); call(f'/studio/talks/{Bt}/kid-rubrics', 'PUT', {'rubricIds': [R['id']]}, adm); call(f'/studio/talks/{C}/kid-rubrics', 'PUT', {'rubricIds': [R2['id']]}, adm)
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        def page(token, w, lang='fr', h=900):
            ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{token}')"); return ctx.new_page()
        # ---- Admin
        pg = page(adm, 1280); pg.goto(WEB + '/admin?tab=kidrubrics'); pg.wait_for_selector('.kr-row', timeout=25000); pg.wait_for_timeout(500)
        ok(pg.locator('.kr-row').count() >= 8, f'Admin : {pg.locator(".kr-row").count()} rubriques listées')
        ok(pg.locator(f'.kr-row input[name=fr][value="Contes {tag}"]').count() == 1, 'Admin : la rubrique de test est listée')
        pg.fill('input[name=newFr]', f'Créée par UI {tag}'); pg.fill('input[name=newEmoji]', '🌟'); pg.click('.kr-new .btn'); pg.wait_for_selector(f'.kr-row input[value="Créée par UI {tag}"]', timeout=10000)
        ok(True, 'Admin : rubrique créée depuis l\'écran')
        rid = [x['id'] for x in call('/admin/kids/rubrics', 'GET', None, adm) if x['names']['fr'] == f'Créée par UI {tag}'][0]; rubrics.append(rid)
        pg.screenshot(path=str(OUT / 'admin.png'), full_page=True)
        pm = page(adm, 390); pm.goto(WEB + '/admin?tab=kidrubrics'); pm.wait_for_selector('.kr-row', timeout=25000); pm.wait_for_timeout(500)
        ok(ov(pm) <= 1, f'Admin 390 px sans débordement ({ov(pm)} px)')
        # ---- Studio : rubriques dans la fiche conférence
        ps = page(adm, 1280); ps.goto(WEB + f'/studio/{A}'); ps.wait_for_selector('.kr-pick', timeout=25000); ps.wait_for_timeout(500)
        ok(ps.locator('.kr-pick .pill.on').count() == 1 and f'Contes {tag}' in ps.locator('.kr-pick .pill.on').inner_text(), 'Studio : la rubrique de la conférence est cochée')
        ps.locator('.kr-pick .pill', has_text=f'Chansons {tag}').click(); ps.wait_for_timeout(800)
        ok(sorted(call(f'/studio/talks/{A}/kid-rubrics', 'GET', None, adm)['rubricIds']) == sorted([R['id'], R2['id']]), 'Studio : cocher une rubrique l\'enregistre aussitôt')
        call(f'/studio/talks/{A}/kid-rubrics', 'PUT', {'rubricIds': [R['id']]}, adm)
        # ---- Enfant
        for lang in ('fr', 'ar'):
            for w in (1440, 390):
                tg = f'[{lang} {w} px]'
                pk = page(kid, w, lang, 900 if w > 500 else 844); pk.goto(WEB + '/kids?tab=watch'); pk.wait_for_selector('.kc-chips', timeout=25000); pk.wait_for_selector('.kc-shelf', timeout=15000); pk.wait_for_timeout(600)
                ok(pk.locator('.kc-chip[data-rubric]').count() >= 2, f'{tg} pastilles de rubriques ({pk.locator(".kc-chip[data-rubric]").count()})')
                kinds = pk.locator('.kc-shelf').evaluate_all('els => els.map(e => e.dataset.kind)')
                ok('new' in kinds and 'rubric' in kinds, f'{tg} rangées : {kinds}')
                ok(ov(pk) <= 1, f'{tg} sans débordement ({ov(pk)} px)')
                if lang == 'fr':
                    # recherche
                    pk.fill('#kc-q', 'tortue'); pk.wait_for_selector('.kd-grid .kd-card', timeout=8000)
                    names = pk.locator('.kd-card-title').all_inner_texts()
                    ok(any('tortue' in n.lower() for n in names) and not any('lion' in n.lower() for n in names), f'{tg} recherche « tortue » : {names}')
                    pk.fill('#kc-q', 'zzzzqq'); pk.wait_for_selector('.soon', timeout=8000); ok(True, f'{tg} recherche sans résultat : message doux')
                    pk.fill('#kc-q', '')
                    # filtre rubrique
                    pk.locator('.kc-chip', has_text=f'Contes {tag}').click(); pk.wait_for_timeout(400)
                    names = pk.locator('.kd-card-title').all_inner_texts()
                    ok(len(names) == 2 and not any('Chanson' in n for n in names), f'{tg} filtre rubrique : {names}')
                    # filtre âge : la tortue (3-6) disparaît
                    pk.locator('.kc-age input').check(); pk.wait_for_timeout(300)
                    names = pk.locator('.kd-card-title').all_inner_texts()
                    ok(len(names) == 1 and 'lion' in names[0].lower(), f'{tg} « seulement pour mon âge » : {names}')
                    pk.locator('.kc-age input').uncheck()
                    if w == 1440: pk.locator('.kc-chip', has_text='Tout').click(); pk.wait_for_timeout(300); pk.screenshot(path=str(OUT / 'kids-1440.png'), full_page=True)
                else:
                    ok(pk.evaluate('document.documentElement.dir') == 'rtl', f'{tg} RTL')
                    ok(any(f'حكايات {tag}' in x for x in pk.locator('.kc-chip').all_inner_texts()), f'{tg} nom de rubrique en arabe')
                if w == 390 and lang == 'fr': pk.screenshot(path=str(OUT / 'kids-390.png'), full_page=True)
        b.close()
finally:
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for r in rubrics: cur.execute("delete from kid_rubrics where id=%s", (r,))
print('\nÉCHECS :' if bad else '\nTOUT EST OK', *bad, sep='\n')
sys.exit(1 if bad else 0)
