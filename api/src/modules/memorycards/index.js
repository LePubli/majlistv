// Module « Cartes mémoire » (étape 38) : cartes recto/verso tirées des questions de quiz validées, avec révision espacée.
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
