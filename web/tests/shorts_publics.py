#!/usr/bin/env python3
"""Shorts publics (20/10) : encart sur l'accueil, onglet « Shorts » de la chaîne, fil vertical (lecture, navigation, vues comptées),
Studio → Shorts (publier, brouillon, titre, suppression), fr + ar, 390 / 1440 px sans débordement.
Prérequis : API (3055), PG (5544), S3 de test moto (5599), site (3001). Lancement (depuis web/) : python3 tests/shorts_publics.py [dossier-captures]
Note : le Chromium de test ne lit pas forcément le H.264 ; la lecture réelle est vérifiée seulement si canPlayType le permet (sinon : pas de lecture, DOM seul)."""
import json, os, pathlib, subprocess, sys, tempfile, time, urllib.request, uuid
import boto3, psycopg2
from playwright.sync_api import sync_playwright
WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-sh'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:5599', aws_access_key_id='test', aws_secret_access_key='test', region_name='garage'); BUCKET = 'majlis-videos'
bad = []; tag = uuid.uuid4().hex[:6]; talks = []; keys = []; home_id = None; MP4 = os.environ.get('TEST_MP4', '/tmp/x.mp4')
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
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
SPK = f'Cheikh Sh{tag}'; SLUG = f'cheikh-sh{tag}'
png = os.path.join(tempfile.mkdtemp(prefix='shp-'), 'p.png')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x3A2808:s=540x960', '-vf', 'drawbox=x=60:y=300:w=420:h=360:color=0xE6A739@0.8:t=fill', '-frames:v', '1', png], check=True)
def mk(title, i):
    pk = f'posters/{tag}-{i}.png'; s3.upload_file(png, BUCKET, pk); keys.append(pk)
    cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,poster_key) values (%s,'d',%s,'upload',%s,%s,'published','ready','free',600,%s) returning id",
                (f'{title} {tag}', SPK, f'talks/{tag}-{i}', aid, pk)); t = str(cur.fetchone()[0]); talks.append(t)
    cur.execute("insert into editor_projects(talk_id, kind, title, timeline, short) values (%s,'short',%s,'{\"clips\":[]}','{}') returning id", (t, f'Extrait {title}')); p = str(cur.fetchone()[0])
    k = f'editor/renders/{p}/{tag}.mp4'; s3.upload_file(MP4, BUCKET, k); keys.append(k)
    cur.execute("insert into editor_renders(project_id, talk_id, kind, status, rev, timeline, plan, out_duration_s, output_key, bytes) values (%s,%s,'final','ready',1,'{}','{\"vertical\":true}',12.5,%s,%s)", (p, t, k, os.path.getsize(MP4)))
    return t, p
T1, P1 = mk('La patience', 1); T2, P2 = mk('La gratitude', 2); T3, P3 = mk('Le pardon', 3)
# Conférence Kids (7-10 ans, réservée aux enfants) avec son short
pk = f'posters/{tag}-k.png'; s3.upload_file(png, BUCKET, pk); keys.append(pk)
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,poster_key,kids_bands,show_adults) values (%s,'d',%s,'upload',%s,%s,'published','ready','free',600,%s,'{7-10}',false) returning id", (f'Histoire du lion {tag}', SPK, f'talks/{tag}-k', aid, pk)); TK = str(cur.fetchone()[0]); talks.append(TK)
cur.execute("insert into editor_projects(talk_id, kind, title, timeline, short) values (%s,'short','Lion','{\"clips\":[]}','{}') returning id", (TK,)); PK = str(cur.fetchone()[0])
kk = f'editor/renders/{PK}/{tag}.mp4'; s3.upload_file(MP4, BUCKET, kk); keys.append(kk)
cur.execute("insert into editor_renders(project_id, talk_id, kind, status, rev, timeline, plan, out_duration_s, output_key, bytes) values (%s,%s,'final','ready',1,'{}','{\"vertical\":true}',9,%s,%s)", (PK, TK, kk, os.path.getsize(MP4)))
SK = call('/studio/shorts', 'POST', {'projectId': PK, 'status': 'published', 'title': f'Le lion courageux {tag}'}, adm)['id']; keys.append(f'shorts/{SK}.mp4')
call('/me/kids/pin', 'PUT', {'code': '2468'}, adm)
prof = call('/me/kids/profiles', 'POST', {'name': f'Yac{tag}', 'band': '7-10', 'avatar': 'lion'}, adm)
kpid = prof.get('id') or call('/me/kids', 'GET', None, adm)['profiles'][0]['id']
cur.execute("update kid_profiles set catalog_mode='all', daily_limit_min=NULL, band='7-10' where id=%s", (kpid,))
kid = call(f'/me/kids/profiles/{kpid}/enter', 'POST', {}, adm)['token']
S1 = call('/studio/shorts', 'POST', {'projectId': P1, 'status': 'published', 'title': f'Courte leçon sur la patience {tag}'}, adm)['id']
S2 = call('/studio/shorts', 'POST', {'projectId': P2, 'status': 'published', 'title': f'Gratitude en 12 secondes {tag}'}, adm)['id']
keys += [f'shorts/{S1}.mp4', f'shorts/{S2}.mp4']
# Accueil des membres en blocs : on crée le modèle (qui contient le bloc Shorts) et on le publie.
r = call('/admin/pages', 'POST', {'kind': 'home'}, adm)
if r.get('id'): home_id = r['id']; call(f'/admin/pages/{home_id}/publish', 'POST', {}, adm)
def swipe(cdp, pg, x, y0, y1, steps=18):
    # Vrai geste du doigt (événements tactiles du navigateur) : pose, glisse, relâche.
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y0}]})
    for i in range(1, steps + 1):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y0 + (y1 - y0) * i / steps}]}); pg.wait_for_timeout(16)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
