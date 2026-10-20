"""Étape D3c — « Détecter les intervenants » : qui parle à quel moment, d'après la VOIX (pas le texte).

Principe : pour chaque phrase du texte (celles du doublage), on calcule une « empreinte de voix » (vecteur) avec un petit modèle de
reconnaissance de locuteur (sherpa-onnx, processeur seul), puis on regroupe les phrases dont les empreintes se ressemblent.
Chaque groupe = un intervenant. On estime aussi la hauteur moyenne de chaque voix (F0) pour SUGGÉRER une catégorie (homme, femme, enfant) :
ce n'est qu'une suggestion, à vérifier à l'oreille.

Fonctions pures (aucune base, aucun modèle) : `cluster`, `detect`, `f0`, `guess_category` — testées dans transcriber/tests/test_speakers.py.
Le modèle est dans `Embedder` (chargé à la demande, téléchargé une fois dans MODELS_DIR).
"""
import os
import urllib.request

import numpy as np

# Modèle d'empreinte de voix (ONNX, ~40 Mo) publié avec sherpa-onnx. Modifiable par la variable SPEAKER_MODEL_URL.
MODEL_FILE = "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"
MODEL_URL = ("https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/" + MODEL_FILE)
SR = 16000

MIN_EMBED_S = 1.2     # une phrase plus courte n'a pas d'empreinte fiable : elle prend la voix de sa voisine
MAX_EMBED_S = 20.0    # au-delà, on n'écoute que les 20 premières secondes de la phrase
MAX_CLUSTER = 1500    # nombre maximal de phrases regroupées une à une (les autres sont rattachées ensuite)
MIN_SHARE = 0.04      # un groupe qui parle moins de 4 % du temps (et moins de 20 s) est rattaché au plus proche
MIN_SECONDS = 20.0


def _unit(m):
    m = np.asarray(m, dtype=np.float64)
    n = np.linalg.norm(m, axis=-1, keepdims=True)
    return m / np.maximum(n, 1e-12)


def cluster(embs, weights, threshold=0.5, max_speakers=6):
    """Regroupement par fusions successives (distance entre centres, cosinus). Renvoie un tableau d'étiquettes 0..k-1,
    rangées de la voix qui parle le plus (0) à celle qui parle le moins. On fusionne tant que deux groupes se ressemblent au moins
    autant que `threshold`, ou tant qu'il y en a plus de `max_speakers`. Les petits groupes sont rattachés au plus proche."""
    X = _unit(embs)
    n = len(X)
    if n == 0:
        return np.zeros(0, dtype=int)
    w = np.asarray(weights, dtype=np.float64)
    C = X * w[:, None]
    W = w.copy()
    alive = np.ones(n, dtype=bool)
    label = np.arange(n)
    S = _unit(C) @ _unit(C).T
    np.fill_diagonal(S, -np.inf)

    def merge(i, j):
        nonlocal S
        C[i] += C[j]
        W[i] += W[j]
        alive[j] = False
        label[label == j] = i
        S[j, :] = -np.inf
        S[:, j] = -np.inf
        row = _unit(C[i]) @ _unit(C).T
        row[~alive] = -np.inf
        row[i] = -np.inf
        S[i, :] = row
        S[:, i] = row

    while alive.sum() > 1:
        k = int(np.argmax(S))
        i, j = divmod(k, n)
        if S[i, j] < threshold and alive.sum() <= max_speakers:
            break
        merge(min(i, j), max(i, j))
    # petits groupes (toux, bruit, voix lointaine) : rattachés au plus proche
    total = W[alive].sum()
    while alive.sum() > 1:
        ids = np.flatnonzero(alive)
        small = [i for i in ids if W[i] < MIN_SHARE * total and W[i] < MIN_SECONDS]
        if not small:
            break
        i = min(small, key=lambda x: W[x])
        j = int(np.argmax(np.where(alive, S[i], -np.inf)))
        merge(min(i, j), max(i, j))
    ids = list(np.flatnonzero(alive))
    ids.sort(key=lambda i: -W[i])
    remap = {int(i): r for r, i in enumerate(ids)}
    return np.array([remap[int(label[x])] for x in range(n)], dtype=int)


