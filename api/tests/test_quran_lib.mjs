// Étape 45B — lecture des fichiers du Coran (formats tanzil et json), nettoyage, adresses refusées. Données fictives, sans texte réel.
import assert from 'node:assert/strict';
const { parseContent, parseTanzil, cleanText, fetchText, parseWords, parseTajweed, checkReciterUrl } = await import('../src/modules/quran/lib.js');
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
const fn = parseContent('json', JSON.stringify({ 1: [{ chapter: 1, verse: 1, text: 'Un[1]', footnotes: '[1] <b>Note</b> un' }, { chapter: 1, verse: 3, text: 'Trois' }] }));
ok(fn.rows[0].notes === '[1] Note un' && fn.rows[1].aya === 3 && fn.rows[1].notes === '', 'json : notes de bas de page conservées, numéro de verset du fichier respecté')
ok(parseTanzil('1|1|a\r\n1|2|b\r\n').rows.length === 2, 'fins de ligne Windows acceptées');

for (const u of ['http://127.0.0.1:9/x', 'http://localhost/x', 'http://10.0.0.5/x', 'http://169.254.169.254/latest', 'http://[::1]/', 'ftp://example.com/x', 'file:///etc/passwd', 'http://user:pw@example.com/', 'pas une adresse']) {
  let err = null; try { await fetchText(u); } catch (e) { err = e; }
  ok(err, `adresse refusée : ${u}`);
}

// 45B2 : mot à mot, tajwid, adresse de récitateur
const w = parseWords(JSON.stringify([{ sura: 1, aya: 1, position: 2, text: 'b' }, { sura: 1, aya: 1, position: 1, text: 'a' }, { sura: 1, aya: 2, position: 2, text: 'x' }, { sura: 1, aya: 3, position: 1, text: '  ' }]));
ok(w.rows.length === 1 && w.rows[0].words.join() === 'a,b' && w.skipped === 2, 'mot à mot : ordre par position, verset avec trou et mot vide écartés');
ok(parseWords(JSON.stringify({ '2:5:1': 'p', '2:5:2': { text: 'q' }, mauvais: 'z' })).rows[0].words.join() === 'p,q', 'mot à mot : clés sourate:verset:mot');
ok(parseWords('pas du json').error && parseWords('[]').error, 'mot à mot : fichier illisible ou vide refusé');
const len = new Map([[1001, 10]]);
const tj = parseTajweed(JSON.stringify([{ surah: 1, ayah: 1, annotations: [{ rule: 'ikhfa', start: 0, end: 4 }] }, { surah: 1, ayah: 2, annotations: [{ rule: 'ikhfa', start: 0, end: 4 }] }, { surah: 1, ayah: 1 }]), len);
ok(tj.rows.length === 1 && tj.rows[0].marks[0].join() === 'ikhfa,0,4' && tj.skipped === 2, 'tajwid : verset inconnu du texte ou sans règle écarté');
ok(parseTajweed(JSON.stringify([{ surah: 1, ayah: 1, annotations: [{ rule: 'ikhfa', start: 0, end: 11 }] }]), len).error, 'tajwid : position hors du texte arabe refusée');
ok(checkReciterUrl('https://a.example/x/{sura3}{aya3}.mp3').origin === 'https://a.example' && checkReciterUrl('https://a.example/{sura}/{aya}.mp3').origin, 'récitateur : modèles acceptés');
ok(checkReciterUrl('http://a.example/{sura3}{aya3}').error && checkReciterUrl('https://a.example/x.mp3').error && checkReciterUrl('https://u:p@a.example/{sura3}{aya3}').error, 'récitateur : http, sans variables, identifiant refusés');
console.log('quran lib OK');
// Tajwid : contrôle des lettres (verset décalé écarté)
{
  const txt = new Map([[1001, 'ٱلْحَمْدُ'], [1002, 'ٱلْحَمْدُ']]);
  const r = parseTajweed(JSON.stringify([{ surah: 1, ayah: 1, annotations: [{ rule: 'hamzat_wasl', start: 0, end: 1 }] }, { surah: 1, ayah: 2, annotations: [{ rule: 'hamzat_wasl', start: 1, end: 2 }] }]), txt);
  ok(r.rows.length === 1 && r.rows[0].aya === 1 && r.shifted === 1, 'tajwid : règle sur une mauvaise lettre → verset décalé écarté');
}
