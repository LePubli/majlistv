"""Registre n°32 : vraie détection (OpenCV + YuNet) sur des images d'essai : deux vrais visages côte à côte, la bouche de l'un s'ouvre
et se ferme (il parle) ; au milieu, c'est l'autre qui parle. Le cadre doit suivre celui qui parle.
Prérequis : scikit-image, opencv-python-headless, numpy. Lancement (depuis transcriber/) : python3 tests/test_speaker_faces.py"""
import os, random, shutil, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "src")); sys.path.insert(0, HERE)
import cv2
import numpy as np
from skimage import data
import faces, track

bad = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: bad.append(m)

W, H, F = 1280, 720, 300
face = cv2.resize(cv2.cvtColor(data.astronaut(), cv2.COLOR_RGB2BGR), (F, F))
# Coins de la bouche sur ce visage (repères YuNet), pour dessiner une bouche qui s'ouvre.
det = cv2.FaceDetectorYN.create(faces.MODEL, "", (F, F), 0.6, 0.3, 5)
_, found = det.detect(face)
ok(found is not None and len(found) == 1, "visage d'essai détecté")
mx, my = (found[0][10] + found[0][12]) / 2, (found[0][11] + found[0][13]) / 2
mw = abs(found[0][12] - found[0][10])
yy, xx = np.mgrid[0:H, 0:W]
bg = np.dstack([40 + 30 * xx / W, 35 + 25 * yy / H, 60 + 0 * xx]).astype(np.uint8)
rnd = random.Random(3)

def frame(left_open, right_open):
    f = bg.copy()
    for x0, o in ((140, left_open), (W - 140 - F, right_open)):
        img = face.copy()
        if o > 0:
            cv2.ellipse(img, (int(mx), int(my + 0.12 * mw)), (int(0.42 * mw), max(1, int(o * 0.45 * mw))), 0, 0, 360, (20, 10, 30), -1)
        f[200:200 + F, x0:x0 + F] = img
    return f

d = tempfile.mkdtemp(prefix="spk-")
try:
    secs = 18; n = int(secs * track.SAMPLE_FPS); paths = []
    for i in range(n):
        t = i / track.SAMPLE_FPS
        left = 6 <= t < 12  # la gauche parle au milieu ; la droite au début et à la fin
        o_talk = rnd.choice([0.0, 0.3, 0.7, 1.0])
        p = os.path.join(d, f"{i:05d}.jpg"); cv2.imwrite(p, frame(o_talk if left else 0.0, 0.0 if left else o_talk)); paths.append(p)
    samples, w, h = faces.detect(paths)
    seen2 = sum(1 for _, fs in samples if len(fs) == 2)
    ok(seen2 >= 0.9 * len(samples), f"deux visages vus sur {seen2}/{len(samples)} images")
    ok(all(len(f) == 4 and f[3] is not None for _, fs in samples for f in fs), "chaque visage a sa petite image de bouche")
    r = track.build_track(samples, w, h, start=0.0)
    ks = r["keys"]
    at = lambda t: next((k["x"] for k in ks if k["t"] >= t), ks[-1]["x"])
    ok(r["mode"] == "speaker", f"mode : {r['mode']}")
    ok(at(4) > 70, f"début : la droite parle, cadre à droite ({at(4):.0f})")
    ok(at(11.5) < 30, f"milieu : la gauche parle, cadre à gauche ({at(11.5):.0f})")
    ok(at(17.5) > 70, f"fin : la droite reparle, cadre à droite ({at(17.5):.0f})")
    ok(r["switches"] == 2, f"deux changements de personne ({r['switches']})")
finally:
    shutil.rmtree(d, ignore_errors=True)
print("\n" + ("Tout est bon" if not bad else f"{len(bad)} échec(s)"))
sys.exit(1 if bad else 0)
