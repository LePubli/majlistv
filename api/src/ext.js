// Étape M3a — Points d'extension et événements : le socle ne connaît plus le code des modules.
//
// POINT D'EXTENSION (une réponse) : le socle demande une information sans savoir qui la fournit.
//   module : ctx.provide('talk.quiz', async (talkId) => …)
//   socle  : await ext.call('talk.quiz', { available: false, count: 0 }, talkId)   ← 2e argument = réponse si aucun module ne la fournit
// ÉVÉNEMENT (plusieurs réactions) : le socle annonce un fait, chaque module intéressé réagit.
//   module : ctx.on('stripe.charge.refunded', async (client, charge) => …)
//   socle  : await ext.emit('stripe.charge.refunded', client, charge)
// Une erreur levée par un module remonte au socle (ex. : annule la transaction du paiement, comme avant).
// Un module NON lié à une fonction ("feature") ne répond / ne réagit que s'il est activé dans Admin → Modules.

const providers = new Map(); // nom → { fn, owner, active }
const listeners = new Map(); // nom → [{ fn, owner, active }]
const always = async () => true;

// Catalogue des points d'extension et événements connus du socle (documentation et Admin → Modules).
export const CATALOG = {
  'talk.quiz': 'Quiz proposé pour une conférence : { available, count } (fiche conférence, vitrine)',
  'talk.practice': 'Écran « Et maintenant ? » d’une conférence : { available, count }',
  'kids.canSee': 'Une conférence est-elle visible par ce profil enfant ? (oui / non)',
  'series.list': 'Liste des séries publiées (filtres : limit, category, q, level, startedBy, speakerNames)',
  'series.episodeLabels': 'Place de chaque conférence dans une série : Map(id → étiquette)',
  'series.nextUp': '« Épisode suivant » de chaque série commencée par un membre',
  'stripe.checkout.payment': 'Événement : paiement unique Stripe réussi (client SQL, session)',
  'stripe.invoice.paid': 'Événement : facture d’abonnement payée (client SQL, facture)',
  'stripe.charge.refunded': 'Événement : paiement remboursé (client SQL, charge)',
  'watch.progress': 'Événement : position de lecture enregistrée par un membre (détails)',
};

export function provide(name, fn, { owner = 'socle', active = always } = {}) {
  if (typeof fn !== 'function') throw new Error(`Point d'extension « ${name} » : une fonction est attendue`);
  if (providers.has(name)) throw new Error(`Point d'extension « ${name} » déjà fourni par le module « ${providers.get(name).owner} »`);
  providers.set(name, { fn, owner, active });
}

export function on(name, fn, { owner = 'socle', active = always } = {}) {
  if (typeof fn !== 'function') throw new Error(`Événement « ${name} » : une fonction est attendue`);
  if (!listeners.has(name)) listeners.set(name, []);
  listeners.get(name).push({ fn, owner, active });
}

// Réponse du module qui fournit `name`, sinon `fallback` (valeur, ou fonction appelée avec les mêmes arguments).
export async function call(name, fallback, ...args) {
  const p = providers.get(name);
  if (p && (await p.active())) return p.fn(...args);
  return typeof fallback === 'function' ? fallback(...args) : fallback;
}

export const has = (name) => providers.has(name);

// Chaque module abonné réagit, l'un après l'autre (ordre de chargement). Renvoie le nombre de réactions.
export async function emit(name, ...args) {
  let n = 0;
  for (const l of listeners.get(name) || []) {
    if (!(await l.active())) continue;
    await l.fn(...args); n++;
  }
  return n;
}

// Retire tout ce qu'a déclaré un module (module en erreur pendant son chargement).
export function forget(owner) {
  for (const [k, p] of providers) if (p.owner === owner) providers.delete(k);
  for (const [k, list] of listeners) listeners.set(k, list.filter((l) => l.owner !== owner));
}

// Qui fournit quoi : { provides: { nom: module }, listens: { nom: [modules] } }
export function describeExt() {
  const provides = {}; const listens = {};
  for (const [k, p] of providers) provides[k] = p.owner;
  for (const [k, list] of listeners) if (list.length) listens[k] = list.map((l) => l.owner);
  return { provides, listens };
}
