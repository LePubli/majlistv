// Module « Parrainage » (étape 43). La récompense est versée quand le socle annonce une facture payée (stripe.invoice.paid).
import routes from './routes.js';
import { rewardOnPaidInvoice } from './lib.js';

export default async function register(app, ctx) {
  ctx.on('stripe.invoice.paid', rewardOnPaidInvoice);
  await app.register(routes);
}
