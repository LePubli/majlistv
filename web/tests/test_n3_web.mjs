// Étape N3 (15/11) — accueil allégé : une seule carte « À faire aujourd'hui » (avec les quiz à passer et un lien vers Apprendre),
// une seule bande de saison à la fois, « Reprendre » puis les rangées ; plus de rangées « À réviser » / « Quiz à passer »
// ni de tuiles de formats (onglets du Catalogue).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const home = read('app/page.js');

assert.doesNotMatch(home, /row-review|row-quiz|FormatTiles|\/me\/revision|\/me\/quiz\/todo/, 'rangées en double retirées');
assert.doesNotMatch(home, /<SeasonBand \/>|<FridayBand \/>/, 'les bandes passent par SeasonBands');
assert.equal((home.match(/<TodayBlock home \/>/g) || []).length, 2, 'accueil d’origine et accueil en blocs');
assert.equal((home.match(/<SeasonBands \/>/g) || []).length, 2);
assert.ok(home.indexOf('row-continue') < home.indexOf('row-later') && home.indexOf('row-later') < home.indexOf('rows.map'), 'Reprendre, Plus tard, puis les rangées');
assert.ok(!fs.existsSync(new URL('../components/FormatTiles.js', import.meta.url)), 'composant retiré');

const tb = read('components/TodayBlock.js');
assert.match(tb, /export default function TodayBlock\(\{ compact = false, home = false \}\)/);
assert.match(tb, /if \(!home \|\| !ready \|\| !user \|\| !feat\('quiz'\)\) \{ setQuizN\(0\); return undefined; \}/, 'quiz à passer : seulement sur l’accueil et si la fonction est active');
assert.match(tb, /const quiz = \{ kind: 'quiz', order: 35, n: quizN, done: false, href: '\/learning\?tab=rev&s=quiz' \};/);
assert.match(tb, /case 'quiz': return t\('tdQuiz'\);/);
assert.match(tb, /<h2>\{home \? t\('tdHomeTitle'\) : t\('tdTitle'\)\}<\/h2>/);
assert.match(tb, /\{home && <p className="today-more"><Link className="link u" href="\/learning">\{t\('tdOpenLearn'\)\} ›<\/Link><\/p>\}/);

// withQuizLine : fonction pure, recopiée ici depuis le fichier pour la vérifier
const src = tb.slice(tb.indexOf('export function withQuizLine'), tb.indexOf('export default function TodayBlock'));
const withQuizLine = new Function(`${src.replace('export function', 'function')}; return withQuizLine;`)();
const base = { left: 2, items: [{ kind: 'athkar', order: 20, done: false }, { kind: 'cards', order: 30, done: true }, { kind: 'revision', order: 40, done: false }] };
assert.equal(withQuizLine(base, 0), base, 'aucun quiz : rien ne change');
const w = withQuizLine(base, 3);
assert.deepEqual(w.items.map((x) => x.kind), ['athkar', 'quiz', 'revision', 'cards'], 'quiz après les adhkar, avant les révisions ; les lignes faites en bas');
assert.equal(w.left, 3);
assert.deepEqual(withQuizLine({ items: [], left: 0 }, 2).items.map((x) => x.kind), ['quiz'], 'carte affichée même s’il n’y a que des quiz');

const sb = read('components/SeasonBands.js');
assert.match(sb, /<SeasonBand onState=\{setSeason\} \/>\n\s*\{season === false && <FridayBand \/>\}/);
assert.match(read('components/SeasonBand.js'), /onState\?\.\(Boolean\(season\)\);/);

const i18n = read('lib/i18n.js');
for (const k of ['tdHomeTitle', 'tdQuiz', 'tdOpenLearn']) assert.equal((i18n.match(new RegExp(`^    ${k}:`, 'gm')) || []).length, 3, `${k} fr/en/ar`);
assert.match(read('app/globals.css'), /\.today-more \{/);
console.log('test_n3_web : OK');
