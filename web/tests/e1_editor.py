#!/usr/bin/env python3
"""Étape E1 : éditeur de montage dans le navigateur.
Vérifie : liste (conférences à monter, vidéos non hébergées signalées), création d'un montage, éditeur plein écran (6 pistes,
sous-titres et voix française liés), aperçu 360p qui joue en suivant le montage, couper, supprimer un passage, annuler,
rétablir, déplacer un extrait à la souris, raccourcir depuis le panneau, sauvegarde automatique puis rechargement,
second utilisateur en lecture seule, autre onglet, reprise de la main, versions (nommée, retour en arrière),
Studio → Contenus (étape « Montée »), FR + AR (RTL), 1440 / 1024 / 390 px sans débordement, module désactivé.
Prérequis : API (3055), PG (5544), S3 de test (5599), site (3001) lancé avec CSP_STORAGE_ORIGINS=http://127.0.0.1:5599, FFmpeg.
Le Chromium de Playwright ne lit pas le H.264 : la vidéo de test est en VP9 (même chemin HLS, même lecteur hls.js).
Lancement (depuis web/) : python3 tests/e1_editor.py [dossier des captures]"""
import os, pathlib, sys, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-e1'); OUT.mkdir(parents=True, exist_ok=True)
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
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        def page(tok, w=1440, hh=1000, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')")
            pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
            return ctx, pg

        # --- liste
        ctx, pg = page(org)
        pg.goto(WEB + '/studio/editor'); pg.wait_for_selector('.mt-home .mt-item', timeout=25000); pg.wait_for_timeout(500)
        txt = pg.locator('.mt-home').inner_text()
        ok(f'La patience {tag}' in txt and 'non hébergée' in txt, 'liste : conférence à monter, vidéo YouTube signalée « non hébergée »')
        ok(pg.locator('.studio-nav a[href="/studio/editor"] .studio-soon').count() == 0, 'menu : « Éditeur » sans la mention « Bientôt »')
        ok(ov(pg) <= 1, 'liste sans débordement (1440 px)')
        pg.screenshot(path=str(OUT / 'e1-liste-fr-1440.png'))
        pg.locator('.mt-item', has_text=f'La patience {tag}').locator('button').click()
        href = lambda: pg.evaluate('location.href')  # pg.url ne suit pas toujours une navigation interne de Next.js
        ok(until(lambda: '/studio/editor/' in href() and pg.locator('.mt-editor .mt-clip').count() == 1, 25), '« Monter » crée le montage et ouvre l\'éditeur plein écran')
        pid = href().rstrip('/').split('/')[-1]

        # --- éditeur : pistes et pistes liées
        ok(pg.locator('.studio-nav').count() == 0, 'plein écran : pas de menu du Studio')
        ok(pg.locator('.mt-row').count() == 7, 'règle + 6 pistes (Vidéo, Voix d\'origine, Voix française, Musique, Titres et logo, Sous-titres)')
        ok('Version 1' in pg.locator('.mt-titles').inner_text() and 'Aperçu 360p' in pg.locator('.mt-badge').inner_text(), 'en-tête : « Version 1 », badge « Aperçu 360p »')
        ok(pg.locator('.mt-row-subs .mt-block').count() >= 10 and pg.locator('.mt-row-dub .mt-block.dub.keep').count() == 1, 'sous-titres liés et voix française (un passage en voix d\'origine)')
        # Depuis E3, les six boutons « Ajouter » et les modèles sont actifs.
        ok(pg.locator('.mt-add:disabled').count() == 0 and pg.locator('.mt-add.on', has_text='Musique de fond').count() == 1, 'Ajouter / Modèles : tout est actif (musique E2, habillage E3)')
        ok(pg.locator('button', has_text='Rendre la vidéo').is_enabled(), '« Rendre la vidéo » actif (étape E4a)')

        # --- aperçu 360p
        ok(until(lambda: pg.evaluate("document.querySelector('.mt-screen video').readyState") >= 2, 25), 'aperçu : la vidéo 360p se charge (hls.js)')
        pg.locator('.mt-transport .play').click()
        ok(until(lambda: pg.evaluate("document.querySelector('.mt-screen video').currentTime") > 1.5, 15), 'aperçu : lecture (la vidéo avance)')
        ok(until(lambda: pg.locator('.mt-clock b').inner_text() != '00:00:00', 5), 'horloge du montage qui avance')
        pg.locator('.mt-transport .play').click(); pg.wait_for_timeout(300)

        # --- couper, supprimer, annuler, rétablir
        pg.locator('.mt-row-music .mt-head').click()
        pg.keyboard.press('Home')
        pg.evaluate("document.activeElement.blur()")
        key(pg, 'ArrowLeft', 1); key(pg, 'Shift+ArrowLeft', 20)  # retour à 0
        key(pg, 'Shift+ArrowRight', 3)  # 0:30
        pg.locator('.mt-tools button', has_text='Couper').click()
        ok(clips(pg) == 2, 'couper à 0:30 : deux extraits')
        key(pg, 'Shift+ArrowRight', 1); key(pg, 'ArrowRight', 5)  # 0:45
        pg.keyboard.press('c')
        ok(clips(pg) == 3, 'couper à 0:45 (touche C) : trois extraits')
        pg.locator('.mt-row-video .mt-clip').nth(1).locator('.mt-clip-body').click()
        pg.locator('.mt-tools button', has_text='Supprimer le passage').click()
        ok(clips(pg) == 2 and pg.locator('.mt-join').count() == 1, 'supprimer le passage 0:30 → 0:45 : raccord hachuré')
        ok('1:45' in pg.locator('.mt-sum').inner_text(), 'durée du montage : 1:45 sur 2:00')
        pg.locator('.mt-top-actions button', has_text='Annuler').click(); ok(clips(pg) == 3, 'Annuler : le passage revient')
        pg.locator('.mt-top-actions button', has_text='Rétablir').click(); ok(clips(pg) == 2, 'Rétablir : le passage est de nouveau supprimé')
        pg.keyboard.press('Control+z'); ok(clips(pg) == 3, 'Ctrl+Z : annuler'); pg.keyboard.press('Control+Shift+z'); ok(clips(pg) == 2, 'Ctrl+Maj+Z : rétablir')

        # --- déplacer à la souris
        first = pg.locator('.mt-row-video .mt-clip').nth(0).bounding_box(); second = pg.locator('.mt-row-video .mt-clip').nth(1).bounding_box()
        pg.mouse.move(second['x'] + second['width'] / 2, second['y'] + 10); pg.mouse.down()
        pg.mouse.move(second['x'] + second['width'] / 2 - 40, second['y'] + 10, steps=4)
        pg.mouse.move(first['x'] + 6, first['y'] + 10, steps=10)
        ok(pg.locator('.mt-drop').count() == 1, 'glisser : repère de dépôt affiché')
        pg.mouse.up(); pg.wait_for_timeout(200)
        lb = labels(pg); ok(lb[0].startswith('0:45') and lb[1].startswith('0:00'), f'extrait déplacé au début à la souris ({lb})')

        # --- raccourcir depuis le panneau
        pg.locator('.mt-row-video .mt-clip').nth(0).locator('.mt-clip-body').click()
        pg.fill('#mt-out', '1:50'); pg.keyboard.press('Enter')
        ok(until(lambda: labels(pg)[0] == '0:45 → 1:50', 3), 'fin du 1er extrait ramenée à 1:50 (panneau)')

        # --- sauvegarde automatique
        ok(until(lambda: 'enregistré automatiquement' in pg.locator('.mt-titles').inner_text(), 10), 'sauvegarde automatique')
        cl, rev = db_tl(pid)
        ok([(c['in'], c['out']) for c in cl] == [(45, 110), (0, 30)] and rev > 1, f'base : montage enregistré ({[(c["in"], c["out"]) for c in cl]}, rev {rev})')
        ok('Version 2' in pg.locator('.mt-titles').inner_text(), 'version 2 (copie automatique de l\'état d\'avant)')
        ok(ov(pg) <= 1, 'éditeur sans débordement (1440 px)')
        pg.screenshot(path=str(OUT / 'e1-editeur-fr-1440.png'))
        pg.reload(); pg.wait_for_selector('.mt-editor .mt-clip', timeout=25000); pg.wait_for_timeout(800)
        ok(labels(pg) == ['0:45 → 1:50', '0:00 → 0:30'] and pg.locator('.mt-readonly').count() == 0, 'rechargement : le montage est là, toujours modifiable (même onglet)')

        # --- second utilisateur : lecture seule
        actx, apg = page(adm)
        apg.goto(WEB + f'/studio/editor/{pid}'); apg.wait_for_selector('.mt-readonly', timeout=25000)
        ok(f'Orga {tag}' in apg.locator('.mt-readonly').inner_text(), 'administrateur : lecture seule, voit qui modifie')
        ok(apg.locator('.mt-tools button', has_text='Couper').is_disabled() and apg.locator('.mt-handle').count() == 0, 'lecture seule : outils désactivés, pas de poignées')
        apg.keyboard.press('Delete'); ok(apg.locator('.mt-row-video .mt-clip').count() == 2, 'lecture seule : la touche Suppr ne fait rien')
        apg.screenshot(path=str(OUT / 'e1-lecture-seule-fr-1440.png'))
        octx2, opg2 = page(org)
        opg2.goto(WEB + f'/studio/editor/{pid}'); opg2.wait_for_selector('.mt-readonly', timeout=25000)
        ok('autre onglet' in opg2.locator('.mt-readonly').inner_text() and opg2.locator('.mt-readonly button', has_text='Modifier ici').count() == 1, 'même personne, autre onglet : « Modifier ici »')
        octx2.close()

        # --- reprise de la main par l'administrateur
        apg.locator('.mt-readonly button', has_text='Reprendre la main').click()
        ok(until(lambda: apg.locator('.mt-readonly').count() == 0 and not apg.locator('.mt-tools button', has_text='Couper').is_disabled(), 10), 'administrateur : reprend la main')
        ok(until(lambda: pg.locator('.mt-readonly').count() == 1, 35) and 'repris la main' in pg.locator('.mt-notice').inner_text(), 'organisateur : passe en lecture seule (« a repris la main »)')

        # --- versions
        apg.locator('.mt-top-actions button', has_text='Versions').click(); apg.wait_for_selector('.mt-ver-list')
        ok('copie automatique' in apg.locator('.mt-ver-list').inner_text(), 'versions : copie automatique listée')
        apg.fill('#mt-ver-label', 'Montage validé'); apg.locator('.mt-ver-form button').click()
        ok(until(lambda: 'Montage validé' in apg.locator('.mt-ver-list').inner_text()), 'version nommée enregistrée')
        apg.locator('.mt-ver', has_text='Version 1').locator('button').click()
        ok(until(lambda: apg.locator('.mt-row-video .mt-clip').count() == 1), 'retour à la version 1 : la vidéo entière')
        apg.screenshot(path=str(OUT / 'e1-versions-fr-1440.png'))
        apg.keyboard.press('Escape')
        ok(until(lambda: pg.locator('.mt-row-video .mt-clip').count() == 1, 15), 'lecture seule : l\'organisateur voit le changement (mise à jour toutes les 10 s)')
        actx.close()  # ferme l'onglet : le verrou est rendu
        ok(until(lambda: pg.locator('.mt-readonly button', has_text='Modifier').count() == 1, 15), 'projet libéré : « Modifier » proposé à l\'organisateur')
        pg.locator('.mt-readonly button', has_text='Modifier').click()
        ok(until(lambda: pg.locator('.mt-readonly').count() == 0), 'organisateur : modifie de nouveau')

        # --- arabe, tailles d'écran
        actx2, apg2 = page(org, lang='ar')
        apg2.goto(WEB + f'/studio/editor/{pid}'); apg2.wait_for_selector('.mt-editor .mt-clip', timeout=25000); apg2.wait_for_timeout(600)
        ok(apg2.evaluate("document.documentElement.dir") == 'rtl' and apg2.evaluate("getComputedStyle(document.querySelector('.mt-tl')).direction") == 'ltr', 'arabe : interface de droite à gauche, timeline de gauche à droite')
        ok(ov(apg2) <= 1, 'arabe sans débordement (1440 px)')
        apg2.screenshot(path=str(OUT / 'e1-editeur-ar-1440.png')); actx2.close()
        pg.set_viewport_size({'width': 1024, 'height': 800}); pg.wait_for_timeout(500)
        ok(pg.locator('.mt-editor').is_visible() and ov(pg) <= 1, 'éditeur à 1024 px sans débordement')
        pg.screenshot(path=str(OUT / 'e1-editeur-fr-1024.png'))
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(400)
        ok(pg.locator('.mt-small').is_visible() and not pg.locator('.mt-editor').is_visible() and ov(pg) <= 1, 'téléphone (390 px) : message « s\'utilise sur un ordinateur »')
        pg.screenshot(path=str(OUT / 'e1-editeur-fr-390.png'))
        pg.goto(WEB + '/studio/editor'); pg.wait_for_selector('.mt-home .mt-item', timeout=25000); pg.wait_for_timeout(400)
        ok(ov(pg) <= 1 and pg.locator('.mt-desk').is_visible(), 'liste à 390 px sans débordement')
        pg.screenshot(path=str(OUT / 'e1-liste-fr-390.png'), full_page=True)
        ctx3, pg3 = page(org, w=390, hh=844, lang='ar'); pg3.goto(WEB + '/studio/editor'); pg3.wait_for_selector('.mt-home .mt-item', timeout=25000); pg3.wait_for_timeout(400)
        ok(ov(pg3) <= 1, 'liste en arabe à 390 px sans débordement'); pg3.screenshot(path=str(OUT / 'e1-liste-ar-390.png'), full_page=True); ctx3.close()

        # --- Studio → Contenus : étape « Montée »
        pg.set_viewport_size({'width': 1440, 'height': 1000})
        pg.goto(WEB + '/studio/contents'); pg.wait_for_selector('.pd-table', timeout=25000); pg.wait_for_timeout(600)
        row = pg.locator('tr', has_text=f'La patience {tag}')
        ok(row.locator('.pd-dash').nth(4).get_attribute('class').endswith('run'), 'Contenus : étape « Montée » en cours')
        # --- module désactivé
        requests.put(API + '/admin/modules/editor', headers=H, json={'enabled': False})
        pg.goto(WEB + '/studio/editor'); pg.wait_for_selector('.mt-off', timeout=25000)
        ok('désactivé' in pg.locator('.mt-off').inner_text() and pg.locator('.mt-item').count() == 0, 'module désactivé : l\'éditeur l\'explique (montages conservés)')
        pg.goto(WEB + f'/studio/editor/{pid}'); pg.wait_for_selector('.error', timeout=25000)
        ok('désactivé' in pg.locator('main').inner_text(), 'module désactivé : un projet ouvert directement l\'explique aussi')
        ctx.close(); b.close()
finally:
    requests.put(API + '/admin/modules/editor', headers=H, json={'enabled': True})
    for t in talks:
        for o in s3.list_objects_v2(Bucket='majlis-videos', Prefix=f'hls/{t}/').get('Contents', []): s3.delete_object(Bucket='majlis-videos', Key=o['Key'])
        cur.execute('delete from talks where id=%s', (t,))
    for u in users: cur.execute('delete from users where id=%s', (u,))
print(f"\n{'ÉCHECS : ' + str(len(bad)) if bad else 'Tout est bon'} — captures dans {OUT}")
sys.exit(1 if bad else 0)
