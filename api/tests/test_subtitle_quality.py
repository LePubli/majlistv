"""Studio → Sous-titres → Qualité : GET /studio/subtitles/quality (+ détail) — droits, mesures, notes, portée.
Prérequis : API (3055), PG de test (5544), admin admin@test.local."""
import sys, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


def login(e, p):
    return {"authorization": "Bearer " + requests.post(B + "/auth/login", json={"email": e, "password": p}).json()["token"]}


A = login("admin@test.local", "AdminPassw0rd-test")
tag = uuid.uuid4().hex[:6]
r = requests.post(B + "/auth/register", json={"email": f"sq-{tag}@test.local", "password": "Passw0rd-test", "name": "Membre"})
M = {"authorization": "Bearer " + r.json()["token"]}
ok(requests.get(B + "/studio/subtitles/quality").status_code == 401, "sans jeton : refusé")
ok(requests.get(B + "/studio/subtitles/quality", headers=M).status_code == 403, "membre : refusé")

cur.execute("select id from users where email='admin@test.local'"); admin = cur.fetchone()[0]
cur.execute("select id from users where email=%s", (f"sq-{tag}@test.local",)); member = cur.fetchone()[0]
cur.execute("insert into talks(title,speaker,language,organizer_id,transcript_language,transcript_status,source,video_ref) values(%s,'Qualité Test','fr',%s,'fr','ready','upload','x') returning id", (f"Qualité {tag}", admin)); tid = cur.fetchone()[0]
cur.execute("insert into talks(title,speaker,language,organizer_id,transcript_language,transcript_status,source,video_ref) values(%s,'Autre','fr',%s,'fr','ready','upload','x') returning id", (f"Etranger {tag}", member)); other = cur.fetchone()[0]
long_txt = "x" * 90
rows = [
    (0, 0, 3000, "Bonjour à tous et bienvenue."),                       # correct
    (1, 3000, 3400, "Un texte beaucoup trop long pour quatre dixièmes."),  # trop rapide
    (2, 3400, 6000, long_txt),                                          # trop long (90 > 84)
    (3, 5800, 9000, "Chevauche la phrase précédente."),                 # chevauchement
    (4, 9000, 20000, "Très long silence"),                              # trop lent (11 s)
    (5, 20000, 23000, "Une phrase normale pour finir."),                # correct
]
for i, s, e, t in rows:
    cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values(%s,'fr',%s,%s,%s,%s)", (tid, i, s, e, t))
    cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values(%s,'fr',%s,%s,%s,%s)", (other, i, s, e, "x" * 100))
# Traduction anglaise incomplète (4 phrases sur 6), dont une identique à la source (non traduite).
for i, s, e, t in rows[:4]:
    cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values(%s,'en',%s,%s,%s,%s)", (tid, i, s, e, "Bonjour à tous et bienvenue." if i == 0 else "Fine."))
cur.execute("insert into transcript_translations(talk_id,lang,status) values(%s,'en','ready')", (tid,))

d = requests.get(B + "/studio/subtitles/quality", headers=A).json()
for k in ("norms", "totals", "talks"):
    ok(k in d, f"réponse : {k}")
t = next((x for x in d["talks"] if x["id"] == tid), None)
ok(t is not None, "mon contenu est listé")
ok(all(x["id"] != other for x in d["talks"]), "le contenu d'un autre n'est pas listé")
fr = next(l for l in t["langs"] if l["lang"] == "fr"); en = next(l for l in t["langs"] if l["lang"] == "en")
ok(t["langs"][0]["lang"] == "fr" and fr["isSource"], "langue d'origine en premier")
ok(fr["segments"] == 6 and fr["flagged"] == 4, f"4 phrases sur 6 à corriger (obtenu {fr['flagged']})")
ok(fr["counts"]["fast"] >= 1 and fr["counts"]["long"] == 1 and fr["counts"]["overlap"] == 1 and fr["counts"]["slow"] == 1, "rapide, long, chevauchement, trop lent comptés")
ok(fr["score"] == 33 and fr["level"] == "fix", f"note 33 (obtenu {fr['score']})")
ok(en["segments"] == 4 and en["expected"] == 6 and en["counts"]["missing"] == 2, "traduction : 2 phrases manquantes")
ok(en["counts"]["same"] == 1, "traduction identique à l'original comptée")
ok(t["score"] == min(fr["score"], en["score"]) and t["level"] == "fix", "note du contenu = la plus basse des langues")
ok(d["totals"]["fix"] >= 1 and d["totals"]["analysed"] == len(d["talks"]), "totaux")

