"""Étape E5c — « Préciser la place des mots » : place exacte de chaque mot du TEXTE EXISTANT, d'après les mots entendus par Whisper.

Le texte (phrases corrigées à la main comprises) ne change jamais : on garde ses mots et on leur donne le moment où Whisper les a
entendus. Pour chaque phrase, on compare ses mots à ceux que Whisper a entendus autour de la phrase (± 1 s) ; les mots identiques
(sans accents, sans majuscules, sans ponctuation) prennent le moment de Whisper ; les autres sont répartis entre leurs voisins
d'après leur longueur. Une phrase dont moins de la moitié des mots sont retrouvés n'est pas touchée (elle garde sa place d'avant).
Fonctions pures (aucune base, aucun Whisper) : testées dans transcriber/tests/test_align.py."""
import bisect
import difflib
import re
import unicodedata

WINDOW_MS = 1000     # mots entendus pris en compte autour de la phrase
MIN_MATCHED = 0.5    # part minimale de mots retrouvés pour accepter une phrase


def norm(word):
    """Mot comparable : sans accents ni voyelles arabes, minuscules, sans ponctuation."""
    s = unicodedata.normalize("NFKD", str(word or ""))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[\W_]+", "", s.lower())


def align_segment(seg_s, seg_e, tokens, heard):
    """tokens : mots du texte de la phrase ; heard : [(début_ms, fin_ms, mot)] entendus autour de la phrase, dans l'ordre.
    Renvoie [(début_ms, fin_ms, mot)] (un par mot du texte) ou None si la phrase ne se retrouve pas assez dans ce qui a été entendu."""
    a = [norm(t) for t in tokens]
    b = [norm(h[2]) for h in heard]
    useful = [i for i, x in enumerate(a) if x]
    if not tokens or not useful or not heard:
        return None
    matched = {}
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            if a[blk.a + k]:
                matched[blk.a + k] = heard[blk.b + k]
    if len(matched) < MIN_MATCHED * len(useful):
        return None
    n = len(tokens)
    start, end = [None] * n, [None] * n
    for i, (s, e, _) in matched.items():
        start[i], end[i] = max(seg_s, min(s, seg_e)), max(seg_s, min(e, seg_e))
    i = 0
    while i < n:                                   # répartit les mots non retrouvés entre leurs voisins retrouvés
        if start[i] is not None:
            i += 1
            continue
        j = i
        while j < n and start[j] is None:
            j += 1
        lo = end[i - 1] if i > 0 else seg_s
        hi = start[j] if j < n else seg_e
        hi = max(hi, lo)
        weights = [len(tokens[k]) + 1 for k in range(i, j)]
        total, at = sum(weights), lo
        for off, k in enumerate(range(i, j)):
            start[k] = int(round(at))
            at += (hi - lo) * weights[off] / total
            end[k] = int(round(at)) if k < j - 1 else int(round(hi))
        i = j
    out, prev = [], seg_s                          # ordre croissant garanti, fin >= début
    for k in range(n):
        s = max(start[k], prev)
        e = max(end[k], s)
        out.append((s, e, tokens[k]))
        prev = s
    return out


def align_all(segments, heard):
    """segments : [(idx, début_ms, fin_ms, texte)] ; heard : [(début_ms, fin_ms, mot)] triés par début.
    Renvoie ({idx: [(début, fin, mot)]} pour les phrases alignées, nombre de phrases)."""
    starts = [h[0] for h in heard]
    done = {}
    for idx, s, e, text in segments:
        lo = bisect.bisect_left(starts, s - WINDOW_MS)
        hi = bisect.bisect_right(starts, e + WINDOW_MS)
        res = align_segment(s, e, str(text).split(), heard[lo:hi])
        if res:
            done[idx] = res
    return done, len(segments)
