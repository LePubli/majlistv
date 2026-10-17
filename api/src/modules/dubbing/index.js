// Module « Doublage français » : réglages, voix, estimation, langue d'écoute (S1) ; file du service dubbing/ (D1a) ;
// version française côté spectateurs et demandes des abonnés (D2).
import routes from './routes.js';
import publicRoutes, { notifyReady } from './public.js';
import { recordListening } from './lib.js';
import { enqueueForUser } from '../../mailer.js';

export default async function register(app, ctx) {
  // Temps d'écoute par langue de l'audio, à chaque reprise de lecture (seulement quand le module est activé).
  ctx.on('watch.progress', (ev) => recordListening(ev));
  await app.register(async (scope) => routes(scope, ctx));
  await app.register(publicRoutes); // étape D2 : version française côté spectateurs
}

// Étape D2 : e-mail « la version française est disponible » aux membres qui l'avaient demandée (module activé seulement).
export async function start(app, ctx) {
  const tick = async () => {
    try { if (await ctx.enabled()) await notifyReady(enqueueForUser, app.log); } catch (err) { app.log.warn(`Doublage : ${err.message}`); }
  };
  setInterval(tick, 120_000).unref();
  setTimeout(tick, 15_000).unref();
}
