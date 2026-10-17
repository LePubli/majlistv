#!/usr/bin/env python3
"""Étape S3 : tableau de bord, contenus et activité du Studio, dans le navigateur.
Vérifie : tableau de bord (dernière conférence, données de la chaîne, production en cours, à faire, espace de stockage, boutons),
encart « Stockage » et pastille « Activité » du menu, Contenus (7 étapes, langue AR → FR, visibilité, vues, filtres À doubler /
À relire / Publiées), Activité (pause / reprise, priorité, pause générale, plage horaire), FR + AR, 390 / 1440 px, sans débordement.
Prérequis : API (3055) avec les modules dubbing, stats, channels, storage ; PG (5544) ; S3 de test (5599) ; site (3001).
Lancement (depuis web/) : python3 tests/s3_studio.py [dossier]"""
import pathlib, sys, time, uuid
import psycopg2, requests
from playwright.sync_api import sync_playwright
WEB, API = 'http://127.0.0.1:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-s3'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
bad = []; tag = uuid.uuid4().hex[:6]; talks = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
adm = requests.post(API + '/auth/login', json={'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'}).json()['token']
H = {'authorization': 'Bearer ' + adm}
for m in ('dubbing', 'stats', 'channels', 'storage'): requests.put(API + f'/admin/modules/{m}', headers=H, json={'enabled': True})
requests.put(API + '/studio/activity/settings', headers=H, json={'pauseAll': False, 'windowEnabled': False, 'windowStart': 22, 'windowEnd': 7})
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
# Les conférences des autres tests ne doivent pas gêner : on les rattache provisoirement à un autre compte.
cur.execute("select id from talks where organizer_id=%s", (aid,)); others = [r[0] for r in cur.fetchall()]
cur.execute("insert into users(email, name, password_hash, role) values (%s,'Tmp','x','organizer') returning id", (f'tmp-{tag}@test.local',)); tmp_owner = cur.fetchone()[0]
cur.execute("update talks set organizer_id=%s where organizer_id=%s", (tmp_owner, aid))
def talk(n, **kw):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,video_progress,access,duration_seconds,language,transcript_language,
                     transcript_status, created_at)
                   values (%s,'d',%s,%s,%s,%s,%s,%s,%s,'free',%s,%s,%s,%s, now() - make_interval(mins => %s)) returning id""",
                (f"{n} {tag}", f'Cheikh {tag}', kw.get('source', 'upload'), f'v-{tag}-{n}', aid, kw.get('pub', 'published'), kw.get('video', 'ready'), kw.get('vpct', 0),
                 kw.get('dur', 3240), kw.get('lang', 'ar'), kw.get('lang', 'ar'), kw.get('tr', 'ready'), kw.get('age', 0)))
    t = str(cur.fetchone()[0]); talks.append(t); return t
try:
    DUB = talk('Patience', age=400)                         # doublée et publiée
    REV = talk('Gratitude', age=300, pub='draft', lang='tr')  # relecture à faire
    RUN = talk('Science', age=200, video='processing', vpct=42, tr='pending', lang='en')
    YT = talk('Repentir', age=500, source='youtube', lang='ar')
    for t in (DUB, REV, YT):
        for i in range(3): cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (t, i, i * 4000, i * 4000 + 3000, f'Phrase {i}'))
    cur.execute("insert into dub_jobs(talk_id, kind, status, params, result, finished_at) values (%s,'full','done','{}','{\"voiceKey\":\"x\"}', now()) returning id", (DUB,)); jd = cur.fetchone()[0]
    cur.execute("insert into dub_tracks(talk_id, job_id, voice_key, duration_s) values (%s,%s,'x',60)", (DUB, jd))
    requests.post(API + f'/studio/dubbing/talks/{DUB}/review', headers=H, json={'validated': True})
    cur.execute("insert into dub_jobs(talk_id, kind, status, params, progress, started_at) values (%s,'full','running','{}',64, now())", (YT,))
    cur.execute("insert into dub_jobs(talk_id, kind, status, params) values (%s,'preview','queued','{}')", (REV,))
    cur.execute("insert into dub_requests(talk_id, user_id) values (%s,%s)", (YT, aid))
    cur.execute("insert into stat_talk_daily(day, talk_id, audience, views, plays, seconds) values ((now() at time zone 'utc')::date, %s, 'web', 2340, 300, 600000)", (DUB,))
    cur.execute("insert into dub_listen(day, talk_id, audio_lang, seconds) values ((now() at time zone 'utc')::date, %s, 'fr', 380), ((now() at time zone 'utc')::date, %s, 'orig', 620)", (DUB, DUB))
    cur.execute("insert into speakers(slug, name, owner_id) values (%s,%s,%s) on conflict (slug) do update set owner_id=excluded.owner_id", (f'cheikh-{tag}', f'Cheikh {tag}', aid))
    cur.execute("insert into speaker_follows(user_id, speaker_slug, speaker_name) values (%s,%s,'x')", (aid, f'cheikh-{tag}'))
    def until(fn, timeout=20):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if fn(): return True
            time.sleep(0.4)
        return False
    def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        def page(w, hh, lang='fr'):
            ctx = b.new_context(viewport={'width': w, 'height': hh}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{adm}')")
            return ctx, ctx.new_page()
        ctx, pg = page(1440, 1000)
        # --- tableau de bord
        pg.goto(WEB + '/studio'); pg.wait_for_selector('.sd-dash .sd-last-info', timeout=25000); pg.wait_for_timeout(800)
        txt = pg.locator('.sd-dash').inner_text()
        ok(f'Patience {tag}' in pg.locator('.sd-last-info b').inner_text(), 'dernière conférence publiée')
        ok('2 340' in txt.replace(' ', ' ') and '38 %' in txt, 'vues depuis la publication et version française écoutée (38 %)')
        ok(pg.locator('.sd-followers .sd-big').inner_text().strip() == '1' and '+1' in pg.locator('.sd-followers').inner_text(), 'abonnés et nouveaux cette semaine')
        ok(pg.locator('.sd-job').count() >= 2 and 'Doublage 64 %' in pg.locator('.sd-row-3').inner_text(), 'production en cours : « Doublage 64 % »')
        ok('demande(s) de version française' in txt and 'relecture(s) de traduction' in txt, 'à faire : relecture et demandes de version française')
        ok(pg.locator('.sd-meter').count() == 2 and 'Gérer le stockage' in txt, 'espace de stockage (Garage, archives)')
        ok(pg.locator('.sd-head-actions a[href="/studio/editor"]').count() == 1 and pg.locator('.sd-head-actions a[href="/studio/new"]').count() == 1, 'boutons « Ouvrir l\'éditeur » et « Nouvelle conférence »')
        ok(pg.locator('.sd-side-space').count() == 1 and '%' in pg.locator('.sd-side-space').inner_text(), 'menu : encart « Stockage »')
        ok(until(lambda: pg.locator('.studio-nav a[href="/studio/activity"] .studio-soon').count() == 1), 'menu : pastille « Activité »')
        ok(ov(pg) <= 1, 'tableau de bord sans débordement (1440 px)')
        pg.screenshot(path=str(OUT / 's3-dashboard-fr-1440.png'))
        # --- contenus
        pg.goto(WEB + '/studio/contents'); pg.wait_for_selector('.pd-table', timeout=25000); pg.wait_for_timeout(600)
        row = lambda n: pg.locator('.pd-table tbody tr', has_text=f'{n} {tag}')
        ok(row('Patience').locator('.pd-dash.ok').count() == 6 and 'Doublée' in row('Patience').inner_text() and 'Publique' in row('Patience').inner_text(), 'conférence doublée : 6 étapes faites (« Montée » sans objet), Publique')
        ok('AR → FR' in row('Patience').inner_text() and '2 340' in row('Patience').inner_text().replace(' ', ' '), 'langue AR → FR et vues')
        ok('Relecture à faire' in row('Gratitude').inner_text() and 'Brouillon' in row('Gratitude').inner_text() and 'TR → FR' in row('Gratitude').inner_text(), 'relecture à faire, brouillon, TR → FR')
        ok('Doublage 64 %' in row('Repentir').inner_text() and 'non montable' in row('Repentir').inner_text(), 'YouTube : doublage 64 %, non montable')
        ok('Conversion 42 %' in row('Science').inner_text(), 'conversion en cours : 42 %')
        pg.locator('.pills .pill', has_text='À relire').click(); pg.wait_for_timeout(300)
        ok(row('Gratitude').count() == 1 and row('Patience').count() == 0, 'filtre « À relire »')
        pg.locator('.pills .pill', has_text='À doubler').click(); pg.wait_for_timeout(300)
        ok(row('Gratitude').count() == 1 and row('Repentir').count() == 1 and row('Patience').count() == 0, 'filtre « À doubler »')
        pg.locator('.pills .pill', has_text='Publiées').click(); pg.wait_for_timeout(300)
        ok(row('Patience').count() == 1 and row('Gratitude').count() == 0, 'filtre « Publiées »')
        pg.locator('.pills .pill').first.click(); pg.locator('.studio-search input').fill('tr → fr'); pg.wait_for_timeout(300)
        ok(row('Gratitude').count() == 1 and row('Patience').count() == 0, 'recherche par langue')
        pg.locator('.studio-search input').fill('')
        ok(pg.locator('.pd-legend').inner_text().count('›') == 6, 'légende : 7 étapes')
        ok(ov(pg) <= 1, 'contenus sans débordement (1440 px)')
        pg.screenshot(path=str(OUT / 's3-contents-fr-1440.png'))
        # --- activité
        pg.goto(WEB + '/studio/activity'); pg.wait_for_selector('.ac-heavy', timeout=25000); pg.wait_for_timeout(500)
        tk = lambda n: pg.locator('.ac-task', has_text=f'{n} {tag}')
        ok(tk('Science').filter(has_text='Conversion vidéo').count() == 1 and tk('Repentir').filter(has_text='Doublage').count() == 1, 'conversion et doublage en cours listés')
        ok(tk('Science').filter(has_text='attend la vidéo').count() == 1, 'transcription « attend la vidéo »')
        prev = tk('Gratitude').filter(has_text='Écoute de 60 s')
        prev.locator('.ac-btn', has_text='Mettre en pause').click()
        ok(until(lambda: pg.locator('#ac-paused').count() == 1 and prev.locator('.ac-state.paused').count() == 1), 'pause d\'une tâche en attente')
        prev.locator('.ac-btn', has_text='Reprendre').click()
        ok(until(lambda: prev.locator('.ac-state.waiting').count() == 1), 'reprise')
        prev.locator('.ac-btn', has_text='Passer en priorité').click()
        ok(until(lambda: prev.locator('.ac-prio').count() == 1), 'priorité')
        prev.locator('.ac-btn', has_text='Priorité normale').click(); until(lambda: prev.locator('.ac-prio').count() == 0)
        dubrun = tk('Repentir').filter(has_text='Doublage')
        ok(dubrun.locator('.ac-btn', has_text='Mettre en pause').count() == 1 and tk('Science').filter(has_text='Conversion vidéo').locator('.ac-btn').count() == 0, 'en cours : pause proposée pour le doublage, pas pour la conversion')
        pg.locator('.ac-heavy-row .btn').click()
        ok(until(lambda: pg.locator('.ac-chip.paused').count() == 1), '« Mettre en pause les tâches lourdes »')
        pg.locator('.ac-heavy-row .btn').click(); until(lambda: pg.locator('.ac-chip.on').count() == 1)
        pg.locator('.ac-window input[type=checkbox]').check(); pg.locator('.ac-hours input').nth(0).fill('2'); pg.locator('.ac-hours input').nth(1).fill('3')
        pg.locator('.ac-window .btn').click()
        s = requests.get(API + '/studio/activity', headers=H).json()['settings']
        ok(until(lambda: requests.get(API + '/studio/activity', headers=H).json()['settings']['windowEnabled']) and s['windowStart'] in (2, 22), 'plage horaire enregistrée')
        ok(ov(pg) <= 1, 'activité sans débordement (1440 px)')
        pg.screenshot(path=str(OUT / 's3-activity-fr-1440.png'), full_page=False)
        requests.put(API + '/studio/activity/settings', headers=H, json={'windowEnabled': False, 'windowStart': 22, 'windowEnd': 7})
        ctx.close()
        for lang, w, hh in (('ar', 1440, 900), ('ar', 390, 844), ('fr', 390, 844)):
            ctx, pg = page(w, hh, lang)
            for path, sel, name in (('/studio', '.sd-dash .sd-last-info', 'dashboard'), ('/studio/contents', '.pd-table', 'contents'), ('/studio/activity', '.ac-heavy', 'activity')):
                pg.goto(WEB + path); pg.wait_for_selector(sel, timeout=25000); pg.wait_for_timeout(500)
                ok(ov(pg) <= 1, f'[{lang} {w}] {name} sans débordement')
                pg.screenshot(path=str(OUT / f's3-{name}-{lang}-{w}.png'), full_page=(w < 500))
            if lang == 'ar': ok(pg.evaluate('document.documentElement.dir') == 'rtl', f'[{lang} {w}] de droite à gauche')
            ctx.close()
        b.close()
finally:
    requests.put(API + '/studio/activity/settings', headers=H, json={'pauseAll': False, 'windowEnabled': False, 'windowStart': 22, 'windowEnd': 7})
    requests.put(API + '/admin/modules/storage', headers=H, json={'enabled': False})
    cur.execute("delete from activity_controls where ref in (select id::text from dub_jobs where talk_id = any(%s::uuid[])) or ref = any(%s)", (talks, talks))
    cur.execute("delete from speaker_follows where speaker_slug=%s", (f'cheikh-{tag}',)); cur.execute("delete from speakers where slug=%s", (f'cheikh-{tag}',))
    for t in talks: cur.execute('delete from talks where id=%s', (t,))
    cur.execute("update talks set organizer_id=%s where organizer_id=%s", (aid, tmp_owner))
    cur.execute("delete from users where id=%s", (tmp_owner,))
print('\n' + ('TOUT EST OK' if not bad else f'{len(bad)} ÉCHEC(S)'))
sys.exit(1 if bad else 0)
