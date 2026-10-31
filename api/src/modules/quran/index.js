// Module « Coran » (étape 45B) : ressources importées par l'admin, lecteur verset par verset, recherche.
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
