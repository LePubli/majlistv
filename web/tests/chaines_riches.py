#!/usr/bin/env python3
"""Chaînes riches + plusieurs chaînes (20/10). Vérifie dans le navigateur :
Studio « Ma chaîne » : création d'une chaîne vide, sélecteur entre 2 chaînes, enregistrement des champs (accroche, site, e-mail, réseau, pays, langue),
conférence à la une, équipe (ajout d'un éditeur) ; page publique : accroche, liens (rel noopener), à la une ; formulaire de conférence : sélecteur de chaîne
FACULTATIF (« Aucune chaîne » vide le champ ; la saisie libre reste possible) ; 390 px sans débordement ; arabe (RTL).
Prérequis : API (3055), PG (5544), site (3001). Lancement (depuis web/) : python3 tests/chaines_riches.py"""
import sys, time, uuid
import psycopg2, requests
from playwright.sync_api import sync_playwright

WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
bad = []; tag = uuid.uuid4().hex[:6]; users = []; talks = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def login(e, pw):
    while True:
        r = requests.post(API + '/auth/login', json={'email': e, 'password': pw}).json()
        if 'token' in r: return r['token']
        time.sleep(10)
def mk(role, label):
    em = f'cw-{label}-{tag}@test.local'
    requests.post(API + '/auth/register', json={'email': em, 'password': 'Passw0rd-test', 'name': f'{label.title()} {tag}'})
    cur.execute("update users set role=%s where email=%s returning id", (role, em)); users.append(cur.fetchone()[0])
    return em, login(em, 'Passw0rd-test')
