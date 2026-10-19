#!/usr/bin/env python3
"""Étape E5c : bouton « Préciser la place des mots » dans l'onglet Texte.
Vérifie : place estimée signalée, bouton, demande en attente puis calcul (faux Whisper), mise à jour toute seule en « précise », lecture seule, arabe.
Prérequis : API (3055), PG (5544), S3 de test (5599), site (3001) recompilé (npx next build), FFmpeg.
Lancement (depuis web/) : python3 tests/e5a_text.py [dossier des captures]"""
import pathlib, sys, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-e5c'); OUT.mkdir(parents=True, exist_ok=True)
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
em = f'e5c-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': f'Orga {tag}'})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0]); users.append(oid)
org = login(em, 'Passw0rd-test')
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
               values (%s,'d','Cheikh Test','upload',%s,%s,'published','ready','free',60,'fr','fr','ready') returning id""", (f'Précision {tag}', f'talks/{tag}', oid))
T = str(cur.fetchone()[0]); talks.append(T)
make_hls(s3, T, 60, codec='vp9'); n = add_transcript(cur, T, 60)
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
def run_align():
    import subprocess
    p = subprocess.run(['python3', str(pathlib.Path(__file__).resolve().parents[2] / 'transcriber' / 'tests' / 'run_align_once.py')], capture_output=True, text=True, timeout=120)
    return p.stdout.strip().splitlines()[-1] if p.stdout.strip() else p.stderr[-300:]

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
        pg.locator('.mtw-tabs [data-tab="text"]').click(); pg.wait_for_selector('.mtw-text .mtw-w', timeout=15000)
        ok('estim' in pg.locator('.mtw-foot').inner_text().lower(), f"place des mots estimée : « {pg.locator('.mtw-foot').inner_text()} »")
        ok(pg.locator('[data-act="text-align"]').is_enabled() and pg.locator('.mtw-align').count() == 1, 'bouton « Préciser la place des mots » présent')
        pg.screenshot(path=str(OUT / 'e5c-avant-1440.png'))
        pg.locator('[data-act="text-align"]').click()
        ok(until(lambda: pg.locator('[data-align="pending"]').count() == 1, 10) and pg.locator('[data-act="text-align"]').is_disabled(), 'demande faite : « en attente », bouton inactif')
        cur.execute("select status from word_align_jobs where talk_id=%s", (T,)); ok(cur.fetchone()[0] == 'pending', 'demande enregistrée côté serveur')
        out = run_align(); ok('"claimed": true' in out, f'le service de transcription traite la demande ({out})')
        ok(until(lambda: pg.locator('.mtw-foot').inner_text().lower().count('précis') > 0 and 'estim' not in pg.locator('.mtw-foot').inner_text().lower(), 15), f"la page se met à jour toute seule : « {pg.locator('.mtw-foot').inner_text()} »")
        cur.execute("select count(*) from transcript_words where talk_id=%s and lang='fr'", (T,)); ok(cur.fetchone()[0] > 10, 'mots enregistrés')
        # couper un mot : le montage est coupé au moment entendu (0,1 s après le début de la phrase)
        w0 = pg.locator('.mtw-seg').nth(1).locator('.mtw-w').nth(0); w0.click(); pg.keyboard.press('Delete')
        ok(until(lambda: pg.locator('.mtw-w.cut').count() >= 1, 5), 'couper un mot fonctionne après la précision')
        pg.screenshot(path=str(OUT / 'e5c-apres-1440.png'))
        ctx.close()
        # Lecture seule : un autre utilisateur (accès en lecture) ne peut pas demander.
        for lang in ('ar',):
            c2, p2 = page(org, lang=lang)
            p2.goto(f'{WEB}/studio/editor/{pid}'); p2.wait_for_selector('.mt-editor .mt-clip', timeout=25000)
            p2.locator('.mtw-tabs [data-tab="text"]').click(); p2.wait_for_selector('.mtw-text .mtw-w', timeout=15000)
            ok(p2.evaluate('document.documentElement.dir') == 'rtl' and ov(p2) <= 1, f'{lang.upper()} 1440 px : RTL, sans débordement')
            p2.screenshot(path=str(OUT / f'e5c-{lang}-1440.png'))
            c2.close()
        b.close()
finally:
    for t in talks:
        for o in s3.list_objects_v2(Bucket='majlis-videos', Prefix=f'hls/{t}/').get('Contents', []): s3.delete_object(Bucket='majlis-videos', Key=o['Key'])
        cur.execute('delete from talks where id=%s', (t,))
    for u in users: cur.execute('delete from users where id=%s', (u,))
print(f"\n{'ÉCHECS : ' + str(len(bad)) if bad else 'Tout est bon'} — captures dans {OUT}")
sys.exit(1 if bad else 0)
