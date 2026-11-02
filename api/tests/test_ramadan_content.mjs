// Contenus 3 — circuit de Ramadan : contrôle du fichier fourni et de la migration 089.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const items = JSON.parse(fs.readFileSync(new URL('docs/contenus/ramadan-circuit.json', root), 'utf8'));
assert.equal(items.length, 27, '27 actions');
assert.equal(items.filter((x) => x.audience === 'adult').length, 21); assert.equal(items.filter((x) => x.audience === 'kid').length, 6);
for (const x of items) {
  assert.ok(['adult', 'kid'].includes(x.audience)); assert.ok(Number.isInteger(x.day) && x.day >= 0 && x.day <= 30, 'jour 0–30');
  assert.ok(x.title.fr && x.title.en && x.title.ar, `titres fr/en/ar : ${x.title.fr}`); assert.ok(x.text.fr && x.text.en, 'textes fr/en');
  assert.ok(x.title.fr.length <= 200 && x.text.fr.length <= 2000 && x.reference.length <= 500, 'longueurs');
  assert.match(x.link, /^(\/[^\s]*)?$/, 'lien interne'); assert.ok(x.reference.length >= 5, 'référence');
}
const sql = fs.readFileSync(new URL('api/migrations/089_ramadan_contenus.sql', root), 'utf8');
assert.equal((sql.match(/INSERT INTO ramadan_items/g) || []).length, 27, '27 insertions'); assert.ok(!/enabled\s*=\s*true/.test(sql) && (sql.match(/, false\nWHERE NOT EXISTS/g) || []).length === 27, 'jamais affichées');
assert.ok(!/reviewed_at/.test(sql), 'jamais validées');
assert.ok(!sql.includes('<function'), 'SQL bien formé');
for (const x of items) assert.ok(sql.includes(x.title.fr) && sql.includes(x.reference), `migration contient : ${x.title.fr}`);
console.log('ramadan content OK');
