#!/usr/bin/env python3
"""Étape 22a — site installable (PWA) : manifeste, icônes, service worker, page hors connexion, rien de privé en cache,
page « Télécharger l'application » (fr 1440 px, ar 390 px), lien du pied de page, installabilité (Chromium), fonction coupée.
Prérequis : API (3055), PG (5544), site en production (3001, API_URL=http://127.0.0.1:3055). Lancement (depuis web/) : python3 tests/pwa_22a.py [captures]"""
import json, os, pathlib, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright
WEB, API = os.environ.get('WEB_URL', 'http://localhost:3001'), 'http://127.0.0.1:3055'
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots-pwa'); OUT.mkdir(parents=True, exist_ok=True)
bad = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
def call(path, method='GET', body=None, token=None, base=API):
    req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': 'Bearer ' + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r: return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e: return e.code, e.headers, e.read()
while True:
    st, _, b = call('/auth/login', 'POST', {'email': 'admin@test.local', 'password': 'AdminPassw0rd-test'})
    if st == 200: adm = json.loads(b)['token']; break
    time.sleep(10)
call('/admin/settings', 'PUT', {'values': {'feat_app_install': 'true'}}, adm)
time.sleep(11)  # réglages relus par l'API toutes les 10 s

# 1) manifeste et icônes
st, h, b = call('/manifest.webmanifest', base=WEB); m = json.loads(b)
ok(st == 200 and 'manifest' in h.get('content-type', ''), f"manifeste servi ({h.get('content-type')})")
ok(m['display'] == 'standalone' and m['start_url'].startswith('/') and m['scope'] == '/' and m['name'], 'plein écran, adresse de départ, nom')
ok(m['theme_color'].startswith('#') and m['background_color'] == m['theme_color'], f"couleurs du thème ({m['theme_color']})")
from PIL import Image
import io
for ic in m['icons']:
    st, h, b = call(ic['src'], base=WEB); w = Image.open(io.BytesIO(b)).size
    ok(st == 200 and f'{w[0]}x{w[1]}' == ic['sizes'], f"icône {ic['src']} {ic['sizes']} ({ic.get('purpose')})")
