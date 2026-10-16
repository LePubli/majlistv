"""Lecture des paramètres du back-office (table app_settings), avec repli sur les variables d'environnement (copie de transcriber/src/settings.py).

Valeur utilisée = valeur saisie dans le back-office, sinon variable d'environnement, sinon valeur par défaut.
Les clés d'API sont chiffrées en base (AES-256-GCM, clé SETTINGS_KEY) : cette variable doit être identique sur
l'API, le traducteur et le transcripteur. Les paramètres sont relus toutes les 10 secondes : un changement dans
le back-office s'applique sans redéployer.
"""
import base64
import hashlib
import os
import time

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:  # pragma: no cover
    AESGCM = None

TTL = 10


class Settings:
    def __init__(self, query, log=print):
        self._query = query
        self._log = log
        self._rows = {}
        self._at = 0.0
        raw = os.environ.get("SETTINGS_KEY", "")
        self._aes = AESGCM(hashlib.sha256(raw.encode()).digest()) if raw and AESGCM else None
        self._warned = False

    def refresh(self, force=False):
        """Recharge les paramètres (au plus toutes les 10 s). Ne lève jamais : en cas d'erreur, on garde les valeurs précédentes."""
        if not force and time.time() - self._at < TTL:
            return
        try:
            rows = self._query("SELECT key, value, is_secret FROM app_settings", fetch=True)
        except Exception as err:  # noqa: BLE001  (table absente avant la migration 009, base indisponible…)
            if not self._warned:
                self._log("Paramètres du back-office indisponibles (variables d'environnement utilisées) :", err)
                self._warned = True
            self._at = time.time()
            return
        self._warned = False
        out = {}
        for r in rows:
            value = r["value"]
            if r["is_secret"]:
                if not self._aes:
                    self._log(f"Clé « {r['key']} » ignorée : SETTINGS_KEY absente sur ce service")
                    continue
                try:
                    raw = base64.b64decode(value)
                    value = self._aes.decrypt(raw[:12], raw[28:] + raw[12:28], None).decode()
                except Exception:  # noqa: BLE001  (SETTINGS_KEY différente de celle de l'API)
                    self._log(f"Clé « {r['key']} » illisible : SETTINGS_KEY différente de celle de l'API ?")
                    continue
            out[r["key"]] = value
        self._rows = out
        self._at = time.time()

    def get(self, key, env_name=None, default=""):
        value = self._rows.get(key)
        if value not in (None, ""):
            return value
        if env_name and os.environ.get(env_name):
            return os.environ[env_name]
        return default

    def get_int(self, key, env_name=None, default=0):
        try:
            return int(float(self.get(key, env_name, str(default))))
        except ValueError:
            return default

    def get_bool(self, key, env_name=None, default=True):
        value = self.get(key, env_name, "true" if default else "false").strip().lower()
        return value not in ("false", "off", "0", "no", "")

    def get_set(self, key, env_name=None):
        return {x.strip().lower() for x in self.get(key, env_name, "").split(",") if x.strip()}
