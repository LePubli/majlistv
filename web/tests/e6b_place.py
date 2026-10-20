"""Étape E6b : placer les éléments directement sur la vidéo de l'éditeur.
Vérifie : glisser un titre à la souris (position enregistrée en % de l'image), repères dorés et aimant au centre, zone de sécurité
pendant le glissé, flèches du clavier (Maj = 5 %), panneau « Position libre » et retour à la position prédéfinie, annuler (Ctrl+Z),
logo et sous-titres incrustés glissés, position gardée après rechargement, arabe (RTL), 1024 px.
Prérequis : API (3055, CORS_ORIGIN=http://localhost:3001), PG (5544), S3 de test (5599), site (3001), FFmpeg.
Lancement (depuis web/) : python3 tests/e6b_place.py [dossier des captures]"""
import json, os, pathlib, sys, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-e6b'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:5599', aws_access_key_id='test', aws_secret_access_key='test', region_name='garage')
bad = []; tag = uuid.uuid4().hex[:6]; talks = []; users = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def login(e, pw): return requests.post(API + '/auth/login', json={'email': e, 'password': pw}).json()['token']
adm = login('admin@test.local', 'AdminPassw0rd-test'); H = {'authorization': 'Bearer ' + adm}
for m in ('editor', 'dubbing'): requests.put(API + f'/admin/modules/{m}', headers=H, json={'enabled': True})
em = f'e1w-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': f'Orga {tag}'})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
org = login(em, 'Passw0rd-test')
def talk(n, source='upload'):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
                   values (%s,'d','Cheikh Test',%s,%s,%s,'published','ready','free',120,'ar','ar','ready') returning id""",
                (f'{n} {tag}', source, f'talks/{tag}-{n}' if source == 'upload' else f'yt{tag}', oid))
    t = str(cur.fetchone()[0]); talks.append(t); return t
T1 = talk('La patience'); TY = talk('Sur YouTube', 'youtube')
make_hls(s3, T1, 120, codec='vp9'); add_transcript(cur, T1, 120)
cur.execute("insert into dub_segments(talk_id, idx, keep_original) values (%s, 2, true)", (T1,))
cur.execute("insert into dub_jobs(talk_id, kind, status, params, finished_at) values (%s,'full','done','{}', now()) returning id", (T1,)); jd = cur.fetchone()[0]
cur.execute("insert into dub_tracks(talk_id, job_id, voice_key, duration_s) values (%s,%s,'x',120)", (T1, jd))

def until(fn, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if fn(): return True
        except Exception: pass
        time.sleep(0.3)
    return False
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
def clips(pg): return pg.locator('.mt-row-video .mt-clip').count()
def labels(pg): return [pg.locator('.mt-row-video .mt-clip-body').nth(i).inner_text().strip() for i in range(clips(pg))]
def db_tl(pid):
    cur.execute('select timeline, rev from editor_projects where id=%s', (pid,)); r = cur.fetchone(); return r[0]['clips'], r[1]
def key(pg, k, n=1):
    for _ in range(n): pg.keyboard.press(k)



import io
from PIL import Image
def dress_db(pid):
    cur.execute("select timeline->'dress' from editor_projects where id=%s", (pid,)); return cur.fetchone()[0] or {}
def rect(pg, sel): return pg.locator(sel).bounding_box()
def drag_to(pg, sel, fx, fy, check=None):
    """Glisse l'élément de son centre jusqu'au point (fx, fy) en % de l'aperçu ; check() est appelé avant de lâcher."""
    e = rect(pg, sel); b = rect(pg, '.mt-dress')
    sx, sy = e['x'] + e['width'] / 2, e['y'] + e['height'] / 2
    tx, ty = b['x'] + b['width'] * fx / 100, b['y'] + b['height'] * fy / 100
    pg.mouse.move(sx, sy); pg.mouse.down()
    for i in range(1, 11): pg.mouse.move(sx + (tx - sx) * i / 10, sy + (ty - sy) * i / 10); pg.wait_for_timeout(15)
    res = check() if check else None
    pg.mouse.up(); pg.wait_for_timeout(150)
    return res
