"""Relecture 25/11 — DNS rebinding : pendant un téléchargement, le nom est contrôlé à la connexion (importer.public_only)."""
import os, socket, sys, threading
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import importer


def ok(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c:
        sys.exit(1)


# Un nom qui se résout vers 127.0.0.1 : « localhost ».
@importer.public_only
def probe(url, check=importer.assert_public_url):
    return socket.getaddrinfo("localhost", 80)

try:
    probe("x"); ok(False, "localhost aurait dû être refusé pendant un téléchargement")
except socket.gaierror:
    ok(True, "pendant un téléchargement : une résolution vers 127.0.0.1 est refusée")
ok(bool(socket.getaddrinfo("localhost", 80)), "hors téléchargement : résolution normale (base, stockage, API)")

# Avec un contrôle fourni par l'appelant (tests avec serveur local), pas de filtre.
@importer.public_only
def probe2(url, check=lambda u: u):
    return socket.getaddrinfo("localhost", 80)
ok(bool(probe2("x")), "contrôle personnalisé (tests) : pas de filtre")

# Le filtre est propre à chaque fil.
res = {}
def other():
    res["r"] = socket.getaddrinfo("localhost", 80)
@importer.public_only
def probe3(url, check=importer.assert_public_url):
    t = threading.Thread(target=other); t.start(); t.join()
probe3("x")
ok(bool(res.get("r")), "un autre fil n'est pas touché")
ok(importer._is_public_ip("8.8.8.8") and not importer._is_public_ip("169.254.169.254") and not importer._is_public_ip("::ffff:10.0.0.1"), "adresses publiques / privées / métadonnées / IPv6 mappée")
print("TOUT OK")
