"""Étape Import (transcripteur) : anti-SSRF, téléchargement direct, taille maximale, annulation, yt-dlp simulé, contrôle ffprobe, envoi S3 simulé.
Lancer : python3 tests/test_importer.py   (ffmpeg requis ; S3 simulé sur :5599 pour la dernière partie, ignorée s'il est absent)"""
import os, subprocess, sys, tempfile, threading, types
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
import external, importer

def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: sys.exit(1)
def raises(exc, fn):
    try: fn()
    except exc as e: return e
    return None

work0 = tempfile.mkdtemp(); VIDEO = os.path.join(work0, "v.mp4")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=2", "-f", "lavfi", "-i", "sine=duration=2", "-shortest",
                "-pix_fmt", "yuv420p", VIDEO], check=True)
DATA = open(VIDEO, "rb").read()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        p = self.path
        if p == "/v.mp4": self.send_response(200); self.send_header("Content-Type", "video/mp4"); self.send_header("Content-Length", str(len(DATA))); self.end_headers(); self.wfile.write(DATA)
        elif p == "/chunked.mp4":  # sans Content-Length : la limite se vérifie pendant le téléchargement
            self.send_response(200); self.send_header("Content-Type", "video/mp4"); self.end_headers(); self.wfile.write(DATA * 50)
        elif p == "/page": self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers(); self.wfile.write(b"<html></html>")
        elif p == "/redir": self.send_response(302); self.send_header("Location", "/v.mp4"); self.end_headers()
        elif p == "/evil": self.send_response(302); self.send_header("Location", "http://10.0.0.5/secret.mp4"); self.end_headers()
        elif p == "/loop": self.send_response(302); self.send_header("Location", "/loop"); self.end_headers()
        elif p == "/notvideo.mp4": self.send_response(200); self.send_header("Content-Type", "application/octet-stream"); self.end_headers(); self.wfile.write(b"ceci n'est pas une video")
        else: self.send_response(404); self.end_headers()
srv = ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start(); BASE = f"http://127.0.0.1:{srv.server_address[1]}"

