// Module « Quiz » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « quiz » (Admin → Fonctions).
import routes from './routes.js';
import { quizInfo } from './routes.js';

export default async function register(app, ctx) {
  ctx.provide('talk.quiz', quizInfo); // fiche conférence et vitrine (étape M3a)
  await app.register(routes);
}
