// Lecture et validation des variables d'environnement.
const required = (key) => {
  const value = process.env[key];
  if (!value) {
    console.error(`Variable d'environnement manquante : ${key}`);
    process.exit(1);
  }
  return value;
};

export const config = {
  appName: process.env.APP_NAME || 'Mejliss TV', // modifiable dans Admin → Paramètres
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpires: process.env.JWT_EXPIRES || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  // Proxys de confiance devant l'API. Détermine la vraie adresse IP du visiteur, qui sert de clé
  // aux limites de débit (anti-force brute sur /auth/login).
  //   'loopback' : nginx tourne sur la même machine et transmet à 127.0.0.1 -> cas de ce serveur.
  //   Ne JAMAIS mettre « true » : l'adresse retenue serait celle que le visiteur annonce dans
  //   l'en-tête X-Forwarded-For, donc usurpable, et les limites de débit deviendraient inopérantes.
  //   Un nombre ne convient pas non plus avec Fastify 5 : l'en-tête est alors ignoré et tous les
  //   visiteurs partagent une seule limite.
  // Si un jour l'API passe derrière un proxy distant (CDN), mettre ici ses adresses, séparées par des virgules.
  trustProxy: process.env.TRUST_PROXY
    ? process.env.TRUST_PROXY.split(',').map((s) => s.trim()).filter(Boolean)
    : 'loopback',
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'garage',
    bucket: process.env.S3_BUCKET || 'majlis-videos',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
  },
  maxUploadBytes: Number(process.env.MAX_UPLOAD_GB || 10) * 1024 ** 3,
  // Réservé aux tests : adresse d'un faux serveur Stripe (ex. http://127.0.0.1:12111).
  stripe: { apiBase: process.env.STRIPE_API_BASE },
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
};

if (config.jwtSecret.length < 32) {
  console.error('JWT_SECRET doit contenir au moins 32 caractères.');
  process.exit(1);
}
