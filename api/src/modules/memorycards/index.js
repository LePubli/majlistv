// Module « Cartes mémoire » (étape 38) : cartes recto/verso tirées des questions de quiz validées, avec révision espacée.
import routes from './routes.js';
import { cardsToday } from './today.js';

export default async function register(app, ctx) {
  await app.register(routes);
  ctx.on('today.collect', cardsToday); // bloc « Aujourd'hui » (étape B1)
}
