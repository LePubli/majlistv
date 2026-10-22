// Module « Mises à jour de l'application » (étape 22b-5) : voir routes.js.
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
