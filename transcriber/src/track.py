"""Étape E5d : trajectoire du cadre vertical (9:16) à partir des visages détectés dans la vidéo.

Ce module ne contient que du calcul (aucune vidéo, aucun modèle) : il est testé à part (tests/test_track.py).
Entrée : pour chaque image examinée, les visages vus : (centre horizontal en part de la largeur 0..1, surface en part de l'image, confiance).
Sortie : des points clés [{"t": secondes, "x": 0..100}] où x est la position du cadre (0 = tout à gauche, 100 = tout à droite),
la même échelle que « cropX » d'un extrait (étape E5b).

Règles (décision d'Epok du 20/10) : on suit le visage le plus grand et le plus stable ; le cadre bouge comme un cadreur :
il reste immobile tant que le visage reste dans une zone centrale, puis le rattrape en douceur, sans secousses.
"""
import math

SAMPLE_FPS = 3          # images examinées par seconde de vidéo
MAX_KEYS = 60           # points clés gardés au plus (l'expression FFmpeg reste courte)
SECOND_RATIO = 0.25     # une autre personne n'est suivie en l'absence de la principale que si elle pèse au moins ce quart
MIN_COVERAGE = 0.15     # en dessous, on considère qu'il n'y a pas de visage à suivre
LINK_JUMP = 0.12        # un visage qui bouge de plus de 12 % de la largeur entre deux images n'est pas la même personne
LINK_GAP = 1.5          # secondes : au-delà, une personne disparue puis revenue compte comme une autre
FILL_GAP = 2.0          # secondes : on comble un trou de détection plus court en traçant une ligne droite ; au-delà on garde la position
DEAD_ZONE = 0.12        # part de la largeur du cadre où le visage peut bouger sans que le cadre ne bouge
FOLLOW_RATE = 3.0       # « raideur » du rattrapage (par seconde)
MAX_SPEED = 0.25        # vitesse maxi du cadre, en parts de la largeur de l'image par seconde


def frame_share(width, height):
    """Part de la largeur de l'image occupée par le cadre 9:16 (le cadre garde toute la hauteur)."""
    if width <= 0 or height <= 0:
        return 1.0
    return min(1.0, (height * 9 / 16) / width)


def link_faces(samples):
    """Relie les visages d'une image à l'autre. samples : [(t, [(cx, area, score), ...]), ...] triés par temps.
    Renvoie des pistes : [{"pts": [(t, cx)], "weight": float}] (weight = somme surface × confiance : « le plus grand et le plus présent »)."""
    tracks = []
    for t, faces in samples:
        used = set()
        for cx, area, score in sorted(faces, key=lambda f: -f[1]):
            best, best_d = None, None
            for k, tr in enumerate(tracks):
                if k in used:
                    continue
                lt, lcx = tr["pts"][-1]
                if t - lt > LINK_GAP:
                    continue
                d = abs(cx - lcx)
                if d <= LINK_JUMP * max(1.0, (t - lt) * SAMPLE_FPS) and (best_d is None or d < best_d):
                    best, best_d = k, d
            if best is None:
                tracks.append({"pts": [(t, cx)], "weight": area * score})
                used.add(len(tracks) - 1)
            else:
                tracks[best]["pts"].append((t, cx))
                tracks[best]["weight"] += area * score
                used.add(best)
    return tracks


def main_series(samples):
    """Position de la personne à suivre à chaque image examinée (None si personne) + part d'images où l'on voit quelqu'un.
    On suit la personne principale (la plus grande et la plus présente). Si elle n'est pas là (changement de plan, elle sort du champ),
    on passe à une autre personne, mais seulement si elle compte vraiment (au moins SECOND_RATIO du poids de la principale, 3 images) :
    un petit visage du public ne prend jamais le cadre."""
    tracks = [tr for tr in link_faces(samples) if len(tr["pts"]) >= 3]
    if not tracks:
        return [None] * len(samples), 0.0
    tracks.sort(key=lambda tr: -tr["weight"])
    keep = [dict(tr["pts"]) for tr in tracks if tr["weight"] >= SECOND_RATIO * tracks[0]["weight"]]
    series = []
    for t, _ in samples:
        series.append(next((seen[t] for seen in keep if t in seen), None))
    return series, (sum(1 for v in series if v is not None) / len(series) if series else 0.0)


