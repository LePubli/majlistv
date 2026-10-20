"""Doublage Mejliss TV — logique audio sans modèle (testable seule).

Étapes pour une liste de phrases françaises horodatées :
  1. voix de base phrase par phrase (moteur fourni par l'appelant) ;
  2. calage : chaque phrase doit tenir dans son créneau, en empruntant au besoin le silence qui suit (`borrow`),
     sinon elle est accélérée sans changer la hauteur (ffmpeg atempo) jusqu'à `maxSpeedup` ;
  3. conversion de voix par blocs de `vcChunk` secondes (un seul appel par bloc : le coût fixe de chaque appel est élevé) ;
  4. mélange : voix d'origine baissée (`duck` %) sous la voix française, à plein volume pendant les phrases gardées (« # »).
Les phrases dont le texte commence par « # » (verset, hadith, invocation) ne sont jamais lues par la voix de synthèse.
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 24000  # fréquence de travail (celle de la conversion de voix)
FADE_S = 0.08  # fondu de la voix d'origine autour des phrases gardées (évite les claquements)


def is_kept(text):
    return text.lstrip().startswith("#")


def kept(c):
    """Phrase gardée en voix d'origine : marquée dans le Studio (étape D1b) ou texte commençant par « # » (ancienne convention)."""
    return bool(c.get("keep")) or is_kept(c.get("text", ""))


def ffmpeg(*args):
    r = subprocess.run(["ffmpeg", "-y", "-nostdin", "-loglevel", "error", *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError("ffmpeg : " + r.stderr.strip()[-400:])


def write_wav(path, arr, sr=SR):
    a = np.clip(np.asarray(arr, dtype=np.float32), -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((a * 32767).astype("<i2").tobytes())


def read_wav(path):
    with wave.open(path, "rb") as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        if sw != 2:
            raise ValueError("WAV 16 bits attendu")
        a = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32767
        if ch > 1:
            a = a.reshape(-1, ch).mean(axis=1)
        return a, sr


def resample(arr, sr_in, sr_out=SR):
    """Rééchantillonnage : scipy si présent (meilleure qualité), sinon interpolation linéaire."""
    if sr_in == sr_out or len(arr) == 0:
        return np.asarray(arr, dtype=np.float32)
    try:
        from math import gcd

        from scipy.signal import resample_poly

        g = gcd(sr_in, sr_out)
        return resample_poly(arr, sr_out // g, sr_in // g).astype(np.float32)
    except ImportError:
        n = int(round(len(arr) * sr_out / sr_in))
        return np.interp(np.linspace(0, len(arr) - 1, n), np.arange(len(arr)), arr).astype(np.float32)


def load_audio(path, start_s=None, dur_s=None):
    """Décode n'importe quel audio / vidéo en mono SR Hz (éventuellement une portion)."""
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "a.wav")
        cut = (["-ss", f"{start_s:.3f}"] if start_s else []) + (["-t", f"{dur_s:.3f}"] if dur_s else [])
        ffmpeg(*cut, "-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-c:a", "pcm_s16le", out)
        return read_wav(out)[0]


def speed_up(arr, factor):
    """Accélère sans changer la hauteur (atempo, ×0,5 à ×2). factor <= 1 : inchangé."""
    if factor <= 1.001 or len(arr) == 0:
        return arr
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "a.wav"), os.path.join(d, "b.wav")
        write_wav(a, arr)
        ffmpeg("-i", a, "-filter:a", f"atempo={factor:.4f}", b)
        return read_wav(b)[0]


_PITCH_ENGINE = None


def pitch_engine():
    """« rubberband » si ce FFmpeg a le filtre (qualité du changement de hauteur à durée constante), sinon « atempo » (méthode de secours :
    on change la fréquence d'échantillonnage puis on rattrape la durée). Vérifié une fois."""
    global _PITCH_ENGINE
    if _PITCH_ENGINE is None:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True)
        _PITCH_ENGINE = "rubberband" if "rubberband" in (r.stdout or "") else "atempo"
    return _PITCH_ENGINE


def shift_pitch(arr, semitones):
    """Change la hauteur de la voix de `semitones` demi-tons (> 0 plus aigu), sans changer la durée. 0 : inchangé.
    Même longueur en sortie (rembourrée ou coupée de quelques échantillons)."""
    if abs(semitones) < 0.01 or len(arr) == 0:
        return arr
    ratio = 2.0 ** (float(semitones) / 12.0)
    flt = (f"rubberband=pitch={ratio:.6f}:pitchq=quality" if pitch_engine() == "rubberband"
           else f"asetrate={SR * ratio:.2f},aresample={SR},atempo={1.0 / ratio:.6f}")
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "a.wav"), os.path.join(d, "b.wav")
        write_wav(a, arr)
        ffmpeg("-i", a, "-filter:a", flt, "-ar", str(SR), b)
        out = read_wav(b)[0]
    return np.pad(out, (0, max(0, len(arr) - len(out))))[: len(arr)]


def select_cues(cues, kind, preview_s):
    """Phrases à traiter et fenêtre (début, fin) en secondes. Écoute rapide : `preview_s` secondes à partir de la
    première phrase à doubler (0,5 s avant). Doublage complet : toutes les phrases, fenêtre = None."""
    if kind != "preview":
        return cues, None
    first = next((c for c in cues if not kept(c)), None)
    if not first:
        return [], (0.0, 0.0)
    w0 = max(0.0, first["start"] - 0.5)
    w1 = w0 + preview_s
    return [c for c in cues if w0 <= c["start"] < w1], (w0, w1)


