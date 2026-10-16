// Module « Citation du jour » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « citations » (Admin → Fonctions).
import routes from './routes.js';
import { autoTopUp } from './routes.js';
import { recoverImport } from '../../corpus.js';

export default async function register(app) {
  await app.register(routes);
}

// Reprise d'un import de corpus interrompu, puis réapprovisionnement automatique toutes les heures.
export async function start(app) {
  await recoverImport();
  setInterval(() => autoTopUp().catch((e) => app.log.warn(`citations : ${e.message}`)), 3600 * 1000).unref();
  setTimeout(() => autoTopUp().catch(() => {}), 60 * 1000).unref();
}
