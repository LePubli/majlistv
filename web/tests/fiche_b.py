#!/usr/bin/env python3
"""Fiche vidéo — proposition B (choisie par Epok le 20/10).
Vérifie : lecteur dans le bandeau sombre, barre de 5 actions en icônes (Favori, Ma liste, Partager, Marque-page, Plus), anciens
boutons disparus (vitesses, mode cinéma, signaler hors du menu), menu « Plus » (vitesses, mode cinéma, signaler, Échap),
favori enregistré, liste, carte « Apprendre avec cette conférence » (quiz, révision, action) qui ouvre le quiz et la mise en
pratique sur la vidéo, lien « Mes notes », onglets (sans « Quiz »), téléphone (carte Apprendre avant les onglets, 5 actions sur
une ligne), arabe (RTL), 390 / 1024 / 1440 px sans débordement.
Prérequis : API (3055), PG (5544), S3 de test (5599), site (3001), FFmpeg. Lancement (depuis web/) : python3 tests/fiche_b.py [captures]"""
import os, pathlib, sys, time, uuid
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'api' / 'tests'))
from e1_fixture import make_hls, add_transcript

WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-fiche-b'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:5599', aws_access_key_id='test', aws_secret_access_key='test', region_name='garage')
bad = []; tag = uuid.uuid4().hex[:6]; talks = []; users = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def login(e, pw): return requests.post(API + '/auth/login', json={'email': e, 'password': pw}).json()['token']
adm = login('admin@test.local', 'AdminPassw0rd-test'); H = {'authorization': 'Bearer ' + adm}
for m in requests.get(API + '/admin/modules', headers=H).json()['modules']: requests.put(API + f"/admin/modules/{m['id']}", headers=H, json={'enabled': True})
em = f'fb-{tag}@test.local'; requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': f'Membre {tag}'})
cur.execute("select id from users where email=%s", (em,)); uid = str(cur.fetchone()[0]); users.append(uid)
tok = login(em, 'Passw0rd-test')
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
               values (%s,'Une conférence sur la patience.','Cheikh Test','upload','x',(select id from users where email='admin@test.local'),'published','ready','free',60,'ar','ar','ready') returning id""", (f'Patience {tag}',))
T = str(cur.fetchone()[0]); talks.append(T); make_hls(s3, T, 60, codec='vp9'); add_transcript(cur, T, 60)
cur.execute("insert into quiz_questions(talk_id,lang,question,options,correct_index,status) select %s,'fr','Question '||g,'[\"A\",\"B\",\"C\"]',0,'approved' from generate_series(1,3) g", (T,))
cur.execute("insert into practice_suggestions(talk_id,lang,text,status) values (%s,'fr','Une petite action de patience','approved')", (T,))
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
def until(fn, timeout=10):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if fn(): return True
        except Exception: pass
        time.sleep(0.25)
    return False
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        def page(w=1440, hh=1000, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')")
            return ctx, ctx.new_page()
        ctx, pg = page()
        pg.goto(WEB + f'/talks/{T}'); pg.wait_for_selector('.wb-bar', timeout=25000); pg.wait_for_timeout(1500)
        ok(pg.locator('.wb-hero .player-wrap video').count() == 1 and pg.locator('.wb-hero .talk-head h1').inner_text().startswith('Patience'), 'lecteur et titre dans le bandeau sombre')
        labels = [x.strip() for x in pg.locator('.wb-bar > .wb-act .wb-lbl, .wb-bar .ls-pop .wb-lbl, .wb-bar .wb-more > .wb-act .wb-lbl').all_inner_texts()]
        ok(labels == ['Favori', 'Ma liste', 'Partager', 'Marque-page', 'Plus'], f'barre d\'actions : {labels}')
        ok(pg.locator('.player-tools, .talk-actions, .quiz-card, .cinema-toggle').count() == 0, 'anciens boutons (vitesses, cinéma, carte quiz) retirés de la page')
        ok(pg.locator('.rp').is_visible() is False, '« Signaler » rangé dans le menu « Plus »')
        # favori
        pg.locator('[data-act="fav"]').click()
        ok(until(lambda: pg.locator('[data-act="fav"]').get_attribute('aria-pressed') == 'true'), 'Favori : bouton allumé')
        cur.execute("select count(*) from favorites where user_id=%s and talk_id=%s", (uid, T)); ok(cur.fetchone()[0] == 1, 'Favori enregistré')
        # liste
        pg.locator('[data-act="list"]').click(); ok(until(lambda: pg.locator('.ls-menu').is_visible()), 'Ma liste : le choix des listes s\'ouvre')
        pg.keyboard.press('Escape')
        # menu Plus
        pg.locator('[data-act="more"]').click(); pg.wait_for_selector('.wb-menu', timeout=5000)
        ok(pg.locator('.wb-menu .speed-pill').count() == 6 and pg.locator('.wb-menu [data-act="cinema"]').count() == 1 and pg.locator('.wb-menu .rp').count() == 1, 'menu « Plus » : vitesses, mode cinéma, signaler')
        pg.locator('.wb-menu .speed-pill', has_text='1.5×').click()
        ok(pg.evaluate("document.querySelector('.wb-hero video').playbackRate") == 1.5, 'vitesse 1,5× appliquée au lecteur')
        pg.screenshot(path=str(OUT / 'menu-plus.png'))
        pg.keyboard.press('Escape'); ok(until(lambda: pg.locator('.wb-menu').count() == 0, 3), 'Échap referme le menu')
        # carte Apprendre
        steps = pg.locator('.wb-learn .wb-step').evaluate_all('els => els.map(e => e.dataset.step)')
        ok(steps == ['quiz', 'revision', 'practice'], f'carte « Apprendre » : comprendre, retenir, agir ({steps})')
        tabs = pg.locator('.tablist [role=tab]').all_inner_texts()
        ok(not any('Quiz' in x for x in tabs) and tabs[-1] == 'À propos', f'onglets sans « Quiz », « À propos » en dernier : {tabs}')
        pg.locator('.wb-learn [data-act="quiz"]').click()
        ok(until(lambda: pg.locator('.wb-hero .quiz-overlay').count() == 1), 'Commencer : le quiz s\'ouvre sur la vidéo')
        pg.screenshot(path=str(OUT / 'quiz.png'))
        pg.reload(); pg.wait_for_selector('.wb-learn', timeout=20000)
        pg.locator('.wb-learn [data-act="practice"]').click()
        ok(until(lambda: pg.locator('.wb-hero .quiz-overlay').count() == 1), 'Agir → Choisir : la mise en pratique s\'ouvre sur la vidéo')
        pg.reload(); pg.wait_for_selector('.wb-learn', timeout=20000)
        pg.locator('.wb-learn [data-act="notes"]').click()
        ok(until(lambda: pg.locator('#tab-notes').get_attribute('aria-selected') == 'true'), '« Mes notes » ouvre l\'onglet des notes')
        ok(ov(pg) <= 1, '1440 px : sans débordement')
        pg.screenshot(path=str(OUT / 'fiche-1440.png'), full_page=True)
        ctx.close()
        for lang, w, hh in (('fr', 390, 900), ('ar', 390, 900), ('fr', 1024, 900), ('ar', 1440, 1000)):
            ctx, pg = page(w, hh, lang)
            pg.goto(WEB + f'/talks/{T}'); pg.wait_for_selector('.wb-bar', timeout=25000); pg.wait_for_timeout(1200)
            ok(ov(pg) <= 1, f'[{lang} {w} px] sans débordement')
            if lang == 'ar': ok(pg.evaluate("document.documentElement.dir") == 'rtl', f'[{lang} {w} px] RTL')
            if w == 390:
                tops = pg.evaluate("[...document.querySelectorAll('.wb-bar .wb-ico')].map(e => Math.round(e.getBoundingClientRect().top))")
                ok(len(tops) == 5 and len(set(tops)) == 1, f'[{lang} 390 px] 5 actions sur une seule ligne')
                ok(pg.locator('.wb-learn').bounding_box()['y'] < pg.locator('.tablist').bounding_box()['y'], f'[{lang} 390 px] carte « Apprendre » avant les onglets')
            pg.screenshot(path=str(OUT / f'fiche-{lang}-{w}.png'), full_page=True)
            ctx.close()
        b.close()
finally:
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for u in users: cur.execute("delete from users where id=%s", (u,))
print('\nTout est bon' if not bad else '\nÉCHECS : ' + '; '.join(bad)); sys.exit(1 if bad else 0)
