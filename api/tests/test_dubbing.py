"""Étape S1 — module « Doublage français » : activation, droits, réglages par défaut et par conférence, bibliothèque de voix
(échantillon + consentement), estimation du temps de calcul, langue d'écoute.
Prérequis : API (3055) redémarrée (migration du module), PG de test (5544), stockage S3 de test (5599, voir README)."""
import sys, time, uuid, datetime, requests, psycopg2

B = "http://127.0.0.1:3055"
db = psycopg2.connect(host="127.0.0.1", port=5544, dbname="majlis", user="majlis", password="pw"); db.autocommit = True; cur = db.cursor()
tag = uuid.uuid4().hex[:6]; users, talks, voices = [], [], []


def rq(method, path, headers=None, **kw):
    r = requests.request(method, B + path, headers=headers, **kw)
    if r.status_code == 429:
        time.sleep(62); r = requests.request(method, B + path, headers=headers, **kw)
    return r


def cleanup():
    for t in talks: cur.execute("delete from talks where id=%s", (t,))
    for v in voices: cur.execute("delete from dub_voices where id=%s", (v,))
    cur.execute("update dub_voices set active=true where slug is not null")
    cur.execute("update dub_defaults set params=jsonb_build_object('baseVoice', (select id::text from dub_voices where slug='tom')) where id=1")
    for u in users: cur.execute("delete from users where id=%s", (u,))


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m, flush=True)
    if not c:
        cleanup(); sys.exit(1)


def mk(role, label):
    email = f"dub-{label}-{tag}@test.local"
    rq("POST", "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": label})
    cur.execute("update users set role=%s where email=%s returning id", (role, email)); uid = cur.fetchone()[0]; users.append(uid)
    return uid, {"authorization": "Bearer " + rq("POST", "/auth/login", json={"email": email, "password": "Passw0rd-test"}).json()["token"]}


a_id, A = mk("admin", "admin"); o_id, O = mk("organizer", "orga"); u_id, U = mk("user", "membre")