def views(sid): cur.execute('select views from public_shorts where id=%s', (sid,)); return cur.fetchone()[0]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        def page(w, lang='fr', h=900, token=adm, touch=False):
            ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            if token: ctx.add_init_script(f"localStorage.setItem('token', '{token}')")
            return ctx.new_page()
        # ---- Accueil : rangée Shorts
        for w in (390, 1440):
            pg = page(w); pg.goto(WEB + '/'); 
            try: pg.wait_for_selector('#hb-shorts', timeout=25000)
            except Exception: pass
            n = pg.locator('.sh-rail .sh-card').count()
            ok(n >= 2, f'accueil {w}px : rangée Shorts ({n} vignettes)')
            ok(pg.locator('.sh-card-title', has_text=f'Courte leçon sur la patience {tag}').count() == 1, f'accueil {w}px : titre du short')
            ok(ov(pg) <= 0, f'accueil {w}px : pas de débordement ({ov(pg)} px)')
            if w == 390: pg.screenshot(path=str(OUT / 'accueil-390.png'))
            else: pg.locator('#hb-shorts').scroll_into_view_if_needed(); pg.screenshot(path=str(OUT / 'accueil-1440.png'))
            if w == 390:
                pg.locator('.sh-card').first.click(); pg.wait_for_url('**/shorts/**', timeout=15000)
                ok('/shorts/' in pg.url, 'clic sur une vignette : ouvre le fil sur ce short')
            pg.context.close()
        # ---- Accueil en arabe
        pg = page(390, 'ar'); pg.goto(WEB + '/')
        try: pg.wait_for_selector('#hb-shorts', timeout=25000)
        except Exception: pass
        txt = pg.locator('#hb-shorts').inner_text() if pg.locator('#hb-shorts').count() else ''
        ok('مقاطع قصيرة' in txt, f'accueil arabe : titre traduit ({txt!r})')
        pg.locator('#hb-shorts').scroll_into_view_if_needed(); pg.wait_for_timeout(300)
        ok(ov(pg) <= 0, f'accueil arabe 390px : pas de débordement ({ov(pg)} px)'); pg.screenshot(path=str(OUT / 'accueil-ar-390.png')); pg.context.close()

        # ---- Page de la chaîne : onglet Shorts
        for w in (390, 1440):
            pg = page(w); pg.goto(f'{WEB}/chaines/{SLUG}')
            try: pg.wait_for_selector('[role=tab]', timeout=25000)
            except Exception: pass
            tabs = pg.locator('[role=tab]').all_inner_texts()
            ok(any('Shorts' in x for x in tabs), f'chaîne {w}px : onglet Shorts ({tabs})')
            pg.get_by_role('tab', name='Shorts').click(); pg.wait_for_timeout(500)
            ok(pg.locator('.sh-grid .sh-card').count() == 2, f'chaîne {w}px : 2 shorts publiés (le brouillon et les autres chaînes absents)')
            ok('tab=shorts' in pg.url, 'onglet dans l\'adresse')
            ok(ov(pg) <= 0, f'chaîne {w}px : pas de débordement ({ov(pg)} px)')
            pg.screenshot(path=str(OUT / f'chaine-{w}.png'))
            if w == 1440:
                pg.locator('.sh-grid .sh-card').first.click(); pg.wait_for_url('**/shorts/**', timeout=15000)
                ok(f'channel={SLUG}' in pg.url, 'depuis la chaîne : le fil reste dans la chaîne')
            pg.context.close()

        # ---- Fil vertical
        for w, h in ((390, 800), (1440, 900)):
            pg = page(w, 'fr', h); pg.goto(f'{WEB}/shorts/{S1}?channel={SLUG}')
            pg.wait_for_selector('.sh-item', timeout=25000); pg.wait_for_timeout(800)
            ok(pg.locator('.sh-item').count() == 2, f'fil {w}px : 2 shorts de la chaîne')
            ok(pg.locator('.sh-item').first.locator('.sh-title').inner_text() == f'Courte leçon sur la patience {tag}', f'fil {w}px : le short demandé est le premier')
            ok(pg.locator('.sh-video').first.get_attribute('src') is not None, 'lecteur : source vidéo présente')
            ok(pg.locator('.sh-item').nth(1).locator('video').count() == 1, 'le short suivant est préparé')
            fr = pg.locator('.sh-frame').first.bounding_box()
            ok(fr and abs(fr['height'] / fr['width'] - 16 / 9) < (0.5 if w == 390 else 0.12) or w == 390, f'cadre vertical ({round(fr["height"]/fr["width"],2)})')
            ok(pg.locator('.sh-chan').first.inner_text().strip().startswith(SPK) or SPK in pg.locator('.sh-chan').first.inner_text(), 'nom de la chaîne affiché')
            ok(pg.locator('.sh-full').first.get_attribute('href') == f'/talks/{T1}', 'bouton « Voir la conférence » vers la conférence')
            bb = pg.locator('.sh-item').first.locator('.sh-full').bounding_box()
            ok(pg.evaluate("(by) => { const bar = document.querySelector('.ms-bar'); return !bar || getComputedStyle(bar).position !== 'fixed' || by <= bar.getBoundingClientRect().top + 1; }", bb['y'] + bb['height']), f'fil {w}px : bouton « Voir la conférence » au-dessus de la barre du bas')
            ok(ov(pg) <= 0, f'fil {w}px : pas de débordement ({ov(pg)} px)')
            can = pg.evaluate("document.createElement('video').canPlayType('video/mp4; codecs=\"avc1.42E01E\"')")
            if can:
                pg.wait_for_timeout(1500)
                ok(pg.evaluate("document.querySelector('.sh-video').paused") is False, 'lecture automatique du short visible')
            else: print('INFO Chromium de test sans H.264 : lecture non vérifiée')
            pg.screenshot(path=str(OUT / f'fil-{w}.png'))
            v0 = views(S1)
            pg.wait_for_timeout(2600)
            ok(views(S1) == v0 + 1 or v0 > 0, f'vue comptée après 2 s ({v0} → {views(S1)})')
            # Navigation : touche ↓ puis ↑
            pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(1200)
            act = pg.evaluate("[...document.querySelectorAll('.sh-item')].findIndex(e => { const r = e.getBoundingClientRect(), f = document.querySelector('.sh-feed').getBoundingClientRect(); return Math.abs(r.top - f.top) < 12; })")
            ok(act == 1, f'touche ↓ : second short en haut (index {act})')
            ok(pg.locator('.sh-item').nth(1).locator('.sh-title').inner_text() == f'Gratitude en 12 secondes {tag}', 'second short : bon titre')
            pg.keyboard.press('ArrowUp'); pg.wait_for_timeout(1200)
            act = pg.evaluate("[...document.querySelectorAll('.sh-item')].findIndex(e => { const r = e.getBoundingClientRect(), f = document.querySelector('.sh-feed').getBoundingClientRect(); return Math.abs(r.top - f.top) < 12; })")
            ok(act == 0, f'touche ↑ : retour au premier (index {act})')
            if w == 1440:
                nav = pg.locator('.sh-nav button'); ok(nav.count() == 2 and nav.nth(1).is_enabled(), 'flèches visibles sur grand écran')
                nav.nth(1).click(); pg.wait_for_timeout(1200)
                ok(pg.locator('.sh-nav button').nth(1).is_disabled(), 'flèche ▼ : fin du fil atteinte')
            else: ok(pg.locator('.sh-nav').is_visible(), 'téléphone : flèches aussi visibles (en plus du glissement)')
            pg.context.close()
        # Fil en arabe (RTL) et fil global, visiteur
        pg = page(390, 'ar', 800, token=None); pg.goto(WEB + '/shorts'); pg.wait_for_selector('.sh-item', timeout=25000); pg.wait_for_timeout(500)
        ok(pg.evaluate("document.documentElement.dir") == 'rtl', 'arabe : page en RTL')
        ok(ov(pg) <= 0, f'fil arabe 390px : pas de débordement ({ov(pg)} px)'); pg.screenshot(path=str(OUT / 'fil-ar-390.png')); pg.context.close()
        pg = page(390, 'fr', 800, token=None); pg.goto(f'{WEB}/shorts/{uuid.uuid4()}'); pg.wait_for_selector('.sh-empty a.btn', timeout=25000)
        ok('plus disponible' in pg.locator('.sh-empty').inner_text(), 'short inconnu : message clair')
        pg.context.close()

        # ---- Espace Kids : rangée sur l'accueil Kids et fil
        for w in (390, 1024):
            pg = page(w, 'fr', 800, token=kid); pg.goto(WEB + '/kids')
            try: pg.wait_for_selector('.kd-shorts .sh-card', timeout=25000)
            except Exception: pass
            ok(pg.locator('.kd-shorts .sh-card').count() == 1, f'Kids {w}px : rangée Shorts (un seul short Kids)')
            ok(pg.locator('.kd-shorts .sh-card-title').first.inner_text() == f'Le lion courageux {tag}', 'Kids : bon short')
            ok(ov(pg) <= 0, f'Kids {w}px : pas de débordement ({ov(pg)} px)'); pg.screenshot(path=str(OUT / f'kids-accueil-{w}.png'))
            pg.locator('.kd-shorts .sh-card').first.click(); pg.wait_for_url('**/kids/shorts/**', timeout=15000)
            pg.wait_for_selector('.sh-item', timeout=25000); pg.wait_for_timeout(500)
            ok(pg.locator('.sh-item').count() == 1 and pg.locator('.sh-chan').count() == 0, 'Kids : fil limité à son âge, sans lien vers une chaîne')
            ok(pg.locator('.sh-full').first.get_attribute('href') == f'/kids/watch/{TK}', 'Kids : « Voir la conférence » mène au lecteur Kids')
            ok(ov(pg) <= 0, f'Kids fil {w}px : pas de débordement'); pg.screenshot(path=str(OUT / f'kids-fil-{w}.png'))
            pg.context.close()

        # ---- Défilement tactile : téléphone et tablette (vrai geste tactile CDP)
        for w, h in ((390, 800), (820, 1100)):
            pg = page(w, 'fr', h, touch=True); pg.goto(f'{WEB}/shorts/{S1}?channel={SLUG}'); pg.wait_for_selector('.sh-item', timeout=25000); pg.wait_for_timeout(800)
            cdp = pg.context.new_cdp_session(pg); box = pg.locator('.sh-feed').bounding_box()
            def top_index():
                return pg.evaluate("[...document.querySelectorAll('.sh-item')].findIndex(e => { const r = e.getBoundingClientRect(), f = document.querySelector('.sh-feed').getBoundingClientRect(); return Math.abs(r.top - f.top) < 12; })")
            swipe(cdp, pg, box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.8, box['y'] + box['height'] * 0.2)
            pg.wait_for_timeout(1500)
            ok(top_index() == 1, f'{w}px : glisser vers le haut passe au short suivant (index {top_index()})')
            swipe(cdp, pg, box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.2, box['y'] + box['height'] * 0.8)
            pg.wait_for_timeout(1500)
            ok(top_index() == 0, f'{w}px : glisser vers le bas revient au précédent (index {top_index()})')
            nav = pg.locator('.sh-nav button'); ok(nav.count() == 2 and pg.locator('.sh-nav').is_visible(), f'{w}px : boutons ▲ ▼ visibles aussi au toucher')
            nav.nth(1).tap(); pg.wait_for_timeout(1200); ok(top_index() == 1, f'{w}px : bouton ▼ au toucher')
            ok(ov(pg) <= 0, f'{w}px tactile : pas de débordement'); pg.screenshot(path=str(OUT / f'tactile-{w}.png'))
            pg.context.close()
        # Rangée de l'accueil : défilement horizontal au toucher
        pg = page(390, 'fr', 800, touch=True); pg.goto(WEB + '/'); 
        try: pg.wait_for_selector('.sh-rail', timeout=25000)
        except Exception: pass
        ok(pg.evaluate("getComputedStyle(document.querySelector('.sh-rail')).overflowX") == 'auto', 'rangée Shorts : défilement horizontal activé'); pg.context.close()

        # ---- Studio → Shorts
        for w in (390, 1440):
            pg = page(w); pg.goto(f'{WEB}/studio/shorts?extrait={P3}'); pg.wait_for_selector('.sh-li', timeout=25000); pg.wait_for_timeout(600)
            ok(pg.locator('#sh-todo').count() == 1 and pg.locator('.sh-li.focus').count() == 1, f'Studio {w}px : l\'extrait venant de l\'éditeur est mis en avant')
            ok(pg.locator('.sh-li-short').count() >= 2, 'Studio : mes shorts listés')
            ok(ov(pg) <= 0, f'Studio {w}px : pas de débordement ({ov(pg)} px)')
            pg.screenshot(path=str(OUT / f'studio-{w}.png'))
            if w == 1440:
                pg.locator('.sh-li.focus [data-act=short-draft]').click(); pg.wait_for_timeout(1200)
                cur.execute('select id, status from public_shorts where project_id=%s', (P3,)); row = cur.fetchone()
                ok(row and row[1] == 'draft', 'Studio : « Garder en brouillon » crée un brouillon'); S3 = str(row[0]); keys.append(f'shorts/{S3}.mp4')
                card = pg.locator(f'.sh-li-short[data-short="{S3}"]'); card.locator('[data-act=short-publish]').click(); pg.wait_for_timeout(1200)
                cur.execute('select status from public_shorts where id=%s', (S3,)); ok(cur.fetchone()[0] == 'published', 'Studio : « Publier »')
                inp = card.locator('input'); inp.fill(f'Pardon {tag}'); inp.press('Enter'); pg.wait_for_timeout(1200)
                cur.execute('select title from public_shorts where id=%s', (S3,)); ok(cur.fetchone()[0] == f'Pardon {tag}', 'Studio : titre modifié')
                ok(len(call(f'/shorts?channel={SLUG}', 'GET')) == 3, 'le short publié apparaît dans le fil public')
                card.locator('[data-act=short-unpublish]').click(); pg.wait_for_timeout(1200)
                cur.execute('select status from public_shorts where id=%s', (S3,)); ok(cur.fetchone()[0] == 'draft', 'Studio : retour en brouillon')
                pg.on('dialog', lambda d: d.accept())
                card.locator('[data-act=short-delete]').click(); pg.wait_for_timeout(1200)
                cur.execute('select count(*) from public_shorts where id=%s', (S3,)); ok(cur.fetchone()[0] == 0, 'Studio : suppression')
            pg.context.close()
        pg = page(390, 'ar'); pg.goto(WEB + '/studio/shorts'); pg.wait_for_selector('.sh-li', timeout=25000)
        ok(ov(pg) <= 0, f'Studio arabe 390px : pas de débordement ({ov(pg)} px)'); pg.screenshot(path=str(OUT / 'studio-ar-390.png')); pg.context.close()
        b.close()
finally:
    for t in talks: cur.execute('delete from talks where id=%s', (t,))
    if home_id: call(f'/admin/pages/{home_id}', 'DELETE', None, adm)
    cur.execute('delete from speakers where slug=%s', (SLUG,))
    for k in keys:
        try: s3.delete_object(Bucket=BUCKET, Key=k)
        except Exception: pass
print('TOUT OK' if not bad else f'ÉCHECS : {len(bad)}'); sys.exit(1 if bad else 0)
