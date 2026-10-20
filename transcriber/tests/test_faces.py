"""Étape E5d : vraie détection (OpenCV + YuNet) sur une vidéo d'essai, de bout en bout jusqu'aux points clés. Prérequis : scikit-image, ffmpeg.
Lancement (depuis transcriber/) : python3 tests/test_faces.py"""
import os, shutil, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "src")); sys.path.insert(0, HERE)
import faces, track
from face_fixture import make_video, W, H, FACE

bad = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: bad.append(m)
def at(keys, t):
    if t <= keys[0]["t"]: return keys[0]["x"]
    for a, b in zip(keys, keys[1:]):
        if a["t"] <= t <= b["t"]: return a["x"] + (b["x"] - a["x"]) * ((t - a["t"]) / (b["t"] - a["t"]) if b["t"] != a["t"] else 0)
    return keys[-1]["x"]

d = tempfile.mkdtemp()
try:
    ok(os.path.isfile(faces.MODEL) and os.path.getsize(faces.MODEL) == 232589, "modèle YuNet présent (232 589 octets)")
    # Visage immobile au centre de l'image 16:9
    v1 = make_video(f"{d}/fixe.mp4", 8, lambda t: (W - FACE) / 2)
    paths = faces.extract_frames(v1, 0, 8, f"{d}/f1")
    ok(len(paths) in (24, 25), f"{len(paths)} images examinées pour 8 s (3 par seconde)")
    samples, w, h = faces.detect(paths)
    ok((w, h) == (640, 360), f"images de {w}x{h} (largeur 640, rapport 16:9 gardé)")
    seen = sum(1 for _, f in samples if f)
    ok(seen >= len(samples) - 1, f"visage repéré sur {seen} images sur {len(samples)}")
    cx = [f[0][0] for _, f in samples if f]
    ok(all(abs(c - 0.5) < 0.03 for c in cx), f"centre du visage ≈ 0,5 (mesuré {min(cx):.3f} à {max(cx):.3f})")
    r = track.build_track(samples, w, h, 100.0)
    import json; json.dumps(r["keys"])  # doit être enregistrable en JSON
    ok(r and all(abs(k["x"] - 50) < 3 for k in r["keys"]), f"visage au centre → cadre à 50 % : {r['keys'] if r else None}")
    # Visage qui traverse de gauche à droite (de 50 à 870 px en 12 s)
    v2 = make_video(f"{d}/marche.mp4", 12, lambda t: 50 + 820 * t / 12)
    samples, w, h = faces.detect(faces.extract_frames(v2, 0, 12, f"{d}/f2"))
    r = track.build_track(samples, w, h, 0.0)
    ks = r["keys"]
    ok(r["coverage"] > 0.9, f"visage repéré {r['coverage'] * 100:.0f} % du temps en marche")
    ok(at(ks, 1) < 15 and at(ks, 11) > 75 and at(ks, 6) > at(ks, 2), f"le cadre suit : {at(ks, 1):.0f} % → {at(ks, 6):.0f} % → {at(ks, 11):.0f} %")
    # Passage pris au milieu de la vidéo : temps exprimés dans la vidéo d'origine
    samples, w, h = faces.detect(faces.extract_frames(v2, 4, 6, f"{d}/f3"))
    r = track.build_track(samples, w, h, 4.0)
    ok(abs(r["keys"][0]["t"] - 4.0) < 0.01 and r["keys"][-1]["t"] <= 10.01, f"passage 4–10 s : points clés de {r['keys'][0]['t']} à {r['keys'][-1]['t']} s")
    ok(30 < at(r["keys"], 4.2) < 60 and at(r["keys"], 9.8) > 65, f"position au début du passage {at(r['keys'], 4.2):.0f} %, à la fin {at(r['keys'], 9.8):.0f} %")
    # Un grand visage et un petit au fond : on suit le grand
    v3 = make_video(f"{d}/public.mp4", 8, lambda t: 100, second=lambda t: 1100)
    samples, w, h = faces.detect(faces.extract_frames(v3, 0, 8, f"{d}/f4"))
    r = track.build_track(samples, w, h, 0.0)
    ok(r["keys"] and all(k["x"] < 20 for k in r["keys"]), f"grand visage à gauche, petit à droite : cadre à gauche {[k['x'] for k in r['keys']]}")
    # Pas de visage
    v4 = make_video(f"{d}/vide.mp4", 6, lambda t: None)
    samples, w, h = faces.detect(faces.extract_frames(v4, 0, 6, f"{d}/f5"))
    ok(track.build_track(samples, w, h, 0.0) is None, "vidéo sans visage : pas de trajectoire (le cadre restera fixe)")
finally:
    shutil.rmtree(d, ignore_errors=True)
print("\n" + ("Tout est bon" if not bad else f"{len(bad)} échec(s)"))
sys.exit(1 if bad else 0)
