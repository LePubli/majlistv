// Module « Catégories automatiques » : propose les catégories d'une vidéo d'après sa transcription (IA, service translator), validées par un humain.
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
