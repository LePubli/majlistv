// Étape 34 — Règles pures de la lettre hebdomadaire personnalisée. Lancer : node tests/test_weeklyletter_lib.mjs
import assert from 'node:assert/strict';
import { pickFollowCards, hasPersonal, dueText } from '../src/weeklyLetterLib.js';
import { renderEmail } from '../src/emails.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('OK   ' + m); };
const slugOf = (s) => s.toLowerCase().replace(/\s+/g, '-');
const recent = [
  { id: '1', speaker: 'Ali Un', title: 'A' }, { id: '2', speaker: 'Bob Deux', title: 'B' }, { id: '3', speaker: 'Ali Un', title: 'C' },
  { id: '1', speaker: 'Ali Un', title: 'A bis' }, { id: '4', speaker: 'Ali Un', title: 'D' }, { id: '5', speaker: 'Ali Un', title: 'E' }, { id: '6', speaker: '', title: 'F' },
];
let r = pickFollowCards(recent, ['ali-un'], slugOf, 3);
ok(r.map((x) => x.id).join() === '1,3,4', 'nouveautés : seulement les intervenants suivis, sans doublon, 3 au plus, ordre conservé');
ok(pickFollowCards(recent, [], slugOf).length === 0, 'aucun intervenant suivi : rien');
ok(pickFollowCards(recent, ['bob-deux'], slugOf).length === 1, 'un seul intervenant concerné');
ok(pickFollowCards(recent, ['ali-un'], slugOf, 1).length === 1, 'plafond respecté');

ok(dueText(0) === '' && dueText(-2) === '' && dueText('x') === '' && dueText(4) === '4', 'notions à réviser : vide si zéro');
ok(!hasPersonal({ cardsResume: [], cardsFollow: [], due: '' }), 'rien de personnel → sélection simple');
ok(hasPersonal({ cardsResume: [{ title: 'x' }], cardsFollow: [], due: '' }) && hasPersonal({ cardsResume: [], cardsFollow: [], due: '3' }), 'une section personnelle suffit');

const c = (id, title, poster = true) => ({ id, title, speaker: 'S', poster, path: '/conferences/' + id });
const vars = { name: 'Amal', app: 'Mejliss TV', webUrl: 'https://x', url: 'https://x/', unsubUrl: 'https://x/u', cardsResume: [c('r1', 'À reprendre 1')], cardsFollow: [c('f1', 'Nouveau 1')], cardsSelection: [c('s1', 'Choix 1')], due: '4' };
for (const l of ['fr', 'en', 'ar']) {
  const e = renderEmail('weekly_letter', l, vars);
  ok(e.html.includes('poster/talks/r1') && e.html.includes('poster/talks/f1') && e.html.includes('poster/talks/s1'), `lettre (${l}) : trois sections avec couvertures`);
  ok(e.html.indexOf('r1') < e.html.indexOf('f1') && e.html.indexOf('f1') < e.html.indexOf('s1'), `lettre (${l}) : ordre reprise, intervenants, sélection`);
  ok(e.html.includes('>4<') || e.html.includes('4.') || e.text.includes('4'), `lettre (${l}) : nombre de notions`);
  ok(e.text.includes('https://x/conferences/f1') && !e.text.includes('{') && !e.html.includes('{card'), `lettre (${l}) : version texte complète, aucun résidu`);
  ok(e.html.includes('https://x/u') && !e.html.includes('{app}'), `lettre (${l}) : désinscription, bouton sans résidu`);
}
const bare = renderEmail('weekly_letter', 'fr', { ...vars, cardsResume: [], cardsFollow: [], due: '' });
ok(!bare.text.includes('À REPRENDRE') && !bare.text.includes('Notions à réviser') && bare.text.includes('NOTRE SÉLECTION'), 'sections vides retirées');
ok(renderEmail('weekly_letter', 'fr', { ...vars, cardsFollow: [{ id: 'x', title: '<b>T</b>', poster: true }] }).html.includes('&lt;b&gt;T') , 'titres échappés');
ok(renderEmail('winback', 'fr', { ...vars, titles: '• a' }).html.includes('Revenir sur Mejliss TV'), 'bouton avec le nom du site (correctif étape 33)');
console.log(`\n${n} vérifications réussies`);
