#!/usr/bin/env python3
"""Étape E5a : montage par le texte dans le navigateur (onglet « Texte » de l'éditeur).
Vérifie : onglet Texte (colonne élargie, choix gardé au rechargement), mots précis, clic sur un mot = la vidéo y va,
sélection à la souris + Suppr = passage coupé (mots barrés, extraits dans la timeline, montage enregistré), Ctrl+Z / Ctrl+Maj+Z,
« Rétablir », Maj + clic, recherche puis « Couper la sélection », traduction phrase par phrase, place estimée signalée,
tout le texte coupé puis annulé, lecture seule (second utilisateur), FR + AR (RTL), 1440 / 1024 px sans débordement.
Prérequis : API (3055), PG (5544), S3 de test (5599), site (3001) recompilé (npx next build), FFmpeg.
Lancement (depuis web/) : python3 tests/e5a_text.py [dossier des captures]"""
import pathlib, sys, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-e5a'); OUT.mkdir(parents=True, exist_ok=True)
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
em = f'e5w-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': f'Orga {tag}'})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
org = login(em, 'Passw0rd-test')
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
               values (%s,'d','Cheikh Test','upload',%s,%s,'published','ready','free',60,'fr','fr','ready') returning id""", (f'Texte {tag}', f'talks/{tag}', oid))
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
def clips(pg): return pg.locator('.mt-row-video .mt-clip').count()
def cut_n(pg): return pg.locator('.mtw-w.cut').count()
def W(pg, seg, k): return pg.locator(f'.mtw-seg[data-seg="{seg}"] .mtw-w').nth(k)
def db_clips(pid):
    cur.execute('select timeline from editor_projects where id=%s', (pid,)); return [(c['in'], c['out']) for c in cur.fetchone()[0]['clips']]
def drag(pg, a, b):
    ba = a.bounding_box(); bb = b.bounding_box()
    pg.mouse.move(ba['x'] + 3, ba['y'] + ba['height'] / 2); pg.mouse.down()
    pg.mouse.move(bb['x'] + bb['width'] - 3, bb['y'] + bb['height'] / 2, steps=6); pg.mouse.up()

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
        pg.goto(f'{WEB}/studio/editor/{pid}'); pg.wait_for_selector('.mt-editor .mt-clip', timeout=25000)
        until(lambda: pg.locator('.mt-readonly').count() == 0, 10)
        ok(pg.locator('.mtw-tabs [data-tab="settings"][aria-selected="true"]').count() == 1, 'colonne de droite : « Réglages » par défaut')
        w0 = pg.locator('.mt-right').bounding_box()['width']
        pg.locator('.mtw-tabs [data-tab="text"]').click()
        pg.wait_for_selector('.mtw-text .mtw-w', timeout=15000)
        ok(pg.locator('.mt-right').bounding_box()['width'] > w0 + 100, f"onglet « Texte » : colonne élargie ({w0:.0f} → {pg.locator('.mt-right').bounding_box()['width']:.0f} px)")
        ok(pg.locator('.mtw-seg').count() == n and pg.locator('.mtw-w').count() == n * 10, f'texte entier, mot à mot ({pg.locator(".mtw-w").count()} mots)')
        foot = pg.locator('.mtw-foot').inner_text()
        ok(f'précise pour {n - 1} phrases sur {n}' in foot and 'Coupés : 0' in foot, f'précision signalée (une phrase estimée) : « {foot} »')
        ok(pg.locator('.mtw-lang select option').count() == 2 and 'langue parlée' in pg.locator('.mtw-lang select').inner_text(), 'choix de la langue : FR (langue parlée) et EN')

        # Clic sur un mot : la vidéo y va.
        W(pg, 4, 0).click()
        ok(until(lambda: 'cur' in W(pg, 4, 0).get_attribute('class') and pg.locator('.mt-clock b').inner_text() == '00:00:24', 5), 'clic sur un mot : la vidéo va à 0:24, mot en cours surligné')

        # Sélection à la souris + Suppr.
        drag(pg, W(pg, 2, 0), W(pg, 2, 2))
        ok(pg.locator('.mtw-w.sel').count() == 3 and 'Mots sélectionnés : 3' in pg.locator('.mtw-selinfo').inner_text(), 'glisser : trois mots sélectionnés')
        pg.keyboard.press('Delete')
        ok(cut_n(pg) == 3 and clips(pg) == 2, f'Suppr : trois mots barrés, la vidéo est coupée (extraits : {clips(pg)})')
        ok('1,5 s'.replace(' s', '') in pg.locator('.mtw-msg').inner_text() or '0:01,5' in pg.locator('.mtw-msg').inner_text(), f"message : durée retirée ({pg.locator('.mtw-msg').inner_text()})")
        ok(until(lambda: db_clips(pid) == [(0, 12), (13.5, 60)], 10), f'montage enregistré : passage 12 s → 13,5 s retiré ({db_clips(pid)})')
        ok('0:58' in pg.locator('.mt-sum').inner_text(), 'durée du montage : 0:58 sur 1:00')
        pg.keyboard.press('Control+z'); ok(cut_n(pg) == 0 and clips(pg) == 1, 'Ctrl+Z : les mots reviennent')
        pg.keyboard.press('Control+Shift+z'); ok(cut_n(pg) == 3 and clips(pg) == 2, 'Ctrl+Maj+Z : de nouveau coupés')

        # Rétablir (sélection d'un mot coupé, Maj + clic pour étendre).
        W(pg, 2, 1).click(); W(pg, 2, 2).click(modifiers=['Shift'])
        ok(pg.locator('.mtw-w.sel').count() == 2, 'Maj + clic : sélection étendue')
        ok(pg.locator('[data-act="text-cut"]').is_disabled() and pg.locator('[data-act="text-restore"]').is_enabled(), 'mots déjà coupés : « Couper » inactif, « Rétablir » actif')
        pg.locator('[data-act="text-restore"]').click()
        ok(cut_n(pg) == 1 and clips(pg) == 2, f'« Rétablir » : deux mots reviennent, le premier reste coupé ({cut_n(pg)})')
        ok(until(lambda: db_clips(pid) == [(0, 12), (12.5, 60)], 10), f'montage : extrait suivant rallongé ({db_clips(pid)})')

        # Recherche puis « Couper la sélection ».
        pg.fill('.mtw-search', 'phrase 7')
        ok('1 sur 1' in pg.locator('.mtw-hits').inner_text() and pg.locator('.mtw-w.hit').count() == 2, 'recherche « phrase 7 » : un résultat surligné')
        pg.locator('.mtw-search').press('Enter')
        ok(pg.locator('.mtw-w.sel').count() == 2, 'Entrée : le résultat est sélectionné')
        pg.locator('[data-act="text-cut"]').click()
        ok(cut_n(pg) == 3 and clips(pg) == 3, '« Couper la sélection » : coupé')
        pg.fill('.mtw-search', 'xyzw'); ok('Aucun résultat' in pg.locator('.mtw-hits').inner_text(), 'recherche sans résultat'); pg.fill('.mtw-search', '')
        ok(ov(pg) <= 1, 'éditeur en mode texte sans débordement (1440 px)')
        pg.screenshot(path=str(OUT / 'e5a-texte-fr-1440.png'))

        # Tout sélectionner puis couper : refusé.
        W(pg, 0, 0).click(); W(pg, n - 1, 9).click(modifiers=['Shift'])
        pg.keyboard.press('Delete')
        ok(clips(pg) == 1 and cut_n(pg) == n * 10, 'tout le texte coupé : il ne reste que la fin muette après le dernier mot')
        pg.keyboard.press('Control+z'); ok(clips(pg) == 3 and cut_n(pg) == 3, 'Ctrl+Z : tout revient')
        pg.keyboard.press('Escape'); ok(pg.locator('.mtw-w.sel').count() == 0, 'Échap : sélection effacée')

        # Traduction : phrase par phrase.
        pg.locator('.mtw-lang select').select_option('en')
        ok(until(lambda: pg.locator('.mtw-w').count() == n and 'Sentence 1 in English.' in pg.locator('.mtw-text').inner_text(), 10), 'anglais : une unité par phrase')
        ok('phrase par phrase' in pg.locator('.mtw-foot').inner_text(), 'mode phrase signalé')
        ok(pg.locator('.mtw-w.cut').count() == 0, 'phrases en grande partie gardées : non barrées')
        W(pg, 9, 0).click()
        ok('Phrases sélectionnées : 1' in pg.locator('.mtw-status').inner_text(), 'mode phrase : une phrase sélectionnée')
        pg.keyboard.press('Delete')
        ok(clips(pg) == 4 and W(pg, 9, 0).get_attribute('data-cut') == '1', 'phrase 10 coupée en entier depuis l’anglais')
        ok(until(lambda: db_clips(pid) == [(0, 12), (12.5, 36), (37, 54), (59.1, 60)], 10), f'montage : 54 s → 59,1 s retiré ({db_clips(pid)})')

        # Rechargement : onglet gardé, coupes là.
        until(lambda: 'enregistré automatiquement' in pg.locator('.mt-titles').inner_text(), 10)
        pg.reload(); pg.wait_for_selector('.mtw-text .mtw-w', timeout=25000)
        ok(pg.locator('.mtw-tabs [data-tab="text"][aria-selected="true"]').count() == 1 and cut_n(pg) == 1 + 2 + 10, f'rechargement : onglet Texte gardé, mots coupés toujours barrés ({cut_n(pg)})')

        # Lecture seule : un second utilisateur (administrateur) parcourt le texte sans pouvoir couper.
        actx, apg = page(adm)
        apg.goto(f'{WEB}/studio/editor/{pid}'); apg.wait_for_selector('.mt-readonly', timeout=25000)
        apg.locator('.mtw-tabs [data-tab="text"]').click(); apg.wait_for_selector('.mtw-text .mtw-w', timeout=15000)
        drag(apg, W(apg, 1, 0), W(apg, 1, 1))
        ok(apg.locator('[data-act="text-cut"]').is_disabled() and 'Lecture seule' in apg.locator('.mtw').inner_text(), 'lecture seule : « Couper » inactif, message')
        apg.keyboard.press('Delete'); ok(apg.locator('.mtw-w.cut').count() == 13, 'lecture seule : Suppr ne coupe rien')
        actx.close()
        ctx.close()

        # Arabe (RTL) et 1024 px.
        for lang, w in (('ar', 1440), ('fr', 1024)):
            c2, p2 = page(org, w=w, lang=lang)
            p2.goto(f'{WEB}/studio/editor/{pid}'); p2.wait_for_selector('.mt-editor .mt-clip', timeout=25000)
            p2.locator('.mtw-tabs [data-tab="text"]').click(); p2.wait_for_selector('.mtw-text .mtw-w', timeout=15000); p2.wait_for_timeout(600)
            tabs = p2.locator('.mtw-tabs').inner_text()
            ok((lang != 'ar' or ('النص' in tabs and p2.evaluate('document.documentElement.dir') == 'rtl')) and ov(p2) <= 1, f'{lang.upper()} {w} px : onglet Texte, sans débordement')
            p2.screenshot(path=str(OUT / f'e5a-texte-{lang}-{w}.png'))
            c2.close()
        b.close()
finally:
    for t in talks:
        for o in s3.list_objects_v2(Bucket='majlis-videos', Prefix=f'hls/{t}/').get('Contents', []): s3.delete_object(Bucket='majlis-videos', Key=o['Key'])
        cur.execute('delete from talks where id=%s', (t,))
    for u in users: cur.execute('delete from users where id=%s', (u,))
print(f"\n{'ÉCHECS : ' + str(len(bad)) if bad else 'Tout est bon'} — captures dans {OUT}")
sys.exit(1 if bad else 0)
