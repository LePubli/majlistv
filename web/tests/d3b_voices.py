#!/usr/bin/env python3
"""Étape D3b : voix de synthèse (sans consentement), catégories et choix de la voix de conversion.
Vérifie dans le navigateur : Studio → Audio et doublage → Voix : la case « Voix de synthèse » masque date et nom du consentement,
l'ajout d'une voix de synthèse (échantillon envoyé au stockage) l'affiche avec « Synthèse » et sa catégorie, une vraie voix garde
sa ligne de consentement, le filtre par catégorie, le choix de la voix de conversion rangé par catégorie dans Réglages par défaut,
FR + AR (RTL), 1440 / 390 px sans débordement.
Prérequis : API (3055) avec module dubbing 0.9.0 (CORS_ORIGIN=http://localhost:3001), PG (5544), S3 de test (5599), site (3001).
Lancement (depuis web/) : python3 tests/d3b_voices.py [dossier des captures]"""
import pathlib, sys, tempfile, uuid, os
import psycopg2, requests
from playwright.sync_api import sync_playwright
WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-d3b'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
bad = []; tag = uuid.uuid4().hex[:6]
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
adm = requests.post(API + '/auth/login', json={'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'}).json()['token']
H = {'authorization': 'Bearer ' + adm}
requests.put(API + '/admin/modules/dubbing', headers=H, json={'enabled': True})
wav = os.path.join(tempfile.mkdtemp(), 'voix.wav'); open(wav, 'wb').write(b'RIFF' + b'\0' * 2044)
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
created = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        def page(w, hh, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{adm}')")
            return ctx, ctx.new_page()
        ctx, pg = page(1440, 1100)
        pg.goto(WEB + '/studio/dubbing#voices'); pg.wait_for_selector('.db-add', timeout=25000)
        form = pg.locator('.db-add').first
        ok(form.locator('input[type=date]').count() == 1 and form.locator('input[name=synthetic]').count() == 1, 'formulaire : date du consentement et case « synthèse » présentes')
        form.locator('input[name=synthetic]').check()
        ok(form.locator('input[type=date]').count() == 0 and form.locator('input[required][type=checkbox]').count() == 0, 'case « synthèse » cochée : plus de date, de nom ni de case de consentement')
        form.locator('input[maxlength="80"]').first.fill(f'Fille {tag}')
        form.locator('input[type=file]').set_input_files(wav)
        form.locator('select').first.select_option('child')
        form.locator('button.btn').click()
        try: pg.wait_for_selector(f'.db-voice input[value="Fille {tag}"]', timeout=20000)
        except Exception: print('MESSAGE :', pg.locator('.db-voices [role=status]').all_inner_texts()); raise
        row = pg.locator('.db-voice', has=pg.locator(f'input[value="Fille {tag}"]'))
        ok(row.locator('.db-tag', has_text='Synthèse').count() == 1 and row.locator('.db-tag', has_text='Enfant').count() == 1, 'voix ajoutée : étiquettes « Synthèse » et « Enfant »')
        ok('aucune personne réelle' in row.inner_text() and 'Consentement du' not in row.inner_text(), 'ligne d\'information : voix de synthèse, pas de consentement affiché')
        cur.execute("select id from dub_voices where name=%s", (f'Fille {tag}',)); created.append(cur.fetchone()[0])
        # vraie voix : consentement affiché
        cur.execute("""insert into dub_voices(kind,name,engine,gender,sample_key,consent_date,consent_by,synthetic) values ('target',%s,'chatterbox-vc','female','dubbing/voices/x.wav','2026-10-01','Mme Test',false) returning id""", (f'Femme {tag}',))
        created.append(cur.fetchone()[0]); pg.reload(); pg.wait_for_selector(f'.db-voice input[value="Femme {tag}"]', timeout=20000)
        rowf = pg.locator('.db-voice', has=pg.locator(f'input[value="Femme {tag}"]'))
        ok('Consentement du' in rowf.inner_text() and rowf.locator('.db-tag', has_text='Synthèse').count() == 0, 'vraie voix : consentement affiché, pas « Synthèse »')
        # filtre
        n_all = pg.locator('.db-voice').count()
        pg.locator('.db-filter select').select_option('child')
        n_child = pg.locator('.db-voice').count()
        ok(0 < n_child < n_all and pg.locator('.db-voice', has_text='Femme ' + tag).count() == 0 and pg.locator('.db-voice', has=pg.locator(f'input[value="Fille {tag}"]')).count() == 1, f'filtre « Enfant » : {n_child} voix sur {n_all}')
        pg.locator('.db-filter select').select_option('')
        pg.screenshot(path=str(OUT / 'd3b-voix.png'), full_page=True)
        ok(ov(pg) <= 1, '1440 px : sans débordement')
        # choix par catégorie
        pg.goto(WEB + '/studio/dubbing#defaults'); pg.wait_for_selector('.db-target-pick select', timeout=20000)
        groups = pg.locator('.db-target-pick select optgroup').evaluate_all('els => els.map(e => e.label)')
        ok('Enfant' in groups and 'Femme' in groups, f'choix de la voix de conversion rangé par catégorie : {groups}')
        opt = pg.locator('.db-target-pick select option', has_text=f'Fille {tag}')
        ok(opt.count() == 1 and 'Synthèse' in opt.inner_text(), 'la voix de synthèse est signalée dans la liste')
        pg.locator('.db-target-pick select').select_option(label=f'Fille {tag} · Synthèse')
        ok(pg.locator('.db-target-pick', has_text='Écouter').count() == 1 and pg.locator('.db-target-pick small.meta').count() == 1, 'voix choisie : bouton « Écouter » et avertissement sur la durée')
        pg.screenshot(path=str(OUT / 'd3b-choix.png'), full_page=True)
        ctx.close()
        for lang, w in (('fr', 390), ('ar', 390), ('ar', 1440)):
            ctx, pg = page(w, 900, lang)
            pg.goto(WEB + '/studio/dubbing#voices'); pg.wait_for_selector('.db-add', timeout=25000)
            if lang == 'ar': ok(pg.evaluate("document.documentElement.dir") == 'rtl', f'[ar {w}] RTL')
            ok(ov(pg) <= 1, f'[{lang} {w} px] voix : sans débordement')
            pg.goto(WEB + '/studio/dubbing#defaults'); pg.wait_for_selector('.db-target-pick', timeout=20000)
            ok(ov(pg) <= 1, f'[{lang} {w} px] réglages : sans débordement')
            ctx.close()
        b.close()
finally:
    for v in created: cur.execute("delete from dub_voices where id=%s", (v,))
print('\nTout est bon' if not bad else '\nÉCHECS : ' + '; '.join(bad)); sys.exit(1 if bad else 0)
