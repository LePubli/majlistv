// Module (étape M2) : les routes sont celles des étapes d'origine, déplacées dans ce dossier. Lié à la fonction du même nom (Admin → Fonctions).
import routes from './routes.js';
import { recordInvoicePaid, recordChargeRefund, creditWatch } from './lib.js';

export default async function register(app, ctx) {
  // Étape M3a : base de la rémunération (factures, remboursements) et temps de visionnage, annoncés par le socle.
  ctx.on('stripe.invoice.paid', recordInvoicePaid);
  ctx.on('stripe.charge.refunded', recordChargeRefund);
  ctx.on('watch.progress', creditWatch);
  await app.register(routes);
}
