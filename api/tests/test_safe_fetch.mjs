// DNS rebinding : l'adresse est contrôlée à la connexion, pas seulement avant.
import assert from 'node:assert/strict';
import http from 'node:http';
import { safeGet, publicLookup } from '../src/safeFetch.js';
const srv = http.createServer((q, r) => r.end('secret-interne')).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const port = srv.address().port;
const fail = async (u, m) => { await assert.rejects(() => safeGet(u), (e) => e.code === 'EPRIVATE', m); console.log('OK  ', m); };
await fail(`http://127.0.0.1:${port}/`, 'adresse en chiffres privée refusée');
await fail(`http://[::1]:${port}/`, 'IPv6 locale refusée');
await fail(`http://localhost:${port}/`, 'nom résolu vers 127.0.0.1 refusé (cas du DNS rebinding : refus au moment de la connexion)');
await new Promise((res) => publicLookup('localhost', {}, (err) => { assert.equal(err?.code, 'EPRIVATE'); res(); })); console.log('OK   publicLookup refuse localhost');
const r = await safeGet(`http://127.0.0.1:${port}/`, { allowPrivate: true });
let t = ''; for await (const c of r.body) t += c;
assert.equal(r.status, 200); assert.equal(t, 'secret-interne'); console.log('OK   mode test (allowPrivate) : lecture normale');
srv.close();
console.log('téléchargement sûr OK');
