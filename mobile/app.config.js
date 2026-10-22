// Complète app.json au moment de fabriquer l'application.
// Notifications du serveur (Firebase) : si le fichier google-services.json est présent dans mobile/, l'application est fabriquée avec Firebase ;
// sinon elle se fabrique quand même, sans notifications du serveur (les rappels de prière, eux, marchent sans Firebase).
// Le fichier n'est JAMAIS dans le dépôt : le workflow GitHub Actions l'écrit à partir du secret GOOGLE_SERVICES_JSON.
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const hasFirebase = fs.existsSync(path.join(__dirname, 'google-services.json'));
  return {
    ...config,
    android: { ...config.android, ...(hasFirebase ? { googleServicesFile: './google-services.json' } : {}) },
  };
};