# --- activation
rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": False})
r = rq("GET", "/studio/dubbing/state", headers=A); ok(r.status_code == 404 and r.json().get("code") == "module_off", "module désactivé : routes fermées (404 module_off)")
mods = {m["id"]: m for m in rq("GET", "/admin/modules", headers=A).json()["modules"]}
ok("dubbing" in mods and mods["dubbing"]["status"] == "off" and mods["dubbing"]["version"] == "0.5.0", "Admin → Modules : « Doublage français » présent, inactif")
ok(any(f["key"] == "mod_dubbing_rtf_base" for f in mods["dubbing"]["fields"]), "réglages du module dans Admin → Modules (coefficients d'estimation)")
ok(rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": True}).status_code == 200, "activation par l'administrateur")
ok(rq("GET", "/studio/dubbing/state", headers=O).status_code == 403, "organisateur : refusé (administration seulement à l'étape S1)")
ok(rq("GET", "/studio/dubbing/state", headers=U).status_code == 403, "membre : refusé")
ok(rq("GET", "/studio/dubbing/state").status_code == 401, "visiteur : refusé")

# --- état et réglages par défaut
s = rq("GET", "/studio/dubbing/state", headers=A).json()
base = {v["slug"]: v for v in s["voices"] if v["kind"] == "base"}
ok({"tom", "siwis", "gilles", "upmc-0", "upmc-1", "mls-1840"} <= set(base), "6 voix de base Piper fournies")
ok(base["tom"]["model"] == "fr_FR-tom-medium" and "AGPL" in base["tom"]["license"] and base["upmc-1"]["speaker"] == 1, "Tom : modèle et licence ; UPMC : numéro de locuteur")
ok(s["defaults"]["baseVoice"] == base["tom"]["id"] and s["defaults"]["vcSteps"] == 3 and s["defaults"]["vcChunk"] == 20 and s["defaults"]["duck"] == 15 and s["defaults"]["targetVoice"] is None, "réglages par défaut : Tom, 3 étapes, blocs de 20 s, original à 15 %")
ok(s["engine"]["ready"] is False, "sans service de doublage : moteur « pas prêt »")
ok(set(s["presets"]) == {"fast", "balanced", "quality"} and s["params"]["vcSteps"]["max"] == 10, "préréglages et plages fournis")
ok(rq("PUT", "/studio/dubbing/defaults", headers=A, json={"params": {"vcSteps": 11}}).status_code == 400, "étapes hors plage refusées")
ok(rq("PUT", "/studio/dubbing/defaults", headers=A, json={"params": {"duck": -1}}).status_code == 400, "volume négatif refusé")
ok(rq("PUT", "/studio/dubbing/defaults", headers=A, json={"params": {"inconnu": 1}}).status_code == 400, "réglage inconnu refusé")
ok(rq("PUT", "/studio/dubbing/defaults", headers=A, json={"params": {"baseVoice": str(uuid.uuid4())}}).status_code == 400, "voix inconnue refusée")
r = rq("PUT", "/studio/dubbing/defaults", headers=A, json={"params": {"baseVoice": base["tom"]["id"], "vcSteps": 4, "duck": 20}})
ok(r.status_code == 200 and r.json()["defaults"]["vcSteps"] == 4 and r.json()["defaults"]["duck"] == 20 and r.json()["defaults"]["maxSpeedup"] == 1.35, "réglages par défaut enregistrés (le reste garde sa valeur d'origine)")
ok(rq("PUT", "/studio/dubbing/defaults", headers=O, json={"params": {"vcSteps": 2}}).status_code == 403, "organisateur : modification refusée")

# --- voix de base ajoutée
ok(rq("POST", "/studio/dubbing/voices", headers=A, json={"kind": "base", "name": "X", "model": "pas un modèle"}).status_code == 400, "modèle Piper mal nommé refusé")
r = rq("POST", "/studio/dubbing/voices", headers=A, json={"kind": "base", "name": f"Test {tag}", "model": "fr_FR-tom-medium", "gender": "male", "license": "AGPL-3.0"})
ok(r.status_code == 201 and r.json()["kind"] == "base", "voix de base ajoutée"); vb = r.json()["id"]; voices.append(vb)
ok(rq("PATCH", f"/studio/dubbing/voices/{vb}", headers=A, json={"name": f"Test2 {tag}", "notes": "n"}).json()["name"] == f"Test2 {tag}", "voix renommée")
ok(rq("DELETE", f"/studio/dubbing/voices/{vb}", headers=A).status_code == 204 and all(v["id"] != vb for v in rq("GET", "/studio/dubbing/voices", headers=A).json()["voices"]), "voix désactivée : disparaît de la liste")
ok(any(v["id"] == vb and not v["active"] for v in rq("GET", "/studio/dubbing/voices?all=1", headers=A).json()["voices"]), "… mais conservée (liste complète)")
cur.execute("update dub_voices set active=false where kind='base' and slug <> 'tom'")
ok(rq("DELETE", f"/studio/dubbing/voices/{base['tom']['id']}", headers=A).status_code == 409, "impossible de désactiver la dernière voix de base")
ok(rq("PATCH", f"/studio/dubbing/voices/{base['tom']['id']}", headers=A, json={"active": False}).status_code == 409, "… ni par modification")
cur.execute("update dub_voices set active=true where slug is not null")

# --- voix cible : échantillon + consentement
ok(rq("POST", "/studio/dubbing/voices/upload-url", headers=A, json={"contentType": "video/mp4"}).status_code == 400, "format non audio refusé")
ok(rq("POST", "/studio/dubbing/voices/upload-url", headers=A, json={"contentType": "audio/wav", "size": 200 * 1024 * 1024}).status_code == 400, "échantillon trop lourd refusé")
up = rq("POST", "/studio/dubbing/voices/upload-url", headers=A, json={"contentType": "audio/wav", "size": 2048})
ok(up.status_code == 200 and up.json()["key"].startswith("dubbing/voices/") and up.json()["key"].endswith(".wav"), "lien d'envoi direct obtenu")
put = requests.put(up.json()["url"], data=b"RIFF" + b"\0" * 2044, headers={"content-type": "audio/wav"}); ok(put.status_code == 200, "échantillon envoyé au stockage")
today = datetime.date.today().isoformat(); future = (datetime.date.today() + datetime.timedelta(days=3)).isoformat()
body = {"kind": "target", "name": f"Ma voix {tag}", "sampleKey": up.json()["key"], "consentDate": today, "consentBy": "Epok", "consentConfirmed": True, "gender": "male"}
ok(rq("POST", "/studio/dubbing/voices", headers=A, json={**body, "consentConfirmed": False}).json().get("code") == "consent_required", "sans case de consentement : refusé")
ok(rq("POST", "/studio/dubbing/voices", headers=A, json={**body, "consentDate": future}).json().get("code") == "consent_future", "date de consentement future : refusée")
ok(rq("POST", "/studio/dubbing/voices", headers=A, json={**body, "consentBy": ""}).status_code == 400, "nom de la personne obligatoire")
ok(rq("POST", "/studio/dubbing/voices", headers=A, json={**body, "sampleKey": f"dubbing/voices/{uuid.uuid4()}.wav"}).json().get("code") == "missing", "échantillon non reçu : refusé")
ok(rq("POST", "/studio/dubbing/voices", headers=A, json={**body, "sampleKey": "books/x.pdf"}).status_code == 400, "clé de fichier étrangère refusée")
ok(rq("POST", "/studio/dubbing/voices", headers=O, json=body).status_code == 403, "organisateur : ajout refusé")
r = rq("POST", "/studio/dubbing/voices", headers=A, json=body)
ok(r.status_code == 201 and r.json()["consentDate"] == today and r.json()["consentBy"] == "Epok" and r.json()["hasSample"] and r.json()["sampleBytes"] == 2048, "voix cible créée : consentement daté et échantillon enregistrés")
vt = r.json()["id"]; voices.append(vt)
ok("sample_key" not in r.json(), "la clé interne du fichier n'est jamais renvoyée")
smp = rq("GET", f"/studio/dubbing/voices/{vt}/sample", headers=A)
ok(smp.status_code == 200 and requests.get(smp.json()["url"]).content.startswith(b"RIFF"), "échantillon réécoutable (lien temporaire)")
cur.execute("select consent_recorded_by from dub_voices where id=%s", (vt,)); ok(str(cur.fetchone()[0]) == str(a_id), "qui a enregistré le consentement est conservé")

# --- conférences
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language,transcript_language) values (%s,'d','Cheikh','youtube',%s,%s,'published','ready','free',600,'ar','ar') returning id",
            (f"Conf doublage {tag}", "v" + uuid.uuid4().hex[:9], o_id)); t1 = cur.fetchone()[0]; talks.append(t1)
