"""Étape E5d : lecture des images d'un passage de vidéo et détection des visages (OpenCV + modèle YuNet, sur le processeur, sans réseau).
La détection est séparée de main.py pour pouvoir être essayée seule (tests/run_track_once.py, tests/test_faces.py)."""
import glob
import os
import subprocess

import cv2

import track

MODEL = os.environ.get("FACE_MODEL", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models", "face_detection_yunet_2023mar.onnx"))
FRAME_W = 640           # largeur des images examinées (le détecteur n'a pas besoin de plus)
MIN_FACE = 0.02         # un visage plus étroit que 2 % de la largeur est ignoré (public lointain, affiche)
SCORE = 0.7


def extract_frames(src, start, duration, outdir, fps=track.SAMPLE_FPS):
    """Écrit une image JPEG tous les 1/fps seconde du passage [start, start + duration] (src : fichier ou adresse https)."""
    os.makedirs(outdir, exist_ok=True)
    subprocess.run(
        ["nice", "-n", "10", "ffmpeg", "-y", "-nostdin", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", src,
         "-an", "-vf", f"fps={fps},scale={FRAME_W}:-2", "-q:v", "4", os.path.join(outdir, "%05d.jpg")],
        check=True, capture_output=True, text=True,
    )
    return sorted(glob.glob(os.path.join(outdir, "*.jpg")))


MOUTH_W, MOUTH_H = 24, 14  # taille de la petite image de la bouche comparée d'une image à l'autre (registre n°32)


def mouth_patch(gray, d):
    """Petite image normalisée de la bouche (et du menton) d'un visage détecté, en liste de nombres ; None si hors image.
    Repères YuNet : d[10], d[11] = coin droit de la bouche ; d[12], d[13] = coin gauche."""
    try:
        x1, y1, x2, y2 = float(d[10]), float(d[11]), float(d[12]), float(d[13])
    except (IndexError, TypeError, ValueError):
        return None
    mw = max(4.0, abs(x2 - x1)); cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    a, b = int(cx - 0.8 * mw), int(cx + 0.8 * mw)
    c, e = int(cy - 0.45 * mw), int(cy + 0.75 * mw)
    hh, ww = gray.shape[:2]
    if a < 0 or c < 0 or b > ww or e > hh or b - a < 6 or e - c < 4:
        return None
    crop = cv2.resize(gray[c:e, a:b], (MOUTH_W, MOUTH_H), interpolation=cv2.INTER_AREA).astype("float32")
    sd = float(crop.std())
    if sd < 1e-3:
        return None
    return [round(float(v), 3) for v in ((crop - crop.mean()) / sd).ravel()]


def detect(paths, fps=track.SAMPLE_FPS, progress=None, should_stop=None):
    """Détecte les visages de chaque image. Renvoie (samples, largeur, hauteur) ; samples = [(t, [(centre, surface, confiance, bouche)])],
    t depuis le début du passage ; bouche = petite image normalisée (pour savoir qui parle, registre n°32)."""
    if not paths:
        return [], 0, 0
    first = cv2.imread(paths[0])
    if first is None:
        raise RuntimeError("image illisible")
    h, w = first.shape[:2]
    det = cv2.FaceDetectorYN.create(MODEL, "", (w, h), SCORE, 0.3, 50)
    samples = []
    for i, p in enumerate(paths):
        if should_stop and should_stop():
            raise InterruptedError()
        img = cv2.imread(p)
        faces = []
        if img is not None and img.shape[:2] == (h, w):
            _, found = det.detect(img)
            if found is not None:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                faces = track.pick_face([d for d in found if d[2] / w >= MIN_FACE], w, h, mouth_of=lambda d: mouth_patch(gray, d))
        samples.append((i / fps, faces))
        if progress and (i % 15 == 0 or i == len(paths) - 1):
            progress(int(100 * (i + 1) / len(paths)))
    return samples, w, h
