#!/usr/bin/env python3
"""Registre n°28 / 31 / 13 / 33 (20/10) : Studio → Activité montre « Place des mots » et « Suivi du visage » avec le bouton Annuler
(organisateur et administrateur), message « Annulation en cours… » ; fr + ar ; 390 / 1440 px sans débordement.
Prérequis : API (3055), PG (5544), site (3001). Lancement (depuis web/) : python3 tests/activite_annuler.py [dossier-captures]"""
import json, pathlib, sys, time, urllib.request, uuid
import psycopg2
from playwright.sync_api import sync_playwright
WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-act'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
bad = []; tag = uuid.uuid4().hex[:6]; talks = []
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
call('/admin/modules/editor', 'PUT', {'enabled': True}, adm)
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
cur.execute("delete from word_align_jobs where status in ('pending','processing')"); cur.execute("delete from face_track_jobs where status in ('pending','processing')")
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_status)
               values (%s,'d','X','upload',%s,%s,'draft','ready','free',30,'fr','ready') returning id""", (f'Leçon {tag}', f'talks/{tag}', aid)); T = str(cur.fetchone()[0]); talks.append(T)
cur.execute("insert into word_align_jobs(talk_id, lang) values (%s,'fr')", (T,))
P = str(uuid.uuid4()); cur.execute("insert into face_track_jobs(project_id, talk_id, from_s, to_s, status, progress) values (%s,%s,0,5,'processing',30)", (P, T))
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        for w, lang in ((1440, 'fr'), (390, 'ar')):
            ctx = b.new_context(viewport={'width': w, 'height': 900}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{adm}')"); pg = ctx.new_page()
            pg.goto(WEB + '/studio/activity'); pg.wait_for_selector('.ac-task', timeout=25000); pg.wait_for_timeout(800)
            txt = pg.locator('main').inner_text()
            names = ('Place des mots', 'Suivi du visage') if lang == 'fr' else ('توقيت الكلمات', 'تتبّع الوجه')
            ok(all(n.lower() in txt.lower() for n in names), f'{w}px {lang} : les deux tâches sont listées avec leur nom')
            ok(pg.locator('[data-act=task-cancel]').count() >= (2 if w == 1440 else 1), f'{w}px : bouton Annuler (pas sur une tâche déjà en cours d\'annulation)')
            ok(ov(pg) <= 0, f'{w}px : pas de débordement ({ov(pg)} px)'); pg.screenshot(path=str(OUT / f'activite-{w}-{lang}.png'), full_page=True)
            if w == 1440:
                pg.locator('.ac-task', has_text='Suivi du visage').locator('[data-act=task-cancel]').click(); pg.wait_for_timeout(1500)
                cur.execute('select cancel_requested from face_track_jobs where project_id=%s', (P,)); ok(cur.fetchone()[0] is True, 'suivi du visage en cours : arrêt demandé')
                ok('Annulation en cours' in pg.locator('main').inner_text(), '« Annulation en cours… » affiché')
                pg.locator('.ac-task', has_text='Place des mots').locator('[data-act=task-cancel]').click(); pg.wait_for_timeout(1500)
                cur.execute('select status from word_align_jobs where talk_id=%s', (T,)); ok(cur.fetchone()[0] == 'canceled', 'place des mots en attente : annulée')
                ok(pg.locator('.ac-task', has_text='Place des mots').count() == 0, 'elle disparaît de la liste')
                cur.execute("insert into word_align_jobs(talk_id, lang) values (%s,'fr') on conflict (talk_id) do update set status='pending'", (T,))
            ctx.close()
        b.close()
finally:
    for t in talks: cur.execute('delete from talks where id=%s', (t,))
print('TOUT OK' if not bad else f'ÉCHECS : {len(bad)}'); sys.exit(1 if bad else 0)
