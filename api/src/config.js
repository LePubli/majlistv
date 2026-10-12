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
  appName: process.env.APP_NAME || 'Majlis TV', // nom provisoire, modifiable dans .env
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpires: process.env.JWT_EXPIRES || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'garage',
    bucket: process.env.S3_BUCKET || 'majlis-videos',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
  },
  maxUploadBytes: Number(process.env.MAX_UPLOAD_GB || 10) * 1024 ** 3,
  // Paiement Stripe (facultatif : sans clé, le contenu premium reste réservé au propriétaire et aux admins).
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    priceMonthly: process.env.STRIPE_PRICE_MONTHLY,
    priceYearly: process.env.STRIPE_PRICE_YEARLY,
    trialDays: Number(process.env.TRIAL_DAYS ?? 7),
    // Réservé aux tests : adresse d'un faux serveur Stripe (ex. http://127.0.0.1:12111).
    apiBase: process.env.STRIPE_API_BASE,
  },
  webUrl: (process.env.WEB_URL || (process.env.CORS_ORIGIN || 'http://localhost:3001').split(',')[0]).replace(/\/$/, ''),
  previewSeconds: Number(process.env.PREVIEW_SECONDS ?? 120), // aperçu gratuit d'une conférence premium
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
};

if (config.jwtSecret.length < 32) {
  console.error('JWT_SECRET doit contenir au moins 32 caractères.');
  process.exit(1);
}