def center_pct(pg, sel):
    e = rect(pg, sel); b = rect(pg, '.mt-dress')
    return (e['x'] + e['width'] / 2 - b['x']) / b['width'] * 100, (e['y'] + e['height'] / 2 - b['y']) / b['height'] * 100
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        def page(tok, w=1440, hh=1000, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')")
            pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
            return ctx, pg
        # logo importé (carré rouge) pour le glisser
        bio = io.BytesIO(); Image.new('RGB', (200, 200), (255, 0, 0)).save(bio, 'PNG'); data = bio.getvalue()
        OH = {'authorization': 'Bearer ' + org}
        u = requests.post(API + '/studio/editor/logos/upload-url', headers=OH, json={'contentType': 'image/png', 'size': len(data)}).json()
        requests.put(u['url'], data=data, headers={'Content-Type': 'image/png'})
        logo = requests.post(API + '/studio/editor/logos', headers=OH, json={'key': u['key'], 'title': 'Rouge', 'contentType': 'image/png'}).json()['logo']
        ctx, pg = page(org)
        pg.goto(WEB + '/studio/editor'); pg.wait_for_selector('.mt-home .mt-item', timeout=25000)
        pg.locator('.mt-item', has_text=f'La patience {tag}').locator('button').click()
        until(lambda: '/studio/editor/' in pg.evaluate('location.href') and pg.locator('.mt-editor .mt-clip').count() == 1, 25)
        pid = pg.evaluate('location.href').rstrip('/').split('/')[-1]
        pg.wait_for_timeout(1500)
        cur.execute("select timeline from editor_projects where id=%s", (pid,)); tl0 = cur.fetchone()[0]
        tl0['dress'] = {**(tl0.get('dress') or {}), 'items': [{'id': 't1', 'kind': 'title', 'text': 'TITRE', 'sub': '', 'start': 0, 'len': 60},
                                                              {'id': 't2', 'kind': 'banner', 'text': 'Nom', 'sub': 'Rôle', 'start': 0, 'len': 60}],
                        'logo': {'on': True, 'asset': logo['id'], 'size': 12, 'opacity': 100, 'from': 0, 'to': None}, 'subs': {'burn': True}}
        cur.execute("update editor_projects set timeline=%s where id=%s", (json.dumps(tl0), pid))
        pg.reload(); pg.wait_for_selector('[data-drag="item:t1"]', timeout=25000); pg.wait_for_timeout(800)
        ok(pg.locator('[data-drag]').count() >= 4, f'titre, bandeau, logo et sous-titres déplaçables sur l\'aperçu ({pg.locator("[data-drag]").count()})')
        # --- glisser le titre
        seen = drag_to(pg, '[data-drag="item:t1"]', 25, 30, lambda: (pg.locator('.mt-safe').count(), pg.locator('.mt-dress .drag.moving').count()))
        ok(seen == (1, 1), 'pendant le glissé : zone de sécurité et élément en surbrillance')
        ok(until(lambda: abs((dress_db(pid).get('items') or [{}])[0].get('x') or 0) > 0, 20), 'position enregistrée (sauvegarde automatique)')
        it = dress_db(pid)['items'][0]
        ok(abs(it['x'] - 25) < 1.5 and abs(it['y'] - 30) < 1.5, f'titre posé à 25 % / 30 % : enregistré {it["x"]} / {it["y"]}')
        cx, cy = center_pct(pg, '[data-drag="item:t1"]')
        ok(abs(cx - 25) < 1.5 and abs(cy - 30) < 1.5, f'aperçu : titre dessiné à {cx:.1f} % / {cy:.1f} %')
        ok(pg.locator('[data-panel="item"] .mt-free[data-free="1"]').count() == 1, 'panneau : « Position libre » (le titre est sélectionné)')
        # --- aimant au centre
        guide = drag_to(pg, '[data-drag="item:t1"]', 50.9, 49.2, lambda: pg.locator('[data-guide="x50"]').count() + pg.locator('[data-guide="y50"]').count())
        ok(guide == 2, 'repères dorés au centre de l\'image pendant le glissé')
        ok(until(lambda: dress_db(pid)['items'][0]['x'] == 50 and dress_db(pid)['items'][0]['y'] == 50, 20), 'aimant : le titre se cale exactement au centre (50 / 50)')
        # --- clavier
        pg.locator('[data-drag="item:t1"]').focus(); pg.keyboard.press('Shift+ArrowRight'); pg.keyboard.press('ArrowUp')
        ok(until(lambda: abs(dress_db(pid)['items'][0]['x'] - 55) < 0.3 and abs(dress_db(pid)['items'][0]['y'] - 49.5) < 0.3, 20), 'flèches : Maj + droite = 5 %, haut = 0,5 %')
        # --- annuler
        pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
        _, cy = center_pct(pg, '[data-drag="item:t1"]')
        pg.keyboard.press('Control+z'); pg.wait_for_timeout(300)
        cx, _ = center_pct(pg, '[data-drag="item:t1"]')
        ok(abs(cy - 50) < 0.6 and abs(cx - 50) < 0.6, f'Ctrl+Z deux fois : les deux petits déplacements annulés un par un (centre revenu à {cx:.1f} % / {cy:.1f} %)')
        # --- retour à la position prédéfinie
        pg.locator('[data-panel="item"] [data-act="preset"]').click()
        ok(until(lambda: dress_db(pid)['items'][0].get('x') is None, 20), 'bouton « Revenir à la position prédéfinie » : position libre effacée')
        ok(pg.locator('[data-panel="item"] .mt-free[data-free="0"]').count() == 1, 'panneau : rappel « glissez l\'élément sur la vidéo »')
        # --- bandeau, logo, sous-titres
        drag_to(pg, '[data-drag="item:t2"]', 60, 40)
        ok(until(lambda: (dress_db(pid)['items'][1].get('x') or 0) > 40, 20), 'bandeau glissé : position libre enregistrée')
        drag_to(pg, '[data-drag="logo"]', 70, 20)
        ok(until(lambda: dress_db(pid)['logo'].get('x') is not None, 20), 'logo glissé : position enregistrée')
        lg = dress_db(pid)['logo']; e = rect(pg, '[data-drag="logo"]'); bx = rect(pg, '.mt-dress')
        ok(abs((e['x'] - bx['x']) / bx['width'] * 100 - lg['x']) < 1 and abs((e['y'] - bx['y']) / bx['height'] * 100 - lg['y']) < 1.5, f'logo : coin haut-gauche dessiné à la position enregistrée ({lg["x"]} / {lg["y"]})')
        ok(pg.locator('[data-panel="logo"]').count() == 1, 'cliquer sur le logo ouvre ses réglages')
        drag_to(pg, '[data-drag="subs"]', 50, 25)
        ok(until(lambda: dress_db(pid)['subs'].get('y') is not None and abs(dress_db(pid)['subs']['y'] - 25) < 2, 20), f'sous-titres glissés en haut : y = {dress_db(pid)["subs"].get("y")}')
        pg.screenshot(path=str(OUT / 'e6b-place.png'))
        # --- rechargement
        pg.reload(); pg.wait_for_selector('[data-drag="logo"]', timeout=25000); pg.wait_for_timeout(800)
        lg2 = dress_db(pid)['logo']; e = rect(pg, '[data-drag="logo"]'); bx = rect(pg, '.mt-dress')
        ok(abs((e['x'] - bx['x']) / bx['width'] * 100 - lg2['x']) < 1, 'après rechargement : le logo est toujours à sa place')
        ok(ov(pg) <= 1, '1440 px : sans débordement')
        ctx.close()
        # --- arabe et 1024 px
        for lang, w in (('ar', 1440), ('fr', 1024)):
            ctx, pg = page(org, w, 900, lang)
            pg.goto(WEB + f'/studio/editor/{pid}'); pg.wait_for_selector('[data-drag="item:t1"]', timeout=25000); pg.wait_for_timeout(800)
            drag_to(pg, '[data-drag="item:t1"]', 30, 70)
            ok(until(lambda: abs((dress_db(pid)['items'][0].get('x') or 0) - 30) < 2 and abs((dress_db(pid)['items'][0].get('y') or 0) - 70) < 2, 20), f'[{lang} {w} px] glisser le titre : même position que demandée (30 / 70)')
            ok(ov(pg) <= 1, f'[{lang} {w} px] sans débordement')
            pg.screenshot(path=str(OUT / f'e6b-{lang}-{w}.png'))
            ctx.close()
        b.close()
finally:
    try: cur.execute("delete from editor_assets where id = %s", (logo['id'],))
    except Exception: pass
    for t in talks: cur.execute("delete from editor_projects where talk_id=%s", (t,)); cur.execute("delete from talks where id=%s", (t,))
    for u_ in users:
        try: cur.execute("delete from users where id=%s", (u_,))
        except Exception: pass
print('\nTout est bon' if not bad else '\nÉCHECS : ' + '; '.join(bad)); sys.exit(1 if bad else 0)
