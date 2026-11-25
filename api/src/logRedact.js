// Journal du serveur : les jetons passés dans l'adresse (?t= lecture vidéo, ?token=…) ne doivent pas être écrits en clair
// dans les journaux (relecture 25/11). On masque la valeur, le reste de l'adresse reste lisible pour le débogage.
const SECRET_PARAMS = /([?&](?:t|token|access_token|key|code|challenge|sig|signature|X-Amz-Signature|X-Amz-Credential)=)[^&#]*/gi;
export const redactUrl = (url) => String(url ?? '').replace(SECRET_PARAMS, '$1[masqué]');
// Sérialiseur de requête pour Pino/Fastify : mêmes champs que celui par défaut, adresse masquée.
export const reqSerializer = (req) => ({
  method: req.method,
  url: redactUrl(req.url),
  host: req.host ?? req.hostname,
  remoteAddress: req.ip,
  remotePort: req.socket?.remotePort,
});
