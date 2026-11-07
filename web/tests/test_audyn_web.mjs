// Audyn (étape 1) : pages de gestion et textes FR/EN/AR. node tests/test_audyn_web.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const i18n = r('../lib/i18n.js');
const keys = new Set();
for (const f of ['../app/studio/(module-audyn)/audyn/page.js', '../app/studio/(module-audyn)/audyn/[id]/page.js', '../modules/audyn/module.js']) {
  for (const m of r(f).matchAll(/\bt\('(ay[A-Za-z]+)'\)|label: '(ay[A-Za-z]+)'/g)) keys.add(m[1] || m[2]);
}
for (const k of ['ayAudKids', 'ayAudAdults', 'ayAudBoth']) keys.add(k); // clés construites (AUDIENCE_KEY)
assert.ok(keys.size >= 40, `${keys.size} textes utilisés`);
for (const k of keys) assert.equal(i18n.split(`${k}:`).length - 1, 3, `texte ${k} manquant en fr / en / ar`);
const mods = r('../lib/modules.js');
assert.match(mods, /'audyn'/, "fonction « audyn » déclarée dans la liste des modules");
assert.match(r('../modules/audyn/module.js'), /roles: \['admin'\]/, 'entrée Studio réservée à l\'administrateur');
assert.ok(existsSync(new URL('../app/studio/(module-audyn)/audyn/page.js', import.meta.url)));
// L'envoi des chapitres passe par le même envoi par morceaux que les vidéos (autres adresses).
const up = r('../lib/upload.js');
assert.match(up, /opts\.startPath \|\| '\/uploads'/); assert.match(up, /opts\.completePath/);
console.log('OK test_audyn_web');
