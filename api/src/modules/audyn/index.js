// Module « Audyn » : livres audio (adultes) et histoires du soir (enfants). Étape 1 : socle (stockage, chapitres, droits) et gestion dans le Studio.
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
