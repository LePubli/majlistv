"""Étape E6c : format et qualité du rendu dans « Rendre la vidéo ».
Vérifie : choix du format (16:9, 9:16, 1:1), remplissage (fond flouté / recadrer) et note sur l'habillage hors 16:9, qualité (Auto, 360,
720, 1080) avec les qualités au-dessus de la vidéo d'origine grisées (source de test en 360p), aperçu rapide toujours en 360p, demande
envoyée et enregistrée (format, remplissage, qualité), libellé de la liste des rendus, arabe (RTL) sans débordement.
Prérequis : API (3055, CORS_ORIGIN=http://localhost:3001), PG (5544), S3 de test (5599), site (3001), FFmpeg.
Lancement (depuis web/) : python3 tests/e6c_render.py [dossier des captures]"""
import json, os, pathlib, sys, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-e6c'); OUT.mkdir(parents=True, exist_ok=True)
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




try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
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
        pg.wait_for_timeout(1200)
        pg.locator('[data-act="render"]').click(); pg.wait_for_selector('.mt-render-opts', timeout=15000)
        ok(pg.locator('[data-format]').count() == 3 and pg.locator('[data-format="16:9"]').get_attribute('aria-pressed') == 'true', 'format : 16:9 / 9:16 / 1:1, 16:9 par défaut')
        ok(pg.locator('[data-fit]').count() == 0 and pg.locator('[data-note="preview-q"]').count() == 1, 'en 16:9 : pas de choix de remplissage ; aperçu rapide annoncé en 360p')
        pg.locator('[data-format="9:16"]').click()
        ok(pg.locator('[data-fit]').count() == 2 and pg.locator('[data-fit="blur"]').get_attribute('aria-pressed') == 'true' and pg.locator('[data-note="format"]').count() == 1,
           '9:16 : « fond flouté » par défaut, « recadrer » possible, note sur la place de l\'habillage')
        pg.locator('.mt-render-kind[data-kind="final"]').click()
        ok(pg.locator('[data-quality]').count() == 4, 'rendu final : qualité Auto, 360p, 720p, 1080p')
        ok(until(lambda: pg.locator('[data-quality="720"]').is_disabled() and pg.locator('[data-quality="1080"]').is_disabled() and not pg.locator('[data-quality="360"]').is_disabled(), 10)
           and 'impossible' in (pg.locator('[data-quality="1080"]').get_attribute('title') or ''), 'source en 360p : 720p et 1080p grisés, avec l\'explication')
        ok('360p' in pg.locator('[data-note="src-q"]').inner_text(), '« Vidéo d\'origine : 360p au mieux »')
        pg.locator('[data-fit="crop"]').click(); pg.locator('[data-quality="360"]').click()
        pg.screenshot(path=str(OUT / 'e6c-panneau.png'))
        pg.locator('[data-act="render-start"]').click()
        def row():
            cur.execute("select plan->>'format', plan->>'fit', plan->'quality', kind from editor_renders where project_id=%s order by created_at desc limit 1", (pid,)); return cur.fetchone()
        ok(until(lambda: row() is not None, 15) and row()[0] == '9:16' and row()[1] == 'crop' and int(row()[2]) == 360 and row()[3] == 'final', f'demande enregistrée : {row()}')
        ok(until(lambda: '9:16 · recadré · 360p' in pg.locator('.mt-render-row').first.inner_text(), 10), 'liste des rendus : « Rendu final · 9:16 · recadré · 360p »')
        ok(ov(pg) <= 1, '1440 px : sans débordement')
        cur.execute("delete from editor_renders where project_id=%s", (pid,))
        ctx.close()
        ctx, pg = page(org, 1280, 900, 'ar')
        pg.goto(WEB + f'/studio/editor/{pid}'); pg.wait_for_selector('.mt-editor .mt-clip', timeout=25000); pg.wait_for_timeout(800)
        pg.locator('[data-act="render"]').click(); pg.wait_for_selector('.mt-render-opts', timeout=15000)
        pg.locator('[data-format="1:1"]').click(); pg.locator('.mt-render-kind[data-kind="final"]').click()
        ok(pg.evaluate("document.documentElement.dir") == 'rtl' and pg.locator('[data-fit]').count() == 2 and pg.locator('[data-quality]').count() == 4, '[ar] panneau de rendu en arabe (RTL) : format, remplissage, qualité')
        ok(ov(pg) <= 1, '[ar 1280 px] sans débordement')
        pg.screenshot(path=str(OUT / 'e6c-ar.png'))
        ctx.close()
        b.close()
finally:
    for t in talks:
        cur.execute("delete from editor_renders where talk_id=%s", (t,)); cur.execute("delete from editor_projects where talk_id=%s", (t,)); cur.execute("delete from talks where id=%s", (t,))
    for u_ in users:
        try: cur.execute("delete from users where id=%s", (u_,))
        except Exception: pass
print('\nTout est bon' if not bad else '\nÉCHECS : ' + '; '.join(bad)); sys.exit(1 if bad else 0)
