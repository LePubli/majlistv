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

test('« Mon compte » dans la barre du bas, bibliothèque sans bouton ; jamais « href: null » (expo-router 58 : redirection vers l\'accueil)', () => {
  const l = read('src/app/(tabs)/_layout.tsx');
  assert.match(l, /<Tabs\.Screen name="account" options=\{\{ title: t\('account'\), tabBarIcon:/);
  assert.match(l, /<Tabs\.Screen name="library" options=\{\{ title: t\('tabs\.library'\), tabBarButton: \(\) => null, tabBarItemStyle: \{ display: 'none' \} \}\} \/>/);
  assert.doesNotMatch(l, /name="(account|library)"[^\n]*href: null/);
  const r = read('node_modules/expo-router/build/layouts/TabsClient.js');
  assert.match(r, /if \(href === null\) \{[\s\S]{0,400}hidden: true/);
});

test('menu ☰ allégé : groupes Regarder / Écouter et lire / Mon espace, catégories repliées, rien de la barre du bas', () => {
  const m = read('src/components/MenuDrawer.tsx');
  for (const k of ['mnWatch', 'mnListen', 'mnMine']) assert.match(m, new RegExp(`title: t\\('${k}'\\)`));
  assert.match(m, /const \[catsOpen, setCatsOpen\] = useState\(false\)/);
  for (const gone of ["nav('/talks')", "nav('/learn')", "nav('/prayer')", "nav('/athkar')", "nav('/ramadan')", "nav('/account')"]) assert.ok(!m.includes(gone), `${gone} plus dans le menu`);
  assert.match(m, /on: feat\('quran'\) && !practiceOn\(feat\)/, 'Coran : dans l\'onglet Pratique');
  const i18n = read('src/lib/i18n.ts');
  for (const k of ['mnWatch', 'mnListen', 'mnMine']) assert.equal((i18n.match(new RegExp(`^  ${k}: `, 'gm')) || []).length, 3, k);
});
