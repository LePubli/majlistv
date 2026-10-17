"""Glossaire de prononciation (étape D1b) — même règle que l'API (api/src/modules/dubbing/glossary.js).

Termes les plus longs d'abord ; « mot entier » = pas de lettre ni de chiffre collé avant ou après (l'apostrophe sépare :
« l'Imam ») ; majuscules ignorées sauf demande. Un passage déjà remplacé n'est pas remplacé une seconde fois.
"""
import re


def compile_entries(entries):
    out = []
    for e in sorted((x for x in entries if x.get("active", True) and (x.get("term") or "").strip()),
                    key=lambda x: -len(x["term"].strip())):
        body = re.escape(e["term"].strip())
        src = rf"(?<!\w){body}(?!\w)" if e.get("whole_word", True) else body
        flags = 0 if e.get("case_sensitive", False) else re.IGNORECASE
        out.append((re.compile(src, flags), e["say"]))
    return out


def apply(text, compiled):
    parts = []

    def keep(say):
        def repl(_m):
            parts.append(say)
            return f"{len(parts) - 1}"
        return repl

    out = text or ""
    for rx, say in compiled:
        out = rx.sub(keep(say), out)
    return re.sub(r"(\d+)", lambda m: parts[int(m.group(1))], out)
