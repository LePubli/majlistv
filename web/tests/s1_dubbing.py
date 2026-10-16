#!/usr/bin/env python3
"""Étape S1 : module « Doublage français » dans le Studio (Audio et doublage).
Vérifie : entrée du menu sans « Bientôt », écran d'accueil à 4 onglets (conférences, réglages par défaut, voix, langue d'écoute),
réglage au clavier puis enregistrement, fiche d'une conférence fidèle à la maquette (fil d'Ariane, 2 boutons désactivés tant que
le moteur n'existe pas, voix du doublage, réglages, piste française estimée, segments filtrables), réglages propres à la conférence,
organisateur → écran réservé, module désactivé → invitation à l'activer, FR + AR, 390 / 1440 / 1990 px, aucun débordement.
Prérequis : API (3055) avec stockage de test (5599), PG (5544), site (3001).  Lancement (depuis web/) : python3 tests/s1_dubbing.py [dossier] [fr|ar|fr,ar]"""
import json, pathlib, sys, urllib.request, uuid, datetime
import psycopg2, requests
from playwright.sync_api import sync_playwright
WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-s1'); OUT.mkdir(parents=True, exist_ok=True)
LANGS = sys.argv[2].split(',') if len(sys.argv) > 2 else ['fr', 'ar']  # ex. « fr » puis « ar » pour deux lancements plus courts
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
bad = []; tag = uuid.uuid4().hex[:6]
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def call(path, method='GET', body=None, token=None):
    r = requests.request(method, API + path, json=body, headers={'authorization': 'Bearer ' + token} if token else {})
    try: return r.json()
    except Exception: return {'status': r.status_code}
def member(role):
    em = f's1-{role}-{tag}@test.local'
    call('/auth/register', 'POST', {'email': em, 'password': 'Passw0rd-test', 'name': f'Test {role}'})
    cur.execute('update users set role=%s where email=%s returning id', (role, em))
    return cur.fetchone()[0], call('/auth/login', 'POST', {'email': em, 'password': 'Passw0rd-test'})['token']
adm = call('/auth/login', 'POST', {'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'})['token']
oid, org = member('organizer')
call('/admin/modules/dubbing', 'PUT', {'enabled': True}, adm)
# conférence en arabe avec 230 phrases françaises (dont 3 gardées en voix d'origine)
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language) values (%s,'d','Cheikh Test','youtube',%s,%s,'published','ready','free',1800,'ar','ar') returning id",
            (f'Conférence doublage {tag}', 'v' + uuid.uuid4().hex[:9], oid)); TID = str(cur.fetchone()[0])
for i in range(230):
    txt = '# Verset récité' if i in (3, 50, 120) else f'Phrase traduite numéro {i} pour le doublage français'
    cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (TID, i, i * 4000, i * 4000 + 3500, txt))
