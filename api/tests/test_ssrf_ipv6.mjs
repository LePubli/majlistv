// Adresses internes écrites en IPv6 (relecture du 25/11) : elles ne doivent jamais passer pour publiques. node api/tests/test_ssrf_ipv6.mjs
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://x:x@127.0.0.1:1/x'; // le module charge la base (aucune connexion n'est ouverte ici)
process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret-123456';
const { isPrivateHost } = await import('../src/mediaImport.js');
const host = (u) => new URL(u).hostname;
for (const u of ['http://[::ffff:7f00:1]/', 'http://[::ffff:a00:1]/', 'http://[::ffff:c0a8:1]/', 'http://[::ffff:ac10:1]/', 'http://[::ffff:a9fe:a9fe]/', 'http://[64:ff9b::7f00:1]/', 'http://[2002:7f00:1::1]/',
  'http://[::1]/', 'http://[::]/', 'http://[fd00::1]/', 'http://[fe80::1]/', 'http://[ff02::1]/', 'http://[::127.0.0.1]/', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://api/', 'http://localhost/']) {
  assert.equal(isPrivateHost(host(u)), true, `${u} doit être refusée`);
}
for (const u of ['http://[::ffff:808:808]/', 'http://[2606:4700:4700::1111]/', 'http://[64:ff9b::808:808]/', 'http://8.8.8.8/', 'https://www.youtube.com/', 'http://[2001:4860:4860::8888]/']) {
  assert.equal(isPrivateHost(host(u)), false, `${u} doit rester autorisée`);
}
console.log('test_ssrf_ipv6 : OK');
