// Point d'entrée de l'API Mejliss TV.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { pool, migrate, ensureAdmin } from './db.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import talksRoutes from './routes/talks.js';
import uploadRoutes from './routes/uploads.js';
import mediaImportRoutes from './routes/mediaImport.js'; // étape Import : copier une vidéo externe chez nous
import hlsRoutes from './routes/hls.js';
import transcriptRoutes from './routes/transcripts.js';
import billingRoutes from './routes/billing.js';
import { ensureCors } from './storage.js';
import { getSetting, getNumber, isOn } from './settings.js';
import { currentUser } from './userstate.js';
import settingsRoutes from './routes/settings.js';
import libraryRoutes from './routes/library.js';
import searchRoutes from './routes/search.js';
import seoRoutes from './routes/seo.js';
import legalRoutes from './routes/legal.js';
import importRoutes from './routes/imports.js';
import watchRoutes from './routes/watch.js';
import twoFactorRoutes from './routes/twofactor.js'; // étape 31 : double authentification
import healthRoutes from './routes/health.js'; // étape 29 : santé du serveur
import { startHealth } from './health.js';
import lifecycleRoutes from './routes/lifecycle.js'; // étape 33 : e-mails de cycle de vie
import { startLifecycle } from './lifecycle.js';
import adsRoutes from './routes/ads.js'; // étape 24c : publicité plein écran au lancement de l'application
import cardsRoutes from './routes/cards.js';
import homeRoutes from './routes/home.js';
import dashboardRoutes from './routes/dashboard.js';
import studioContentRoutes from './routes/studio_content.js';
import themesRoutes from './routes/themes.js';
import appearanceRoutes from './routes/appearance.js'; // étape I1 : Admin → Apparence (thème du site)
import textsRoutes from './routes/texts.js'; // étape I2 : Admin → Textes (textes modifiables)
import pagesRoutes from './routes/pages.js'; // étape I3 : Admin → Pages (pages en blocs)
import moderationRoutes from './routes/moderation.js';
import activityRoutes from './routes/activity.js'; // étape S3 : Studio → Activité (pause, priorité, plage horaire)
import overviewRoutes from './routes/overview.js'; // étape S3 : tableau de bord et contenus du Studio
import moduleRoutes, { discoverModules, registerModules, migrateModules, allModules, startModules } from './modules.js'; // étape M1 : socle des modules (api/src/modules/<id>/)
import { startAudit } from './audit.js';
import featureRoutes, { registerFeatureGuard, allFeatures } from './features.js';
import speakersRoutes from './routes/speakers.js';
import formatRoutes from './routes/formats.js'; // étape B : formats de contenu et page Catalogue
import * as ext from './ext.js'; // étape M3a : le menu « Séries » n'apparaît que s'il y a une série (fournie par le module series)
import { startMailer } from './mailer.js';
import { startSearchSync } from './search.js';

// trustProxy : liste des proxys de confiance ('loopback' = le nginx local), et surtout pas « true »,
// qui ferait confiance à l'en-tête X-Forwarded-For envoyé par le visiteur lui-même — de quoi
// contourner les limites de débit et tenter une force brute sur /auth/login. Voir config.js.
const app = Fastify({ logger: true, trustProxy: config.trustProxy });

await app.register(helmet);
await app.register(cors, { origin: config.corsOrigin.split(','), credentials: true });
// 100 requêtes par minute et par adresse ; RATE_LIMIT_MAX (facultatif) sert aux tests automatiques, qui en font davantage.
await app.register(rateLimit, { max: Number(process.env.RATE_LIMIT_MAX) || 100, timeWindow: '1 minute' });
await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: config.jwtExpires } });
startAudit(app); // journal des actions de l'équipe (étape 20) : à poser AVANT les routes pour qu'elles en héritent
registerFeatureGuard(app); // étape A : routes des fonctions coupées fermées, mode maintenance — aussi AVANT les routes

// Vérifie le token JWT, puis que le compte existe toujours, n'est pas suspendu, et applique son rôle actuel.
app.decorate('authenticate', async (req, reply) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Non authentifié' });
  }
  const user = await currentUser(req.user.sub, req.user.iat);
  if (!user) return reply.code(401).send({ error: 'Compte indisponible' });
  req.user.role = user.role;
  // Jeton « espace enfant » : il ne sert qu'aux routes marquées config.kidOk (étape 26.1) ; partout ailleurs il est refusé.
  if (req.user.kid && !req.routeOptions?.config?.kidOk) return reply.code(403).send({ error: 'Espace enfant : action réservée au parent', code: 'kid_mode' });
});

// Utilisateur connecté s'il y en a un (sinon null) : pages publiques qui varient selon l'abonné.
app.decorate('optionalUser', async (req) => {
  try { await req.jwtVerify(); } catch { return null; }
  if (req.user.kid) return null; // un jeton enfant est traité comme un visiteur anonyme, sauf là où l'espace enfant est prévu (kidContext)
  return currentUser(req.user.sub, req.user.iat);
});

// Contexte « espace enfant » : { profile, parent } si le jeton est un jeton enfant valide, sinon null.
app.decorate('kidContext', async (req) => {
  try { await req.jwtVerify(); } catch { return null; }
  if (!req.user.kid) return null;
  const parent = await currentUser(req.user.sub, req.user.iat);
  if (!parent) return null;
  const { rows } = await pool.query('SELECT * FROM kid_profiles WHERE id = $1 AND user_id = $2', [req.user.kid, req.user.sub]);
  return rows[0] ? { profile: rows[0], parent } : null;
});