def fill_gaps(times, series):
    """Comble les trous : ligne droite entre deux détections proches, sinon on garde la dernière position connue."""
    out = list(series)
    known = [i for i, v in enumerate(series) if v is not None]
    if not known:
        return out
    for i in range(len(out)):
        if out[i] is not None:
            continue
        prev = max((k for k in known if k < i), default=None)
        nxt = min((k for k in known if k > i), default=None)
        if prev is None:
            out[i] = series[nxt]
        elif nxt is None:
            out[i] = series[prev]
        elif times[nxt] - times[prev] <= FILL_GAP:
            a = (times[i] - times[prev]) / (times[nxt] - times[prev])
            out[i] = series[prev] + (series[nxt] - series[prev]) * a
        else:
            out[i] = series[prev]
    return out


def median3(v):
    """Médiane glissante sur 3 valeurs : enlève une détection isolée qui sauterait."""
    if len(v) < 3:
        return list(v)
    return [v[0]] + [sorted(v[i - 1:i + 2])[1] for i in range(1, len(v) - 1)] + [v[-1]]


def operator_path(times, target, share):
    """Cadreur : position du centre du cadre (part de la largeur) à chaque instant, avec zone morte, rattrapage doux et vitesse limitée."""
    lo, hi = share / 2, 1 - share / 2
    clamp = lambda p: max(lo, min(hi, p))
    dz = share * DEAD_ZONE
    p = clamp(target[0])
    out = [p]
    for i in range(1, len(times)):
        dt = max(1e-3, times[i] - times[i - 1])
        tg = target[i]
        if tg > p + dz:
            goal = tg - dz / 2
        elif tg < p - dz:
            goal = tg + dz / 2
        else:
            goal = p
        step = (goal - p) * min(1.0, FOLLOW_RATE * dt)
        lim = MAX_SPEED * dt
        p = clamp(p + max(-lim, min(lim, step)))
        out.append(p)
    return out


def to_percent(p, share):
    """Centre du cadre (part de la largeur) → position cropX 0..100."""
    free = 1 - share
    if free <= 1e-6:
        return 50.0
    return max(0.0, min(100.0, (p - share / 2) / free * 100))


def simplify(points, eps):
    """Ramer-Douglas-Peucker sur [(t, x)] : garde les points qui comptent."""
    if len(points) < 3:
        return list(points)
    (t0, x0), (t1, x1) = points[0], points[-1]
    worst, wi = -1.0, 0
    for i in range(1, len(points) - 1):
        t, x = points[i]
        ex = x0 + (x1 - x0) * ((t - t0) / (t1 - t0) if t1 != t0 else 0)
        d = abs(x - ex)
        if d > worst:
            worst, wi = d, i
    if worst <= eps:
        return [points[0], points[-1]]
    return simplify(points[:wi + 1], eps)[:-1] + simplify(points[wi:], eps)


def keyframes(times, xs, max_keys=MAX_KEYS):
    """Réduit la trajectoire à quelques points clés (au plus max_keys)."""
    pts = list(zip(times, xs))
    eps = 0.8
    keys = simplify(pts, eps)
    while len(keys) > max_keys:
        eps *= 1.5
        keys = simplify(pts, eps)
    return [{"t": round(float(t), 2), "x": round(float(x), 1)} for t, x in keys]


def build_track(samples, width, height, start=0.0):
    """Calcule la trajectoire. samples : [(t, faces)] avec t en secondes depuis le début du passage ; start : début du passage dans la vidéo.
    Renvoie {"keys": [{"t", "x"}] (t en secondes de la vidéo d'origine), "coverage": 0..1, "faces": nombre de personnes distinctes vues,
    "samples": n} ou None s'il n'y a pas assez de visage à suivre."""
    if len(samples) < 2:
        return None
    share = frame_share(width, height)
    times = [t for t, _ in samples]
    series, coverage = main_series(samples)
    if coverage < MIN_COVERAGE:
        return None
    target = median3(fill_gaps(times, series))
    path = operator_path(times, target, share)
    keys = keyframes([start + t for t in times], [to_percent(p, share) for p in path])
    tracks = [tr for tr in link_faces(samples) if len(tr["pts"]) >= 3]
    return {"keys": keys, "coverage": round(coverage, 3), "faces": max(1, len(tracks)), "samples": len(samples)}


def pick_face(detections, width, height):
    """Convertit les détections brutes d'OpenCV (x, y, largeur, hauteur, …, confiance) en (centre, surface, confiance)."""
    out = []
    for d in detections:
        x, y, w, h, score = (float(v) for v in (d[0], d[1], d[2], d[3], d[14] if len(d) > 14 else d[-1]))  # nombres Python purs (JSON)
        if w <= 0 or h <= 0:
            continue
        out.append(((x + w / 2) / width, (w * h) / (width * height), float(score)))
    return out
