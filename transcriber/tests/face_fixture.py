"""Vidéo d'essai pour le suivi du visage : un vrai visage (photo de l'astronaute, domaine public de scikit-image) qui traverse un fond de 1280x720.
make_video(chemin, secondes, trajet) : trajet(t) renvoie la position gauche du visage (pixels) ; None = visage absent à cet instant.
Prérequis : scikit-image, opencv-python-headless, numpy, ffmpeg (uniquement pour les essais, pas pour le service)."""
import subprocess
import cv2
import numpy as np
from skimage import data

W, H, FPS, FACE = 1280, 720, 15, 360


def make_video(path, seconds, pos, second=None):
    """pos(t) -> x gauche du visage principal (ou None). second(t) -> x gauche d'un petit second visage (public) ou None."""
    face = cv2.cvtColor(data.astronaut(), cv2.COLOR_RGB2BGR)
    big = cv2.resize(face, (FACE, FACE))
    small = cv2.resize(face, (FACE // 4, FACE // 4))
    yy, xx = np.mgrid[0:H, 0:W]
    bg = np.dstack([40 + 30 * xx / W, 35 + 25 * yy / H, 60 + 0 * xx]).astype(np.uint8)  # dégradé sombre, sans visage
    p = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-f", "lavfi", "-i", f"sine=frequency=220:duration={seconds}", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
                          "-crf", "20", "-c:a", "aac", "-shortest", "-movflags", "+faststart", path], stdin=subprocess.PIPE)
    for i in range(int(seconds * FPS)):
        t = i / FPS
        f = bg.copy()
        x = pos(t)
        if x is not None:
            x = int(max(0, min(W - FACE, x))); f[100:100 + FACE, x:x + FACE] = big
        if second:
            x2 = second(t)
            if x2 is not None:
                x2 = int(max(0, min(W - FACE // 4, x2))); f[560:560 + FACE // 4, x2:x2 + FACE // 4] = small
        p.stdin.write(f.tobytes())
    p.stdin.close(); p.wait()
    return path
