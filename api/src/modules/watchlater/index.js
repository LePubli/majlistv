// Module « À regarder plus tard » (amélioration 2.5).
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
