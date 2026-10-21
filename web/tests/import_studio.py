#!/usr/bin/env python3
"""Étape Import : interface Studio. Nouvelle conférence avec un site quelconque (import obligatoire + attestation), lien YouTube (import facultatif),
fiche d'une conférence YouTube (bouton « Importer chez nous », progression, annulation, relance), journal des imports ; fr 1440 px et ar 390 px sans débordement.
Prérequis : API (3055), PG (5544), site (3001, API_URL=http://127.0.0.1:3055). Lancement (depuis web/) : python3 tests/import_studio.py [dossier-captures]"""
import json, pathlib, re, sys, time, urllib.request, uuid
import psycopg2
from playwright.sync_api import sync_playwright
WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-import'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
UUID = re.compile(r'/studio/[0-9a-f-]{36}'); bad = []; tag = uuid.uuid4().hex[:6]
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def call(path, method='GET', body=None, token=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': 'Bearer ' + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read() or 'null')
    except urllib.error.HTTPError as e: return {'error': e.code}
while True:
    r = call('/auth/login', 'POST', {'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'})
    if r.get('token'): adm = r['token']; break
    time.sleep(10)
cur.execute("update media_imports set status='canceled' where status in ('pending','downloading','converting')")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_status)
               values (%s,'d','X','youtube',%s,%s,'draft','ready','free',30,'fr','unavailable') returning id""", (f'Externe {tag}', tag[:6] + 'ABCDE', aid)); TY = str(cur.fetchone()[0])
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
created = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        for w, lang in ((1440, 'fr'), (390, 'ar')):
            ctx = b.new_context(viewport={'width': w, 'height': 900}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{adm}')"); pg = ctx.new_page()
            label = f'{lang}/{w}'
            # 1) site quelconque : import obligatoire
            url = f'https://videos.example.org/p/{tag}-{lang}'
            pg.goto(WEB + '/studio/new'); pg.wait_for_selector('input[type=url]', timeout=25000)
            ok('lien direct' in pg.locator('main').inner_text() or 'direct link' in pg.locator('main').inner_text() or lang == 'ar', f'{label} : étape 1 annonce les autres sites')
            pg.fill('input[type=url]', 'ftp://x'); pg.click('.linkbox .btn'); pg.wait_for_timeout(300)
            ok(pg.locator('.error').count() == 1, f'{label} : adresse invalide refusée')
            pg.fill('input[type=url]', url); pg.click('.linkbox .btn'); pg.wait_for_selector('.wiz-form', timeout=10000)
            ok(pg.locator('text=Importer la vidéo chez nous').count() == 0, f'{label} : pas de case facultative pour un site inconnu')
            pg.fill('input[required]:not([type=url])', f'Site {tag} {lang}')
            pg.click('.wiz-actions .btn:not(.ghost)'); pg.wait_for_timeout(500)
            ok(pg.locator('.error').count() >= 1 and '/studio/new' in pg.url, f'{label} : sans attestation, la publication est bloquée')
            pg.screenshot(path=str(OUT / f'new-forced-{lang}-{w}.png'), full_page=True)
            ok(ov(pg) <= 1, f'{label} : pas de débordement (nouvelle conférence)')
            pg.check('.check.rights input'); pg.click('.wiz-actions .btn:not(.ghost)'); pg.wait_for_url(UUID, timeout=15000)
            pg.wait_for_selector('[data-testid=import-panel]', timeout=15000); tid = pg.url.rstrip('/').split('/')[-1]; created.append(tid)
            cur.execute("select source, video_status from talks where id=%s", (tid,)); ok(cur.fetchone() == ('upload', 'importing'), f'{label} : conférence créée en import')
            txt = pg.locator('[data-testid=import-panel]').inner_text(); ok(len(txt) > 5, f'{label} : progression affichée ({txt[:40]!r})')
            ok(pg.locator('[data-testid=import-panel] .link.u').count() == 1, f'{label} : bouton annuler visible')
            pg.screenshot(path=str(OUT / f'manage-importing-{lang}-{w}.png'), full_page=True); ok(ov(pg) <= 1, f'{label} : pas de débordement (fiche, import en cours)')
            pg.click('[data-testid=import-panel] .link.u'); pg.wait_for_selector('[data-testid=import-panel] input[type=checkbox]', timeout=15000)
            cur.execute("select status from media_imports where talk_id=%s order by created_at desc limit 1", (tid,)); ok(cur.fetchone()[0] == 'canceled', f'{label} : annulation prise en compte')
            ok(pg.locator('[data-testid=import-panel] button.btn').is_disabled(), f'{label} : relance désactivée tant que la déclaration n\'est pas cochée')
            pg.check('[data-testid=import-panel] input[type=checkbox]'); pg.click('[data-testid=import-panel] button.btn')
            pg.wait_for_selector('[data-testid=import-panel] progress', timeout=15000)
            cur.execute("select status from media_imports where talk_id=%s order by created_at desc limit 1", (tid,)); ok(cur.fetchone()[0] == 'pending', f'{label} : relance faite')
            cur.execute("update media_imports set status='canceled' where talk_id=%s", (tid,))

            # 2) YouTube : copie facultative
            pg.goto(WEB + '/studio/new'); pg.wait_for_selector('input[type=url]')
            vid = (tag + lang + 'xxxxxxxxxxx')[:11].replace('-', 'a')
            pg.fill('input[type=url]', f'https://www.youtube.com/watch?v={vid}'); pg.click('.linkbox .btn'); pg.wait_for_selector('.wiz-form')
            ok(pg.locator('.wiz-form input[type=checkbox]').count() >= 2, f'{label} : YouTube : case « importer » facultative')
            pg.fill('input[required]:not([type=url])', f'YT {tag} {lang}'); pg.click('.wiz-actions .btn:not(.ghost)'); pg.wait_for_url(UUID, timeout=15000)
            tid2 = pg.url.rstrip('/').split('/')[-1]; created.append(tid2)
            cur.execute("select source from talks where id=%s", (tid2,)); cur2 = cur.fetchone()
            cur.execute("select count(*) from media_imports where talk_id=%s", (tid2,)); ok(cur2[0] == 'youtube' and cur.fetchone()[0] == 0, f'{label} : sans la case, la vidéo reste sur YouTube')

            # 3) fiche d'une conférence YouTube du catalogue
            pg.goto(WEB + f'/studio/{TY}'); pg.wait_for_selector('[data-testid=import-panel]', timeout=20000)
            pg.screenshot(path=str(OUT / f'manage-external-{lang}-{w}.png'), full_page=True); ok(ov(pg) <= 1, f'{label} : pas de débordement (fiche externe)')
            pg.check('[data-testid=import-panel] input[type=checkbox]'); pg.click('[data-testid=import-panel] button.btn'); pg.wait_for_selector('[data-testid=import-panel] progress', timeout=15000)
            cur.execute("select status, origin from media_imports where talk_id=%s order by created_at desc limit 1", (TY,)); ok(cur.fetchone() == ('pending', 'youtube'), f'{label} : import lancé depuis la fiche')
            pg.click('[data-testid=import-panel] .link.u'); pg.wait_for_selector('[data-testid=import-panel] input[type=checkbox]', timeout=15000)
            cur.execute("select source from talks where id=%s", (TY,)); ok(cur.fetchone()[0] == 'youtube', f'{label} : annulé : la conférence reste YouTube')

            # 4) journal + activité
            pg.goto(WEB + '/studio/activity'); pg.wait_for_selector('#ac-imports', timeout=20000)
            ok(pg.locator('#ac-imports ~ ul li').count() >= 2, f'{label} : journal des imports affiché'); ok(pg.locator('#ac-imports ~ ul details').count() >= 2, f'{label} : déclaration des droits consultable')
            pg.screenshot(path=str(OUT / f'journal-{lang}-{w}.png'), full_page=True); ok(ov(pg) <= 1, f'{label} : pas de débordement (journal)')
            ctx.close()
        b.close()
finally:
    cur.execute("update media_imports set status='canceled' where status in ('pending','downloading','converting')")
print('TOUT EST OK' if not bad else f'{len(bad)} ECHEC(S)'); sys.exit(1 if bad else 0)
