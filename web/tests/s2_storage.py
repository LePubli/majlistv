#!/usr/bin/env python3
"""Étape S2 : Studio → Paramètres → Stockage et archivage, dans le navigateur.
Vérifie : entrée dans Studio → Paramètres (pas dans le menu principal), chiffres (Garage, archives), choix du fournisseur,
« Tester la connexion » (enregistre puis teste, pastille « Connexion réussie »), fichier d'essai archivé puis restauré depuis
« Dans les archives », règles automatiques, secrets jamais affichés, FR + AR, 390 / 1440 px, sans débordement.
Prérequis : API (3055) + module storage, PG (5544), S3 de test (5599), site (3001), rclone dans le PATH et le serveur SFTP de test :
  rclone serve sftp /tmp/sftproot --addr 127.0.0.1:2222 --user arch --pass s3cret
Lancement (depuis web/) : python3 tests/s2_storage.py [dossier]"""
import os, pathlib, sys, time, uuid
import psycopg2, requests
from playwright.sync_api import sync_playwright
WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-s2'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
bad = []; tag = uuid.uuid4().hex[:6]; talks = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
adm = requests.post(API + '/auth/login', json={'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'}).json()['token']
H = {'authorization': 'Bearer ' + adm}
requests.put(API + '/admin/modules/storage', headers=H, json={'enabled': True})
RESET = {k: None for k in ['sftp_host', 'sftp_port', 'sftp_user', 'sftp_secret', 'folder', 'encrypt_pass', 'work_audio_days', 'garage_capacity_gb', 'alert_free_pct']}
requests.put(API + '/studio/storage/settings', headers=H, json={**RESET, 'provider': 'planethoster'})
cur.execute("delete from storage_state")
def until(fn, timeout=30):
    t = time.time()
    while time.time() - t < timeout:
        if fn(): return True
        time.sleep(0.5)
    return False
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        def page(w, hh, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{adm}')")
            return ctx, ctx.new_page()
        ctx, pg = page(1440, 1000)
        pg.goto(WEB + '/studio/settings'); pg.wait_for_selector('.sd-tools', timeout=25000)
        ok(pg.locator('.sd-tool[href="/studio/settings/storage"]').count() == 1, 'Studio → Paramètres : outil « Stockage et archivage »')
        ok(pg.locator('.studio-nav a[href="/studio/settings/storage"]').count() == 0, 'pas d\'entrée dans le menu principal')
        pg.locator('.sd-tool[href="/studio/settings/storage"]').click(); pg.wait_for_selector('.sg-where', timeout=25000)
        ok(pg.locator('.sg-kpi').count() == 3, 'trois chiffres : Garage, archives, originaux en attente')
        ok(pg.locator('.sg-prov').count() == 4 and pg.locator('.sg-prov.on').inner_text().startswith('PlanetHoster'), 'quatre fournisseurs, PlanetHoster par défaut')
        ok(pg.locator('.st-tabs a.on').inner_text() == 'Stockage et archivage', 'onglet « Stockage et archivage » allumé')
        # choix du fournisseur : champs propres à chacun
        pg.locator('.sg-prov').nth(1).click(); ok(pg.locator('.sg-grid input').count() >= 5, 'S3 : adresse, région, bucket, clés')
        pg.locator('.sg-prov').nth(3).click(); ok(pg.locator('.sg-where .sg-grid').count() == 0 and pg.locator('.sg-test .btn').first.is_disabled(), '« Aucun » : pas de champ, test grisé')
        pg.locator('.sg-prov').nth(0).click()
        g = pg.locator('.sg-where .sg-grid').first
        g.locator('input').nth(0).fill('127.0.0.1'); g.locator('input').nth(1).fill('2222'); g.locator('input').nth(2).fill('arch'); g.locator('input[type=password]').fill('s3cret')
        pg.locator('details.db-adv summary').click(); pg.locator('details.db-adv input').first.fill(f'studio-web-{tag}')
        pg.locator('.sg-test .btn').first.click()
        ok(until(lambda: pg.locator('.sg-chip.ok').count() == 1, 40), 'enregistrer + « Tester la connexion » : pastille « Connexion réussie »')
        ok('s3cret' not in pg.content(), 'mot de passe jamais réaffiché')
        ok('Enregistré' in (pg.locator('.sg-where input[type=password]').first.get_attribute('placeholder') or ''), 'mot de passe « enregistré » (champ vide)')
        pg.screenshot(path=str(OUT / 's2-connexion.png'))
        # recette : fichier d'essai archivé puis restauré
        pg.locator('.sg-test .btn').nth(1).click()
        ok(until(lambda: pg.locator('.sg-item.archived').count() >= 1, 40), 'fichier d\'essai archivé (la page se met à jour seule)')
        ok(pg.locator('.sg-kpi').nth(1).locator('.sg-kpi-v').inner_text() != '0 o', 'chiffre « Archives » mis à jour')
        ok(os.path.isdir(f'/tmp/sftproot/studio-web-{tag}/storage-test'), 'fichier présent chez le fournisseur (dossier choisi)')
        pg.locator('.sg-items').first.screenshot(path=str(OUT / 's2-archives.png'))
        pg.locator('.sg-item.archived .sg-link').first.click()
        ok(until(lambda: pg.locator('.sg-item.archived').count() == 0 and pg.locator('.sg-link[aria-expanded]').count() == 1, 40), 'restauré : sort de « Dans les archives »')
        pg.locator('.sg-link[aria-expanded]').click(); ok(pg.locator('.sg-item.restored').count() >= 1, 'historique : « Restauré »')
        # règles
        pg.locator('.sg-rule input').nth(0).fill('45'); pg.locator('.sg-save').click()
        ok(until(lambda: pg.locator('.ok-msg').count() == 1, 10), 'règle modifiée et enregistrée')
        ok(requests.get(API + '/studio/storage', headers=H).json()['settings']['work_audio_days'] == 45, 'valeur enregistrée côté serveur')
        pg.locator('.sg-rule .sg-link, .sd-card .sg-link', has_text='Appliquer maintenant').first.click()
        ok(until(lambda: 'Règles appliquées' in pg.locator('[role=status]').last.inner_text(), 10), '« Appliquer maintenant »')
        ok(ov(pg) <= 1, 'page sans débordement (1440 px)')
        pg.screenshot(path=str(OUT / 's2-fr-1440.png'), full_page=True)
        ctx.close()
        ctx, pg = page(1440, 1000)
        # Audio et doublage : une écoute de 60 s partie aux archives se restaure depuis la fiche
        requests.put(API + '/admin/modules/dubbing', headers=H, json={'enabled': True})
        cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
        cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                       values (%s,'d','Cheikh','upload',%s,%s,'published','ready','free',60,'ar','ar') returning id""", (f'S2 web {tag}', 'v' + tag, aid)); T = str(cur.fetchone()[0]); talks.append(T)
        cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',0,0,3000,'Bonjour')", (T,))
        import boto3, json as _j
        pk = f'dubbing/previews/{T}/p-{tag}-mix.m4a'
        boto3.client('s3', endpoint_url='http://127.0.0.1:5599', aws_access_key_id='test', aws_secret_access_key='test', region_name='garage').put_object(Bucket='majlis-videos', Key=pk, Body=b'm' * 3000)
        cur.execute("""insert into dub_jobs(talk_id, kind, status, params, result, finished_at) values (%s,'preview','done','{}',%s, now() - interval '50 days')""", (T, _j.dumps({'mixKey': pk, 'rtf': 1})))
        requests.post(API + '/studio/storage/auto-run', headers=H)
        cur.execute("select id from archive_items where source_key=%s", (pk,)); arch_id = str(cur.fetchone()[0])
        until(lambda: requests.get(API + f'/studio/storage/archives/{arch_id}', headers=H).json()['item']['status'] == 'archived', 40)
        pg.goto(WEB + f'/studio/dubbing/{T}'); pg.wait_for_selector('.db-listen .btn', timeout=25000)
        pg.locator('.db-listen .btn').first.click()
        ok(until(lambda: pg.locator('.db-archived').count() == 1, 10), 'fiche doublage : « Ce fichier est dans les archives »')
        pg.locator('.db-archived .btn').click()
        ok(until(lambda: requests.get(API + f'/studio/storage/archives/{arch_id}', headers=H).json()['item']['status'] == 'restored', 40), '« Restaurer » depuis la fiche : fichier revenu')
        pg.locator('.db-archived .btn').click()
        ok(until(lambda: pg.locator('.db-listen audio').count() == 1, 10), 'écoute de nouveau disponible')
        ctx.close()
        for lang, w, hh in (('ar', 1440, 900), ('ar', 390, 844), ('fr', 390, 844)):
            ctx, pg = page(w, hh, lang)
            pg.goto(WEB + '/studio/settings/storage'); pg.wait_for_selector('.sg-where', timeout=25000); pg.wait_for_timeout(400)
            ok(ov(pg) <= 1, f'[{lang} {w}] sans débordement')
            if lang == 'ar': ok(pg.evaluate('document.documentElement.dir') == 'rtl', f'[{lang} {w}] de droite à gauche')
            pg.screenshot(path=str(OUT / f's2-{lang}-{w}.png'), full_page=True)
            ctx.close()
        b.close()
finally:
    requests.put(API + '/studio/storage/settings', headers=H, json={**RESET, 'provider': 'planethoster'})
    requests.put(API + '/admin/modules/storage', headers=H, json={'enabled': False})
    cur.execute("delete from archive_items where source_key like 'storage-test/%%' or source_key like %s", (f'%{tag}%',))
    for t in talks: cur.execute('delete from talks where id=%s', (t,))
print('\n' + ('TOUT EST OK' if not bad else f'{len(bad)} ÉCHEC(S)'))
sys.exit(1 if bad else 0)
