// Passage à zod 4 (audit 11/2026) : ce que zod 4 change sans prévenir, et les garde-fous qui gardent le comportement d'avant.
//   1. PATCH : `partial()` applique les valeurs par défaut des champs absents → `patchOf` (src/zpatch.js).
//   2. Dates : zod 4 refuse « 10:00Z » (sans secondes) et « +0100 » → `isoDateTime`.
//   3. Identifiants : `z.string().uuid()` refuse les identifiants hors norme RFC → `z.guid()`.
//   4. Objets : `.default({})` ne remplit plus les valeurs par défaut de l'intérieur → `.prefault({})`.
//   5. Champs `z.unknown()` / `z.any()` : devenus obligatoires → `.optional()`.
// Lancement : node tests/test_zod4.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { patchOf, isoDateTime } from '../src/zpatch.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// --- version installée
const pkg = JSON.parse(fs.readFileSync(path.join(SRC, '..', 'package.json'), 'utf8'));
ok(/^\^4\./.test(pkg.dependencies.zod), 'package.json : zod 4');
ok(typeof z.guid === 'function' && typeof z.prefault === 'function', 'zod 4 chargé');

// --- 1. patchOf
const base = z.object({
  title: z.string().trim().min(1), note: z.string().default(''), level: z.number().nullable().default(null),
  kind: z.enum(['a', 'b']).default('a'), tag: z.string().optional().default(''), on: z.boolean().default(false),
}).strict();
ok(Object.keys(base.partial().parse({})).length > 0, 'rappel : partial() de zod 4 remplit les valeurs par défaut (le piège)');
const patch = patchOf(base);
assert.deepEqual(patch.parse({}), {}, 'PATCH vide : rien'); n++;
assert.deepEqual(patch.parse({ note: 'x' }), { note: 'x' }, 'PATCH d\'un champ : ce champ seulement'); n++;
assert.deepEqual(patch.parse({ level: null, on: true }), { level: null, on: true }); n++;
ok(!patch.safeParse({ inconnu: 1 }).success, 'le mode strict est gardé');
ok(!patch.safeParse({ title: '' }).success, 'les contrôles des champs sont gardés');
ok(!patch.safeParse({ kind: 'z' }).success, 'liste de valeurs gardée');
assert.deepEqual(base.parse({ title: 'a' }), { title: 'a', note: '', level: null, kind: 'a', tag: '', on: false }, 'la création garde ses valeurs par défaut'); n++;
const noTitle = patchOf(base, ['title']);
ok(!noTitle.safeParse({ title: 'a' }).success && noTitle.safeParse({ note: 'b' }).success, 'champ retiré (omit)');
const loose = patchOf(z.object({ a: z.string().default('x') }));
assert.deepEqual(loose.parse({ zz: 1 }), {}, 'objet non strict : clés inconnues retirées, comme avant'); n++;

// --- 2. isoDateTime : mêmes réponses que zod 3
const yes = ['2026-01-01T10:00:00Z', '2026-01-01T10:00Z', '2026-01-01T10:00:00.123Z', '2024-02-29T10:00:00Z'];
const no = ['2026-01-01T10:00:00', '2026-01-01', '2026-02-30T10:00:00Z', '2025-02-29T10:00:00Z', '2026-13-01T10:00:00Z', '2026-01-01T24:00:00Z', ' 2026-01-01T10:00:00Z', '', '2026-01-01T10:00:60Z'];
for (const v of yes) ok(isoDateTime().safeParse(v).success && isoDateTime({ offset: true }).safeParse(v).success, `date acceptée : ${v}`);
for (const v of no) ok(!isoDateTime().safeParse(v).success && !isoDateTime({ offset: true }).safeParse(v).success, `date refusée : ${v}`);
for (const v of ['2026-01-01T10:00:00+01:00', '2026-01-01T10:00+0100', '2026-04-30T00:00:00-05:00']) {
  ok(isoDateTime({ offset: true }).safeParse(v).success, `décalage accepté : ${v}`);
  ok(!isoDateTime().safeParse(v).success, `sans l'option offset, « Z » seulement : ${v}`);
}
ok(!isoDateTime().safeParse(5).success && !isoDateTime().safeParse(null).success, 'pas une chaîne');
ok(isoDateTime().nullable().optional().safeParse(null).success, 'se combine avec nullable / optional');

// --- 3. z.guid : accepte tout identifiant au format 8-4-4-4-12 (comme zod 3)
ok(z.guid().safeParse('11111111-1111-1111-1111-111111111111').success && !z.guid().safeParse('pas-un-id').success, 'z.guid');

// --- garde-fous sur le code : les écritures qui changent de sens avec zod 4 ne reviennent pas
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
walk(SRC);
const rel = (p) => path.relative(SRC, p);
const bad = (re, why, skip = []) => {
  const hits = files.filter((p) => !skip.includes(rel(p)) && re.test(fs.readFileSync(p, 'utf8'))).map(rel);
  assert.deepEqual(hits, [], why); n++;
};
bad(/\.uuid\(\)/, 'z.string().uuid() : utiliser z.guid() (zod 4 refuse les identifiants hors norme)');
bad(/\.datetime\(/, 'z.string().datetime() : utiliser isoDateTime() de src/zpatch.js');
bad(/z\.record\(z\.[a-zA-Z]+\([^()]*\)\)/, 'z.record() à un seul argument : préciser la clé, z.record(z.string(), …)');
bad(/errorMap|required_error|invalid_type_error/, 'options de message de zod 3 : utiliser { error: \'…\' }');
bad(/\}\)\.default\(\{\}\)/, 'objet.default({}) : utiliser .prefault({}) pour remplir les valeurs par défaut de l\'intérieur');
bad(/z\.(unknown|any)\(\)\s*[,}]/, 'champ z.unknown() / z.any() : ajouter .optional() (zod 4 le rend obligatoire)');
// partial() : seulement sur des objets sans valeur par défaut (liste connue) ; ailleurs, patchOf.
const PARTIAL_OK = ['modules/series/routes.js', 'modules/dubbing/routes.js', 'routes/talks.js', 'zpatch.js'];
bad(/\.partial\(\)/, 'partial() : utiliser patchOf() de src/zpatch.js (sinon un PATCH remet les valeurs par défaut)', PARTIAL_OK);
for (const f of PARTIAL_OK.slice(0, 3)) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  // chaque objet suivi de .partial() : aucune valeur par défaut à l'intérieur
  for (const m of src.matchAll(/z\.object\(\{((?:(?!z\.object\(\{)[\s\S])*?)\}\)\.partial\(\)/g)) ok(!/\.default\(|\.prefault\(/.test(m[1]), `${f} : objet partial() sans valeur par défaut`);
}
{ // dubbing : glSchema.partial() — le schéma n'a pas de valeur par défaut
  const src = fs.readFileSync(path.join(SRC, 'modules/dubbing/routes.js'), 'utf8');
  const gl = src.slice(src.indexOf('const glSchema = z.object({'), src.indexOf('}).strict();', src.indexOf('const glSchema = z.object({')));
  ok(gl.length > 50 && !/\.default\(/.test(gl), 'dubbing : glossaire sans valeur par défaut');
}
ok(/z\.config\(z\.locales\.fr\(\)\)/.test(fs.readFileSync(path.join(SRC, 'index.js'), 'utf8')), 'messages de validation par défaut en français');

console.log(`OK — ${n} vérifications (zod ${JSON.parse(fs.readFileSync(path.join(SRC, '..', 'node_modules/zod/package.json'), 'utf8')).version})`);