def detect(phrases, embs, threshold=0.5, max_speakers=6, smooth_margin=0.08):
    """phrases : [(idx, début_ms, fin_ms)] dans l'ordre ; embs : {idx: vecteur} pour les phrases assez longues.
    Renvoie ({idx: numéro d'intervenant (1, 2, 3…)}, [{n, seconds, phrases}]) — 1 = celui qui parle le plus."""
    dur = {idx: max(0.0, (e - s) / 1000.0) for idx, s, e in phrases}
    have = [idx for idx, _, _ in phrases if idx in embs]
    if not have:
        return {idx: 1 for idx, _, _ in phrases}, ([{"n": 1, "seconds": round(sum(dur.values()), 1), "phrases": len(phrases)}] if phrases else [])
    # Regroupement sur les phrases les plus longues (au plus MAX_CLUSTER), puis rattachement de toutes les autres au centre le plus proche.
    core = sorted(have, key=lambda i: -dur[i])[:MAX_CLUSTER]
    core.sort()
    lab = cluster([embs[i] for i in core], [dur[i] for i in core], threshold, max_speakers)
    k = int(lab.max()) + 1
    cent = np.zeros((k, len(embs[core[0]])))
    for i, l in zip(core, lab):
        cent[l] += _unit(embs[i]) * dur[i]
    cent = _unit(cent)
    sim = {i: _unit(embs[i]) @ cent.T for i in have}
    out, prev = {}, None
    for idx, _, _ in phrases:
        if idx in sim:
            out[idx] = int(np.argmax(sim[idx])) + 1
        else:
            out[idx] = prev  # phrase trop courte : voix de la précédente (la suivante pour les toutes premières)
        prev = out[idx]
    first = next((v for v in out.values() if v is not None), 1)
    out = {i: (v if v is not None else first) for i, v in out.items()}
    # Lissage : une phrase isolée dont l'empreinte ne tranche pas nettement revient à la voix de ses deux voisines.
    ids = [i for i, _, _ in phrases]
    for a in range(1, len(ids) - 1):
        i = ids[a]
        p, q = out[ids[a - 1]], out[ids[a + 1]]
        if p == q != out[i] and i in sim:
            s = sim[i]
            if s[p - 1] >= s[out[i] - 1] - smooth_margin:
                out[i] = p
    secs = {}
    cnt = {}
    for idx, _, _ in phrases:
        secs[out[idx]] = secs.get(out[idx], 0.0) + dur[idx]
        cnt[out[idx]] = cnt.get(out[idx], 0) + 1
    # renumérote : 1 = celui qui parle le plus
    order = sorted(secs, key=lambda n: -secs[n])
    ren = {n: r + 1 for r, n in enumerate(order)}
    out = {i: ren[v] for i, v in out.items()}
    return out, [{"n": ren[n], "seconds": round(secs[n], 1), "phrases": cnt[n]} for n in order]


def f0(samples, sr=SR, lo=70.0, hi=400.0):
    """Hauteur moyenne (Hz) d'une voix : autocorrélation sur des fenêtres de 40 ms, médiane des fenêtres voisées. None si trop peu de voix."""
    x = np.asarray(samples, dtype=np.float64)
    win, hop = int(0.04 * sr), int(0.02 * sr)
    if len(x) < win * 5:
        return None
    gate = max(0.01 * np.max(np.abs(x)), 1e-4)
    kmin, kmax = int(sr / hi), int(sr / lo)
    out = []
    for s in range(0, len(x) - win, hop):
        f = x[s:s + win]
        f = f - f.mean()
        e = float(np.dot(f, f))
        if e < (gate ** 2) * win:
            continue
        ac = np.correlate(f, f, mode="full")[win - 1:]
        seg = ac[kmin:kmax + 1]
        if len(seg) == 0:
            continue
        k = int(np.argmax(seg)) + kmin
        if ac[k] / ac[0] >= 0.45:  # voisée : le signal se ressemble à lui-même une période plus tard
            out.append(sr / k)
    if len(out) < 10:
        return None
    return float(np.median(out))


def guess_category(hz):
    """Suggestion de catégorie d'après la hauteur : < 165 Hz homme, jusqu'à 255 Hz femme, au-delà enfant. '' si inconnu."""
    if not hz:
        return ""
    return "male" if hz < 165 else ("female" if hz < 255 else "child")


def model_path():
    root = os.environ.get("MODELS_DIR", "/models")
    return os.path.join(root, "speakers", os.environ.get("SPEAKER_MODEL_FILE", MODEL_FILE))


def ensure_model(log=print):
    path = model_path()
    if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    url = os.environ.get("SPEAKER_MODEL_URL", MODEL_URL)
    log(f"Téléchargement du modèle de voix : {url}")
    tmp = path + ".part"
    urllib.request.urlretrieve(url, tmp)
    if os.path.getsize(tmp) < 1_000_000:
        os.remove(tmp)
        raise RuntimeError("modèle de voix téléchargé incomplet")
    os.replace(tmp, path)
    return path


class Embedder:
    """Empreinte de voix d'un extrait (16 kHz mono) : vecteur ou None si l'extrait est trop court."""

    def __init__(self, path=None, threads=2):
        import sherpa_onnx
        cfg = sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=path or ensure_model(), num_threads=threads)
        self.ex = sherpa_onnx.SpeakerEmbeddingExtractor(cfg)

    def embed(self, samples, sr=SR):
        x = np.asarray(samples, dtype=np.float32)
        if len(x) < int(MIN_EMBED_S * sr):
            return None
        x = x[: int(MAX_EMBED_S * sr)]
        st = self.ex.create_stream()
        st.accept_waveform(sr, x)
        st.input_finished()
        if not self.ex.is_ready(st):
            return None
        return np.asarray(self.ex.compute(st), dtype=np.float64)
