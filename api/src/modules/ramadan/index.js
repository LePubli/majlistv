// Module « Circuit de Ramadan » (étape 45F).
import routes from './routes.js';
import { startRamadan } from './lib.js';

export default async function register(app) {
  await app.register(routes);
}

export async function start(app) { startRamadan(app.log); }