# voix cible (échantillon + consentement)
up = call('/studio/dubbing/voices/upload-url', 'POST', {'contentType': 'audio/wav', 'size': 1024}, adm)
requests.put(up['url'], data=b'RIFF' + b'\0' * 1020, headers={'content-type': 'audio/wav'})
VT = call('/studio/dubbing/voices', 'POST', {'kind': 'target', 'name': f'Ma voix {tag}', 'sampleKey': up['key'], 'consentDate': datetime.date.today().isoformat(), 'consentBy': 'Epok', 'consentConfirmed': True, 'gender': 'male'}, adm)['id']
orig_defaults = call('/studio/dubbing/state', token=adm)['defaults']
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    def page(token, w, h, lang='fr'):
        ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
        if token: ctx.add_init_script(f"localStorage.setItem('token', '{token}')")
        return ctx, ctx.new_page()
    for lang in LANGS:
        for w, h in ((1440, 900), (1990, 1030), (390, 844)):
            t = f'[{lang} {w}px]'
            ctx, pg = page(adm, w, h, lang)
            pg.goto(WEB + '/studio/dubbing'); pg.wait_for_selector('.db-page .studio-table', timeout=25000); pg.wait_for_timeout(500)
            ok(pg.evaluate('document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr'), f'{t} sens de lecture')
            link = pg.locator('.studio-nav a[href="/studio/dubbing"]')
            ok(link.count() == 1 and link.locator('.studio-soon').count() == 0 and 'on' in (link.get_attribute('class') or ''), f'{t} menu : « Audio et doublage » allumé, sans « Bientôt »')
            ok(pg.locator('.db-page .st-tabs a').count() == 4, f'{t} 4 onglets')
            ok(pg.locator('.db-engine').count() == 1, f'{t} bandeau : état du moteur de doublage')
            ok(pg.locator(f'.db-table a[href="/studio/dubbing/{TID}"]').count() == 1, f'{t} la conférence de test est listée')
            ok(ov(pg) <= 1, f'{t} accueil sans débordement')
            if w == 1440: pg.screenshot(path=str(OUT / f'doublage-accueil-{lang}.png'), full_page=True)
            # réglages par défaut : clavier sur le curseur « niveau de la voix d'origine », puis enregistrement
            pg.locator('.db-page .st-tabs a[href="#defaults"]').click(); pg.wait_for_selector('.db-defaults input[type=range]', timeout=10000)
            ok(pg.locator('.db-defaults .db-slider').count() >= 2 and pg.locator('.db-defaults details.db-adv').count() == 1, f'{t} réglages par défaut : curseurs + réglages avancés')
            if lang == 'fr' and w == 1440:
                before = pg.locator('#db-duck').input_value()
                pg.locator('#db-duck').focus(); pg.keyboard.press('ArrowRight')
                pg.locator('.db-defaults .db-actions .btn').first.click(); pg.wait_for_selector('.db-defaults .ok-msg', timeout=10000)
                ok(call('/studio/dubbing/state', token=adm)['defaults']['duck'] == int(before) + 1, 'curseur au clavier puis « Enregistrer » : réglage par défaut modifié')
                call('/studio/dubbing/defaults', 'PUT', {'params': orig_defaults}, adm)
            ok(ov(pg) <= 1, f'{t} réglages par défaut sans débordement')
            if w in (1440, 390): pg.screenshot(path=str(OUT / f'doublage-reglages-{lang}-{w}.png'), full_page=True)
            pg.locator('.db-page .st-tabs a[href="#voices"]').click(); pg.wait_for_selector('.db-voice-list .db-voice', timeout=10000)
            ok(pg.locator('.db-voice-list .db-voice').count() >= 7 and pg.locator('.db-add').count() == 2, f'{t} voix : 6 voix Piper + voix cible, 2 formulaires d\'ajout')
            ok(ov(pg) <= 1, f'{t} voix sans débordement')
            if w == 1440 and lang == 'fr': pg.screenshot(path=str(OUT / 'doublage-voix.png'), full_page=True)
            pg.locator('.db-page .st-tabs a[href="#listening"]').click(); pg.wait_for_selector('.db-kpis', timeout=10000)
            ok(pg.locator('.db-kpis .sd-card').count() == 2 and ov(pg) <= 1, f'{t} langue d\'écoute : 2 indicateurs, sans débordement')
            # fiche de la conférence (maquette écran 3)
            pg.goto(WEB + f'/studio/dubbing/{TID}'); pg.wait_for_selector('.db-segs .studio-table', timeout=25000); pg.wait_for_timeout(500)
            ok(tag in pg.locator('.db-crumbs').inner_text(), f'{t} fil d\'Ariane avec le titre')
            ok(pg.locator('.db-head-actions .btn:enabled').count() == 2, f'{t} « Écouter 60 secondes » et « Lancer le doublage » actifs (étape D1a)')
            ok(pg.locator('.st-tabs a.on').count() == 1 and pg.locator('.st-tabs a').count() == 3, f'{t} onglets de la conférence')
            ok(pg.locator('.db-vcard').count() == 2 and pg.locator('.db-vcard.on').count() == 1, f'{t} voix du doublage : ma voix + voix de base, une sélectionnée')
            ok(pg.locator('.db-segs tbody tr').count() == 200, f'{t} 200 premières phrases affichées')
            ok(pg.locator('.db-segs tbody tr.kept').count() == 3, f'{t} versets marqués « voix d\'origine » (3 dans les 200 premières)')
            pg.locator('.db-segs .pills .pill').nth(2).click(); pg.wait_for_timeout(200)
            ok(pg.locator('.db-segs tbody tr').count() == 3, f'{t} filtre « voix d\'origine » : 3')
            pg.locator('.db-segs .pills .pill').nth(0).click(); pg.wait_for_timeout(200)
            pg.locator('.db-segs > .btn.ghost').click(); pg.wait_for_timeout(200)
            ok(pg.locator('.db-segs tbody tr').count() == 230, f'{t} « afficher plus » : 230')
            ok(pg.locator('.db-mention').count() == 1 and pg.locator('.db-status').count() == 1, f'{t} piste française (pas encore) + mention')
            ok(ov(pg) <= 1, f'{t} fiche sans débordement')
            if w in (1440, 390): pg.screenshot(path=str(OUT / f'doublage-fiche-{lang}-{w}.png'), full_page=True)
            if lang == 'fr' and w == 1440:
                pg.locator('.db-vcard', has_text=f'Ma voix {tag}').click()
                save = pg.locator('.db-grid .db-actions .btn').first
                ok(save.is_enabled(), 'choix d\'une voix : bouton « Enregistrer » actif')
                save.click(); pg.wait_for_selector('.db-grid .ok-msg', timeout=10000)
                d = call(f'/studio/dubbing/talks/{TID}', token=adm)
                ok(d['override'] == {'targetVoice': VT}, 'réglages propres à la conférence : seule la voix choisie est enregistrée')
                pg.reload(); pg.wait_for_selector('.db-segs .studio-table', timeout=25000)
                ok(pg.locator('.db-card-own, .sd-card-head .db-tag.on').count() == 1 and 'Ma voix' in pg.locator('.db-vcard.on').inner_text(), 'après rechargement : voix sélectionnée, « Réglages propres » affiché')
                pg.locator('.db-grid .db-actions .btn.ghost').click(); pg.wait_for_selector('.db-grid .ok-msg', timeout=10000)
                ok(call(f'/studio/dubbing/talks/{TID}', token=adm)['override'] == {}, '« Revenir aux réglages par défaut »')
            ctx.close()
            # organisateur : écran réservé à l'administration
            ctx, pg = page(org, w, h, lang); pg.goto(WEB + '/studio/dubbing'); pg.wait_for_selector('.studio-page .sd-card', timeout=25000)
            ok(pg.locator('.db-table').count() == 0 and ov(pg) <= 1, f'{t} organisateur : écran réservé (pas de liste)')
            ctx.close()
    # module désactivé
    if 'fr' in LANGS:
     call('/admin/modules/dubbing', 'PUT', {'enabled': False}, adm)
     ctx, pg = page(adm, 1440, 900); pg.goto(WEB + '/studio/dubbing'); pg.wait_for_selector('a[href="/admin?tab=modules"]', timeout=25000)
     ok(True, 'module désactivé : invitation à l\'activer dans Admin → Modules')
     pg.screenshot(path=str(OUT / 'doublage-desactive.png')); ctx.close()
     call('/admin/modules/dubbing', 'PUT', {'enabled': True}, adm)
    b.close()
cur.execute('delete from talks where id=%s', (TID,)); cur.execute('delete from dub_voices where id=%s', (VT,))
cur.execute("delete from users where email like %s", (f's1-%-{tag}@test.local',))
print('\n' + ('TOUT EST OK' if not bad else f'{len(bad)} ÉCHEC(S)'))
sys.exit(1 if bad else 0)
