"""Étape F : audit d'accessibilité (axe-core) des pages principales, en version téléphone ; liste les problèmes graves."""
import sys, time, json, requests, collections
from playwright.sync_api import sync_playwright
API = "http://127.0.0.1:3055"; WEB = "http://127.0.0.1:3101"
AX = open("/var/tmp/axe/node_modules/axe-core/axe.min.js").read()
adm = requests.post(API + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]
tid = "07251f99-ac67-4b85-8d85-895ff47147fe"
PAGES = [(None, p) for p in ["/", "/series", "/chaines", f"/conferences/{tid}", "/pricing", "/login", "/register", "/collections"]] + \
        [(adm, p) for p in ["/", "/library", "/account", "/learning", "/studio", "/studio/revenue", "/admin", "/admin?tab=users", "/admin?tab=features", "/admin?tab=settings"]]
agg = collections.defaultdict(list)
with sync_playwright() as p:
    b = p.chromium.launch()
    for i, (tok, path) in enumerate(PAGES):
        c = b.new_context(viewport={"width": 390, "height": 800}, locale="fr-FR", is_mobile=True, has_touch=True)
        if tok: c.add_init_script(f"localStorage.setItem('token','{tok}')")
        pg = c.new_page(); pg.goto(WEB + path, wait_until="load"); pg.wait_for_timeout(2500)
        pg.evaluate(AX)
        res = pg.evaluate("axe.run(document, {runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}).then(r => r.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0,2).map(n => n.target.join(' ') + ' :: ' + (n.html||'').slice(0,90))})))")
        for v in res: agg[(v["id"], v["impact"])].append((path, v["n"], v["ex"]))
        print(f"{'membre' if tok else 'visiteur':9s} {path:28s} {len(res)} règles", flush=True)
        c.close()
        if i % 6 == 5: time.sleep(45)
    b.close()
print()
for (rid, imp), lst in sorted(agg.items(), key=lambda kv: {"critical": 0, "serious": 1, "moderate": 2, "minor": 3}.get(kv[0][1], 4)):
    print(f"[{imp}] {rid}  pages={len(lst)}  ex: {lst[0][0]} {lst[0][2][:1]}")
print("FIN")
