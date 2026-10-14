// Collecte des statistiques d'audience (étape 18). Anonyme : aucun cookie, aucune adresse IP stockée.
//   POST /stats/hit    visiteurs du site (public, connecté ou non)         — 204 toujours (le site ne doit jamais être gêné)
//   POST /kids/stats   espace enfant (jeton enfant) : uniquement des compteurs par vidéo, aucune provenance/appareil/langue/pays
// Ignorés : robots, visiteurs qui envoient « Do Not Track » / « Global Privacy Control », administrateurs, et le propriétaire de la conférence.
import { z } from 'zod';
import { pool } from '../db.js';
import { visibleSql } from '../visibility.js';
import { kidCanSee } from './kids.js';
import { isOn, getSetting } from '../settings.js';
import { todayStr, isBot, fingerprint, firstToday, classifySource, deviceOf, langOf, countryOf, addDim, addTalk, addTalkDim } from '../stats.js';

const hitBody = z.object({
  type: z.enum(['page', 'view', 'play', 'progress', 'quartile', 'complete']),
  talkId: z.string().uuid().optional(),
  ref: z.string().max(300).optional(),      // page d'origine (envoyée à la première page de la visite seulement)
  entry: z.boolean().optional(),
  seconds: z.number().int().min(0).max(65).optional(),
  q: z.union([z.literal(25), z.literal(50), z.literal(75)]).optional(),
});

// Compteur de la colonne qui correspond à l'événement d'une conférence.
const incOf = (b, newViewer) => {
  if (b.type === 'view') return { views: 1, viewers: newViewer ? 1 : 0 };
  if (b.type === 'play') return { plays: 1 };
  if (b.type === 'progress') return { seconds: b.seconds || 0 };
  if (b.type === 'quartile') return { [`q${b.q}`]: b.q ? 1 : 0 };
  if (b.type === 'complete') return { completes: 1 };
  return {};
};

// Adresse du visiteur servant uniquement à calculer l'empreinte du jour (jamais enregistrée). Le site (Next.js) la transmet dans
// x-client-ip car l'API ne voit que le proxy du site ; en accès direct, c'est l'adresse de la connexion. Valeur falsifiable, sans
// conséquence : au pire, un faux visiteur de plus dans des statistiques déjà ouvertes à tous les envois anonymes.
const clientIp = (req) => String(req.headers['x-client-ip'] || req.ip).slice(0, 64);

export default async function statsCollectRoutes(app) {
  // 240 envois par minute et par adresse au maximum (une lecture normale en envoie ~8).
  const limit = { rateLimit: { max: 240, timeWindow: '1 minute' } };

  app.post('/stats/hit', { config: limit }, async (req, reply) => {
    const done = () => reply.code(204).send();
    try {
      const ua = req.headers['user-agent'];
      if (isBot(ua) || req.headers.dnt === '1' || req.headers['sec-gpc'] === '1') return done();
      if (!isOn(await getSetting('stats_enabled'))) return done();
      const b = hitBody.parse(req.body ?? {});
      const viewer = await app.optionalUser(req);
      if (viewer?.role === 'admin') return done();
      const day = todayStr();
      const h = fingerprint(day, 'site', clientIp(req), ua || '', req.headers['accept-language'] || '');

      if (b.type === 'page') {
        const newVisitor = await firstToday(day, 'site', h);
        await addDim(day, 'web', 'all', '', 1, newVisitor ? 1 : 0);
        await addDim(day, 'web', 'device', deviceOf(ua), 1, newVisitor ? 1 : 0);
        await addDim(day, 'web', 'lang', langOf(req.headers['accept-language']), 1, newVisitor ? 1 : 0);
        const country = countryOf(req.headers);
        if (country) await addDim(day, 'web', 'country', country, 1, newVisitor ? 1 : 0);
        if (b.entry) { // provenance : seulement à l'arrivée sur le site, pas à chaque page
          const s = classifySource(b.ref, req.headers.host?.split(':')[0]);
          if (s.source !== 'internal') {
            await addDim(day, 'web', 'source', s.source, 1, newVisitor ? 1 : 0);
            if (s.domain) await addDim(day, 'web', 'referrer', s.domain, 1, newVisitor ? 1 : 0);
          }
        }
        return done();
      }

      if (!b.talkId) return done();
      const t = (await pool.query(`SELECT t.id, t.organizer_id FROM talks t WHERE t.id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')}`, [b.talkId])).rows[0];
      if (!t || (viewer && viewer.sub === t.organizer_id)) return done();
      const newViewer = b.type === 'view' ? await firstToday(day, `talk:${t.id}`, h) : false;
      await addTalk(day, t.id, 'web', incOf(b, newViewer));
      if (b.type === 'view') {
        await addTalkDim(day, t.id, 'device', deviceOf(ua), 1);
        await addTalkDim(day, t.id, 'lang', langOf(req.headers['accept-language']), 1);
        if (b.entry) {
          const s = classifySource(b.ref, req.headers.host?.split(':')[0]);
          if (s.source !== 'internal') await addTalkDim(day, t.id, 'source', s.source, 1);
        }
      }
    } catch (err) {
      if (err.name !== 'ZodError') req.log.warn(err, 'stats/hit');
    }
    return done();
  });

  // Espace enfant : compteurs par vidéo seulement. Le temps passé dans l'espace enfant vient déjà de kid_usage (mesuré par le serveur).
  const kidBody = z.object({
    type: z.enum(['view', 'play', 'progress', 'quartile', 'complete']),
    talkId: z.string().uuid(),
    seconds: z.number().int().min(0).max(65).optional(),
    q: z.union([z.literal(25), z.literal(50), z.literal(75)]).optional(),
  });
  app.post('/kids/stats', { preHandler: app.authenticate, config: { kidOk: true, ...limit } }, async (req, reply) => {
    const done = () => reply.code(204).send();
    try {
      const c = await app.kidContext(req);
      if (!c || !isOn(await getSetting('stats_enabled'))) return done();
      const b = kidBody.parse(req.body ?? {});
      if (!(await kidCanSee(c.profile, b.talkId))) return done();
      const day = todayStr();
      const newViewer = b.type === 'view' ? await firstToday(day, `kidtalk:${b.talkId}`, fingerprint(day, 'kid', c.profile.id)) : false;
      await addTalk(day, b.talkId, 'kids', incOf(b, newViewer));
    } catch (err) {
      if (err.name !== 'ZodError') req.log.warn(err, 'kids/stats');
    }
    return done();
  });
}
