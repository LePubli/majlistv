#!/usr/bin/env python3
"""Étape D1a : boutons du Studio branchés sur le service de doublage.
Vérifie dans le navigateur : moteur hors ligne annoncé, « Écouter 60 secondes » crée une demande (barre de progression, Annuler),
le service (moteurs factices) la traite, la page se met à jour seule (lecteur des 60 s, état des phrases « Calé / À revoir »),
« Lancer le doublage » attend la nuit, annulation, piste prête affichée dans la liste, FR + AR, 390 / 1440 px, sans débordement.
Prérequis : API (3055) + module dubbing 0.4.0 (relecture rendue facultative pendant le test), PG (5544), S3 de test (5599), site (3001), Python 3.11 avec numpy/psycopg2/boto3 (DUB_PY).
Lancement (depuis web/) : DUB_PY=/chemin/python3.11 python3 tests/d1a_dubbing.py [dossier]"""
import datetime, os, pathlib, subprocess, sys, tempfile, time, uuid
from zoneinfo import ZoneInfo
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
WEB, API, S3 = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055', 'http://127.0.0.1:5599'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-d1a'); OUT.mkdir(parents=True, exist_ok=True)
PY = os.environ.get('DUB_PY', sys.executable)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
bad = []; tag = uuid.uuid4().hex[:6]
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
adm = requests.post(API + '/auth/login', json={'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'}).json()['token']
H = {'authorization': 'Bearer ' + adm}
h = datetime.datetime.now(ZoneInfo('Europe/Paris')).hour
requests.put(API + '/admin/modules/dubbing', headers=H, json={'enabled': True, 'settings': {'mod_dubbing_queue_mode': 'night', 'mod_dubbing_night_start': str((h + 2) % 24), 'mod_dubbing_night_end': str((h + 3) % 24), 'mod_dubbing_require_review': 'false'}})
cur.execute("delete from dub_engine"); cur.execute("update dub_jobs set status='cancelled' where status in ('queued','running')")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
s3 = boto3.client('s3', endpoint_url=S3, aws_access_key_id='test', aws_secret_access_key='test', region_name='garage')
with tempfile.TemporaryDirectory() as d:
    src = os.path.join(d, 'v.mp4'); subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=40', '-c:a', 'aac', src], check=True)
    key = f'videos/d1a-{tag}.mp4'; s3.upload_file(src, 'majlis-videos', key)
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
               values (%s,'d','Cheikh','upload',%s,%s,'published','ready','free',40,'ar','ar') returning id""", (f'Doublage D1a {tag}', key, aid)); TID = str(cur.fetchone()[0])
lines = ['# Bismillah', 'Que la paix soit sur vous.', 'Une phrase beaucoup trop longue pour son tout petit créneau de temps disponible.', 'Réciter abondamment le Coran.', 'La récompense est immense.']
for i, txt in enumerate(lines):
    cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (TID, i, i * 4000, i * 4000 + (900 if i == 2 else 3500), txt))
work = tempfile.mkdtemp()
envs = dict(os.environ, DATABASE_URL='postgres://majlis:pw@127.0.0.1:5544/majlis', S3_ENDPOINT=S3, S3_ACCESS_KEY='test', S3_SECRET_KEY='test', S3_REGION='garage',
            DUB_ENGINE='fake', POLL_SECONDS='1', WORK_DIR=work, PORT='3072', SETTINGS_KEY='a' * 64)
svc = None
def until(fn, timeout=30):
    t = time.time()
    while time.time() - t < timeout:
        if fn(): return True
        time.sleep(0.5)
    return False
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        def page(w, hh, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{adm}')")
            return ctx, ctx.new_page()
        ctx, pg = page(1440, 1000)
        pg.goto(WEB + f'/studio/dubbing/{TID}'); pg.wait_for_selector('.db-segs', timeout=25000)
        ok('ok' not in (pg.locator('.db-engine').get_attribute('class') or ''), 'service arrêté : « moteur hors ligne » annoncé')
        pg.locator('.db-head-actions .btn.ghost').click(); pg.wait_for_selector('.db-job', timeout=10000)
        ok(pg.locator('.db-job .db-bar').count() == 1 and pg.locator('.db-head-actions .btn.ghost').is_disabled(), 'écoute demandée : barre de progression, bouton grisé (une seule à la fois)')
        pg.screenshot(path=str(OUT / 'd1a-attente.png'))
        svc = subprocess.Popen([PY, os.path.join(os.path.dirname(__file__), '..', '..', 'dubbing', 'src', 'main.py')], env=envs, stdout=open(os.path.join(work, 'svc.log'), 'w'), stderr=subprocess.STDOUT)
        pg.wait_for_selector('.db-listen .btn', timeout=60000)  # la page se recharge seule toutes les 5 s
        ok(pg.locator('.db-job').count() == 0, 'la page se met à jour seule quand l\'écoute est prête')
        pg.reload(); pg.wait_for_selector('.db-engine.ok', timeout=20000); ok(True, 'moteur « prêt » affiché')
        pg.locator('.db-listen .btn').first.click(); pg.wait_for_selector('.db-listen audio', timeout=10000)
        src_url = pg.locator('.db-listen audio').get_attribute('src'); ok(requests.get(src_url).status_code == 200, 'lecteur des 60 secondes : fichier lisible')
        ok(pg.locator('.db-segs .db-st.fit').count() >= 2 and pg.locator('.db-segs .db-st.review').count() == 1 and pg.locator('.db-segs .db-st.kept').count() == 1, 'état des phrases : calées, une « à revoir », une en voix d\'origine')
        ok(pg.locator('.db-segs .pill', has_text='(1)').count() >= 1, 'filtre « À revoir (1) »')
        ok(ov(pg) <= 1, 'fiche sans débordement')
        mw = pg.evaluate("document.querySelector('main.db-page').getBoundingClientRect().width") if False else pg.locator('main.db-page').bounding_box()['width']
        ok(mw > 1000, f'lecteur affiché : la page garde sa largeur ({mw:.0f} px)')
        pg.locator('.db-track').screenshot(path=str(OUT / 'd1a-piste-fr.png')); pg.locator('.db-segs').screenshot(path=str(OUT / 'd1a-segments-fr.png'))
        # doublage complet : attend la nuit, puis annulation
        pg.locator('.db-head-actions .btn:not(.ghost)').click(); pg.wait_for_selector('.db-job', timeout=10000); pg.wait_for_timeout(3000)
        ok('attente' in pg.locator('.db-job').inner_text().lower(), 'doublage complet : en attente de la plage de nuit')
        pg.locator('.db-job .btn').click()
        ok(until(lambda: pg.locator('.db-job').count() == 0, 15), 'annulation depuis la fiche')
        # plage « always » : le doublage complet part et la piste est prête
        requests.put(API + '/admin/modules/dubbing', headers=H, json={'settings': {'mod_dubbing_queue_mode': 'always'}})
        pg.locator('.db-head-actions .btn:not(.ghost)').click()
        until(lambda: pg.locator('.db-job').count() == 1, 10)
        until(lambda: pg.locator('.db-job').count() == 0 and pg.locator('.db-listen').count() == 2, 60)
        ok(pg.locator('.db-listen').count() == 2, 'piste française prête + dernière écoute')
        ctx.close()
        for lang, w, hh in (('fr', 1440, 900), ('ar', 390, 844), ('fr', 390, 844)):
            ctx, pg = page(w, hh, lang)
            pg.goto(WEB + '/studio/dubbing'); pg.wait_for_selector('.db-table', timeout=25000); pg.wait_for_timeout(500)
            row = pg.locator('.db-table tr', has_text=f'Doublage D1a {tag}')
            ok(row.locator('.db-tag.ok').count() == 1, f'[{lang} {w}] liste : piste « prête »')
            ok(ov(pg) <= 1, f'[{lang} {w}] liste sans débordement')
            pg.goto(WEB + f'/studio/dubbing/{TID}'); pg.wait_for_selector('.db-segs', timeout=25000); pg.wait_for_timeout(500)
            ok(ov(pg) <= 1, f'[{lang} {w}] fiche sans débordement')
            pg.screenshot(path=str(OUT / f'd1a-fiche-{lang}-{w}.png'))
            ctx.close()
        b.close()
finally:
    if svc: svc.terminate(); svc.wait(timeout=20)
    requests.put(API + '/admin/modules/dubbing', headers=H, json={'settings': {'mod_dubbing_queue_mode': 'night', 'mod_dubbing_night_start': '1', 'mod_dubbing_night_end': '7', 'mod_dubbing_require_review': 'true'}})
    cur.execute('delete from talks where id=%s', (TID,))
print('\n' + ('TOUT EST OK' if not bad else f'{len(bad)} ÉCHEC(S)'))
sys.exit(1 if bad else 0)
