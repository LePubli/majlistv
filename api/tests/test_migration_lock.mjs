// Deux démarrages simultanés : le second attend la fin du premier (verrou consultatif PostgreSQL).
// Prérequis : DATABASE_URL du PG de test.
import assert from 'node:assert/strict';
import { withMigrationLock, pool } from '../src/db.js';
const log = [];
const job = (name, ms) => withMigrationLock(async () => { log.push(name + ':début'); await new Promise((r) => setTimeout(r, ms)); log.push(name + ':fin'); });
await Promise.all([job('A', 400), job('B', 50)]);
assert.ok(log.join() === 'A:début,A:fin,B:début,B:fin' || log.join() === 'B:début,B:fin,A:début,A:fin', 'jamais en même temps : ' + log.join());
console.log('verrou des migrations OK :', log.join(' '));
await pool.end();
