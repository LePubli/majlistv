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
import cardsRoutes from './routes/cards.js';
import homeRoutes from './routes/home.js';
import dashboardRoutes from './routes/dashboard.js';
import studioContentRoutes from './routes/studio_content.js';
import quizRoutes from './routes/quiz.js';
import learningRoutes from './routes/learning.js';
import reminderRoutes from './routes/reminders.js';
import citationRoutes, { autoTopUp } from './routes/citations.js';
import { recoverImport } from './corpus.js';
import bookRoutes from './routes/books.js';
import { startRevisionMailer } from './revisionMailer.js';
import seriesRoutes, { listSeries } from './routes/series.js';
import { startMailer } from './mailer.js';
import { startSearchSync } from './search.js';

const app = Fastify({ logger: true, trustProxy: true });

await app.register(helmet);
await app.register(cors, { origin: config.corsOrigin.split(','), credentials: true });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: config.jwtExpires } });

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
});

// Utilisateur connecté s'il y en a un (sinon null) : pages publiques qui varient selon l'abonné.
app.decorate('optionalUser', async (req) => {
  try { await req.jwtVerify(); } catch { return null; }
  return currentUser(req.user.sub, req.user.iat);
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

// Configuration publique (nom de l'application) utilisée par les front-ends.
app.get('/config', async () => {
  const on = async (k) => isOn(await getSetting(k));
  const show = {};
  for (const k of ['access', 'duration', 'speaker', 'category', 'language', 'description', 'favorite', 'progress']) show[k] = await on(`card_show_${k}`);
  // Le menu « Séries » n'apparaît que s'il y a au moins une série à montrer.
  const hasSeries = (await listSeries({ limit: 1 })).length > 0;
  const hasBooks = (await pool.query("SELECT 1 FROM books b WHERE b.published AND (EXISTS (SELECT 1 FROM book_files f WHERE f.book_id = b.id AND f.rights_confirmed) OR EXISTS (SELECT 1 FROM book_links l WHERE l.book_id = b.id)) LIMIT 1")).rowCount > 0;
  return {
    hasSeries, hasBooks, appName: await getSetting('app_name'), trialDays: Number(await getSetting('trial_days')) || 0,
    // Réglages des vignettes (Admin → Paramètres → Vignettes) : le site les applique tels quels.
    cards: { hover: await on('card_hover'), preview: await on('card_preview'), previewDelay: await getNumber('card_preview_delay'), previewSeconds: await getNumber('card_preview_seconds'), show },
  };
});

await app.register(authRoutes);
await app.register(adminRoutes);
await app.register(talksRoutes);
await app.register(uploadRoutes);
await app.register(hlsRoutes);
await app.register(transcriptRoutes);
await app.register(billingRoutes);
await app.register(settingsRoutes);
await app.register(libraryRoutes);
await app.register(searchRoutes);
await app.register(seoRoutes);
await app.register(legalRoutes);
await app.register(importRoutes);
await app.register(studioContentRoutes);
await app.register(quizRoutes);
await app.register(learningRoutes);
await app.register(reminderRoutes);
await app.register(citationRoutes);
await app.register(bookRoutes);
await app.register(dashboardRoutes);
await app.register(homeRoutes);
await app.register(seriesRoutes);
await app.register(cardsRoutes);

await migrate();
await ensureAdmin();
await ensureCors();
await app.listen({ port: config.port, host: '0.0.0.0' });
startSearchSync(app.log);
startMailer(app.log); // file d'e-mails (inactive tant que l'envoi n'est pas configuré)
await recoverImport();
// Citations automatiques : toutes les heures, réapprovisionne le stock si besoin (l'IA choisit des références, le texte vient du corpus).
setInterval(() => autoTopUp().catch((e) => app.log.warn(`citations : ${e.message}`)), 3600 * 1000).unref();
setTimeout(() => autoTopUp().catch(() => {}), 60 * 1000).unref();
startRevisionMailer(app.log); // e-mail quotidien des révisions (Apprentissage)
