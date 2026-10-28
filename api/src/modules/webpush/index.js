// Module « Notifications dans le navigateur » (étape 40) : abonnement Web Push des membres.
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
