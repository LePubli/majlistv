// Module « Saisons » (étape 45) : bandeau et rangée de l'accueil pendant Ramadan, Hajj, Mawlid, Achoura ; notification annuelle.
import routes from './routes.js';
import { startSeasons, currentSeason } from './lib.js';

export default async function register(app, ctx) {
  // Saison en cours (identifiant) : les collections « saisonnières » ne s'affichent que pendant leur saison.
  ctx?.provide?.('seasons.current', async () => (await currentSeason())?.row.id ?? null);
  await app.register(routes);
}

export async function start(app) { startSeasons(app.log); }
