// Module « Vendredi » (étape 45C) : carte de l'accueil, rangée de conférences, notification du vendredi.
import routes from './routes.js';
import { startFriday } from './lib.js';

export default async function register(app) {
  await app.register(routes);
}

export async function start(app) { startFriday(app.log); }
