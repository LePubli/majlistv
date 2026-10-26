"""Tests hors ligne du module external (aucun accès réseau) : python transcriber/tests/test_external.py"""
import json
import os
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import external  # noqa: E402

fails = 0


def ok(cond, msg):
    global fails
    print(("OK   " if cond else "FAIL ") + msg)
    if not cond:
        fails += 1


# --- WebVTT (Vimeo, YouTube) -------------------------------------------------------------------
vtt = """WEBVTT
Kind: captions
Language: fr

00:00:01.000 --> 00:00:03.500
Bonjour à tous,

00:00:03.500 --> 00:00:06.000 align:start position:0%
Bonjour à tous,
<c>bienvenue</c> dans cette conférence.

00:01:02.250 --> 00:01:05.000
Nous parlons de l'&amp;éthique.

1:00:00.000 --> 1:00:02.000
Fin.
"""
cues = external.parse_vtt(vtt)
ok(cues[0] == (1000, 3500, "Bonjour à tous,"), "VTT : premier passage")
ok(cues[1] == (3500, 6000, "bienvenue dans cette conférence."), "VTT : ligne répétée retirée, balises supprimées")
ok(cues[2][0] == 62250 and "l'&éthique" in cues[2][2], "VTT : horodatage minutes et entités HTML")
ok(cues[3][0] == 3600000, "VTT : heures")

# --- json3 (YouTube) ---------------------------------------------------------------------------
j3 = json.dumps({"events": [
    {"tStartMs": 0, "dDurationMs": 4000, "segs": [{"utf8": "Au nom de Dieu,"}]},
    {"tStartMs": 3000, "dDurationMs": 3000, "aAppend": 1, "segs": [{"utf8": "\n"}]},
    {"tStartMs": 3500, "dDurationMs": 5000, "segs": [{"utf8": "le Clément"}, {"utf8": " le Miséricordieux."}]},
    {"tStartMs": 9000},
]})
c = external.parse_json3(j3)
ok(c == [(0, 3500, "Au nom de Dieu,"), (3500, 8500, "le Clément le Miséricordieux.")], f"json3 : événements vides ignorés, chevauchements corrigés {c}")
merged = external.merge_cues([(0, 1000, "bonjour"), (1000, 2000, "à tous"), (2000, 3000, "aujourd'hui."), (3000, 4000, "Nous")])
ok(merged == [(0, 3000, "bonjour à tous aujourd'hui."), (3000, 4000, "Nous")], "sous-titres automatiques regroupés en phrases")

# --- Choix des sous-titres ---------------------------------------------------------------------
info = {
    "subtitles": {"en": [{"ext": "vtt", "url": "u-en"}], "fr-FR": [{"ext": "srv1", "url": "x"}, {"ext": "json3", "url": "u-fr"}], "live_chat": [{"ext": "json", "url": "c"}]},
    "automatic_captions": {"ar": [{"ext": "json3", "url": "a-ar"}], "ar-orig": [{"ext": "json3", "url": "a-ar-orig"}], "fr": [{"ext": "vtt", "url": "a-fr"}]},
}
ok(external.pick_subtitles(info, "fr", True)[0:2] == ("subtitles", "fr-FR") and external.pick_subtitles(info, "fr", True)[2]["url"] == "u-fr", "sous-titres de l'auteur dans la langue déclarée (json3 préféré)")
ok(external.pick_subtitles(info, "ar", False) is None, "arabe sans sous-titres d'auteur, automatiques interdits -> rien")
p = external.pick_subtitles(info, "ar", True)
ok(p[0] == "auto_captions" and p[2]["url"] == "a-ar-orig", "automatiques : piste d'origine (-orig) préférée à la traduction")
ok(external.pick_subtitles({"subtitles": {}}, "de", True) is None, "aucune piste -> rien")

# --- Adresses ----------------------------------------------------------------------------------
ok(external.normalize_list_url("https://www.youtube.com/@MaChaine") == "https://www.youtube.com/@MaChaine/videos", "chaîne -> onglet Vidéos")
ok(external.normalize_list_url("https://www.youtube.com/playlist?list=PL123") == "https://www.youtube.com/playlist?list=PL123", "playlist inchangée")
ok(external.normalize_list_url("https://youtube.com/channel/UCabc/") == "https://youtube.com/channel/UCabc/videos", "chaîne par identifiant")
ok(external.video_url("vimeo", "123") == "https://vimeo.com/123", "adresse Vimeo")
ok(external.video_url("dailymotion", "x8abc12") == "https://www.dailymotion.com/video/x8abc12", "adresse Dailymotion (23a)")

