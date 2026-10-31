// Étape 45B — lecture des fichiers du Coran (formats tanzil et json), nettoyage, adresses refusées. Données fictives, sans texte réel.
import assert from 'node:assert/strict';
const { parseContent, parseTanzil, cleanText, fetchText } = await import('../src/modules/quran/lib.js');
const { SURAS } = await import('../src/modules/quran/suras.js');
const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };

ok(SURAS.length === 114 && SURAS.every((s, i) => s.n === i + 1 && s.ar && s.en), '114 sourates numérotées avec nom arabe et translittéré');
ok(cleanText('<p>Un&nbsp;deux</p><br/>trois &amp; quatre<script>x</script>') === 'Un deux\n\ntrois & quatrex', 'nettoyage des balises HTML');

const t = parseContent('tanzil', '# commentaire\n1|1|alpha\n1|2|beta | gamma\n\n2|1|delta\n115|1|hors\n1|0|zéro\nmal formé\n1|3|   \n1|1|alpha bis\n');
ok(t.rows.length === 3 && t.skipped === 5, 'tanzil : 3 versets gardés (doublon remplacé), 5 lignes ignorées');
ok(t.rows[0].text === 'alpha bis' && t.rows[1].text === 'beta | gamma', 'tanzil : dernier doublon gagne, « | » conservé dans le texte');
ok(parseContent('json', JSON.stringify([{ sura: 1, aya: 1, text: 'a' }, { surah: 2, ayah: 5, content: 'b' }, { sura: 0, aya: 1, text: 'x' }])).rows.length === 2, 'json : liste d’objets (noms de champs usuels)');
ok(parseContent('json', JSON.stringify({ verses: [{ sura: 3, aya: 1, text: 'c' }] })).rows.length === 1, 'json : { verses: [...] }');
const nested = parseContent('json', JSON.stringify({ 1: { 1: 'a', 2: 'b' }, 2: ['c', 'd', { text: 'e' }] }));
ok(nested.rows.length === 5 && nested.rows[4].aya === 3 && nested.rows[4].text === 'e', 'json : objet imbriqué et listes par sourate');
ok(parseContent('json', '{pas du json').error && parseContent('tanzil', 'rien\nde valide').error, 'fichiers illisibles : erreur claire');
ok(parseTanzil('1|1|a\r\n1|2|b\r\n').rows.length === 2, 'fins de ligne Windows acceptées');

for (const u of ['http://127.0.0.1:9/x', 'http://localhost/x', 'http://10.0.0.5/x', 'http://169.254.169.254/latest', 'http://[::1]/', 'ftp://example.com/x', 'file:///etc/passwd', 'http://user:pw@example.com/', 'pas une adresse']) {
  let err = null; try { await fetchText(u); } catch (e) { err = e; }
  ok(err, `adresse refusée : ${u}`);
}
console.log('quran lib OK');
