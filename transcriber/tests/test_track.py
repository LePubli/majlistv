"""Étape E5d : calcul de la trajectoire du cadre (src/track.py). Aucun modèle, aucune vidéo.
Lancement (depuis transcriber/) : python3 tests/test_track.py"""
import math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))
import track

bad = []
def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: bad.append(m)

FPS = track.SAMPLE_FPS
def times(secs): return [i / FPS for i in range(int(secs * FPS))]
def one(cx, area=0.05, score=0.95): return [(cx, area, score)]
def run(secs, fn, w=1920, h=1080, start=0.0):
    return track.build_track([(t, fn(t)) for t in times(secs)], w, h, start)
def at(keys, t):
    """Valeur de la trajectoire à l'instant t (ligne droite entre les points clés)."""
    if t <= keys[0]["t"]: return keys[0]["x"]
    for a, b in zip(keys, keys[1:]):
        if a["t"] <= t <= b["t"]:
            return a["x"] + (b["x"] - a["x"]) * ((t - a["t"]) / (b["t"] - a["t"]) if b["t"] != a["t"] else 0)
    return keys[-1]["x"]

# 1) Partage du cadre et passage en pourcentage
ok(abs(track.frame_share(1920, 1080) - 0.31640625) < 1e-9, "cadre 9:16 sur du 16:9 : 31,6 % de la largeur")
ok(track.frame_share(1080, 1920) == 1.0 and track.frame_share(1000, 1000) == 0.5625, "vidéo déjà verticale : tout le cadre ; carrée : 56 %")
s = track.frame_share(1920, 1080)
ok(track.to_percent(0.5, s) == 50.0 and track.to_percent(s / 2, s) == 0.0 and abs(track.to_percent(1 - s / 2, s) - 100.0) < 1e-6, "centre / bord gauche / bord droit → 50 / 0 / 100")
ok(track.to_percent(0.3, 1.0) == 50.0, "vidéo verticale : pas de place pour bouger, cadre à 50")

# 2) Visage immobile au centre : cadre immobile, très peu de points
r = run(20, lambda t: one(0.5))
ok(r and all(abs(k["x"] - 50) < 0.6 for k in r["keys"]) and len(r["keys"]) <= 3, f"visage immobile au centre : cadre à 50, {len(r['keys'])} points")
ok(r["coverage"] == 1.0 and r["faces"] == 1, "couverture 100 %, une personne")

# 3) Visage immobile à gauche : le cadre se cale à gauche sans dépasser
r = run(10, lambda t: one(0.1))
ok(all(k["x"] == 0.0 for k in r["keys"]), "visage au bord gauche : cadre à 0 (jamais négatif)")
r = run(10, lambda t: one(0.95))
ok(all(k["x"] == 100.0 for k in r["keys"]), "visage au bord droit : cadre à 100 (jamais plus)")

# 4) Petits mouvements dans la zone morte : cadre immobile
random.seed(1)
r = run(30, lambda t: one(0.5 + random.uniform(-0.02, 0.02)))
ok(max(k["x"] for k in r["keys"]) - min(k["x"] for k in r["keys"]) < 1.0, "agitation du visage dans la zone morte : le cadre ne bouge pas")

# 5) Le visage traverse l'écran : le cadre le suit sans le perdre, à vitesse limitée
r = run(20, lambda t: one(0.3 + 0.4 * min(1, t / 20)))
ks = r["keys"]
ok(at(ks, 19.5) > at(ks, 10) > at(ks, 1), "visage de 30 % à 70 % de la largeur : le cadre avance")
ok(at(ks, 19.9) > 55, f"fin de course : cadre à {at(ks, 19.9):.0f} % (vers la droite)")
sp = max(abs(at(ks, t + 0.5) - at(ks, t)) / 100 * (1 - s) / 0.5 for t in [i * 0.5 for i in range(38)])
ok(sp <= track.MAX_SPEED + 0.02, f"vitesse du cadre ≤ {track.MAX_SPEED} largeur/s (mesuré {sp:.3f})")

