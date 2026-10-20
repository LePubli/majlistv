// Module « Shorts publics » : les chaînes publient des extraits verticaux 9:16 (fil vertical, accueil, page de la chaîne).
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
