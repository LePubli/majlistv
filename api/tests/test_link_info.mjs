// Pré-remplissage de « Nouvelle vidéo » : lecture du titre, de l'intervenant et de la description (api/src/linkInfo.js).
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.DATABASE_URL ||= 'postgres://x:x@127.0.0.1:1/x'; // le module des imports charge la base (aucune connexion n'est ouverte ici)
process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret-123456';
const { decodeEntities, fromOembed, fromArchive, fromHtml, youtubeDescription, youtubeLocalized, linkInfo, finish } = await import('../src/linkInfo.js');

// --- Fonctions pures
assert.equal(decodeEntities('L&#39;&eacute;cole &amp; &quot;vie&quot; &#x41;'), "L'&eacute;cole & \"vie\" A".replace('&eacute;', '&eacute;'));
assert.deepEqual(fromOembed({ title: ' Pourquoi  prier ? ', author_name: 'Chaîne Mejliss', description: 'Ligne 1<br>Ligne 2' }),
  { title: 'Pourquoi prier ?', speaker: 'Chaîne Mejliss', description: 'Ligne 1\nLigne 2' });
assert.deepEqual(fromOembed({}), { title: '', speaker: '', description: '' });
assert.deepEqual(fromOembed(null), { title: '', speaker: '', description: '' });
assert.equal(fromOembed({ title: 'x'.repeat(500) }).title.length, 200, 'titre limité à 200 caractères');
assert.equal(fromOembed({ description: 'y'.repeat(9000) }).description.length, 5000);
assert.equal(finish({ title: '<script>alert(1)</script>Titre', speaker: 'A\u0000B', description: '' }).title, 'alert(1)Titre', 'balises retirées');
assert.equal(finish({ speaker: 'A\u0000B' }).speaker, 'A B', 'caractères de contrôle retirés');
assert.deepEqual(fromArchive({ metadata: { title: ['Conférence A'], creator: ['Dr X', 'Dr Y'], description: '<p>Texte &amp; suite</p>' } }),
  { title: 'Conférence A', speaker: 'Dr X', description: 'Texte & suite' });
const page = `<html><head><title>Titre de repli</title>
<meta property="og:title" content="Titre &quot;OG&quot; d&#39;une page">
<meta name="description" content="Description simple">
<meta content="Description OG" property="og:description">
<meta name="author" content="Cheikh Untel"></head><body></body></html>`;
assert.deepEqual(fromHtml(page), { title: 'Titre "OG" d\'une page', speaker: 'Cheikh Untel', description: 'Description OG' });
assert.equal(fromHtml('<title> Seul </title>').title, 'Seul');
assert.equal(fromHtml('<meta name="author" content="https://x.test/profil"><title>T</title>').speaker, '', 'auteur sous forme d\'adresse : ignoré');
assert.equal(youtubeDescription('..."shortDescription":"Ligne 1\\nLigne \\"2\\" \\u00e9t\\u00e9"...'), 'Ligne 1\nLigne "2" été');
assert.equal(youtubeDescription('<meta property="og:description" content="Résumé">'), 'Résumé', 'repli sur og:description');
assert.equal(youtubeDescription('rien'), '');

// YouTube localisé : titre différent de celui d'oEmbed = version française proposée par YouTube
let y = youtubeLocalized('<meta property="og:title" content="Comment a-t-on fait de Jésus un dieu"><meta property="og:description" content="Résumé en français"> "shortDescription":"Original EN"', { title: 'How Jesus Was Turned Into a God!' });
assert.deepEqual([y.localized, y.title, y.description], [true, 'Comment a-t-on fait de Jésus un dieu', 'Résumé en français']);
y = youtubeLocalized('<meta property="og:title" content="Same title"> "shortDescription":"Texte complet"', { title: 'Same title' });
assert.deepEqual([y.localized, y.title, y.description], [false, 'Same title', 'Texte complet'], 'pas de version localisée : titre d\'origine et description complète');
y = youtubeLocalized('', { title: 'T' });
assert.deepEqual([y.localized, y.title, y.description], [false, 'T', '']);

// --- Avec un faux serveur
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  if (u.pathname === '/vimeo') return json({ title: 'Vidéo Vimeo', author_name: 'Auteur Vimeo', description: 'Desc Vimeo' });
  if (u.pathname === '/dm') return json({ title: 'Vidéo DM', author_name: 'Auteur DM' });
  if (u.pathname === '/metadata/mon-item') return json({ metadata: { title: 'Item archive', creator: 'Créateur' } });
  if (u.pathname === '/page') { res.setHeader('content-type', 'text/html'); return res.end(page); }
  if (u.pathname === '/redirect') { res.statusCode = 302; res.setHeader('location', '/page'); return res.end(); }
  if (u.pathname === '/boom') { res.statusCode = 500; return res.end('x'); }
  res.statusCode = 404; res.end('no');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
process.env.LINKINFO_ALLOW_PRIVATE = '1';
process.env.LINKINFO_VIMEO_OEMBED = `${base}/vimeo`;
process.env.LINKINFO_DAILYMOTION_OEMBED = `${base}/dm`;
process.env.ARCHIVE_BASE_URL = base;

let r = await linkInfo('https://vimeo.com/12345');
assert.deepEqual([r.origin, r.title, r.speaker, r.description, r.found], ['vimeo', 'Vidéo Vimeo', 'Auteur Vimeo', 'Desc Vimeo', true]);
r = await linkInfo('https://www.dailymotion.com/video/x8abcde');
assert.deepEqual([r.origin, r.title, r.speaker, r.found], ['dailymotion', 'Vidéo DM', 'Auteur DM', true]);
r = await linkInfo('https://archive.org/details/mon-item');
assert.deepEqual([r.origin, r.title, r.speaker, r.found], ['archive', 'Item archive', 'Créateur', true]);
r = await linkInfo(`${base}/page`);
assert.deepEqual([r.origin, r.title, r.speaker, r.description], ['web', 'Titre "OG" d\'une page', 'Cheikh Untel', 'Description OG']);
r = await linkInfo(`${base}/redirect`);
assert.equal(r.title, 'Titre "OG" d\'une page', 'redirection suivie');
r = await linkInfo(`${base}/boom`);
assert.equal(r.found, false, 'le site répond une erreur : pas d\'échec, simplement rien à remplir');
assert.deepEqual([r.title, r.speaker, r.description], ['', '', '']);
r = await linkInfo(`${base}/introuvable`);
assert.equal(r.found, false);

// --- Sécurité : adresses non publiques refusées (sans l'autorisation de test)
delete process.env.LINKINFO_ALLOW_PRIVATE;
for (const bad of ['http://127.0.0.1/x', 'http://localhost/x', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/', 'http://[::1]/', 'ftp://exemple.org/x', 'https://user:pw@exemple.org/', 'pas une adresse', '']) {
  const x = await linkInfo(bad);
  assert.ok(x.error, `refusé : ${bad}`);
}
// Un site public qui redirige vers une adresse privée n'est pas suivi.
process.env.LINKINFO_ALLOW_PRIVATE = '1';
server.close();
console.log('link info OK');
