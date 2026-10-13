// 24.4 : calculs du palier Apprentissage (score, érosion, courbe, badges) sans base de données.
// Lancer : cd api && set -a && . ./.env && set +a && node tests/test_learning_unit.mjs   (ou avec DATABASE_URL défini)
import { freshness, scoreAt, curveOf, badgesOf, FLOOR, DECAY_DAYS } from '../src/learning.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const D = (d) => new Date(Date.UTC(2026, 0, 1) + d * 86400000);
const at = (talk, percent, day, extra = {}) => ({ talk_id: talk, percent, passed: percent >= 70, created_at: D(day), category_id: 1, ...extra });

ok(freshness(0) === 1 && freshness(-3) === 1, 'frais : 100 %');
ok(Math.abs(freshness(60) - 0.8) < 1e-9, 'à mi-chemin (60 jours) : 80 %');
ok(freshness(DECAY_DAYS) === FLOOR && freshness(1000) === FLOOR, "l'érosion s'arrête à 60 %");

ok(scoreAt([]).score === 0, 'aucune tentative : score 0');
ok(scoreAt([at('a', 80, 0)], D(0)).score === 80, 'un quiz à 80 % : score 80');
ok(scoreAt([at('a', 50, 0), at('a', 90, 1)], D(1)).score === 90, 'le meilleur résultat par quiz compte');
ok(scoreAt([at('a', 100, 0), at('b', 60, 0)], D(0)).score === 80, 'moyenne sur les quiz tentés');
ok(scoreAt([at('a', 100, 0)], D(60)).score === 80, 'sans révision, le score baisse lentement (100 -> 80 en 60 jours)');
ok(scoreAt([at('a', 100, 0), at('a', 100, 60)], D(60)).score === 100, 'refaire le quiz remet le score à plat');
ok(scoreAt([at('a', 100, 10)], D(5)).score === 0, 'une tentative future est ignorée');

const att = [at('a', 100, 0), at('a', 100, 80)];
const c = curveOf(att, D(100));
ok(c[0].score === 100 && c.at(-1).score === 93, 'courbe : 100 au début, 93 vingt jours après la dernière révision');
const c2 = curveOf([at('a', 100, 0)], D(100));
ok(c2.length > 2 && c2[0].score === 100 && c2.at(-1).score < c2[0].score && c2.every((p, i) => i === 0 || p.score <= c2[i - 1].score), "courbe : descend doucement quand on ne revoit rien");
ok(curveOf([]).length === 0, 'courbe vide sans tentative');
ok(curveOf([at('a', 80, 0)], D(2)).length === 2, 'courbe : tentative récente = deux points');
const long = curveOf([at('a', 80, 0)], D(2000));
ok(long.length <= 54, 'courbe : au plus 52 points + extrémités');

// Badges
let b = badgesOf([], []);
ok(Object.keys(b).length === 0, 'aucun badge au départ');
b = badgesOf([at('a', 50, 0)], []);
ok(!b.first_quiz, 'quiz raté : pas de « Premier quiz »');
b = badgesOf([at('a', 50, 0), at('a', 80, 3)], []);
ok(b.first_quiz && +b.first_quiz === +D(3) && b.comeback && +b.comeback === +D(3), '« Premier quiz » et « Persévérant » (réussi après un échec)');
b = badgesOf([at('a', 100, 1)], []);
ok(b.perfect && !b.comeback, '« Sans faute » (100 %), pas de « Persévérant »');
b = badgesOf(['a', 'b', 'c', 'd', 'e'].map((t, i) => at(t, 80, i * 5)), []);
ok(b.passed_5 && +b.passed_5 === +D(20) && !b.passed_10, '5 quiz réussis');
b = badgesOf(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((t, i) => at(t, 80, i)), []);
ok(b.passed_10 && b.streak_3 && +b.streak_3 === +D(2), '10 quiz réussis ; 3 jours de suite');
b = badgesOf([at('a', 80, 0), at('b', 80, 1), at('c', 80, 3)], []);
ok(!b.streak_3, 'jours non consécutifs : pas de « Régulier »');
b = badgesOf([at('a', 80, 0, { category_id: 1 }), at('b', 80, 1, { category_id: 2 }), at('c', 80, 2, { category_id: 2 })], []);
ok(!b.explorer, 'deux catégories : pas d’« Explorateur »');
b = badgesOf([at('a', 80, 0, { category_id: 1 }), at('b', 80, 1, { category_id: 2 }), at('c', 80, 2, { category_id: 3 })], []);
ok(b.explorer && +b.explorer === +D(2), 'trois catégories : « Explorateur »');
b = badgesOf([at('a', 80, 0)], [{ complete: true, doneAt: D(5) }, { complete: false, doneAt: D(1) }]);
ok(+b.series_done === +D(5), '« Série terminée » : seulement les séries complètes');
b = badgesOf([at('a', 80, 0)], [{ complete: false, doneAt: D(1) }]);
ok(!b.series_done, 'série incomplète : pas de badge');
console.log(fails ? `${fails} ÉCHEC(S)` : 'TOUT OK');
process.exit(fails ? 1 : 0);
