// Module « Cartes cadeaux » (étape M1, module pilote). Les routes et la logique sont celles de l'étape 21, déplacées dans ce dossier.
// Le module est lié à la fonction « Cartes cadeaux » (Admin → Fonctions) : l'interrupteur de Admin → Modules est le même réglage.
import giftsRoutes from './routes.js';

export default async function register(app) {
  await app.register(giftsRoutes);
}
