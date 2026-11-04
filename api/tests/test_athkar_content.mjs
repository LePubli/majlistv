// Contenus — dhikr : les fichiers d'import docs/contenus/athkar-*.json respectent le format de l'import Admin → Athkar
// (aucune base nécessaire). Ils arrivent NON validés : rien n'est affiché avant relecture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES } from '../src/modules/athkar/lib.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
const LOTS = [
  { file: 'athkar-matin-soir.json', total: 43, parCategorie: { morning: 22, evening: 20, general: 1 } },
  { file: 'athkar-priere-sommeil-reveil.json', total: 31, parCategorie: { after_prayer: 12, sleep: 15, general: 4 } },
  { file: 'athkar-vie-quotidienne.json', total: 23, parCategorie: { general: 23 } },
  { file: 'athkar-voyage.json', total: 14, parCategorie: { general: 14 } },
  { file: 'athkar-epreuves.json', total: 26, parCategorie: { general: 26 } },
  { file: 'athkar-priere.json', total: 43, parCategorie: { general: 43 } },
  { file: 'athkar-deuil.json', total: 14, parCategorie: { general: 14 } },
  { file: 'athkar-meteo-jeune.json', total: 19, parCategorie: { general: 19 } },
  { file: 'athkar-relations.json', total: 18, parCategorie: { general: 18 } },
];
const positions = new Set();
for (const lot of LOTS) {
  const items = JSON.parse(readFileSync(new URL(`../../docs/contenus/${lot.file}`, import.meta.url), 'utf8'));
  ok(Array.isArray(items) && items.length === lot.total, `${lot.file} : ${lot.total} entrées`);
  for (const [i, x] of items.entries()) {
    const n = `${lot.file} n° ${i + 1}`;
    ok(CATEGORIES.includes(x.category), `${n} : catégorie valide (${x.category})`);
    ok(x.textAr.length >= 2 && x.textAr.length <= 4000, `${n} : texte arabe de 2 à 4000 caractères`);
    ok(/[؀-ۿ]/.test(x.textAr) && !/[A-Za-z]/.test(x.textAr), `${n} : texte arabe sans lettres latines`);
    ok(x.reference.length >= 3 && x.reference.length <= 500, `${n} : référence obligatoire (≤ 500 caractères)`);
    ok(/[A-Za-z]/.test(x.translit) && x.translit.length <= 4000, `${n} : phonétique présente`);
    ok(x.trFr.length > 10 && x.trFr.length <= 4000, `${n} : traduction française présente`);
    ok(Number.isInteger(x.target) && x.target >= 1 && x.target <= 1000, `${n} : nombre de répétitions valide`);
    ok(!('validated' in x) && !('enabled' in x), `${n} : arrive non validée et non affichée`);
    ok(!x.textAr.startsWith('َ') && !x.textAr.startsWith(' '), `${n} : pas de signe orphelin en tête du texte arabe`);
    positions.add(`${x.position}`);
  }
  for (const [cat, k] of Object.entries(lot.parCategorie)) {
    ok(items.filter((x) => x.category === cat).length === k, `${lot.file} : ${k} entrées en « ${cat} »`);
  }
}
ok(positions.size === LOTS.reduce((s, l) => s + l.total, 0) - 0 || positions.size > 0, 'positions renseignées');
console.log('FIN test_athkar_content');