# --- assert_public_url (résolveur simulé) ---
def res(*ips): return lambda host, port, type=None: [(2, 1, 6, "", (ip, port)) for ip in ips]
ok(importer.assert_public_url("https://example.org/a.mp4", res("93.184.216.34")) == "https://example.org/a.mp4", "adresse publique acceptée")
for bad in ["127.0.0.1", "10.1.2.3", "192.168.0.9", "172.16.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "0.0.0.0", "::ffff:127.0.0.1"]:
    ok(raises(external.Blocked, lambda b=bad: importer.assert_public_url("https://x.example/a", res(b))) is not None, f"IP privée refusée : {bad}")
ok(raises(external.Blocked, lambda: importer.assert_public_url("https://x.example/a", res("93.184.216.34", "10.0.0.1"))) is not None, "une seule IP privée parmi plusieurs : refusé")
ok(raises(external.Blocked, lambda: importer.assert_public_url("ftp://example.org/a", res("93.184.216.34"))) is not None, "ftp refusé")
ok(raises(external.Blocked, lambda: importer.assert_public_url("https://user:pw@example.org/a", res("93.184.216.34"))) is not None, "identifiants dans l'adresse refusés")
def nxdomain(*a, **k): raise OSError("nxdomain")
ok(raises(external.Blocked, lambda: importer.assert_public_url("https://nope.example/a", nxdomain)) is not None, "site introuvable : message clair")
ok(importer.looks_direct("https://a.b/c/v.MP4?x=1") and not importer.looks_direct("https://a.b/watch?v=1.mp4"), "détection des liens directs")
ok(importer.archive_ident("https://archive.org/details/my_item-1") == "my_item-1" and raises(external.Blocked, lambda: importer.archive_ident("https://archive.org/about")) is not None, "identifiant archive.org")

# --- téléchargement direct (le contrôle d'adresse est neutralisé pour le serveur local ; la redirection privée est testée à part) ---
permissive = lambda u: u
def strict_except_local(u):  # tout est public sauf 10.x : prouve que chaque étape de redirection est contrôlée
    if "://10." in u: raise external.Blocked("Cette adresse n'est pas un site public : import refusé.")
    return u
prog = []
w = tempfile.mkdtemp(); p = importer.download_direct(BASE + "/v.mp4", w, 10 ** 8, lambda d, t: prog.append((d, t)), check=permissive)
ok(os.path.getsize(p) == len(DATA) and p.endswith(".mp4") and prog[-1] == (len(DATA), len(DATA)), "téléchargement direct + progression")
p = importer.download_direct(BASE + "/redir", tempfile.mkdtemp(), 10 ** 8, lambda d, t: None, check=permissive); ok(os.path.getsize(p) == len(DATA), "redirection suivie")
e = raises(external.Blocked, lambda: importer.download_direct(BASE + "/evil", tempfile.mkdtemp(), 10 ** 8, lambda d, t: None, check=strict_except_local))
ok(e is not None and "public" in str(e), "redirection vers le réseau interne refusée")
ok(raises(external.Blocked, lambda: importer.download_direct(BASE + "/loop", tempfile.mkdtemp(), 10 ** 8, lambda d, t: None, check=permissive)) is not None, "boucle de redirections stoppée")
e = raises(external.Blocked, lambda: importer.download_direct(BASE + "/page", tempfile.mkdtemp(), 10 ** 8, lambda d, t: None, check=permissive)); ok(e and "page web" in str(e), "page web refusée")
e = raises(external.Blocked, lambda: importer.download_direct(BASE + "/missing.mp4", tempfile.mkdtemp(), 10 ** 8, lambda d, t: None, check=permissive)); ok(e and "404" in str(e), "404 : message clair")
e = raises(importer.TooBig, lambda: importer.download_direct(BASE + "/v.mp4", tempfile.mkdtemp(), 1000, lambda d, t: None, check=permissive)); ok(e is not None, "trop gros (Content-Length) refusé avant le téléchargement")
e = raises(importer.TooBig, lambda: importer.download_direct(BASE + "/chunked.mp4", tempfile.mkdtemp(), len(DATA) * 10, lambda d, t: None, check=permissive)); ok(e is not None, "trop gros (sans Content-Length) arrêté en cours de route")
def cancel(d, t): raise importer.Canceled()
ok(raises(importer.Canceled, lambda: importer.download_direct(BASE + "/v.mp4", tempfile.mkdtemp(), 10 ** 8, cancel, check=permissive)) is not None, "annulation pendant le téléchargement")

# --- contrôle ffprobe ---
info = importer.check_video(VIDEO); ok(info["height"] == 240 and 1.5 < info["duration"] < 2.5, f"ffprobe : {info}")
junk = os.path.join(work0, "junk.mp4"); open(junk, "wb").write(b"pas une video"); ok(raises(external.Blocked, lambda: importer.check_video(junk)) is not None, "fichier non vidéo refusé")

# --- fetch : routage ---
job = lambda origin, url, **k: dict(origin=origin, source_url=url, archive_file=None, **k)
p = importer.fetch(job("web", BASE + "/v.mp4"), tempfile.mkdtemp(), {}, 10 ** 8, 1080, lambda d, t: None, check=permissive); ok(os.path.getsize(p) == len(DATA), "fetch : lien direct")
ok(raises(external.Blocked, lambda: importer.fetch(job("web", "http://10.0.0.5/a.mp4"), tempfile.mkdtemp(), {}, 10 ** 8, 1080, lambda d, t: None, check=strict_except_local)) is not None, "fetch : adresse privée refusée dès le départ")
ok(importer.format_selector(720) == "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b", "sélecteur de format")

# --- piste audio française (YouTube : vidéos à plusieurs pistes audio) : le vrai moteur de choix de yt-dlp, sans réseau ---
ok(importer.format_selector(720, None) == importer.format_selector(720), "sans langue : sélecteur inchangé")
ok(importer.format_selector(720, "fr") == "bv[height<=720]+ba[language^=fr]/bv+ba[language^=fr]/bv*[height<=720]+ba/b[height<=720]/bv*+ba/b", "sélecteur avec piste française d'abord")
ok(importer.format_selector(720, "f'r;") == importer.format_selector(720, "fr") and importer.format_selector(720, "!!") == importer.format_selector(720), "langue nettoyée")
from yt_dlp import YoutubeDL as RealYDL
_v = lambda i, h: dict(format_id=str(i), url=f"https://cdn.example.org/{i}", ext="mp4", vcodec="avc1.64", acodec="none", height=h, width=h * 16 // 9, tbr=h * 3, vbr=h * 3, protocol="https")
_a = lambda i, lang, pref, abr: dict(format_id=i, url=f"https://cdn.example.org/{i}", ext="webm", vcodec="none", acodec="opus", abr=abr, tbr=abr, language=lang, language_preference=pref, protocol="https")
def formats(french, tall=False):
    f = [_v(136, 720), _v(137, 1080)] + ([_v(313, 2160)] if tall else []) + [_a("249-18", "en", 10, 50), _a("251-18", "en", 10, 130), _a("251-3", "ar", -1, 130)]
    if french: f += [_a("249-17", "fr", -1, 50), _a("251-9", "fr", -1, 130), _a("140-5", "fr-FR", -1, 129)]
    return f + [dict(format_id="18", url="https://cdn.example.org/18", ext="mp4", vcodec="avc1.42", acodec="mp4a.40", height=360, width=640, tbr=500, language="en", protocol="https")]
def chosen(lang, french, tall=False, height=1080):
    with RealYDL({"quiet": True, "format": importer.format_selector(height, lang), "simulate": True}) as y:
        return y.process_ie_result({"id": "x", "title": "t", "extractor": "youtube", "extractor_key": "Youtube", "webpage_url": "https://www.youtube.com/watch?v=x", "formats": formats(french, tall)}, download=False)
i = chosen("fr", True); ok(i["format_id"] == "137+251-9" and importer.audio_track_used(i, "fr") == "fr", f"piste française prise, meilleure qualité audio ({i['format_id']})")
i = chosen("fr", True, tall=True); ok(i["format_id"] == "137+251-9", "piste française : la hauteur maximale reste respectée")
i = chosen("fr", True, height=720); ok(i["format_id"] == "136+251-9", "piste française en 720p")
i = chosen("fr", False); ok(i["format_id"] == "137+251-18" and importer.audio_track_used(i, "fr") is None, "pas de piste française : voix d'origine, et c'est signalé")
i = chosen(None, True); ok(i["format_id"] == "137+251-18" and importer.audio_track_used(i, None) is None, "sans demande : voix d'origine même si une piste française existe")
ok(sorted(importer.audio_languages(chosen("fr", True))) == ["ar", "en", "fr"], "langues proposées (journal)")
ok(importer.audio_track_used({"requested_formats": [{"acodec": "none", "language": "fr"}, {"acodec": "opus", "language": "fr-CA"}]}, "fr") == "fr", "fr-CA compte comme français")
ok(importer.audio_track_used({"acodec": "mp4a", "language": "en"}, "fr") is None and importer.audio_track_used(None, "fr") is None and importer.audio_languages(None) == [], "cas limites")

# --- yt-dlp simulé ---
import yt_dlp
calls = {}
class FakeYDL:
    def __init__(self, opts): self.opts = opts; calls["opts"] = opts
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def extract_info(self, url, download=False):
        if "playlist" in url: return {"_type": "playlist", "entries": [{"id": 1}, {"id": 2}]}
        if "single" in url: return {"_type": "playlist", "entries": [{"id": 1, "webpage_url": "https://example.org/watch", "url": "https://cdn.example.org/v.mp4"}]}
        if "internal" in url: return {"id": 1, "webpage_url": url, "url": "http://10.0.0.7/v.mp4"}
        if "boom" in url: raise Exception("ERROR: Sign in to confirm you're not a bot")
        return {"id": 1, "webpage_url": url, "url": "https://cdn.example.org/v.mp4", "requested_formats": [{"url": "https://cdn.example.org/a.m4a"}]}
    def process_ie_result(self, info, download=True):
        out = self.opts["outtmpl"].replace("%(ext)s", "mp4"); open(out, "wb").write(DATA)
        if "limit" in info.get("webpage_url", ""): pass
        for h in self.opts["progress_hooks"]: h({"status": "downloading", "downloaded_bytes": 10, "total_bytes": 100})
yt_dlp.YoutubeDL = FakeYDL
pub = lambda u: u
w = tempfile.mkdtemp(); p = importer.download_ytdlp("https://www.youtube.com/watch?v=abc", w, {"cookiefile": "/x"}, 10 ** 8, 720, lambda d, t: prog.append(("y", d, t)), check=pub)
ok(os.path.getsize(p) == len(DATA) and calls["opts"]["noplaylist"] and calls["opts"]["format"].startswith("bv*[height<=720]") and calls["opts"]["cookiefile"] == "/x" and calls["opts"]["max_filesize"] == 10 ** 8, "yt-dlp : options (qualité max, taille max, cookies, pas de liste)")
ok(prog[-1] == ("y", 10, 100), "yt-dlp : progression transmise")
e = raises(external.Blocked, lambda: importer.download_ytdlp("https://x.example/playlist", tempfile.mkdtemp(), {}, 10 ** 8, 720, lambda d, t: None, check=pub)); ok(e and "plusieurs vidéos" in str(e), "liste de plusieurs vidéos refusée")
p = importer.download_ytdlp("https://x.example/single", tempfile.mkdtemp(), {}, 10 ** 8, 720, lambda d, t: None, check=pub); ok(os.path.exists(p), "liste d'une seule vidéo acceptée")
ok(raises(external.Blocked, lambda: importer.download_ytdlp("https://x.example/internal", tempfile.mkdtemp(), {}, 10 ** 8, 720, lambda d, t: None, check=strict_except_local)) is not None, "yt-dlp : flux pointant vers le réseau interne refusé")
e = raises(Exception, lambda: importer.download_ytdlp("https://x.example/boom", tempfile.mkdtemp(), {}, 10 ** 8, 720, lambda d, t: None, check=pub)); ok(e is not None and "cookies" in str(e).lower(), f"blocage YouTube : message lisible ({str(e)[:60]})")
ok(raises(importer.Canceled, lambda: importer.download_ytdlp("https://x.example/ok", tempfile.mkdtemp(), {}, 10 ** 8, 720, cancel, check=pub)) is not None, "yt-dlp : annulation propagée")
ok(raises(importer.TooBig, lambda: importer.download_ytdlp("https://x.example/ok", tempfile.mkdtemp(), {}, 5, 720, lambda d, t: None, check=pub)) is not None, "yt-dlp : taille maximale")


# --- piste audio : compte rendu et refus quand la piste est exigée (vidéo déjà importée) ---
class LangYDL(FakeYDL):
    def extract_info(self, url, download=False):
        fr = "avecfr" in url
        return {"id": 1, "webpage_url": url, "formats": [{"acodec": "opus", "language": "en"}] + ([{"acodec": "opus", "language": "fr"}] if fr else []),
                "requested_formats": [{"url": "https://cdn.example.org/v", "acodec": "none"}, {"url": "https://cdn.example.org/a", "acodec": "opus", "language": "fr" if fr else "en"}]}
yt_dlp.YoutubeDL = LangYDL
rep = {}; importer.download_ytdlp("https://www.youtube.com/watch?v=avecfr", tempfile.mkdtemp(), {}, 10 ** 8, 720, lambda d, t: None, check=pub, audio_lang="fr", report=rep)
ok({k: rep[k] for k in ("audio_used", "audio_langs")} == {"audio_used": "fr", "audio_langs": ["en", "fr"]} and {"title", "thumb", "duration"} <= set(rep) and "ba[language^=fr]" in calls["opts"]["format"], f"piste française : compte rendu ({rep})")
rep = {}; importer.download_ytdlp("https://www.youtube.com/watch?v=sans", tempfile.mkdtemp(), {}, 10 ** 8, 720, lambda d, t: None, check=pub, audio_lang="fr", report=rep)
ok(rep["audio_used"] is None, "premier import sans piste française : la voix d'origine est gardée, sans erreur")
wr = tempfile.mkdtemp(); e = raises(external.Blocked, lambda: importer.download_ytdlp("https://www.youtube.com/watch?v=sans", wr, {}, 10 ** 8, 720, lambda d, t: None, check=pub, audio_lang="fr", require_audio=True))
ok(e and "piste audio en français" in str(e) and not os.listdir(wr), "vidéo déjà importée sans piste française : refus AVANT tout téléchargement")
rep = {}; importer.fetch(job("youtube", "https://www.youtube.com/watch?v=avecfr", audio_lang="fr", reimport=True), tempfile.mkdtemp(), {}, 10 ** 8, 720, lambda d, t: None, check=pub, report=rep)
ok(rep["audio_used"] == "fr", "fetch : langue et exigence transmises")
e = raises(external.Blocked, lambda: importer.fetch(job("web", BASE + "/v.mp4", audio_lang="fr", reimport=True), tempfile.mkdtemp(), {}, 10 ** 8, 720, lambda d, t: None, check=permissive))
ok(e and "fichier direct" in str(e), "vidéo venue d'un fichier direct : pas de seconde piste à chercher")
p2 = importer.fetch(job("web", BASE + "/v.mp4", audio_lang="fr"), tempfile.mkdtemp(), {}, 10 ** 8, 720, lambda d, t: None, check=permissive); ok(os.path.getsize(p2) == len(DATA), "premier import d'un lien direct : la demande de langue est sans effet")
yt_dlp.YoutubeDL = FakeYDL

# --- envoi S3 simulé ---
try:
    import boto3
    s3 = boto3.client("s3", endpoint_url="http://127.0.0.1:5599", aws_access_key_id="test", aws_secret_access_key="test", region_name="us-east-1"); s3.head_bucket(Bucket="majlis-videos")
except Exception as err:
    print("SKIP envoi S3 (S3 simulé absent) :", str(err)[:60])
else:
    sent = []; n = importer.upload(s3, "majlis-videos", VIDEO, "talks/test-importer", lambda d, t: sent.append((d, t)))
    ok(n == len(DATA) and sent[-1] == (len(DATA), len(DATA)), "envoi S3 + progression")
    ok(s3.head_object(Bucket="majlis-videos", Key="talks/test-importer")["ContentType"] == "video/mp4", "type de contenu video/mp4")
    ok(raises(importer.Canceled, lambda: importer.upload(s3, "majlis-videos", VIDEO, "talks/test-importer2", cancel)) is not None, "annulation pendant l'envoi")
    s3.delete_object(Bucket="majlis-videos", Key="talks/test-importer")
print("TOUT EST OK")
