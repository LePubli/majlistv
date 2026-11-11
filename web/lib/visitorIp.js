// Adresse du visiteur, transmise à l'API par le serveur du site (audit 11/2026).
//
// Le navigateur parle au site, et c'est le serveur du site qui appelle l'API : sans cet en-tête, l'API voyait la même
// adresse (celle du conteneur du site) pour tous les visiteurs, qui partageaient donc une seule limite de débit
// (100 requêtes par minute pour tout le monde, 10 essais de connexion par minute pour tout le monde).
// On relaie tel quel l'en-tête X-Forwarded-For posé par le nginx du serveur ; l'API ne croit que la dernière adresse
// ajoutée par un proxy de confiance (voir api/src/config.js, trustProxy).
export function forwardedFor(get) {
  const xff = String(get('x-forwarded-for') || '').trim();
  if (xff) return xff.slice(0, 500);
  const real = String(get('x-real-ip') || '').trim();
  return real ? real.slice(0, 100) : '';
}

// Pour les appels faits pendant le rendu d'une page (composants serveur) : { 'x-forwarded-for': … } ou {}.
export async function visitorHeaders() {
  try {
    const { headers } = await import('next/headers');
    const h = await headers();
    const v = forwardedFor((k) => h.get(k));
    return v ? { 'x-forwarded-for': v } : {};
  } catch {
    return {}; // hors d'une requête (construction, tâche de fond) : rien à transmettre
  }
}
