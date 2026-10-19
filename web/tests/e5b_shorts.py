#!/usr/bin/env python3
"""Étape E5b : page « Extraits 9:16 » dans le navigateur.
Vérifie : liste vide, « Nouvel extrait », réglage début/fin, cadre vertical glissable (enregistré), aperçu vertical, titre et sous-titres,
choix du passage dans le texte, « Rendre l'extrait » (mode vertical), suppression, bouton « Extraits 9:16 » de l'éditeur, AR (RTL), 390 / 1024 / 1440 px.
Prérequis : API (3055), PG (5544), S3 de test (5599), site (3001) recompilé (npx next build), FFmpeg.
Lancement (depuis web/) : python3 tests/e5a_text.py [dossier des captures]"""
import pathlib, sys, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-e5b'); OUT.mkdir(parents=True, exist_ok=True)
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
em = f'e5s-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': f'Orga {tag}'})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
org = login(em, 'Passw0rd-test')
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
               values (%s,'d','Cheikh Test','upload',%s,%s,'published','ready','free',60,'fr','fr','ready') returning id""", (f'Extraits {tag}', f'talks/{tag}', oid))
T = str(cur.fetchone()[0]); talks.append(T)
make_hls(s3, T, 60, codec='vp9'); n = add_transcript(cur, T, 60)
# Mots précis (comme Whisper) pour toutes les phrases sauf la dernière : un mot toutes les 0,5 s.
cur.execute("select idx, start_ms, text from transcript_segments where talk_id=%s and lang='fr' order by idx", (T,))
for idx, s, text in cur.fetchall():
    if idx == n - 1: continue
    for k, w in enumerate(text.split()):
        cur.execute("insert into transcript_words(talk_id, lang, seg_idx, idx, start_ms, end_ms, word) values (%s,'fr',%s,%s,%s,%s,%s)", (T, idx, k, s + 500 * k, s + 500 * k + 400, w))
cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) select talk_id, 'en', idx, start_ms, end_ms, 'Sentence ' || (idx + 1) || ' in English.' from transcript_segments where talk_id=%s and lang='fr'", (T,))

def until(fn, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if fn(): return True
        except Exception: pass
        time.sleep(0.3)
    return False
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
def shorts_db(): cur.execute("select title, short, timeline from editor_projects where talk_id=%s and kind='short' order by created_at", (T,)); return cur.fetchall()

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        def page(tok, w=1440, hh=1000, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')")
            pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
            return ctx, pg
        pid = requests.post(API + '/studio/editor/projects', headers={'authorization': 'Bearer ' + org}, json={'talkId': T}).json()['id']
        ctx, pg = page(org)
        # Bouton dans l'éditeur.
        pg.goto(f'{WEB}/studio/editor/{pid}'); pg.wait_for_selector('.mt-editor .mt-clip', timeout=25000)
        ok(pg.locator('[data-act="shorts"]').get_attribute('href') == f'/studio/editor/{pid}/shorts', "éditeur : bouton « Extraits 9:16 »")
        pg.locator('[data-act="shorts"]').click(); pg.wait_for_selector('.mts', timeout=25000)
        ok(until(lambda: pg.locator('[data-empty]').count() == 1), 'page Extraits : état vide avec explication')
        ok(pg.locator('.sd-shell, .sd-side, nav').count() > 0 and pg.locator('.mt-editor').count() == 0, 'la page garde le menu du Studio (pas le plein écran)')
        pg.locator('[data-act="short-new"]').click(); pg.wait_for_selector('.mts-tab', timeout=15000)
        ok(len(shorts_db()) == 1 and shorts_db()[0][0] == 'Extrait 1', 'Nouvel extrait : créé (Extrait 1, 30 s)')
        pg.wait_for_selector('.mts-screen canvas', timeout=15000); pg.wait_for_selector('.mts-frame')
        until(lambda: pg.evaluate("document.querySelector('.mts-src')?.videoWidth") > 0, 30)
        ok(pg.evaluate("document.querySelector('.mts-src').videoWidth") > 0, 'la vidéo 16:9 est chargée (hls.js)')
        fb = pg.locator('.mts-frame').bounding_box(); sb = pg.locator('.mts-stage').bounding_box()
        ok(abs(fb['width'] / sb['width'] - 0.316) < 0.03, f"cadre vertical : {fb['width'] / sb['width'] * 100:.0f} % de la largeur (≈ 31,6 %)")
        # Glisser le cadre à droite → cropX = 100.
        pg.mouse.move(fb['x'] + fb['width'] / 2, fb['y'] + fb['height'] / 2); pg.mouse.down()
        pg.mouse.move(sb['x'] + sb['width'] - 2, fb['y'] + fb['height'] / 2, steps=8); pg.mouse.up()
        ok(until(lambda: shorts_db()[0][1]['cropX'] == 100, 10), f"cadre glissé à droite, enregistré tout seul (cropX = {shorts_db()[0][1]['cropX']})")
        pg.locator('.mts-frame').focus(); pg.keyboard.press('ArrowLeft')
        ok(until(lambda: shorts_db()[0][1]['cropX'] == 98, 10), 'flèche gauche : cadre déplacé de 2 %')
        # Passage, titre, sous-titres.
        pg.locator('[data-f="from"]').fill('10'); pg.locator('[data-f="to"]').fill('25.5'); pg.locator('[data-f="title"]').fill('Ma citation')
        ok(until(lambda: (lambda r: r[1]['from'] if False else r[2]['clips'][0]['in'] == 10 and r[2]['clips'][0]['out'] == 25.5 and r[0] == 'Ma citation')(shorts_db()[0]), 10), 'passage 10 → 25,5 s et titre enregistrés')
        ok('15,5' in pg.locator('[data-len]').inner_text() or '15.5' in pg.locator('[data-len]').inner_text() or '0:15' in pg.locator('[data-len]').inner_text(), f"durée affichée : {pg.locator('[data-len]').inner_text()}")
        pg.locator('[data-act="short-play"]').click(); pg.wait_for_timeout(1500)
        ok(pg.locator('.mts-title').count() == 1 and pg.locator('.mts-title').inner_text() == 'Ma citation', 'aperçu vertical : titre affiché au début')
        ok(until(lambda: pg.locator('.mts-cap').count() == 1 and len(pg.locator('.mts-cap').inner_text().split()) <= 5, 10), f"aperçu vertical : sous-titre court « {pg.locator('.mts-cap').inner_text() if pg.locator('.mts-cap').count() else ''} »")
        pix = pg.evaluate("(() => { const c = document.querySelector('.mts-screen canvas'); const d = c.getContext('2d').getImageData(135, 240, 1, 1).data; return [d[0], d[1], d[2], d[3]]; })()")
        ok(pix[3] == 255, f'aperçu vertical : le canvas dessine la vidéo ({pix})')
        pg.locator('[data-act="short-play"]').click()
        pg.locator('[data-f="captions"]').uncheck()
        ok(until(lambda: pg.locator('.mts-cap').count() == 0 and shorts_db()[0][1]['captions'] is False, 10), 'sous-titres décochés : plus de sous-titre, enregistré')
        pg.locator('[data-f="captions"]').check(); pg.locator('[data-f="showTitle"]').uncheck()
        ok(until(lambda: shorts_db()[0][1]['showTitle'] is False and shorts_db()[0][1]['captions'] is True, 10), 'titre masqué enregistré')
        pg.locator('[data-f="showTitle"]').check()
        ok(pg.locator('[data-f="dub"]').count() == 0, 'pas de voix française proposée (conférence sans doublage)')
        # Choix dans le texte : 1er clic = début, 2e = fin.
        pg.wait_for_selector('.mts-seg', timeout=10000)
        segs = pg.locator('.mts-seg')
        i0 = int(segs.nth(2).get_attribute('data-seg')); i1 = int(segs.nth(4).get_attribute('data-seg'))
        cur.execute("select idx, start_ms, end_ms from transcript_segments where talk_id=%s and lang='fr' and idx in (%s,%s) order by idx", (T, i0, i1)); (_, s0, _), (_, _, e1) = cur.fetchall()
        segs.nth(2).click(); segs.nth(4).click()
        ok(until(lambda: abs(shorts_db()[0][2]['clips'][0]['in'] - s0 / 1000) < 0.06 and abs(shorts_db()[0][2]['clips'][0]['out'] - e1 / 1000) < 0.06, 10), f"clic dans le texte : début de la phrase {i0}, fin de la phrase {i1} ({shorts_db()[0][2]['clips'][0]['in']} → {shorts_db()[0][2]['clips'][0]['out']}, attendu {s0 / 1000} → {e1 / 1000})")
        # Valeurs hors limites.
        pg.locator('[data-f="to"]').fill(str(float(pg.locator('[data-f="from"]').input_value()) + 0.2))
        ok(pg.locator('[data-act="short-render"]').is_disabled() and 'bad' in pg.locator('[data-len]').get_attribute('class'), 'passage de moins d’1 s : « Rendre » inactif, durée en rouge')
        pg.locator('[data-f="from"]').fill('10'); pg.locator('[data-f="to"]').fill('30')
        until(lambda: shorts_db()[0][2]['clips'][0]['out'] == 30, 10)
        # Deuxième extrait puis rendu.
        pg.locator('[data-act="short-new"]').click(); until(lambda: pg.locator('.mts-tab').count() == 2, 10)
        ok(pg.locator('.mts-tab').count() == 2 and len(shorts_db()) == 2, 'deuxième extrait créé, deux onglets')
        pg.locator('.mts-tab', has_text='Ma citation').click(); pg.wait_for_timeout(800)
        ok(pg.locator('[data-f="title"]').input_value() == 'Ma citation', 'on revient au premier extrait : ses réglages sont là')
        pg.locator('[data-act="short-render"]').click(); pg.wait_for_selector('.mt-render-box', timeout=10000)
        ok(pg.locator('[data-act="render-start"]').count() == 1 and '360 × 640' in pg.locator('.mt-render-box').inner_text() and 'Rendre l’extrait 9:16' in pg.locator('.mt-render-box').inner_text(), 'fenêtre de rendu en mode vertical (360 × 640 / 1080 × 1920)')
        pg.locator('[data-act="render-start"]').click()
        ok(until(lambda: pg.locator('.mt-render-row[data-status="queued"]').count() == 1, 10), 'rendu demandé : en attente du serveur')
        cur.execute("select count(*) from editor_renders where project_id=(select id from editor_projects where talk_id=%s and kind='short' order by created_at limit 1)", (T,))
        ok(cur.fetchone()[0] == 1, 'rendu enregistré pour l’extrait (pas pour le montage)')
        pg.screenshot(path=str(OUT / 'e5b-rendu-1440.png'))
        pg.keyboard.press('Escape'); pg.wait_for_selector('.mt-render-box', state='detached', timeout=5000)
        cur.execute("update editor_renders set status='canceled' where project_id in (select id from editor_projects where talk_id=%s)", (T,))
        pg.screenshot(path=str(OUT / 'e5b-extraits-1440.png'))
        ok(ov(pg) <= 1, 'sans débordement à 1440 px')
        # Suppression du second extrait.
        pg.locator('.mts-tab', has_text='Extrait 2').click(); pg.wait_for_timeout(800)
        pg.locator('[data-act="short-delete"]').click()
        ok(until(lambda: len(shorts_db()) == 1 and pg.locator('.mts-tab').count() == 1, 10), 'suppression : un seul extrait reste')
        ctx.close()
        # Lecture seule : un autre utilisateur n'a pas accès.
        em2 = f'e5s2-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em2, 'password': 'Passw0rd-test', 'name': f'Autre {tag}'})
        cur.execute("update users set role='organizer' where email=%s returning id", (em2,)); users.append(str(cur.fetchone()[0]))
        c3, p3 = page(login(em2, 'Passw0rd-test'))
        p3.goto(f'{WEB}/studio/editor/{pid}/shorts'); p3.wait_for_selector('.mts', timeout=25000); p3.wait_for_timeout(1500)
        ok(p3.locator('.mts-tab').count() == 0 and p3.locator('[data-act="short-new"]').is_disabled(), 'autre organisateur : aucun extrait, « Nouvel extrait » inactif')
        c3.close()
        # Arabe (RTL), 1024 et 390 px.
        for lang, w in (('ar', 1440), ('fr', 1024), ('fr', 390), ('ar', 390)):
            c2, p2 = page(org, w=w, hh=1000 if w > 500 else 844, lang=lang)
            p2.goto(f'{WEB}/studio/editor/{pid}/shorts'); p2.wait_for_selector('.mts-tab', timeout=25000); p2.wait_for_selector('.mts-frame', timeout=15000); p2.wait_for_timeout(1200)
            if lang == 'ar': ok(p2.evaluate('document.documentElement.dir') == 'rtl' and 'مقاطع' in p2.locator('h1').inner_text(), f'AR {w} px : titre en arabe, RTL')
            ok(ov(p2) <= 1, f'{lang.upper()} {w} px : sans débordement ({ov(p2)})')
            fb = p2.locator('.mts-frame').bounding_box(); sb = p2.locator('.mts-stage').bounding_box()
            ok(fb['x'] >= sb['x'] - 1 and fb['x'] + fb['width'] <= sb['x'] + sb['width'] + 1, f'{lang.upper()} {w} px : le cadre reste dans la vidéo')
            p2.screenshot(path=str(OUT / f'e5b-extraits-{lang}-{w}.png'), full_page=True)
            c2.close()
        b.close()
finally:
    cur.execute("delete from activity_controls where queue='render' and ref in (select id::text from editor_renders where talk_id=%s)", (T,)) if talks else None
    for t in talks:
        for o in s3.list_objects_v2(Bucket='majlis-videos', Prefix=f'hls/{t}/').get('Contents', []): s3.delete_object(Bucket='majlis-videos', Key=o['Key'])
        cur.execute('delete from talks where id=%s', (t,))
    for u in users: cur.execute('delete from users where id=%s', (u,))
print(f"\n{'ÉCHECS : ' + str(len(bad)) if bad else 'Tout est bon'} — captures dans {OUT}")
sys.exit(1 if bad else 0)