cur.execute("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,language) values (%s,'d','Cheikh','youtube',%s,%s,'published','ready','free',600,'fr') returning id",
            (f"Conf française {tag}", "v" + uuid.uuid4().hex[:9], o_id)); t2 = cur.fetchone()[0]; talks.append(t2)
for i, (a, b, txt) in enumerate([(0, 10000, "Que la paix soit sur vous"), (10000, 30000, "# verset conservé"), (30000, 60000, "La récompense de la récitation")]):
    cur.execute("insert into transcript_segments(talk_id,lang,idx,start_ms,end_ms,text) values (%s,'fr',%s,%s,%s,%s)", (t1, i, a, b, txt))
lst = {x["id"]: x for x in rq("GET", f"/studio/dubbing/talks?q={tag}", headers=A).json()["talks"]}
ok(str(t1) in lst and str(t2) not in lst, "liste : la conférence en arabe y est, la conférence déjà en français non")
x = lst[str(t1)]; ok(x["phrases"] == 3 and x["estimate"]["speechSeconds"] == 40 and x["estimate"]["rtf"] == 2.0 and x["estimate"]["seconds"] == 80, "estimation : 40 s de parole (verset exclu) × 2,0 = 80 s")
d = rq("GET", f"/studio/dubbing/talks/{t1}", headers=A).json()
ok(len(d["segments"]) == 3 and d["kept"] == 1 and d["effective"]["vcSteps"] == 4 and d["override"] == {}, "fiche : phrases, verset gardé en voix d'origine, réglages par défaut appliqués")
ok(rq("PUT", f"/studio/dubbing/talks/{t1}", headers=A, json={"params": {"targetVoice": vb}}).status_code == 400, "voix désactivée refusée pour une conférence")
ok(rq("PUT", f"/studio/dubbing/talks/{t1}", headers=A, json={"params": {"targetVoice": base["tom"]["id"]}}).status_code == 400, "une voix de base ne peut pas servir de voix cible")
d = rq("PUT", f"/studio/dubbing/talks/{t1}", headers=A, json={"params": {"targetVoice": vt, "vcSteps": 5}}).json()
ok(d["override"] == {"targetVoice": vt, "vcSteps": 5} and d["effective"]["duck"] == 20 and abs(d["estimate"]["rtf"] - 4.4) < 1e-9 and d["estimate"]["seconds"] == 176,
   "réglages de la conférence : voix cible + 5 étapes → 2,0 + 0,3 + 0,42 × 5 = 4,4 ; 176 s")