# 6) Saut brusque (le conférencier change de côté) : rattrapage doux, pas de téléportation
r = run(20, lambda t: one(0.25 if t < 8 else 0.75))
ks = r["keys"]
ok(at(ks, 7) < 15 and at(ks, 19.5) > 80, "changement de côté : cadre à gauche puis à droite")
jump = max(abs(at(ks, t + 0.34) - at(ks, t)) for t in [i * 0.34 for i in range(55)])
ok(jump < 14, f"pas de téléportation (écart maxi {jump:.1f} points en 0,34 s)")

# 7) Deux personnes : on suit la plus grande, pas celle du public
r = run(20, lambda t: [(0.35, 0.06, 0.95), (0.9, 0.004, 0.9)])
ok(all(k["x"] < 40 for k in r["keys"]) and r["faces"] == 2, "grand visage à gauche + petit au fond à droite : suivi du grand")
# Elle est plus présente que l'autre même si l'autre est plus grande 2 secondes
r = run(20, lambda t: [(0.3, 0.03, 0.95)] + ([(0.8, 0.08, 0.95)] if 5 <= t < 7 else []))
ok(max(k["x"] for k in r["keys"]) < 30, "un visage passager plus grand ne vole pas le suivi")

# 8) Trous de détection
def gap(t): return [] if 8 <= t < 9 else one(0.3 + 0.2 * (t / 20))
r = run(20, gap)
ok(r is not None and max(abs(at(r["keys"], t + 0.33) - at(r["keys"], t)) for t in [i * 0.33 for i in range(58)]) < 6, "trou d'une seconde : pas de saut")
def lost(t): return [] if 5 <= t < 15 else one(0.2 if t < 5 else 0.8)
r = run(20, lost)
ok(r is not None and 0 <= at(r["keys"], 10) <= 100, "visage perdu 10 s puis retrouvé ailleurs : trajectoire valide")

# 9) Pas de visage / trop peu de visage
ok(run(10, lambda t: []) is None, "aucun visage : pas de trajectoire")
ok(run(20, lambda t: one(0.5) if t < 1 else []) is None, "visage vu moins de 15 % du temps : pas de trajectoire")
ok(track.build_track([(0.0, one(0.5))], 1920, 1080) is None, "une seule image : pas de trajectoire")

# 10) Nombre de points clés borné, temps décalés par le début du passage
random.seed(2)
r = run(120, lambda t: one(0.5 + 0.3 * math.sin(t / 4) + random.uniform(-0.03, 0.03)), start=100.0)
ok(len(r["keys"]) <= track.MAX_KEYS, f"trajectoire de 2 minutes mouvementée : {len(r['keys'])} points ≤ {track.MAX_KEYS}")
ok(abs(r["keys"][0]["t"] - 100.0) < 0.01 and r["keys"][-1]["t"] > 218, "temps exprimés dans la vidéo d'origine (début 100 s)")
ok(all(a["t"] < b["t"] for a, b in zip(r["keys"], r["keys"][1:])), "points clés strictement dans l'ordre du temps")

# 11) Détections brutes d'OpenCV
d = [10, 20, 100, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9]
f = track.pick_face([d, [0, 0, 0, 5] + [0] * 10 + [0.9]], 1000, 500)
ok(len(f) == 1 and abs(f[0][0] - 0.06) < 1e-9 and abs(f[0][1] - 0.024) < 1e-9 and f[0][2] == 0.9, "détection brute → (centre, surface, confiance) ; largeur nulle ignorée")

import json
ok(json.dumps(r["keys"]) and all(type(k["t"]) is float and type(k["x"]) is float for k in r["keys"]), "points clés en nombres Python purs (enregistrables en JSON)")

print("\n" + ("Tout est bon" if not bad else f"{len(bad)} échec(s)"))
sys.exit(1 if bad else 0)
