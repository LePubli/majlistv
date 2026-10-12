"""Serveur SMTP factice pour les tests : enregistre chaque e-mail reçu dans le dossier donné (un fichier .eml par message)."""
import asyncio, os, sys, time
from aiosmtpd.controller import Controller

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/mails"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 2525
os.makedirs(OUT, exist_ok=True)

class Handler:
    async def handle_DATA(self, server, session, envelope):
        name = f"{time.time():.6f}.eml"
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(f"X-Rcpt: {','.join(envelope.rcpt_tos)}\r\n".encode() + envelope.content)
        return "250 OK"

c = Controller(Handler(), hostname="127.0.0.1", port=PORT)
c.start()
print("SMTP factice sur", PORT, "->", OUT, flush=True)
try:
    asyncio.get_event_loop().run_forever()
except KeyboardInterrupt:
    c.stop()