ok(rq("GET", f"/studio/dubbing/talks?q={tag}", headers=A).json()["talks"][0]["hasOverride"], "liste : réglages propres signalés")
rq("DELETE", f"/studio/dubbing/voices/{vt}", headers=A)
ok(rq("GET", f"/studio/dubbing/talks/{t1}", headers=A).json()["effective"]["targetVoice"] is None, "voix cible désactivée ensuite : la conférence repasse sans conversion")
d = rq("PUT", f"/studio/dubbing/talks/{t1}", headers=A, json={"params": None}).json(); ok(d["override"] == {} and d["effective"]["vcSteps"] == 4, "retour aux réglages par défaut")
ok(rq("GET", f"/studio/dubbing/talks/{uuid.uuid4()}", headers=A).status_code == 404, "conférence inconnue : 404")

# --- langue d'écoute
H = U
ok(rq("PUT", f"/me/progress/{t1}", headers=H, json={"positionMs": 0, "audioLang": "de"}).status_code == 400, "langue d'audio inconnue refusée")
rq("PUT", f"/me/progress/{t1}", headers=H, json={"positionMs": 0}); time.sleep(3)
ok(rq("PUT", f"/me/progress/{t1}", headers=H, json={"positionMs": 3000, "audioLang": "fr"}).status_code == 204, "reprise de lecture avec la langue de l'audio")
time.sleep(2); rq("PUT", f"/me/progress/{t1}", headers=H, json={"positionMs": 5000})
cur.execute("select audio_lang, seconds from dub_listen where talk_id=%s order by audio_lang", (t1,)); rows = dict(cur.fetchall())
ok(rows.get("fr", 0) >= 2 and rows.get("orig", 0) >= 1, f"temps d'écoute par langue enregistré ({rows})")
L = rq("GET", "/studio/dubbing/listening?days=7", headers=A).json()
ok(L["totals"]["fr"] >= 2 and any(t["id"] == str(t1) and t["fr"] >= 2 for t in L["talks"]), "analytique : écoute en version française")
rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": False})
rq("PUT", f"/me/progress/{t1}", headers=H, json={"positionMs": 0}); time.sleep(2); rq("PUT", f"/me/progress/{t1}", headers=H, json={"positionMs": 2000, "audioLang": "fr"})
cur.execute("select seconds from dub_listen where talk_id=%s and audio_lang='fr'", (t1,)); ok(cur.fetchone()[0] == rows["fr"], "module désactivé : plus rien n'est compté")
rq("PUT", "/admin/modules/dubbing", headers=A, json={"enabled": True})

cleanup(); print("Tout est OK")