dt = requests.get(B + f"/studio/subtitles/quality/{tid}?lang=fr", headers=A).json()
ok(len(dt["items"]) == 4 and dt["items"][0]["idx"] == 2 and {"fast", "long"} <= set(dt["items"][0]["issues"]) and dt["items"][-1]["idx"] in (3, 4), "détail : la phrase aux deux défauts d'abord")
ok(requests.get(B + f"/studio/subtitles/quality/{other}?lang=fr", headers=A).status_code == 404, "détail d'un contenu d'autrui : 404")
ok(requests.get(B + f"/studio/subtitles/quality/{tid}?lang=zz9z99", headers=A).status_code == 400, "langue invalide : 400")
ok(requests.get(B + f"/studio/subtitles/quality/{tid}?lang=fr", headers=M).status_code == 403, "détail : membre refusé")

# --- Confiance de la reconnaissance vocale (migration 128) -------------------------------------------------------------------
cur.execute("insert into talks(title,speaker,language,organizer_id,transcript_language,transcript_status,source,video_ref) values(%s,'Qualité Test','fr',%s,'fr','ready','upload','x') returning id", (f"Confiance {tag}", admin)); cid = cur.fetchone()[0]
for i, c in enumerate([0.9, 0.4, None, 0.54, 0.55]):
    cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text,confidence) values(%s,'fr',%s,%s,%s,%s,%s)", (cid, i, i * 3000, i * 3000 + 2500, f"Phrase {i} correcte et lisible.", c))
d = requests.get(B + "/studio/subtitles/quality", headers=A).json()
ct = next(x for x in d["talks"] if x["id"] == cid); cf = ct["langs"][0]
ok(d["norms"]["doubtBelow"] == 0.55, "seuil de doute exposé (0,55)")
ok(cf["counts"]["doubt"] == 2 and cf["flagged"] == 2, f"2 phrases incertaines (0,40 et 0,54 ; 0,55 et l'inconnue non) : {cf['counts']['doubt']}")
ok(cf["confidence"] == 60 and cf["confidenceN"] == 4, f"confiance moyenne 60 sur 4 phrases (obtenu {cf['confidence']}, {cf['confidenceN']})")
ok(cf["score"] == 60, f"les phrases incertaines comptent dans la note (obtenu {cf['score']})")
fr_old = next(l for l in t["langs"] if l["lang"] == "fr")
ok(fr_old["confidence"] is None and fr_old["counts"]["doubt"] == 0, "contenu sans confiance enregistrée : null, aucun doute")
dc = requests.get(B + f"/studio/subtitles/quality/{cid}?lang=fr", headers=A).json()
ok([(i["idx"], i["confidence"]) for i in dc["items"]] == [(1, 40), (3, 54)] and all(i["issues"] == ["doubt"] for i in dc["items"]), f"détail : les deux phrases avec leur confiance ({[(i['idx'], i['confidence']) for i in dc['items']]})")
# Corriger le texte efface la confiance (déclencheur) ; la modifier avec le texte la conserve.
cur.execute("update transcript_segments set text = 'Phrase corrigée par un humain.' where talk_id=%s and idx=1", (cid,))
cur.execute("select confidence from transcript_segments where talk_id=%s and idx=1", (cid,)); ok(cur.fetchone()[0] is None, "texte corrigé : confiance effacée")
cur.execute("update transcript_segments set text = 'Nouveau texte.', confidence = 0.3 where talk_id=%s and idx=3", (cid,))
cur.execute("select confidence from transcript_segments where talk_id=%s and idx=3", (cid,)); ok(abs(cur.fetchone()[0] - 0.3) < 1e-6, "texte et confiance réécrits ensemble (Whisper) : confiance gardée")
cur.execute("update transcript_segments set start_ms = start_ms + 1 where talk_id=%s and idx=0", (cid,))
cur.execute("select confidence from transcript_segments where talk_id=%s and idx=0", (cid,)); ok(abs(cur.fetchone()[0] - 0.9) < 1e-6, "autre champ modifié : confiance gardée")
d = requests.get(B + "/studio/subtitles/quality", headers=A).json()
ok(next(x for x in d["talks"] if x["id"] == cid)["langs"][0]["counts"]["doubt"] == 1, "après correction : 1 seule phrase incertaine")
import psycopg2
try:
    cur.execute("update transcript_segments set confidence = 1.5 where talk_id=%s and idx=0", (cid,)); bad = False
except psycopg2.errors.CheckViolation:
    bad = True
ok(bad, "confiance hors de 0..1 refusée par la base")

cur.execute("delete from talks where id in (%s,%s,%s)", (tid, other, cid))
cur.execute("delete from users where id=%s", (member,))
d2 = requests.get(B + "/studio/subtitles/quality", headers=A).json()
ok(all(x["id"] != tid for x in d2["talks"]), "suppression : disparu")
print("test_subtitle_quality : TOUT OK")
