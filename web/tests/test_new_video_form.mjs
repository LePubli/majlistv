// Les écrans d'import / création de vidéo utilisent le même sélecteur de catégories que la fiche (plus de mur de pastilles ni de liste de 280 lignes).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const nw = read('app/studio/new/page.js');
assert.ok(nw.includes("import CategoryPicker"), 'Nouvelle vidéo : CategoryPicker');
assert.ok(!/cats\.map\(\(c\) => \(\s*<button/.test(nw), 'Nouvelle vidéo : plus de pastilles de catégories');
assert.equal((nw.match(/\{catFields\}/g) || []).length, 2, 'les deux dispositions de la page utilisent les mêmes champs');
for (const k of ['extraCategoryIds', 'kidsBands', 'showAdults', '/poster']) assert.ok(nw.includes(k), `Nouvelle vidéo : ${k}`);
for (const f of ['components/ImportPanel.js', 'components/BulkEdit.js']) {
  const s = read(f);
  assert.ok(s.includes('<CategoryPicker'), `${f} : CategoryPicker`);
  if (f.includes('ImportPanel')) assert.ok(s.includes('extraCategoryIds'), `${f} : catégories supplémentaires`);
  assert.ok(!/cats\.map\(\(c\) => <option/.test(s), `${f} : plus de liste déroulante de catégories`);
}
console.log('OK : test_new_video_form');
