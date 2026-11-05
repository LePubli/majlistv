// Module « Corrections des sous-titres » (amélioration 4.1) : suggestions des membres, relues par l'organisateur / un modérateur.
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