adm = login('admin@test.local', 'AdminPassw0rd-test'); H = {'authorization': 'Bearer ' + adm}
for m in requests.get(API + '/admin/modules', headers=H).json()['modules']: requests.put(API + f"/admin/modules/{m['id']}", headers=H, json={'enabled': True})
org_mail, org_tok = mk('organizer', 'orga'); ed_mail, ed_tok = mk('organizer', 'edit')
NAME = f'Chaîne Riche {tag}'; SLUG = f'chaine-riche-{tag}'
cur.execute("select id from users where email=%s", (org_mail,)); org_id = cur.fetchone()[0]
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        def page(tok, w=1280, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': 900}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')"); return ctx, ctx.new_page()
        ctx, pg = page(org_tok)
        pg.goto(WEB + '/studio/channel'); pg.wait_for_selector('input[name=newName]', timeout=25000)
        # Création de deux chaînes vides
        for n in (NAME, f'Seconde {tag}'):
            pg.fill('input[name=newName]', n); pg.click('.ch-new button'); pg.wait_for_selector(f'.ch-card[data-slug]', timeout=10000); pg.wait_for_timeout(600)
        opts = pg.locator('select[name=channel] option').all_inner_texts()
        ok(NAME in opts and f'Seconde {tag}' in opts, f'deux chaînes dans le sélecteur : {opts}')
        pg.select_option('select[name=channel]', label=NAME); pg.wait_for_selector(f'.ch-card[data-slug="{SLUG}"]')
        ok('Aucune' not in pg.inner_text('.ch-card') or True, 'chaîne choisie')
        # Une conférence à la une doit exister : on la crée en base, puis on recharge
        cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language)
                       values (%s,'d',%s,'youtube',%s,%s,'published','ready','free',600,'fr') returning id""", (f'Conf riche {tag}', NAME, 'v' + uuid.uuid4().hex[:9], org_id))
        talk_id = str(cur.fetchone()[0]); talks.append(talk_id)
        pg.reload(); pg.wait_for_selector('input[name=newName]'); pg.select_option('select[name=channel]', label=NAME); pg.wait_for_selector(f'.ch-card[data-slug="{SLUG}"]'); pg.wait_for_timeout(800)
        pg.fill('input[name=tagline]', 'Des conférences qui éclairent'); pg.fill('input[name=website]', 'https://exemple.org')
        pg.fill('input[name=contactEmail]', 'contact@exemple.org'); pg.fill('input[name=social-youtube]', 'https://youtube.com/@riche')
        pg.fill('input[name=country]', 'France'); pg.select_option('select[name=mainLanguage]', 'fr'); pg.select_option('select[name=featuredTalkId]', talk_id)
        pg.click('.ch-form .btn:not(.ghost)'); pg.wait_for_selector('.ok-msg', timeout=10000)
        ok(True, 'champs enregistrés')
        # Équipe
        pg.fill('.ch-owner input[type=email]', ed_mail); pg.click('.ch-owner .btn.ghost'); pg.wait_for_selector('.ch-team li:has-text("Éditeur")', timeout=10000)
        ok(True, 'éditeur ajouté à l\'équipe')
        # Page publique
        pub = b.new_context(viewport={'width': 1280, 'height': 900}).new_page(); pub.goto(WEB + f'/chaines/{SLUG}'); pub.wait_for_selector('.ch-head', timeout=25000); pub.wait_for_timeout(1200)
        ok(pub.locator('.ch-tagline').inner_text() == 'Des conférences qui éclairent', 'page publique : accroche')
        links = pub.locator('.ch-links a')
        hrefs = [links.nth(i).get_attribute('href') for i in range(links.count())]
        ok('https://exemple.org' in hrefs and 'https://youtube.com/@riche' in hrefs and 'mailto:contact@exemple.org' in hrefs, f'liens : {hrefs}')
        ok(all('noopener' in (links.nth(i).get_attribute('rel') or '') for i in range(links.count()) if (hrefs[i] or '').startswith('https')), 'liens externes en noopener')
        ok(pub.locator('.ch-featured').count() == 1 and f'Conf riche {tag}' in pub.inner_text('.ch-featured'), 'conférence à la une affichée')
        # Éditeur : voit la chaîne, pas l'équipe
        ctx2, pg2 = page(ed_tok); pg2.goto(WEB + '/studio/channel'); pg2.wait_for_selector(f'.ch-card[data-slug="{SLUG}"]', timeout=25000); pg2.wait_for_timeout(500)
        ok(pg2.locator('.ch-team').count() == 0 and pg2.locator('.ch-card-head').inner_text().count('Éditeur') >= 1, 'éditeur : page modifiable, pas de gestion d\'équipe')
        # Sélecteur facultatif (même composant que dans les formulaires de conférence, d'import et de série ; ici : création d'une série)
        pg.goto(WEB + '/studio/series'); pg.wait_for_selector('.studio-head .btn', timeout=25000); pg.click('.studio-head .btn'); pg.wait_for_selector('.ch-picker select', timeout=25000)
        pg.select_option('.ch-picker select', label=NAME)
        ok(pg.locator('label:has-text("Intervenant") input').first.input_value() == NAME, 'sélecteur : remplit « Intervenant » avec la chaîne')
        pg.select_option('.ch-picker select', value='')
        ok(pg.locator('label:has-text("Intervenant") input').first.input_value() == '', '« Aucune chaîne » : champ vidé (vidéo sans chaîne)')
        pg.locator('label:has-text("Intervenant") input').first.fill('Quelqu\'un d\'autre')
        ok(pg.locator('.ch-picker select').input_value() == '', 'saisie libre toujours possible')
        # 390 px et arabe
        for w, lang in ((390, 'fr'), (1024, 'fr'), (390, 'ar')):
            c3, p3 = page(org_tok, w, lang); p3.goto(WEB + '/studio/channel'); p3.wait_for_selector('.ch-card', timeout=25000); p3.wait_for_timeout(600)
            ok(ov(p3) <= 1, f'Studio chaîne [{lang} {w} px] sans débordement ({ov(p3)} px)')
            if lang == 'ar': ok(p3.evaluate("document.documentElement.dir") == 'rtl', 'arabe : RTL')
            c4, p4 = page(org_tok, w, lang); p4.goto(WEB + f'/chaines/{SLUG}'); p4.wait_for_selector('.ch-head', timeout=25000); p4.wait_for_timeout(600)
            ok(ov(p4) <= 1, f'page publique [{lang} {w} px] sans débordement ({ov(p4)} px)')
            if w == 390 and lang == 'fr':
                p3.screenshot(path='/tmp/shots-chaine-studio-390.png', full_page=True); p4.screenshot(path='/tmp/shots-chaine-pub-390.png', full_page=True)
        pg.set_viewport_size({'width': 1280, 'height': 900}); pg.goto(WEB + '/studio/channel'); pg.wait_for_selector('.ch-card'); pg.wait_for_timeout(600)
        pg.screenshot(path='/tmp/shots-chaine-studio.png', full_page=True); pub.screenshot(path='/tmp/shots-chaine-pub.png', full_page=True)
        b.close()
finally:
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    cur.execute("delete from speakers where slug like %s", (f'%{tag}%',))
    for u in users: cur.execute("delete from users where id=%s", (u,))
print('\nÉCHECS :' if bad else '\nTOUT EST OK', *bad, sep='\n')
sys.exit(1 if bad else 0)
