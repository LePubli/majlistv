// Contenus — dhikr du matin et du soir : le fichier d'import docs/contenus/athkar-matin-soir.json respecte le format de
// l'import Admin → Athkar (aucune base nécessaire). Le fichier arrive NON validé : rien n'est affiché avant relecture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES } from '../src/modules/athkar/lib.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
const items = JSON.parse(readFileSync(new URL('../../docs/contenus/athkar-matin-soir.json', import.meta.url), 'utf8'));

ok(Array.isArray(items) && items.length === 43, '43 entrées (24 invocations, dédoublées matin / soir quand le texte change)');
for (const [i, x] of items.entries()) {
  const n = `entrée ${i + 1}`;
  ok(CATEGORIES.includes(x.category), `${n} : catégorie valide (${x.category})`);
  ok(x.textAr.length >= 2 && x.textAr.length <= 4000, `${n} : texte arabe de 2 à 4000 caractères`);
  ok(/[؀-ۿ]/.test(x.textAr) && !/[A-Za-z]/.test(x.textAr), `${n} : texte arabe sans lettres latines`);
  ok(x.reference.length >= 3 && x.reference.length <= 500, `${n} : référence obligatoire (≤ 500 caractères)`);
  ok(/[A-Za-z]/.test(x.translit) && x.translit.length <= 4000, `${n} : phonétique présente`);
  ok(x.trFr.length > 10 && x.trFr.length <= 4000, `${n} : traduction française présente`);
  ok(Number.isInteger(x.target) && x.target >= 1 && x.target <= 1000, `${n} : nombre de répétitions valide`);
  ok(!('validated' in x) && !('enabled' in x), `${n} : arrive non validée et non affichée`);
}
ok(items.filter((x) => x.category === 'morning').length === 22 && items.filter((x) => x.category === 'evening').length === 20 && items.filter((x) => x.category === 'general').length === 1,
  'répartition : 22 matin, 20 soir, 1 dans la journée');
ok(new Set(items.map((x) => x.position)).size === items.length, 'positions uniques');
console.log('FIN test_athkar_content');
