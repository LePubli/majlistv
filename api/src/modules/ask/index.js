// Module « Questions sur la conférence » (étape 41) : assistant IA limité à la transcription.
import routes from './routes.js';
import { purgeAsk } from './routes.js';

export default async function register(app) {
  await app.register(routes);
  // Nettoyage des questions anciennes : 1 minute après le démarrage, puis toutes les 6 heures.
  const run = () => purgeAsk().catch((e) => app.log.warn(`Nettoyage des questions : ${e.message}`));
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, 6 * 3600 * 1000).unref();
}
