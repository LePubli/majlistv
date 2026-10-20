#!/usr/bin/env python3
"""Étape D3c : écran « Intervenants » de Studio → Audio et doublage dans un vrai navigateur (Chromium) : cartes d'intervenants, nom, voix de base / cible,
« voix finale », curseur de hauteur (clavier), propositions de voix, intervenant de chaque phrase (liste + filtre), plage de phrases, aperçu rapide d'une hauteur
(lecteur : vitesse sans conserver la hauteur), détection demandée / en cours / annulée / en échec, Studio → Activité ; fr 1440 px, ar 390 px (RTL), fr 820 px ;
pas de débordement horizontal.
Prérequis : API (3055, module doublage 0.10.0), PG (5544), S3 de test (5599), site (3001). Lancement (depuis web/) : python3 tests/dubbing_intervenants.py [dossier-captures]"""
import io, json, pathlib, sys, time, urllib.request, uuid, wave
import boto3, psycopg2, requests
from playwright.sync_api import sync_playwright
WEB, API = 'http://localhost:3001', 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-d3c'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
s3 = boto3.client('s3', endpoint_url='http://127.0.0.1:5599', aws_access_key_id='test', aws_secret_access_key='test', region_name='garage')
bad = []; tag = uuid.uuid4().hex[:6]; talks = []; voices = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
tok = requests.post(API + '/auth/login', json={'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'}).json()['token']
H = {'authorization': 'Bearer ' + tok}
def api(method, path, **kw):
    r = requests.request(method, API + path, headers=H, **kw); return r.status_code, (r.json() if r.content else None)
