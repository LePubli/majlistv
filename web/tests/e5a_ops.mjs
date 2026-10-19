// Étape E5a — opérations du montage par le texte (sans navigateur) : node web/tests/e5a_ops.mjs
import { cutRange, restoreRange, wordSpan, wordKept, covered, srcToT, findWords, total } from '../modules/editor/ops.js';
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails += 1; };
const J = (x) => JSON.stringify(x);

const one = [{ id: 'c1', in: 0, out: 60 }];
let r = cutRange(one, 10, 12.5);
ok(r.done && J(r.clips) === J([{ id: 'c1', in: 0, out: 10 }, { id: 'c2', in: 12.5, out: 60 }]) && r.removed === 2.5, `couper au milieu : deux extraits ${J(r.clips)}`);
ok(!covered(r.clips, 11) && covered(r.clips, 12.5) && covered(r.clips, 9.99), 'le passage coupé n’est plus dans le montage');
r = cutRange(one, 0, 3);
ok(J(r.clips) === J([{ id: 'c1', in: 3, out: 60 }]), 'couper le début');
r = cutRange(one, 59.9, 60);
ok(J(r.clips) === J([{ id: 'c1', in: 0, out: 59.9 }]), 'couper la fin');
r = cutRange(one, 0.1, 5);
ok(J(r.clips) === J([{ id: 'c1', in: 5, out: 60 }]), 'un reste de moins de 0,2 s disparaît');
r = cutRange(one, 0, 60);
ok(!r.done && r.reason === 'all' && r.clips === one, 'tout couper : refusé (le montage garde un extrait)');
r = cutRange(one, 70, 80);
ok(!r.done, 'hors du montage : rien');
// Passage repris deux fois (extrait dupliqué) : coupé partout.
const dup = [{ id: 'c1', in: 0, out: 20 }, { id: 'c2', in: 30, out: 40 }, { id: 'c3', in: 5, out: 15 }];
r = cutRange(dup, 8, 10);
ok(J(r.clips) === J([{ id: 'c1', in: 0, out: 8 }, { id: 'c4', in: 10, out: 20 }, { id: 'c2', in: 30, out: 40 }, { id: 'c3', in: 5, out: 8 }, { id: 'c5', in: 10, out: 15 }]),
  `coupé dans chaque extrait qui le contient, identifiants uniques ${J(r.clips)}`);
// Passage à cheval sur deux extraits.
r = cutRange([{ id: 'a', in: 0, out: 10 }, { id: 'b', in: 10, out: 20 }], 8, 13);
ok(J(r.clips) === J([{ id: 'a', in: 0, out: 8 }, { id: 'b', in: 13, out: 20 }]), 'à cheval sur deux extraits');

// Rétablir.
let c = cutRange(one, 10, 12.5).clips;
r = restoreRange(c, 10, 12.5);
ok(r.done && J(r.clips) === J([{ id: 'c1', in: 0, out: 60 }]), `rétablir : les deux extraits se rejoignent ${J(r.clips)}`);
c = cutRange(cutRange(one, 10, 12).clips, 20, 25).clips;
r = restoreRange(c, 11, 12);
ok(J(r.clips) === J([{ id: 'c1', in: 0, out: 10 }, { id: 'c2', in: 11, out: 20 }, { id: 'c3', in: 25, out: 60 }]), `rétablir une partie : l'extrait suivant est rallongé ${J(r.clips)}`);
r = restoreRange(c, 10, 11);
ok(J(r.clips) === J([{ id: 'c1', in: 0, out: 11 }, { id: 'c2', in: 12, out: 20 }, { id: 'c3', in: 25, out: 60 }]), 'rétablir une partie : l’extrait précédent est rallongé');
r = restoreRange([{ id: 'c1', in: 0, out: 10 }, { id: 'c2', in: 30, out: 40 }], 15, 20);
ok(J(r.clips) === J([{ id: 'c1', in: 0, out: 10 }, { id: 'c3', in: 15, out: 20 }, { id: 'c2', in: 30, out: 40 }]), `rétablir un passage isolé : nouvel extrait à sa place ${J(r.clips)}`);
r = restoreRange([{ id: 'c1', in: 30, out: 40 }], 2, 5);
ok(J(r.clips) === J([{ id: 'c2', in: 2, out: 5 }, { id: 'c1', in: 30, out: 40 }]), `rétablir avant le premier extrait ${J(r.clips)}`);
r = restoreRange(one, 5, 8);
ok(!r.done, 'rétablir un passage déjà là : rien');
r = restoreRange([{ id: 'c1', in: 0, out: 10 }], 10, 70, 60);
ok(J(r.clips) === J([{ id: 'c1', in: 0, out: 60 }]), 'rétablir ne dépasse pas la fin de la vidéo');
// Couper puis rétablir = montage d'origine, même avec plusieurs extraits.
const base = [{ id: 'c1', in: 0, out: 30 }, { id: 'c2', in: 40, out: 50 }];
r = restoreRange(cutRange(base, 12, 18).clips, 12, 18);
ok(J(r.clips) === J(base) && total(r.clips) === 40, 'couper puis rétablir : montage d’origine');

// Mots → passage à couper.
const words = [{ s: 0, e: 0.5, w: 'Bonjour' }, { s: 0.6, e: 1, w: 'à' }, { s: 1.1, e: 1.6, w: 'tous.' }, { s: 4, e: 4.5, w: 'Euh…' }, { s: 4.6, e: 5, w: 'Bien.' }];
ok(J(wordSpan(words, 1, 1)) === J({ s: 0.6, e: 1.1 }), 'un mot : jusqu’au début du mot suivant (silence < 1 s)');
ok(J(wordSpan(words, 2, 1)) === J({ s: 0.6, e: 1.7 }), 'sélection à l’envers, long silence ensuite : 0,1 s après le dernier mot');
ok(J(wordSpan(words, 4, 4)) === J({ s: 4.6, e: 5.1 }), 'dernier mot : 0,1 s après');
c = cutRange(one, wordSpan(words, 3, 3).s, wordSpan(words, 3, 3).e).clips;
ok(!wordKept(c, words[3]) && wordKept(c, words[4]) && wordKept(c, words[2]), '« Euh… » coupé, les voisins gardés');
ok(srcToT(c, 4.7) === 4.1 && srcToT(c, 4.2) === null, `temps du montage d'un mot gardé ; null pour un mot coupé (${srcToT(c, 4.7)})`);

// Recherche.
const ws = ['La', 'patience', 'est', 'une', 'lumière.', 'La', 'Patience,', 'encore'].map((w) => ({ w }));
ok(J(findWords(ws, 'patience')) === J([{ i: 1, j: 1 }, { i: 6, j: 6 }]), 'recherche sans majuscules ni ponctuation');
ok(J(findWords(ws, 'une lumi')) === J([{ i: 3, j: 4 }]), 'recherche de plusieurs mots (dernier mot commencé)');
ok(J(findWords([{ w: 'الصَّبْرُ' }, { w: 'نور' }], 'الصبر')) === J([{ i: 0, j: 0 }]), 'recherche en arabe sans voyelles');
ok(findWords(ws, '  ').length === 0, 'recherche vide : rien');

console.log(fails ? `\nÉCHECS : ${fails}` : '\nTout est bon');
process.exit(fails ? 1 : 0);
