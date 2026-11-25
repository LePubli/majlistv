// Téléchargement HTTP(S) qui contrôle l'adresse AU MOMENT de la connexion (relecture 25/11).
// Contrôler l'adresse d'un site puis laisser fetch() la résoudre une seconde fois permet à un site malveillant de répondre
// « adresse publique » la première fois et « 127.0.0.1 » la seconde (DNS rebinding). Ici la résolution se fait une seule fois,
// dans la connexion elle-même (option `lookup`), et toute adresse privée la fait échouer.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { isPrivateHost } from './mediaImport.js';

// lookup de remplacement : même signature que dns.lookup, refuse les adresses non publiques.
export function publicLookup(hostname, options, cb) {
  const all = Boolean(options && options.all);
  dns.lookup(hostname, { ...(typeof options === 'object' ? options : {}), all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isPrivateHost(a.address))) {
      const e = new Error('adresse non publique'); e.code = 'EPRIVATE'; return cb(e);
    }
    return all ? cb(null, addrs) : cb(null, addrs[0].address, addrs[0].family);
  });
}

// Renvoie { status, ok, headers: { get(nom) }, body } ; body se lit avec « for await ». Redirections non suivies (à l'appelant).
export function safeGet(url, { headers = {}, signal, allowPrivate = false } = {}) {
  const u = url instanceof URL ? url : new URL(url);
  const lib = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new Error('annulé'));
    // Adresse écrite en chiffres : Node n'appelle pas `lookup` pour elle, on la contrôle donc ici.
    if (!allowPrivate && isPrivateHost(u.hostname)) return reject(Object.assign(new Error('adresse non publique'), { code: 'EPRIVATE' }));
    const req = lib.request(u, { method: 'GET', headers: { 'accept-encoding': 'identity', ...headers }, ...(allowPrivate ? {} : { lookup: publicLookup }) }, (res) => {
      resolve({
        status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300,
        headers: { get: (n) => { const v = res.headers[String(n).toLowerCase()]; return Array.isArray(v) ? v.join(', ') : (v ?? null); } },
        body: res,
      });
    });
    const onAbort = () => req.destroy(signal.reason || new Error('annulé'));
    signal?.addEventListener('abort', onAbort, { once: true });
    req.on('error', reject);
    req.on('close', () => signal?.removeEventListener('abort', onAbort));
    req.end();
  });
}
