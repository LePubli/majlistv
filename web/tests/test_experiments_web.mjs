// Amélioration 7.2 : tests A/B côté site (textes testables présents en FR/EN/AR, câblage de la vitrine et de l'inscription). node tests/test_experiments_web.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const i18n = r('../lib/i18n.js');
const zones = r('../../api/src/experiments.js');
const keys = [...zones.slice(zones.indexOf('keys: {'), zones.indexOf('},', zones.indexOf('keys: {'))).matchAll(/(\w+): '/g)].map((m) => m[1]);
assert.deepEqual(keys, ['vtTitle1', 'vtTitle2', 'vtLead', 'heroCta'], 'clés testables de la zone vitrine');
for (const k of keys) assert.equal(i18n.split(`${k}:`).length - 1, 3, `texte ${k} manquant en fr / en / ar`);
const v = r('../components/Vitrine.js');
for (const k of keys.filter((x) => x !== 'heroCta')) assert.ok(v.includes(`tx('${k}')`), `Vitrine : ${k} passe par la variante`);
assert.ok(v.includes("tx('heroCta')") && v.includes("useExperiment('vitrine_hero')") && v.includes('onClick={xp.click}'), 'Vitrine : bouton, exposition et clic branchés');
assert.ok(r('../components/AuthForm.js').includes('reportSignup(call, r.data.token)'), 'inscription : conversion comptée');
const lib = r('../lib/experiments.js');
assert.ok(lib.includes('doNotTrack') && lib.includes('globalPrivacyControl'), 'suivi refusé (DNT / GPC) respecté');
assert.ok(r('../components/AdminShell.js').includes("experiments: 'experiments'"), 'écran admin rattaché à la fonction « Tests A/B »');
console.log('OK  experiments web');