def fit_cues(cues, synth, p, offset=0.0, total=None, on_progress=None, should_stop=None, only=None):
    """Voix de base + calage de chaque phrase. Renvoie (pistes placées [(échantillon de départ, audio)], rapport).
    `offset` : début de la fenêtre (secondes) ; `total` : fin de la piste (secondes, relative à la fenêtre).
    `only` (étape D3c) : fonction qui dit si la phrase est à traiter ici (un intervenant à la fois) ; les autres phrases restent pourtant
    comptées pour savoir où commence la phrase suivante."""
    placed, report = [], []
    n = len(cues)
    for i, c in enumerate(cues):
        if should_stop and should_stop():
            raise InterruptedError()
        if only and not only(c):
            continue
        start, end = c["start"] - offset, c["end"] - offset
        slot = max(0.0, end - start)
        row = {"idx": c["idx"], "slot": round(slot, 2)}
        if kept(c):
            row.update(state="kept")
            report.append(row)
            continue
        wav = synth((c.get("say") or c["text"]).strip())  # « say » : texte après le glossaire de prononciation
        raw = len(wav) / SR
        nxt = next((x["start"] - offset for x in cues[i + 1:]), total if total is not None else end + p["borrow"])
        room = min(max(slot, nxt - start - 0.1), slot + p["borrow"])
        need = raw / room if room > 0 else 99
        factor = min(max(need, 1.0), p["maxSpeedup"])
        fit = speed_up(wav, factor)
        overflow = max(0.0, len(fit) / SR - room)
        state = "review" if overflow > 0.05 else ("sped" if factor > 1.001 else "fit")
        row.update(raw=round(raw, 2), speedup=round(factor, 3), overflow=round(overflow, 2), state=state)
        report.append(row)
        placed.append((max(0, int(round(start * SR))), fit))
        if on_progress:
            on_progress((i + 1) / n)
    return placed, report


def assemble(placed, n):
    track = np.zeros(n, dtype=np.float32)
    for s0, w in placed:
        e = min(n, s0 + len(w))
        if e > s0:
            track[s0:e] += w[: e - s0]
    return track


def convert_blocks(placed, n, convert, chunk_s, on_progress=None, should_stop=None):
    """Regroupe les phrases voisines en blocs d'au plus `chunk_s` secondes et convertit chaque bloc en un appel.
    La durée de chaque bloc est conservée : les phrases restent à leur place. Renvoie (piste, nombre de blocs)."""
    if not placed:
        return np.zeros(n, dtype=np.float32), 0
    groups, cur = [], [placed[0]]
    for item in placed[1:]:
        if (item[0] + len(item[1]) - cur[0][0]) / SR <= chunk_s:
            cur.append(item)
        else:
            groups.append(cur)
            cur = [item]
    groups.append(cur)
    out = np.zeros(n, dtype=np.float32)
    for k, g in enumerate(groups):
        if should_stop and should_stop():
            raise InterruptedError()
        g0 = g[0][0]
        g1 = min(n, max(s + len(w) for s, w in g))
        if g1 <= g0:
            continue
        local = np.zeros(g1 - g0, dtype=np.float32)
        for s, w in g:
            e = min(g1, s + len(w))
            local[s - g0: e - g0] += w[: e - s]
        conv = np.asarray(convert(local), dtype=np.float32).reshape(-1)
        conv = np.pad(conv, (0, max(0, len(local) - len(conv))))[: len(local)]
        out[g0:g1] += conv
        if on_progress:
            on_progress((k + 1) / len(groups))
    return out, len(groups)


def duck_gain(n, cues, duck_pct, offset=0.0):
    """Volume de la voix d'origine pour chaque échantillon : `duck_pct` % partout, 100 % pendant les phrases gardées,
    avec un court fondu aux bords."""
    gain = np.full(n, duck_pct / 100.0, dtype=np.float32)
    ramp = max(1, int(FADE_S * SR))
    lo = duck_pct / 100.0
    for c in cues:
        if not kept(c):
            continue
        s0 = max(0, int((c["start"] - offset) * SR))
        s1 = min(n, int((c["end"] - offset) * SR))
        if s1 <= s0:
            continue
        gain[s0:s1] = 1.0
        a0 = max(0, s0 - ramp)
        gain[a0:s0] = np.maximum(gain[a0:s0], np.linspace(lo, 1.0, s0 - a0, endpoint=False))
        a1 = min(n, s1 + ramp)
        gain[s1:a1] = np.maximum(gain[s1:a1], np.linspace(1.0, lo, a1 - s1, endpoint=False))
    return gain


def mix(voice, orig, gain):
    n = len(voice)
    o = np.zeros(n, dtype=np.float32)
    m = min(n, len(orig))
    o[:m] = orig[:m]
    out = voice + o * gain
    peak = float(np.max(np.abs(out))) if n else 0.0
    if peak > 0.98:
        out *= 0.98 / peak
    return out


def normalize(voice):
    peak = float(np.max(np.abs(voice))) if len(voice) else 0.0
    return voice * (0.98 / peak) if peak > 0.98 else voice


def encode_m4a(arr, path):
    """AAC 96 kb/s mono dans un conteneur MP4, lisible par tous les navigateurs."""
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, "a.wav")
        write_wav(w, arr)
        ffmpeg("-i", w, "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", path)


def summarize(report):
    spoken = [r for r in report if r["state"] != "kept"]
    return {
        "phrases": len(report), "kept": len(report) - len(spoken),
        "review": sum(1 for r in spoken if r["state"] == "review"),
        "sped": sum(1 for r in spoken if r["state"] == "sped"),
        "speedupMean": round(sum(r["speedup"] for r in spoken) / len(spoken), 3) if spoken else None,
    }
