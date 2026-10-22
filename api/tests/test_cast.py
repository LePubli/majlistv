"""22b-10 : diffusion Chromecast. Le récepteur du téléviseur lit les playlists HLS et les segments depuis un autre domaine :
vérifie l'en-tête CORS des playlists (API) et la règle CORS ouverte en lecture sur le bucket. Prérequis : API (3055), PG (5544), S3 (moto 5599), ffmpeg."""
import sys, os, re, requests, importlib.util
spec = importlib.util.spec_from_file_location("t", os.path.join(os.path.dirname(__file__), "test_offline.py"))
src = open(spec.origin, encoding="utf-8").read().split("# Réglage de validité")[0]
ns = {"__name__": "castfixture"}; exec(compile(src, "test_offline_head", "exec"), ns)
ok, B, s3, BUCKET = ns["ok"], ns["B"], ns["s3"], ns["BUCKET"]

talk = ns["make_talk"](access="free"); ns["make_hls"](talk)
h = ns["user"](False)
info = requests.get(f"{B}/talks/{talk}", headers=h).json()
ok(bool(info.get("hlsPath")), "la fiche donne une adresse HLS avec jeton")
ORIGIN = "https://www.gstatic.com"  # origine du récepteur multimédia par défaut de Google
r = requests.get(B + info["hlsPath"], headers={"Origin": ORIGIN})
ok(r.status_code == 200 and "#EXTM3U" in r.text, "playlist maître servie")
ok(r.headers.get("access-control-allow-origin") == "*", "playlist maître : CORS ouvert (récepteur Chromecast)")
variant = next(l for l in r.text.splitlines() if l and not l.startswith("#"))
r2 = requests.get(B + "/hls/" + str(talk) + "/" + variant, headers={"Origin": ORIGIN})
ok(r2.status_code == 200 and r2.headers.get("access-control-allow-origin") == "*", "playlist de qualité : CORS ouvert")
ok(requests.get(f"{B}/hls/{talk}/master.m3u8?t=faux", headers={"Origin": ORIGIN}).status_code == 403, "sans bon jeton : toujours refusé")

# Règle CORS du bucket (posée au démarrage de l'API) : lecture ouverte pour GET / HEAD, écriture réservée au site.
rules = s3.get_bucket_cors(Bucket=BUCKET)["CORSRules"]
open_rule = [x for x in rules if "*" in x["AllowedOrigins"]]
ok(len(open_rule) == 1 and sorted(open_rule[0]["AllowedMethods"]) == ["GET", "HEAD"], "bucket : règle ouverte en lecture seulement")
ok(all("PUT" not in x["AllowedMethods"] for x in open_rule), "bucket : aucun PUT depuis une origine quelconque")
ok(any("PUT" in x["AllowedMethods"] and "*" not in x["AllowedOrigins"] for x in rules), "bucket : l'envoi (PUT) reste limité au site")
print("TOUT OK")
