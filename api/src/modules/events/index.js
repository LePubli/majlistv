// Module « Événements en direct » (amélioration 4.2).
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