// Vérifie le token puis le rôle (ex. app.requireRole('admin')).
app.decorate('requireRole', (...roles) => async (req, reply) => {
  await app.authenticate(req, reply);
  if (reply.sent) return reply;
  if (!roles.includes(req.user.role)) {
    return reply.code(403).send({ error: 'Accès refusé' });
  }
});

// Erreurs de validation (zod) -> 400.
app.setErrorHandler((err, req, reply) => {
  if (err.name === 'ZodError') {
    return reply.code(400).send({ error: 'Données invalides', details: err.issues });
  }
  req.log.error(err);
  reply.code(err.statusCode || 500).send({ error: err.statusCode ? err.message : 'Erreur serveur' });
});

app.get('/health', async () => {
  await pool.query('SELECT 1');
  return { status: 'ok' };
});

// Identifiant de lecteur Dailymotion : lettres et chiffres seulement (il sert à bâtir l'adresse d'un script), sinon rien.
const dailymotionPlayerId = (v) => (/^[A-Za-z0-9]{3,20}$/.test(String(v || '').trim()) ? String(v).trim() : '');

// Configuration publique (nom de l'application) utilisée par les front-ends.
app.get('/config', async () => {
  const on = async (k) => isOn(await getSetting(k));
  const show = {};
  for (const k of ['access', 'duration', 'speaker', 'category', 'language', 'description', 'favorite', 'progress']) show[k] = await on(`card_show_${k}`);
  // Le menu « Séries » n'apparaît que s'il y a au moins une série à montrer.
  const features = await allFeatures();
  const hasSeries = features.series && (await ext.call('series.list', [], { limit: 1 })).length > 0;
  const hasBooks = features.books && (await pool.query("SELECT 1 FROM books b WHERE b.published AND (EXISTS (SELECT 1 FROM book_files f WHERE f.book_id = b.id AND f.rights_confirmed) OR EXISTS (SELECT 1 FROM book_links l WHERE l.book_id = b.id)) LIMIT 1")).rowCount > 0;
  // Fonction Prière (étape 23a) : réglages par défaut de l'administrateur ; les horaires sont calculés côté site / application.
  const prayer = features.prayer ? {
    defaultEnabled: await on('mod_prayer_default_enabled'), pill: await on('mod_prayer_pill'), method: await getSetting('mod_prayer_method'), asr: await getSetting('mod_prayer_asr'),
    blockMinutes: await getNumber('mod_prayer_block_minutes'), maxBlockMinutes: await getNumber('mod_prayer_max_block_minutes'), city: await getSetting('mod_prayer_city'),
  } : null;
  return {
    prayer, features, modules: await allModules(), hasSeries, hasBooks, stats: await on('stats_enabled'), appName: await getSetting('app_name'), trialDays: Number(await getSetting('trial_days')) || 0, dailymotionPlayerId: dailymotionPlayerId(await getSetting('dailymotion_player_id')),
    // Réglages des vignettes (Admin → Paramètres → Vignettes) : le site les applique tels quels.
    cards: { hover: await on('card_hover'), preview: await on('card_preview'), previewDelay: await getNumber('card_preview_delay'), previewSeconds: await getNumber('card_preview_seconds'), show },
  };
});

await discoverModules(app.log); // fiches des modules + réglages qu'ils déclarent (avant les routes)
await app.register(featureRoutes);
await app.register(moduleRoutes);
await app.register(authRoutes);
await app.register(adminRoutes);
await app.register(talksRoutes);
await app.register(formatRoutes);
await app.register(uploadRoutes);
await app.register(mediaImportRoutes);
await app.register(hlsRoutes);
await app.register(transcriptRoutes);
await app.register(billingRoutes);
await app.register(settingsRoutes);
await app.register(libraryRoutes);
await app.register(searchRoutes);
await app.register(seoRoutes);
await app.register(legalRoutes);
await app.register(importRoutes);
await app.register(watchRoutes);
await app.register(adsRoutes);
await app.register(healthRoutes);
await app.register(lifecycleRoutes);
await app.register(twoFactorRoutes);
await app.register(studioContentRoutes);
await app.register(themesRoutes);
await app.register(appearanceRoutes);
await app.register(textsRoutes);
await app.register(pagesRoutes);
await app.register(moderationRoutes);
await app.register(activityRoutes);
await app.register(overviewRoutes);
await app.register(speakersRoutes);
await app.register(dashboardRoutes);
await app.register(homeRoutes);
await app.register(cardsRoutes);
await registerModules(app); // routes de chaque module (cartes cadeaux : api/src/modules/gifts)

await migrate();
await migrateModules(app.log); // migrations propres aux modules + version installée
await ensureAdmin();
await ensureCors();
await app.listen({ port: config.port, host: '0.0.0.0' });
startSearchSync(app.log);
startHealth(app.log); // étape 29 : mesures du serveur + alertes
startLifecycle(app.log); // étape 33 : reprise, bienvenue, retour (désactivé tant que l'admin ne l'active pas)
startMailer(app.log); // file d'e-mails (inactive tant que l'envoi n'est pas configuré)
await startModules(app); // tâches de fond de chaque module (citations, e-mails de révision, bilan, Kids, chaînes, statistiques, alertes…)
