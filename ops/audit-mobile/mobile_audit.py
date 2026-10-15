"""Étape F : audit des débordements horizontaux à 360 et 390 px sur les pages visiteur, membre, organisateur et administrateur."""
import os, sys, time, json, uuid, requests, psycopg2
from playwright.sync_api import sync_playwright
API = "http://127.0.0.1:3055"; WEB = "http://127.0.0.1:3101"
W = [int(x) for x in (sys.argv[1] if len(sys.argv) > 1 else "390").split(",")]
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; users = []
def mk(role):
    e = f"ma-{role}-{tag}@test.local"
    requests.post(API + "/auth/register", json={"email": e, "password": "Passw0rd-test", "name": f"Membre Avec Un Nom Plutôt Long {role}"})
    cur.execute("update users set role=%s where email=%s returning id", (role, e)); users.append(cur.fetchone()[0])
    return requests.post(API + "/auth/login", json={"email": e, "password": "Passw0rd-test"}).json()["token"]
adm = requests.post(API + "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]
mem, org = mk("user"), mk("organizer")
import os; tid = os.environ.get("TID") or requests.get(API + "/talks?limit=1").json()[0]["id"]
ser = os.environ.get("SER") or requests.get(API + "/series").json()[0]["id"]; col = os.environ.get("COL") or requests.get(API + "/collections").json()[0]["id"]
VIS = ["/", "/series", f"/series/{ser}", "/collections", f"/collections/{col}", "/chaines", f"/conferences/{tid}", "/pricing", "/login", "/register", "/forgot", "/themes", "/books", "/gift", "/redeem", "/legal/cgv", "/legal/confidentialite", "/kids", "/welcome"]
MEM = ["/", "/library", "/library?tab=lists", "/library?tab=notes", "/account", "/account?tab=subscription", "/account?tab=emails", "/account?tab=gifts", "/learning", "/learning?tab=revision", "/learning?tab=path", "/learning?tab=bilan", f"/conferences/{tid}", "/chaines"]
ORG = ["/studio", "/studio/new", f"/studio/{tid}", "/studio/series", "/studio/collections", "/studio/books", "/studio/channel", "/studio/quiz", "/studio/practice", "/studio/reminders", "/studio/stats", "/studio/revenue", "/studio/moderation"]
ADM = ["/admin"] + [f"/admin?tab={t}" for t in ("users", "stats", "categories", "gifts", "revenue", "audit", "features", "settings", "legal")]
JS = """() => {
  const vw = %d, out = [];
  const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.position === 'fixed' || cs.visibility === 'hidden') continue;
    if (r.right > vw + 1 || r.left < -1) { if (!clipped(el)) out.push([el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''), Math.round(r.left), Math.round(r.right)]); }
  }
  return { sw: document.documentElement.scrollWidth, vw, bw: document.body.scrollWidth, off: out.slice(0, 6) };
}"""
bad = []; n = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for w in W:
        for role, tok, paths in (("visiteur", None, VIS), ("membre", mem, MEM), ("organisateur", org, ORG), ("admin", adm, ADM)):
            c = b.new_context(viewport={"width": w, "height": 800}, locale="fr-FR", is_mobile=True, has_touch=True, device_scale_factor=2)
            if tok: c.add_init_script(f"localStorage.setItem('token','{tok}')")
            for path in paths:
                pg = c.new_page()
                try:
                    pg.goto(WEB + path, wait_until="load", timeout=20000)
                    try: pg.wait_for_load_state("networkidle", timeout=6000)
                    except Exception: pass
                    time.sleep(1.2)
                    r = pg.evaluate(JS % w)
                except Exception as e:
                    r = {"sw": -1, "vw": w, "bw": -1, "off": [str(e)[:80]]}
                pg.close(); n += 1
                flag = r["sw"] > w + 1
                print(("WIDE " if flag else "ok   ") + f"{w} {role:12s} {path:40s} sw={r['sw']} {json.dumps(r['off'], ensure_ascii=False) if flag or r['off'] else ''}", flush=True)
                if flag: bad.append((w, role, path))
                if n % 10 == 0: time.sleep(40)
            c.close()
    b.close()
for u in users: cur.execute("delete from users where id=%s", (u,))
print("LARGES:", len(bad)); print("FIN")
