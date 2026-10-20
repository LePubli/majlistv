"""Étape E6a : timeline lisible (une couleur par piste, titres qui se chevauchent sur des lignes séparées, logo sur sa propre ligne),
zoom de la timeline (boutons, « Tout voir », Ctrl + molette centré sur le curseur) et zoom de l'aperçu (Ajusté / 150 % / 200 %).
Prérequis : API (3055, CORS_ORIGIN=http://localhost:3001), PG (5544), S3 de test (5599), site (3001), FFmpeg.
Lancement (depuis web/) : python3 tests/e6a_timeline.py [dossier des captures]"""
import json, os, pathlib, sys, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-e6a'); OUT.mkdir(parents=True, exist_ok=True)
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


def box(loc): return loc.bounding_box()
def inter(a, b): return a['x'] < b['x'] + b['width'] and b['x'] < a['x'] + a['width'] and a['y'] < b['y'] + b['height'] and b['y'] < a['y'] + a['height']
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        def page(tok, w=1440, hh=1000, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')")
            pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
            return ctx, pg
        ctx, pg = page(org)
        pg.goto(WEB + '/studio/editor'); pg.wait_for_selector('.mt-home .mt-item', timeout=25000)
        pg.locator('.mt-item', has_text=f'La patience {tag}').locator('button').click()
        until(lambda: '/studio/editor/' in pg.evaluate('location.href') and pg.locator('.mt-editor .mt-clip').count() == 1, 25)
        pid = pg.evaluate('location.href').rstrip('/').split('/')[-1]
        pg.wait_for_timeout(1500)
        # Trois titres dont deux se chevauchent dans le temps, plus le logo sur toute la durée.
        items = [{'id': 't1', 'kind': 'title', 'text': 'Premier', 'sub': '', 'start': 10, 'len': 8}, {'id': 't2', 'kind': 'banner', 'text': 'Deuxième', 'sub': 'bis', 'start': 14, 'len': 8},
                 {'id': 't3', 'kind': 'title', 'text': 'Troisième', 'sub': '', 'start': 30, 'len': 4}]
        cur.execute("select timeline from editor_projects where id=%s", (pid,)); tl0 = cur.fetchone()[0]
        tl0['dress'] = {**(tl0.get('dress') or {}), 'items': items, 'logo': {'on': True, 'from': 0, 'to': None}}
        cur.execute("update editor_projects set timeline=%s where id=%s", (json.dumps(tl0), pid))
        pg.reload(); pg.wait_for_selector('.mt-row-titles .mt-tclip', timeout=25000); pg.wait_for_timeout(800)
        tc = {i: box(pg.locator(f'.mt-tclip button[data-item="{i}"]').locator('xpath=..')) for i in ('t1', 't2', 't3')}
        ok(not inter(tc['t1'], tc['t2']), 'titres qui se chevauchent dans le temps : sur deux lignes séparées (aucun recouvrement)')
        ok(abs(tc['t3']['y'] - tc['t1']['y']) < 2, 'un titre sans chevauchement reprend la première ligne')
        trow = box(pg.locator('.mt-row-titles')); srow = box(pg.locator('.mt-row-subs')); vrow = box(pg.locator('.mt-row-video'))
        ok(trow['height'] > 60, f'la piste Titres et logo grandit avec ses lignes ({trow["height"]:.0f} px)')
        print('DBG', trow, tc, logo) if False else None
        ok(all(c['y'] >= trow['y'] and c['y'] + c['height'] <= trow['y'] + trow['height'] for c in tc.values()), 'chaque titre reste dans sa piste')
        logo = box(pg.locator('.mt-logostrip'))
        ok(logo and not any(inter(logo, c) for c in tc.values()) and logo['y'] + logo['height'] <= trow['y'] + trow['height'], 'le logo a sa propre ligne : il ne recouvre aucun titre')
        ok(trow['y'] + trow['height'] <= srow['y'] + 1 and vrow['y'] + vrow['height'] <= trow['y'] + 20, 'les pistes ne se chevauchent pas entre elles')
        subs = box(pg.locator('.mt-row-subs .mt-block').first)
        ok(subs['y'] >= srow['y'] and not any(inter(subs, c) for c in tc.values()), 'sous-titres : séparés des titres')
        col = lambda sel: pg.evaluate("s => getComputedStyle(document.querySelector(s)).backgroundColor", sel)
        ok(len({col('.mt-tclip.title'), col('.mt-row-subs .mt-block.sub'), col('.mt-row-dub .mt-block.dub'), col('.mt-clip')}) == 4, 'une couleur différente par type (titres, sous-titres, voix française, vidéo)')
        trk = pg.evaluate("[...document.querySelectorAll('.mt-row')].slice(1).map(r => getComputedStyle(r).getPropertyValue('--trk').trim())")
        ok(len(set(trk)) == 6 and all(trk), f'repère de couleur sur chacune des 6 pistes : {trk}')
        ok(len(pg.locator('.mt-row-subs .mt-block.alt').all()) > 3, 'sous-titres : blocs voisins en teintes alternées')
        pg.screenshot(path=str(OUT / 'e6a-timeline.png'))

        # --- zoom de la timeline
        W = lambda: pg.evaluate("document.querySelector('.mt-tl-inner').getBoundingClientRect().width")
        w0 = W()
        pg.locator('[data-zoom="in"]').click(); pg.wait_for_timeout(200)
        w1 = W(); ok(w1 > w0 * 1.5, f'bouton « + » : timeline plus large ({w0:.0f} → {w1:.0f} px)')
        pg.locator('[data-zoom="in"]').click(); pg.wait_for_timeout(200)
        pg.locator('[data-zoom="out"]').click(); pg.wait_for_timeout(200)
        ok(abs(W() - w1) < 2, 'bouton « − » : un cran en arrière (« + » deux fois puis « − » = « + » une fois)')
        pg.locator('[data-zoom="all"]').click(); pg.wait_for_timeout(200)
        ok(abs(W() - w0) < 2 and pg.locator('[data-zoom="all"]').is_disabled(), '« Tout voir » : toute la conférence tient dans la largeur')
        # Ctrl + molette : le temps sous le curseur reste sous le curseur
        tl = box(pg.locator('.mt-tl-scroll')); mx = tl['x'] + 168 + (tl['width'] - 168) * 0.5
        t_at = lambda: pg.evaluate("([mx]) => { const el = document.querySelector('.mt-tl-scroll'); const r = el.getBoundingClientRect(); const inner = document.querySelector('.mt-tl-inner').getBoundingClientRect().width - 168 - 16; return (mx - r.left - 168 + el.scrollLeft) / inner; }", [mx])
        f0 = t_at()
        pg.mouse.move(mx, tl['y'] + 100); pg.keyboard.down('Control')
        for _ in range(4): pg.mouse.wheel(0, -120); pg.wait_for_timeout(120)
        pg.keyboard.up('Control'); pg.wait_for_timeout(300)
        f1 = t_at()
        ok(W() > w0 * 1.5 and abs(f1 - f0) < 0.02, f'Ctrl + molette : zoom centré sur le curseur (position {f0:.3f} → {f1:.3f})')
        pg.screenshot(path=str(OUT / 'e6a-zoom.png'))
        pg.locator('[data-zoom="all"]').click()

        # --- zoom de l'aperçu
        ww = lambda: pg.evaluate("document.querySelector('.mt-preview').getBoundingClientRect().width")
        a = ww()
        pg.locator('[data-pz="2"]').click(); pg.wait_for_timeout(400)
        ok(ww() > a * 1.6 and pg.locator('[data-pz="2"]').get_attribute('aria-pressed') == 'true', f'aperçu 200 % : image plus grande ({a:.0f} → {ww():.0f} px)')
        ok(pg.locator('.mt-pz .mt-dress').count() == 1 and ov(pg) <= 1, 'habillage zoomé avec l\'image, pas de débordement de la page')
        pg.screenshot(path=str(OUT / 'e6a-apercu200.png'))
        pg.locator('[data-pz="1"]').click(); pg.wait_for_timeout(300)
        ok(abs(ww() - a) < 2, 'aperçu « Ajusté » : taille d\'origine retrouvée')
        ctx.close()
        for lang, w in (('ar', 1440), ('fr', 1024)):
            ctx, pg = page(org, w, 900, lang)
            pg.goto(WEB + f'/studio/editor/{pid}'); pg.wait_for_selector('.mt-row-titles .mt-tclip', timeout=25000); pg.wait_for_timeout(600)
            if lang == 'ar': ok(pg.evaluate("document.documentElement.dir") == 'rtl' and pg.evaluate("getComputedStyle(document.querySelector('.mt-tl')).direction") == 'ltr', '[ar] interface RTL, timeline de gauche à droite')
            ok(ov(pg) <= 1, f'[{lang} {w} px] sans débordement')
            pg.screenshot(path=str(OUT / f'e6a-{lang}-{w}.png'))
            ctx.close()
        b.close()
finally:
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
print('\nTout est bon' if not bad else '\nÉCHECS : ' + '; '.join(bad)); sys.exit(1 if bad else 0)