# --- Erreurs lisibles --------------------------------------------------------------------------
e = external.readable_error(Exception("ERROR: [youtube] x: Sign in to confirm you're not a bot"))
ok(isinstance(e, external.Blocked) and "cookies" in str(e), "blocage anti-robot -> message cookies")
ok(isinstance(external.readable_error(Exception("Private video")), external.Blocked), "vidéo privée -> message clair")
ok(not isinstance(external.readable_error(Exception("timeout")), external.Blocked), "autre erreur -> réessai possible")

# --- Liste (faux yt-dlp) -----------------------------------------------------------------------
class FakeYDL:
    calls = []
    def __init__(self, opts): self.opts = opts
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def extract_info(self, url, download=False):
        FakeYDL.calls.append((url, self.opts.get("extract_flat"), self.opts.get("playlistend")))
        if "dailymotion.com/MonCompte" in url:
            return {"_type": "playlist", "title": "Mon Compte", "entries": [
                {"ie_key": "Dailymotion", "id": "x8abc12", "title": "Conférence DM 1", "duration": 1800, "thumbnails": [{"url": "dm1", "width": 480}]},
                {"ie_key": "Dailymotion", "id": "x8abc12", "title": "Doublon"},
                {"ie_key": "Generic", "url": "https://www.dailymotion.com/video/x9zzz99_titre-long", "title": "Via l'adresse"},
                {"ie_key": "Dailymotion", "id": "bad id!", "title": "Identifiant invalide"},
            ]}
        if "playlist" in url or "/videos" in url:
            return {"_type": "playlist", "title": "Ma Chaîne - Videos", "entries": [
                {"ie_key": "Youtube", "id": "aaaaaaaaaaa", "title": "Conférence 1", "duration": 3600.0, "thumbnails": [{"url": "t1", "width": 320}, {"url": "t2", "width": 1280}]},
                {"ie_key": "Youtube", "id": "aaaaaaaaaaa", "title": "Doublon"},
                {"_type": "playlist", "id": "UCshorts", "title": "Shorts"},
                {"ie_key": "Youtube", "id": "bbbbbbbbbbb", "title": "Conférence 2", "duration": None},
                {"url": "https://vimeo.com/76979871", "title": "Vimeo dans la liste"},
            ]}
        return {"id": "ccccccccccc", "extractor_key": "Youtube", "title": "Vidéo seule", "duration": 60}

sys.modules["yt_dlp"] = types.SimpleNamespace(YoutubeDL=FakeYDL)
title, entries = external.list_videos("https://www.youtube.com/@MaChaine", external.ydl_options("/tmp"), 50)
ok(title == "Ma Chaîne" and [x["id"] for x in entries] == ["aaaaaaaaaaa", "bbbbbbbbbbb", "76979871"], f"chaîne : vidéos sans doublon ni onglet, titre nettoyé ({title}, {[x['id'] for x in entries]})")
ok(entries[0]["thumb"] == "t2" and entries[0]["duration"] == 3600 and entries[2]["source"] == "vimeo", "miniature, durée, source détectées")
ok(FakeYDL.calls[-1] == ("https://www.youtube.com/@MaChaine/videos", "in_playlist", 50), "liste à plat, limite transmise")
_, two = external.list_videos("https://www.youtube.com/playlist?list=PL1", external.ydl_options("/tmp"), 2)
ok(len(two) == 2, "limite du nombre de vidéos respectée")
_, single = external.list_videos("https://www.youtube.com/watch?v=ccccccccccc", external.ydl_options("/tmp"), 50)
ok([x["id"] for x in single] == ["ccccccccccc"], "adresse d'une seule vidéo acceptée")

dtitle, dentries = external.list_videos("https://www.dailymotion.com/MonCompte", external.ydl_options("/tmp"), 50)
ok(dtitle == "Mon Compte" and [(x["id"], x["source"]) for x in dentries] == [("x8abc12", "dailymotion"), ("x9zzz99", "dailymotion")], f"compte Dailymotion : sans doublon ni identifiant invalide ({dentries})")
ok(dentries[0]["duration"] == 1800 and dentries[0]["thumb"] == "dm1", "Dailymotion : durée et miniature")
ok(external.normalize_list_url("https://www.dailymotion.com/MonCompte") == "https://www.dailymotion.com/MonCompte", "compte Dailymotion inchangé")

o = external.ydl_options("/tmp/claude-0", cookies="# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc", proxy="http://p:1")
ok(o["cookiefile"] == "/tmp/claude-0/cookies.txt" and oct(os.stat(o["cookiefile"]).st_mode)[-3:] == "600" and o["proxy"] == "http://p:1", "cookies écrits (droits 600) et proxy transmis")
os.remove(o["cookiefile"])

print("TOUT OK" if not fails else f"{fails} ÉCHEC(S)")
sys.exit(1 if fails else 0)
