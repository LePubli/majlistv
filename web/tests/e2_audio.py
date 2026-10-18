#!/usr/bin/env python3
"""Étape E2 : son de l'éditeur de montage, dans le navigateur.
Vérifie : formes d'onde dessinées (voix d'origine, voix française), niveau mesuré, voix d'origine baissée sous la voix
française (volume réel de la vidéo dans l'aperçu), réglage de la baisse au curseur (un seul geste à annuler), voix d'origine
coupée, écoute « réduction du bruit », bibliothèque de musiques (import par l'administrateur, analyse, ajout au montage),
musique qui baisse sous la voix, déplacement de la musique à la souris, suppression puis annulation, sauvegarde, lecture
de la voix française, FR + AR, 1440 / 1024 px, menus d'un module désactivé (organisateur / administrateur).
Prérequis : API (3055) avec FFmpeg, PG (5544), S3 de test (5599), site (3001) lancé avec CSP_STORAGE_ORIGINS=http://127.0.0.1:5599.
Le Chromium de test ne lit ni le H.264 ni l'AAC : vidéo VP9/Opus, voix française et musique en Opus (Ogg).
Lancement (depuis web/) : python3 tests/e2_audio.py [dossier des captures]"""
import os, pathlib, subprocess, sys, tempfile, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'  # localhost : l'origine autorisée (CORS) par le stockage de test pour l'envoi direct
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-e2'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:5599', aws_access_key_id='test', aws_secret_access_key='test', region_name='garage')
bad = []; tag = uuid.uuid4().hex[:6]; talks = []; users = []; keys = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def login(e, pw): return requests.post(API + '/auth/login', json={'email': e, 'password': pw}).json()['token']
adm = login('admin@test.local', 'AdminPassw0rd-test'); H = {'authorization': 'Bearer ' + adm}
for m in ('editor', 'dubbing'): requests.put(API + f'/admin/modules/{m}', headers=H, json={'enabled': True})
em = f'e2w-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': f'Orga {tag}'})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
org = login(em, 'Passw0rd-test')
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
               values (%s,'d','Cheikh Test','upload',%s,%s,'published','ready','free',60,'ar','ar','ready') returning id""", (f'Le son {tag}', f'talks/{tag}', oid))
T1 = str(cur.fetchone()[0]); talks.append(T1)
make_hls(s3, T1, 60, codec='vp9'); add_transcript(cur, T1, 60)
cur.execute("insert into dub_segments(talk_id, idx, keep_original) values (%s, 2, true)", (T1,))
tmp = tempfile.mkdtemp(prefix='e2w-')
# Voix française « voix seule » : un son pendant chaque phrase (Opus, lisible par le Chromium de test)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=60', '-af', "volume='if(lt(mod(t,6),5),0.6,0)':eval=frame",
                '-c:a', 'libopus', '-b:a', '48k', os.path.join(tmp, 'voice.ogg')], check=True)
vkey = f'dubbing/tracks/{T1}/w-voice.ogg'; s3.upload_file(os.path.join(tmp, 'voice.ogg'), 'majlis-videos', vkey, ExtraArgs={'ContentType': 'audio/ogg'}); keys.append(vkey)
cur.execute("insert into dub_jobs(talk_id, kind, status, params, finished_at) values (%s,'full','done','{}', now()) returning id", (T1,)); jd = cur.fetchone()[0]
cur.execute("insert into dub_tracks(talk_id, job_id, voice_key, duration_s) values (%s,%s,%s,60)", (T1, jd, vkey))
music_file = os.path.join(tmp, 'nasheed-test.ogg')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=520:duration=25', '-c:a', 'libopus', '-b:a', '48k', music_file], check=True)
assets_before = set()
cur.execute('select id from editor_assets'); assets_before = {str(r[0]) for r in cur.fetchall()}

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
def vvol(pg): return float(pg.evaluate("document.querySelector('.mt-screen video').dataset.vol || '-1'"))
def mvol(pg): return float(pg.evaluate("(document.querySelector('audio[data-role=music]')||{dataset:{}}).dataset.vol || '-1'"))
def go(pg, sec):  # tête de lecture à « sec » secondes (clavier, depuis le début)
    pg.locator('.mt-row-titles .mt-head').click(); pg.keyboard.press('Shift+ArrowLeft');
    for _ in range(20): pg.keyboard.press('Shift+ArrowLeft')
    for _ in range(int(sec) // 10): pg.keyboard.press('Shift+ArrowRight')
    for _ in range(int(sec) % 10): pg.keyboard.press('ArrowRight')
    pg.wait_for_timeout(250)
def canvas_ink(pg, sel):
    return pg.evaluate("""(s) => { const c = document.querySelector(s); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }""", sel)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        def page(tok, w=1440, hh=1000, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')")
            pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
            return ctx, pg
        ctx, pg = page(adm)
        r = requests.post(API + '/studio/editor/projects', headers=H, json={'talkId': T1}); pid = r.json()['id']
        pg.goto(WEB + f'/studio/editor/{pid}'); pg.wait_for_selector('.mt-editor .mt-clip', timeout=25000)
        ok(until(lambda: pg.evaluate("document.querySelector('.mt-screen video').readyState") >= 2, 25), 'aperçu chargé')

        # --- formes d'onde
        ok(until(lambda: canvas_ink(pg, '.mt-row-orig canvas.mt-wave') > 200, 60), "forme d'onde de la voix d'origine dessinée")
        ok(until(lambda: canvas_ink(pg, '.mt-row-dub canvas.mt-wave') > 50, 30), "forme d'onde de la voix française dessinée dans ses phrases")
        ok('15 %' in pg.locator('.mt-row-orig .mt-head').inner_text(), "piste « Voix d'origine » : « 15 % » (baissée sous la voix française)")

        # --- baisse de la voix d'origine sous la voix française
        go(pg, 3); ok(abs(vvol(pg) - 0.15) < 0.01, f'à 0:03 (voix française) : volume de la vidéo 15 % ({vvol(pg)})')
        go(pg, 14); ok(abs(vvol(pg) - 1) < 0.01, f'à 0:14 (passage en voix d\'origine) : volume plein ({vvol(pg)})')
        pg.locator('.mt-row-dub .mt-head').click(); pg.wait_for_selector('#mt-d-duck')
        txt = pg.locator('.mt-right').inner_text()
        ok('Voix d\'origine sous la voix française' in txt and 'Fondu d\'entrée / sortie' in txt and '0 dB' in txt, 'panneau Voix française : volume, voix d\'origine sous la voix française, fondu (maquette)')
        ok(until(lambda: 'LUFS' in pg.locator('.mt-right').inner_text(), 40), 'niveau sonore mesuré affiché (LUFS)')
        pg.locator('#mt-d-duck').focus()
        for _ in range(5): pg.keyboard.press('ArrowRight')
        ok('20 %' in pg.locator('.mt-right').inner_text(), 'baisse réglée à 20 % au clavier')
        go(pg, 3); ok(abs(vvol(pg) - 0.20) < 0.01, f'aperçu : 20 % sous la voix française ({vvol(pg)})')
        pg.locator('.mt-top-actions button', has_text='Annuler').click(); pg.wait_for_timeout(200)
        go(pg, 3); ok(abs(vvol(pg) - 0.15) < 0.01, 'un seul « Annuler » ramène 15 % (5 crans = un geste)')
        pg.locator('.mt-top-actions button', has_text='Rétablir').click(); pg.wait_for_timeout(200)
        pg.screenshot(path=str(OUT / 'e2-voix-francaise-fr-1440.png'))

        # --- voix d'origine : coupée, réduction du bruit
        pg.locator('.mt-row-orig .mt-head').click(); pg.wait_for_selector('#mt-o-mute')
        pg.locator('label[for="mt-o-mute"]').click()
        go(pg, 14); ok(vvol(pg) == 0 and 'Coupée' in pg.locator('.mt-row-orig .mt-head').inner_text(), 'voix d\'origine coupée : volume 0')
        pg.locator('.mt-row-orig .mt-head').click(); pg.locator('label[for="mt-o-mute"]').click()
        pg.select_option('#mt-o-denoise', 'strong')
        with pg.expect_response(lambda r: 'denoise-sample' in r.url, timeout=60000) as resp:
            pg.locator('button[data-try="on"]').click()
        ok(resp.value.status == 200 and resp.value.headers.get('content-type', '').startswith('audio/mp4'), 'écoute de 10 s avec réduction du bruit (forte)')
        pg.screenshot(path=str(OUT / 'e2-voix-origine-fr-1440.png'))

        # --- bibliothèque de musiques : import, analyse, ajout
        go(pg, 0)
        pg.locator('.mt-add.on', has_text='Musique de fond').click(); pg.wait_for_selector('.mt-upload')
        pg.set_input_files('.mt-upload input[type=file]', music_file)
        pg.fill('.mt-upload input:not([type=file]) >> nth=0', f'Nasheed {tag}')
        pg.fill('.mt-upload input:not([type=file]) >> nth=1', 'Libre de droits (test)')
        pg.locator('.mt-upload button[type=submit]').click()
        row = pg.locator('.mt-music-row', has_text=f'Nasheed {tag}')
        ok(until(lambda: row.count() == 1, 20), 'musique importée par l\'administrateur (envoi direct vers le stockage)')
        if row.count() == 0: print('   message :', pg.locator('.mt-modal-box').inner_text()[:400])
        ok(until(lambda: '0:25' in row.inner_text(), 40), 'musique analysée : durée 0:25')
        pg.screenshot(path=str(OUT / 'e2-musiques-fr-1440.png'))
        row.locator('button', has_text='Ajouter au montage').click()
        ok(until(lambda: pg.locator('.mt-row-music .mt-mclip').count() == 1), 'musique ajoutée sur la piste Musique')
        ok(until(lambda: canvas_ink(pg, '.mt-row-music canvas.mt-wave') > 50, 20), 'forme d\'onde de la musique dessinée')
        ok('Baisse auto' in pg.locator('.mt-row-music .mt-head').inner_text(), 'piste Musique : « Baisse auto »')
        go(pg, 3); a = mvol(pg); go(pg, 14); b5 = mvol(pg)  # 0:03 : la voix française parle ; 0:14 : passage gardé en voix d'origine
        ok(0 < a < b5, f'musique : plus basse sous la voix française ({a:.3f}) qu\'ailleurs ({b5:.3f})')
        pg.locator('.mt-row-music .mt-mclip .mt-clip-body').click(); pg.wait_for_timeout(200)
        ok('En boucle' in pg.locator('.mt-right').inner_text() and 'Baisse automatique sous la voix' in pg.locator('.mt-right').inner_text(), 'panneau de la musique : volume, début, durée, fondus, boucle, baisse')
        # déplacement à la souris
        box = pg.locator('.mt-row-music .mt-mclip').bounding_box()
        pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + 10); pg.mouse.down(); pg.mouse.move(box['x'] + box['width'] / 2 + 120, box['y'] + 10, steps=8); pg.mouse.up()
        ok(until(lambda: pg.locator('.mt-row-music .mt-mclip').bounding_box()['x'] > box['x'] + 60), 'musique déplacée à la souris')
        # suppression puis annulation
        pg.locator('.mt-row-music .mt-mclip .mt-clip-body').click(); pg.keyboard.press('Delete')
        ok(pg.locator('.mt-row-music .mt-mclip').count() == 0, 'touche Suppr : musique retirée')
        pg.keyboard.press('Control+z'); ok(pg.locator('.mt-row-music .mt-mclip').count() == 1, 'Ctrl+Z : la musique revient')
        ok(until(lambda: 'enregistré automatiquement' in pg.locator('.mt-titles').inner_text(), 15), 'sauvegarde automatique')
        cur.execute("select timeline->'audio' from editor_projects where id=%s", (pid,)); au = cur.fetchone()[0]
        ok(au and au['orig']['denoise'] == 'strong' and len(au['music']) == 1 and au['music'][0]['start'] > 0 and au['dub']['duck'] == 20, f"base : réglages du son enregistrés (bruit, musique déplacée, baisse 20 %)")
        pg.screenshot(path=str(OUT / 'e2-editeur-fr-1440.png'))

        # --- lecture : la voix française joue avec la vidéo
        go(pg, 0)
        pg.locator('.mt-transport .play').click()
        ok(until(lambda: pg.evaluate("document.querySelector('audio[data-role=dub]').currentTime") > 0.5, 15), 'lecture : la voix française joue en même temps que la vidéo')
        pg.locator('.mt-transport .play').click(); pg.wait_for_timeout(200)
        ok(pg.evaluate("document.querySelector('audio[data-role=dub]').paused"), 'pause : la voix française s\'arrête aussi')

        # --- arabe, tailles
        ctx2, pg2 = page(adm, lang='ar'); pg2.goto(WEB + f'/studio/editor/{pid}'); pg2.wait_for_selector('.mt-editor .mt-mclip', timeout=25000); pg2.wait_for_timeout(1500)
        pg2.locator('.mt-row-dub .mt-head').click(); pg2.wait_for_timeout(300)
        ok(ov(pg2) <= 1 and pg2.evaluate("document.documentElement.dir") == 'rtl', 'arabe : sans débordement')
        pg2.screenshot(path=str(OUT / 'e2-editeur-ar-1440.png')); ctx2.close()
        pg.set_viewport_size({'width': 1024, 'height': 800}); pg.wait_for_timeout(400)
        pg.locator('.mt-row-music .mt-mclip .mt-clip-body').click(); pg.wait_for_timeout(200)
        ok(ov(pg) <= 1, '1024 px sans débordement'); pg.screenshot(path=str(OUT / 'e2-editeur-fr-1024.png'))
        ctx.close()

        # --- registre, point 4 : module désactivé → l'organisateur ne voit plus l'entrée, l'administrateur oui
        requests.put(API + '/admin/modules/editor', headers=H, json={'enabled': False})
        octx, opg = page(org); opg.goto(WEB + '/studio'); opg.wait_for_selector('.studio-nav', timeout=25000); opg.wait_for_timeout(500)
        ok(opg.locator('.studio-nav a[href="/studio/editor"]').count() == 0 and opg.locator('a[href="/studio/editor"]').count() == 0, 'module coupé : organisateur sans entrée ni lien « Éditeur »')
        actx, apg = page(adm); apg.goto(WEB + '/studio'); apg.wait_for_selector('.studio-nav', timeout=25000); apg.wait_for_timeout(500)
        ok(apg.locator('.studio-nav a[href="/studio/editor"]').count() == 1, 'module coupé : l\'administrateur garde l\'entrée (la page l\'invite à l\'activer)')
        requests.put(API + '/admin/modules/editor', headers=H, json={'enabled': True})
        opg.goto(WEB + '/studio'); opg.wait_for_selector('.studio-nav', timeout=25000); opg.wait_for_timeout(500)
        ok(opg.locator('.studio-nav a[href="/studio/editor"]').count() == 1, 'module réactivé : l\'organisateur retrouve l\'entrée')
        octx.close(); actx.close(); b.close()
finally:
    requests.put(API + '/admin/modules/editor', headers=H, json={'enabled': True})
    for t in talks:
        for o in s3.list_objects_v2(Bucket='majlis-videos', Prefix=f'hls/{t}/').get('Contents', []): s3.delete_object(Bucket='majlis-videos', Key=o['Key'])
        cur.execute('delete from talks where id=%s', (t,))
    cur.execute('select id, key from editor_assets');
    for aid, k in cur.fetchall():
        if str(aid) not in assets_before:
            try: s3.delete_object(Bucket='majlis-videos', Key=k)
            except Exception: pass
            cur.execute('delete from editor_assets where id=%s', (aid,))
    for k in keys:
        try: s3.delete_object(Bucket='majlis-videos', Key=k)
        except Exception: pass
    for u in users: cur.execute('delete from users where id=%s', (u,))
print(f"\n{'ÉCHECS : ' + str(len(bad)) if bad else 'Tout est bon'} — captures dans {OUT}")
sys.exit(1 if bad else 0)
