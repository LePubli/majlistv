// Série à plusieurs saisons (thème Premium) : les clés de texte existent en 3 langues et la page garde ses garde-fous.
import fs from 'node:fs';
const i18n = fs.readFileSync(new URL('../lib/i18n.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../components/premium/PmSeries.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app/skin-premium.css', import.meta.url), 'utf8');
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
for (const k of ['pmSeasonNext', 'pmSeasonDone', 'seasonPick', 'seasonN', 'seasonCount']) ok((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length === 3, `texte ${k} en français, anglais et arabe`);
ok(page.includes('const multi = !!s?.seasons && s.seasons.length > 1'), 'onglets seulement s\'il y a plusieurs saisons');
ok(page.includes('setSeason(at >= 0 ? at : 0)'), 'ouvre la saison de l\'épisode à reprendre');
ok(page.includes("pm-season-next") && css.includes('.pm-season-next'), 'bouton « Saison suivante » et son style');
ok(page.includes('role="tablist"') && css.includes('.pm-season.on'), 'onglets de saison accessibles');
if (fail) process.exit(1); console.log('TOUT EST BON');
