#!/usr/bin/env python3
"""Bouton « Télécharger les sous-titres (.vtt) » (Studio → Contenu → Transcription).
Vérifie : bouton présent, téléchargement réel du fichier (nom, contenu WebVTT), changement de langue, bouton grisé pendant une modification,
anglais et arabe (RTL), pas de débordement 390 px.
Prérequis : API (3055), PG (5544), site (3001) recompilé (npx next build).
Lancement (depuis web/) : python3 tests/vtt_export.py [dossier des captures]"""
import pathlib, sys, time, uuid
import psycopg2, requests
from playwright.sync_api import sync_playwright

WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-vtt'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
def until_lang(pg, code, timeout=15):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if pg.locator('.ct-tools select').input_value(timeout=500) == code: return
        except Exception: pass
        time.sleep(0.3)
    raise SystemExit('langue non affichée : ' + code)
bad = []; tag = uuid.uuid4().hex[:6]
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
em = f'vtt-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': f'Orga {tag}'})
cur.execute("update users set role='organizer' where email=%s returning id", (em,)); oid = str(cur.fetchone()[0])
tok = requests.post(API + '/auth/login', json={'email': em, 'password': 'Passw0rd-test'}).json()['token']
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
               values (%s,'d','Cheikh Test','upload',%s,%s,'draft','ready','free',60,'fr','fr','ready') returning id""", (f'Export {tag}', f'talks/{tag}', oid))
T = str(cur.fetchone()[0])
for lang, texts in (('fr', ['Bonjour à tous', 'La patience est une lumière']), ('en', ['Hello all', 'Patience is a light'])):
    for i, tx in enumerate(texts):
        cur.execute("insert into transcript_segments values (%s,%s,%s,%s,%s,%s)", (T, lang, i, i * 2000, i * 2000 + 1800, tx))
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        for lang, w, label in (('fr', 1280, 'fr'), ('en', 1280, 'en'), ('ar', 390, 'ar')):
            ctx = b.new_context(viewport={'width': w, 'height': 900}, accept_downloads=True)
            ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')")
            pg = ctx.new_page()
            pg.goto(f'{WEB}/studio/{T}/content'); pg.wait_for_selector('[data-act="export-vtt"]', timeout=25000)
            ok(True, f'[{label}] bouton présent : « {pg.inner_text("[data-act=export-vtt]").strip()} »')
            if lang == 'ar': ok(pg.evaluate('document.documentElement.dir') == 'rtl', '[ar] page en RTL')
            ok(pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth') <= 1, f'[{label}] pas de débordement horizontal ({w} px)')
            with pg.expect_download() as d: pg.click('[data-act="export-vtt"]')
            dl = d.value; path = OUT / f'{label}-{dl.suggested_filename}'; dl.save_as(path)
            txt = path.read_text(encoding='utf-8')
            ok(dl.suggested_filename == 'sous-titres-fr.vtt', f'[{label}] nom du fichier : {dl.suggested_filename}')
            ok(txt.startswith('WEBVTT') and 'Bonjour à tous' in txt and '00:00:02.000 --> 00:00:03.800' in txt and txt.count('-->') == 2, f'[{label}] contenu WebVTT français correct')
            if lang == 'fr':
                pg.select_option('.ct-tools select', 'en')
                until_lang(pg, 'en')
                time.sleep(0.5)
                with pg.expect_download() as d2: pg.click('[data-act="export-vtt"]')
                t2 = pathlib.Path(d2.value.path()).read_text(encoding='utf-8')
                ok(d2.value.suggested_filename == 'sous-titres-en.vtt' and 'Hello all' in t2, '[fr] changement de langue : fichier en anglais')
                pg.wait_for_selector('.ct-tools select'); pg.select_option('.ct-tools select', 'fr'); until_lang(pg, 'fr'); time.sleep(0.6)
                pg.locator('.ct-seg textarea, .seg textarea, textarea').first.fill('Texte modifié sans enregistrer')
                ok(pg.is_disabled('[data-act="export-vtt"]'), '[fr] bouton grisé tant qu\'il y a une modification non enregistrée')
                pg.screenshot(path=str(OUT / 'fr-modifie.png'))
            pg.screenshot(path=str(OUT / f'{label}.png')); ctx.close()
        b.close()
finally:
    cur.execute("delete from talks where id=%s", (T,)); cur.execute("delete from users where id=%s", (oid,))
print('\n' + ('Tout est bon' if not bad else f'{len(bad)} échec(s)'))
sys.exit(1 if bad else 0)