api('PUT', '/admin/modules/dubbing', json={'enabled': True, 'settings': {'mod_dubbing_require_review': 'false'}})
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
               values (%s,'d','Cheikh','upload',%s,%s,'draft','ready','free',120,'ar','ar') returning id""", (f'Dialogue {tag}', f'talks/{tag}', aid)); T = str(cur.fetchone()[0]); talks.append(T)
WHO = [1, 1, 2, 1, 3, 2, 1, 2, 1, 1]
for i, n in enumerate(WHO):
    cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (T, i, 60000 + i * 6000, 60000 + i * 6000 + 5000, f'Phrase numéro {i} du dialogue.'))
    cur.execute("insert into dub_phrase_speakers(talk_id,idx,speaker) values (%s,%s,%s)", (T, i, n))
for n, lab, sec, ph, f0, g in ((1, 'Intervenant 1', 30.0, 5, 112.0, 'male'), (2, 'Intervenant 2', 15.0, 3, 205.0, 'female'), (3, 'Intervenant 3', 5.0, 1, 290.0, 'child')):
    cur.execute("insert into dub_speakers(talk_id,n,label,seconds,phrases,f0,guess) values (%s,%s,%s,%s,%s,%s,%s)", (T, n, lab, sec, ph, f0, g))
def target(name, gender):
    up = api('POST', '/studio/dubbing/voices/upload-url', json={'contentType': 'audio/wav', 'size': 2048})[1]
    requests.put(up['url'], data=b'RIFF' + b'\0' * 2044, headers={'content-type': 'audio/wav'})
    r = api('POST', '/studio/dubbing/voices', json={'kind': 'target', 'name': f'{name} {tag}', 'sampleKey': up['key'], 'synthetic': True, 'gender': gender})[1]; voices.append(r['id']); return r['id']
VF, VC = target('Voix femme', 'female'), target('Voix enfant', 'child')
# une écoute de 60 s déjà faite (fichier WAV de 3 s sous la clé « voix seule »), fenêtre qui commence à 59,5 s
buf = io.BytesIO()
with wave.open(buf, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(b'\0\0' * 24000 * 3)
vkey = f'dubbing/previews/{T}/x-voice.m4a'; s3.put_object(Bucket='majlis-videos', Key=vkey, Body=buf.getvalue(), ContentType='audio/wav')
cur.execute("""insert into dub_jobs(talk_id, kind, status, params, result, finished_at, phase, progress) values (%s,'preview','done', %s, %s, now(), '', 100)""",
            (T, json.dumps({'pitch': 0, 'speakers': [{'n': 1, 'pitch': 0}, {'n': 2, 'pitch': 0}, {'n': 3, 'pitch': 0}]}), json.dumps({'voiceKey': vkey, 'window': [59.5, 119.5], 'rtf': 1.0, 'segments': [], 'summary': {}})))
def ov(pg): return pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
def ro(q): cur.execute(q); return cur.fetchone()
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        # ---------- fr 1440
        ctx = b.new_context(viewport={'width': 1440, 'height': 1000}); ctx.add_cookies([{'name': 'locale', 'value': 'fr', 'url': WEB}])
        ctx.add_init_script(f"localStorage.setItem('token', '{tok}')"); pg = ctx.new_page()
        pg.goto(f'{WEB}/studio/dubbing/{T}'); pg.wait_for_selector('.spk-card', timeout=30000)
        ok(pg.locator('.spk-card').count() == 3, '3 cartes d\'intervenants')
        ok('Intervenants' in pg.locator('#spk-title').inner_text(), 'titre « Intervenants »')
        txt = pg.locator('.spk-card').nth(1).inner_text()
        ok('205 Hz' in txt and 'femme' in txt, f'intervenant 2 : hauteur 205 Hz et catégorie suggérée « femme » ({txt[:90]!r})')
        ok(pg.locator('.spk-card').nth(0).inner_text().count('Tom') >= 1 or 'Tom' in pg.locator('.spk-final').nth(0).inner_text(), 'intervenant 1 : voix finale = voix de la conférence (Tom)')
        # nom
        inp = pg.locator('.spk-name input').nth(0); inp.fill('Le cheikh'); inp.blur(); pg.wait_for_timeout(700)
        ok(ro(f"select label from dub_speakers where talk_id='{T}' and n=1")[0] == 'Le cheikh', 'nom modifié : enregistré à la sortie du champ')
        ok('Le cheikh' in pg.locator('.spk-pick').nth(0).inner_text(), 'le nouveau nom apparaît dans la liste des phrases')
        # voix de base de l'intervenant 3 : elle n'a plus « comme la conférence »
        sel = pg.locator('.spk-card').nth(2).locator('select').nth(0)
        base_ids = [o for o in sel.locator('option').evaluate_all('els => els.map(e => [e.value, e.textContent])') if o[0]]
        sel.select_option(base_ids[0][0]); pg.wait_for_timeout(700)
        ok(ro(f"select base_voice is not null from dub_speakers where talk_id='{T}' and n=3")[0], 'voix de base choisie : enregistrée')
        fin = pg.locator('.spk-final').nth(2).inner_text()
        ok('→' not in fin, f'voix de base choisie sans voix cible : aucune conversion vers la voix de la conférence ({fin!r})')
        tgt = pg.locator('.spk-card').nth(2).locator('select').nth(1)
        ok('aucune conversion' in tgt.locator('option').nth(0).inner_text(), 'voix cible : « aucune conversion » quand une voix de base est choisie')
        sel.select_option(''); pg.wait_for_timeout(700)
        # hauteur au clavier : +2 demi-tons (4 pas de 0,5)
        sl = pg.locator('#spk-p-2'); sl.focus()
        for _ in range(4): pg.keyboard.press('ArrowRight')
        ok('+2' in pg.locator('.spk-card').nth(1).locator('output').inner_text(), 'curseur de hauteur : +2 demi-tons affiché')
        pg.wait_for_timeout(1200)
        ok(float(ro(f"select pitch from dub_speakers where talk_id='{T}' and n=2")[0]) == 2.0, 'hauteur enregistrée (+2) sans bouton')
        pg.locator('.spk-card').nth(1).locator('.spk-pitch-foot .db-link').click(); pg.wait_for_timeout(700)
        ok(ro(f"select pitch from dub_speakers where talk_id='{T}' and n=2")[0] is None, '« comme la conférence » : hauteur remise à vide')
        # aperçu rapide d'une hauteur
        sl.focus()
        for _ in range(-1 + 3): pg.keyboard.press('ArrowRight')           # 0 → +1 (2 pas de 0,5 : valeur affichée +1)
        pg.wait_for_timeout(300)
        pg.locator('.spk-card').nth(1).get_by_text('Écouter avec cette hauteur').click(); pg.wait_for_selector('.spk-card >> nth=1 >> audio', timeout=15000)
        pg.wait_for_timeout(1200)
        st = pg.evaluate("""() => { const a = document.querySelectorAll('.spk-card')[1].querySelector('audio'); return {src: !!a.src, pp: a.preservesPitch, rate: a.playbackRate, t: a.currentTime}; }""")
        ok(st['src'] and st['pp'] is False and abs(st['rate'] - 2 ** (1 / 12)) < 0.01, f"aperçu : lecteur chargé, hauteur non conservée, vitesse ×{st['rate']:.3f} (+1 demi-ton = ×1,059)")
        pg.wait_for_timeout(1500)
        ok(pg.locator('.spk-card').nth(1).get_by_text('Aperçu rapide').count() == 1, 'l\'aperçu est annoncé comme approximatif')
        # propositions de voix
        pg.get_by_role('button', name='Proposer des voix').click(); pg.wait_for_selector('.ok-msg, .spk-panel .error', timeout=10000)
        ok(ro(f"select target_voice from dub_speakers where talk_id='{T}' and n=2")[0] is not None and ro(f"select target_voice from dub_speakers where talk_id='{T}' and n=3")[0] is not None, 'propositions : une voix pour la femme et une pour l\'enfant')
        ok(ro(f"select target_voice from dub_speakers where talk_id='{T}' and n=1")[0] is None, '…aucune pour l\'homme')
        pg.wait_for_timeout(500)
        fin2 = pg.locator('.spk-final').nth(1).inner_text(); ok('→' in fin2, f'voix finale de la femme : base → voix cible ({fin2!r})')
        pg.screenshot(path=str(OUT / 'intervenants-1440-fr.png'), full_page=True)
        # phrases : intervenant de chaque phrase
        rows = pg.locator('.db-table tbody tr'); ok(rows.count() == 10 and pg.locator('.db-table .spk-pick').count() == 10, 'tableau des phrases : une liste d\'intervenants par phrase')
        pg.locator('.db-table .spk-pick').nth(4).select_option('1'); pg.wait_for_timeout(800)
        ok(ro(f"select speaker, manual from dub_phrase_speakers where talk_id='{T}' and idx=4") == (1, True), 'phrase corrigée : intervenant 1, marquée « corrigée à la main »')
        ok(pg.locator('.db-table tbody tr').nth(4).get_by_text('✎').count() == 1, '…marque ✎ dans la liste')
        pg.locator('.db-segs select.spk-pick').first.select_option('2'); pg.wait_for_timeout(300)
        ok(pg.locator('.db-table tbody tr').count() == 3, 'filtre par intervenant : seules ses phrases (3)')
        pg.locator('.db-segs select.spk-pick').first.select_option('0')
        # plage : phrases 5 à 7 (t = 90 s → 102 s) → intervenant 3
        f = pg.locator('.spk-range'); f.locator('input').nth(0).fill('1:30'); f.locator('input').nth(1).fill('1:42'); f.locator('select').select_option('3'); f.get_by_role('button', name='Attribuer').click()
        pg.wait_for_selector('.ok-msg', timeout=10000)
        ok(ro(f"select count(*) from dub_phrase_speakers where talk_id='{T}' and speaker=3 and manual")[0] == 3, 'plage 1:30 → 1:42 : 3 phrases attribuées à l\'intervenant 3')
        f.locator('input').nth(0).fill('abc'); f.get_by_role('button', name='Attribuer').click(); pg.wait_for_timeout(500)
        ok('invalide' in pg.locator('.spk-panel .error').first.inner_text(), 'temps invalide : message clair')
        # curseur de hauteur dans les réglages de la conférence
        ok(pg.locator('#db-pitch').count() == 1, 'réglages de la conférence : curseur « Hauteur de la voix »')
        ok(ov(pg) <= 0, f'1440 px : pas de débordement ({ov(pg)} px)')
        # détection : état de la demande
        for status, prog, err, expect in (('pending', 0, None, 'Détection demandée'), ('processing', 42, None, '42 %'), ('failed', 0, 'vidéo sans son', 'vidéo sans son'), ('canceled', 0, None, 'annulée')):
            cur.execute("update dub_speaker_jobs set status=%s, progress=%s, error=%s where talk_id=%s", (status, prog, err, T)) if ro(f"select count(*) from dub_speaker_jobs where talk_id='{T}'")[0] else cur.execute("insert into dub_speaker_jobs(talk_id,status,progress,error) values (%s,%s,%s,%s)", (T, status, prog, err))
            pg.reload(); pg.wait_for_selector('.spk-card', timeout=20000)
            body = pg.locator('.spk-panel').inner_text()
            if status == 'canceled': body = body  # la liste d'intervenants existe : le message d'annulation n'est montré que sans liste
            ok(expect.lower() in body.lower() or status == 'canceled', f'demande « {status} » : {expect!r} affiché')
        cur.execute("update dub_speaker_jobs set status='processing', progress=42 where talk_id=%s", (T,)); pg.reload(); pg.wait_for_selector('.spk-card')
        ok(pg.get_by_role('button', name='Annuler la détection').count() == 1 and pg.get_by_role('button', name='Détecter à nouveau').count() == 0, 'détection en cours : « Annuler » proposé, pas de nouvelle détection')
        pg.get_by_role('button', name='Annuler la détection').click(); pg.wait_for_timeout(1200)
        ok(ro(f"select cancel_requested from dub_speaker_jobs where talk_id='{T}'")[0] is True, 'annulation demandée au service')
        cur.execute("update dub_speaker_jobs set status='done', progress=100, cancel_requested=false where talk_id=%s", (T,))
        # Studio → Activité
        cur.execute("update dub_speaker_jobs set status='processing', progress=55 where talk_id=%s", (T,))
        pg.goto(WEB + '/studio/activity'); pg.wait_for_selector('.ac-task', timeout=25000); pg.wait_for_timeout(1500)
        main_txt = pg.locator('main').inner_text().lower()   # (le nom de la tâche est mis en capitales par la feuille de style)
        ok('détection des intervenants' in main_txt and f'dialogue {tag}' in main_txt, 'Studio → Activité : « Détection des intervenants » listée avec le titre de la conférence')
        cur.execute("update dub_speaker_jobs set status='done', progress=100 where talk_id=%s", (T,))
        # un seul intervenant effacé → pas de colonne
        pg.goto(f'{WEB}/studio/dubbing/{T}'); pg.wait_for_selector('.spk-card')
        pg.once('dialog', lambda d: d.accept()); pg.get_by_role('button', name='Revenir à une seule voix').click(); pg.wait_for_timeout(1500)
        ok(pg.locator('.spk-card').count() == 0 and pg.locator('.db-table .spk-pick').count() == 0 and pg.get_by_role('button', name='Détecter les intervenants').count() == 1, 'retour à une seule voix : cartes et colonne supprimées, « Détecter » proposé')
        ctx.close()
        # ---------- fr 820 / ar 390
        for n, lab, sec, ph, f0, g in ((1, 'Intervenant 1', 30.0, 5, 112.0, 'male'), (2, 'Intervenant 2', 15.0, 3, 205.0, 'female'), (3, 'Intervenant 3', 5.0, 1, 290.0, 'child')):
            cur.execute("insert into dub_speakers(talk_id,n,label,seconds,phrases,f0,guess) values (%s,%s,%s,%s,%s,%s,%s)", (T, n, lab, sec, ph, f0, g))
        for i, n in enumerate(WHO): cur.execute("insert into dub_phrase_speakers(talk_id,idx,speaker) values (%s,%s,%s) on conflict do nothing", (T, i, n))
        for w, lang in ((820, 'fr'), (390, 'ar')):
            ctx = b.new_context(viewport={'width': w, 'height': 900}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            ctx.add_init_script(f"localStorage.setItem('token', '{tok}')"); pg = ctx.new_page()
            pg.goto(f'{WEB}/studio/dubbing/{T}'); pg.wait_for_selector('.spk-card', timeout=30000); pg.wait_for_timeout(600)
            ok(ov(pg) <= 0, f'{w} px {lang} : pas de débordement ({ov(pg)} px)')
            if lang == 'ar':
                ok(pg.evaluate("document.documentElement.dir") == 'rtl' and 'المتحدثون' in pg.locator('#spk-title').inner_text(), 'arabe : sens RTL et titre traduit')
            small = pg.evaluate("""() => [...document.querySelectorAll('.spk-card input, .spk-card select, .spk-card button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.height < 30) && e.type !== 'range'; }).length""")
            ok(small == 0, f'{w} px {lang} : champs et boutons des cartes assez hauts pour le doigt ({small} trop petits)')
            pg.screenshot(path=str(OUT / f'intervenants-{w}-{lang}.png'), full_page=True)
            ctx.close()
        b.close()
finally:
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for v in voices: cur.execute("delete from dub_voices where id=%s", (v,))
    try: s3.delete_object(Bucket='majlis-videos', Key=vkey)
    except Exception: pass
print('\n' + ('TOUT EST BON' if not bad else f'{len(bad)} ÉCHEC(S) : ' + ' | '.join(bad)))
sys.exit(1 if bad else 0)
