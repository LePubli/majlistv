// Module « Saisons » (étape 45) : bandeau et rangée de l'accueil pendant Ramadan, Hajj, Mawlid, Achoura ; notification annuelle.
import routes from './routes.js';
import { startSeasons } from './lib.js';

export default async function register(app) {
  await app.register(routes);
}

export async function start(app) { startSeasons(app.log); }
