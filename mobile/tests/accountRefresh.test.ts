// 13/11 (autoradio) : abonnement relu à l'ouverture du compte et au retour dans l'application ; erreurs envoyées au serveur ;
// menu : l'écran s'ouvre avant la fermeture du menu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

test('compte : abonnement relu à chaque ouverture et au retour dans l\'application', () => {
  const s = read('src/app/(tabs)/account.tsx');
  assert.match(s, /useFocusEffect\(React\.useCallback\(\(\) => \{ if \(user\) void reloadBilling\(\); \}/);
  assert.match(s, /AppState\.addEventListener\('change', \(s\) => \{ if \(s === 'active' && user\) void reloadBilling\(\); \}\)/);
  assert.match(s, /const subscribed = Boolean\(billing\.data\?\.active \|\| billing\.data\?\.learning\)/, 'formule Apprentissage (et administrateur) : abonné');
});

test('erreurs de l\'application envoyées au serveur (Admin → Erreurs)', () => {
  const r = read('src/lib/reportError.ts');
  assert.match(r, /\$\{API_URL\}\/errors\/client/);
  assert.match(r, /path: `\[app\] \$\{where\} \(\$\{device\}\)`/);
  assert.match(r, /> now - 60_000\) return/, 'pas plus d\'une fois par minute');
  const l = read('src/app/_layout.tsx');
  assert.match(l, /installGlobalErrorReporting\(\);/);
  assert.match(l, /export function ErrorBoundary\(\{ error, retry \}: ErrorBoundaryProps\)/);
});

test('menu : écran ouvert avant la fermeture du menu', () => {
  const m = read('src/components/MenuDrawer.tsx');
  assert.match(m, /const go = \(fn: \(\) => void, where: string\) => \{ try \{ fn\(\); \} catch \(e\) \{ reportAppError\(e, `menu \$\{where\}`\); \} onClose\(\); \};/);
  assert.match(m, /const nav = \(path: Parameters<typeof router\.navigate>\[0\]\) => \(\) => go\(\(\) => router\.navigate\(path\), String\(path\)\);/);
});
