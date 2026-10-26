// Widgets Android (étape 25) : chaque widget passe dans le VRAI constructeur d'arbre de la bibliothèque (celui qu'Android utilise).
// Un fragment React ou un composant mal formé y provoque une erreur → widget vide sur le téléphone ; ce test l'attrape.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import Module from 'node:module';
import React from 'react';

const lib = path.join(__dirname, '..', 'node_modules', 'react-native-android-widget', 'lib', 'commonjs');
// La bibliothèque complète charge du code natif : on la remplace, pour ce test, par ses seuls éléments de dessin (purs).
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const orig = M._resolveFilename;
M._resolveFilename = function patched(req: string, ...rest: unknown[]) {
  if (req === 'react-native-android-widget') return path.join(__dirname, 'shims', 'widgetPrimitives.cjs');
  return orig.call(this, req, ...rest);
};

// Les images (png) ne se chargent pas avec Node : un numéro les remplace, comme le fait l'empaqueteur de l'application.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions['.png'] = (m) => { m.exports = 1; };

type Tree = { type: string; props: Record<string, unknown>; children?: Tree[] };
const walk = (t: Tree | string, f: (n: Tree) => void) => { if (typeof t === 'string') return; f(t); (t.children ?? []).forEach((c) => walk(c, f)); };
const texts = (t: Tree) => { const out: string[] = []; walk(t, (n) => { if (n.type === 'TextWidget') out.push(String(n.props.text)); }); return out; };

test('les six widgets se construisent (états variés) sans fragment ni erreur', async () => {
  const { buildWidgetTree } = require(path.join(lib, 'api', 'build-widget-tree'));
  const ui = await import('../src/widgets/ui');
  const { prayerView, reviseView, citationView } = await import('../src/widgets/model');
  const { resolvePrefs } = await import('../src/lib/prayer/prayerLogic');
  const prefs = resolvePrefs({ loc: { mode: 'city', city: 'lille' } }, {}, 'Europe/Paris') as never;
  const now = new Date('2026-10-26T10:00:00Z').getTime();
  const pv = prayerView({ on: true, enabled: true, prefs, locale: 'fr' }, now);
  const pOff = prayerView(null, now);
  const rOk = reviseView({ state: 'ok', total: 4, week: 2, titles: ['Al-Zahrawi', 'Les débuts à Cordoue'], at: 1 }, 'fr');
  const rNone = reviseView({ state: 'ok', total: 0, week: 0, titles: [], at: 1 }, 'fr');
  const rLogin = reviseView(null, 'fr');
  const cit = { text: 'Certes, avec la difficulté vient la facilité.', textAr: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا', attribution: 'Coran 94:5', day: '2026-10-26' };
  const el = React.createElement;
  const cases: [string, React.JSX.Element][] = [
    ['PrayerSmall', el(ui.PrayerSmall, { v: pv })], ['PrayerSmall off', el(ui.PrayerSmall, { v: pOff })],
    ['PrayerLarge', el(ui.PrayerLarge, { v: pv })], ['PrayerLarge off', el(ui.PrayerLarge, { v: pOff })],
    ['ReviseSmall', el(ui.ReviseSmall, { v: rOk })], ['ReviseSmall none', el(ui.ReviseSmall, { v: rNone })], ['ReviseSmall login', el(ui.ReviseSmall, { v: rLogin })],
    ['ReviseLarge', el(ui.ReviseLarge, { v: rOk })], ['ReviseLarge none', el(ui.ReviseLarge, { v: rNone })], ['ReviseLarge login', el(ui.ReviseLarge, { v: rLogin })],
    ['CitationSmall', el(ui.CitationSmall, { v: citationView(cit, 'fr', 'small') })], ['CitationSmall none', el(ui.CitationSmall, { v: citationView(null, 'fr', 'small') })],
    ['CitationLarge', el(ui.CitationLarge, { v: citationView(cit, 'ar', 'large') })], ['CitationLarge none', el(ui.CitationLarge, { v: citationView(null, 'en', 'large') })],
    ['Fallback', el(ui.Fallback, { text: 'Mejliss TV' })],
  ];
  for (const [name, jsx] of cases) {
    const tree = buildWidgetTree(jsx) as Tree;
    assert.equal(tree.type, 'LinearLayoutWidget', name);
    assert.ok(texts(tree).length > 0, `${name} : aucun texte dessiné`);
    walk(tree, (n) => assert.ok(['LinearLayoutWidget', 'TextWidget', 'ImageWidget'].includes(n.type), `${name} : type inattendu ${n.type}`));
    assert.equal((tree.props as { clickAction?: string }).clickAction, 'OPEN_URI', `${name} : l'appui doit ouvrir l'application`);
  }
  // Contenu : l'heure de la prochaine prière et les cinq horaires du grand widget sont bien dessinés.
  if (pv.kind === 'ready') {
    assert.ok(texts(buildWidgetTree(el(ui.PrayerSmall, { v: pv }))).includes(pv.next.time));
    const large = texts(buildWidgetTree(el(ui.PrayerLarge, { v: pv })));
    for (const r of pv.rows) assert.ok(large.includes(r.time), `horaire ${r.id} absent`);
  }
  assert.ok(texts(buildWidgetTree(el(ui.ReviseLarge, { v: rOk }))).some((t) => t.includes('Al-Zahrawi')));
  // Étape 27b : le Shuruk figure dans le grand widget Prière ; le logo (image) est présent sur chaque widget ; fond dégradé.
  if (pv.kind === 'ready') assert.ok(texts(buildWidgetTree(el(ui.PrayerLarge, { v: pv }))).includes('Shuruk'));
  const images = (t: Tree) => { let n = 0; walk(t, (x) => { if (x.type === 'ImageWidget') n++; }); return n; };
  for (const [name, jsx] of cases) {
    if (name === 'Fallback') continue;
    assert.ok(images(buildWidgetTree(jsx) as Tree) >= 1, `${name} : logo absent`);
  }
  assert.ok(images(buildWidgetTree(el(ui.PrayerLarge, { v: pv })) as Tree) >= 2, 'grand format : emblème + nom');
  assert.ok((buildWidgetTree(el(ui.PrayerLarge, { v: pv })) as Tree).props.backgroundGradient, 'fond dégradé');
});
