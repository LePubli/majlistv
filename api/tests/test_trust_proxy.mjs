// Audit 11/2026 — quelle adresse l'API retient-elle pour un visiteur ? (limites de débit, preuves de consentement)
// Réglage par défaut : on croit le nginx de la machine (127.0.0.1) et les adresses privées (réseau Docker), jamais Internet.
// node api/tests/test_trust_proxy.mjs
import assert from 'node:assert/strict';
import Fastify from 'fastify';

process.env.DATABASE_URL ||= 'postgres://x:y@127.0.0.1:1/z';
process.env.JWT_SECRET ||= 'test-secret-0123456789abcdef0123456789';
delete process.env.TRUST_PROXY;
const { config } = await import('../src/config.js');
assert.deepEqual(config.trustProxy, ['loopback', 'uniquelocal'], 'réglage par défaut');

const app = Fastify({ trustProxy: config.trustProxy });
app.get('/ip', async (req) => ({ ip: req.ip }));
const ip = async (remoteAddress, xff) => (await app.inject({ method: 'GET', url: '/ip', remoteAddress, headers: xff ? { 'x-forwarded-for': xff } : {} })).json().ip;

// nginx de la machine → conteneur de l'API : la connexion arrive par la passerelle Docker ; nginx a ajouté la vraie adresse à la fin.
assert.equal(await ip('172.17.0.1', '81.2.3.4'), '81.2.3.4', 'passerelle Docker : adresse du visiteur');
assert.equal(await ip('127.0.0.1', '81.2.3.4'), '81.2.3.4', 'nginx local : adresse du visiteur');
// Le visiteur annonce une fausse adresse : nginx ajoute la vraie APRÈS ; c'est la dernière qui compte.
assert.equal(await ip('172.17.0.1', '9.9.9.9, 81.2.3.4'), '81.2.3.4', 'fausse adresse annoncée : ignorée');
// Site → API : nginx (vraie adresse) puis le conteneur du site.
assert.equal(await ip('172.17.0.5', '9.9.9.9, 81.2.3.4'), '81.2.3.4', 'par le serveur du site : adresse du visiteur');
// Connexion directe depuis Internet : l'en-tête n'est jamais cru.
assert.equal(await ip('8.8.8.8', '1.1.1.1'), '8.8.8.8', 'connexion directe : en-tête ignoré');
// Sans en-tête (appel interne) : adresse de la connexion.
assert.equal(await ip('172.17.0.5'), '172.17.0.5', 'sans en-tête : adresse de la connexion');
await app.close();
console.log('trust proxy OK');
