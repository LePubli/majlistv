#!/usr/bin/env python3
"""Étape E4b : « Remplacer la vidéo publiée », dans le navigateur (maquette « Studio v2 », écran 5).
Vérifie : bouton depuis un rendu final prêt ; avant / après (durées, différence, son, habillage) ; ce qui sera mis à jour (quiz à revoir
avec lien, version française à refaire, notes et reprises) ; « Conserver mes corrections » ; original protégé (place) ; étapes ;
remplacement (confirmation) → préparation (worker) → bascule → transcription → tout à jour, suivi sans recharger ; Studio → Activité ;
« Restaurer l'original » → retour ; menu du Studio présent ; FR + AR (RTL) ; 1440 / 1024 / 390 px.
Prérequis : API (3055), PG (5544), S3 de test (5599), site (3001), FFmpeg, dépendances du worker (npm ci dans worker/).
Lancement (depuis web/) : python3 tests/e4b_replace.py [dossier des captures]"""
import json, os, pathlib, subprocess, sys, tempfile, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-e4b'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:5599', aws_access_key_id='test', aws_secret_access_key='test', region_name='garage')
bad = []; tag = uuid.uuid4().hex[:6]; talks = []; users = []; keys = []
WENV = {**os.environ, 'DATABASE_URL': 'postgres://majlis:pw@127.0.0.1:5544/majlis', 'S3_ENDPOINT': 'http://127.0.0.1:5599', 'S3_ACCESS_KEY': 'test',
        'S3_SECRET_KEY': 'test', 'S3_REGION': 'garage', 'S3_BUCKET': 'majlis-videos', 'WORK_DIR': tempfile.mkdtemp(prefix='e4bw-'), 'FFMPEG_THREADS': '2'}
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def login(e, pw):
    r = requests.post(API + '/auth/login', json={'email': e, 'password': pw})
    if r.status_code == 429: time.sleep(62); r = requests.post(API + '/auth/login', json={'email': e, 'password': pw})
    return r.json()['token']
def worker(script):
    p = subprocess.run(['node', str(ROOT / 'worker' / 'tests' / script)], env=WENV, capture_output=True, text=True, timeout=600)
    try: return json.loads(p.stdout.strip().splitlines()[-1])
    except Exception: print(p.stdout, p.stderr); return {}
def until(fn, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.4)
    return False
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
def one(sql, *a): cur.execute(sql, a); r = cur.fetchone(); return r[0] if r else None

