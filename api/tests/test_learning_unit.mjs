// 24.4 : calculs du palier Apprentissage (score, érosion, courbe ; plus de badges adultes) sans base de données.
// Lancer : cd api && set -a && . ./.env && set +a && node tests/test_learning_unit.mjs   (ou avec DATABASE_URL défini)
import * as L from '../src/learning.js';
import { freshness, scoreAt, curveOf, FLOOR, DECAY_DAYS } from '../src/learning.js';
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

// Décision d'Epok (04/11) : aucun badge pour les adultes.
ok(L.badgesOf === undefined && L.BADGES === undefined, 'plus de badges adultes dans le calcul');

console.log(fails ? `${fails} ÉCHEC(S)` : 'TOUT OK');
process.exit(fails ? 1 : 0);
