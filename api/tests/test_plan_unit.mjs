// Planning de révisions : validations pures (sans base de données).
// Lancer : cd api && DATABASE_URL=postgres://x node tests/test_plan_unit.mjs
import { isDay, windowOk, dayAllowed, MAX_DAYS } from '../src/learningPlan.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
ok(isDay('2026-11-04') && isDay('2028-02-29'), 'dates valides (dont bissextile)');
ok(!isDay('2026-02-30') && !isDay('2026-13-01') && !isDay('04/11/2026') && !isDay('') && !isDay(null) && !isDay(20261104), 'dates invalides refusées');
ok(windowOk('2026-11-01', '2026-11-30') && windowOk('2026-11-04', '2026-11-04'), 'fenêtres normales');
ok(!windowOk('2026-11-05', '2026-11-04'), 'from après to refusé');
ok(windowOk('2026-10-01', '2026-11-31'.replace('31', '30')) === true, 'fenêtre de 61 jours acceptée');
ok(!windowOk('2026-01-01', '2026-12-31'), `fenêtre de plus de ${MAX_DAYS} jours refusée`);
ok(dayAllowed('2026-11-04', '2026-11-04') && dayAllowed('2027-11-05', '2026-11-04'), "aujourd'hui et dans un an acceptés");
ok(!dayAllowed('2026-11-03', '2026-11-04') && !dayAllowed('2027-11-06', '2026-11-04'), 'hier et au-delà d\'un an refusés');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon');
process.exit(fails ? 1 : 0);
