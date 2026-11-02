// Module « Lecture du Coran en 30 jours » (étape 45E).
import routes from './routes.js';
import { quranToday } from './today.js';
import { startPlan } from './lib.js';

export default async function register(app, ctx) {
  await app.register(routes);
  ctx.on('today.collect', quranToday); // bloc « Aujourd'hui » (étape B1)
}

export async function start(app) { startPlan(app.log); }