ok(any(i.get('purpose') == 'maskable' for i in m['icons']), 'icône « maskable » (Android)')
st, h, b = call('/sw.js', base=WEB)
ok(st == 200 and 'no-cache' in (h.get('cache-control') or ''), f"service worker servi sans cache ({h.get('cache-control')})")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
    # 2) enregistrement, cache, hors connexion
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_cookies([{'name': 'locale', 'value': 'fr', 'url': WEB}])
    pg = ctx.new_page(); pg.goto(WEB + '/'); pg.wait_for_load_state('networkidle')
    html = pg.content()
    ok('rel="manifest"' in html and 'mobile-web-app-capable' in html, 'balises manifeste + iPhone dans la page')
    scope = pg.evaluate("Promise.race([navigator.serviceWorker.ready.then(r => r.scope), new Promise(r => setTimeout(() => r('aucun'), 15000))])"); ok(scope == WEB + '/', f'service worker actif ({scope})')
    pg.reload(); pg.wait_for_load_state('networkidle')
    ok(pg.evaluate('!!navigator.serviceWorker.controller'), 'la page est servie par le service worker')
    cdp = ctx.new_cdp_session(pg)
    errs = cdp.send('Page.getInstallabilityErrors').get('installabilityErrors', [])
    ids = [e.get('errorId') for e in errs]
    ok(set(ids) <= {'in-incognito'}, f'Chromium : site installable (seule réserve possible : navigation privée du test) {ids}')
    pg.goto(WEB + '/catalogue'); pg.wait_for_load_state('networkidle')
    cached = pg.evaluate("""(async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k);
        for (const r of await c.keys()) out.push(k + ' ' + new URL(r.url).pathname); } return out; })()""")
    ok(any('/_next/static/' in c for c in cached), f'fichiers du site gardés ({len(cached)} éléments)')
    ok(not any('/api/' in c for c in cached), 'aucune réponse de l\'API gardée')
    ok(not any(c.split(' ', 1)[1] in ('/', '/catalogue', '/account', '/library') for c in cached), 'aucune page gardée (données personnelles)')
    ctx.close()

    # 2 bis) hors connexion : un second serveur du site (port 3002) est arrêté après l'installation du service worker
    # (dans Chromium, le mode « hors ligne » de Playwright n'agit pas sur le service worker : on coupe donc vraiment le serveur).
    def offline_case(lang, vp, ua=None):
        env = dict(os.environ, PORT='3002', HOSTNAME='127.0.0.1', API_URL=API)
        srv = subprocess.Popen(['node', '.next/standalone/server.js'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        W2 = 'http://localhost:3002'
        try:
            for _ in range(60):
                try:
                    urllib.request.urlopen(W2 + '/sw.js', timeout=2); break
                except Exception: time.sleep(0.5)
            c = br.new_context(viewport=vp, **({'user_agent': ua, 'is_mobile': True, 'has_touch': True} if ua else {}))
            c.add_cookies([{'name': 'locale', 'value': lang, 'url': W2}]); q = c.new_page()
            q.goto(W2 + '/catalogue'); q.wait_for_load_state('networkidle'); q.evaluate("Promise.race([navigator.serviceWorker.ready.then(() => 1), new Promise(r => setTimeout(() => r(0), 15000))])")
            q.reload(); q.wait_for_load_state('networkidle'); q.wait_for_timeout(800)
        finally:
            srv.kill(); srv.wait()
        q.goto(W2 + '/catalogue'); q.wait_for_timeout(500)
        return c, q
    c, q = offline_case('fr', {'width': 1440, 'height': 900})
    ok('hors connexion' in q.locator('body').inner_text(), 'serveur injoignable : page « Vous êtes hors connexion »')
    ok(q.locator('a', has_text='Réessayer').get_attribute('href') == '/catalogue', 'bouton « Réessayer » vers la même page')
    q.screenshot(path=str(OUT / 'offline-fr.png')); c.close()
    ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    c, q = offline_case('ar', {'width': 390, 'height': 844}, ios)
    ok(q.locator('html').get_attribute('dir') == 'rtl' and 'غير متصل' in q.locator('body').inner_text(), 'hors connexion en arabe (RTL, 390 px)')
    ok(q.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth') <= 1, 'page hors connexion : pas de débordement à 390 px')
    q.screenshot(path=str(OUT / 'offline-ar-390.png')); c.close()
    # 3) page d'installation + lien du pied de page
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_cookies([{'name': 'locale', 'value': 'fr', 'url': WEB}]); pg = ctx.new_page()
    pg.goto(WEB + '/application'); pg.wait_for_selector('.pwa-page')
    ok(pg.locator('h1').inner_text().startswith('Installer'), 'page « Installer l\'application »')
    ok(pg.locator('.pwa-card h2').first.inner_text() in ('Installer en un clic', 'Sur ordinateur'), 'bouton ou explications ordinateur')
    ok(pg.locator('footer a[href="/application"]').count() == 1, 'lien « Télécharger l\'application » dans le pied de page')
    ok(pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth') <= 1, 'fr 1440 : pas de débordement')
    pg.screenshot(path=str(OUT / 'application-fr-1440.png'), full_page=True)
    ctx.close()
    # 4) iPhone en arabe (explications Safari), 390 px, hors connexion en arabe
    ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, user_agent=ios, is_mobile=True, has_touch=True)
    ctx.add_cookies([{'name': 'locale', 'value': 'ar', 'url': WEB}]); pg = ctx.new_page()
    pg.goto(WEB + '/application'); pg.wait_for_selector('.pwa-steps')
    ok(pg.locator('html').get_attribute('dir') == 'rtl' and pg.locator('.pwa-steps li').count() == 3, 'iPhone (ar) : 3 étapes Safari, sens RTL')
    ok(pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth') <= 1, 'ar 390 : pas de débordement')
    pg.screenshot(path=str(OUT / 'application-ar-390.png'), full_page=True)
    ctx.close()
    # 5) Android sans invite : explications Chrome
    andro = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/130.0 Mobile Safari/537.36'
    ctx = br.new_context(viewport={'width': 412, 'height': 900}, user_agent=andro); ctx.add_cookies([{'name': 'locale', 'value': 'fr', 'url': WEB}])
    pg = ctx.new_page(); pg.goto(WEB + '/application'); pg.wait_for_selector('.pwa-card h2')
    ok(pg.locator('.pwa-card h2').first.inner_text() in ('Sur Android', 'Installer en un clic'), 'Android : explications ou bouton')
    ctx.close()
    # 6) fonction coupée : service worker déjà installé retiré, page fermée, lien retiré
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page()
    pg.goto(WEB + '/'); pg.wait_for_load_state('networkidle'); pg.evaluate("Promise.race([navigator.serviceWorker.ready.then(() => 1), new Promise(r => setTimeout(() => r(0), 15000))])")
    ok(pg.evaluate("navigator.serviceWorker.getRegistrations().then(r => r.length)") == 1, 'avant : service worker installé')
    call('/admin/settings', 'PUT', {'values': {'feat_app_install': 'false'}}, adm); time.sleep(11)
    pg.goto(WEB + '/'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(1500)
    n = pg.evaluate("navigator.serviceWorker.getRegistrations().then(r => r.length)")
    ok(n == 0, f'fonction coupée : service worker retiré ({n})')
    pg.goto(WEB + '/catalogue'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(1500)  # page suivante : plus servie par le service worker
    ok(pg.evaluate("caches.keys().then(k => k.filter(x => x.startsWith('mejliss-')).length)") == 0, 'fonction coupée : fichiers gardés effacés')
    pg.goto(WEB + '/application'); pg.wait_for_timeout(1500)
    ok(pg.locator('.pwa-page').count() == 0, 'fonction coupée : page « Télécharger l\'application » fermée')
    ok(pg.locator('footer a[href="/application"]').count() == 0, 'fonction coupée : lien retiré du pied de page')
    ctx.close(); br.close()
call('/admin/settings', 'PUT', {'values': {'feat_app_install': 'true'}}, adm)
print('TOUT EST OK' if not bad else f'{len(bad)} ECHEC(S)'); sys.exit(1 if bad else 0)
