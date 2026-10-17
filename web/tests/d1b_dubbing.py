#!/usr/bin/env python3
"""Étape D1b : relecture du texte français avant doublage, marquage « voix d'origine » depuis l'écran,
glossaire de prononciation commun, contrôle qualité des phrases « à revoir ».
Vérifie dans le navigateur : « Lancer le doublage » grisé tant que la relecture n'est pas validée, case « Voix d'origine »,
correction d'un texte (relecture « à refaire »), « Accepter tel quel » après une écoute, colonne Prononciation,
onglet Glossaire (ajout, essai, désactivation, suppression), FR + AR, 390 / 1440 px, sans débordement.
Prérequis : API (3055) + module dubbing 0.4.0, PG (5544), S3 de test (5599), site (3001), Python 3.11 avec numpy/psycopg2/boto3 (DUB_PY).
Lancement (depuis web/) : DUB_PY=/chemin/python3.11 python3 tests/d1b_dubbing.py [dossier]"""
import os, pathlib, subprocess, sys, tempfile, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
WEB, API, S3 = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055', 'http://127.0.0.1:5599'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-d1b'); OUT.mkdir(parents=True, exist_ok=True)
PY = os.environ.get('DUB_PY', sys.executable)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
bad = []; tag = uuid.uuid4().hex[:6]; TERM = f'Outhaymine{tag}'
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
adm = requests.post(API + '/auth/login', json={'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'}).json()['token']
H = {'authorization': 'Bearer ' + adm}
requests.put(API + '/admin/modules/dubbing', headers=H, json={'enabled': True, 'settings': {'mod_dubbing_queue_mode': 'always', 'mod_dubbing_require_review': 'true'}})
cur.execute("delete from dub_engine"); cur.execute("update dub_jobs set status='cancelled' where status in ('queued','running')")
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
s3 = boto3.client('s3', endpoint_url=S3, aws_access_key_id='test', aws_secret_access_key='test', region_name='garage')
with tempfile.TemporaryDirectory() as d:
    src = os.path.join(d, 'v.mp4'); subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=30', '-c:a', 'aac', src], check=True)
    key = f'videos/d1b-{tag}.mp4'; s3.upload_file(src, 'majlis-videos', key)
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
               values (%s,'d','Cheikh','upload',%s,%s,'published','ready','free',30,'ar','ar') returning id""", (f'Doublage D1b {tag}', key, aid)); TID = str(cur.fetchone()[0])
lines = ['Bismillah ar-rahman ar-rahim', f"Que nous éclaire l'Imam {TERM}.", 'Une phrase beaucoup trop longue pour son tout petit créneau de temps disponible.', 'La récompense est immense.']
for i, txt in enumerate(lines):
    cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (TID, i, i * 4000, i * 4000 + (900 if i == 2 else 3500), txt))
work = tempfile.mkdtemp()
envs = dict(os.environ, DATABASE_URL='postgres://majlis:pw@127.0.0.1:5544/majlis', S3_ENDPOINT=S3, S3_ACCESS_KEY='test', S3_SECRET_KEY='test', S3_REGION='garage',
            DUB_ENGINE='fake', POLL_SECONDS='1', WORK_DIR=work, PORT='3073', SETTINGS_KEY='a' * 64)
svc = None
def until(fn, timeout=30):
    t = time.time()
    while time.time() - t < timeout:
        if fn(): return True
        time.sleep(0.5)
    return False
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
LAUNCH = '.db-head-actions .btn:not(.ghost)'
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        def page(w, hh, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{adm}')")
            return ctx, ctx.new_page()
        ctx, pg = page(1440, 1000)
        # --- glossaire (onglet du Studio)
        pg.goto(WEB + '/studio/dubbing#glossary'); pg.wait_for_selector('.db-glossary', timeout=25000)
        f = pg.locator('.db-gl-form').first
        f.locator('input').nth(0).fill(TERM); f.locator('input').nth(1).fill('Outhaïmine'); f.locator('button[type=submit]').click()
        ok(until(lambda: pg.locator('.db-gl-list li', has_text=TERM).count() == 1, 10), 'glossaire : terme ajouté')
        f.locator('input').nth(0).fill(TERM.upper()); f.locator('input').nth(1).fill('x'); f.locator('button[type=submit]').click()
        ok(until(lambda: pg.locator('.db-gl-form .error').count() == 1, 10), 'glossaire : doublon signalé')
        f.locator('input').nth(0).fill(''); f.locator('input').nth(1).fill('')
        pg.locator('.db-glossary textarea').fill(f"L'Imam {TERM} a dit")
        ok(until(lambda: pg.locator('.db-gl-preview p').count() == 1 and 'Outhaïmine a dit' in pg.locator('.db-gl-preview p').inner_text(), 10), 'essai : « la voix lira » avec la prononciation')
        ok(ov(pg) <= 1, 'glossaire sans débordement')
        pg.locator('.db-glossary').screenshot(path=str(OUT / 'd1b-glossaire-fr.png'))
        # --- fiche : relecture obligatoire
        pg.goto(WEB + f'/studio/dubbing/{TID}'); pg.wait_for_selector('.db-segs', timeout=25000)
        ok(pg.locator(LAUNCH).is_disabled() and pg.locator('.db-note').count() == 1, '« Lancer le doublage » grisé tant que la relecture n\'est pas validée')
        ok(pg.locator('.db-say', has_text='Outhaïmine').count() == 1, 'colonne Prononciation : remplacement du glossaire')
        ok('(1' in pg.locator('.db-row', has_text='Glossaire').inner_text() or pg.locator('.db-row a[href="/studio/dubbing#glossary"]').count() == 1, 'ligne Glossaire : lien vers l\'onglet')
        row0 = pg.locator('.db-segs tbody tr').nth(0)
        row0.locator('.db-keep input').click()
        ok(until(lambda: pg.locator('.db-segs tbody tr.kept').count() == 1, 10), 'case « Voix d\'origine » : phrase gardée en voix d\'origine')
        ok(pg.locator('.db-segs .pill', has_text='(1)').count() >= 1, 'filtre « Voix d\'origine (1) »')
        pg.locator('.db-review .btn').click()
        ok(until(lambda: pg.locator('.db-review .db-tag.ok').count() == 1, 10) and not pg.locator(LAUNCH).is_disabled(), 'relecture validée : qui et quand, bouton dégrisé')
        # correction d'un texte → relecture à refaire
        r3 = pg.locator('.db-segs tbody tr').nth(3)
        r3.locator('.db-link').click(); r3.locator('textarea').fill('La récompense est très grande.'); r3.locator('.db-edit .btn:not(.ghost)').click()
        ok(until(lambda: 'très grande' in pg.locator('.db-segs tbody tr').nth(3).inner_text(), 10), 'texte corrigé depuis le tableau')
        ok(until(lambda: pg.locator('.db-review .db-tag.warn').count() == 1, 10) and pg.locator(LAUNCH).is_disabled(), 'relecture « à refaire » : bouton grisé de nouveau')
        cur.execute("select text from transcript_segments where talk_id=%s and idx=3 and lang='fr'", (TID,)); ok(cur.fetchone()[0] == 'La récompense est très grande.', 'sous-titres français corrigés')
        pg.locator('.db-review .btn').click(); until(lambda: pg.locator('.db-review .db-tag.ok').count() == 1, 10)
        # écoute de 60 s (service factice) : contrôle qualité
        svc = subprocess.Popen([PY, os.path.join(os.path.dirname(__file__), '..', '..', 'dubbing', 'src', 'main.py')], env=envs, stdout=open(os.path.join(work, 'svc.log'), 'w'), stderr=subprocess.STDOUT)
        pg.locator('.db-head-actions .btn.ghost').click()
        ok(until(lambda: pg.locator('.db-listen .btn').count() >= 1, 60), 'écoute de 60 s prête')
        ok(pg.locator('.db-segs .db-st.review').count() == 1, 'une phrase « à revoir »')
        pg.locator('.db-segs .pill').nth(2).click()
        ok(pg.locator('.db-segs tbody tr').count() == 1, 'filtre « À revoir (1) »')
        pg.locator('.db-segs tbody tr .db-st + .db-link').click()
        ok(until(lambda: pg.locator('.db-segs tbody tr').count() == 0, 10) and pg.locator('.db-segs .pill', has_text='(0)').count() >= 1, '« Accepter tel quel » : la phrase sort des « à revoir »')
        pg.locator('.db-segs .pill').nth(0).click()
        ok(pg.locator('.db-segs .db-st.accepted').count() == 1, 'état « Accepté tel quel » affiché')
        ok(pg.locator('.db-review .db-tag.ok').count() == 1, 'accepter ne remet pas en cause la relecture')
        pg.locator('.db-segs').screenshot(path=str(OUT / 'd1b-segments-fr.png'))
        ctx.close()
        cur.execute("select result from dub_jobs where talk_id=%s and kind='preview' and status='done'", (TID,)); res = cur.fetchone()[0]
        st = {s['idx']: s['state'] for s in res['segments']}
        ok(st.get(0) in (None, 'kept') and st.get(1) in ('fit', 'sped', 'review'), 'service : la phrase cochée n\'est pas lue par la voix (l\'écoute commence à la première phrase à doubler)')
        for lang, w, hh in (('fr', 1440, 900), ('ar', 1440, 900), ('ar', 390, 844), ('fr', 390, 844)):
            ctx, pg = page(w, hh, lang)
            pg.goto(WEB + '/studio/dubbing'); pg.wait_for_selector('.db-table', timeout=25000); pg.wait_for_timeout(500)
            row = pg.locator('.db-table tr', has_text=f'Doublage D1b {tag}')
            ok(row.locator('.db-tag.ok').count() >= 1, f'[{lang} {w}] liste : conférence « relue »')
            ok(ov(pg) <= 1, f'[{lang} {w}] liste sans débordement')
            pg.goto(WEB + '/studio/dubbing#glossary'); pg.wait_for_selector('.db-gl-list', timeout=25000); pg.wait_for_timeout(300)
            ok(ov(pg) <= 1, f'[{lang} {w}] glossaire sans débordement')
            pg.screenshot(path=str(OUT / f'd1b-glossaire-{lang}-{w}.png'))
            pg.goto(WEB + f'/studio/dubbing/{TID}'); pg.wait_for_selector('.db-segs', timeout=25000); pg.wait_for_timeout(500)
            ok(ov(pg) <= 1, f'[{lang} {w}] fiche sans débordement')
            if lang == 'ar': ok(pg.evaluate('document.documentElement.dir') == 'rtl', f'[{lang} {w}] sens de lecture de droite à gauche')
            pg.screenshot(path=str(OUT / f'd1b-fiche-{lang}-{w}.png'), full_page=True)
            ctx.close()
        # désactiver puis supprimer le terme
        ctx, pg = page(1440, 900)
        pg.goto(WEB + '/studio/dubbing#glossary'); pg.wait_for_selector('.db-gl-list', timeout=25000)
        li = pg.locator('.db-gl-list li', has_text=TERM)
        li.locator('.btn').nth(1).click(); ok(until(lambda: 'inactive' in (li.get_attribute('class') or ''), 10), 'terme désactivé')
        pg.on('dialog', lambda dlg: dlg.accept())
        li.locator('.btn').nth(2).click(); ok(until(lambda: pg.locator('.db-gl-list li', has_text=TERM).count() == 0, 10), 'terme supprimé')
        ctx.close()
        b.close()
finally:
    if svc: svc.terminate(); svc.wait(timeout=20)
    requests.put(API + '/admin/modules/dubbing', headers=H, json={'settings': {'mod_dubbing_queue_mode': 'night'}})
    cur.execute('delete from talks where id=%s', (TID,)); cur.execute('delete from dub_glossary where term=%s', (TERM,))
print('\n' + ('TOUT EST OK' if not bad else f'{len(bad)} ÉCHEC(S)'))
sys.exit(1 if bad else 0)
