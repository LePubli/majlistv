// Module « Lecture du Coran en 30 jours » (étape 45E).
import routes from './routes.js';
import { startPlan } from './lib.js';

export default async function register(app) {
  await app.register(routes);
}

export async function start(app) { startPlan(app.log); }
