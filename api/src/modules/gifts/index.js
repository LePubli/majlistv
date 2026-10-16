// Module « Cartes cadeaux » (étape M1, module pilote). Les routes et la logique sont celles de l'étape 21, déplacées dans ce dossier.
// Le module est lié à la fonction « Cartes cadeaux » (Admin → Fonctions) : l'interrupteur de Admin → Modules est le même réglage.
import giftsRoutes from './routes.js';
import { applyGiftPaid, applyGiftRefund } from './lib.js';

export default async function register(app, ctx) {
  // Étape M3a : réagit aux événements de paiement annoncés par le socle (routes/billing.js).
  ctx.on('stripe.checkout.payment', (client, session) => (session.metadata?.gift_id ? applyGiftPaid(client, session) : false));
  ctx.on('stripe.charge.refunded', applyGiftRefund);
  await app.register(giftsRoutes);
}
