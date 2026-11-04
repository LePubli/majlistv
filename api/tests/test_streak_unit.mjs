// Série de jours et objectif de la semaine : calcul pur (sans base de données).
// Lancer : cd api && DATABASE_URL=postgres://x node tests/test_streak_unit.mjs
import { streakOf, weekOf, mondayOf, addDays } from '../src/learningStreak.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const T = '2026-11-04'; // mercredi
const days = (...offs) => new Set(offs.map((o) => addDays(T, o)));

ok(mondayOf('2026-11-04') === '2026-11-02' && mondayOf('2026-11-08') === '2026-11-02' && mondayOf('2026-11-09') === '2026-11-09', 'lundi de la semaine (dimanche → lundi précédent)');
ok(addDays('2026-12-31', 1) === '2027-01-01' && addDays('2026-03-01', -1) === '2026-02-28', 'addDays : changement de mois et d\'année');

let s = streakOf(new Set(), T);
ok(s.current === 0 && s.best === 0 && !s.activeToday, 'aucune activité : série 0');
s = streakOf(days(0), T);
ok(s.current === 1 && s.activeToday, 'actif aujourd\'hui seulement : 1');
s = streakOf(days(-2, -1, 0), T);
ok(s.current === 3 && s.best === 3, 'trois jours de suite : 3');
s = streakOf(days(-2, -1), T);
ok(s.current === 2 && !s.activeToday, "aujourd'hui pas encore fait : la série n'est pas cassée");
s = streakOf(days(-3, -2, -1, 0), T); // dim 1/11 → mer 4/11 : traverse deux semaines
ok(s.current === 4, 'série à cheval sur deux semaines');

// Jour de repos : un jour manqué par semaine est pardonné.
s = streakOf(days(-5, -4, -2, -1, 0), T); // dim 30/10, lun... voir : -5 = 30/10 (ven), -4 = 31/10 (sam), -3 = 1/11 (dim) manqué, -2 = lun 2/11
ok(s.current === 5 && s.best === 5, 'un jour manqué (dimanche) : pardonné, la série continue (5 jours actifs, le jour manqué ne compte pas)');
s = streakOf(days(-6, -4, -2, 0), T); // jeu 29, sam 31, lun 2, mer 4 : ven 30 pardonné, dim 1 (2e manque de la semaine du 26/10) casse, mar 3 pardonné
ok(s.current === 2 && s.best === 2, 'deux jours manqués dans la même semaine : le second casse la série (elle repart à la reprise)');
s = streakOf(days(-4, -3, -1, 0), T); // sam 31, dim 1, mar 3, mer 4 : lun 2 manqué (1 pardon dans la semaine du 2/11)
ok(s.current === 4, 'un jour de repos dans la semaine en cours : pardonné');
s = streakOf(days(-10, -9, -8, -2, -1, 0), T);
ok(s.current === 3 && s.best === 3, 'longue interruption : la série repart de zéro, la meilleure est gardée');
s = streakOf(days(-12, -11, -10, -9, -8, -7, -6, -1, 0), T);
ok(s.best >= 7 && s.current === 2, 'meilleure série conservée après une coupure');
s = streakOf(days(-1), T);
ok(s.current === 1 && !s.activeToday, 'hier seulement : série de 1, à sauver aujourd\'hui');
ok(streakOf(days(-1), T).graceUsedThisWeek === false, 'repos non consommé');
s = streakOf(days(-3, -1), T); // dim 1/11 et mar 3/11 : lun 2/11 manqué
ok(s.current === 2 && s.graceUsedThisWeek === true, 'le repos de la semaine est signalé comme consommé');

// Semaine et objectif
const w = weekOf(days(-2, 0), T, 3);
ok(w.start === '2026-11-02' && w.days.length === 7 && w.days[0].date === '2026-11-02' && w.days[6].date === '2026-11-08', 'semaine lundi → dimanche');
ok(w.days[2].today && w.days[2].active && w.days.slice(3).every((d) => d.future), "aujourd'hui = mercredi ; jours suivants à venir");
ok(w.done === 2 && w.goal === 3 && !w.reached, '2 jours sur 3 : objectif pas encore atteint');
ok(weekOf(days(-2, -1, 0), T, 3).reached, '3 jours sur 3 : objectif atteint');
ok(weekOf(days(-9, -8), T, 1).done === 0, 'la semaine précédente ne compte pas');

console.log(fails ? `${fails} ÉCHEC(S)` : 'TOUT OK');
process.exit(fails ? 1 : 0);
