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

// Site qui appelle l'API par son adresse PUBLIQUE (API_URL = https://api-…) : la requête ressort par l'adresse publique du
// serveur, que nginx ajoute à la fin. Il faut alors la déclarer de confiance : TRUST_PROXY=loopback,uniquelocal,<adresse du serveur>.
const parse = (v) => v.split(',').map((s) => s.trim()).filter(Boolean); // même lecture que config.js
const app2 = Fastify({ trustProxy: parse('loopback, uniquelocal, 82.22.77.159') });
app2.get('/ip', async (req) => ({ ip: req.ip }));
const ip2 = async (xff) => (await app2.inject({ method: 'GET', url: '/ip', remoteAddress: '172.17.0.1', headers: { 'x-forwarded-for': xff } })).json().ip;
assert.equal(await ip2('92.184.147.243, 82.22.77.159'), '92.184.147.243', 'site par l’adresse publique : adresse du visiteur');
assert.equal(await ip2('9.9.9.9, 92.184.147.243, 82.22.77.159'), '92.184.147.243', 'idem, fausse adresse annoncée ignorée');
assert.equal(await ip2('82.22.77.159, 92.184.147.243'), '92.184.147.243', 'un visiteur qui annonce l’adresse du serveur ne gagne rien');
await app2.close();
console.log('trust proxy OK');
