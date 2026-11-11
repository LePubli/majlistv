"""Audit 11/2026 — frein aux essais de mot de passe par compte (api/src/loginGuard.js).

Au-delà de 10 échecs en 15 minutes sur un même compte, la connexion à CE compte est refusée (429), même avec le bon mot
de passe ; les autres comptes ne sont pas touchés ; un compte inconnu répond comme un mauvais mot de passe.

    python3 api/tests/test_login_guard.py        (API de test sur :3055 ; LOGIN_FAIL_MAX non réglé = 10)
"""
import sys, uuid, requests

B = "http://127.0.0.1:3055"
fails = []
def ok(c, m):
    if not c: fails.append(m); print("FAIL", m)

def account():
    email = f"guard-{uuid.uuid4().hex[:8]}@test.local"
    r = requests.post(B + "/auth/register", json={"email": email, "password": "Passw0rd-test", "name": "G"})
    assert r.status_code == 201, r.text
    return email
login = lambda email, pw: requests.post(B + "/auth/login", json={"email": email, "password": pw})

a, b = account(), account()
ok(login(a, "Passw0rd-test").status_code == 200, "connexion normale")

# 9 échecs puis une réussite : le compteur repart de zéro
for _ in range(9): ok(login(a, "mauvais-mot-de-passe").status_code == 401, "échec → 401")
ok(login(a, "Passw0rd-test").status_code == 200, "9 échecs puis le bon mot de passe : accepté")
for _ in range(9): login(a, "mauvais-mot-de-passe")
ok(login(a, "Passw0rd-test").status_code == 200, "le compteur est reparti de zéro après la réussite")

# 10 échecs : compte bloqué, même avec le bon mot de passe
codes = [login(a, "mauvais-mot-de-passe").status_code for _ in range(10)]
ok(codes == [401] * 10, f"10 échecs → dix fois 401 ({codes})")
r = login(a, "Passw0rd-test")
ok(r.status_code == 429 and r.json().get("code") == "login_locked", f"11e essai avec le BON mot de passe : refusé ({r.status_code})")
ok(int(r.headers.get("retry-after", "0")) > 0 and 1 <= r.json().get("minutes", 0) <= 15, "délai annoncé (au plus 15 min)")
ok(login(a.upper(), "Passw0rd-test").status_code == 429, "majuscules dans l'adresse : même compte, même blocage")
ok(login(b, "Passw0rd-test").status_code == 200, "un autre compte n'est pas touché")

# « Mot de passe oublié » reste possible pendant le blocage
ok(requests.post(B + "/auth/forgot", json={"email": a}).status_code == 200, "mot de passe oublié : toujours possible")

# Compte inconnu : même réponse qu'un mauvais mot de passe, puis même blocage (on ne révèle pas si l'adresse existe)
ghost = f"inconnu-{uuid.uuid4().hex[:8]}@test.local"
r = login(ghost, "nimporte-quoi")
ok(r.status_code == 401 and r.json().get("error") == "Identifiants invalides", "compte inconnu : 401, même message")
for _ in range(9): login(ghost, "nimporte-quoi")
ok(login(ghost, "nimporte-quoi").status_code == 429, "compte inconnu : même blocage après 10 échecs")

if fails:
    print(f"\n{len(fails)} ÉCHEC(S)"); sys.exit(1)
print("frein par compte OK")
