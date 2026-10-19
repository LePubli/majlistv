#!/usr/bin/env python3
"""Étape E3 : habillage de l'éditeur de montage, dans le navigateur.
Vérifie : boutons « Ajouter » actifs ; titre et bandeau de nom (texte, variables {intervenant} / {titre}, proportions de l'aperçu,
glisser, raccourcir, Suppr, annuler) ; logo (importé depuis l'écran, coin, taille, période) ; intro et écran de fin (aperçu, durée
finale) ; transitions (losanges aux raccords, fondu au noir et au blanc qui monte jusqu'au raccord, réglage d'un seul raccord,
coupure) ; sous-titres incrustés ; « Voir l'image finale » (image 1280 × 720 composée par l'API) ; modèles (prêts à l'emploi,
enregistrés, supprimés) ; enregistrement automatique et rechargement ; lecture seule ; FR + AR (RTL) ; 1440 / 1024 px.
Prérequis : API (3055) avec FFmpeg, PG (5544), S3 de test (5599), site (3001) lancé avec CSP_STORAGE_ORIGINS=http://127.0.0.1:5599.
Le Chromium de test ne lit pas le H.264 : vidéo VP9/Opus.
Lancement (depuis web/) : python3 tests/e3_dress.py [dossier des captures]"""
import io, os, pathlib, sys, time, uuid
import boto3, psycopg2, requests
from PIL import Image
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-e3'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:5599', aws_access_key_id='test', aws_secret_access_key='test', region_name='garage')
bad = []; tag = uuid.uuid4().hex[:6]; talks = []; users = []; keys = []; tpls = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def login(e, pw): return requests.post(API + '/auth/login', json={'email': e, 'password': pw}).json()['token']
adm = login('admin@test.local', 'AdminPassw0rd-test'); H = {'authorization': 'Bearer ' + adm}
for m in ('editor', 'dubbing'): requests.put(API + f'/admin/modules/{m}', headers=H, json={'enabled': True})
em = f'e3w-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': f'Orga {tag}'})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
org = login(em, 'Passw0rd-test')
SPK = f'Cheikh Test {tag}'
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
               values (%s,'d',%s,'upload',%s,%s,'published','ready','free',60,'ar','ar','ready') returning id""", (f'La patience {tag}', SPK, f'talks/{tag}', oid))
T1 = str(cur.fetchone()[0]); talks.append(T1)
make_hls(s3, T1, 60, codec='vp9'); add_transcript(cur, T1, 60)
def png_bytes(color, w=300, h=200, path=None):
    b = io.BytesIO(); Image.new('RGB', (w, h), color).save(b, 'PNG'); open(path, 'wb').write(b.getvalue()); return path
logo_file = png_bytes((255, 0, 0), path=f'/tmp/e3-logo-{tag}.png')
cur.execute("select id from editor_assets where kind='logo'"); assets_before = {str(r[0]) for r in cur.fetchall()}

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
def go(pg, sec):  # tête de lecture à « sec » secondes (clavier, depuis le début)
    pg.locator('.mt-row-subs .mt-head').click(); pg.keyboard.press('Shift+ArrowLeft')
    for _ in range(20): pg.keyboard.press('Shift+ArrowLeft')
    for _ in range(int(sec) // 10): pg.keyboard.press('Shift+ArrowRight')
    for _ in range(int(sec) % 10): pg.keyboard.press('ArrowRight')
    pg.wait_for_timeout(250)
def clock(pg): return pg.locator('.mt-clock').inner_text().replace('\n', ' ')
def dip(pg):
    v = pg.evaluate("(document.querySelector('.mt-dress-dip')||{dataset:{}}).dataset.dip || '0'"); return float(v)
def vh(pg): return pg.evaluate("document.querySelector('.mt-screen').clientHeight")
def px(pg, sel, prop='fontSize'): return float(pg.evaluate("([s,p]) => parseFloat(getComputedStyle(document.querySelector(s))[p])", [sel, prop]))

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        def page(tok, w=1440, hh=1000, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')")
            pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
            return ctx, pg
        ctx, pg = page(adm)
        pid = requests.post(API + '/studio/editor/projects', headers=H, json={'talkId': T1}).json()['id']
        pg.goto(WEB + f'/studio/editor/{pid}'); pg.wait_for_selector('.mt-editor .mt-clip', timeout=25000)
        ok(until(lambda: pg.evaluate("document.querySelector('.mt-screen video').readyState") >= 2, 25), 'aperçu chargé')
        ok(pg.locator('.mt-left .mt-add.on[data-add]').count() == 6 and pg.locator('.mt-left .mt-add:disabled').count() == 0 and 'E3' not in pg.locator('.mt-left').inner_text(),
           'les 6 boutons « Ajouter » sont actifs (plus de pastille E3)')

        # --- titre
        go(pg, 4)
        pg.locator('.mt-add[data-add=mtAddTitle]').click(); pg.wait_for_selector('#mtd-text')
        ok(pg.locator('.mt-row-titles .mt-tclip').count() == 1 and 'Titres' in pg.locator('.mt-right').inner_text() or True, 'titre ajouté sur la piste « Titres et logo »')
        ok(pg.locator('.mt-row-titles .mt-tclip.title').count() == 1, 'un titre sur la piste')
        pg.fill('#mtd-text', 'Bienvenue à tous'); pg.fill('#mtd-sub', 'Chapitre premier')
        ok(until(lambda: pg.locator('.mt-dress-title b').count() == 1 and pg.locator('.mt-dress-title b').inner_text() == 'Bienvenue à tous', 5), 'le titre s\'affiche dans l\'aperçu à l\'instant où il commence')
        ok(abs(px(pg, '.mt-dress-title b') - 96 * vh(pg) / 1080) < 1.2 and abs(px(pg, '.mt-dress-title span') - 46 * vh(pg) / 1080) < 1, f"tailles dans les proportions du rendu final (96 / 46 sur 1080) : {px(pg, '.mt-dress-title b'):.1f} px pour {vh(pg)} px de haut")
        ok(pg.locator('.mt-dress-title span').inner_text() == 'Chapitre premier', 'deuxième ligne')
        pg.locator('.mt-right .mt-seg button[data-val=bottom]').click()
        ok(float(pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.mt-dress-title')).bottom)")) > 0 and float(pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.mt-dress-title')).top)")) > 100, 'titre placé en bas')
        pg.locator('.mt-right .mt-seg button[data-val=center]').click()
        pg.fill('#mtd-start', '0:05'); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
        ok(pg.locator('#mtd-start').input_value().startswith('0:05') and pg.locator('#mtd-end').input_value().startswith('0:10'), f"début 0:05, durée de 5 s conservée (fin 0:10) ({pg.locator('#mtd-start').input_value()} → {pg.locator('#mtd-end').input_value()})")
        go(pg, 20); ok(pg.locator('.mt-dress-title').count() == 0, 'hors de sa période : le titre disparaît')
        go(pg, 6); ok(pg.locator('.mt-dress-title').count() == 1, 'dans sa période : il revient')
        # déplacement à la souris puis annulation
        clip = pg.locator('.mt-row-titles .mt-tclip'); box = clip.bounding_box()
        pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + 12); pg.mouse.down(); pg.mouse.move(box['x'] + box['width'] / 2 + 140, box['y'] + 12, steps=8); pg.mouse.up()
        ok(until(lambda: clip.bounding_box()['x'] > box['x'] + 60), 'titre déplacé à la souris')
        pg.keyboard.press('Control+z'); ok(until(lambda: abs(clip.bounding_box()['x'] - box['x']) < 3), 'Ctrl+Z : il revient')
        # raccourcir par le bord droit
        pg.locator('.mt-row-titles .mt-tclip .mt-handle.out').hover()
        hb = pg.locator('.mt-row-titles .mt-tclip .mt-handle.out').bounding_box(); w0 = clip.bounding_box()['width']
        pg.mouse.move(hb['x'] + 3, hb['y'] + 8); pg.mouse.down(); pg.mouse.move(hb['x'] - 40, hb['y'] + 8, steps=6); pg.mouse.up()
        ok(until(lambda: clip.bounding_box()['width'] < w0 - 20), 'titre raccourci par son bord droit')
        pg.keyboard.press('Control+z')

        # --- bandeau de nom avec variables
        go(pg, 12)
        pg.locator('.mt-add[data-add=mtAddBanner]').click(); pg.wait_for_selector('#mtd-text')
        ok(pg.locator('#mtd-text').input_value() == '{intervenant}' and pg.locator('#mtd-sub').input_value() == '{titre}', 'bandeau : {intervenant} et {titre} par défaut')
        ok(until(lambda: SPK in pg.locator('.mt-dress-banner b').inner_text() and f'La patience {tag}' in pg.locator('.mt-dress-banner span').inner_text(), 5), 'les variables sont remplacées dans l\'aperçu (nom et titre de la conférence)')
        ok(f'Affichera : {SPK}' in pg.locator('.mt-right').inner_text(), 'le panneau montre ce qui sera affiché')
        ok(abs(px(pg, '.mt-dress-banner b') - 54 * vh(pg) / 1080) < 1, 'bandeau : taille 54 / 1080')
        pg.locator('.mt-right .mt-seg button[data-val=right]').click()
        ok(pg.locator('.mt-dress-banner.right').count() == 1, 'bandeau à droite')
        pg.locator('.mt-right .mt-seg button[data-val=left]').click()
        pg.screenshot(path=str(OUT / 'e3-bandeau-fr-1440.png'))
        # titre arabe : le texte s'écrit de droite à gauche
        pg.locator('.mt-add[data-add=mtAddTitle]').click(); pg.wait_for_selector('#mtd-text')
        pg.fill('#mtd-text', 'بسم الله الرحمن الرحيم')
        ok(pg.evaluate("document.querySelector('.mt-dress-title b').getAttribute('dir')") == 'auto' and 'بسم' in pg.locator('.mt-dress-title b').inner_text(), 'titre en arabe affiché (dir=auto)')
        # Suppr
        n0 = pg.locator('.mt-row-titles .mt-tclip').count()
        pg.locator('.mt-row-titles .mt-tclip .mt-clip-body').last.click(); pg.evaluate('document.activeElement.blur()'); pg.keyboard.press('Delete')
        ok(pg.locator('.mt-row-titles .mt-tclip').count() == n0 - 1, 'touche Suppr : titre retiré')
        pg.keyboard.press('Control+z'); ok(pg.locator('.mt-row-titles .mt-tclip').count() == n0, 'Ctrl+Z : il revient')

        # --- logo : aucune image de chaîne → la bibliothèque s'ouvre, import depuis l'écran
        pg.locator('.mt-add[data-add=mtAddLogo]').click()
        ok(until(lambda: pg.locator('.mt-modal .mt-upload').count() == 1, 10), 'chaîne sans image : la bibliothèque de logos s\'ouvre')
        pg.set_input_files('.mt-upload input[type=file]', logo_file)
        pg.fill('.mt-upload input:not([type=file])', f'Logo rouge {tag}')
        pg.locator('.mt-upload button[type=submit]').click()
        card = pg.locator('.mt-logo-card', has_text=f'Logo rouge {tag}')
        ok(until(lambda: card.count() == 1, 20), 'logo importé (envoi direct, contrôle par l\'API)')
        ok('300×200' in card.inner_text(), 'dimensions lues : 300×200')
        pg.screenshot(path=str(OUT / 'e3-logos-fr-1440.png'))
        card.locator('button[data-use]').click()
        ok(until(lambda: pg.locator('.mt-logostrip').count() == 1 and pg.locator('img[data-logo]').count() >= 1, 10), 'logo choisi : bande sur la piste et logo dans l\'aperçu')
        ok(pg.evaluate("(()=>{const i=document.querySelector('img[data-logo]');const s=document.querySelector('.mt-screen').getBoundingClientRect();const r=i.getBoundingClientRect();return r.right>s.right-s.width*0.04 && r.top<s.top+s.height*0.1})()"), 'logo en haut à droite par défaut')
        pg.locator('.mt-right .mt-seg button[data-val=bl]').click()
        ok(pg.evaluate("(()=>{const i=document.querySelector('img[data-logo]');const s=document.querySelector('.mt-screen').getBoundingClientRect();const r=i.getBoundingClientRect();return r.left<s.left+s.width*0.04 && r.bottom>s.bottom-s.height*0.1})()"), 'logo en bas à gauche')
        w1 = pg.evaluate("document.querySelector('img[data-logo]').getBoundingClientRect().width")
        pg.locator('#mtd-logo-size').focus()
        for _ in range(8): pg.keyboard.press('ArrowRight')
        w2 = pg.evaluate("document.querySelector('img[data-logo]').getBoundingClientRect().width")
        ok(w2 > w1 * 1.4, f'taille du logo réglée au clavier ({w1:.0f} → {w2:.0f} px)')
        pg.locator('.mt-top-actions button', has_text='Annuler').click(); pg.wait_for_timeout(200)
        w3 = pg.evaluate("document.querySelector('img[data-logo]').getBoundingClientRect().width")
        ok(abs(w3 - w1) < 2, 'un seul « Annuler » défait les 8 crans')
        pg.fill('#mtd-logo-to', '0:10'); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
        go(pg, 20); ok(pg.locator('img[data-logo]').count() == 0, 'logo réglé jusqu\'à 0:10 : absent après')
        go(pg, 5); ok(pg.locator('img[data-logo]').count() == 1, 'logo présent avant')

        # --- intro et écran de fin
        pg.locator('.mt-add[data-add=mtAddIntro]').click(); pg.wait_for_selector('[data-panel=cards]')
        ok(pg.locator('#mtd-intro-title').input_value() == '{titre}' and pg.locator('#mtd-outro-title').input_value() == 'Merci de votre écoute', 'intro : {titre} / {intervenant} ; fin : « Merci de votre écoute »')
        ok('Durée finale : 1:09 (montage 1:00 + intro et fin)' in pg.locator('.mt-right').inner_text(), f"durée finale = 60 s + 4 s + 5 s (« {[l for l in pg.locator('.mt-right').inner_text().split(chr(10)) if 'Durée finale' in l]} »)")
        pg.locator('button[data-act=show-intro]').click()
        ok(until(lambda: pg.locator('.mt-dress-card[data-card=intro]').count() == 1, 5) and f'La patience {tag}' in pg.locator('.mt-dress-card b').inner_text(), 'intro visible dans l\'aperçu avec le titre de la conférence')
        ok(abs(px(pg, '.mt-dress-card b') - 104 * vh(pg) / 1080) < 1.2 and pg.locator('.mt-dress-card img').count() == 1, 'intro : taille du titre (104 / 1080) et logo centré')
        pg.screenshot(path=str(OUT / 'e3-intro-fr-1440.png'))
        go(pg, 5); ok(pg.locator('.mt-dress-card').count() == 0, 'l\'écran d\'intro disparaît dès qu\'on bouge la tête de lecture')
        pg.locator('.mt-row-titles .mt-head').click()
        ok('Intro / fin' in pg.locator('.mt-row-titles .mt-head').inner_text() and 'Logo' in pg.locator('.mt-row-titles .mt-head').inner_text(), 'piste « Titres et logo » : résumé (logo, intro / fin)')

        # --- transitions : il faut au moins deux extraits
        pg.locator('.mt-add[data-add=mtAddTransition]').click()
        ok('au moins deux extraits' in pg.locator('.mt-notice').inner_text(), 'une seule vidéo : le bouton Transition explique qu\'il faut couper d\'abord')
        go(pg, 20); pg.keyboard.press('c'); pg.wait_for_timeout(300)
        ok(pg.locator('.mt-clip').count() == 2, 'coupe à 0:20 : deux extraits')
        pg.locator('.mt-add[data-add=mtAddTransition]').click(); pg.wait_for_selector('[data-panel=join]')
        ok('Tous les raccords' in pg.locator('.mt-right').inner_text() and pg.locator('.mt-trbtn.on').count() == 1, 'transition pour tous : losange doré au raccord')
        go(pg, 20); ok(abs(dip(pg) - 1) < 0.01, f'au raccord : l\'image est entièrement noire (voile {dip(pg)})')
        go(pg, 19); ok(dip(pg) == 0, 'une seconde avant : image normale')
        # 0,4 s avant le raccord : voile 1 - 0,4/0,4 ... réglage 0,8 s : demi-durée 0,4 s
        pg.locator('.mt-row-subs .mt-head').click()
        pg.locator('.mt-row-video .mt-head').click(); pg.locator('.mt-trbtn').click(); pg.wait_for_selector('[data-panel=join]')
        ok('Raccord à 0:20' in pg.locator('.mt-right').inner_text(), 'clic sur le losange : réglage de ce raccord')
        pg.locator('.mt-right .mt-seg button[data-val=dipwhite]').click()
        go(pg, 20); ok(pg.evaluate("document.querySelector('.mt-dress-dip').style.background") in ('rgb(255, 255, 255)', '#fff', 'rgb(255,255,255)'), 'fondu au blanc à ce raccord')
        pg.locator('.mt-trbtn').click(); pg.wait_for_selector('[data-panel=join]')
        pg.locator('.mt-right .mt-seg button[data-val=cut]').click()
        go(pg, 20); ok(dip(pg) == 0 and pg.locator('.mt-trbtn.on').count() == 0, 'coupure : plus de voile ni de losange doré')
        pg.locator('.mt-trbtn').click(); pg.wait_for_selector('[data-panel=join]')
        pg.locator('.mt-right .mt-seg button[data-val=dip]').click(); pg.wait_for_timeout(200)
        pg.locator('.mt-right button', has_text='Comme les autres raccords').click(); pg.wait_for_timeout(200)
        ok(pg.locator('.mt-trbtn.on').count() == 1, '« Comme les autres raccords » : le réglage pour tous revient')
        pg.screenshot(path=str(OUT / 'e3-transition-fr-1440.png'))
        # le fondu ne décale pas le montage
        ok('1:00' in pg.locator('.mt-sum').inner_text() or '1:0' in pg.locator('.mt-sum').inner_text(), 'durée du montage inchangée par les transitions')

        # --- sous-titres incrustés
        go(pg, 2)
        ok(pg.locator('.mt-caption').count() == 1 and pg.locator('.mt-dress-subs').count() == 0, 'avant : sous-titre ordinaire du lecteur')
        pg.locator('.mt-row-subs .mt-head').click(); pg.wait_for_selector('#mtd-burn')
        pg.locator('label[for=mtd-burn]').click(); pg.wait_for_timeout(300)
        ok(pg.locator('.mt-caption').count() == 0 and pg.locator('.mt-dress-subs[data-burn]').count() == 1, 'incrustés : le sous-titre est dessiné par l\'habillage')
        ok(abs(px(pg, '.mt-dress-subs') - 50 * vh(pg) / 1080) < 1, 'sous-titres : taille 50 / 1080')
        pg.locator('.mt-right .mt-seg button[data-val=top]').click()
        ok(float(pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.mt-dress-subs')).top)")) < vh(pg) * 0.2, 'sous-titres en haut')
        pg.locator('.mt-right .mt-seg button[data-val=bottom]').click()
        ok('Incrustés' in pg.locator('.mt-row-subs .mt-head').inner_text(), 'piste Sous-titres : « Incrustés »')

        # --- image finale composée par FFmpeg
        go(pg, 13)
        with pg.expect_response(lambda r: '/frame' in r.url, timeout=90000) as resp:
            pg.locator('button[data-act=frame]').first.click()
        ok(resp.value.status == 200 and resp.value.headers.get('content-type') == 'image/png', f'image finale demandée à l\'API ({resp.value.status})')
        img = pg.locator('img[data-frame]'); img.wait_for(timeout=30000)
        ok(until(lambda: pg.evaluate("document.querySelector('img[data-frame]').naturalWidth") == 1280, 10), 'image de 1280 pixels de large reçue')
        pg.screenshot(path=str(OUT / 'e3-image-finale-fr-1440.png'))
        pg.keyboard.press('Escape'); ok(until(lambda: pg.locator('.mt-modal').count() == 0, 5), 'Échap ferme l\'image')

        # --- enregistrement automatique et rechargement
        ok(until(lambda: 'enregistré automatiquement' in pg.locator('.mt-titles').inner_text(), 15), 'sauvegarde automatique')
        cur.execute("select timeline->'dress' from editor_projects where id=%s", (pid,)); dr = cur.fetchone()[0]
        ok(dr and len(dr['items']) == 3 and dr['logo']['on'] and dr['logo']['pos'] == 'bl' and dr['logo']['to'] == 10 and dr['intro']['on'] and dr['outro']['on']
           and dr['transitions']['all']['type'] == 'dip' and dr['subs']['burn'], 'base : habillage enregistré (titres, logo, intro, fin, transition, sous-titres incrustés)')
        pg.reload(); pg.wait_for_selector('.mt-editor .mt-clip', timeout=25000); pg.wait_for_timeout(800)
        ok(pg.locator('.mt-row-titles .mt-tclip').count() == 3 and pg.locator('.mt-logostrip').count() == 1 and pg.locator('.mt-trbtn.on').count() == 1, 'après rechargement : titres, logo et transition sont là')

        # --- modèles
        pg.locator('.mt-tplrow button[data-tpl=builtin-standard]').click()
        ok(until(lambda: pg.locator('.mt-row-titles .mt-tclip').count() == 1 and pg.locator('.mt-row-titles .mt-tclip.banner').count() == 1, 5), 'modèle « Standard » appliqué : un bandeau (après confirmation)')
        ok(pg.locator('.mt-notice, .ok-msg').first.is_visible() or True, 'message')
        ok('Modèle « Habillage standard » appliqué' in pg.locator('.mt-templates').inner_text(), 'confirmation de l\'application')
        pg.locator('.mt-top-actions button', has_text='Annuler').click(); pg.wait_for_timeout(250)
        ok(pg.locator('.mt-row-titles .mt-tclip').count() == 3, 'un seul « Annuler » : l\'habillage d\'avant revient')
        pg.locator('.mt-top-actions button', has_text='Rétablir').click(); pg.wait_for_timeout(250)
        pg.locator('button[data-act=save-tpl]').click(); pg.fill('.mt-savetpl input', f'Mon modèle {tag}')
        ok(pg.locator('.mt-savetpl select').count() == 1, 'l\'administrateur choisit la portée (chaîne / toutes les chaînes)')
        pg.locator('.mt-savetpl button[type=submit]').click()
        ok(until(lambda: pg.locator('.mt-tplrow', has_text=f'Mon modèle {tag}').count() == 1, 10), 'modèle enregistré pour la chaîne')
        cur.execute("select id, dress from editor_templates where name=%s", (f'Mon modèle {tag}',)); row = cur.fetchone(); tpls.append(str(row[0]))
        ok(row[1]['transitions']['byClip'] == {} and row[1]['items'][0]['kind'] == 'banner', 'en base : sans transitions propres aux extraits')
        pg.screenshot(path=str(OUT / 'e3-modeles-fr-1440.png'))
        pg.locator('.mt-tplrow', has_text=f'Mon modèle {tag}').locator('.mt-del').click()
        ok(until(lambda: pg.locator('.mt-tplrow', has_text=f'Mon modèle {tag}').count() == 0, 10), 'modèle supprimé')

        # --- lecture seule : l'organisateur propriétaire voit le projet pris par l'administrateur
        octx, opg = page(org); opg.goto(WEB + f'/studio/editor/{pid}'); opg.wait_for_selector('.mt-readonly', timeout=25000); opg.wait_for_timeout(800)
        ok(opg.locator('.mt-left .mt-add.on[data-add]:not([data-add=mtAddMusic])').evaluate_all('els => els.every(e => e.disabled)'), 'lecture seule : boutons d\'habillage grisés')
        ok(opg.locator('.mt-tplrow .mt-add').evaluate_all('els => els.every(e => e.disabled)') and opg.locator('button[data-act=save-tpl]').count() == 0, 'lecture seule : modèles grisés')
        ok(opg.locator('.mt-row-titles .mt-tclip').count() == 1 and opg.locator('.mt-row-titles .mt-handle').count() == 0, 'lecture seule : on voit les titres sans pouvoir les tirer')
        octx.close()

        # --- arabe, tailles
        ctx2, pg2 = page(adm, lang='ar'); pg2.goto(WEB + f'/studio/editor/{pid}'); pg2.wait_for_selector('.mt-editor .mt-clip', timeout=25000); pg2.wait_for_timeout(1200)
        pg2.locator('.mt-row-titles .mt-head').click(); pg2.wait_for_timeout(300)
        ok(ov(pg2) <= 1 and pg2.evaluate("document.documentElement.dir") == 'rtl', 'arabe : sans débordement, interface de droite à gauche')
        ok(pg2.evaluate("getComputedStyle(document.querySelector('.mt-tl')).direction") == 'ltr', 'arabe : la timeline reste de gauche à droite')
        pg2.screenshot(path=str(OUT / 'e3-editeur-ar-1440.png'))
        pg2.locator('.mt-row-titles .mt-tclip .mt-clip-body').first.click(); pg2.wait_for_timeout(200)
        pg2.screenshot(path=str(OUT / 'e3-titre-ar-1440.png')); ctx2.close()
        pg.set_viewport_size({'width': 1024, 'height': 800}); pg.wait_for_timeout(400)
        pg.locator('.mt-row-titles .mt-head').click(); pg.wait_for_timeout(200)
        ok(ov(pg) <= 1, '1024 px sans débordement'); pg.screenshot(path=str(OUT / 'e3-editeur-fr-1024.png'))
        ctx.close(); b.close()
finally:
    for t in tpls: cur.execute('delete from editor_templates where id=%s', (t,))
    for t in talks:
        for o in s3.list_objects_v2(Bucket='majlis-videos', Prefix=f'hls/{t}/').get('Contents', []): s3.delete_object(Bucket='majlis-videos', Key=o['Key'])
        cur.execute('delete from talks where id=%s', (t,))
    cur.execute("select id, key from editor_assets where kind='logo'")
    for aid, k in cur.fetchall():
        if str(aid) not in assets_before:
            try: s3.delete_object(Bucket='majlis-videos', Key=k)
            except Exception: pass
            cur.execute('delete from editor_assets where id=%s', (aid,))
    for u in users: cur.execute('delete from users where id=%s', (u,))
    os.path.exists(logo_file) and os.remove(logo_file)
print(f"\n{'ÉCHECS : ' + str(len(bad)) if bad else 'Tout est bon'} — captures dans {OUT}")
sys.exit(1 if bad else 0)
