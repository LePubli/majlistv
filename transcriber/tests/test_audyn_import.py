"""Audyn — import du son d'une vidéo : règles et fichiers (sans réseau, sans base).
  - choix du son seul par le VRAI moteur de sélection de yt-dlp (vidéo simulée à plusieurs pistes) ;
  - adresses de listes (playlist, chaîne) / vidéo seule ; adresses des vidéos listées ;
  - archive.org : une version de chaque piste, dans l'ordre ;
  - conversion MP3 et couverture carrée sur fond flou avec le vrai ffmpeg.
Lancer : python3 transcriber/tests/test_audyn_import.py
"""
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
import audyn_import as ai  # noqa: E402
import external  # noqa: E402

n = 0


def ok(cond, msg):
    global n
    if not cond:
        print("FAIL", msg)
        sys.exit(1)
    n += 1
    print("OK  ", msg)


def raises(exc, fn):
    try:
        fn()
    except exc as e:  # noqa: BLE001
        return e
    return None


# --- sélecteur du son seul : vrai moteur de yt-dlp ---
from yt_dlp import YoutubeDL  # noqa: E402

_v = lambda i, h: dict(format_id=str(i), url=f"https://cdn.example.org/{i}", ext="mp4", vcodec="avc1.64", acodec="none", height=h, width=h * 16 // 9, tbr=h * 3, vbr=h * 3, protocol="https")
_a = lambda i, lang, pref, abr: dict(format_id=i, url=f"https://cdn.example.org/{i}", ext="webm", vcodec="none", acodec="opus", abr=abr, tbr=abr, language=lang, language_preference=pref, protocol="https")
_b = dict(format_id="18", url="https://cdn.example.org/18", ext="mp4", vcodec="avc1.42", acodec="mp4a.40", height=360, width=640, tbr=500, language="en", protocol="https")


def chosen(lang, formats):
    with YoutubeDL({"quiet": True, "format": ai.audio_selector(lang), "simulate": True}) as y:
        return y.process_ie_result({"id": "x", "title": "t", "extractor": "youtube", "extractor_key": "Youtube",
                                    "webpage_url": "https://www.youtube.com/watch?v=x", "formats": formats}, download=False)["format_id"]


multi = [_v(137, 1080), _a("251-18", "en", 10, 130), _a("249-18", "en", 10, 50), _a("251-9", "fr", -1, 130), _a("249-17", "fr", -1, 50), _a("251-3", "ar", -1, 130), _b]
ok(ai.audio_selector("fr") == "ba[language^=fr]/ba/b" and ai.audio_selector(None) == "ba/b" and ai.audio_selector("f'r") == ai.audio_selector("fr"), "sélecteurs")
ok(chosen("fr", multi) == "251-9", "voix française demandée et proposée : la piste française, meilleure qualité, SANS la vidéo")
ok(chosen(None, multi) == "251-18", "sans demande : la voix d'origine, son seul")
ok(chosen("fr", [_v(137, 1080), _a("251-18", "en", 10, 130), _b]) == "251-18", "pas de piste française : voix d'origine")
ok(chosen("fr", [_b]) == "18", "site sans son séparé : le format complet (le son sera extrait)")

# --- listes ---
L = ai.is_list_url
ok(L("https://www.youtube.com/playlist?list=PL123") and L("https://youtube.com/@chaine") and L("https://www.youtube.com/@chaine/videos")
   and L("https://www.youtube.com/channel/UCabc") and L("https://m.youtube.com/c/Nom/podcasts") and L("https://vimeo.com/showcase/123"), "playlists et chaînes reconnues")
ok(not L("https://www.youtube.com/watch?v=abcdefghijk&list=PL123") and not L("https://youtu.be/abcdefghijk?list=PL1") and not L("https://www.youtube.com/playlist")
   and not L("https://vimeo.com/123456") and not L("https://archive.org/details/x") and not L("https://exemple.fr/@x") and not L(""), "vidéo seule (même ouverte depuis une playlist) : pas une liste")
ok(ai.entry_url({"source": "youtube", "id": "abcdefghijk"}) == "https://www.youtube.com/watch?v=abcdefghijk" and ai.entry_url({"source": "vimeo", "id": "12"}) == "https://vimeo.com/12"
   and ai.entry_url({"source": "dailymotion", "id": "x8a"}) == "https://www.dailymotion.com/video/x8a" and ai.entry_url({"source": "?", "id": "1"}) is None, "adresses des vidéos listées")

# --- archive.org ---
F = lambda name, src="original", fmt="", title="": {"name": name, "source": src, "format": fmt, "title": title}
librivox = [F("livre_10_auteur_64kb.mp3", "original", "64Kbps MP3"), F("livre_02_auteur_64kb.mp3", "original", "64Kbps MP3", "Chapitre 2"), F("livre_01_auteur_64kb.mp3", "original", "64Kbps MP3"),
            F("livre_01_auteur.ogg", "derivative", "Ogg Vorbis"), F("livre_01_auteur_128kb.mp3", "derivative", "128Kbps MP3"), F("cover.jpg", "original", "JPEG"), F("livre.mp4", "original", "h.264")]
got = ai.pick_archive_audio(librivox)
ok([f["name"] for f in got] == ["livre_01_auteur_64kb.mp3", "livre_02_auteur_64kb.mp3", "livre_10_auteur_64kb.mp3"], f"originaux MP3, ordre des pistes (1, 2, 10), sans les copies ({[f['name'] for f in got]})")
deriv = [F("a.flac", "original", "Flac"), F("a.mp3", "derivative", "VBR MP3"), F("b.flac", "original", "Flac"), F("b.mp3", "derivative", "VBR MP3")]
ok([f["name"] for f in ai.pick_archive_audio(deriv)] == ["a.flac", "b.flac"], "originaux FLAC : gardés (une version par piste)")
only_deriv = [F("x_vbr.mp3", "derivative", "VBR MP3"), F("x_64kb.mp3", "derivative", "64Kbps MP3"), F("y_vbr.mp3", "derivative", "VBR MP3"), F("y_64kb.mp3", "derivative", "64Kbps MP3")]
ok([f["name"] for f in ai.pick_archive_audio(only_deriv)] == ["x_vbr.mp3", "y_vbr.mp3"], "copies seulement : un seul format (VBR MP3)")
ok(ai.pick_archive_audio([F("v.mp4"), F("c.jpg")]) == [] and ai.pick_archive_audio(None) == [], "pas de son : liste vide (la vidéo sera prise)")
ok(ai.file_title({"name": "dir/livre_01_auteur_64kb.mp3"}) == "livre 01 auteur 64kb" and ai.file_title({"name": "a.mp3", "title": " Chapitre 1 "}) == "Chapitre 1", "titres des fichiers")

# archive_audio : métadonnées simulées (aucun réseau)
external._archive_get = lambda path, params=None: {"metadata": {"title": "Livre audio"}, "files": librivox}
info = ai.archive_audio("livre-audio")
ok(info["title"] == "Livre audio" and len(info["files"]) == 3 and info["files"][1]["title"] == "Chapitre 2", "élément archive.org : trois pistes")
external._archive_get = lambda path, params=None: {"metadata": {"title": "X", "access-restricted-item": "true"}, "files": librivox}
ok(raises(external.Blocked, lambda: ai.archive_audio("x")) is not None, "accès restreint : refus lisible")
ok(raises(external.Blocked, lambda: ai.archive_audio("../etc")) is not None, "identifiant invalide refusé")

# --- fichiers : vrai ffmpeg ---
tmp = tempfile.mkdtemp()
vid = os.path.join(tmp, "v.mp4")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
                "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", vid], check=True)
