#!/usr/bin/env python3
"""Étape E5d : page « Extraits 9:16 » — le cadre suit le visage et corrections à la main, dans le navigateur.
Vérifie : panneaux « suit le visage » et « corrections », cocher le suivi lance l'analyse (demande en base), avancement affiché (en attente, 40 %),
analyse terminée (cadre qui se déplace avec la vidéo), glisser le cadre = correction de 3 s, modifier / ajouter / supprimer une correction,
analyse périmée si le passage change, échec avec message, éteindre le suivi, AR (RTL), 390 px sans débordement.
Prérequis : API (3055) redémarrée après la migration 059, PG (5544), S3 de test (5599), site (3001) recompilé (npx next build).
Lancement (depuis web/) : python3 tests/e5d_follow.py [dossier des captures]"""
import json, pathlib, sys, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-e5d'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:5599', aws_access_key_id='test', aws_secret_access_key='test', region_name='garage')
bad = []; tag = uuid.uuid4().hex[:6]; talks = []; users = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def login(e, pw):
    for _ in range(3):
        r = requests.post(API + '/auth/login', json={'email': e, 'password': pw})
        if r.status_code != 429: return r.json()['token']
        time.sleep(62)
adm = login('admin@test.local', 'AdminPassw0rd-test'); H = {'authorization': 'Bearer ' + adm}
requests.put(API + '/admin/modules/editor', headers=H, json={'enabled': True})
em = f'e5d-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': f'Orga {tag}'})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
org = login(em, 'Passw0rd-test')
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
               values (%s,'d','Cheikh Test','upload',%s,%s,'published','ready','free',60,'fr','fr','ready') returning id""", (f'Suivi {tag}', f'talks/{tag}', oid))
T = str(cur.fetchone()[0]); talks.append(T)
make_hls(s3, T, 60, codec='vp9'); add_transcript(cur, T, 60)

def until(fn, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if fn(): return True
        except Exception: pass
        time.sleep(0.3)
    return False
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
def sh():
    cur.execute("select id, short, timeline from editor_projects where talk_id=%s and kind='short' order by created_at", (T,)); return cur.fetchall()
def job(): cur.execute("select status, progress, from_s::float, to_s::float, error from face_track_jobs where project_id=%s", (sh()[0][0],)); return cur.fetchone()
def seek(pg, s): pg.evaluate(f"document.querySelector('.mts-src').currentTime = {s}")
def crop(pg): return float(pg.locator('.mts-frame').get_attribute('data-crop'))

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        def page(tok, w=1440, hh=1000, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')")
            pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
            return ctx, pg
        pid = requests.post(API + '/studio/editor/projects', headers={'authorization': 'Bearer ' + org}, json={'talkId': T}).json()['id']
        ctx, pg = page(org)
        pg.goto(f'{WEB}/studio/editor/{pid}/shorts'); pg.wait_for_selector('.mts', timeout=25000)
        pg.locator('[data-act="short-new"]').click(); pg.wait_for_selector('.mts-tab', timeout=15000); pg.wait_for_selector('.mts-frame')
        until(lambda: pg.evaluate("document.querySelector('.mts-src')?.videoWidth") > 0, 30)
        sid = sh()[0][0]
        ok(pg.locator('[data-follow-panel]').count() == 1 and pg.locator('[data-manual-panel]').count() == 1, 'panneaux « Le cadre suit le visage » et « Corrections à la main » présents')
        ok(not pg.locator('[data-f="follow"]').is_checked() and pg.locator('[data-track]').count() == 0 and pg.locator('[data-manual-empty]').count() == 1, 'extrait neuf : suivi éteint, aucune correction')
        ok('Glissez le cadre doré' in pg.locator('.mts-video .meta.small').first.inner_text(), 'aide du cadre fixe affichée')

        # --- cocher le suivi : l'analyse est demandée
        pg.locator('[data-f="follow"]').check()
        ok(until(lambda: sh()[0][1].get('follow') is True and job() is not None and job()[0] == 'pending', 15), 'suivi coché : enregistré et analyse demandée en base')
        ok(job()[2] == 0.0 and job()[3] == 30.0, 'analyse demandée sur le passage 0 → 30 s')
        ok(until(lambda: pg.locator('[data-track="pending"]').count() == 1, 8), f"état affiché : « {pg.locator('[data-track]').inner_text().strip()} »")
        ok('Glissez' not in pg.locator('.mts-video .meta.small').first.inner_text() and 'corriger' in pg.locator('.mts-video .meta.small').first.inner_text().lower(), 'aide du cadre : mode suivi (corrections)')
        cur.execute("update face_track_jobs set status='processing', progress=40 where project_id=%s", (sid,))
        ok(until(lambda: '40' in pg.locator('[data-track]').inner_text(), 12), f"avancement relu tout seul : « {pg.locator('[data-track]').inner_text().strip()} »")
        # --- analyse terminée : le cadre se déplace avec la vidéo
        cur.execute("update face_track_jobs set status='done', progress=100, keys=%s, coverage=0.9, faces=1, samples=90 where project_id=%s", (json.dumps([{"t": 0, "x": 0}, {"t": 30, "x": 100}]), sid))
        ok(until(lambda: pg.locator('[data-track="done"]').count() == 1, 12) and '90' in pg.locator('[data-track]').inner_text(), f"analyse terminée : « {pg.locator('[data-track]').inner_text().strip()} »")
        seek(pg, 1); ok(until(lambda: crop(pg) < 10, 8), f'à 1 s : cadre à gauche ({crop(pg):.0f} %)')
        seek(pg, 15); ok(until(lambda: 40 < crop(pg) < 60, 8), f'à 15 s : cadre au milieu ({crop(pg):.0f} %)')
        seek(pg, 29); ok(until(lambda: crop(pg) > 90, 8), f'à 29 s : cadre à droite ({crop(pg):.0f} %)')
        fb = pg.locator('.mts-frame').bounding_box(); sb = pg.locator('.mts-stage').bounding_box()
        ok(fb['x'] + fb['width'] > sb['x'] + sb['width'] - 0.12 * sb['width'], 'le cadre doré est à droite sur l’image')
        pix = pg.evaluate("(() => { const c = document.querySelector('.mts-screen canvas'); const d = c.getContext('2d').getImageData(135, 240, 1, 1).data; return [d[0], d[1], d[2], d[3]]; })()")
        ok(pix[3] == 255, f'aperçu vertical dessiné ({pix})')
        pg.screenshot(path=str(OUT / 'e5d-suivi-1440.png'))

        # --- glisser le cadre = correction de 3 s à l'instant courant
        seek(pg, 10); until(lambda: crop(pg) < 50, 8)
        pg.evaluate('window.scrollTo(0, 0)'); pg.wait_for_timeout(300)
        fb = pg.locator('.mts-frame').bounding_box(); sb = pg.locator('.mts-stage').bounding_box()
        pg.mouse.move(fb['x'] + fb['width'] / 2, fb['y'] + fb['height'] / 2); pg.mouse.down()
        pg.mouse.move(sb['x'] + sb['width'] - 2, fb['y'] + fb['height'] / 2, steps=8); pg.mouse.up()
        ok(until(lambda: len(sh()[0][1].get('manual', [])) == 1, 10), 'glisser le cadre : une correction est enregistrée')
        m = sh()[0][1]['manual'][0]
        ok(abs(m['from'] - 10) < 0.6 and abs(m['to'] - m['from'] - 3) < 0.15 and m['x'] > 95, f"correction à 10 s, 3 s, cadre à droite ({m})")
        ok(until(lambda: pg.locator('[data-manual]').count() == 1, 8), 'la correction apparaît dans la liste')
        ok(sh()[0][1]['cropX'] == 50, 'le cadre fixe de base n’a pas bougé (cropX reste 50)')
        seek(pg, m['from'] + 1.5); ok(until(lambda: crop(pg) > 95, 8), f"pendant la correction : cadre à droite ({crop(pg):.0f} %)")
        seek(pg, 20); ok(until(lambda: 55 < crop(pg) < 80, 8), f"après la correction : on reprend la trajectoire ({crop(pg):.0f} %)")
        # --- modifier la position, ajouter, supprimer
        pg.locator('[data-manual="0"] [data-m="x"]').fill('20')
        ok(until(lambda: sh()[0][1]['manual'][0]['x'] == 20, 10), 'position de la correction modifiée (20 %) et enregistrée')
        seek(pg, 22); pg.locator('[data-act="manual-add"]').click()
        ok(until(lambda: len(sh()[0][1]['manual']) == 2, 10) and abs(sh()[0][1]['manual'][1]['from'] - 22) < 0.7, 'bouton « Ajouter une correction ici » : deuxième correction à 22 s')
        seek(pg, 22.5); pg.locator('[data-act="manual-add"]').click()
        ok(until(lambda: pg.locator('.error').count() == 1, 6) and len(sh()[0][1]['manual']) == 2, 'ajout dans une correction existante : refusé avec un message, rien de changé')
        pg.locator('[data-manual="0"] [data-act="manual-del"]').click()
        ok(until(lambda: len(sh()[0][1]['manual']) == 1 and pg.locator('[data-manual]').count() == 1, 10), 'correction supprimée')
        pg.locator('[data-manual="0"] [data-m="to"]').fill('1')
        ok(until(lambda: pg.locator('.error').count() == 1, 8), 'temps incohérent : message d’erreur du serveur')
        pg.reload(); pg.wait_for_selector('.mts-frame', timeout=25000)
        ok(until(lambda: pg.locator('[data-manual]').count() == 1, 10) and pg.locator('[data-f="follow"]').is_checked(), 'après rechargement : suivi coché et correction toujours là')

        # --- passage changé : analyse périmée
        pg.locator('[data-f="to"]').fill('25')
        ok(until(lambda: '25' in str(sh()[0][2]['clips'][0]['out']) and pg.locator('[data-track="done"]').count() == 1 and 'refaire' in pg.locator('[data-track]').inner_text().lower(), 12), f"passage raccourci : « {pg.locator('[data-track]').inner_text().strip()} »")
        pg.locator('[data-act="track-start"]').click()
        ok(until(lambda: job()[0] == 'pending' and job()[3] == 25.0, 10), 'refaire l’analyse : nouvelle demande sur 0 → 25 s')
        cur.execute("update face_track_jobs set status='failed', error='Aucun visage repéré dans ce passage : le cadre reste fixe.' where project_id=%s", (sid,))
        ok(until(lambda: pg.locator('[data-track="failed"]').count() == 1 and 'Aucun visage' in pg.locator('[data-track]').inner_text(), 12), 'échec : message clair affiché')
        # --- éteindre le suivi
        pg.locator('[data-f="follow"]').uncheck()
        ok(until(lambda: sh()[0][1]['follow'] is False and pg.locator('[data-track]').count() == 0, 10), 'suivi éteint : enregistré, état masqué')
        ok(len(sh()[0][1]['manual']) == 1, 'les corrections sont gardées')
        pg.screenshot(path=str(OUT / 'e5d-corrections-1440.png'))
        ok(ov(pg) <= 1, 'sans débordement à 1440 px')
        ctx.close()
        # --- arabe (RTL) et téléphone
        for lang, w in (('ar', 1440), ('fr', 390), ('ar', 390)):
            c2, p2 = page(org, w=w, lang=lang)
            p2.goto(f'{WEB}/studio/editor/{pid}/shorts?s={sid}'); p2.wait_for_selector('.mts-frame', timeout=25000); p2.wait_for_selector('[data-follow-panel]')
            ok(ov(p2) <= 1, f'[{lang} {w} px] sans débordement horizontal')
            if lang == 'ar': ok(p2.evaluate('document.documentElement.dir') == 'rtl' and 'الإطار يتبع الوجه' in p2.locator('[data-follow-panel]').inner_text(), f'[{lang} {w}] RTL et textes arabes')
            p2.locator('[data-manual-panel]').scroll_into_view_if_needed(); p2.screenshot(path=str(OUT / f'e5d-{lang}-{w}.png'))
            c2.close()
        b.close()
finally:
    for t in talks:
        cur.execute("delete from face_track_jobs where talk_id=%s", (t,)); cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
print('\n' + ('Tout est bon' if not bad else f'{len(bad)} échec(s)'))
sys.exit(1 if bad else 0)
