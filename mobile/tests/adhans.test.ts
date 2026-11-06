// Catalogue des adhans : app.json et le fichier généré doivent correspondre à assets/sounds/adhans.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

test('sync-adhans --check : catalogue, app.json et adhans.generated.ts à jour', () => {
  const out = execFileSync('node', [join(__dirname, '..', 'scripts', 'sync-adhans.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /OK/);
});
