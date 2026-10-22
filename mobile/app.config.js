// Complète app.json au moment de fabriquer l'application.
// Notifications du serveur (Firebase) : si le fichier google-services.json est présent dans mobile/, l'application est fabriquée avec Firebase ;
// sinon elle se fabrique quand même, sans notifications du serveur (les rappels de prière, eux, marchent sans Firebase).
// Le fichier n'est JAMAIS dans le dépôt : le workflow GitHub Actions l'écrit à partir du secret GOOGLE_SERVICES_JSON.
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const hasFirebase = fs.existsSync(path.join(__dirname, 'google-services.json'));
  // Numéro de build (versionCode) : sur GitHub, 1000 + numéro de l'exécution du workflow → toujours croissant, ce qui permet à l'application
  // de savoir qu'une version plus récente existe (étape 22b-5). En local, la valeur de app.json est conservée.
  const run = Number(process.env.GITHUB_RUN_NUMBER);
  const versionCode = Number.isInteger(run) && run > 0 ? 1000 + run : config.android?.versionCode;
  return {
    ...config,
    android: { ...config.android, versionCode, ...(hasFirebase ? { googleServicesFile: './google-services.json' } : {}) },
  };
};
