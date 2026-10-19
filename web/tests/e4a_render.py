#!/usr/bin/env python3
"""Étape E4a : « Rendre la vidéo » dans l'éditeur de montage, dans le navigateur.
Vérifie : bouton actif ; fenêtre (aperçu rapide / rendu final, durées estimées) ; demande → « En attente · n° 1 » ; Studio → Activité ;
calcul par le worker (même code que le service) → progression puis « Prêt » sans recharger ; regarder (lecteur), télécharger (lien),
effacer ; annuler un rendu en attente ; tâches lourdes en pause (avertissement) ; lecture seule (l'administrateur rend le montage
enregistré pendant qu'un organisateur le modifie) ; « Le montage a changé depuis ce rendu » ; Échap ; FR + AR (RTL) ; 1440 / 1024 px.
Prérequis : API (3055), PG (5544), S3 de test (5599), site (3001), FFmpeg, dépendances du worker (npm ci dans worker/).
Le Chromium de test ne lit pas le H.264 : on vérifie le lecteur et son lien, pas la lecture.
Lancement (depuis web/) : python3 tests/e4a_render.py [dossier des captures]"""
import json, os, pathlib, subprocess, sys, tempfile, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-e4a'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:5599', aws_access_key_id='test', aws_secret_access_key='test', region_name='garage')
bad = []; tag = uuid.uuid4().hex[:6]; talks = []; users = []; keys = []
WENV = {**os.environ, 'DATABASE_URL': 'postgres://majlis:pw@127.0.0.1:5544/majlis', 'S3_ENDPOINT': 'http://127.0.0.1:5599', 'S3_ACCESS_KEY': 'test',
        'S3_SECRET_KEY': 'test', 'S3_REGION': 'garage', 'S3_BUCKET': 'majlis-videos', 'WORK_DIR': tempfile.mkdtemp(prefix='e4w-'), 'FFMPEG_THREADS': '2'}
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def login(e, pw):
    r = requests.post(API + '/auth/login', json={'email': e, 'password': pw})
    if r.status_code == 429: time.sleep(62); r = requests.post(API + '/auth/login', json={'email': e, 'password': pw})
    return r.json()['token']
def worker_once():
    p = subprocess.run(['node', str(ROOT / 'worker' / 'tests' / 'run_render_once.mjs')], env=WENV, capture_output=True, text=True, timeout=600)
    try: return json.loads(p.stdout.strip().splitlines()[-1])
    except Exception: print(p.stdout, p.stderr); return {}
def until(fn, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.3)
    return False
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')

