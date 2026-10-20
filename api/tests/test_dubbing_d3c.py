"""Étape D3c — plusieurs intervenants : demande de détection, réglages d'un intervenant (nom, voix, hauteur), correction des phrases,
propositions de voix, voix figées dans la demande de doublage, Studio → Activité, hauteur de voix par défaut et par conférence.
(La détection elle-même est testée avec le vrai modèle dans transcriber/tests/test_speakers_job.py ; ici on simule son résultat en base.)
Prérequis : API (3055) avec le module « dubbing » 0.10.0, PG (5544), S3 de test (5599)."""
import sys, time, uuid
import psycopg2, requests

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; talks, voices = [], []
def cleanup():
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for v in voices: cur.execute("delete from dub_voices where id=%s", (v,))
    cur.execute("update dub_defaults set params = params - 'pitch' where id = 1")
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: cleanup(); sys.exit(1)
def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, **kw)
    if r.status_code == 429: time.sleep(62); r = requests.request(method, B + path, headers=headers, **kw)
    return r
A = {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": "admin@test.local", "password": "AdminPassw0rd-test"}).json()["token"]}
em = f"d3c-{tag}@test.local"; rq("POST", "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": "Orga"})
cur.execute("update users set role='organizer' where email=%s", (em,))
O = {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": em, "password": "Passw0rd-test"}).json()["token"]}
rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": True, "settings": {"mod_dubbing_require_review": "false"}})
cur.execute("select id from users where email='admin@test.local'"); aid = cur.fetchone()[0]
def talk(source):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language)
                   values (%s,'d','Cheikh',%s,%s,%s,'published','ready','free',60,'ar','ar') returning id""", (f"D3c {tag} {source}", source, f"v{tag}", aid))
    t = str(cur.fetchone()[0]); talks.append(t); return t
def lines(t, n=12):
    for i in range(n):
        cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (t, i, i * 5000, i * 5000 + 4000, "# verset" if i == 7 else f"Phrase numéro {i}."))
T = talk("upload"); lines(T); Y = talk("youtube"); lines(Y, 3); E = talk("upload")  # E : sans texte français
P = f"/studio/dubbing/talks/{T}"

# --- hauteur de voix : réglage par défaut et par conférence
st = rq("GET", "/studio/dubbing/state", headers=A).json()
ok(st["params"]["pitch"] == {"min": -4, "max": 4, "step": 0.5, "def": 0} and st["defaults"]["pitch"] == 0, "réglage de hauteur : ±4 demi-tons, pas de 0,5, valeur de départ 0")
ok(rq("PUT", P, headers=A, json={"params": {"pitch": 5}}).status_code == 400, "hauteur de +5 demi-tons refusée")
ok(rq("PUT", P, headers=A, json={"params": {"pitch": -4.5}}).status_code == 400, "hauteur de -4,5 demi-tons refusée")
r = rq("PUT", P, headers=A, json={"params": {"pitch": -1.5}}); ok(r.status_code == 200 and r.json()["effective"]["pitch"] == -1.5, "hauteur propre à la conférence : -1,5 demi-ton")
ok(rq("PUT", "/studio/dubbing/defaults", headers=A, json={"params": {"pitch": 1}}).json()["defaults"]["pitch"] == 1, "hauteur par défaut (tout le site)")
rq("PUT", "/studio/dubbing/defaults", headers=A, json={"params": {}})
rq("PUT", P, headers=A, json={"params": None})

# --- demande de détection : refus
d = rq("GET", P, headers=A).json()
ok(d["speakers"] == {"list": [], "job": None, "canDetect": True}, "fiche : aucun intervenant au départ")
ok(rq("POST", P + "/speakers/detect", headers=O, json={}).status_code == 403, "organisateur : détection refusée (administrateur seulement)")
ok(rq("POST", f"/studio/dubbing/talks/{Y}/speakers/detect", headers=A, json={}).json().get("code") == "external", "vidéo YouTube : refusée (pas d'audio chez nous)")
ok(rq("POST", f"/studio/dubbing/talks/{E}/speakers/detect", headers=A, json={}).json().get("code") == "no_french", "sans texte français : refusée")
ok(rq("POST", P + "/speakers/detect", headers=A, json={"maxSpeakers": 1}).status_code == 400, "moins de 2 intervenants maximum refusé")
ok(rq("POST", P + "/speakers/detect", headers=A, json={"maxSpeakers": 11}).status_code == 400, "plus de 10 intervenants maximum refusé")
ok(rq("POST", P + "/speakers/detect", headers=A, json={"couleur": 1}).status_code == 400, "champ inconnu refusé")
ok(rq("POST", f"/studio/dubbing/talks/{uuid.uuid4()}/speakers/detect", headers=A, json={}).status_code == 404, "conférence inconnue : 404")
# --- demande de détection : acceptée, visible dans Activité, annulable
r = rq("POST", P + "/speakers/detect", headers=A, json={"maxSpeakers": 4}); ok(r.status_code == 201 and r.json()["job"]["status"] == "pending" and r.json()["job"]["maxSpeakers"] == 4, "détection demandée (4 intervenants au plus)")
acts = rq("GET", "/studio/activity", headers=A).json()
tk = next((x for x in acts["tasks"] if x["queue"] == "speakers" and x["ref"] == T), None)
ok(tk and tk["status"] == "waiting" and tk["canCancel"] and tk["link"] == f"/studio/dubbing/{T}", "Studio → Activité : la demande apparaît (en attente, annulable)")
ok(rq("POST", f"/studio/activity/speakers/{T}/pause", headers=A, json={"paused": True}).status_code == 200, "mise en pause depuis Activité acceptée")
ok(rq("POST", f"/studio/activity/speakers/{T}/pause", headers=A, json={"paused": False}).status_code == 200, "reprise acceptée")
r = rq("POST", f"/studio/activity/speakers/{T}/cancel", headers=A); ok(r.status_code == 200 and r.json()["canceled"], "annulation depuis Activité (en attente → annulée tout de suite)")
ok(rq("GET", P, headers=A).json()["speakers"]["job"]["status"] == "canceled", "la fiche montre « annulée »")
ok(rq("POST", P + "/speakers/cancel", headers=A).json().get("code") == "not_cancelable", "annuler une demande déjà annulée : refusé")
rq("POST", P + "/speakers/detect", headers=A, json={})
cur.execute("update dub_speaker_jobs set status='processing', progress=40 where talk_id=%s", (T,))
ok(rq("POST", P + "/speakers/detect", headers=A, json={}).json().get("code") == "already_running", "détection déjà en cours : une seule à la fois")
ok(rq("POST", P + "/speakers/cancel", headers=A).status_code == 200, "annulation d'une détection en cours : demandée")
cur.execute("select cancel_requested from dub_speaker_jobs where talk_id=%s", (T,)); ok(cur.fetchone()[0] is True, "…le service la lira (cancel_requested)")
ok(rq("DELETE", P + "/speakers", headers=A).json().get("code") == "running", "effacer pendant une détection en cours : refusé")
cur.execute("update dub_speaker_jobs set status='done', progress=100, found=3, cancel_requested=false where talk_id=%s", (T,))

# --- résultat simulé : 3 intervenants (1 = homme 110 Hz, 2 = femme 210 Hz, 3 = enfant 300 Hz) ; phrases 0-3 → 1, 4-6 → 2, 7-8 → 3 (7 gardée), 9-11 → 1
for n, lab, sec, ph, f0, g in ((1, "Intervenant 1", 28.0, 7, 110.0, "male"), (2, "Intervenant 2", 12.0, 3, 210.0, "female"), (3, "Intervenant 3", 8.0, 2, 300.0, "child")):
    cur.execute("insert into dub_speakers(talk_id,n,label,seconds,phrases,f0,guess) values (%s,%s,%s,%s,%s,%s,%s)", (T, n, lab, sec, ph, f0, g))
for i in range(12):
    cur.execute("insert into dub_phrase_speakers(talk_id,idx,speaker) values (%s,%s,%s)", (T, i, 1 if i in (0, 1, 2, 3, 9, 10, 11) else 2 if i in (4, 5, 6) else 3))
d = rq("GET", P, headers=A).json()
ok([s["n"] for s in d["speakers"]["list"]] == [1, 2, 3] and d["speakers"]["list"][1]["guess"] == "female" and d["speakers"]["list"][1]["f0"] == 210, "fiche : trois intervenants, hauteur et catégorie suggérée")
ok({s["idx"]: s["speaker"] for s in d["segments"]} == {i: (1 if i in (0, 1, 2, 3, 9, 10, 11) else 2 if i in (4, 5, 6) else 3) for i in range(12)}, "fiche : intervenant de chaque phrase")

# --- voix : une cible féminine, une cible enfant, une cible masculine (échantillons fictifs mais présents)
def target(name, gender):
    up = rq("POST", "/studio/dubbing/voices/upload-url", headers=A, json={"contentType": "audio/wav", "size": 2048}).json()
    requests.put(up["url"], data=b"RIFF" + b"\0" * 2044, headers={"content-type": "audio/wav"})
    r = rq("POST", "/studio/dubbing/voices", headers=A, json={"kind": "target", "name": f"{name} {tag}", "sampleKey": up["key"], "synthetic": True, "gender": gender, "notes": tag})
    voices.append(r.json()["id"]); return r.json()["id"]
VF1, VF2, VC1 = target("Femme A", "female"), target("Femme B", "female"), target("Enfant A", "child")
base_voices = [v for v in rq("GET", "/studio/dubbing/state", headers=A).json()["voices"] if v["kind"] == "base"]
VB = base_voices[0]["id"]

# --- réglages d'un intervenant
ok(rq("PUT", P + "/speakers/2", headers=O, json={"label": "x"}).status_code == 403, "organisateur : réglage refusé")
ok(rq("PUT", P + "/speakers/9", headers=A, json={"label": "x"}).status_code == 404, "intervenant inconnu : 404")
ok(rq("PUT", P + "/speakers/2", headers=A, json={"pitch": 4.5}).status_code == 400, "hauteur d'un intervenant : +4,5 refusée")
ok(rq("PUT", P + "/speakers/2", headers=A, json={"pitch": 1.25}).status_code == 400, "hauteur d'un intervenant : pas de 0,5 exigé")
ok(rq("PUT", P + "/speakers/2", headers=A, json={"targetVoice": str(uuid.uuid4())}).status_code == 400, "voix cible inconnue refusée")
ok(rq("PUT", P + "/speakers/2", headers=A, json={"baseVoice": VF1}).status_code == 400, "une voix cible n'est pas une voix de base")
ok(rq("PUT", P + "/speakers/2", headers=A, json={"nom": "x"}).status_code == 400, "champ inconnu refusé")
r = rq("PUT", P + "/speakers/1", headers=A, json={"label": "Le cheikh", "pitch": -2}); l = {s["n"]: s for s in r.json()["speakers"]}
ok(r.status_code == 200 and l[1]["label"] == "Le cheikh" and l[1]["pitch"] == -2 and l[1]["targetVoice"] is None, "nom et hauteur de l'intervenant 1 enregistrés")
r = rq("PUT", P + "/speakers/1", headers=A, json={"pitch": None}); ok({s["n"]: s for s in r.json()["speakers"]}[1]["pitch"] is None and {s["n"]: s for s in r.json()["speakers"]}[1]["label"] == "Le cheikh", "hauteur remise aux réglages de la conférence (le nom reste)")
rq("PUT", P + "/speakers/1", headers=A, json={"pitch": -2})

# --- propositions de voix : seuls les intervenants sans voix choisie, catégorie suggérée ; homme = voix de la conférence
rq("PUT", P + "/speakers/3", headers=A, json={"label": "Un enfant"})
r = rq("POST", P + "/speakers/suggest", headers=A).json()
l = {s["n"]: s for s in r["speakers"]}
ok(l[1]["targetVoice"] is None and l[2]["targetVoice"] in (VF1, VF2) and l[3]["targetVoice"] == VC1, f"propositions : homme inchangé, femme → voix féminine, enfant → voix d'enfant ({r['done']})")
rq("PUT", P + "/speakers/2", headers=A, json={"targetVoice": VF2}); rq("PUT", P + "/speakers/3", headers=A, json={"targetVoice": None})
cur.execute("update dub_voices set active=false where id=%s", (VC1,))
r = rq("POST", P + "/speakers/suggest", headers=A).json()
ok(r["missing"] == [{"n": 3, "category": "child"}] and {s["n"]: s for s in r["speakers"]}[2]["targetVoice"] == VF2, "aucune voix de la catégorie : signalé, voix déjà choisies jamais touchées")
cur.execute("update dub_voices set active=true where id=%s", (VC1,))

# --- correction des phrases
r = rq("PATCH", P + "/segments/4", headers=A, json={"speaker": 1}); b = r.json()
ok(r.status_code == 200 and b["segment"]["speaker"] == 1 and b["segment"]["speakerManual"] is True, "phrase 4 attribuée à la main à l'intervenant 1")
ok({s["n"]: s for s in b["speakerList"]}[1]["phrases"] == 8 and {s["n"]: s for s in b["speakerList"]}[2]["phrases"] == 2, "totaux des intervenants recalculés")
ok(rq("PATCH", P + "/segments/4", headers=A, json={"speaker": 7}).status_code == 404, "attribution à un intervenant inconnu : refusée")
r = rq("POST", P + "/speakers/assign", headers=A, json={"from": 5, "to": 6, "speaker": 1}).json()
ok(r["changed"] == 2 and {s["n"]: s for s in r["speakers"]}[2]["phrases"] == 0, "plage de phrases 5-6 attribuée à l'intervenant 1")
ok(rq("POST", P + "/speakers/assign", headers=A, json={"from": 6, "to": 5, "speaker": 1}).status_code == 400, "plage à l'envers refusée")
ok(rq("POST", P + "/speakers/assign", headers=A, json={"from": 0, "to": 3, "speaker": 6}).status_code == 404, "plage vers un intervenant inconnu : refusée")
rq("POST", P + "/speakers/assign", headers=A, json={"from": 4, "to": 6, "speaker": 2})

# --- demande de doublage : voix figées par intervenant
rq("PUT", P, headers=A, json={"params": {"baseVoice": VB, "targetVoice": VF1, "pitch": 1}})   # la conférence : voix de base + cible A, hauteur +1
rq("PUT", P + "/speakers/1", headers=A, json={"pitch": None, "targetVoice": None})            # intervenant 1 : n'a rien choisi → voix de la conférence
rq("PUT", P + "/speakers/2", headers=A, json={"pitch": 3, "targetVoice": VF2})                # intervenant 2 : sa voix cible, hauteur +3
rq("PUT", P + "/speakers/3", headers=A, json={"targetVoice": None, "baseVoice": VB})          # intervenant 3 : sa voix de base choisie, pas de cible → AUCUNE conversion
code = rq("POST", P + "/jobs", headers=A, json={"kind": "preview"}); j = code.json()
ok(code.status_code == 201, f"écoute demandée ({code.status_code} {j.get('error', '')})")
sp = {s["n"]: s for s in j["params"]["speakers"]}
ok(sp[1]["target"] == f"Femme A {tag}" and sp[1]["pitch"] == 1, "intervenant 1 sans choix : voix cible et hauteur de la conférence")
ok(sp[2]["target"] == f"Femme B {tag}" and sp[2]["pitch"] == 3, "intervenant 2 : sa voix cible et sa hauteur (+3)")
ok(sp[3]["target"] is None and sp[3]["base"] and sp[3]["pitch"] == 1, "intervenant 3 : sa voix de base, pas de conversion vers la voix de la conférence, hauteur de la conférence")
cur.execute("select params from dub_jobs where id=%s", (j["id"],)); raw = cur.fetchone()[0]
ok(all("sampleKey" in (s["target"] or {"sampleKey": 1}) for s in raw["speakers"]) and "sampleKey" not in str(j), "clés d'échantillon gardées en base, jamais renvoyées au Studio")
cur.execute("update dub_jobs set status='cancelled' where id=%s", (j["id"],))
cur.execute("update dub_voices set active=false where id=%s", (VF2,))
r = rq("POST", P + "/jobs", headers=A, json={"kind": "preview"}); ok(r.status_code == 400 and r.json()["code"] == "speaker_voice" and "Intervenant 2" in r.json()["error"], f"voix désactivée d'un intervenant : demande refusée avec son nom ({r.json().get('error')})")
cur.execute("update dub_voices set active=true where id=%s", (VF2,))
# estimation tenant compte de la voix de chaque intervenant (conversion ou non)
e = rq("GET", P, headers=A).json()["estimate"]
ok(e["seconds"] and e["speechSeconds"] == 44, f"estimation par intervenant : {e['seconds']} s pour {e['speechSeconds']} s de parole (phrase gardée exclue)")
rq("PUT", P, headers=A, json={"params": None})

# --- effacer : retour à une seule voix
r = rq("DELETE", P + "/speakers", headers=A); ok(r.status_code == 200 and r.json()["speakers"] == [], "intervenants effacés")
cur.execute("select (select count(*) from dub_phrase_speakers where talk_id=%s), (select count(*) from dub_speaker_jobs where talk_id=%s)", (T, T)); ok(cur.fetchone() == (0, 0), "attributions et demande effacées")
cur.execute("update dub_jobs set status='cancelled' where talk_id=%s", (T,))
code = rq("POST", P + "/jobs", headers=A, json={"kind": "preview"}); ok(code.status_code == 201 and "speakers" not in code.json()["params"], "sans intervenants : demande comme avant (une seule voix)")
cur.execute("update dub_jobs set status='cancelled' where talk_id=%s", (T,))
# suppression de la conférence : tout part avec elle
rq("POST", P + "/speakers/detect", headers=A, json={}); cur.execute("insert into dub_speakers(talk_id,n) values (%s,1)", (T,)); cur.execute("insert into dub_phrase_speakers(talk_id,idx,speaker) values (%s,0,1)", (T,))
cleanup()
cur.execute("select (select count(*) from dub_speakers where talk_id=%s)+(select count(*) from dub_phrase_speakers where talk_id=%s)+(select count(*) from dub_speaker_jobs where talk_id=%s)", (T, T, T)); ok(cur.fetchone()[0] == 0, "conférence supprimée : intervenants, attributions et demande supprimés avec elle")
print("\nTOUT EST BON")
