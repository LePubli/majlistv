// Point d'entrée de l'API Majlis TV.
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

const app = Fastify({ logger: true, trustProxy: true });

await app.register(helmet);
await app.register(cors, { origin: config.corsOrigin.split(','), credentials: true });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: config.jwtExpires } });

// Vérifie le token JWT.
app.decorate('authenticate', async (req, reply) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Non authentifié' });
  }
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
app.get('/config', async () => ({ appName: config.appName }));

await app.register(authRoutes);
await app.register(adminRoutes);
await app.register(talksRoutes);
await app.register(uploadRoutes);
await app.register(hlsRoutes);
await app.register(transcriptRoutes);
await app.register(billingRoutes);

await migrate();
await ensureAdmin();
await ensureCors();
await app.listen({ port: config.port, host: '0.0.0.0' });