adm = login('admin@test.local', 'AdminPassw0rd-test'); H = {'authorization': 'Bearer ' + adm}
for m in ('editor', 'dubbing'): requests.put(API + f'/admin/modules/{m}', headers=H, json={'enabled': True})
em = f'e4w-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': f'Orga {tag}'})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
org = login(em, 'Passw0rd-test'); HO = {'authorization': 'Bearer ' + org}
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
               values (%s,'d','Cheikh Test','upload',%s,%s,'published','ready','free',30,'ar','ar','ready') returning id""", (f'La patience {tag}', f'talks/{tag}-orig', oid))
T1 = str(cur.fetchone()[0]); talks.append(T1)
make_hls(s3, T1, 30, codec='vp9'); add_transcript(cur, T1, 30)
d = tempfile.mkdtemp(prefix='e4web-')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=30', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=30',
                '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', os.path.join(d, 'o.mp4')], check=True)
s3.upload_file(os.path.join(d, 'o.mp4'), 'majlis-videos', f'talks/{tag}-orig'); keys.append(f'talks/{tag}-orig')

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        def page(tok, w=1440, hh=1000, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')")
            pg = ctx.new_page(); pg.on('dialog', lambda dl: dl.accept())
            return ctx, pg
        pid = requests.post(API + '/studio/editor/projects', headers=HO, json={'talkId': T1}).json()['id']
        ctx, pg = page(org)
        pg.goto(WEB + f'/studio/editor/{pid}'); pg.wait_for_selector('.mt-editor .mt-clip', timeout=25000)
        ok(until(lambda: 'enregistré' in pg.locator('.mt-titles').inner_text().lower() or pg.locator('.mt-readonly').count() == 0, 10), 'éditeur ouvert')
        btn = pg.locator('button[data-act=render]')
        ok(btn.is_enabled() and btn.inner_text() == 'Rendre la vidéo', 'bouton « Rendre la vidéo » actif')
        # Une coupe (le montage change) : le rendu prend le montage ENREGISTRÉ (sauvegarde avant l'ouverture).
        pg.locator('.mt-row-subs .mt-head').click(); pg.keyboard.press('Shift+ArrowRight'); pg.wait_for_timeout(150); pg.keyboard.press('c'); pg.wait_for_timeout(150)
        pg.keyboard.press('Delete'); pg.wait_for_timeout(300)
        btn.click(); pg.wait_for_selector('.mt-render-box')
        box = pg.locator('.mt-render-box')
        ok(box.locator('.mt-render-kind').count() == 2 and box.locator('.mt-render-kind.on[data-kind=preview]').count() == 1, 'deux choix ; aperçu rapide par défaut')
        ok('0:10' in box.locator('[data-kind=preview]').inner_text() and 'min' not in box.locator('[data-kind=preview]').inner_text(), f"durée du montage et estimation : {box.locator('[data-kind=preview]').inner_text()!r}")
        ok('Aucun rendu' in box.inner_text(), 'pas encore de rendu')
        cur.execute('select rev from editor_projects where id=%s', (pid,)); rev_saved = cur.fetchone()[0]
        box.locator('button[data-act=render-start]').click()
        ok(until(lambda: box.locator('.mt-render-row').count() == 1, 10), 'demande envoyée : une ligne')
        row = box.locator('.mt-render-row').first
        ok('En attente · n° 1' in row.inner_text() and 'Aperçu rapide demandé' in box.inner_text(), f"en attente, 1er dans la file : {row.locator('.mt-render-st').inner_text()!r}")
        cur.execute('select rev, timeline from editor_renders where project_id=%s', (pid,)); rr = cur.fetchone()
        ok(rr[0] == rev_saved and len(rr[1]['clips']) == 1 and abs(rr[1]['clips'][0]['out'] - rr[1]['clips'][0]['in'] - 10) < 0.01, f"le rendu prend le montage enregistré (avec la coupe) : {rr[1]['clips']}")
        ok(box.locator('button[data-act=render-start]').is_disabled() and 'Un rendu à la fois' in box.inner_text(), 'un rendu à la fois : bouton grisé')
        pg.screenshot(path=str(OUT / 'e4a-attente-fr-1440.png'))
        # Studio → Activité (autre onglet).
        a2 = ctx.new_page(); a2.goto(WEB + '/studio/activity')
        ok(until(lambda: 'aperçu du montage' in a2.locator('main').inner_text().lower(), 20), 'Studio → Activité : « Aperçu du montage » en attente')
        if bad and 'Activité' in bad[-1]: print(a2.locator('body').inner_text()[:1500]); a2.screenshot(path='/tmp/e4a-act.png')
        a2.close()

        # Calcul (le worker prend le rendu) : la fenêtre passe à « Prêt » toute seule.
        w = worker_once(); ok(w.get('ok'), f'le worker calcule ({w})')
        ok(until(lambda: row.get_attribute('data-status') == 'ready', 15), 'la ligne passe à « Prêt » sans recharger')
        ok('640×360' in row.inner_text() and 'Mo' in row.inner_text() and 'calculé en' in row.inner_text(), f"taille, poids, temps : {row.locator('.mt-render-what small').inner_text()!r}")
        href = row.locator('a[data-act=render-download]').get_attribute('href')
        hd = requests.get(href, stream=True, timeout=30); ok(hd.ok and 'attachment' in hd.headers.get('content-disposition', ''), 'lien « Télécharger » : fichier proposé au téléchargement'); hd.close()
        row.locator('button[data-act=render-watch]').click()
        ok(until(lambda: row.locator('video.mt-render-video').count() == 1, 5) and 'editor/renders' in row.locator('video').get_attribute('src'), 'regarder : lecteur sur le fichier rendu')
        ok(box.locator('button[data-act=render-start]').is_enabled(), 'nouveau rendu possible')
        pg.screenshot(path=str(OUT / 'e4a-pret-fr-1440.png'))

        # Rendu final demandé puis annulé en attente.
        box.locator('.mt-render-kind[data-kind=final]').click()
        ok('1080p' in box.locator('[data-kind=final]').inner_text(), 'rendu final : qualité de la source jusqu’à 1080p')
        box.locator('button[data-act=render-start]').click()
        ok(until(lambda: box.locator('.mt-render-row').count() == 2, 10), 'rendu final en attente')
        box.locator('.mt-render-row').first.locator('button[data-act=render-cancel]').click()
        ok(until(lambda: box.locator('.mt-render-row').first.get_attribute('data-status') == 'canceled', 10) and 'Rendu annulé' in box.inner_text(), 'annulé')

        # Le montage change après le rendu : mention sur le rendu prêt.
        pg.keyboard.press('Escape'); ok(until(lambda: pg.locator('.mt-render-box').count() == 0, 5), 'Échap ferme la fenêtre')
        pg.locator('.mt-top-actions button', has_text='Annuler').click(); pg.wait_for_timeout(1800)
        btn.click(); pg.wait_for_selector('.mt-render-box'); box = pg.locator('.mt-render-box')
        ready = box.locator('.mt-render-row[data-status=ready]')
        ok(until(lambda: 'Le montage a changé depuis ce rendu' in ready.inner_text(), 10), 'rendu dépassé : « Le montage a changé depuis ce rendu »')

        # Tâches lourdes en pause : avertissement.
        requests.put(API + '/studio/activity/settings', headers=H, json={'pauseAll': True})
        pg.keyboard.press('Escape'); btn.click(); pg.wait_for_selector('.mt-render-box'); box = pg.locator('.mt-render-box')
        ok(until(lambda: 'tâches lourdes sont en pause' in box.inner_text(), 8), 'tâches lourdes en pause : avertissement')
        requests.put(API + '/studio/activity/settings', headers=H, json={'pauseAll': False})

        # Effacer le rendu prêt.
        ready.locator('button[data-act=render-delete]').click()
        ok(until(lambda: box.locator('.mt-render-row[data-status=ready]').count() == 0 and 'Rendu effacé' in box.inner_text(), 10), 'rendu effacé')
        pg.keyboard.press('Escape')

        # Lecture seule : l'administrateur ouvre le projet tenu par l'organisateur et rend le montage enregistré.
        actx, apg = page(adm)
        apg.goto(WEB + f'/studio/editor/{pid}'); apg.wait_for_selector('.mt-readonly', timeout=25000)
        apg.locator('button[data-act=render]').click(); apg.wait_for_selector('.mt-render-box')
        apg.locator('.mt-render-box button[data-act=render-start]').click()
        ok(until(lambda: apg.locator('.mt-render-box .mt-render-row[data-status=queued]').count() == 1, 10), 'lecture seule : rendu du montage enregistré demandé')
        apg.locator('.mt-render-box .mt-render-row[data-status=queued] button[data-act=render-cancel]').click(); apg.wait_for_timeout(500)
        actx.close()

        # Arabe (RTL) et 1024 px.
        ctx2, pg2 = page(org, lang='ar'); pg2.goto(WEB + f'/studio/editor/{pid}'); pg2.wait_for_selector('.mt-editor .mt-clip', timeout=25000); pg2.wait_for_timeout(800)
        pg2.locator('button[data-act=render]').click(); pg2.wait_for_selector('.mt-render-box')
        ok(pg2.evaluate('document.documentElement.dir') == 'rtl' and 'إخراج الفيديو' in pg2.locator('.mt-render-box').inner_text() and ov(pg2) <= 1, 'arabe : fenêtre traduite, de droite à gauche, sans débordement')
        pg2.screenshot(path=str(OUT / 'e4a-fenetre-ar-1440.png')); ctx2.close()
        pg.set_viewport_size({'width': 1024, 'height': 760}); btn.click(); pg.wait_for_selector('.mt-render-box'); pg.wait_for_timeout(300)
        ok(ov(pg) <= 1 and pg.evaluate("document.querySelector('.mt-render-box').getBoundingClientRect().right") <= 1024, '1024 px : sans débordement')
        pg.screenshot(path=str(OUT / 'e4a-fenetre-fr-1024.png'))
        ctx.close(); b.close()
finally:
    requests.put(API + '/studio/activity/settings', headers=H, json={'pauseAll': False})
    for t in talks:
        cur.execute("delete from activity_controls where queue='render' and ref in (select id::text from editor_renders where talk_id=%s)", (t,))
        cur.execute("select project_id, output_key from editor_renders where talk_id=%s and output_key is not null", (t,))
        for _, k in cur.fetchall():
            try: s3.delete_object(Bucket='majlis-videos', Key=k)
            except Exception: pass
        cur.execute('delete from talks where id=%s', (t,))
    for u in users: cur.execute('delete from users where id=%s', (u,))
    for k in keys:
        try: s3.delete_object(Bucket='majlis-videos', Key=k)
        except Exception: pass

print(f'\nÉCHECS : {len(bad)} — captures dans {OUT}' if bad else f'\nTout est bon — captures dans {OUT}')
sys.exit(1 if bad else 0)
