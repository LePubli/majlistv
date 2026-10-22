// Module Prière (étape 23a) : réglages enregistrés sur le compte. Les horaires sont calculés par le navigateur ou l'application
// (web/lib/prayerTimes.js) : le serveur ne connaît ni la position ni les horaires, seulement les choix de la personne.
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
