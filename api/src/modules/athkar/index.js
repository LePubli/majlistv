// Module « Athkar » (étape 45D) : liste validée dans l'admin, compteur du jour, objectif, série, rappel.
import routes from './routes.js';
import { startAthkar } from './lib.js';

export default async function register(app) {
  await app.register(routes);
}

export async function start(app) { startAthkar(app.log); }
