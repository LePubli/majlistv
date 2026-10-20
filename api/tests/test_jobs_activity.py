"""Registre n°28 et n°31 (20/10) : « Préciser la place des mots » (file align) et « Le cadre suit le visage » (file face) dans Studio → Activité :
liste, droits, pause et priorité (contrainte de la table), annulation d'une demande en attente (tout de suite) et en cours (le service s'arrête),
service de transcription : une demande annulée pendant le téléchargement ne modifie rien.
Prérequis : API (3055, module editor), PG (5544), FFmpeg, dépendances du service de transcription. Lancement depuis la racine du dépôt."""
import json, os, subprocess, sys, time, uuid, requests, psycopg2

B = "http://127.0.0.1:3055"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; users, talks, fails = [], [], []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
def login(email, pw="Passw0rd-test"):
    while True:
        r = requests.post(B + "/auth/login", json={"email": email, "password": pw}).json()
        if "token" in r: return {"authorization": "Bearer " + r["token"]}
        time.sleep(10)
def organizer(label):
    em = f"jb{label}-{tag}@test.local"; requests.post(B + "/auth/register", json={"email": em, "password": "Passw0rd-test", "name": f"Orga {label}"})
    cur.execute("update users set role='organizer' where email=%s returning id", (em,)); uid = str(cur.fetchone()[0]); users.append(uid)
    time.sleep(11)  # rôle mis en cache 10 s par l'API
    return uid, login(em)
A = login("admin@test.local", "AdminPassw0rd-test")
requests.put(B + "/admin/modules/editor", headers=A, json={"enabled": True})
oid, O = organizer("a"); oid2, O2 = organizer("b")
def talk(owner):
    cur.execute("""insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language,transcript_status)
                   values (%s,'d','X','upload',%s,%s,'draft','ready','free',3,'fr','fr','ready') returning id""", (f"Jobs {tag}", f"talks/{tag}-{uuid.uuid4().hex[:4]}", owner))
    t = str(cur.fetchone()[0]); talks.append(t); return t
def tasks(h): return {(x["queue"], x["ref"]): x for x in requests.get(B + "/studio/activity", headers=h).json()["tasks"]}
try:
    T = talk(oid); T2 = talk(oid)
    cur.execute("insert into word_align_jobs(talk_id, lang) values (%s,'fr')", (T,))
    P = str(uuid.uuid4()); cur.execute("insert into face_track_jobs(project_id, talk_id, from_s, to_s) values (%s,%s,0,3)", (P, T))
    L = tasks(O)
    ok(("align", T) in L and L[("align", T)]["status"] == "waiting" and L[("align", T)]["canCancel"], "Activité : place des mots listée, annulable")
    ok(("face", P) in L and L[("face", P)]["status"] == "waiting", "Activité : suivi du visage listé")
    ok(("align", T) not in tasks(O2), "un autre organisateur ne la voit pas")
    # Pause / priorité (administrateur) : acceptées par la base (contrainte de file)
    r = requests.post(f"{B}/studio/activity/align/{T}/pause", headers=A, json={"paused": True}); ok(r.status_code == 200 and r.json()["task"]["status"] == "paused", "pause d'une place des mots")
    requests.post(f"{B}/studio/activity/align/{T}/pause", headers=A, json={"paused": False})
    r = requests.post(f"{B}/studio/activity/face/{P}/priority", headers=A, json={"priority": 10}); ok(r.status_code == 200 and r.json()["task"]["priority"] == 10, "priorité d'un suivi du visage")
    # Annulation
    ok(requests.post(f"{B}/studio/activity/align/{T}/cancel", headers=O2).status_code == 404, "annulation refusée à un autre organisateur")
    r = requests.post(f"{B}/studio/activity/align/{T}/cancel", headers=O); ok(r.status_code == 200 and r.json()["running"] is False, "l'organisateur annule sa demande en attente")
    cur.execute("select status from word_align_jobs where talk_id=%s", (T,)); ok(cur.fetchone()[0] == "canceled", "demande en attente : annulée tout de suite")
    ok(("align", T) not in tasks(O), "elle disparaît de l'Activité")
    ok(requests.post(f"{B}/studio/activity/align/{T}/cancel", headers=O).status_code == 404, "déjà annulée : 404")
    cur.execute("update face_track_jobs set status='processing', progress=40 where project_id=%s", (P,))
    r = requests.post(f"{B}/studio/activity/face/{P}/cancel", headers=A); ok(r.status_code == 200 and r.json()["running"] is True, "administrateur : annulation d'une analyse en cours")
    cur.execute("select status, cancel_requested from face_track_jobs where project_id=%s", (P,)); ok(cur.fetchone() == ("processing", True), "en cours : arrêt demandé au service")
    ok(tasks(A)[("face", P)]["canCancel"] is False and tasks(A)[("face", P)]["canceling"] is True, "Activité : « annulation en cours », plus de bouton")
    cur.execute("select count(*) from activity_controls where queue='face' and ref=%s", (P,)); ok(cur.fetchone()[0] == 0, "réglages de la tâche nettoyés")
    ok(requests.post(f"{B}/studio/activity/video/{T}/cancel", headers=A).status_code == 404, "tâche non annulable (conversion vidéo absente) : refus")
    # Service de transcription : une demande en cours dont l'annulation est demandée s'arrête sans rien changer
    cur.execute("delete from word_align_jobs where status='pending'")
    cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) values (%s,'fr',0,0,1000,'bonjour à tous')", (T2,))
    cur.execute("insert into word_align_jobs(talk_id, lang, cancel_requested) values (%s,'fr',true)", (T2,))
    out = subprocess.run([sys.executable, os.path.join(ROOT, "transcriber", "tests", "run_align_once.py")], capture_output=True, text=True, timeout=300)
    cur.execute("select status, cancel_requested from word_align_jobs where talk_id=%s", (T2,)); st = cur.fetchone()
    cur.execute("select count(*) from transcript_words where talk_id=%s", (T2,)); nw = cur.fetchone()[0]
    ok(st == ("canceled", False) and nw == 0, f"service : demande annulée, aucun mot modifié ({st}, {nw} mots) {out.stdout.strip()[-80:]}")
finally:
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    cur.execute("delete from face_track_jobs where project_id=%s", (P,)) if 'P' in dir() else None
    for u in users: cur.execute("delete from users where id=%s", (u,))
print("TOUT OK" if not fails else f"ÉCHECS : {len(fails)}"); sys.exit(1 if fails else 0)
