// Module « Références citées » (amélioration 3.5) : versets et hadiths cités dans une conférence, repérés par l'IA, relus par un humain.
import routes, { referencesInfo } from './routes.js';

export default async function register(app, ctx) {
  ctx.provide('talk.references', referencesInfo); // fiche vidéo : { available, count }
  await app.register(routes);
}
