// Module « Mise en pratique » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « practice » (Admin → Fonctions).
import routes from './routes.js';
import { practiceInfo } from './routes.js';

export default async function register(app, ctx) {
  ctx.provide('talk.practice', practiceInfo); // fiche conférence (étape M3a)
  await app.register(routes);
}
