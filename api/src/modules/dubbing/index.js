// Module « Doublage français » (étape S1) : réglages, bibliothèque de voix, estimation, suivi de la langue d'écoute.
// La génération de la piste française (service dubbing/, Piper + conversion de voix) arrive à l'étape D1a.
import routes from './routes.js';
import { recordListening } from './lib.js';

export default async function register(app, ctx) {
  // Temps d'écoute par langue de l'audio, à chaque reprise de lecture (seulement quand le module est activé).
  ctx.on('watch.progress', (ev) => recordListening(ev));
  await app.register(async (scope) => routes(scope, ctx));
}