mute = os.path.join(tmp, "m.mp4")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", mute], check=True)
mp3 = os.path.join(tmp, "out.mp3")
d = ai.to_mp3(vid, mp3)
p = ai.probe(mp3)
codec = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,sample_rate,channels", "-of", "csv=p=0", mp3], capture_output=True, text=True).stdout.strip()
streams = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", mp3], capture_output=True, text=True).stdout.split()
ok(3.5 < d < 4.6 and p["audio"] and codec == "mp3,44100,2" and streams == ["audio"], f"vidéo -> MP3 44,1 kHz stéréo, son seul ({codec}, {d:.1f} s)")
e = raises(external.Blocked, lambda: ai.to_mp3(mute, os.path.join(tmp, "x.mp3")))
ok(e is not None and "pas de son" in str(e), "vidéo muette : refus lisible")
junk = os.path.join(tmp, "j.bin")
open(junk, "wb").write(b"pas un fichier")
ok(raises(external.Blocked, lambda: ai.to_mp3(junk, os.path.join(tmp, "y.mp3"))) is not None, "fichier illisible : refus lisible")

img = os.path.join(tmp, "thumb.jpg")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720", "-frames:v", "1", img], check=True)
sq = ai.square_cover(img, os.path.join(tmp, "cover.jpg"))
dims = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", sq], capture_output=True, text=True).stdout.strip()
ok(dims == "1000,1000", f"couverture carrée 1000 × 1000 ({dims})")
# image entière : la bande centrale (hauteur 1000 × 9/16 ≈ 562) reprend l'image nette ; haut et bas = fond flou (pas de noir)
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", sq, "-vf", "scale=10:10,format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
ok(len(raw) == 100 and sum(raw[:10]) / 10 > 40 and sum(raw[-10:]) / 10 > 40 and len(set(raw[:10])) > 3, "bandes du haut et du bas : fond flou de l'image (varié), pas des bandes noires")
tall = os.path.join(tmp, "tall.jpg")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=361x641", "-frames:v", "1", tall], check=True)
dims = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", ai.square_cover(tall, os.path.join(tmp, "c2.jpg"))], capture_output=True, text=True).stdout.strip()
ok(dims == "1000,1000", "image en hauteur, dimensions impaires : carrée aussi")
ok(raises(RuntimeError, lambda: ai.square_cover(junk, os.path.join(tmp, "c3.jpg"))) is not None, "image illisible : erreur")
# --- chapitres de la vidéo -> morceaux ---
C = lambda *xs: [{"start_time": a, "end_time": e, "title": t} for a, e, t in xs]
P = lambda parts: [(round(p["start"], 1), round(p["end"], 1), p["title"]) for p in parts]
ok(P(ai.plan_parts(C((0, 600, "Introduction"), (600, 3000, "Partie 1"), (3000, 7200, "Partie 2")), 7200)) == [(0, 600, "Introduction"), (600, 3000, "Partie 1"), (3000, 7200, "Partie 2")], "trois chapitres -> trois morceaux")
ok(P(ai.plan_parts(C((5, 100, "A"), (100, None, "B")), 300)) == [(0, 100, "A"), (100, 300, "B")], "son avant le premier repère rattaché ; fin manquante = fin du son")
ok(P(ai.plan_parts(C((100, 200, "B"), (0, 100, "A")), 200)) == [(0, 100, "A"), (100, 200, "B")], "repères dans le désordre : remis dans l'ordre")
ok(P(ai.plan_parts(C((0, 100, "A"), (100, 101.5, "Erreur"), (101.5, 300, "C")), 300)) == [(0, 101.5, "A"), (101.5, 300, "C")], "repère de moins de 3 s : rattaché au précédent")
ok(P(ai.plan_parts(C((0, 2, "Générique"), (2, 300, "Cours"), (300, 600, "Questions")), 600)) == [(0, 300, "Cours"), (300, 600, "Questions")], "premier repère trop court : rattaché au suivant")
ok(ai.plan_parts(C((0, 300, "Seul")), 300) == [] and ai.plan_parts([], 300) == [] and ai.plan_parts(None, 0) == [], "moins de deux chapitres : pas de découpage")
ok(ai.plan_parts(C((0, 1, "a"), (1, 2, "b")), 2) == [], "chapitres tous trop courts : pas de découpage")
ok(P(ai.plan_parts(C((0, 100, "A"), (100, 900, "B"), (950, 1000, "Après la fin")), 900)) == [(0, 100, "A"), (100, 900, "B")], "repère après la fin du son : ignoré")
ok(P(ai.plan_parts(C((0, 100, "A"), (0, 100, "A bis"), (100, 200, "B")), 200)) == [(0, 100, "A"), (100, 200, "B")], "repères en double : un seul")
ok(ai.plan_parts(C((0, None, "A"), (50, None, "B")), 0) == [], "fin inconnue (durée inconnue) : pas de découpage au hasard")
ok(ai.part_title({"title": "Ma vidéo", "parent_id": "x"}, {"title": "Intro"}, 1) == "Ma vidéo — Intro" and ai.part_title({"title": "Ma vidéo"}, {"title": "Intro"}, 1) == "Intro"
   and ai.part_title({}, {"title": ""}, 3) == "Partie 3", "titres : préfixe seulement dans une playlist ; repère sans titre numéroté")

long = os.path.join(tmp, "long.mp4")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-c:a", "aac", long], check=True)
durs = [round(ai.to_mp3(long, os.path.join(tmp, f"p{i}.mp3"), s0, e0, checked=True), 1) for i, (s0, e0) in enumerate([(0, 4), (4, 9), (9, 12)])]
ok(all(abs(a - b) < 0.2 for a, b in zip(durs, [4, 5, 3])), f"découpage réel au bon endroit ({durs} s)")
print(f"TOUT EST OK ({n} vérifications)")
