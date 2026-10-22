// Version d'exécution des mises à jour du contenu (étape 22b-5, partie 2).
// Une mise à jour de contenu (JavaScript, textes, images) n'est reçue que par une application dont le code natif est identique.
// On la calcule donc à partir de la version + d'une empreinte de ce qui touche au code natif (dépendances, permissions, plugins) :
// ajouter une bibliothèque ou une permission change automatiquement la version d'exécution, et les anciennes applications ne reçoivent plus
// un contenu qui ne leur convient pas (risque de plantage). Format : « 0.5.0-1a2b3c4d » (accepté par le serveur).
const { createHash } = require('node:crypto');

function nativeFingerprint(pkg, app) {
  const sorted = (o) => Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => (a < b ? -1 : 1)));
  const payload = JSON.stringify({
    dependencies: sorted(pkg.dependencies),
    permissions: [...(app.android?.permissions || [])].sort(),
    plugins: app.plugins || [],
    newArch: app.newArchEnabled !== false,
    package: app.android?.package || '',
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 8);
}

const runtimeVersionFor = (pkg, app) => `${app.version}-${nativeFingerprint(pkg, app)}`;

module.exports = { nativeFingerprint, runtimeVersionFor };
