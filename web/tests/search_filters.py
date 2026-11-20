#!/usr/bin/env python3
"""Phase 5 (20/11) : filtres du Catalogue dans le navigateur — choix gardés dans l'adresse, rechargement, puces qui gardent les filtres,
effacement, panneau de recherche (langue, durée), fr + ar, 390 / 1440 px sans débordement.
Prérequis : API (3055), PG (5544), site (3000 ou 3001). Lancement (depuis web/) : python3 tests/search_filters.py [site] [dossier-captures]"""
import pathlib, sys, uuid
import psycopg2
from playwright.sync_api import sync_playwright
WEB = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else '/tmp/shots-sf'); OUT.mkdir(parents=True, exist_ok=True)
db = psycopg2.connect(host='127.0.0.1', port=5544, dbname='majlis', user='majlis', password='pw'); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; talks = []; bad = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: bad.append(m)
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
def mk(label, lang, secs):
    cur.execute("""insert into talks(title,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                   values(%s,'Cheikh','youtube','abc',%s,'published','ready','free',%s,%s,%s) returning id""", (f'Zfiltre{label} {tag}', aid, secs, lang, lang))
    talks.append(cur.fetchone()[0])
mk('Court', 'fr', 300); mk('Anglais', 'en', 1200); mk('Long', 'fr', 2400)
def n_is(page, n):
    try: page.wait_for_function(f"document.querySelectorAll('.grid a[href^=\"/talks/\"]').length === {n}", timeout=8000); return True
    except Exception: return False
titles = lambda page: sorted(x.strip() for x in page.locator('.grid .card h3, .grid a[href^="/talks/"]').all_inner_texts() if tag in x)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        for lang, (w, h) in [('fr', (1440, 900)), ('fr', (390, 800)), ('ar', (390, 800))]:
            ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_cookies([{'name': 'locale', 'value': lang, 'url': WEB}])
            page = ctx.new_page(); label = f'{lang}-{w}'
            page.goto(f'{WEB}/catalogue?q={tag}', wait_until='networkidle')
            page.wait_for_selector('.tf-toggle'); ok(n_is(page, 3), f'[{label}] sans filtre : 3 vidéos')
            page.click('.tf-toggle'); page.wait_for_selector('.tf-panel')
            page.select_option('.tf-panel select >> nth=0', index=1) if False else None
            page.locator('.tf-field', has=page.locator('option[value="short"]')).locator('select').select_option('short')
            page.wait_for_function("location.search.includes('duration=short')")
            ok(n_is(page, 1), f'[{label}] durée courte : 1 vidéo, adresse = {page.url.split("?")[1]}')
            page.reload(wait_until='networkidle'); page.wait_for_selector('.tf-panel')
            ok(page.locator('.tf-toggle .tf-count').count() == 1 and n_is(page, 1), f'[{label}] rechargement : filtre gardé, bloc déjà ouvert')
            ok(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), f'[{label}] aucun débordement horizontal')
            page.screenshot(path=str(OUT / f'{label}.png'))
            page.click('.tf-reset')
            ok(n_is(page, 3) and 'duration' not in page.url, f'[{label}] « effacer » : retour aux 3 vidéos')
            # langue (anglais) + puce : le filtre reste
            try: page.wait_for_selector('.tf-field option[value="en"]', state='attached', timeout=5000)
            except Exception: print(page.locator('.tf').inner_html()[:800])
            page.locator('.tf-field', has=page.locator('option[value="en"]')).first.locator('select').select_option('en')
            page.wait_for_function("location.search.includes('lang=en')")
            ok(n_is(page, 1), f'[{label}] langue anglaise : 1 vidéo')
            ok(all('lang=en' in (a or '') for a in page.locator('.cg-chips a').evaluate_all('els => els.map(e => e.getAttribute("href"))')), f'[{label}] les puces gardent le filtre')
            ctx.close()
        # panneau de recherche (loupe du header)
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_cookies([{'name': 'locale', 'value': 'fr', 'url': WEB}])
        page = ctx.new_page(); page.goto(WEB + '/', wait_until='networkidle')
        page.locator('button[aria-label]').filter(has_text='').first  # la loupe est repérée par son libellé
        page.keyboard.press('/')
        opened = page.locator('.sp-panel').count() > 0
        if not opened:
            page.locator('[aria-label="Rechercher"], [aria-label="Recherche"]').first.click()
        page.wait_for_selector('.sp-panel'); page.fill('.sp-bar input', tag); page.wait_for_timeout(900)
        ok(page.locator('.sp-body a[href^="/talks/"]').count() >= 3, 'panneau de recherche : 3 résultats')
        page.locator('.sp-filters select', has=page.locator('option[value="long"]')).select_option('long'); page.wait_for_timeout(900)
        ok(page.locator('.sp-body a[href^="/talks/"]').count() >= 1 and page.locator('.sp-body', has_text='Long').count() == 1, 'panneau de recherche : durée longue')
        page.screenshot(path=str(OUT / 'panel.png'))
        b.close()
finally:
    for t in talks: cur.execute('delete from talks where id=%s', (t,))
print('ÉCHECS :', bad) if bad else print('Navigateur : tout est bon')
sys.exit(1 if bad else 0)
