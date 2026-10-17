#!/usr/bin/env python3
"""Étape D2 : « Langue de l'audio » sur la page d'une conférence (maquette Studio v2, écran 7).
Vérifie dans le navigateur : carte et mention « Version française », vidéo coupée et piste française jouée EN PHASE (lecture,
saut, pause), reprise de lecture envoyée avec audioLang = fr, retour à la voix d'origine, mode audio seul sur la piste française,
« Demander la version française » (abonné / administrateur, membre gratuit → formules), rien pour une conférence en français,
FR + AR, 390 / 1440 px, sans débordement.
Le Chromium de test ne lit pas le H.264 / AAC : la vidéo HLS et les pistes de test sont en VP9 / Opus (les vrais navigateurs lisent l'AAC).
Prérequis : API (3055) + module dubbing 0.3.0, PG (5544), S3 de test (5599), site (3001). Lancement (depuis web/) : python3 tests/d2_player.py [dossier]"""
import json, os, pathlib, subprocess, sys, tempfile, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-d2'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:5599', aws_access_key_id='test', aws_secret_access_key='test', region_name='garage')
bad = []; tag = uuid.uuid4().hex[:6]; talks = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def login(email, pw): return requests.post(API + '/auth/login', json={'email': email, 'password': pw}).json()['token']
adm = login('admin@test.local', 'AdminPassw0rd-test')
em = f'd2p-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': 'Membre'}); free = login(em, 'Passw0rd-test')
requests.put(API + '/admin/modules/dubbing', headers={'authorization': 'Bearer ' + adm}, json={'enabled': True})
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
def talk(lang, source='upload'):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                   values (%s,'Résumé.','Cheikh Test',%s,%s,%s,'published','ready','free',30,%s,%s) returning id""", (f'D2 lecteur {tag} {lang}', source, f'videos/d2-{tag}.mp4' if source == 'upload' else 'y' + tag, aid, lang, lang))
    t = str(cur.fetchone()[0]); talks.append(t); return t
T1, T2, T3 = talk('ar'), talk('ar'), talk('fr')
with tempfile.TemporaryDirectory() as d:
    hls = os.path.join(d, 'hls'); os.makedirs(hls)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=30', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=30',
                    '-map', '0:v', '-map', '1:a', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '150k', '-g', '50', '-c:a', 'libopus', '-b:a', '48k',
                    '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4',
                    '-hls_segment_filename', os.path.join(hls, 'v%v/seg_%05d.m4s'), '-master_pl_name', 'master.m3u8', '-var_stream_map', 'v:0,a:0', os.path.join(hls, 'v%v/index.m3u8')], check=True)
    for t in (T1, T2, T3):
        for root, _, files in os.walk(hls):
            for f in files:
                p = os.path.join(root, f); s3.upload_file(p, 'majlis-videos', f'hls/{t}/' + os.path.relpath(p, hls).replace(os.sep, '/'))
    for k, fq in (('mix', 600), ('voice', 800)):
        p = os.path.join(d, f'{k}.m4a')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'sine=frequency={fq}:duration=30:sample_rate=48000', '-c:a', 'libopus', '-b:a', '48k', '-f', 'mp4', p], check=True)
        s3.upload_file(p, 'majlis-videos', f'dubbing/tracks/{T1}/t-{k}.m4a', ExtraArgs={'ContentType': 'audio/mp4'})
cur.execute("insert into dub_jobs(talk_id, kind, status, params, result, finished_at) values (%s,'full','done','{\"duck\": 15}','{}',now()) returning id", (T1,)); j = cur.fetchone()[0]
cur.execute("insert into dub_tracks(talk_id, job_id, mix_key, voice_key, duration_s) values (%s,%s,%s,%s,30)", (T1, j, f'dubbing/tracks/{T1}/t-mix.m4a', f'dubbing/tracks/{T1}/t-voice.m4a'))
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
def until(fn, timeout=15):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if fn(): return True
        except Exception: pass
        time.sleep(0.3)
    return False
V = "document.querySelector('.player-stage video')"
A = "document.querySelector('audio.dub-sync')"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        def page(token, w, h, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            if token: ctx.add_init_script(f"localStorage.setItem('token', '{token}')")
            return ctx, ctx.new_page()
        ctx, pg = page(adm, 1440, 900)
        bodies = []
        pg.on('request', lambda r: bodies.append(r.post_data) if '/me/progress/' in r.url and r.method == 'PUT' else None)
        pg.goto(WEB + f'/talks/{T1}'); pg.wait_for_selector('.dub-card .dub-opt', timeout=30000); pg.wait_for_timeout(800)
        ok(pg.locator('.dub-opt[aria-checked="true"]').first.inner_text().startswith('Version française'), 'version française choisie par défaut')
        ok(pg.locator('.dub-badge').count() == 1, 'mention « Version française · doublage par voix de synthèse » sur le lecteur')
        ok(until(lambda: pg.evaluate(f'!!{A}'), 10) and pg.evaluate(f'{V}.muted'), 'vidéo coupée, piste française prête')
        pg.evaluate(f'{V}.play()')
        ok(until(lambda: pg.evaluate(f'{V}.currentTime') > 2.5, 20), 'la vidéo joue')
        ok(until(lambda: not pg.evaluate(f'{A}.paused'), 5), 'la piste française joue en même temps')
        drift = pg.evaluate(f'Math.abs({A}.currentTime - {V}.currentTime)'); ok(drift < 0.6, f'en phase ({drift:.2f} s d\'écart)')
        pg.evaluate(f'{V}.currentTime = 18'); pg.wait_for_timeout(1500)
        drift = pg.evaluate(f'Math.abs({A}.currentTime - {V}.currentTime)'); ok(drift < 0.6 and pg.evaluate(f'{A}.currentTime') > 17, f'après un saut à 18 s : recalée ({drift:.2f} s)')
        pg.evaluate(f'{V}.muted = false; {V}.volume = 0.5'); pg.wait_for_timeout(300)
        ok(pg.evaluate(f'{V}.muted') and abs(pg.evaluate(f'{A}.volume') - 0.5) < 0.01, 'bouton « son » du lecteur : règle la version française, la vidéo reste coupée')
        pg.evaluate(f'{V}.pause()'); pg.wait_for_timeout(800)
        ok(pg.evaluate(f'{A}.paused'), 'pause de la vidéo : la voix française s\'arrête')
        ok(until(lambda: any(x and json.loads(x).get('audioLang') == 'fr' for x in bodies), 6), 'reprise de lecture envoyée avec la langue « fr »')
        if ov(pg) <= 1: pg.screenshot(path=str(OUT / 'd2-lecteur-fr-1440.png'))
        ok(ov(pg) <= 1, 'page sans débordement')
        pg.locator('.dub-opt').nth(1).click(); pg.wait_for_timeout(500)
        ok(not pg.evaluate(f'!!{A}') and not pg.evaluate(f'{V}.muted') and pg.locator('.dub-badge').count() == 0, 'voix d\'origine : son de la vidéo rétabli, mention retirée')
        pg.reload(); pg.wait_for_selector('.dub-card .dub-opt', timeout=30000); pg.wait_for_timeout(800)
        ok(pg.locator('.dub-opt').nth(1).get_attribute('aria-checked') == 'true', 'choix mémorisé sur l\'appareil')
        pg.locator('.dub-opt').nth(0).click(); pg.wait_for_timeout(500)
        pg.locator('.dub-row .link').click(); pg.wait_for_selector('.audio-stage audio', timeout=10000)
        ok(f't-mix.m4a' in (pg.locator('.audio-stage audio').get_attribute('src') or ''), 'mode audio seul : la piste française (mix) est lue directement')
        ok(not pg.evaluate(f'!!{A}'), 'mode audio seul : pas de double lecture')
        pg.locator('.dub-row .link').click(); pg.wait_for_timeout(500)
        ctx.close()
        # Pas de version française : demande
        ctx, pg = page(free, 1440, 900); pg.goto(WEB + f'/talks/{T2}'); pg.wait_for_selector('.dub-missing', timeout=30000)
        ok(pg.locator('.dub-missing a[href="/pricing"]').count() == 1, 'membre gratuit : « Réservé aux abonnés » → formules')
        ctx.close()
        ctx, pg = page(adm, 1440, 900); pg.goto(WEB + f'/talks/{T2}'); pg.wait_for_selector('.dub-missing .btn', timeout=30000)
        pg.locator('.dub-missing .btn').click(); pg.wait_for_selector('.dub-done', timeout=10000)
        ok('1' in pg.locator('.dub-missing').inner_text(), 'demande envoyée : « Vous l\'avez demandée », 1 membre')
        pg.screenshot(path=str(OUT / 'd2-demande-fr.png'))
        pg.locator('.dub-missing-act .link').click(); pg.wait_for_selector('.dub-missing .btn', timeout=10000); ok(True, 'retirer sa demande')
        pg.goto(WEB + f'/talks/{T3}'); pg.wait_for_selector('.talk-head h1', timeout=30000); pg.wait_for_timeout(1500)
        ok(pg.locator('.dub-card').count() == 0, 'conférence déjà en français : aucune carte')
        ctx.close()
        for lang, w, h in (('ar', 390, 844), ('fr', 390, 844), ('ar', 1440, 900)):
            ctx, pg = page(adm, w, h, lang); pg.goto(WEB + f'/talks/{T1}'); pg.wait_for_selector('.dub-card .dub-opt', timeout=30000); pg.wait_for_timeout(800)
            ok(ov(pg) <= 1, f'[{lang} {w}] page sans débordement')
            pg.screenshot(path=str(OUT / f'd2-{lang}-{w}.png'), full_page=False)
            pg.locator('.dub-card').scroll_into_view_if_needed(); pg.locator('.dub-card').screenshot(path=str(OUT / f'd2-carte-{lang}-{w}.png'))
            ctx.close()
        b.close()
finally:
    for t in talks: cur.execute('delete from talks where id=%s', (t,))
    cur.execute('delete from users where email=%s', (em,))
print('\n' + ('TOUT EST OK' if not bad else f'{len(bad)} ÉCHEC(S)'))
sys.exit(1 if bad else 0)
