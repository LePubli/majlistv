// Module « Adhkar » (étape 45D) : liste validée dans l'admin, compteur du jour, objectif, série, rappel.
import routes from './routes.js';
import { athkarToday } from './today.js';
import { startAthkar } from './lib.js';

export default async function register(app, ctx) {
  await app.register(routes);
  ctx.on('today.collect', athkarToday); // bloc « Aujourd'hui » (étape B1)
}

export async function start(app) { startAthkar(app.log); }
