// Module « Circuit de Ramadan » (étape 45F).
import routes from './routes.js';
import { ramadanToday } from './today.js';
import { startRamadan } from './lib.js';

export default async function register(app, ctx) {
  await app.register(routes);
  ctx.on('today.collect', ramadanToday); // bloc « Aujourd'hui » (étape B1)
}

export async function start(app) { startRamadan(app.log); }