adm = login('admin@test.local', 'AdminPassw0rd-test'); H = {'authorization': 'Bearer ' + adm}
for m in ('editor', 'dubbing', 'storage'): requests.put(API + f'/admin/modules/{m}', headers=H, json={'enabled': True})
em = f'e4bw-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': f'Orga {tag}'})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
org = login(em, 'Passw0rd-test'); HO = {'authorization': 'Bearer ' + org}
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
               values (%s,'d','Cheikh Test','upload',%s,%s,'published','ready','free',40,'fr','fr','ready') returning id""", (f'La patience {tag}', f'talks/{tag}-orig', oid))
T = str(cur.fetchone()[0]); talks.append(T)
make_hls(s3, T, 40, codec='vp9'); add_transcript(cur, T, 40)
d = tempfile.mkdtemp(prefix='e4bweb-')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=40', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=40',
                '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', os.path.join(d, 'o.mp4')], check=True)
s3.upload_file(os.path.join(d, 'o.mp4'), 'majlis-videos', f'talks/{tag}-orig'); keys.append(f'talks/{tag}-orig')
for ms, st in ((3000, 'approved'), (15000, 'approved')):
    cur.execute("insert into quiz_questions(talk_id, lang, question, options, correct_index, evidence_ms, evidence_quote, status) values (%s,'fr','Q ?','[\"a\",\"b\",\"c\"]',0,%s,'',%s)", (T, ms, st))
cur.execute("insert into talk_notes(user_id, talk_id, position_ms, body) values (%s,%s,3000,'n')", (oid, T))
vkey = f'dubbing/tracks/{T}/v.m4a'; s3.put_object(Bucket='majlis-videos', Key=vkey, Body=b'x'); keys.append(vkey)
cur.execute("insert into dub_tracks(talk_id, voice_key, duration_s) values (%s,%s,40)", (T, vkey))
pid = requests.post(API + '/studio/editor/projects', headers=HO, json={'talkId': T}).json()['id']
S = 'sess-' + tag
rev = requests.post(API + f'/studio/editor/projects/{pid}/lock', headers=HO, json={'session': S}).json()['rev']
tl = {'v': 1, 'duration': 40, 'clips': [{'id': 'c1', 'in': 0, 'out': 10}, {'id': 'c2', 'in': 20, 'out': 40}], 'audio': {'dub': {'use': False}},
      'dress': {'intro': {'on': True, 'len': 2, 'title': '{titre}'}, 'items': [{'id': 't1', 'kind': 'banner', 'text': '{intervenant}', 'start': 1, 'len': 4}]}}
rev = requests.put(API + f'/studio/editor/projects/{pid}', headers=HO, json={'timeline': tl, 'rev': rev, 'session': S}).json()['rev']
requests.post(API + f'/studio/editor/projects/{pid}/unlock', headers=HO, json={'session': S})
R = requests.post(API + f'/studio/editor/projects/{pid}/render', headers=HO, json={'kind': 'final', 'rev': rev}).json()['render']['id']
ok(worker('run_render_once.mjs').get('ok'), 'rendu final prêt (worker)')

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        def page(tok, w=1440, hh=1100, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')")
            pg = ctx.new_page(); pg.on('dialog', lambda dl: dl.accept())
            return ctx, pg
        ctx, pg = page(org)
        # Depuis l'éditeur : « Rendre la vidéo » → rendu final prêt → « Remplacer la vidéo publiée ».
        pg.goto(WEB + f'/studio/editor/{pid}'); pg.wait_for_selector('.mt-editor .mt-clip', timeout=25000)
        pg.locator('button[data-act=render]').click(); pg.wait_for_selector('.mt-render-row[data-status=ready]')
        link = pg.locator('.mt-render-row[data-status=ready] a[data-act=render-replace]')
        ok(link.count() == 1, 'rendu final prêt : bouton « Remplacer la vidéo publiée »')
        link.click(); pg.wait_for_url(f'**/studio/editor/{pid}/replace?render={R}', timeout=15000)
        pg.wait_for_selector('.mx-compare', timeout=20000)
        ok(pg.locator('.ms-side, .sd-side, nav.sd-menu, aside').count() > 0 and pg.locator('h1').inner_text() == 'Remplacer la vidéo publiée', 'page du Studio (menu visible), titre de la maquette')
        bf = pg.locator('.mx-side').nth(0).inner_text(); af = pg.locator('.mx-after').inner_text()
        ok('40 s' in bf and 'Voix d’origine' in bf and 'Aucun' in bf, f'avant : {bf.splitlines()[-6:]!r}')
        ok('32 s' in af and '(−8 s)' in af and 'bandeau' in af and 'intro / fin' in af, f'après : durée, différence, habillage')
        ok(pg.locator('.mx-after video').count() == 1 and pg.locator('.mx-banner').inner_text() == 'Cheikh Test', 'lecteur du rendu et bandeau de l’intervenant')
        what = pg.locator('.mx-checks').inner_text()
        ok('Quiz : 1 question(s) sur 2 à revoir' in what and pg.locator('.mx-checks a[href="/studio/quiz"]').count() == 1, 'quiz à revoir + « Voir les questions »')
        ok('Version française à refaire' in what and '1 note(s)' in what, 'version française à refaire ; notes et reprises comptées')
        ok(pg.locator('input[data-act=keep]').is_visible() and not pg.locator('input[data-act=keep]').is_checked(), '« Conserver mes corrections » décoché par défaut')
        ok('Mo' in pg.locator('.mx-row').inner_text() and '7 jours' in pg.locator('.mx-two').inner_text(), 'original protégé : place nécessaire pendant 7 jours')
        steps = pg.locator('.mx-steps li')
        ok(steps.count() == 5 and steps.nth(0).get_attribute('data-state') == 'done' and steps.nth(1).get_attribute('data-state') == 'todo', 'étapes : 5, le rendu est fait')
        pg.locator('input[data-act=keep]').check(); ok('sans rien relancer' in pg.locator('.mx-checks').inner_text(), 'option : texte « recalés sans rien relancer »'); pg.locator('input[data-act=keep]').uncheck()
        ok(ov(pg) <= 1, '1440 px sans débordement'); pg.screenshot(path=str(OUT / 'e4b-avant-apres-fr-1440.png'), full_page=True); pg.screenshot(path=str(OUT / 'e4b-ecran-fr-1440.png'))

        # Remplacer : confirmation, préparation, bascule, suite.
        pg.locator('button[data-act=replace]').click()
        ok(until(lambda: 'Remplacement lancé' in pg.locator('main').inner_text(), 10), 'remplacement lancé (après confirmation)')
        ok(until(lambda: pg.locator('.mx-steps li[data-step=mtxStepPrepare]').get_attribute('data-state') == 'cur', 10) and pg.locator('button[data-act=cancel]').count() == 1, 'préparation en cours, annulable')
        a2 = ctx.new_page(); a2.goto(WEB + '/studio/activity')
        ok(until(lambda: 'nouvelle version de la vidéo' in a2.locator('main').inner_text().lower(), 20), 'Studio → Activité : « Nouvelle version de la vidéo »'); a2.close()
        ok(worker('run_replace_once.mjs').get('ok'), 'nouvelle version préparée (worker)')
        ok(until(lambda: pg.locator('.mx-steps li[data-step=mtxStepSwitch]').get_attribute('data-state') == 'done', 40), 'bascule faite (suivi sans recharger)')
        ok(until(lambda: pg.locator('.mx-steps li[data-step=mtxStepTranscript]').get_attribute('data-state') == 'cur', 10), 'nouvelle transcription en cours')
        done = pg.locator('.mx-done')
        ok(until(lambda: 'Vidéo publiée remplacée le' in done.inner_text(), 10) and '1 question(s) de quiz à revoir' in done.inner_text() and done.locator('button[data-act=restore]').count() == 1,
           'compte rendu de la bascule et « Restaurer l’original »')
        pg.screenshot(path=str(OUT / 'e4b-bascule-fr-1440.png'), full_page=True)
        cur.execute("update talks set transcript_status='ready' where id=%s", (T,))
        ok(until(lambda: pg.locator('.mx-steps li[data-step=mtxStepInsights]').get_attribute('data-state') in ('cur', 'done'), 40), 'transcription prête → traductions, résumés')
        cur.execute("update talk_insights set status='ready' where talk_id=%s", (T,)); cur.execute("update transcript_translations set status='ready' where talk_id=%s", (T,))
        ok(until(lambda: one('select follow from editor_replacements where talk_id=%s and kind=%s', T, 'replace') == 'done', 30), 'tout est à jour')
        ok(one('select media_prefix from talks where id=%s', T).startswith(f'hls/{T}/r/'), 'la conférence sert la nouvelle version')

        # Restaurer l'original.
        pg.reload(); pg.wait_for_selector('.mx-done button[data-act=restore]', timeout=20000)
        pg.locator('.mx-done button[data-act=restore]').click()
        ok(until(lambda: 'Restauration lancée' in pg.locator('main').inner_text(), 10), 'restauration lancée (après confirmation)')
        ok(until(lambda: pg.locator('.mx-steps li').count() == 3, 10), 'étapes de la restauration')
        ok(worker('run_replace_once.mjs').get('ok'), 'original reconverti (worker)')
        ok(until(lambda: 'Original restauré le' in pg.locator('.mx-done').inner_text(), 40), 'original restauré (suivi sans recharger)')
        ok(one('select video_ref from talks where id=%s', T) == f'talks/{tag}-orig' and one('select count(*) from dub_tracks where talk_id=%s', T) == 1, 'vidéo d’origine et version française de retour')
        pg.screenshot(path=str(OUT / 'e4b-restaure-fr-1440.png'), full_page=True)

        # Arabe, 1024 et 390 px.
        ctx2, pg2 = page(org, lang='ar'); pg2.goto(WEB + f'/studio/editor/{pid}/replace?render={R}'); pg2.wait_for_selector('.mx-compare', timeout=20000); pg2.wait_for_timeout(500)
        ok(pg2.evaluate('document.documentElement.dir') == 'rtl' and 'استبدال الفيديو المنشور' in pg2.locator('h1').inner_text() and ov(pg2) <= 1, 'arabe : traduit, de droite à gauche, sans débordement')
        pg2.screenshot(path=str(OUT / 'e4b-ar-1440.png'), full_page=True); ctx2.close()
        for w in (1024, 390):
            pg.set_viewport_size({'width': w, 'height': 900}); pg.goto(WEB + f'/studio/editor/{pid}/replace?render={R}'); pg.wait_for_selector('.mx-compare', timeout=20000); pg.wait_for_timeout(400)
            ok(ov(pg) <= 1, f'{w} px sans débordement'); pg.screenshot(path=str(OUT / f'e4b-fr-{w}.png'), full_page=True)
        ctx.close(); b.close()
finally:
    for t in talks:
        cur.execute("select output_key from editor_renders where talk_id=%s and output_key is not null", (t,)); keys += [r[0] for r in cur.fetchall()]
        keys += [o['Key'] for o in s3.list_objects_v2(Bucket='majlis-videos', Prefix=f'hls/{t}/').get('Contents', [])]
        cur.execute("select new_video_ref from editor_replacements where talk_id=%s", (t,)); keys += [r[0] for r in cur.fetchall() if r[0]]
        cur.execute("delete from activity_controls where ref in (select id::text from editor_replacements where talk_id=%s)", (t,))
        cur.execute('delete from talks where id=%s', (t,))
    for u in users: cur.execute('delete from users where id=%s', (u,))
    for k in set(keys):
        try: s3.delete_object(Bucket='majlis-videos', Key=k)
        except Exception: pass

print(f'\nÉCHECS : {len(bad)} — captures dans {OUT}' if bad else f'\nTout est bon — captures dans {OUT}')
sys.exit(1 if bad else 0)
